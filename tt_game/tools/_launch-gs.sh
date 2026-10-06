#!/usr/bin/env bash
# =====================================================================
#  _launch-gs.sh — 第二轮 12h 续训：课程顶档换成大满贯预备种子
#
#  与第一轮（_launch-12h.sh）的差异，全部来自 2026-10-06 的指令：
#   · 顶档（--end，选优分里占 0.45 权重的那一档）extreme-max → grandslam
#     （大满贯预备种子，实机口径 = policyForModel('grandslam')，
#      阶梯里新增的 id 5，零加压，难度全由策略自身携带）
#   · 课程占比：普通 0.2 → 大满贯预备种子 0.35 → 地狱 0.45
#     （--phases 顺序即课程顺序：先易后难，最后一停在地狱段，
#      地狱也是占比最大的一档——它仍是最难啃的）
#   · 每档验证改为 77 局 × 2 独立种子（--eval 77 + train-input3.js 新增的
#     ladderEval2）：每轮 3 档 × 154 局 = 462 局验证，压选优的种子过拟合
#   · 阶梯只剩 3 档（--vallevels），extreme / extreme-max 退出课程与验证
#
#  起点：input3-12h 的最佳权重 ckpt-008500（选优分 74.1，实机/仿真两侧都量过）。
#  用 --from（裸权重）而不是 --resume：这是**重新开始** —— ep 从 0 计、
#  ε 重新衰减、课程从头调度，6800 局的刻度才成立；--resume 会带着 ep 8500
#  的偏移，课程刻度会被"按剩余预算放宽上限"的逻辑撑爆（实测吞吐 0.24 局/s，
#  而放宽公式按 1.2 局/s 估算，会把 --games 撑到 1 万以上）。
#
#  预算与刻度：
#   · --hours 12（跨中断累计总量，守护每次重启都传同一个值）
#   · --games 6800 是课程刻度不是上限：default 0-1360 / grandslam 1360-3740 /
#     hell 3740-6800。实测吞吐 ~4.2s/局 + 每轮验证 462 局 ≈ 615s，
#     12h ≈ 26 轮 ≈ 6500 局。真跑满了训练器会自动按剩余预算放宽 --games，
#     停在最后一段（hell）继续刷。
#   · --step 250 / --ckpt 100 / --keep 16：与第一轮相同的中断粒度。
#   · --no-save：训练期绝不碰生产权重，收尾由 _finalize-12h.js 按闸门烘焙。
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
mkdir -p data/checkpoints/input3-gs tools/logs data/.stop

exec bash tools/_supervise.sh input3-gs 12 \
  data/checkpoints/input3-12h/ckpt-008500.json \
  --run-name input3-gs \
  --games 6800 \
  --step 250 \
  --eval 77 \
  --ckpt 100 \
  --keep 16 \
  --no-save \
  --optimizer adam \
  --layer-lr 1,1,1,3 \
  --grad-clip 2 \
  --eps-reset 500 \
  --end grandslam \
  --vallevels default,hell,grandslam \
  --curve data/checkpoints/input3-gs/curve.json \
  --phases 'default:0.2,grandslam:0.35,hell:0.45'