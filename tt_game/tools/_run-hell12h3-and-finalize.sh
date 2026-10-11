#!/usr/bin/env bash
# =====================================================================
#  _run-hell12h3-and-finalize.sh — 第四轮：训练 → 实机验收 → 达标才烘焙
#
#  与前两轮的差别：
#   · RUN = input3-hell12h3
#   · 验收候选现在**真的是多份不同权重**了（train-input3.js 的 ckpt-*.json
#     改存「当轮策略」、best-*.json 存「选优最佳」），--topN 3 名副其实。
#   · --top hell：收尾加权分的第一权重项（0.45）就是本轮训练目标，
#     之前写的是 grandslam（沿袭 gs 轮），与「增强地狱 AI」的目标对不上。
#
#  口径全部沿用 _finalize-12h.js 头部注释里那套：
#    闸门 A 实机加权分 > 基线 · B vs地狱不下降 · C 失配不比基线更糟
#    三条全过才写 js/input-weights.js，且先备份到 data/bak/。
#
#  收尾失败（闸门未过 / 脚本崩）不影响已跑完的检查点，也**不会**碰生产权重。
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
RUN=input3-hell12h3
LOGDIR=tools/logs

echo "[$(date '+%F %T')] === 第一步：12h 训练（守护 + 卡死检测）==="
bash tools/_launch-hell12h3.sh
echo "[$(date '+%F %T')] === 训练结束，进入第二步：实机验收 ==="

echo "[$(date '+%F %T')] === 第二步：实机管线验收（候选 × 3 档 × 30 局）==="
# --force：幂等标记（tools/logs/<run>.finalize.done）会挡住重复烘焙。
# 训练真跑完时该做的验收只有一次，所以这里显式 --force，让每次链路的收尾都真跑。
node tools/_finalize-12h.js --run "$RUN" --games 30 --topN 3 \
     --top hell --opp default,hell,grandslam \
     --baseline tools/logs/baseline-live.json --force
FIN=$?

echo "[$(date '+%F %T')] === 收尾脚本退出码 $FIN（0=已烘焙 / 2=未达标未烘焙 / 1=出错）==="
if [ "$FIN" -eq 0 ]; then
  echo "[$(date '+%F %T')] 已烘焙。报告：$LOGDIR/$RUN.finalize.json"
elif [ "$FIN" -eq 2 ]; then
  echo "[$(date '+%F %T')] 未达标，js/input-weights.js 保持原样（这是预期内的安全结果）。"
  echo "               候选实测：$LOGDIR/$RUN.finalize.json"
else
  echo "[$(date '+%F %T')] 收尾出错 —— 检查点仍在 data/checkpoints/$RUN，可手工重跑："
  echo "               node tools/_finalize-12h.js --run $RUN --games 30 --topN 3 --top hell --opp default,hell,grandslam --force"
fi
echo "[$(date '+%F %T')] === 全流程结束 ==="