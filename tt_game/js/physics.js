/* =====================================================================
 *  physics.js — 物理步进 / 弹跳 / 触网 / 玩家与 AI 击球
 * ===================================================================== */
'use strict';

/* ---------------- 11. 物理步进 ---------------- */
const _prev = new THREE.Vector3(), _mag = new THREE.Vector3();
const _trailCol = new THREE.Color(0xaee2ff);

/* 模拟校验已移至 simcore.js（SIM.simulateShot，浏览器/训练器单一物理源） */
function tableBounce(){
  const v = ball.vel, s = ball.spin;
  v.y = -v.y*REST;
  v.z = v.z*0.99 + s.x*SPIN_KICK;
  v.x = v.x*0.985 - s.y*SPIN_KICK*0.6;
  s.multiplyScalar(0.72);
  spawnRing(ball.pos.x, ball.pos.z);
  playBounce();
  rulesOnBounce(ball.pos.z>0 ? 'player' : 'ai');
}
function checkNet(){
  if(ballDead || state!=='rally') return;
  const p = ball.pos, v = ball.vel;
  const crossed = (_prev.z<0 && p.z>=0) || (_prev.z>0 && p.z<=0);
  if(!crossed) return;
  const t = (0-_prev.z)/(p.z-_prev.z);
  const xC = _prev.x+(p.x-_prev.x)*t, yC = _prev.y+(p.y-_prev.y)*t;
  if(Math.abs(xC) > NET_LEN/2+BALL_R) return;
  if(yC > TABLE_TOP+NET_H+BALL_R*1.5 || yC < TABLE_TOP-0.03) return;
  playNet();
  const back = _prev.z>0 ? 0.035 : -0.035;
  if(yC > TABLE_TOP+NET_H-0.028){
    if(Math.random() < 0.55){
      v.z *= 0.44; v.y = Math.min(v.y,0.25)*0.5+0.1; v.x *= 0.72;
      if(isServe) netLet = true;
      toast('擦网!', 'NET CORD', 'gold', 900);
    }else{ p.z = back; v.z *= -0.16; v.y *= 0.35; v.x *= 0.6; lastNetBy = lastHitter; }
  }else{
    p.z = back; v.z *= -0.13; v.y *= 0.42; v.x *= 0.55; lastNetBy = lastHitter;
  }
}
function afterHit(side){
  lastHitter = side; isServe = false; shotBouncedOpp = false;
  canHit.player = canHit.ai = false;
  rallyCount++; updateRallyChip();
  const pad = side==='player' ? playerPad : aiPad;
  strikeSwing(pad);
  showHitMarker(side==='ai');   // 触球瞬间屏幕十字命中标记
  flashSpr.material.color.set(0xfff2c8);
  flashSpr.position.copy(ball.pos); flashLife = 1;
}
/* 相对上旋（方向无关）：正=上旋 / 负=下旋
   注：出球核心封装在 SIM.resolveHit（玩家与 AI 共用 strokePowerOf 逻辑），
       本文件不再需要独立的 strokePower。 */
function relTop(){ return ball.spin.x * Math.sign(ball.vel.z || 1); }
/* 玩家正/反手自动选择 v2.2：触球时刻几何 + 情境偏置 + 不确定度自适应（算法核心在
   simcore.js#resolveStance，实机/训练器/AI 单一逻辑源；本函数只做预测缓存与状态写入）。
   玩家姿态的唯一所有者：menu/play/watch 全模式都经此更新 playerStance 与 playerPad.stance。
   预测击球点缓存随 TTC 自适应（远球省 CPU / 贴脸逐帧精判，predictXAtZ 是前向模拟 CPU 热点）；
   无来球（还原期）时 resolveStance 直接保持当前姿态——真人回中还原，不跟远处球位乱切。
   触球前 commitT 秒内锁姿态（挥拍已启动）；引拍期间不锁——磁吸会提前引拍，
   逐帧重估才能在球掠过体线时跟随切换（翻面动画逐帧插值，视觉自然）。
   gvx 传平滑拍速（main.js#playerControl 维护 playerPad.svx）：对触球瞬间的拍球
   相对位置决策，拍子追球不再把信号扫过分界线。 */
