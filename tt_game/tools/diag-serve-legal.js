/* =====================================================================
 *  diag-serve-legal.js — 确定性检验：serveShot 的解在「实机积分器」下是否合法
 *  · 背景：实机里出现过"发球出界""两跳都在自己半台"。serveShot（simcore.js）
 *    与实机 physicsStep（physics.js）是两个独立实现，历史上多处不一致：
 *      1) 积分分辨率：实机每帧 2 个 1/120 子步，旧 serveShot 按 1/60
 *      2) Magnus：旧 serveShot 只算 x/y 两个分量，漏了 z 分量
 *      3) 旋转衰减：旧 serveShot 完全没有 s *= (1-0.05dt)
 *    本脚本把 serveShot 的解用"实机同款积分器"重放，直接统计两跳合法性。
 *  · 不依赖浏览器/游戏循环，纯 Node，结果可复现。
 *  · 用法：node tools/diag-serve-legal.js [--n 400]
 * ===================================================================== */
'use strict';
const path = require('path');
const SIM = require(path.join(__dirname, '..', 'js', 'simcore.js'));
const C = SIM.C;

const args = process.argv.slice(2);
let N = 400;
if(args.indexOf('--n') >= 0) N = parseInt(args[args.indexOf('--n') + 1], 10);
let STRIKE_Y = null;   // 覆盖出球点高度（默认用 TABLE_TOP+0.05）
if(args.indexOf('--y') >= 0) STRIKE_Y = parseFloat(args[args.indexOf('--y') + 1]);

/* 实机 physicsStep 的逐子步复制（physics.js:282-330，去掉磁吸/触球/规则钩子）。
 * 顺序严格对齐：重力 → 空气阻力 → Magnus(完整叉积) → 位移 → 旋转衰减 → 台面弹跳。 */
function realIntegrate(from, vel, spin){
  const p = { x: from.x, y: from.y, z: from.z };
  const v = { x: vel.x, y: vel.y, z: vel.z };
  const s = { x: spin.x, y: spin.y, z: spin.z };
  const dt = 1 / 120;
  let prevY = p.y, prevX = p.x, prevZ = p.z;
  const ev = [];
  for(let i = 0; i < 1200; i++){
    v.y -= C.G * dt;
    const drag = Math.max(0, 1 - C.AIR * dt); v.x *= drag; v.y *= drag; v.z *= drag;
    const tx = s.y * v.z - s.z * v.y, ty = s.z * v.x - s.x * v.z, tz = s.x * v.y - s.y * v.x;
    v.x += tx * C.MAGNUS * dt; v.y += ty * C.MAGNUS * dt; v.z += tz * C.MAGNUS * dt;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    const sd = Math.max(0, 1 - 0.05 * dt); s.x *= sd; s.y *= sd; s.z *= sd;
    // 台面弹跳（physics.js 判据：本次低于台面、上次高于台面-0.05、在台面范围内）
    if(v.y < 0 && p.y - C.BALL_R <= C.TABLE_TOP && prevY - C.BALL_R > C.TABLE_TOP - 0.05
       && Math.abs(p.x) <= C.TABLE_W / 2 + C.BALL_R * 0.6
       && Math.abs(p.z) <= C.TABLE_L / 2 + C.BALL_R * 0.6){
      ev.push({ kind: 'table', x: p.x, z: p.z, y: p.y });
      p.y = C.TABLE_TOP + C.BALL_R;
      v.y = -v.y * C.REST;
      v.z = v.z * 0.99 + s.x * C.SPIN_KICK;
      v.x = v.x * 0.985 - s.y * C.SPIN_KICK * 0.6;
      const k = 0.72; s.x *= k; s.y *= k; s.z *= k;
    }
    // 实机 checkNet：本子步穿越 z=0 且 yC 落在 [TABLE_TOP-0.03, TABLE_TOP+NET_H+R*1.5]
    // 就算撞网；yC <= 网顶-0.028 必然弹回己方，高于网顶时 55% 判"擦网"只减速、45% 弹回。
    {
      const crossed = (prevZ < 0 && p.z >= 0) || (prevZ > 0 && p.z <= 0);
      if(crossed){
        const f = (0 - prevZ) / (p.z - prevZ || 1e-9);
        const xC = prevX + (p.x - prevX) * f, yC = prevY + (p.y - prevY) * f;
        if(Math.abs(xC) <= C.NET_LEN / 2 + C.BALL_R && yC <= C.TABLE_TOP + C.NET_H + C.BALL_R * 1.5){
          const letChance = (yC > C.TABLE_TOP + C.NET_H - 0.028) ? 0.55 : 0;
          if(Math.random() >= letChance) return { ev, end: 'net', final: { x: p.x, y: yC, z: 0 } };
        }
      }
    }
    prevY = p.y; prevX = p.x; prevZ = p.z;
    // 出界/落地
    if(p.y <= C.BALL_R && v.y < 0) return { ev, end: 'floor', final: { x: p.x, y: p.y, z: p.z } };
    if(Math.abs(p.x) > 7.5 || Math.abs(p.z) > 7.5 || p.y < -0.5) return { ev, end: 'out', final: { x: p.x, y: p.y, z: p.z } };
  }
  return { ev, end: 'timeout', final: { x: p.x, y: p.y, z: p.z } };
}

