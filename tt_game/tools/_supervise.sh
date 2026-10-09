#!/usr/bin/env bash
# =====================================================================
#  _supervise.sh — 训练守护：崩溃/被杀/卡死后自动从检查点续跑，直到墙钟预算耗尽
#
#  解决的问题：train-input3.js 自己只管「一次跑完」。进程被 OOM killer 干掉、
#  机器重启、误关终端时，--hours 的预算没跑满就断了，还得有人手动
#  `--resume` 再起一次。这里把它包成「预算内一直跑」的语义。
#
#  四层防中断（从外到内）：
#    1. 本脚本本身 —— 退出码非 0 / 被杀 → 读 index.json 的 elapsedSec，
#       预算没满就 sleep 后 --resume 重启。退避 + 重启次数上限，防崩溃循环。
#    2. 卡死检测 —— 训练进程活着但不再落检查点时（死循环 / 死锁 / 磁盘写失败），
#       前台阻塞式的守护看不见它，会白烧整个预算。这里改成**后台子进程 + 心跳轮询**，
#       index.json 静默超过 $SUP_STALL 秒就优雅终止并重启（2026-10-06 新增）。
#    3. train-input3.js —— 每 --ckpt 局落检查点（环形保留 --keep 份），
#       SIGTERM/SIGINT/SIGBREAK 在回合边界优雅停并落盘，
#       data/.stop/<run>.stop 哨兵文件也能优雅停（Windows 上信号收不到）。
#    4. 目录级 —— 检查点写的是「先临时文件再 rename」，被断电也不会留半截 JSON。
#
#  预算语义：--hours N 是**跨多次中断累计的总量**（train-input3.js 里
#  BUDGET_SEC = hours*3600，elapsed() 含断点已耗时）。所以每次重启都传同一个
#  --hours，训练器自己会扣掉已耗部分 —— 守护不需要自己算剩余时间，
#  只用 index.json 的 elapsedSec 判断「还该不该再起一次」。
#
#  用法：
#    tools/_supervise.sh <run-name> <hours> <from-weight> [extra train args...]
#  例：
#    tools/_supervise.sh input3-12h 12 data/checkpoints/input3-parity/ckpt-000300.json \
#        --step 200 --eval 12 --ckpt 100 --keep 16 --no-save
#
#  环境变量（都有合理默认值，一般不用动）：
#    SUP_POLL=60     心跳轮询间隔（秒）
#    SUP_STALL=1800  index.json 静默多久判定卡死（秒）
#    SUP_BOOT=1500   子进程启动后多久内不做卡死判定（基线标定 + 预填回放）
#    SUP_MAX_RESTART=400  最多重启次数
#    SUP_TRAINER=tools/train-input3.js  被守护的训练器（可指向替身做冒烟测试）
#
#  停止：touch data/.stop/<run-name>.sup   （本脚本与训练器都会响应）
# =====================================================================
set -u

RUN="${1:?用法: _supervise.sh <run-name> <hours> <from-weight> [args...]}"
HOURS="${2:?缺 hours}"
FROM="${3:?缺 from-weight}"
shift 3
EXTRA=("$@")

cd "$(dirname "$0")/.." || exit 1

CKPT_DIR="data/checkpoints/$RUN"
IDX="$CKPT_DIR/index.json"
STOP_FLAG="data/.stop/$RUN.stop"
# 守护自己的停止哨兵。必须与训练器的分开：train-input3.js 在优雅收尾时会把
# $RUN.stop 删掉（那是它自己消费的通道），于是「训练器退出后守护回头看哨兵」
# 这一步会读到已被删除的文件而误判成"用户没叫停"→ 立刻重启，用户明明刚让它停。
# SUP_FLAG 只有守护读，训练器从不碰它，判定就没有竞态。
SUP_FLAG="data/.stop/$RUN.sup"
LOGDIR="tools/logs"
LOG="$LOGDIR/$RUN.log"
SUP_LOG="$LOGDIR/$RUN.supervise.log"
STATE="$LOGDIR/$RUN.supervise.state"

