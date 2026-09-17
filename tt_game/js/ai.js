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
  const toward = side==='player' ? 1 : -1;     // 玩家侧接 +Z 来球，AI 侧接 -Z 来球
  let targetX = 0, targetZ = zHome;
  const inbound = ball.active && !ballDead && toward*ball.vel.z > 0.15;
  if(!inbound) pad._inbound = false;
  if(inbound){
    /* 新一板来球抽一次落点 X 预测偏差，与仿真 aiReach 的 errS 同义（input-sim.js）。
     * 历史上实机对手 X 轴零误差——阶梯最狠的 moveErr 轴（0.06→0.004）只在仿真里生效，
     * "极端"对手在实机并没有更精准。只在上升沿抽一次，避免 90ms 刷新退化成随机游走。 */
    if(!pad._inbound){
      pad._inbound = true;
      const base = (typeof policyForModel === 'function') ? get(policyForModel(precModel), 'moveErr', 0.06) : 0.06;
      const amp  = Math.abs(ball.spin.x)*0.0011 + Math.abs(ball.spin.y)*0.0006
                 + Math.max(0, Math.abs(ball.vel.z) - 4)*0.05;
      pad._xErr  = gauss() * (base + amp);
      pad._wrapDone = false; pad._wrapOn = false;    // 侧身判定每板重置
      pad._strokeSwitches = 0;                       // 一板一次切换预算（AI 承诺机制）
      if(pad._nz){ pad._nz.v = 0; pad._nz.t = -1; }  // OU 决策噪声每板重启（不带着上一板的犹豫）
    }
    const ttc0 = (g.z - ball.pos.z) / ball.vel.z;   // 球到拍面平面时间（分子分母同号）
    if(elapsed-pad.predT > clamp(ttc0 > 0 ? ttc0*0.25 : 0.09, 0.016, 0.09)){   // 缓存随 TTC 自适应
      pad.predX = predictXAtZ(g.z);                 // 用当前拍面 z 预测 x
      const m = SIM.predictMeetZ(ball.pos, ball.vel, ball.spin, side, PADDLE_Y-0.235, PADDLE_Y+0.235, zLo, zHi);
      pad.predZ = m ? m.z : zHome;
      pad.predT = elapsed;
    }
    targetX = pad.predX;
    targetZ = pad.predZ;
    /* 正/反手姿态（仅 AI 侧）：用 predX 预测击球点决策，触球时刻几何/横向趋势/方向
       不对称滞回/OU 平滑噪声/软承诺全在 SIM.resolveStance（v2.3）。玩家侧姿态由
       autoStance 唯一所有——watch 模式本函数也驱动 playerPad，但不得碰它的姿态。 */
    if(side === 'ai' && !pad._wrapOn){
      const ttc = ttc0;                             // 球到拍面平面时间（上面已算）
      const fhPref = get(policy, 'fhPref', 1);        // 策略可下调正手偏好（均衡型选手）
      const st = SIM.resolveStance({ bx: pad.predX, gx: g.x, gz: g.z, cur: pad.stance,
        lastSwitch: pad.stanceT, now: elapsed, inbound: true,
        commit: ttc > 0 && ttc < SIM.commitTOf(pad.stance, ball.vel.z),
        strokeSwitches: pad._strokeSwitches || 0,
        gvx: pad.svx || 0, bvx: ball.vel.x, ttc, ballY: ball.pos.y, spinY: ball.spin.y, fhPref,
        noiseBox: (pad._nz || (pad._nz = { v: 0, t: -1 })) });
      if(st !== pad.stance){ pad.stance = st; pad.stanceT = elapsed; pad._strokeSwitches = (pad._strokeSwitches || 0) + 1; }
      // 侧身正手（wrap around）：反手位球、距离适中 → 每板一次评估（v2.2：SIM.wrapProb
      // 按"侧身可行性×来球速度"调制概率，替代静态抽签）。本板锁定（_wrapOn），跳过后续逐帧重评估。
      if(!pad._wrapDone){
        pad._wrapDone = true;
        const W = (typeof STANCE !== 'undefined') ? STANCE.wrap : null;
        const dx = pad.predX - g.x;                 // 反手位 = 球在拍 +X 侧（-X 为正手位）
        if(W && W.prob > 0 && pad.stance === 'backhand' && dx > W.distMin && dx < W.distMax
           && Math.random() < SIM.wrapProb({ ttc, dx, vz: ball.vel.z, W, fhPref })){
          pad.stance = 'forehand'; pad.stanceT = elapsed;
          pad._wrapOn = true;
        }
      }
    }
    // AI 引拍预告：球接近回球点时提前引拍（phase 去重；与实机 try*Hit 的接触窗口一致）
    if(lastHitter!==side && pad.phase==='ready'){
      const ttc = toward>0 ? (g.z - ball.pos.z)/ball.vel.z : (ball.pos.z - g.z)/-ball.vel.z;
      if(ttc>0 && ttc<0.16){
        beginWindup(pad, pad.stance, 0.5);
      }
    }
  }else if(ball.active && !ballDead){ targetX = g.x*0.9; targetZ = zHome; }
  /* 一分之间（无活球）超过 resetHold 秒 → AI 也回正手基准握法（v2.3 还原归位，
     与玩家侧 autoStance 同源；仅 AI 侧——watch 模式 playerPad 姿态归 autoStance 所有） */
  if(side === 'ai' && !inbound){
    const st0 = SIM.resolveStance({ bx: g.x, gx: g.x, gz: g.z, cur: pad.stance,
      lastSwitch: pad.stanceT, now: elapsed, inbound: false,
      idle: !ball.active || ballDead });
    if(st0 !== pad.stance){ pad.stance = st0; pad.stanceT = elapsed; }
  }
  if(!Number.isFinite(targetX)) targetX = 0;                 // NaN 护栏
  if(!Number.isFinite(targetZ)) targetZ = zHome;
  targetX = clamp(targetX + (pad._xErr || 0), -X_CLAMP, X_CLAMP);   // 含本板落点预测偏差
  targetZ += gauss()*0.05*diffPrecision(precModel);          // z 预测误差（按本侧模型）
  targetZ = clamp(targetZ, zLo, zHi);                        // 前后范围左右镜像对称（各 0.4m 前扑/后退）
  const spd = get(policy,'moveSpeed',2.45), zSpd = get(policy,'moveZ',2.0);
  const rPace = get(policy,'recoverPace',7);   // 跟随/回位速度（42 维扩容：原常数 7 参数化）
  const prevX = g.x, prevZ = g.z;
  g.x += clamp((targetX-g.x)*rPace, -spd, spd)*dt;
  g.z += clamp((targetZ-g.z)*rPace, -zSpd, zSpd)*dt;
  pad.svx = (g.x-prevX)/Math.max(dt,1e-4);
  pad.svz = (g.z-prevZ)/Math.max(dt,1e-4);
}

function aiMove(dt){
  // ★ 右上角模型 = 鼠标上的tt玩家：用训练出的输入级 DQN 驱动（镜像到玩家侧坐标系）
  if(typeof TT_PLAYER !== 'undefined' && TT_PLAYER.isTtSide('ai') && TT_PLAYER.isReady()){
    TT_PLAYER.ttTick(dt, 'ai', aiPad);
    return;
  }
  // ★ 右侧(AI 侧)也用与左侧玩家侧完全相同的移动逻辑（统一到 aiMoveShared）
  aiMoveShared(dt, aiPad, 'ai', AI_Z, -1.72, -0.92, resolvedPolicy(), sideModel('ai'));
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
    if(mode!=='play') return resolvedPolicy();
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
