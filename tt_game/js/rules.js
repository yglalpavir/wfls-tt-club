/* =====================================================================
 *  rules.js — 规则 / 得分 / 发球
 * ===================================================================== */
'use strict';

/* ---------------- 9. 规则 / 得分 ---------------- */
function nextServer(){
  const total = scoreYou + scoreAi;
  const idx = (scoreYou>=10 && scoreAi>=10) ? total%2 : Math.floor(total/2)%2;
  return idx===0 ? 'player' : 'ai';
}
function pointTo(winner, msg){
  if(mode==='menu'){ ballDead = true; setTimeout(demoServe, 900); return; }
  if(state==='pointPause' || state==='over') return;
  state = 'pointPause'; ballDead = true;
  longestRally = Math.max(longestRally, rallyCount);
  if(typeof bandit!=='undefined') bandit.onPointEnded(winner);   // 在线学习：归因本回合打法
  if(typeof TT_STATS !== 'undefined'){ TT_STATS.sync(); TT_STATS.record(winner, gameTzh(msg)); }   // 实机遥测（唯一可信判据 · 内部口径恒为中文）
  if(winner==='player'){ scoreYou++; flash('you'); toast(gameT('g_toast_point'), gameT(msg), 'you'); playScore(true); }
  else{ scoreAi++; flash('ai'); toast(gameT('g_toast_lost'), gameT(msg), 'ai'); playScore(false); }
  updateScoreUI();
  if((scoreYou>=11 || scoreAi>=11) && Math.abs(scoreYou-scoreAi)>=2){
    state = 'over';
    if(mode==='watch'){   // 斗蛐蛐：记系列胜场 → 5局三胜判定
      if(scoreYou>scoreAi) seriesWinsL++; else seriesWinsR++;
      updateScoreUI();
      if(seriesWinsL>=NEED_WINS || seriesWinsR>=NEED_WINS) setTimeout(fightEnd, 2500);
      else setTimeout(watchRestart, 2500);
    }
    else setTimeout(()=>showEnd(scoreYou>scoreAi), 1100);
    return;
  }
  setTimeout(()=>{ if(state==='pointPause') setupServe(); }, 1500);
}
/* 斗蛐蛐：一大局结束自动开下一大局（5局三胜，不换边） */
function watchRestart(){
  if(mode!=='watch') return;
  scoreYou = scoreAi = 0; longestRally = 0; ballDead = true;
  $('endOverlay').classList.add('hidden'); $('confetti').innerHTML = '';
  updateScoreUI();
  setStatus(()=>gameT('g_st_watch_series', {a: modelLabel(fightL), b: modelLabel(fightR), l: seriesWinsL, r: seriesWinsR}));
  setupServe();
}
function resolveOut(){
  if(ballDead) return;
  let winner, msg;
  if(isServe){ winner = other(server); msg = 'g_msg_serve_out'; }
  else if(shotBouncedOpp){ winner = lastHitter; msg = 'g_msg_no_return'; }
  else{ winner = other(lastHitter); msg = (lastNetBy===lastHitter) ? (willNet ? 'g_msg_rush_net' : 'g_msg_net') : 'g_msg_out'; }
  pointTo(winner, msg);
}
function rulesOnBounce(side){
  if(ballDead) return;
  if(isServe){
    const own = server, opp = other(server);
    if(!serveBouncedOwn){                                        // 尚未首跳
      if(side===own){ serveBouncedOwn = true; return; }          // 首跳己方半台 ✓
      if(netLet){ toast('LET!', gameT('g_msg_let'), 'gold', 1200);
        ballDead = true; state = 'pointPause';
        setTimeout(()=>{ if(state==='pointPause') setupServe(); }, 1300); return; }
      pointTo(opp, 'g_msg_serve_first'); return;          // 首跳落在对方 → 犯规（ITTF 两跳规则的逆转）
    }
    // 已首跳己方：第二次触台应落在对方半台
    if(side===opp){
      if(netLet){ toast('LET!', gameT('g_msg_let'), 'gold', 1200);
        ballDead = true; state = 'pointPause';
        setTimeout(()=>{ if(state==='pointPause') setupServe(); }, 1300); return; }
      isServe = false; shotBouncedOpp = true; canHit[opp] = true;  // 合法发球完成（两跳）
      return;
    }
    pointTo(opp, 'g_msg_serve_twice_own'); return;
  }
  const opp = other(lastHitter);
  if(side===opp){
    if(!shotBouncedOpp){ shotBouncedOpp = true; canHit[side] = true; }
    else pointTo(lastHitter, 'g_msg_double');
  }else{
    pointTo(opp, lastNetBy===lastHitter ? 'g_msg_net' : 'g_msg_not_over');
  }
}

