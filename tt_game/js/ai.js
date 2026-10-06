/* =====================================================================
 *  ai.js — AI 落点预测 / 移动 / 演示模式
 * ===================================================================== */
'use strict';

/* ---------------- 12. AI ---------------- */
/* 预测已移至 simcore.js（SIM.predictXAtZ / SIM.predictLanding，单一物理源） */
function predictXAtZ(zPlane){ return SIM.predictXAtZ(ball.pos, ball.vel, ball.spin, zPlane); }
function predictLanding(){ return SIM.predictLanding(ball.pos, ball.vel, ball.spin); }
/* 统一 AI 移动（玩家侧与 AI 侧共用同一套"预测 + 引拍 + 移动"逻辑，保证左右完全对称）
   side='player'|'ai'：决定球来方向（toward=+1/-1）与 predictMeetZ 的弹跳侧
   zHome：待机 z；zLo/zHi：前扑可达窗口（player [0.92,1.72] ↔ ai [-1.72,-0.92] 镜像）
   policy：本侧所用策略（moveSpeed/moveZ）；precModel：diffPrecision 精度模型 */
function aiMoveShared(dt, pad, side, zHome, zLo, zHi, policy, precModel){
  const g = pad.group.position;
  pad.x = g.x; pad.z = g.z;
  /* ★ 本函数现在是 SIM.aiStep 的薄适配层：真正的逐帧跑位 / 落点预测 / 姿态决策 /
     侧身正手 全部搬进了 simcore.js，好让训练器（input-sim.js）对同一条对手
     也调同一份代码。训练器过去用的是 input-sim.js#aiReach 那套闭式近似
     （无逐帧跑位、无磁吸、无三维接触判定），于是「对手」在训练与实机是两个
     不同的游戏，仿真胜率从这个分叉开始就不可迁移。 */
  const r = SIM.aiStep({
    dt, now: elapsed, side, mir: (side === 'player' ? 1 : -1),
    pad, ball, ballDead, lastHitter,
    zHome, zLo, zHi, policy,
    moveSpeed: get(policy, 'moveSpeed', 2.45),
    moveZ: get(policy, 'moveZ', 2.0),
    recoverPace: get(policy, 'recoverPace', 7),
    fhPref: get(policy, 'fhPref', 1),
    /* 落点误差与精度系数按「本侧模型」取（simcore 不认识模型名，由调用方解析） */
    errBase: get(policyForModel(precModel), 'moveErr', 0.06),
    precZ: 0.05 * diffPrecision(precModel),
    rng: Math.random,
  });
  g.x = pad.x; g.z = pad.z;
  /* 引拍预告：球接近回球点时提前引拍（与实机 try*Hit 的接触窗口一致） */
  if(r.windup && pad.phase === 'ready') beginWindup(pad, pad.stance, 0.5);
}
function aiMove(dt){
  // ★ 右上角模型 = 鼠标上的tt玩家：用训练出的输入级 DQN 驱动（镜像到玩家侧坐标系）
  if(typeof TT_PLAYER !== 'undefined' && TT_PLAYER.isTtSide('ai') && TT_PLAYER.isReady()){
    TT_PLAYER.ttTick(dt, 'ai', aiPad);
    return;
  }
  // ★ 右侧(AI 侧)也用与左侧玩家侧完全相同的移动逻辑（统一到 aiMoveShared）
  // 策略按侧解析：斗蛐蛐右侧 = fightR。原来用 resolvedPolicy()（读顶栏 aiModel），
  // 于是斗蛐蛐里给右侧选什么模型，跑动速度与出球选择都还是顶栏那一档（默认普通 AI）。
  aiMoveShared(dt, aiPad, 'ai', AI_Z, -1.72, -0.92, resolvedPolicyFor('ai'), sideModel('ai'));
}
function demoPlayer(dt){
  const g = playerPad.group.position;
  let target = 0;
  if(ball.active && !ballDead && ball.vel.z>0.15){
    if(elapsed-playerPad.predT > 0.09){ playerPad.predX = predictXAtZ(g.z); playerPad.predT = elapsed; }
    target = playerPad.predX;
  }
  target = clamp(target, -X_CLAMP, X_CLAMP);
  const prevX = g.x;
  g.x += clamp((target-g.x)*7, -2.45, 2.45)*dt;
  playerPad.svx = (g.x-prevX)/Math.max(dt,1e-4); playerPad.svz = 0;
  g.z = PLAYER_Z;
}
/* 斗蛐蛐：左侧（近侧/原玩家侧）由 AI 控制——与右侧共用同一套 aiMoveShared（player 方向） */
function aiMovePlayer(dt){
  if(typeof TT_PLAYER !== 'undefined' && TT_PLAYER.isTtSide('player') && TT_PLAYER.isReady()){
    TT_PLAYER.ttTick(dt, 'player', playerPad);
    return;
  }
  aiMoveShared(dt, playerPad, 'player', PLAYER_Z, 0.92, 1.72, policyForSide('player'), fightL);
}

