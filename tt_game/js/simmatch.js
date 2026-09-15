/* =====================================================================
 *  simmatch.js — 无头自对弈比赛模拟（浏览器全局 SIMMATCH / Node require）
 *  · 两方都用 policy.js#aiDecision 选回球；发球用 aiServePlan/Target
 *  · "够到球"模型 = 预测拍面交叉点 + 移动速度×可用时间 vs 拍位
 *    （moveSpeed/moveErr 是难度轴，也驱动难度滑杆）
 *  · 规则复刻：发球/净网校验、双跳、出界、11 分制 ITTF 轮换发球
 * ===================================================================== */
'use strict';
if(typeof module !== 'undefined' && module.exports){
  const m = require('./simcore.js'); global.SIM = m; global.P = require('./policy.js');
}
const SIMMATCH = (() => {
  const C = SIM.C;
  const PLAYER_Z = 1.32, AI_Z = -1.32;   // 与 constants.js 一致
  const PAD_HW = 0.10, PADDLE_Y = C.TABLE_TOP + 0.15;
  const WIN_LO = PADDLE_Y - 0.235, WIN_HI = PADDLE_Y + 0.235;   // 拍高窗口（=实机 tryAIHit 的 y 容错）
  // 球拍前后可达范围（与实机对称：玩家鼠标前推上限 0.92 / AI 前扑上限 -0.92，各 0.4m）
  const ZRANGE = { player:{ lo:0.92, hi:1.45 }, ai:{ lo:-1.45, hi:-0.92 } };
  const clampN = (v,a,b)=> v<a?a:(v>b?b:v);

  /* 推进一帧（重力+空气阻力+马格努斯）；落回地面返回 false */
  function step(p, v, s, dt){
    v.y -= C.G*dt;
    const drag = 1-C.AIR*dt; v.x*=drag; v.y*=drag; v.z*=drag;
    const tx = s.y*v.z - s.z*v.y, ty = s.z*v.x - s.x*v.z, tz = s.x*v.y - s.y*v.x;
    v.x += tx*C.MAGNUS*dt; v.y += ty*C.MAGNUS*dt; v.z += tz*C.MAGNUS*dt;
    p.x += v.x*dt; p.y += v.y*dt; p.z += v.z*dt;
    return p.y > C.BALL_R;
  }
  /* 从触球点全程推进（含台面弹跳），直到 z 越过 receiver 拍面平面；
     仅在球已弹于接收方半区后才算可回；返回 {t,x,y,state} 或 null */
  function crossInfo(contact, plane, side){
    const p = {x:contact.pos.x, y:contact.pos.y, z:contact.pos.z};
    const v = {x:contact.vel.x, y:contact.vel.y, z:contact.vel.z};
    const s = {x:contact.spin.x, y:contact.spin.y, z:contact.spin.z};
    const dt = 1/60; let t = 0, bounced = false;
    const goingPos = v.z > 0;
    for(let i = 0; i < 500; i++){
      const px=p.x, py=p.y, pz=p.z;
      const alive = step(p, v, s, dt);
      t += dt;
      if(!alive) return null;
      if(v.y<0 && p.y-C.BALL_R<=C.TABLE_TOP && Math.abs(p.x)<=C.TABLE_W/2 && Math.abs(p.z)<=C.TABLE_L/2){
        p.y = C.TABLE_TOP + C.BALL_R;
        v.y = -v.y*C.REST; v.z = v.z*0.99 + s.x*C.SPIN_KICK; v.x = v.x*0.985 - s.y*C.SPIN_KICK*0.6;
        s.x*=0.72; s.y*=0.72; s.z*=0.72;
        if(side==='player' ? p.z>0 : p.z<0) bounced = true;
      }
      if((goingPos && p.z>=plane)||(!goingPos && p.z<=plane)){
        if(!bounced) return null;                       // 未在接收方半区弹跳就过线 → 够不到
        const f = clampN((plane-pz)/(p.z-pz||1e-9), 0, 1);
        return { t, x: px+(p.x-px)*f, y: py+(p.y-py)*f,
                 state:{ pos:{x: px+(p.x-px)*f, y: py+(p.y-py)*f, z: plane},
                         vel:{x:v.x, y:v.y, z:v.z}, spin:{x:s.x, y:s.y, z:s.z} } };
      }
    }
    return null;
  }
  /* 发球：从 server 抛球点两跳发球（ITTF：首跳己方→弹起过网→二跳对方）
     与实机 rules.js#strikeServe 同一套（统一深发球 + 恒定上旋 + 组合侧旋） */
  const SERVE = { topMag:22, sideMag:72,
    long:{ speed:2.7, speedJitter:0.3, arc:0.95, depth:0.62, depthJitter:0.06 },
    short:{ speed:2.7, speedJitter:0.3, arc:0.95, depth:0.62, depthJitter:0.06 } };
  function serveShot(server, policy, rng){
    const isP = server==='player';
    const dir = isP ? -1 : 1;
    const plan = P.aiServePlan(policy, rng);
    const power = clampN(plan.power==null?0.5:plan.power, 0, 1);
    const T = SERVE.long;   // 统一发球（short/long 已合并）
    const from = { x:0, y:C.TABLE_TOP+0.28, z: isP?1.87:-1.87 };   // 发球点击球点：端线外 0.5m（与实机 main.js awaitServe 一致）
    const depth = clampN(T.depth + (rng()-0.5)*T.depthJitter, 0.16, 0.95);
    // 发球旋转 mix（topProb<1 → 下旋发球，60% 强度）+ serveSpin 倍率 + servePace 出球速度倍率（def=1 → 零回归）
    const sSpin = plan.serveSpin == null ? 1 : plan.serveSpin;
    const sPace = plan.servePace == null ? 1 : plan.servePace;
    const topSign = plan.top === false ? -0.6 : 1;
    const mag = (SERVE.topMag + rng()*10) * (0.6 + 0.8*power) * sSpin * topSign;
    const spinX = mag;
    const sy = (plan.side*SERVE.sideMag + (rng()-0.5)*6) * (0.6 + 0.8*power) * sSpin;
    let sv = SIM.serveShot(from, { dir, depth, spinX, sideY: sy, speedMul: sPace });
    if(!sv){ sv = SIM.serveShot(from, { dir, depth: 0.62, spinX, sideY: 0, speedMul: sPace }); }
    if(!sv){ sv = SIM.serveShot(from, { dir, depth: 0.35, spinX: 0, sideY: 0 }); }
    return { from, vel: sv.vel, spin: sv.spin };
  }
  /* 回球：接收方用 aiDecision 选击球方案（aiX≈0 近似判定正/反手）
     若 policy 带 __dqn（DQN agent），用 DQN 选"打法模式"，再以 forceMode 强制该模式出球 */
  const MODE_BY_ACTION = ['push', 'lift', 'counter', 'smash', 'loop', 'normal'];
  function returnShot(receiver, contact, policy, rng, oppPaddleX, isReceive){
    const bx = contact.pos.x, by = contact.pos.y, bz = contact.pos.z;
    const stroke = bx < 0 ? 'forehand' : 'backhand';
    const ctx = {
      stroke, bx, by, bz,
      vx:contact.vel.x, vy:contact.vel.y, vz:contact.vel.z,
      sx:contact.spin.x, sy:contact.spin.y,
      aiX:0, playerX: oppPaddleX,
      dir: receiver==='player' ? -1 : 1,            // 玩家侧向 -Z / AI 侧向 +Z
      receive: !!isReceive,                          // 接发球板（receive.pushProb / receive.attackProb 生效）
    };
    let d;
    if(policy && policy.__dqn){
      const ag = policy.__dqn;
      const physics = policy.__physics || P.POLICY_DEFAULT;   // 出球物理（默认或 learned）
      if(ag.isTraining()){
        const { action } = ag.act(ctx, true);        // 训练：DQN 探索选动作
        d = P.aiDecision(ctx, physics, MODE_BY_ACTION[action]);
      }else{
        d = P.aiDecision(ctx, physics, MODE_BY_ACTION[ag.bestAction(ctx)]);  // 推理
      }
    }else{
      d = P.aiDecision(ctx, policy);
    }
    return { vel:d.outVel, spin:{x:d.fx, y:d.fy, z:0}, decision:d };
  }
  /* 单分：firstServer 发球（两跳）；返回 {winner, shots, reason}
     够到球 = 球拍前后(meet.z)+左右(meet.x)都能在时限内到达 meet 点（与实机 aiMove 一致） */
  function playPoint(pA, pB, rng, firstServer){
    const paddles = { player:{x:0, z:PLAYER_Z}, ai:{x:0, z:AI_Z} };
    // —— 发球（ITTF 两跳：首跳己方 → 弹起过网 → 二跳对方）——
    const srvShot = serveShot(firstServer, firstServer==='player'?pA:pB, rng);
    const srv = SIM.simulateServeFull(srvShot.from, srvShot.vel, srvShot.spin, firstServer, rng);
    const sPol = firstServer==='player'?pA:pB;
    if(!srv.ok){                                       // 发球失误 → 对方得分
      if(sPol && sPol.__dqn) sPol.__dqn.creditReward(-0.5);
      return { winner: firstServer==='player'?'ai':'player', shots:1, reason: srv.reason };
    }
    if(sPol && sPol.__dqn) sPol.__dqn.creditReward(0.05);
    // —— 接发球方回球（用发球接触点状态整程预测：predictMeetZ 自会检测二跳落对方半台，
    //     与实机 aiMoveShared 一致——深发球也按全程反应时间判定够到球）——
    const receiver = firstServer==='player'?'ai':'player';
    const rpol = receiver==='player'?pA:pB;
    const rec = paddles[receiver];
    const zr = ZRANGE[receiver];
    const meet = SIM.predictMeetZ(srvShot.from, srvShot.vel, srvShot.spin, receiver, WIN_LO, WIN_HI, zr.lo, zr.hi);
    let shots = 2, winner = null, reason = 'cap';
    if(!meet){ winner = firstServer; reason='reach-null'; }
    else{
      // z 轴（前后）够到球
      const zSpd = P.get(rpol,'moveZ',2.0);
      if(Math.abs(meet.z - rec.z) > zSpd*meet.t + 0.08){ winner = firstServer; reason='reach-z'; }
      else{
        rec.z += clampN(meet.z - rec.z, -zSpd*meet.t, zSpd*meet.t);
        // x 轴（横向）够到球
        const spd = P.get(rpol,'moveSpeed',2.45);
        const err = P.get(rpol,'moveErr',0.06);
        const errScale = err + Math.abs(srv.spin.x)*0.0011 + Math.abs(srv.spin.y)*0.0006;
        const xTarget = meet.x + P.gaussOf(rng)*errScale;
        if(Math.abs(xTarget - rec.x) > spd*meet.t + PAD_HW){ winner = firstServer; reason='reach-speed'; }
        else{
          const xf = rec.x + clampN(xTarget-rec.x, -spd*meet.t, spd*meet.t);
          if(Math.abs(meet.x - xf) > PAD_HW + 0.05){ winner = firstServer; reason='reach-pos'; }
          else{
            rec.x = xf;
            const r = returnShot(receiver, meet.state, rpol, rng, paddles[firstServer].x, true);   // 接发球板
            // 接发回球为相持第一板
            let hitter = receiver;
            let state = { from: meet.state.pos, vel: r.vel, spin: r.spin, decision:r.decision };
            for(let k = 0; k < 500; k++){
              const hpol = hitter==='player'?pA:pB;
              const sim = SIM.simulateFull(state.from, state.vel, hitter, state.spin, rng);
              if(!sim.ok || !sim.bouncedOpp){ // 下网/出界/未上台 → 本板失误
                if(hpol && hpol.__dqn) hpol.__dqn.creditReward(-0.5);
                winner = hitter==='player'?'ai':'player'; reason = sim.ok ? 'hit-own' : ('hit-'+ (sim.reason||'?')); break;
              }
              if(hpol && hpol.__dqn) hpol.__dqn.creditReward(0.05);
              const recv2 = hitter==='player'?'ai':'player';
              const zr2 = ZRANGE[recv2];
              const meet2 = SIM.predictMeetZ({x:state.from.x, y:state.from.y, z:state.from.z}, state.vel, state.spin, recv2, WIN_LO, WIN_HI, zr2.lo, zr2.hi);
              if(!meet2){ if(hpol && hpol.__dqn) hpol.__dqn.creditReward(0.5); winner = hitter; reason='reach-null'; break; }
              const rpol2 = recv2==='player'?pA:pB;
              const rec2 = paddles[recv2];
              const zSpd2 = P.get(rpol2,'moveZ',2.0);
              if(Math.abs(meet2.z - rec2.z) > zSpd2*meet2.t + 0.08){ winner = hitter; reason='reach-z'; break; }
              rec2.z += clampN(meet2.z - rec2.z, -zSpd2*meet2.t, zSpd2*meet2.t);
              const spd2 = P.get(rpol2,'moveSpeed',2.45);
              const err2 = P.get(rpol2,'moveErr',0.06);
              const errScale2 = err2 + Math.abs(state.spin.x)*0.0011 + Math.abs(state.spin.y)*0.0006 + Math.max(0, Math.abs(state.vel.z)-4)*0.05;
              const xTarget2 = meet2.x + P.gaussOf(rng)*errScale2;
              if(Math.abs(xTarget2 - rec2.x) > spd2*meet2.t + PAD_HW){ winner = hitter; reason='reach-speed'; break; }
              const xf2 = rec2.x + clampN(xTarget2-rec2.x, -spd2*meet2.t, spd2*meet2.t);
              if(Math.abs(meet2.x - xf2) > PAD_HW + 0.05){ winner = hitter; reason='reach-pos'; break; }
              rec2.x = xf2;
              const r2 = returnShot(recv2, meet2.state, rpol2, rng, paddles[hitter].x);
              state = { from: meet2.state.pos, vel: r2.vel, spin: r2.spin, decision:r2.decision };
              hitter = recv2; shots++;
            }
          }
        }
      }
    }
    if(!winner) winner = rng()<0.5?'player':'ai';                        // 超长分兜底
    return { winner, shots, reason };
  }
  /* 一局 11 分（ITTF 发球轮换） */
  function playGame(pA, pB, rng, reasons){
    let sA=0, sB=0, server='player', shots=0;
    while(true){
      const pt = playPoint(pA, pB, rng, server);
      shots += pt.shots;
      if(pt.winner==='player') sA++; else sB++;
      if(reasons) reasons[pt.reason] = (reasons[pt.reason]||0)+1;
      const total = sA+sB;
      if((sA>=11 || sB>=11) && Math.abs(sA-sB)>=2) break;
      const interval = (sA>=10 && sB>=10) ? 1 : 2;
      if(total % interval === 0) server = server==='player'?'ai':'player';
    }
    return { sA, sB, shots };
  }
  /* 一场对局：opts.games 局，轮流交换站位（消除站位偏差）；返回统计 */
  function playMatch(pA, pB, opts){
    opts = opts || {};
    const games = opts.games || 12;
    const reasons = opts.debugReasons ? {} : null;
    let winsA=0, winsB=0, pointsA=0, pointsB=0, shots=0;
    for(let i = 0; i < games; i++){
      const rng = opts.rngFactory ? opts.rngFactory(i) : Math.random;
      const swap = (i % 2 === 1);                       // 奇偶局交换主客
      const g = swap ? playGame(pB, pA, rng, reasons) : playGame(pA, pB, rng, reasons);
      const aW = swap ? g.sB : g.sA, bW = swap ? g.sA : g.sB;
      winsA += aW; winsB += bW; pointsA += aW; pointsB += bW;
      shots += g.shots;
    }
    const out = { winsA, winsB, pointsA, pointsB, games, shots,
             winRate: (winsA+winsB) ? winsA/(winsA+winsB) : 0.5,
             pointRate: (pointsA+pointsB) ? pointsA/(pointsA+pointsB) : 0.5 };
    if(reasons) out.reasons = reasons;
    return out;
  }
  const api = { playPoint, playGame, playMatch, serveShot, returnShot, crossInfo, C, PLAYER_Z, AI_Z };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
