#!/usr/bin/env bash
# =====================================================================
# _supervise-nemesis6.sh — 第七轮 Phase A（新鲜克星刷新，对手=R6 地狱）的守护外壳（防中断）
#
# 克隆自 _supervise-hell.sh（2026-10-26），只换三处：
#   RUN=nemesis7 / 训练器=tools/train-nemesis.js / BEST=tools/train-nemesis-best.json
#
# 用法：
#   bash tools/_supervise-nemesis6.sh [总代数] [额外 train-nemesis.js 参数...]
#   bash tools/_supervise-nemesis6.sh 200 --workers 20 --games 36 --no-write --harder
#
# 判据一律看「文件内容」而不是「进程存活 / 退出码」：
#   以 best.json 的 savedAtGen 是否推进为准（干净退出但没推进 = 落盘缺失，停止重启）。
#
# 停止：  touch data/.stop/nemesis6.stop
# 日志：  tools/logs/_nemesis6.log
# =====================================================================
set -u

cd "$(dirname "$0")/.." || exit 1

RUN=nemesis7
BEST=tools/train-nemesis-best.json
STOP="data/.stop/${RUN}.stop"
LOCK="data/.stop/${RUN}.lock"
STATE="tools/logs/_${RUN}.state"
LOG="tools/logs/_${RUN}.log"
mkdir -p data/.stop tools/logs

TOTAL_GENS="${1:-200}"
shift || true
EXTRA=("$@")
if [ "${#EXTRA[@]}" -eq 0 ]; then
  EXTRA=(--workers 20 --no-write --harder)
fi

# ---- 单实例锁 ----
if [ -f "$LOCK" ]; then
  OLD=$(cat "$LOCK" 2>/dev/null || echo "")
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
    echo "已有守护进程在跑（PID $OLD），本进程退出"
    exit 0
  fi
  echo "发现陈旧锁（PID $OLD 已不存在），接管"
fi
WINPID_FILE="tools/logs/_${RUN}.winpid"
echo $$ > "$LOCK"
trap 'rm -f "$LOCK" "$WINPID_FILE"' EXIT INT TERM
if [ -r "/proc/$$/winpid" ]; then
  cat "/proc/$$/winpid" > "$WINPID_FILE"
else
  echo $$ > "$WINPID_FILE"
fi

# ---- 读 best.json 的 savedAtGen（-1 = 文件不存在/不可读）----
savedAtGen() {
  node -e "try{const fs=require('fs');const j=JSON.parse(fs.readFileSync('$BEST','utf8'));process.stdout.write(String(j.savedAtGen|0))}catch(e){process.stdout.write('-1')}" 2>/dev/null
}

# ---- 进度状态：有则续跑（从最优向量 --from），无则全新起跑 ----
FIRST=1
GENS_DONE=0
if [ -f "$STATE" ]; then
  GENS_DONE=$(cat "$STATE" 2>/dev/null || echo 0)
  case "$GENS_DONE" in ''|*[!0-9]*) GENS_DONE=0 ;; esac
  FIRST=0
fi

attempt=0
echo "[$(date '+%F %T')] === 守护启动 PID=$$ 总代数=$TOTAL_GENS 已完成=$GENS_DONE 额外参数=${EXTRA[*]} ===" >> "$LOG"

while :; do
  if [ -f "$STOP" ]; then
    echo "[$(date '+%F %T')] 收到停止哨兵 $STOP，收工" >> "$LOG"
    break
  fi
  n=$((TOTAL_GENS - GENS_DONE))
  if [ "$n" -le 0 ]; then
    echo "[$(date '+%F %T')] 已达总代数 $TOTAL_GENS，收工" >> "$LOG"
    break
  fi

  if [ "$FIRST" = "1" ]; then
    ARGS=(--gens "$n")
    FIRST=0
  else
    if [ -f "$BEST" ]; then ARGS=(--gens "$n" --from "$BEST")
    else ARGS=(--gens "$n"); fi
  fi

  BEFORE=$(savedAtGen)
  T0=$(date +%s)
  echo "[$(date '+%F %T')] --- 启动第 $((attempt+1)) 次：${ARGS[*]} ---" >> "$LOG"
  node tools/train-nemesis.js "${ARGS[@]}" "${EXTRA[@]}" >> "$LOG" 2>&1
  code=$?
  SEC=$(( $(date +%s) - T0 ))
  AFTER=$(savedAtGen)
  echo "[$(date '+%F %T')] --- 退出 code=$code 用时 ${SEC}s  savedAtGen ${BEFORE} -> ${AFTER} ---" >> "$LOG"

  if [ "$code" = "0" ]; then
    if [ "$AFTER" -le "$BEFORE" ] && [ "$n" -gt 10 ]; then
      echo "[$(date '+%F %T')] ⚠ 干净退出但 savedAtGen 未推进（${BEFORE} -> ${AFTER}）：判定为落盘缺失，停止重启以免空转" >> "$LOG"
      break
    fi
    GENS_DONE=$((GENS_DONE + n))
    echo "$GENS_DONE" > "$STATE"
    continue
  fi

  attempt=$((attempt + 1))
  if [ "$attempt" -ge 40 ]; then
    echo "[$(date '+%F %T')] 重启次数达上限，放弃" >> "$LOG"
    break
  fi
  echo "[$(date '+%F %T')] 训练器异常退出，10s 后从最优向量续训" >> "$LOG"
  sleep 10
done

echo "[$(date '+%F %T')] === 守护结束：累计完成 $GENS_DONE 代 ===" >> "$LOG"
