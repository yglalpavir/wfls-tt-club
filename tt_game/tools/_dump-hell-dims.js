/* 一次性工具：导出地狱 AI 42 维向量的完整对照表（UTF-8 markdown） */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));

const CUR = P.strongVec();                                   // 当前线上（实机口径）
const OLD = JSON.parse(fs.readFileSync(path.join(__dirname, 'logs', '_shipped-20260913-ingame.json'), 'utf8')).vec;
const R2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'logs', '_run330-candidate.json'), 'utf8')).vec;
let R3 = null;
try { R3 = JSON.parse(fs.readFileSync(path.join(__dirname, 'train-hell-candidate.json'), 'utf8')).vec; } catch (e) {}

const LBL = {
  'moveSpeed': '横向(左右)移动速度', 'moveErr': '移动瞄准误差(越大越飘)',
  'moveZ': '前后(Z轴)移动速度', 'push.prob': '推挡/摆短 使用率',
  'push.forceThresh': '来球力量超过此值才推挡', 'counter.prob': '借力反击 选择率',
  'smash.prob': '扣杀 选择率', 'loop.prob': '对拉/拉弧圈 选择率',
  'awayProb': '主动把球打向远离对手一侧的概率', 'txMin': '落点 x 基线(近身侧)',
  'txRange': '落点 x 抖动幅度', 'tzBase': '落点 z 基线(深度)',
  'tzRange': '落点 z 抖动幅度', 'txWideProb': '打大角度/极端落点的概率',
  'serve.topProb': '发球上旋占比', 'serve.sideProb': '发球侧旋占比',
  'loopPace': '对拉 球速倍率', 'loopSpin': '对拉 旋转倍率', 'loopArc': '对拉 弧线倍率',
  'smashPace': '扣杀 球速倍率', 'smashSpin': '扣杀 旋转倍率',
  'liftPace': '挑球 球速倍率', 'defPace': '防守 球速倍率', 'counterPace': '反击 球速倍率',
  'txWideMag': '大角度落点幅度倍率', 'fwdBoost': '前冲进攻加成',
  'pushSide': '推挡 侧旋量', 'pushDepth': '推挡 深度',
  'servePace': '发球 球速倍率', 'serveSpin': '发球 旋转倍率',
  'txErrBase': '落点 x 基础误差', 'txErrSpd': '落点误差随球速放大', 'txErrBx': '落点误差的反手侧放大',
  'txErrSide': '侧旋导致的落点偏移', 'txErrTop': '上旋导致的落点偏移', 'txClamp': '落点收缩系数',
  'wide.forehand': '正手大角度系数', 'wide.backhand': '反手大角度系数',
  'swipeSide': '横滑取正向的概率(侧旋偏好)',
  'receive.pushProb': '接下旋发球时搓球率', 'receive.attackProb': '接上旋发球时直接抢攻率',
  'recoverPace': '回位/跟随速度',
};
const GRP = [];
for (let i = 0; i < 16; i++) GRP.push('① 移动 / 战术选择（0–15）');
for (let i = 16; i < 30; i++) GRP.push('② 出球质量倍率（16–29）');
for (let i = 30; i < 42; i++) GRP.push('③ 落点精度 / 接发 / 回位（30–41）');

const f = (v) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
const edge = (v, k) => {
  const s = (v - k.min) / (k.max - k.min);
  if (s < 0.005) return '🔻min';
  if (s > 0.995) return '🔺max';
  return '';
};

let out = '';
out += '# 地狱 AI 全部 42 维参数对照表\n\n';
out += '- **现线上** = `js/learned-policy.js` 经 `policy.js#strongVec()`（游戏实机真正使用的向量，护栏硬写 idx 0/1/2 = 2.8 / 0.03 / 2.6）\n';
out += '- **旧线上** = 2026-09-13 版本（归档于 `tools/logs/_shipped-20260913-ingame.json`）\n';
out += '- **R2 候选** = 2026-10-18 已采纳的那一版；**R3 候选** = 第三轮（已弃，53.08 %）\n';
out += '- 「贴边」= 该维已被 GA 顶到取值区间端点，继续优化只能靠别的维\n\n';

let lastGrp = '';
P.POLICY_KEYS.forEach((k, i) => {
  if (GRP[i] !== lastGrp) { lastGrp = GRP[i]; out += `\n## ${lastGrp}\n\n`; out += '| # | 参数 | 含义 | 旧线上 | **现线上** | Δ(新−旧) | 区间 | 默认 | 贴边 |\n|---|---|---|---|---|---|---|---|---|\n'; }
  const d = CUR[i] - OLD[i];
  out += `| ${i} | \`${k.k}\` | ${LBL[k.k] || ''} | ${f(OLD[i])} | **${f(CUR[i])}** | ${d >= 0 ? '+' : ''}${f(d)} | ${k.min}–${k.max} | ${k.def} | ${edge(CUR[i], k)} |\n`;
});

if (R3) {
  out += '\n## 三轮向量在“变化最大的 12 维”上的对照\n\n';
  out += '| # | 参数 | 旧线上 | R2（已采纳） | R3（已弃） |\n|---|---|---|---|---|\n';
  const idx = OLD.map((v, i) => [i, Math.abs(CUR[i] - v)]).sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x[0]);
  idx.forEach(i => { out += `| ${i} | \`${P.POLICY_KEYS[i].k}\` | ${f(OLD[i])} | ${f(CUR[i])} | ${f(R3[i])} |\n`; });
}

fs.writeFileSync(path.join(__dirname, 'logs', '_hell-dims.md'), out, 'utf8');
console.log('wrote tools/logs/_hell-dims.md,', out.length, 'chars');