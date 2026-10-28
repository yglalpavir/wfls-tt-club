#!/usr/bin/env bash
# =====================================================================
# _r7-run-all.sh — 第七轮总编排器（Phase A 刷新克星 → Phase B 地狱 GA → Phase C 收尾复评）
# 结构与 _r6-run-all.sh 相同（三层防中断，阶段级幂等），时间预算：训练 ≈ 5h。
# 预注册判据见 hell-selfplay-findings.md §18。
#
# 停止：touch data/.stop/r7.stop（全停）、data/.stop/{nemesis7,hell-selfplay}.stop（单停）
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1

LOG=tools/logs/_r7-orchestrator.log
log(){ echo "[$(date '+%F %T')] $*" >> "$LOG"; }

if [ -r "/proc/$$/winpid" ]; then cat "/proc/$$/winpid" > tools/logs/_r7-orchestrator.winpid
else echo $$ > tools/logs/_r7-orchestrator.winpid; fi
trap 'rm -f tools/logs/_r7-orchestrator.winpid' EXIT INT TERM

mkdir -p tools/logs data/.stop
cat > tools/logs/_r7-watchdog.json <<'EOF'
{ "winpid": "tools/logs/_r7-orchestrator.winpid",
  "stop": "data/.stop/r7.stop",
  "done": "tools/logs/_r7-eval-done.flag",
  "relaunch": ["tools/_r7-run-all.sh"],
  "maxRelaunch": 40 }
EOF

log "=== Round-7 orchestrator start (PID=$$) ==="

# ---- Phase A：新鲜克星再刷新（对手 = R6 地狱；只做陪练，不采纳给访客）----
if [ -f tools/logs/_r7-nemesis-candidate.json ]; then
  log "Phase A skipped (candidate already present)"
else
  log "Phase A start: nemesis refresh vs R6 hell, 200 gens (--harder --no-write)"
  bash tools/_supervise-nemesis7.sh 200 --workers 20 --games 36 --no-write --harder
  if [ -f tools/train-nemesis-candidate.json ]; then
    cp tools/train-nemesis-candidate.json tools/logs/_r7-nemesis-candidate.json
    log "Phase A done -> tools/logs/_r7-nemesis-candidate.json"
  else
    log "FATAL: Phase A produced no candidate (supervisor gave up); exiting — watchdog will relaunch and resume"
    exit 2
  fi
fi

# ---- Phase B：地狱 GA（方案D池，钉死本轮新鲜克星；守护内部自动续跑）----
log "Phase B start: hell GA 200 gens (方案D, nemesis2=R7 pinned)"
HELL_START=tools/logs/_r6-candidate.json bash tools/_supervise-hell.sh 200 --workers 20 --no-write --nemesis2 tools/logs/_r7-nemesis-candidate.json
log "Phase B done"

# ---- Phase C：收尾复评（脚本内部先等训练退干净，最后写 done 旗标）----
log "Phase C start: final eval chain"
powershell -NoProfile -ExecutionPolicy Bypass -File tools/_r7-final-eval.ps1 >> tools/logs/_r7-eval.log 2>&1
log "Phase C done"

log "=== Round-7 orchestrator end ==="
