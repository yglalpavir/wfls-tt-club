#!/usr/bin/env bash
# =====================================================================
#  _launch-hell12h.sh — 第二轮 12h 续训：把地狱 AI 那一档真正顶上去
#
#  上一轮（_launch-12h.sh / input3-12h）的结果与教训
#  --------------------------------------------------
#  实测：12h 后**实机**对地狱 AI 从 2.4% 抬到 11.7%（30 局/档，标准误 ±2.1pp，
#  这是真的进步），已按闸门烘焙上线。但同一份权重在**仿真**里是 16.0%，
#  而隔壁 input3-gs 那轮仿真地狱 18.8% 却只有实机 2.3% —— 仿真/实机在地狱档
#  会大幅分叉，且**方向不定**。所以本轮只信实机数字。
#
#  上一轮课程：hell:0.25,elite:0.30,extreme:0.25,extreme-max:0.20
#    → hell 排在**最前**，之后 7500 局全打别的档。曲线证实这是灾难：
#      ep 250 hell=9.1% → ep 2500 hell=4.3%（地狱段自己都没训上去）
#      → ep 5000 elite 段结束 hell 反而 11.7%（纯属噪声）
#    2500 局纯地狱训练换来 0 提升，不是"不够久"，是**排错了位置**。
#
#  本轮课程：default:0.10, extreme-max:0.15, grandslam:0.25, hell:0.50
#    · hell 放**最后**且占一半预算：排后面才不会被后面的阶段覆盖掉。
#    · grandslam 25%：它是**实机真实可选**对手（MODEL_NAMES 里有），
#      且收尾闸门给它 0.45 权重（三个真实对手 default/hell/grandslam 里最重的一个）。
#      elite/extreme/extreme-max 只是训练档，游戏里选不到，不单独占预算。
#    · extreme-max 15%：保住当前最强的那一档（仿真 78%）不塌方。
#    · default 10%：守住采纳护栏"vs普通 不劣于 -5pp"要用的那一档。
#
#  --end hell：选优分的 0.45 权重项与采纳线（vs顶档 ≥ +1.5pp）都指向地狱档，
#    让训练器自己的"最佳"也以地狱为准，而不是以 extreme-max 为准。
#
#  其余超参与上一轮**逐字相同**（adam+clip2+layerlr / step 250 / eval 20 /
#  ckpt 100 / keep 16 / eps-reset 500 / jitter 0.06 / seed 20260909）：
#  本轮只动"课程与顶档"这一个变量，结果才可归因。
#
#  --eval 77（2026-10-08 从 20 改上来的）：每档验证 77 局而不是 20 局。
#    为什么非改不可：20 局/档在地狱档上标准误约 ±7pp，而地狱档的真实水平就在
#    10~12% 附近 —— 整条曲线在 5%~20% 之间乱跳，全部落在噪声里，"有没有变强"
#    这件事根本读不出来。77 局把标准误压到 ±4.3pp，配合每 250 局一次的取样
#    足以分辨 10pp 级的变化（phase3 §5.0 的方法论：任何 ≤10pp 的判断必须
#    ≥20 局/档，这是最低要求；这里取 3 倍余量专门为了地狱档）。
#    代价很小：验证局不打梯度，实测约 1.6 s/局，而训练局约 4.7 s/局。
#    每轮 4 档 × 77 = 308 局，占一轮 250 训练局总时长的 29%（原 20 局时是 10%）。
#    副作用是好的：早停守卫（连续 4 块评估退化）以前是在噪声上触发，
#    ep 3000 那次误停就是；验证变稳之后它才真的只在退化时响。
#  --step 250 / --ckpt 100：不动。验证更贵了，但每 250 局一次的取样频率
#    与 --ckpt 100 的检查点频率配合，能给收尾的 --topN 3 留足候选池。
#  --games 12000：实测吞吐 ≈4.5 s/局（含验证），12h ≈ 10300 局，所以墙钟先到，
#    12000 不会被跑满；但要保证四段都走得到 —— hell 段是 6000~12000 局。
#  --no-save：12 小时内绝不碰生产权重 js/input-weights.js。
#  --run-name 每次都传（含续训），否则检查点会被另开到 <旧名>-<日期>，
#    守护读到的就是一份永不更新的死索引（phase3 §14）。
#
#  停止：touch data/.stop/input3-hell12h.sup
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
mkdir -p data/checkpoints/input3-hell12h tools/logs data/.stop

exec bash tools/_supervise.sh input3-hell12h 12 \
  data/checkpoints/input3-12h/ckpt-008500.json \
  --run-name input3-hell12h \
  --end hell \
  --games 12000 \
  --step 250 \
  --eval 77 \
  --vallevels default,hell,grandslam,extreme-max \
  --ckpt 100 \
  --keep 16 \
  --no-save \
  --optimizer adam \
  --layer-lr 1,1,1,3 \
  --grad-clip 2 \
  --eps-reset 500 \
  --curve data/checkpoints/input3-hell12h/curve.json \
  --phases 'default:0.10,extreme-max:0.15,grandslam:0.25,hell:0.50'