/* =====================================================================
 *  在线适应玩家：上下文赌博机（Thompson 采样）
 *  · 按来球上下文分桶，每桶在 N 种"打法风格(arm)"间采样
 *  · 每分结束后把本回合 AI 击球归因到对应 arm 并更新奖励（EMA 衰减 0.97）
 *  · 奖励=得分→+1 / 失分→0；localStorage 跨局记忆
 *  · 仅在 mode==='play' 生效（菜单演示保持确定性）
 * ===================================================================== */
const BANDIT_ARMS = [
  { id:'aggro',    bias:{ loop:{prob:0.9}, smash:{prob:0.55}, counter:{prob:0.85}, awayProb:0.85, tzBase:1.0 } },
  { id:'balanced', bias:{} },
  { id:'short',    bias:{ loop:{prob:0.45}, smash:{prob:0.12}, counter:{prob:0.6}, awayProb:0.55, tzBase:0.7 } },
  { id:'wide',     bias:{ awayProb:0.95, txMin:0.42, txRange:0.3, loop:{prob:0.75} } },
];
const BANDIT_KEY = 'tt_bandit_v1';
function banditBucket(ctx){
  const isBack = relTopOf(ctx) < -8;
  const spinCls = isBack ? 'B' : (Math.abs(ctx.sx)>80 ? 'H' : 'L');
  const spdCls = Math.abs(ctx.vz)>4 ? 'F' : (Math.abs(ctx.vz)>2.5 ? 'M' : 'S');
  const lenCls = rallyCount>4 ? 'L' : (rallyCount>1 ? 'M' : 'S');
  return spinCls+spdCls+lenCls;
}
function mergePolicy(base, bias){
  const out = Object.assign({}, base);
  for(const k in bias){
    const v = bias[k];
    if(v && typeof v==='object' && !Array.isArray(v) && out[k] && typeof out[k]==='object'){
      out[k] = Object.assign({}, out[k], v);
    } else out[k] = v;
  }
  return out;
}
const bandit = {
  buckets: {},      // key → { arms:[{n,w}...] }
  rally: [],        // [{bucket, arm}] 本回合 AI 击球（待归因）
  pending: null,    // {bucket, arm} 最近一次决策
  load(){ try{ const s = localStorage.getItem(BANDIT_KEY); if(s) this.buckets = JSON.parse(s); }catch(e){} },
  save(){ try{ localStorage.setItem(BANDIT_KEY, JSON.stringify(this.buckets)); }catch(e){} },
  initBucket(b){
    if(!this.buckets[b]) this.buckets[b] = { arms: BANDIT_ARMS.map(()=>({n:0,w:0})) };
    return this.buckets[b];
  },
  /* 正态近似 Thompson：采样 arm 收益，选最高 */
  sampleArm(st){
    let best = -Infinity, idx = 0;
    for(let a=0;a<st.arms.length;a++){
      const s = st.arms[a];
      const mean = (1+s.w)/(2+s.n);
      const v = Math.max(1e-6, ((1+s.w)*(1+s.n-s.w))/((2+s.n)*(2+s.n)*(3+s.n)));
      const x = mean + gaussOf(Math.random)*Math.sqrt(v);
      if(x>best){ best=x; idx=a; }
    }
    return idx;
  },
  /* 决策用策略：难度基线 + 当前上下文所选 arm 的偏置 */
  policyForContext(ctx){
    if(mode!=='play') return resolvedPolicyFor('ai');
    const bucket = banditBucket(ctx);
    const st = this.initBucket(bucket);
    const arm = this.sampleArm(st);
    this.pending = { bucket, arm };
    return mergePolicy(policyForModel(aiModel), BANDIT_ARMS[arm].bias);
  },
  recordShot(){
    if(mode!=='play' || !this.pending) return;
    this.rally.push(this.pending); this.pending = null;
  },
  onPointEnded(winner){
    if(mode!=='play') return;
    const w = (winner==='ai') ? 1 : 0;
    for(const rec of this.rally){
      const st = this.buckets[rec.bucket];
      if(!st || !st.arms[rec.arm]) continue;
      const s = st.arms[rec.arm];
      s.n = s.n*0.97 + 1; s.w = s.w*0.97 + w;    // EMA 衰减 → 持续适应当前玩家
    }
    this.rally = [];
    this.save();
  },
};
bandit.load();