mkdir -p "$LOGDIR" "data/.stop"
BUDGET_SEC=$(awk -v h="$HOURS" 'BEGIN{printf "%d", h*3600}')
MAX_RESTART="${SUP_MAX_RESTART:-400}"
POLL="${SUP_POLL:-60}"
STALL="${SUP_STALL:-1800}"
BOOT="${SUP_BOOT:-1500}"
TRAINER="${SUP_TRAINER:-tools/train-input3.js}"
# 卡死判定换成「连续未推进的轮次数」后，这两个阈值必须换算成轮数
STALL_POLLS_MAX=$(( STALL / POLL )); [ "$STALL_POLLS_MAX" -lt 1 ] && STALL_POLLS_MAX=1
BOOT_POLLS=$(( BOOT / POLL ))

note(){ printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$SUP_LOG"; }

# ---- 单实例锁 ----
# 没有这道锁，重复执行启动脚本会同时跑起两个守护、两个训练器。它们各自
# --resume 同一份 index、检查点各写各的目录（--run-name 没给时是 <旧名>-<日期>），
# 于是两份进度互不可见、白烧两个核，守护读到的 elapsedSec 还可能来自已废弃那条。
# 真实事故：2026-10-05 21:12 旧守护在训练器被杀后自动重启，两个训练器同时在跑。
LOCK="data/.stop/$RUN.sup.lock"
lock_free(){
  [ -f "$LOCK" ] || return 0
  local old; old=$(cat "$LOCK" 2>/dev/null | tr -dc '0-9')
  [ -n "$old" ] || { rm -f "$LOCK"; return 0; }
  if kill -0 "$old" 2>/dev/null; then
    note "✗ 已有守护在跑（pid $old），本次不启动。锁文件 $LOCK"
    exit 3
  fi
  note "清理上次残留的锁（pid $old 已不在）"
  rm -f "$LOCK"
  return 0
}
lock_free
echo $$ > "$LOCK"
# 守护自己被杀（Ctrl-C / 终端关闭 / 被 taskkill）时，必须先把训练器停掉再放锁。
# 否则会留下一个仍在写 index.json 的孤儿，而锁已经没了 —— 下一次启动就会
# 再起一个训练器，两个进程并发写同一份断点，把 2026-10-05 那次事故重演一遍。
trap 'on_exit' EXIT
on_exit(){
  trap - EXIT
  if [ -n "${CHILD:-}" ] && [ "$CHILD" != "none" ]; then
    printf '[%s] 守护退出：先停掉训练器 pid %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$CHILD" >> "$SUP_LOG"
    command -v stop_child >/dev/null 2>&1 && { stop_child "守护退出" >> "$SUP_LOG" 2>&1 || true; }
  fi
  rm -f "$LOCK"
}

# 已累计墙钟秒数：优先读 index.json；读不到当 0（首次启动）。
# 必须 Math.floor —— 训练器写的是浮点（elapsedSec: 37624.1），而下面的比较是
# shell 的整数比较。2026-10-05 20:47 的那次崩溃就是漏了这个 floor：
# "[: 1787.5: integer expression expected" → 预算判定失效 → 守护提前收尾。
elapsed_of(){
  [ -f "$IDX" ] || { echo 0; return; }
  node -e '
    const fs=require("fs");
    try{ const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
         process.stdout.write(String(Math.floor(d.elapsedSec||0))); }
    catch(e){ process.stdout.write("0"); }
  ' "$IDX"
}
# index.json 的 mtime（epoch 秒）—— 卡死检测用。
# 刻意用 mtime 而不是文件里的 updated 字段：后者是 node 写的 toISOString()，
# 与文件系统的墙上时钟不在同一条时间线上，拿它算"多久没更新"会得出错误的静默时长。
idx_mtime(){
  [ -f "$IDX" ] || { echo 0; return; }
  stat -c %Y "$IDX" 2>/dev/null || echo 0
}
now_epoch(){ date +%s; }
# 本 run 名下还活着的训练器（Windows PID，逐行）。
# 为什么不用 `kill $CHILD`：守护脚本在 Git Bash/MSYS 下跑，$! 是 MSYS 侧的 PID，
# 对**原生 Windows 子进程**（node.exe）的信号投递并不可靠 —— 实测守护里
# `kill -TERM` 之后 MSYS 认为子进程已退出，Windows 侧的 node 却还在跑
# （tools/logs/smoke2 的两个孤儿）。那会导致守护重启出第二个训练器、
# 与第一个并发写同一份 index.json，正是 2026-10-05 21:12 那次事故的成因。
# 所以：优雅停走训练器自己的哨兵文件，硬杀走 taskkill + Windows PID。
winpids_of(){
  powershell -NoProfile -Command \
    "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*--run-name $RUN*' } | Select-Object -ExpandProperty ProcessId)" \
    2>/dev/null | tr -d '\r' | grep -E '^[0-9]+$'
}
# 进度指纹：训练器每落一次检查点都会重写 index.json，elapsedSec 必然递增。
# 卡死判定比对的就是这个值（见下方轮询处的说明）。
prog_sig(){
  [ -f "$IDX" ] || { echo "none"; return; }
  node -e '
    const fs=require("fs");
    try{ const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
         process.stdout.write("e="+(d.elapsedSec||0)+",ep="+((d.cur&&d.cur.ep)||0)); }
    catch(e){ process.stdout.write("unreadable"); }
  ' "$IDX"
}

# 第一次起跑用 --from（裸权重），之后一律 --resume（带 ep 偏移 + 选优状态 + 基线）
# 注意 --run-name 由调用方在 EXTRA 里**每次都传**，不在这里给：
# train-input3.js 的 INHERIT_DIR = !runName && !ckptDir && !!RESUME.dir，
# 一旦续训时不给 run-name/ckptdir，它就会把检查点写进 `<旧run名>-<日期>` 的新目录
# （防的是 input3-v4 那种跨 run 覆盖事故）。那样一来本守护读 $IDX 读到的就是
# 一份永远停在旧 elapsedSec 的死索引，预算判定彻底失灵。
build_cmd(){
  if [ -f "$IDX" ]; then
    printf 'node %s --resume %s --hours %s' "$TRAINER" "$IDX" "$HOURS"
  else
    printf 'node %s --from %s --hours %s' "$TRAINER" "$FROM" "$HOURS"
  fi
  for a in "${EXTRA[@]+"${EXTRA[@]}"}"; do printf ' %s' "$a"; done
}

write_state(){
  # 心跳状态：给「下一棒的人」（或下一次会话）一眼看懂的现场快照
  cat > "$STATE" <<EOF
run=$RUN
attempt=$attempt
elapsed_s=$ELAPSED
budget_s=$BUDGET_SEC
child_pid=${CHILD:-none}
child_alive=${CHILD_ALIVE:-no}
prog_sig=${LAST_SIG:-}
stall_polls=${STALL_POLLS:-0}
idx_age_s=$IDX_AGE
last_heartbeat=$(date '+%Y-%m-%d %H:%M:%S')
log=$LOG
sup_log=$SUP_LOG
EOF
}

note "=== 守护启动 · run=$RUN · 预算=${HOURS}h ($BUDGET_SEC s) · 最多重启 $MAX_RESTART 次 ==="
note "起点=$FROM"
note "附加参数=${EXTRA[*]-（无）}"
note "心跳=${POLL}s · 卡死阈值=${STALL}s · 启动豁免=${BOOT}s"
note "日志=$LOG"
note "可用磁盘：$(df -k . 2>/dev/null | awk 'NR==2{printf "%.1f GB", $4/1048576}')"

# 优雅停一个训练器，三级降级：
#   1) 哨兵文件 —— 训练器自己的通道，每局（~4s）检查一次，收到后在回合边界
#      落检查点再退出。这是唯一在 Windows 上可靠、又不会丢进度的手段。
#   2) SIGTERM —— 训练器也装了 handler（优雅停）。但 MSYS → 原生 node 的信号
#      投递不可靠（见 winpids_of 的注释），所以只当次优选。
#   3) taskkill /F /T —— 按 Windows PID 硬杀，保证一定真的停掉。硬杀最多丢
#      一个 --ckpt 间隔的进度（默认 100 局 ≈ 7 分钟），检查点已原子落盘。
stop_child(){
  local why="${1:-请求}"
  local waited=0 pid
  # 1) 哨兵
  : > "$STOP_FLAG" 2>/dev/null || true
  while [ "$waited" -lt "${STOP_GRACE:-120}" ]; do
    [ -z "$(winpids_of)" ] && { note "  训练器已响应哨兵优雅停止（$why）"; return 0; }
    sleep 10; waited=$(( waited + 10 ))
  done
  # 2) SIGTERM（顺带把哨兵删掉，否则训练器可能在下一次重启时立刻自杀）
  [ -f "$STOP_FLAG" ] && rm -f "$STOP_FLAG"
  note "  哨兵 $((waited)) 秒无响应，发 SIGTERM（$why）"
  kill -TERM "$CHILD" 2>/dev/null || true
  waited=0
  while [ "$waited" -lt 30 ]; do
    [ -z "$(winpids_of)" ] && { note "  SIGTERM 生效（$why）"; return 0; }
    sleep 5; waited=$(( waited + 5 ))
  done
  # 3) taskkill 硬杀
  for pid in $(winpids_of); do
    note "  硬杀训练器 Windows pid $pid（$why）"
    taskkill //F //T //PID "$pid" >/dev/null 2>&1 || true
  done
  sleep 2
  wait "$CHILD" 2>/dev/null || true
  [ -z "$(winpids_of)" ] && { note "  已硬杀（$why）"; return 0; }
  note "  ✗ 硬杀后 run=$RUN 的训练器仍在运行：$(winpids_of | tr '\n' ' ')"
  note "    守护将拒绝重启（并发写 index.json 会损坏断点）。请手工 taskkill 后再看 tools/logs/$RUN.log"
  return 1
}

attempt=0
SUP_T0=$SECONDS
# 用户叫停整个批次：先给训练器写它认的哨兵（让它在下一个回合边界优雅落盘），
# 再等它自己退；守护自己则直接 break。
user_stop(){
  [ -f "$SUP_FLAG" ] || return 1
  note "检测到守护停止哨兵 $SUP_FLAG"
  if [ ! -f "$STOP_FLAG" ]; then : > "$STOP_FLAG" 2>/dev/null || true; fi
  return 0
}
while :; do
  if user_stop; then
    note "已请求训练器优雅停止；训练器退出后守护不再重启"
    break
  fi

  # 墙钟兜底：index.json 里没 elapsedSec 时（首次启动、还没落第一个检查点）
  # elapsed_of 恒为 0，只靠它会无限重启。守护自己的墙钟是硬上限。
  SUP_WALL=$(( SECONDS - SUP_T0 ))
  ELAPSED=$(elapsed_of)
  if [ "$ELAPSED" -ge "$BUDGET_SEC" ]; then
    note "预算已用完（训练累计 ${ELAPSED}s >= ${BUDGET_SEC}s），守护正常收尾"
    break
  fi
  if [ "$SUP_WALL" -ge "$BUDGET_SEC" ]; then
    note "⏱ 守护墙钟 ${SUP_WALL}s 已到 ${BUDGET_SEC}s（训练只累计 ${ELAPSED}s，多次崩溃吃掉了预算）"
    note "  收尾，不再重启"
    break
  fi

  attempt=$((attempt + 1))
  if [ "$attempt" -gt "$MAX_RESTART" ]; then
    note "✗ 重启次数达上限 $MAX_RESTART（可能反复崩溃），守护停止。elapsed=${ELAPSED}s"
    break
  fi

  REMAIN=$(( BUDGET_SEC - ELAPSED ))
  CMD=$(build_cmd)
  echo "attempt=$attempt elapsed=$ELAPSED remain=$REMAIN resume=$([ -f "$IDX" ] && echo yes || echo no)" > "$STATE"

  # 后台起训练器，守护自己进入心跳轮询：这样既能看住「进程还在不在」，
  # 也能看住「进程还在但不动了」（前台阻塞 eval 做不到后者）。
  eval "$CMD" >> "$LOG" 2>&1 &
  CHILD=$!
  CHILD_T0=$SECONDS
  CHILD_ALIVE=yes
  IDX_AGE=0
  note "--- 第 $attempt 次启动 · 已耗 ${ELAPSED}s · 剩 $((REMAIN/60))min · pid $CHILD · $([ -f "$IDX" ] && echo 续训 || echo 首次) ---"
  write_state

  code=""
  LAST_SIG=""
  STALL_POLLS=0
  POLL_N=0
  while :; do
    sleep "$POLL"
    POLL_N=$(( POLL_N + 1 ))
    # 守护停止哨兵 → 转交训练器认的哨兵（训练器每局检查一次，~4s 内响应）
    # 但**光转交不够**：训练器启动段（基线标定 + 500 局预填回放）里不查哨兵，
    # 真卡死时更是永远等不到。所以给一个宽限，之后走 stop_child 的三级降级。
    # （不加这段的话，"叫停"这个动作在最需要它的场景——训练已经不正常——反而失效。）
    if [ -f "$SUP_FLAG" ]; then
      if [ -z "${SUP_STOP_SEEN:-}" ]; then SUP_STOP_SEEN=$SECONDS; fi
      if [ ! -f "$STOP_FLAG" ]; then
        : > "$STOP_FLAG" 2>/dev/null || true
        note "已向训练器转交停止哨兵 $STOP_FLAG"
      fi
      if [ $(( SECONDS - SUP_STOP_SEEN )) -ge "${STOP_USER_GRACE:-300}" ]; then
        note "停止请求已 $(( SECONDS - SUP_STOP_SEEN )) 秒未见训练器退出，启用三级降级停止"
        stop_child "用户叫停超时"
        wait "$CHILD" 2>/dev/null || true
        code=0
        CHILD_ALIVE=no
        break
      fi
    fi

    if ! kill -0 "$CHILD" 2>/dev/null; then
      wait "$CHILD"; code=$?
      CHILD_ALIVE=no
      note "训练器已退出（pid $CHILD，code=$code）"
      break
    fi

    # 启动豁免：基线标定 + 预填回放期间本来就还没落检查点，不该被判成卡死
    if [ "$POLL_N" -le "$BOOT_POLLS" ]; then
      write_state
      continue
    fi

    # 卡死判定 —— **按内容，不按时钟**。
    # 训练器每落一次检查点就重写 index.json，其中的 elapsedSec 必然变大。
    # 连着 N 次轮询读到同一个值 = 它没在推进（死循环 / 死锁 / 磁盘写失败）。
    # 早期版本用 `now - mtime` 算静默时长，实测不可靠：
    #   ① mtime 是 epoch 秒、$SECONDS 是本进程运行秒数，混算会得到 -17 亿这种负数；
    #   ② 这台机器的墙上时钟在一次会话里就往前跳了 41 小时，墙钟差值随时失真。
    # 计「连续未变化的轮次数」对两者都免疫。
    SIG=$(prog_sig)
    if [ "$SIG" = "$LAST_SIG" ]; then
      STALL_POLLS=$(( STALL_POLLS + 1 ))
    else
      STALL_POLLS=0
      LAST_SIG=$SIG
    fi
    MT=$(idx_mtime); NOWT=$(now_epoch)
    if [ "$MT" -gt 0 ]; then IDX_AGE=$(( NOWT - MT )); else IDX_AGE=-1; fi
    write_state

    if [ "$STALL_POLLS" -ge "$STALL_POLLS_MAX" ]; then
      note "✗ 卡死判定：index.json 的 elapsedSec 连续 $((STALL_POLLS * POLL)) 秒没有变化（$STALL_POLLS 次轮询，阈值 $STALL_POLLS_MAX 次）"
      if stop_child "卡死"; then
        code=99
        CHILD_ALIVE=no
        tail -n 25 "$LOG" >> "$SUP_LOG" 2>/dev/null
        break
      fi
      # 硬杀都没成功 → 绝不能再起一个训练器（并发写 index.json = 断点损坏）
      note "✗ 无法停止卡死的训练器，守护放弃重启并退出，避免并发写断点"
      break
    fi
  done

  CHILD=none

  # 训练器是优雅停的（哨兵/信号）→ 退出码 0 且已落检查点，直接按预算收尾
  if [ -f "$SUP_FLAG" ]; then
    note "训练器因停止请求退出（code=$code），守护退出"
    break
  fi

  NEW_ELAPSED=$(elapsed_of)
  if [ "$code" -eq 0 ]; then
    note "训练器正常退出（code=0），累计 ${NEW_ELAPSED}s"
    # 正常退出仍可能没跑满预算（例如 --games 用尽），预算没满就接着跑
    if [ "$NEW_ELAPSED" -ge "$BUDGET_SEC" ]; then
      note "预算已用完，守护收尾"
      break
    fi
    note "预算未满，继续下一轮"
  else
    note "✗ 训练器异常退出 code=$code（累计 ${NEW_ELAPSED}s），5 秒后从检查点重启"
    tail -n 25 "$LOG" >> "$SUP_LOG" 2>/dev/null
    sleep 5
  fi
done

ELAPSED=$(elapsed_of)
CHILD=none; CHILD_ALIVE=no; IDX_AGE=0
write_state
note "=== 守护结束 · 重启 $((attempt-1)) 次 · 累计 ${ELAPSED}s / ${BUDGET_SEC}s ==="
note "检查点：$CKPT_DIR   最终评估见 index.json 的 final 段"
note "收尾验收：node tools/_finalize-12h.js --run $RUN --games 30"