let _spBX = 0, _spT = -1;   // 预测击球点缓存
function autoStance(){
  const g = playerPad.group.position;
  let inbound = false, commit = false, bx = ball.pos.x, ttc = null;
  if(ball.active && !ballDead && ball.vel.z > 0.15){
    inbound = true;
    ttc = (g.z - ball.pos.z) / ball.vel.z;            // 球到拍面平面的预计时间（分子分母同号）
    const cacheT = ttc > 0 ? clamp(ttc * 0.25, 0.016, 0.05) : 0.05;   // 自适应缓存窗口
    if(elapsed - _spT >= cacheT){
      _spT = elapsed;
      _spBX = SIM.predictXAtZ(ball.pos, ball.vel, ball.spin, g.z);
    }
    bx = _spBX;
    commit = ttc > 0 && ttc < STANCE.commitT;
  }
  const st = SIM.resolveStance({ bx, gx: g.x, gz: g.z, cur: playerStance,
    lastSwitch: playerPad.stanceT, now: elapsed, inbound, commit,
    gvx: playerPad.svx || 0, ttc, ballY: ball.pos.y, spinY: ball.spin.y });
  if(st !== playerStance){
    playerStance = st;
    playerPad.stance = st;      // stanceT：供磁吸过渡成本（stanceRampOf）与 minHold 读取
    playerPad.stanceT = elapsed;
  }
  return st;
}
/* 搓球握法：按住Ctrl + 下旋来球 → 左半台(反手位)自动倒板反手搓，右半台正手搓；否则按握法 */
function pushStanceOf(){
  if(ctrlHold && relTop() < -8){
    return (ball.pos.x >= playerPad.group.position.x) ? 'backhand' : 'forehand';
  }
  return autoStance();
}
/* 撞网轨迹已移至 simcore.js（SIM.makeNetShot） */
/* 玩家击球：改为调用共享出球核心 SIM.resolveHit（AI 也调同一个 → 100% 对称）
   正手重旋紧拟合 / 反手快撕借力 / 下旋搓拉 / 正反手爆扣爆抽 / 正手爆冲 */
