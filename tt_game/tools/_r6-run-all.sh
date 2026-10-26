#!/usr/bin/env bash
# =====================================================================
# _r6-run-all.sh — 第六轮总编排器（Phase A 刷新克星 → Phase B 地狱 GA → Phase C 收尾复评）
#
# 防中断设计（三层，见 hell-selfplay-findings.md §16）：
#   L1 训练器每 10 代落盘 best.json（curve 只有标量），崩溃后 --from 续训；
#   L2 每阶段独立守护（_supervise-nemesis6.sh / _supervise-hell.sh）自动重启训练器，
#      以 best.json 的 savedAtGen 推进为健康判据（不看退出码）；
#   L3 _watchdog-r6.ps1 盯本编排器的 winpid，死了就整只重启 —— 各阶段靠
#      状态文件/产物文件做到「阶段级幂等」：已完成的阶段直接跳过，进行中的阶段续跑。
#
# 停止：touch data/.stop/r6.stop（看门狗）、data/.stop/nemesis6.stop、
#       data/.stop/hell-selfplay.stop（各自只停对应阶段）
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1

LOG=tools/logs/_r6-orchestrator.log
log(){ echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# ---- winpid（看门狗判活用；MSYS PID 与 Windows PID 不同，须读 /proc）----
if [ -r "/proc/$$/winpid" ]; then cat "/proc/$$/winpid" > tools/logs/_r6-orchestrator.winpid
else echo $$ > tools/logs/_r6-orchestrator.winpid; fi
trap 'rm -f tools/logs/_r6-orchestrator.winpid' EXIT INT TERM

# ---- 看门狗配置（每次轮询重读，两阶段共用一份看门狗脚本）----
mkdir -p tools/logs data/.stop
cat > tools/logs/_r6-watchdog.json <<'EOF'
{ "winpid": "tools/logs/_r6-orchestrator.winpid",
  "stop": "data/.stop/r6.stop",
  "done": "tools/logs/_r6-eval-done.flag",
  "relaunch": ["tools/_r6-run-all.sh"],
  "maxRelaunch": 40 }
EOF

log "=== Round-6 orchestrator start (PID=$$) ==="

# ---- Phase A：新鲜克星刷新（训练陪练，不采纳给访客）----
if [ -f tools/logs/_r6-nemesis-candidate.json ]; then
  log "Phase A skipped (candidate already present)"
else
  log "Phase A start: nemesis refresh 200 gens (--harder --no-write)"
  bash tools/_supervise-nemesis6.sh 200 --workers 20 --games 36 --no-write --harder
  if [ -f tools/train-nemesis-candidate.json ]; then
    cp tools/train-nemesis-candidate.json tools/logs/_r6-nemesis-candidate.json
    log "Phase A done -> tools/logs/_r6-nemesis-candidate.json"
  else
    log "FATAL: Phase A produced no candidate (supervisor gave up); exiting — watchdog will relaunch and resume"
    exit 2
  fi
fi

# ---- Phase B：地狱 GA（方案D池，钉死新鲜克星；守护内部自动从 state/best 续跑）----
log "Phase B start: hell GA 270 gens (方案D, nemesis2 pinned)"
HELL_START=tools/logs/_r5-candidate.json bash tools/_supervise-hell.sh 270 --workers 20 --no-write --nemesis2 tools/logs/_r6-nemesis-candidate.json
log "Phase B done"

# ---- Phase C：收尾复评（脚本内部先等训练进程退干净再跑，最后写 done 旗标）----
log "Phase C start: final eval chain"
powershell -NoProfile -ExecutionPolicy Bypass -File tools/_r6-final-eval.ps1 >> tools/logs/_r6-eval.log 2>&1
log "Phase C done"

log "=== Round-6 orchestrator end ==="
