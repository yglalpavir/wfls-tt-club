#!/usr/bin/env bash
# 自动烘焙：把 input3-v3 训练批次的当前最佳权重烘进 js/input-weights.js，
# 让游戏里的「鼠标上的tt玩家」随时可用，不必等 18h 跑满。
#
# 设计要点：
#  · 只烘 index.best 指向的那份（选优分最高），不是最新一轮 —— 新一轮可能退化
#  · 每版先备份上一版到 data/bak/，烘焙失败或想回退时可用
#  · opp 标签带 ep 号，页面上能看出当前是第几版
#  · 形状不匹配（换了动作空间/网络）时直接退出，不覆盖游戏里能用的权重
#
# 用法：
#   tools/_auto_bake.sh            # 烘一次
#   tools/_auto_bake.sh --watch    # 每 3 小时烘一次，直到训练进程消失
set -u
cd "$(dirname "$0")/.." || exit 1

IDX=data/checkpoints/input3-v3/index.json
CUR=data/checkpoints/input3-v3
BAK=data/bak
WEIGHTS=js/input-weights.js
mkdir -p "$BAK"

# 停止标志：touch data/.stop-autobake 可让守护在下一轮醒来时自行退出
# （Windows 上从外部杀 bash 进程树会连带中断发起它的会话，不如让它自己走）
if [ -f data/.stop-autobake ]; then rm -f data/.stop-autobake; echo "[auto-bake] 收到停止标志，守护退出"; exit 0; fi

bake_once(){
  [ -f "$IDX" ] || { echo "[auto-bake] 还没有 $IDX，跳过"; return 1; }

  python - "$IDX" "$CUR" <<'PY'
import json, io, sys, os
idx_p, cur = sys.argv[1], sys.argv[2]
d = json.load(io.open(idx_p, encoding='utf-8'))
b = d.get('best') or {}
f = b.get('file')
if not f:
    print('[auto-bake] index 里还没有 best，跳过'); sys.exit(1)
path = os.path.join(cur, f)
if not os.path.exists(path):
    print('[auto-bake] best 文件不存在:', path); sys.exit(1)
wr = b.get('wr') or {}
print('[auto-bake] ep=%s best=%.1f  vs默认=%.1f%% vs地狱=%.1f%% vs满档=%.1f%%' % (
    b.get('ep'), (b.get('best') or 0) * 100,
    wr.get('default', 0) * 100, wr.get('hell', 0) * 100, wr.get('extreme-max', 0) * 100))
print(path)
PY
  local info bestfile
  info=$(python - "$IDX" "$CUR" <<'PY'
import json, io, sys, os
d = json.load(io.open(sys.argv[1], encoding='utf-8'))
b = d.get('best') or {}
print(os.path.join(sys.argv[2], b.get('file') or ''), b.get('ep') or 0)
PY
)
  bestfile=$(echo "$info" | awk '{print $1}')
  local ep; ep=$(echo "$info" | awk '{print $2}')
  [ -f "$bestfile" ] || { echo "[auto-bake] 权重文件缺失: $bestfile"; return 1; }

  # 形状体检：新动作空间/网络时权重会不兼容，这时绝不能覆盖游戏里能用的那份
  node -e "
    const IA=require('./js/input-agent.js');
    const w=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
    const net=w.w||w.net;
    const ok = net[net.length-1].W.length === IA.ACT_N &&
               JSON.stringify(net.slice(0,-1).map(l=>l.W.length))===JSON.stringify(IA.HSIZES);
    if(!ok){ console.error('[auto-bake] 形状不匹配，跳过（当前 ACT_N='+IA.ACT_N+' hSizes='+IA.HSIZES+'）'); process.exit(1); }
  " "$bestfile" || return 1

  # 备份当前游戏权重（带时间戳，便于回退）
  if [ -f "$WEIGHTS" ]; then
    cp "$WEIGHTS" "$BAK/input-weights.$(date +%m%d-%H%M).js"
    ls -1t "$BAK"/input-weights.*.js 2>/dev/null | tail -n +9 | xargs -r rm -f   # 只留最近 8 版
  fi

  local hell default
  hell=$(python -c "import json,io;d=json.load(io.open('$IDX',encoding='utf-8'));print(round(((d['best'].get('wr') or {}).get('hell',0))*100)/100)")
  default=$(python -c "import json,io;d=json.load(io.open('$IDX',encoding='utf-8'));print(round(((d['best'].get('wr') or {}).get('default',0))*100)/100)")

  node tools/bake-input.js "$bestfile" "$hell" "$default" "ladder-v3-ep$ep" \
    && echo "[auto-bake] 已烘焙 ep$ep → $WEIGHTS（回滚：ls $BAK）" \
    || echo "[auto-bake] 烘焙失败，游戏权重未动"
}

if [ "${1:-}" = "--watch" ]; then
  echo "[auto-bake] 每 3 小时烘一次，直到训练进程结束"
  while true; do
    bake_once
    # 训练进程还在就继续等；不在了就最后烘一次收尾
    if ! powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object {\$_.CommandLine -match 'input3-v3'}" >/dev/null 2>&1; then
      sleep 5
      if ! powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object {\$_.CommandLine -match 'input3-v3'}" >/dev/null 2>&1; then
        echo "[auto-bake] 训练已结束，收尾烘焙一次"; bake_once; break
      fi
    fi
    sleep 10800
  done
else
  bake_once
fi