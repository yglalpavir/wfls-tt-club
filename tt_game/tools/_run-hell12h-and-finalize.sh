#!/usr/bin/env bash
# =====================================================================
#  _run-hell12h-and-finalize.sh — 12h 训练 → 实机验收 → 达标才烘焙，一条龙
#
#  为什么要这个包装：守护脚本只管"把预算跑满"，跑完就退出。烘焙是**另一步**
#  （_finalize-12h.js，要跑 3~4 次实机对局、约 40 分钟）。不串起来的话，
#  12h 跑完就没有下文了 —— 而"若实力增强则烘焙"恰恰要求这最后一步必须发生。
#
#  收尾的口径（全部来自 _finalize-12h.js）：
#    --topN 3     取仿真分前 3 份检查点，逐份跑**实机管线**，按实机加权分挑。
#                 不能只测 best.file —— 实测仿真/实机在地狱档会大幅分叉且方向不定
#                 （input3-gs：仿真地狱 18.8% → 实机 2.3%）。
#    --top grandslam --opp default,hell,grandslam
#                 只用**实机真实可选**的三个对手计分（elite/extreme/extreme-max
#                 游戏里选不到，权重再高也不该占验收口径）。
#    闸门 A 实机加权分 > 基线（当前线上权重）· B vs地狱不下降 · C 失配不比基线更糟
#    三条全过才写 js/input-weights.js，且先备份到 data/bak/。
#
#  收尾失败（闸门未过 / 脚本崩）不会影响已经跑完的检查点，也**不会**碰生产权重。
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
RUN=input3-hell12h
LOGDIR=tools/logs

echo "[$(date '+%F %T')] === 第一步：12h 训练（守护 + 卡死检测）==="
bash tools/_launch-hell12h.sh
echo "[$(date '+%F %T')] === 训练结束，进入第二步：实机验收 ==="

echo "[$(date '+%F %T')] === 第二步：实机管线验收（3 份候选 × 3 档 × 30 局）==="
# --force：这条链路可能因为「中途改了训练参数」而重跑好几次，前一次收尾留下的
# .finalize.done 标记会把真正那次验收挡在门外（幂等标记是为了防看门狗重复烘焙）。
# 训练真跑完时该做的验收只有一次，重复执行由幂等标记之外的预算判断兜着，
# 所以这里显式 --force，让每次链路的收尾都真跑。
node tools/_finalize-12h.js --run "$RUN" --games 30 --topN 3 \
     --top grandslam --opp default,hell,grandslam \
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
  echo "               node tools/_finalize-12h.js --run $RUN --games 30 --topN 3 --top grandslam --opp default,hell,grandslam --force"
fi
echo "[$(date '+%F %T')] === 全流程结束 ==="