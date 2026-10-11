#!/usr/bin/env bash
# =====================================================================
#  _launch-hell12h3.sh — 第四轮 12h：这一轮之前，先把「白跑」的两个成因修掉
#
#  上一轮（input3-hell12h2）的结果
#  -----------------------------
#  跑满 12h（43571s > 43200s 预算），ep 8600。收尾闸门 B 判负，未烘焙。
#  但真正的问题比「打不过地狱」严重得多：**12h 一份新权重都没产出**。
#  逐位比对（sha1 只哈希权重数组）后确认：17 份检查点全部等于起点
#  data/checkpoints/input3-hell12h/ckpt-007000.json。
#  日志里 best=41.4@0 从 ep100 一路到 ep8600 一个 ★ 都没有，就是这个现象的签名。
#
#  ① **选优分口径错配**（致命，tools/train-input3.js）
#     基线 bestScore = 0.45*baseMax + 0.30*base[PHASES[0]] + 0.25*base[default]
#     每轮     sc     = 0.45*epM + 0.30*ep[phase.tag] + 0.25*epD
#     第二项一边锚「课程第一段」、一边锚「当前段」。课程一推进到地狱段，
#     sc 就变成 0.75*地狱 + 0.25*默认，而门槛还停在 0.45*地狱 + 0.55*默认。
#     在 default=70.6% 时要越过 41.44 需要 **地狱 > 31.7%** —— 整轮地狱最高 22.5%。
#     于是 keep 永不成立 → bestNet 从不更新 → 检查点全是同一份权重的副本。
#     修法：第二项固定锚 SEL_REF（新增 --sel-ref 显式指定），基线与每轮共用
#     同一个 selScore()，两边永远同口径。
#
#  ② **强起点用从头训练的学习率，把模型练崩了**
#     实测曲线：train 胜率 50.8% → 20.4% 单调下滑，vs默认 从 70.6% 崩到 5.0%。
#     起点已经很好（default 70.6%），LR_0=1e-4 的步长足够把它打散。
#     这不是「打不过」，是「自己把自己练坏了」。
#     实测探针（各 400 局，同一起点 input3-12h/ckpt-008500）：
#       lr 1e-5 → default 61.0% → 66.3%（+5.2），vsdefault 全程 52~65% 不崩
#       lr 3e-5 → default 61.0% → 63.7%（+2.7），vsdefault 47~62%
#       两个 lr 都**首次出现了 ★ 新最佳**（旧口径下一轮 ★ 都没有）。
#     取 lr 1e-5：default 保持得更好，且地狱档目标下它是唯一在探针里
#     同时做到 default 不退、地狱不掉的档位。
#
#  ③ **选优目标要真的指向地狱**（--sel-ref hell）
#     修 ① 之后若沿用默认锚点，第二项是 default，选优分 = 0.45*地狱 + 0.55*默认，
#     训练器会为了保 default 而放弃打地狱（探针里 default +5.2 / 地狱 −2.7）。
#     本轮目标是「增强地狱 AI 的实力」，所以显式 --sel-ref hell：
#     选优分 = 0.75*地狱 + 0.25*默认护栏。实测（400 局）地狱 11.5% → 13.8%（+2.3）、
#     default 61.0% → 63.7%（+2.7），两头同时涨。
#
#  本轮课程：default:0.25 → hell:0.45 → grandslam:0.15 → hell:0.15
#    · 地狱累计 60%，但**拆成两段**（中间插 15% grandslam）。
#      上一轮 70% 连成一段，模型在地狱段里越练越崩（ep3750 default 掉到 5.0%）。
#      拆段后地狱仍是主攻方向，但每一段都有喘息，不至于一路崩到底。
#    · default 25%（上一轮 10%）：default 是收尾闸门「vs普通 不劣于基线」的那一档，
#      也是防止策略遗忘基本功的锚。上一轮给 10% 太薄，default 一路没回到过护栏线。
#    · grandslam 15%：实机真实可选对手，收尾闸门给它 0.45 权重，不能练塌。
#
#  --eval 30（每档 30 局 × 2 种子 = 60 局/档）：够分辨 10pp 级变化
#    （phase3 §5.0：≤10pp 的判断至少 20 局/档，这里 3 倍余量），
#    又不像上一轮 --eval 77 那样把 38% 的预算烧在验证上。
#
#  --lr0/--lr1 1e-5：见 ②。新增的两个 flag，默认值不变，老脚本行为不受影响。
#
#  起点：input3-12h/ckpt-008500.json
#    它就是当前**生产权重** js/input-weights.js 的来源，也是收尾闸门 A/B/C
#    的比较基线（tools/logs/baseline-live.json 实机 default 35.4 / hell 11.7 /
#    grandslam 35.4）。从它续训 = 站在线上这份的肩上，而不是站在一份
#    实机只有 2.6% 地狱胜率的废权重上（上一轮正是后者，白跑的另一半原因）。
#
#  --no-save：12 小时内绝不碰生产权重 js/input-weights.js。
#  --run-name 每次都传（含续训），否则检查点会被另开到 <旧名>-<日期>。
#
#  停止：touch data/.stop/input3-hell12h3.sup
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
mkdir -p data/checkpoints/input3-hell12h3 tools/logs data/.stop

exec bash tools/_supervise.sh input3-hell12h3 12 \
  data/checkpoints/input3-12h/ckpt-008500.json \
  --run-name input3-hell12h3 \
  --end hell \
  --sel-ref hell \
  --games 9000 \
  --step 250 \
  --eval 30 \
  --vallevels default,hell,grandslam \
  --ckpt 250 \
  --keep 16 \
  --no-save \
  --optimizer adam \
  --layer-lr 1,1,1,3 \
  --grad-clip 2 \
  --lr0 0.00001 \
  --lr1 0.00001 \
  --eps-reset 500 \
  --curve data/checkpoints/input3-hell12h3/curve.json \
  --phases 'default:0.25,hell:0.45,grandslam:0.15,hell:0.15'