function hitPlayer(){
  const g = playerPad.group.position;
  // 保存来球状态（行为记录用）
  const inVx = ball.vel.x, inVy = ball.vel.y, inVz = ball.vel.z, inSpinX = ball.spin.x, inSpinY = ball.spin.y;
  // 前冲力度：0=挡拍 1=前冲（menu 演示强制 0.75）——与 AI 共用同一公式
  const fwd = mode==='menu' ? 0.75 : clamp(-playerPad.svz/7, 0, 1);
  // 调用共享出球核心（与 AI 完全相同）——含爆扣/爆抽/爆冲/快撕/搓球/拉球全部判定
  const r = SIM.resolveHit({
    stroke: playerStance,
    pos: { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z },
    vel: { x: inVx, y: inVy, z: inVz },
    spin: { x: inSpinX, y: inSpinY, z: 0 },
    swipe: playerPad.svx,
    fwd,
    mouseNy,
    aim: { x: aim.x, z: aim.z, gx: g.x },
    ctrlHold,
    dir: -1,
    applyArcAdj: mode==='play',
  });
  const isPush = r.mode==='push', isSmash = r.mode==='smash', isCounter = r.mode==='counter', isLoop = r.mode==='loop', isBack = r.mode==='lift';
  const { pace, topMag, side, ax, aimZ, outVel, spin } = r;
  ball.vel.set(outVel.x, outVel.y, outVel.z);
  ball.spin.set(spin.x, spin.y, 0);
  ball.lastStroke = r.stroke;
  willNet = r.netOut;
  playerPad.power = r.power;
  playerPad.swingType = r.swingType;
  playerPad.recover = r.recover;
  afterHit('player');
  /* 落点误差模型的唯一所有者是 ai.js 的 aiMoveShared（pad._xErr）。
   * 此处原先算出的 aiPosErr 从未被任何地方读取——是死代码，已删。
   * 历史上还在这里按阶梯 moveErr 覆盖 baseErr，同样零效果；难度差异现在
   * 由 aiMoveShared 在每板来球的上升沿读取 policyForModel().moveErr 实现。 */
  const pw = clamp(pace/6.5, 0.3, 1);
  if(isPush) playStroke(r.stroke, Math.max(pw, 0.45));
  else playStroke(r.stroke, isCounter ? Math.max(pw, 0.75) : pw);
  const rpm = Math.round(Math.abs(r.relOut)*9.55/10)*10;
  if(isPush){ toast('搓球!', 'PUSH · 下旋低平', 'you', 700); }
  else if(isSmash){
    toast(r.stroke==='forehand' ? '正手爆扣!' : '反手爆抽!', (r.stroke==='forehand'?'FH SMASH':'BH SMASH')+' · '+Math.round(pace*3.6)+' km/h', 'you', 900);
    shake = Math.max(shake, 0.08); fovKick = Math.max(fovKick, 5.0);
  }
  else if(isCounter){
    toast('快撕反击!', 'BACKHAND COUNTER · '+Math.round(pace*3.6)+' km/h', 'you', 900);
    flashSpr.material.color.set(0x9fe8ff);
    shake = Math.max(shake, 0.045); fovKick = Math.max(fovKick, 2.8);
  }
  else if(isLoop){ toast('正手爆冲!', 'POWER LOOP · '+rpm+' RPM', 'you', 900); shake = Math.max(shake, 0.05); fovKick = Math.max(fovKick, 3.2); }
  else if(Math.abs(side)>SPIN.toastThresh){ toast('强侧旋!', playerPad.svx<0?'左拐 LEFT CURVE':'右拐 RIGHT CURVE', 'gold', 800); playSwipe(clamp(Math.abs(side)/SPIN.sideCap,0.5,1)); }
  else if(r.stroke==='forehand' && pace>4.6 && topMag>140){ toast('正手爆冲!', 'POWER LOOP · '+rpm+' RPM', 'you', 800); fovKick = Math.max(fovKick, 2.2); }
  else if(r.stroke==='backhand' && pace>4.3) toast('反手快撕!', 'BACKHAND SNAP', 'you', 800);
  else if(r.stroke==='backhand' && Math.abs(ax)>0.68) toast('大角度!', 'WIDE ANGLE', 'gold', 700);
  smEl.classList.remove('pop'); void smEl.offsetWidth; smEl.classList.add('pop');
  // ★ 记录玩家行为：来球情境 + 出球动作（训练"玩家模型"作为 AI 对手）
  if(typeof PLAYER_LOG !== 'undefined' && mode==='play'){
    PLAYER_LOG.push({
      t: Math.round(elapsed*1000),
      ctx: { stroke: r.stroke, bx: ball.pos.x, by: ball.pos.y, bz: ball.pos.z,
             vx: inVx, vy: inVy, vz: inVz, sx: inSpinX, sy: inSpinY },
      act: { mode: r.mode,
             pace: r.pace, arc: r.arc, relOut: r.relOut, side: r.side, fwd,
             tx: ax, tz: aimZ,
             outVel: { x: ball.vel.x, y: ball.vel.y, z: ball.vel.z },
             spin: { x: ball.spin.x, y: ball.spin.y } },
    });
  }
}
/* ★ AI 击球：与玩家对称 —— 正手重旋爆冲 / 机会球扣杀 / 反手快撕借力 / 下旋搓拉
   决策逻辑已抽到 policy.js#aiDecision（纯函数，浏览器与训练器共用；默认策略=原硬编码值） */
