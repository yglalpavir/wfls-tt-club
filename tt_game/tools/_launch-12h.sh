#!/usr/bin/env bash
# =====================================================================
#  _launch-12h.sh — 12 小时续训的固定启动参数（可复现；参数集中在这里，
#  守护逻辑在 _supervise.sh）
#
#  口径（依据 tools/phase3-findings.md §6）：
#   · 起点：input3-parity 冒烟跑的最佳权重 ckpt-000300 —— 它是对着**实机同源**
#     地狱AI（阶段 3 已把阶梯 hell 档换成真正的 learned-policy 口径）训出来的，
#     600 回合就已有 default 42.9% / hell 7.2% / extreme-max 63.3%，
#     比 --from random 更靠前。阶段 3 里"必须从随机重训"的结论针对的是旧
#     input3-v3 权重（它的课程对手根本不是实机地狱AI），不适用于这份。
#   · 优化器：adam + grad-clip 2 + layer-lr 1,1,1,3。
#     依据 tools/diag-grad.js：输出层梯度范数是隐层的 1/10，单 lr 会让
#     1904 维输出层欠驱动；clip 是安全阀（SGD 下那条 |d|<100 截断真实分布下
#     触发率 0.000%，等于没有稳定性机制）。
#   · 课程：hell 占 25% —— 地狱AI 是唯一真正打不过的档（7% vs 顶档 63%），
#     它就是这次要攻的那一档。
#   · --games 10000 是**课程刻度**不是上限：train-input3.js 的
#     evalAtPhase(g) = PHASES.find(p => g < p.to * opt.games)，课程按绝对局号
#     在 [0, games) 上分段推进。给个巨大的 --games 会让训练永远卡在第 1 段
#     hell 里，给个偏小的则课程会在墙钟预算耗尽前就跑完、剩下的时间全在顶档里刷。
#     实测吞吐（首轮 ep250@1424s，其中启动 ~240s、验证 142s）≈ 4.2s/局，
#     一个 250 局循环含验证约 1192s → 12h 预算只够 ~9000 局。
#     取 10000：四段课程（hell 0-2500 / elite 2500-5500 / extreme 5500-8000 /
#     extreme-max 8000-10000）都能被走到，极值档不会因为「预算先到」而完全没训过
#     —— 它占选优分 0.45 的权重，只训 hell+elite 会把顶档练废。
#   · --step 250 / --eval 20：每轮验证 5 档 × 20 局 × 2 种子 = 200 局，约占
#     36% 开销，换取较稳的选优信号（选优分取自这些验证胜率，局数太少会选到
#     噪声上）。eps-reset 500 是 250 的倍数，不触发警告。
#   · --ckpt 100 / --keep 16：每 100 局（约 83s）落一次检查点，环形留 16 份
#     ≈160MB。被杀最多丢 83 秒。
#   · --no-save：12 小时内绝不碰生产权重 data/input-ai-extreme.json。
#     收尾后按「实机管线更强 + 口径没走样」两个条件再烘焙。
#   · --run-name input3-12h **每次都传**（含续训）：train-input3.js 的
#     INHERIT_DIR = !runName && !ckptDir && !!RESUME.dir —— 续训时不给
#     run-name/ckpt-dir，它会把检查点另开到 `<旧名>-<日期>` 的新目录
#     （防的是 input3-v4 那种跨 run 覆盖事故）。那样守护脚本读
#     data/checkpoints/input3-12h/index.json 拿到的是一份永远不再更新的死索引，
#     预算判定失效、收尾脚本也找不到最佳权重。
#   · --curve 指向 run 目录，避免改到入库的 tools/input-curve-v3.json。
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
mkdir -p data/checkpoints/input3-12h tools/logs data/.stop

exec bash tools/_supervise.sh input3-12h 12 \
  data/checkpoints/input3-parity/ckpt-000300.json \
  --run-name input3-12h \
  --games 10000 \
  --step 250 \
  --eval 20 \
  --ckpt 100 \
  --keep 16 \
  --no-save \
  --optimizer adam \
  --layer-lr 1,1,1,3 \
  --grad-clip 2 \
  --eps-reset 500 \
  --curve data/checkpoints/input3-12h/curve.json \
  --phases 'hell:0.25,elite:0.30,extreme:0.25,extreme-max:0.20'