const ownZ = C.TABLE_L / 2 + 0.5;      // 发球站位：端线外 0.5m（= rules.js 的抛球点）
let ok = 0, faultSecond = 0, faultFirst = 0, noSecond = 0, ns = 0, nets = 0;
const dz2 = [];
for(let i = 0; i < N; i++){
  const playerServes = (i % 2 === 0);
  const z = playerServes ? ownZ : -ownZ;
  const dir = playerServes ? -1 : 1;
  const depth = 0.25 + ((i * 0.618) % 1) * 0.7;
  const spinX = 15 + ((i * 0.377) % 1) * 25;
  const sideY = (((i * 0.211) % 1) - 0.5) * 45;
  const x0 = (((i * 0.131) % 1) - 0.5) * 1.6;
  const y0 = (STRIKE_Y != null) ? STRIKE_Y : C.TABLE_TOP + 0.05;
  const sv = SIM.serveShot({ x: x0, y: y0, z }, { dir, depth, spinX, sideY });
  if(!sv) { noSecond++; continue; }
  ns++;
  const r = realIntegrate({ x: x0, y: y0, z }, sv.vel, sv.spin);
  if(r.end === 'net') { nets++; continue; }
  const tables = r.ev.filter(e => e.kind === 'table');
  if(tables.length < 2){ faultFirst++; continue; }
  const z1 = tables[0].z, z2 = tables[1].z;
  const ownSign = playerServes ? 1 : -1;
  dz2.push(Math.abs(z2));
  if(ownSign * z1 > 0 && ownSign * z2 < 0) ok++;
  else faultSecond++;
}
dz2.sort((a, b) => a - b);
console.log('发球总数：' + N + '（serveShot 无解 ' + noSecond + '，有解 ' + ns + '）');
console.log('  两跳合法（首跳己方 + 二跳对方）：' + ok + '/' + ns + ' = ' + (100 * ok / ns).toFixed(1) + '%');
console.log('  撞网（实机 checkNet 判据）：' + nets + '  = ' + (100 * nets / ns).toFixed(1) + '%');
console.log('  二跳落回己方半台：' + faultSecond);
console.log('  二跳未能落台面（出界/落地）：' + faultFirst);
console.log('  实机积分下二跳深度 |z2|：min ' + dz2[0].toFixed(3) +
            '  med ' + dz2[dz2.length >> 1].toFixed(3) + '  max ' + dz2[dz2.length - 1].toFixed(3));