function hitAI(){
  const g = aiPad.group.position;
  // ★ 鼠标上的tt玩家：击球由输入级 DQN 管线产出（hitShot 同构），其余动画/音效照旧
  if(typeof TT_PLAYER !== 'undefined' && TT_PLAYER.isReady() && TT_PLAYER.isTtSide('ai')){
    const stroke = aiPad.stance;
    aiPad.flipTarget = stroke==='backhand' ? 1 : 0;
    aiPad.strokeT = elapsed;
    if(TT_PLAYER.ttHit('ai', aiPad)){
      afterHit('ai');
      playStroke(stroke, 0.6);
      return;
    }
  }
  const stroke = aiPad.stance;   // 姿态由 aiMoveShared resolveStance 维护（AI 右手侧 = -X）
  aiPad.flipTarget = stroke==='backhand' ? 1 : 0;                // 翻拍 = 出球预告
  aiPad.strokeT = elapsed;
  willNet = false;
  const ctx = {
    stroke,
    bx:ball.pos.x, by:ball.pos.y, bz:ball.pos.z,
    vx:ball.vel.x, vy:ball.vel.y, vz:ball.vel.z,
    sx:ball.spin.x, sy:ball.spin.y,
    aiX:g.x, playerX:playerPad.group.position.x,
    svx:aiPad.svx, svz:aiPad.svz,          // 拍面真实横滑/前冲（与玩家 playerPad.svx/svz 同源）
    receive: rallyCount<=1 && lastHitter!=='ai',   // 接发球板（AI 刚发完球时 lastHitter==='ai'）
  };
  const d = aiDecision(ctx, bandit.policyForContext(ctx));
  bandit.recordShot();
  ball.vel.set(d.outVel.x, d.outVel.y, d.outVel.z);
  ball.spin.set(d.fx, d.fy, 0);
  ball.lastStroke = 'ai-'+stroke;
  willNet = d.netOut;                                           // 抢点下网标记（resolveOut 读）
  aiPad.power = d.power;
  afterHit('ai');
  aiPad.swingType = d.swingType;                                // 搓球用放平拍动画
  playStroke(stroke, d.playSoundPower);
  // 播报
  if(d.mode==='push') toast('AI搓球!', 'AI PUSH · 下旋低平', 'ai', 700);
  else if(d.mode==='lift') toast('AI拉球!', 'AI LOOP UP', 'ai', 700);
  else if(d.mode==='counter') toast('AI快撕!', 'AI COUNTER · '+Math.round(d.pace*3.6)+' km/h', 'ai', 800);
  else if(d.mode==='loop' && d.relOut>150) toast('AI正手爆冲!', 'HEAVY LOOP · 反手快撕可破', 'ai', 900);
  else if(d.mode==='smash'){ toast('AI扣杀!', 'AI SMASH', 'ai', 700); shake = Math.max(shake, 0.045); fovKick = Math.max(fovKick, 2.6); }
}
/* 斗蛐蛐：左侧（近侧/原玩家侧）也由 aiDecision 回球（dir=-1 向 -Z；两 AI 各用所选模型） */
function hitAIForPlayer(){
  const g = playerPad.group.position;
  // ★ 鼠标上的tt玩家（斗蛐蛐左侧）：用同款输入级 DQN 玩家管线（无需镜像，本侧即玩家侧）
  if(typeof TT_PLAYER !== 'undefined' && TT_PLAYER.isReady() && TT_PLAYER.isTtSide('player')){
    const stroke = playerPad.stance;
    playerPad.flipTarget = stroke==='backhand' ? 1 : 0;
    playerPad.strokeT = elapsed;
    if(TT_PLAYER.ttHit('player', playerPad)){
      afterHit('player');
      playStroke(stroke, 0.6);
      return;
    }
  }
  const stroke = playerPad.stance;   // 斗蛐蛐左侧姿态与玩家侧同源（autoStance 维护）
  playerPad.flipTarget = stroke==='backhand' ? 1 : 0;
  playerPad.strokeT = elapsed;
  willNet = false;
  const ctx = {
    stroke,
    bx:ball.pos.x, by:ball.pos.y, bz:ball.pos.z,
    vx:ball.vel.x, vy:ball.vel.y, vz:ball.vel.z,
    sx:ball.spin.x, sy:ball.spin.y,
    aiX:g.x, playerX:aiPad.group.position.x,
    dir:-1,
    svx:playerPad.svx, svz:playerPad.svz,      // 拍面真实横滑/前冲（与玩家同源）
    receive: rallyCount<=1 && lastHitter!=='player',   // 接发球板（本侧刚发完球时不判接发）
  };
  const d = aiDecision(ctx, policyForSide('player'));
  ball.vel.set(d.outVel.x, d.outVel.y, d.outVel.z);
  ball.spin.set(d.fx, d.fy, 0);
  ball.lastStroke = stroke;
  willNet = d.netOut;
  playerPad.power = d.power;
  afterHit('player');
  playerPad.swingType = d.swingType;
  playStroke(stroke, d.playSoundPower);
}
function tryPlayerHit(){
  if(lastHitter==='player' || !canHit.player) return;
  const st = STROKE[pushStanceOf()];                               // 搓球用对应半台握法（左半台反手倒板）
  const pushF = (ctrlHold && relTop() < -8) ? PUSH.fit : null;     // 按住Ctrl搓球：拟合放宽（更容易）
  const high = ball.pos.y > TABLE_TOP + 0.13;                      // 半高球（阈值降低到 2/3）→ 爆扣/爆抽几乎必中
  // 来球质量压力：球速越快/旋转越强 → 接球拟合越紧（更难接好）
  const inQual = clamp((Math.abs(ball.vel.z) * 0.06 + Math.abs(ball.spin.x) * 0.002 + Math.abs(ball.spin.y) * 0.002) - 0.15, 0, 0.35);
  const fitV = pushF ? st.forgiveV + pushF.v : (high ? st.forgiveV + 0.30 : Math.max(st.forgiveV - inQual, 0.04));
  const fitH = pushF ? st.forgiveH + pushF.h : (high ? st.forgiveH + 0.16 : Math.max(st.forgiveH - inQual * 0.5, 0.02));
  const fitZ = pushF ? st.forgiveZ + pushF.z : (high ? st.forgiveZ + 0.12 : Math.max(st.forgiveZ - inQual * 0.4, 0.02));
  const g = playerPad.group.position, plane = g.z-PAD_HD;
  const zF = fitZ || 0.05;                    // 前后拟合：z 方向容错
  const swept = (_prev.z<=plane+zF && ball.pos.z>plane-zF && ball.vel.z>0);
  const prox  = Math.abs(ball.pos.z-g.z)<PAD_HD+BALL_R*2+zF && ball.vel.z>-0.3;
  if(!(swept||prox)) return;
  if(Math.abs(ball.pos.x-g.x)>PAD_HW+BALL_R+fitH) return;
  if(Math.abs(ball.pos.y-g.y)>PAD_HH+BALL_R+fitV) return;
  ball.pos.z = plane-BALL_R;
  if(mode==='watch') hitAIForPlayer(); else hitPlayer();
  noteContact('player');
}
function tryAIHit(){
  if(lastHitter==='ai' || !canHit.ai) return;
  // ★ 与玩家对称：AI 接球拟合使用同一套 STROKE 容错 + 来球质量压力 + 半高/搓球增强
  const stance = aiPad.stance;   // 姿态由 aiMoveShared resolveStance 维护
  const st = STROKE[stance];
  const isBack = relTop() < -8;
  const pushF = isBack ? PUSH.fit : null;                        // AI 下旋来球自动获得搓球拟合（等效按住 Ctrl；原恒为 null 的死分支已修复）
  const high = ball.pos.y > TABLE_TOP + 0.13;                    // 半高阈值与玩家一致
  const inQual = clamp((Math.abs(ball.vel.z) * 0.06 + Math.abs(ball.spin.x) * 0.002 + Math.abs(ball.spin.y) * 0.002) - 0.15, 0, 0.35);
  const fitV = pushF ? st.forgiveV + pushF.v : (high ? st.forgiveV + 0.30 : Math.max(st.forgiveV - inQual, 0.04));
  const fitH = pushF ? st.forgiveH + pushF.h : (high ? st.forgiveH + 0.16 : Math.max(st.forgiveH - inQual * 0.5, 0.02));
  const fitZ = pushF ? st.forgiveZ + pushF.z : (high ? st.forgiveZ + 0.12 : Math.max(st.forgiveZ - inQual * 0.4, 0.02));
  const g = aiPad.group.position, plane = g.z+PAD_HD;
  const zF = fitZ || 0.05;
  const swept = (_prev.z>=plane+zF && ball.pos.z<plane-zF && ball.vel.z<0);
  const prox  = Math.abs(ball.pos.z-g.z)<PAD_HD+BALL_R*2+zF && ball.vel.z<0.3;
  if(!(swept||prox)) return;
  if(Math.abs(ball.pos.x-g.x)>PAD_HW+BALL_R+fitH) return;
  if(Math.abs(ball.pos.y-g.y)>PAD_HH+BALL_R+fitV) return;
  ball.pos.z = plane+BALL_R;
  hitAI();
  noteContact('ai');
}
/* 记一次成功触球。两侧都记——否则对手侧的 contacts 永远是 0，
   实机遥测会显示"对手从未回球"，把模型的真实回球率测成不可解读的数。
   DQN 侧不在此记：ttHit 自己记，且要带擦网标记。 */