/* ---------------- 10. 发球 ---------------- */
function setupServe(override){
  state = 'awaitServe'; ballDead = false;
  isServe = true; shotBouncedOpp = false; serveBouncedOwn = false; netLet = false; lastNetBy = null;
  canHit.player = canHit.ai = false; rallyCount = 0; updateRallyChip();
  if(typeof TT_PLAYER !== 'undefined') TT_PLAYER.reset();   // 鼠标上的tt玩家：每分重置虚拟拍
  server = override || nextServer();
  updateScoreUI();
  const auto = (mode==='menu' || mode==='watch');   // 观看模式：双方都自动发球
  if(server==='player' && !auto){
    setStatus(()=>gameT('g_st_your_serve'));
  }else{
    setStatus(server==='player' ? (()=>gameT('g_st_serve')) : (()=>gameT('g_st_ai_serve')));
    setTimeout(()=>{ if(state==='awaitServe') startToss(); }, 1000+Math.random()*500);
  }
}
function demoServe(){ demoServer = other(demoServer); setupServe(demoServer); }
function startToss(){
  if(state!=='awaitServe') return;
  state = 'toss';
  const isP = server==='player';
  // 决定发球方案（动画与击球一致）：
  //   · 真人玩家发球（非 watch）：由发球前调好的 serveCfg 决定（旋转类型/侧旋/强度/短长），抛球点随鼠标
  //   · AI 发球 / 斗蛐蛐(watch) 两侧：由各自模型策略随机（与玩家同一套短/长+组合旋转+强度）
  if(isP && mode!=='watch'){
    const c = serveCfg;
    const side = (serveKeys.s?1:0) - (serveKeys.d?1:0);   // S=左旋 D=右旋
    c.side = side;
    servePlan = {
      /* A 键切上下旋（input.js）。下旋原本被硬编码关掉：strikeServe 一直支持
         topSpin===false（topSign=-0.6，下旋取上旋 60% 强度），只是没有任何地方产出它。
         对手侧接下旋的逻辑也一直在（policy.js aiDecision 的 isBack 分支 →
         receive.pushProb 0.62 搓球），此前是死代码。侧旋只在上旋档叠加，切到下旋时清零。 */
      top: c.top !== false,
      side: c.top === false ? 0 : side,
      power: c.power, type: c.type,
      // 抛球点：端线后 + 随鼠标（zy 由鼠标/深度决定，保证端线外）
      tx: clamp(targetX*0.35, -0.4, 0.4),
      tz: clamp(PLAYER_Z + 0.10, TABLE_L/2+0.05, 1.7),   // 端线后
    };
  }else{
    /* 「鼠标上的tt玩家」：发球由 DQN 决定（侧旋/力度来自动作的第五、六维）。
     * 训练侧同构逻辑在 input-sim.js「发球前决策」块——两边必须同一口径。 */
    const ttSide = (mode==='watch' && isP) ? 'player' : 'ai';
    let ttDecide = null;
    if(typeof TT_PLAYER !== 'undefined' && TT_PLAYER.decideServe && TT_PLAYER.isTtSide(ttSide)){
      ttDecide = TT_PLAYER.decideServe();
    }
    if(ttDecide){
      /* 上/下旋由 DQN 决定（动作第四维）；下旋取 strikeServe 的 topSign=-0.6 口径。 */
      servePlan = { top: ttDecide.top !== false, side: 0, power: ttDecide.power,
                    type: 'long', tx: clamp(targetX*0.35, -0.4, 0.4), tz: 0.95 };
    }else{
      const pol = (mode==='watch' && isP) ? policyForSide('player') : resolvedPolicy();
      servePlan = aiServePlan(pol);
    }
  }
  // ITTF：垂直抛球 ≥16cm、无旋转
  ball.vel.set(0, Math.sqrt(2*G*SERVE.TOSS_H), 0);
  ball.spin.set(0,0,0);
  const pad = isP ? playerPad : aiPad;
  pad.serveSide = servePlan.side || 0;                       // 侧旋 → 触球横向扫（仅动画，不影响物理）
  beginWindup(pad, 'serveTop', 0.5);
  playServe();
  setStatus(isP ? (()=>gameT('g_st_toss')) : (()=>gameT('g_st_ai_serve2')));
}
/* solveShot 已移至 simcore.js（SIM.solveShot，浏览器/训练器单一物理源） */
function strikeServe(){
  const isP = server==='player';
  const toward = isP ? -1 : 1;
  // 发球方案由 startToss 决定（动画与击球一致；玩家=发球前调好的 serveCfg，AI=策略）
  const plan = servePlan || { top:true, side:0, power:0.5 };
  const topSpin = plan.top, side = plan.side||0;
  const power = clamp(plan.power==null?0.5:plan.power, 0, 1);
  // 发球旋转/速度倍率（AI 策略 serveSpin/servePace 随 aiServePlan 附带；玩家/缺省 = 1 零回归）
  const sSpin = plan.serveSpin == null ? 1 : plan.serveSpin;
  const sPace = plan.servePace == null ? 1 : plan.servePace;
  const topSign = topSpin === false ? -0.6 : 1;   // topProb<1 → 下旋发球（60% 强度）
  // 统一发球（不再区分短球/急长球）：两跳发球，首跳己方→弹起过网→二跳对方
  //   depth = 第二落点离网深度（≈0.62，深发球），由 SIM.serveShot 两跳解算保证合法且第一跳靠后低平
  const T = SERVE.long;   // 统一参数（short/long 已合并）
  const depth = clamp(T.depth + (Math.random()-0.5)*T.depthJitter, 0.16, 0.95);
  // 旋转：上旋(正)/下旋(负) + 侧旋，强度随 power；玩家与 AI 一致
  const mag = (SERVE.topMag + Math.random()*10) * (0.6 + 0.8*power) * sSpin * topSign;
  const spinX = mag;                                      // 传入 serveShot 的相对旋（正=上旋）
  const sideMag = (side*SERVE.sideMag + (Math.random()-0.5)*6) * (0.6 + 0.8*power) * sSpin;
  const sideY = sideMag;
  let sv = SIM.serveShot(ball.pos, { dir: toward, depth, spinX, sideY, speedMul: sPace });
  // 兜底：若本次旋转组合偶发无解，退回无侧旋/常用深度重试（保证发球总能两跳合法过网）
  if(!sv){ sv = SIM.serveShot(ball.pos, { dir: toward, depth: 0.5, spinX, sideY: 0 }); }
  if(!sv){ sv = SIM.serveShot(ball.pos, { dir: toward, depth: 0.35, spinX: 0, sideY: 0 }); }
  // 最后防线：出球点过于贴边（vx 转向受限）仍可能无解 → 从台面中心打一记中浅无旋发球，绝不崩溃
  if(!sv){ sv = SIM.serveShot({ x: 0, y: ball.pos.y, z: ball.pos.z }, { dir: toward, depth: 0.4, spinX: 0, sideY: 0 }); }
  // 再退一步：出球点本身已偏离合法域（球位被上一帧残留/异常状态污染）时，
  // 用保证有解的规范发球位（端线外 0.5m、台面上 5cm）重试
  if(!sv){ sv = SIM.serveShot({ x: 0, y: TABLE_TOP + 0.05, z: toward < 0 ? TABLE_L/2 + 0.5 : -(TABLE_L/2 + 0.5) }, { dir: toward, depth: 0.4, spinX: 0, sideY: 0 }); }
  if(!sv){
    // 仍无解：不抛出。历史上此处 sv 为 null 会直接 .copy 抛错，异常从 requestAnimationFrame
    // 冒泡会永久终止整个动画循环——游戏冻在发球帧，且球继续自由下落（曾见 pos.y≈-2795）。
    // 现在自愈重排同一发球方的抛球，代价是一个发球周期的延迟，而不是整局卡死。
    if(typeof console !== 'undefined') console.warn('[RULES] strikeServe 无解，重排发球', JSON.stringify({ x: ball.pos.x, y: ball.pos.y, z: ball.pos.z }));
    setupServe(server);
    return;
  }
  ball.vel.copy(sv.vel);
  ball.spin.set(sv.spin.x, sv.spin.y, 0);
  ball.lastStroke = 'forehand';
  willNet = false;
  lastHitter = server; isServe = true; shotBouncedOpp = false; serveBouncedOwn = false;
  canHit.player = canHit.ai = false; rallyCount = 1; updateRallyChip();
  strikeSwing(isP?playerPad:aiPad, 0.5);
  state = 'rally';
  playPaddleHit(0.5);
  setStatus(()=>gameT('g_st_rally'));
}
