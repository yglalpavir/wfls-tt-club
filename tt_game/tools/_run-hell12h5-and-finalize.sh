#!/usr/bin/env bash
# =====================================================================
#  _run-hell12h5-and-finalize.sh — 第五轮：训练 → 实机验收 → 达标才烘焙
#
#  与第四轮链路的三处差别
#  ----------------------
#  1. 验收用 `--topN 4`：按**仿真**加权分取前四名候选，各自跑一遍实机管线，
#     最终**按实机分**选。仿真只能用来排序候选，不能用来判达标（phase3 §5.0：
#     同一份权重 sim default 60.7% / 实机 35.4%，差 25pp）。
#     为什么是 4 而不是 3：横向 prior 落地后**仿真已经饱和** ——
#     同一份权重在仿真里是 default 96.9% / hell 93.2%（之前是 70.6% / 11.5%），
#     选优基线分 94.1、天花板 100，动态范围从 58.6 点压到 5.9 点。
#     仿真排名因此近乎随机，多测一个候选就是多一条实机证据。
#     实机管线才是判据：仿真 default 96.9% 的权重，实机 default 只有 35.4%。
#  2. `--top hell`：收尾加权分的第一权重项（0.45）必须是本轮训练目标「地狱」，
#     上一轮之前沿用 grandslam，与「增强地狱 AI」对不上。
#  3. 基线是**当前线上权重 + 当前代码**的实机实测
#     （tools/logs/baseline-live.json，本轮重测）。理由：横向 prior 已经落进
#     js/input-agent.js 且默认开，同一份权重现在打地狱 32.1%（旧口径 11.7%）。
#     拿旧基线去比，闸门 A 会**必然通过**，等于没设闸门 —— 那不是我们要的验收。
#     真正要回答的问题是「这 12h 的 TD 有没有在规则兜底之上再赚一点」。
#
#  闸门口径全部沿用 _finalize-12h.js 头部注释：
#    A 实机加权分 > 基线 · B vs 地狱不下滑 · C 失配不比基线更糟
#  四条全过才写 js/input-weights.js，且先备份到 data/bak/。
#  收尾失败（闸门未过 / 脚本崩）不影响已跑完的检查点，也**不会**碰生产权重。
#
#  停止训练：touch data/.stop/input3-hell12h5.sup
#  只跑收尾：node tools/_finalize-12h.js --run input3-hell12h5 --games 30 \
#              --topN 4 --top hell --opp default,hell,grandslam --force
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
RUN=input3-hell12h5
LOGDIR=tools/logs

echo "[$(date '+%F %T')] === 第一步：12h 训练（守护 + 内容级卡死检测）==="
bash tools/_launch-hell12h5.sh
echo "[$(date '+%F %T')] === 训练结束，进入第二步：实机验收 ==="

echo "[$(date '+%F %T')] === 第二步：实机管线验收（候选 × 3 × 30 局/档）==="
# --force：幂等标记（tools/logs/<run>.finalize.done）会挡住重复烘焙。
# 训练真跑完时该做的验收只有一次，所以这里显式 --force，让每次链路的收尾都真跑。
node tools/_finalize-12h.js --run "$RUN" --games 30 --topN 4 \
     --top hell --opp default,hell,grandslam \
     --baseline tools/logs/baseline-live.json --force
FIN=$?

echo "[$(date '+%F %T')] === 收尾脚本退出码 $FIN（0=已烘焙 / 2=未达标未烘焙 / 1=出错）==="
if [ "$FIN" -eq 0 ]; then
  echo "[$(date '+%F %T')] 已烘焙。报告：$LOGDIR/$RUN.finalize.json"
elif [ "$FIN" -eq 2 ]; then
  echo "[$(date '+%F %T')] 未达标，js/input-weights.js 保持原样（这是预期内的安全结果）"
  echo "               候选实测：$LOGDIR/$RUN.finalize.json"
  echo "               别急着加轮次 —— 先读 $LOGDIR/$RUN.chain.log 里的实机复盘输因。"
else
  echo "[$(date '+%F %T')] 收尾出错 —— 检查点仍在 data/checkpoints/$RUN，可手工重跑："
  echo "               node tools/_finalize-12h.js --run $RUN --games 30 --topN 4 --top hell --opp default,hell,grandslam --force"
fi
echo "[$(date '+%F %T')] === 全流程结束 ==="