function noteContact(side){
  if(typeof TT_STATS === 'undefined' || typeof TT_PLAYER === 'undefined') return;
  if(TT_PLAYER.isTtSide(side)) return;
  TT_STATS.noteHit(side, false);
}
function physicsStep(dt){
  const p = ball.pos, v = ball.vel, s = ball.spin;
  // NaN 护栏：物理状态异常时按失误结算，避免球卡死/乱飞
  if(!Number.isFinite(p.x+p.y+p.z+v.x+v.y+v.z+s.x+s.y)){
    if(state==='rally' && !ballDead){ ballDead = true; resolveOut(); }
    return;
  }
  if(state==='toss'){
    v.y -= G*dt; p.addScaledVector(v, dt);
    if(v.y<0 && p.y <= PADDLE_Y+0.10) strikeServe();
    return;
  }
  _prev.copy(p);
  v.y -= G*dt;
  v.multiplyScalar(Math.max(0, 1-AIR*dt));
  _mag.copy(s).cross(v).multiplyScalar(MAGNUS*dt); v.add(_mag);
  p.addScaledVector(v, dt);
  s.multiplyScalar(Math.max(0, 1-0.05*dt));
  if(state==='rally' && !ballDead){
    const stP = STROKE[playerStance];
    if(canHit.player && v.z>0 && p.z>(playerStance==='forehand'?0.3:0.45)){
      // 搓球拟合：按住Ctrl + 来球下旋 → 磁吸更强、引拍用放平拍
      const pushF = (ctrlHold && relTop() < -8) ? PUSH.fit : null;
      const high = p.y > TABLE_TOP + 0.13;                         // 半高球（阈值降低到 2/3）→ 磁吸更强（爆扣/爆抽几乎必中）
      if(playerPad.phase==='ready') beginWindup(playerPad, pushF ? 'push' : playerStance, pushF ? 0.5 : 0.55);
      // 姿态切换过渡成本：刚换握的 0.18s 内磁吸打折（换握/转腰未到位），线性恢复
      const mag = (stP.magnet + (pushF ? pushF.mag : 0) + (high ? 1.2 : 0)) * SIM.stanceRampOf(playerPad.stanceT, elapsed);
      v.x += clamp(playerPad.group.position.x-p.x, -0.7, 0.7)*ASSIST.magnetPull*mag*dt;
      // 前后拟合：短球在球拍前方时向球拍深度凑近，避免漏球
      const zAhead = playerPad.group.position.z - p.z;
      if(zAhead>0.05) v.z += clamp(zAhead*0.5, 0, 0.45)*ASSIST.magnetPull*mag*0.55*dt;
      // 高度拟合：半高球向下吸向拍面（扣球更容易够到）
      if(high && p.y > playerPad.group.position.y){
        const yGap = playerPad.group.position.y - p.y;             // 负（球高于拍面）
        v.y += clamp(yGap*0.4, -0.35, 0)*ASSIST.magnetPull*mag*0.4*dt;
      }
    }
    if(canHit.ai && v.z<0 && p.z<-ASSIST.magnetRangeZ){
      // ★ 与玩家对称：AI 磁吸用同侧 STROKE.magnet + 半高增强（镜像 -Z）+ 同款切换过渡成本
      const stA = STROKE[aiPad.stance];
      const highA = p.y > TABLE_TOP + 0.13;
      const magA = (stA.magnet + (highA ? 1.2 : 0)) * SIM.stanceRampOf(aiPad.stanceT, elapsed);
      v.x += clamp(aiPad.group.position.x-p.x, -0.7, 0.7)*ASSIST.magnetPull*magA*dt;
      // 半高球向下吸向拍面（与玩家侧对称）
      if(highA && p.y > aiPad.group.position.y){
        const yGapA = aiPad.group.position.y - p.y;
        v.y += clamp(yGapA*0.4, -0.35, 0)*ASSIST.magnetPull*magA*0.4*dt;
      }
      // 前后拟合：深球在球拍后（-Z 侧）时向球拍深度凑近（镜像玩家 zAhead）
      const zBehind = aiPad.group.position.z - p.z;               // 负（球在拍后/+Z 方向）
      if(zBehind<-0.05) v.z += clamp(-zBehind*0.5, 0, 0.45)*ASSIST.magnetPull*magA*0.55*dt;
    }
  }
  if(v.y<0 && p.y-BALL_R<=TABLE_TOP && _prev.y-BALL_R>TABLE_TOP-0.05
     && Math.abs(p.x)<=TABLE_W/2+BALL_R*0.6 && Math.abs(p.z)<=TABLE_L/2+BALL_R*0.6){
    p.y = TABLE_TOP+BALL_R; tableBounce();
  }
  checkNet();
  if(state==='rally' && !ballDead){ tryPlayerHit(); tryAIHit(); }
  if(!ballDead){
    if(p.y<=BALL_R && v.y<0){ p.y = BALL_R; resolveOut(); }
    else if(Math.abs(p.x)>7.5 || Math.abs(p.z)>7.5 || p.y<-0.5) resolveOut();
  }else{
    if(p.y<=BALL_R && v.y<0){ p.y=BALL_R; v.y=-v.y*0.5; v.x*=0.72; v.z*=0.72; }
  }
}
