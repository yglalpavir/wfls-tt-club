#!/usr/bin/env bash
# =====================================================================
#  _run-hell12h2-and-finalize.sh — 第三轮：训练 → 实机验收 → 达标才烘焙
#
#  与上一版（_run-hell12h-and-finalize.sh）的差别只有两处：
#   · RUN 换成 input3-hell12h2
#   · --games 30 保持不变（每档 30 局；地狱档 p≈0.1 时标准误约 ±4.3pp，
#     与 40 局训练期评估同量级，够分辨 10pp 级变化）
#  其余口径全部沿用上一轮验证过的那套，见 _finalize-12h.js 头部注释：
#    闸门 A 实机加权分 > 基线 · B vs地狱不下降 · C 失配不比基线更糟
#    三条全过才写 js/input-weights.js，且先备份到 data/bak/。
#
#  为什么必须有这个包装：守护脚本只管「把预算跑满」，跑完就退出。烘焙是另一步
#  （要跑 3~4 次实机对局、约 40 分钟）。不串起来的话，12h 跑完就没有下文了 ——
#  而「若实力增强则烘焙」恰恰要求这最后一步必须发生。
#
#  收尾失败（闸门未过 / 脚本崩）不会影响已跑完的检查点，也**不会**碰生产权重。
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
RUN=input3-hell12h2
LOGDIR=tools/logs

echo "[$(date '+%F %T')] === 第一步：12h 训练（守护 + 卡死检测）==="
bash tools/_launch-hell12h2.sh
echo "[$(date '+%F %T')] === 训练结束，进入第二步：实机验收 ==="

echo "[$(date '+%F %T')] === 第二步：实机管线验收（候选 × 3 档 × 30 局）==="
# --force：幂等标记（tools/logs/<run>.finalize.done）会挡住重复烘焙。
# 训练真跑完时该做的验收只有一次，重复执行由幂等标记之外的预算判断兜着，
# 所以这里显式 --force，让每次链路的收尾都真跑。
# 注意：_finalize-12h.js 现在会按**文件内容**去重候选（findings #21），
# 若检查点全是 bestNet 的副本，只会跑 1 份而不是白跑 3 份。
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