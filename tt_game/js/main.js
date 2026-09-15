/* =====================================================================
 *  main.js — 主循环 / 渲染 / 启动
 * ===================================================================== */
'use strict';

/* ---------------- 14. 主循环 ---------------- */
const clock = new THREE.Clock();
let elapsed = 0, camX = 0, fovKick = 0;   // fovKick: 扣杀/爆冲 FOV 冲击
/* predictMeetZ 是前向物理模拟(CPU 热点):结果缓存,≥40ms 才重算一次(effZ 有平滑,手感不变) */
let meetCache = null, meetT = -1;
function playerControl(dt){
  const g = playerPad.group.position;
  const prevX = g.x, prevZ = g.z;
  playerPad.recover = Math.max(0, playerPad.recover-dt);
  const rate = playerPad.recover>0 ? 9 : 18;
  // —— Z 深度映射中心随球偏移（拟合：短球中心前移 / 深球后移，鼠标仍主导微调）——
  let effZ = targetZ;
  if(mode==='play' && ball.active && !ballDead && ball.vel.z > 0.5){
    if(elapsed - meetT >= 0.04){
      meetT = elapsed;
      meetCache = SIM.predictMeetZ(ball.pos, ball.vel, ball.spin, 'player',
                                   PADDLE_Y-0.235, PADDLE_Y+0.235, 0.92, 1.72);
    }
    const meet = meetCache;
    if(meet){
      const fitW = clamp(0.25 + (ball.vel.z-1)*0.03, 0.2, 0.5);   // 球越快 → 拟合越强
      effZ = clamp(PLAYER_Z + (targetZ - PLAYER_Z) + (meet.z - PLAYER_Z)*fitW, 0.92, 1.72);
    }
  }
  g.x += (targetX-g.x)*Math.min(1, dt*rate);
  g.z += (effZ-g.z)*Math.min(1, dt*rate*0.7);
  playerPad.svx += (clamp((g.x-prevX)/Math.max(dt,1e-4),-7,7)-playerPad.svx)*Math.min(1,dt*12);
  playerPad.svz += (clamp((g.z-prevZ)/Math.max(dt,1e-4),-7,7)-playerPad.svz)*Math.min(1,dt*12);
}
function updateAimReticle(dt){
  computeAim();
  const showAim = mode==='play' && (state==='rally' ||
    ((state==='awaitServe'||state==='toss') && server==='player'));
  aimGroup.visible = showAim;
  if(!showAim) return;
  aimGroup.position.x += (aim.x-aimGroup.position.x)*Math.min(1, dt*12);
  aimGroup.position.z += (aim.z-aimGroup.position.z)*Math.min(1, dt*12);
  const hot = canHit.player ? 1 : 0.45;
  const pulse = 1 + Math.sin(elapsed*(canHit.player?10:5))*0.06;
  aimGroup.scale.set(pulse*(canHit.player?1.08:1), 1, pulse*(canHit.player?1.08:1));
  const depthT = clamp((aim.z-AIM.zDeep)/(AIM.zShort-AIM.zDeep), 0, 1);
  const deepCol = playerStance==='backhand' ? _cBhDeep : _cFhDeep;
  aimMatOuter.color.lerpColors(deepCol, _cShort, depthT);
  aimMatOuter.opacity = 0.9*hot; aimMatTick.opacity = 0.75*hot;
  aimMatInner.opacity = 0.85*hot; aimMatDot.opacity = 0.95*hot;
  const zone = aim.z < -0.85 ? 'deep' : 'short';
  if(zone!==lastZone && state==='rally'){
    lastZone = zone;
    setStatus(zone==='deep' ? '回合进行中 · 压深压制' : '回合进行中 · 摆短控制');
  }
}
/* 挥拍条:量化 + 脏检查,值变化才写 style;颜色/发光用 .neg 类切换(见 hud.css) */
let smQ = NaN, smNeg = null, smTxt = '';
function updateSpinMeter(){
  const sw = clamp(playerPad.svx/6, -1, 1);
  const neg = sw<0;
  const q = Math.round(sw*25);            // 量化到 0.04 步长,配合 CSS 过渡依旧平滑
  if(q !== smQ){
    smQ = q;
    const w = Math.abs(q)/25*50;
    smFill.style.width = w+'%';
    smFill.style.left = neg ? (50-w)+'%' : '50%';
  }
  if(neg !== smNeg){ smNeg = neg; smFill.classList.toggle('neg', neg); }
  const txt = Math.abs(playerPad.svx)>0.8 ? (neg?'◀ 左旋蓄力':'右旋蓄力 ▶') : '横向滑动蓄力';
  if(txt !== smTxt){ smTxt = txt; smVal.textContent = txt; }
}
let counterOn = null;
function updateCounterHint(){
  const on = mode==='play' && state==='rally' && !ballDead && lastHitter==='ai'
    && ball.spin.x > COUNTER.spinThresh && ball.vel.z > 0 && playerStance==='backhand';
  if(on !== counterOn){ counterOn = on; counterHintEl.classList.toggle('on', on); }
}
let pushOn = null, pushTxtV = '';
function updatePushHint(){
  const on = mode==='play' && state==='rally' && !ballDead && lastHitter==='ai' && relTop() < -8;
  if(on !== pushOn){ pushOn = on; pushHintEl.classList.toggle('on', on); }
  if(!on) return;
  const t = ctrlHold ? '◎ 搓球 · 拍面放平'
    : ('◎ 下旋来球 · ' + (TOUCH ? '按住「搓」钮搓球' : '按住 Ctrl 搓球'));
  if(t !== pushTxtV){ pushTxtV = t; pushHintEl.textContent = t; }
}
/* 挥拍相位：ready(待机) → windup(引拍) → strike(挥拍/随挥) → ready
   引拍时球拍后撤/蓄力（正手大、反手紧凑），触球时前送/横扫/拍面关闭，随挥后还原 */
const easeOut = t => 1-(1-t)*(1-t);          // 引拍：快拉后蓄稳 / 前送关面：触球快
const easeIn  = t => t*t;                    // 横扫甩腕：渐强
const smooth  = t => t*t*(3-2*t);            // 随挥上抬：平滑过渡
/* 动画用挥拍类型归位：搓球/发球动作结束后还原为常规握法动画，并清零发球侧旋 */
function resetSwingType(p){
  if(p.swingType==='push'||p.swingType==='serveTop'||p.swingType==='servePush'){
    p.swingType = p===playerPad ? playerStance : 'forehand';
    p.serveSide = 0;
  }
}
function beginWindup(pad, strokeType, power){
  if(pad.phase==='windup' || pad.phase==='strike') return;   // 一球一次
  pad.phase = 'windup'; pad.phaseT = 0; pad.windup = 0;
  pad.swingType = strokeType;
  pad.power = (power!=null) ? power : 0.6;
  pad.flipTarget = strokeType==='backhand' ? 1 : 0;          // 引拍即翻面预告
  pad.strokeT = elapsed;                                     // 保持翻面预告（不被 0.7s 复位覆盖）
}
function strikeSwing(pad, power){
  pad.phase = 'strike'; pad.phaseT = 0; pad.windup = 0; pad.swing = 1;
  if(power!=null) pad.power = power;
}
function updateWindupTrigger(){
  // 玩家引拍预告：球临近拍面时提前引拍（比 physics 内的触发更早、更明显）
  if(!canHit.player || lastHitter==='player' || playerPad.phase!=='ready') return;
  if(ball.vel.z <= 0.05) return;
  const ttc = (playerPad.group.position.z - ball.pos.z) / ball.vel.z;
  if(ttc<=0 || ttc>0.30) return;
  const pushF = (ctrlHold && relTop() < -8) ? PUSH.fit : null;
  beginWindup(playerPad, pushF ? 'push' : playerStance, pushF ? 0.5 : 0.55);
}
function updatePaddlePose(dt){
  playerPad.flipTarget = pushStanceOf()==='backhand' ? 1 : 0;      // 搓球左半台自动倒板（黑面反手）
  // 动画跟随握法（搓球 / 发球专用动作除外）
  const kp = playerPad.swingType;
  if(kp!=='push' && kp!=='serveTop' && kp!=='servePush') playerPad.swingType = playerStance;
  if(elapsed - aiPad.strokeT > 0.7) aiPad.flipTarget = 0;
  [playerPad, aiPad].forEach(p=>{
    p.flipT += (p.flipTarget-p.flipT)*Math.min(1, dt*12);
    // ---- 相位推进 ----
    p.phaseT += dt;
    const cfg = ANIM[p.swingType] || ANIM.forehand;
    const pw = clamp(p.power||0.6, 0.3, 1.2);
    // 力量节奏：大力 → 引拍更快、随挥更利落
    const windupDur = cfg.windupT * THREE.MathUtils.lerp(1.25, 0.85, pw);
    const effDecay  = cfg.decay  * THREE.MathUtils.lerp(0.85, 1.25, pw);
    if(p.phase==='windup'){
      p.windup = clamp(p.phaseT/windupDur, 0, 1);
      // 引拍到位但球未到（如漏球）：短暂保持后归位，避免卡在引拍
      if(p.windup>=1 && p.phaseT > windupDur + 0.5){ p.phase='ready'; p.windup=0; resetSwingType(p); }
    }else if(p.phase==='strike'){
      p.swing = Math.max(0, p.swing - dt*effDecay);
      if(p.swing<=0){ p.phase = 'ready'; p.windup = 0; resetSwingType(p); }
    }else{
      p.windup = 0;
    }
    const w = p.windup;
    const st = p.phase==='strike' ? (1 - p.swing) : 0;   // 挥拍进度 0→1
    const wE = easeOut(w);                               // 引拍：快拉后蓄稳
    const eo = easeOut(st), ei = easeIn(st), sm = smooth(st);   // 各轴包络
    const snapK = Math.exp(-st*2.6);                     // 触球瞬间甩腕
    const f = p.flipT;
    const fh = ANIM.forehand, bh = ANIM.backhand;
    const flat = !!cfg.flat;
    const baseX = flat ? cfg.readyX : THREE.MathUtils.lerp(fh.readyX, bh.readyX, f);
    const baseZ = flat ? cfg.readyZ : THREE.MathUtils.lerp(fh.readyZ, bh.readyZ, f);
    // ★ 外观增强（纯动画，不影响物理）：随挥绕拍柄翻转 / 触球更压拍 / 挥拍轨迹
    const flipXv  = (cfg.flipX  || 0) * ei * pw;     // 正手30°·反手25°绕拍柄翻转
    const pressXv = -(cfg.pressX || 0) * eo * pw;    // 触球更压拍（负向扣拍）
    const sideSweep = (cfg.sideSweep || 0) * ei * pw;   // 正手右下→左上
    const upSweep   = (cfg.upSweep   || 0) * sm * pw;   // 反手后下→前上
    // 引拍分量（挥拍阶段平滑释放，无跳变）
    const backK = p.phase==='windup' ? wE : Math.max(0, 1-st);
    const windK = p.phase==='windup' ? wE : Math.max(0, 1-st*1.8);
    const cockK = p.phase==='windup' ? wE : 0;           // 蓄力角触球释放
    const backZ  =  cfg.back  * backK*pw;
    const dipY   = -cfg.dip   * windK*pw;
    const cockZ  =  cfg.cockZ * cockK*pw;
    const cockX  =  cfg.cockX * cockK*pw;
    // 挥拍分量：前送 / 随挥上抬 / 横扫甩腕 / 拍面关闭
    const pushZ  = -cfg.push  * eo*pw;
    const riseY  =  cfg.rise  * sm*pw;
    const sweepZ =  cfg.sweepZ* ei*pw;
    const snapZ  =  cfg.snap  * snapK*pw;
    const closeX = -cfg.closeX* eo*pw;
    // 发球侧旋横向扫（仅动画，不影响物理）
    const lat = p.serveSide || 0;
    const latX = lat * cfg.serveLat * ei*pw;
    const latZ = lat * cfg.serveSpin* ei*pw;
    // 发球动画忽略横向滑动：发球旋转只由 A/D/F 决定，滑动不应引起拍面侧倾
    const isServeAnim = p.swingType==='serveTop' || p.swingType==='servePush';
    const swipeTilt = isServeAnim ? 0 : clamp(-(p.svx||0)*0.04, -0.4, 0.4);
    p.inner.position.set(latX + sideSweep, dipY + riseY + upSweep, backZ + pushZ);
    p.inner.rotation.y = f*Math.PI;
    // 反手(翻转面)绕拍柄翻转方向取反，保持视觉同向
    const flipSign = f > 0.5 ? -1 : 1;
    p.inner.rotation.x = baseX + cockX + closeX + pressXv + flipSign*flipXv;
    p.inner.rotation.z = baseZ + cockZ + sweepZ + snapZ + latZ + swipeTilt;
    // 待机呼吸：轻微浮动
    if(p.phase==='ready') p.inner.position.y += Math.sin(elapsed*2.0 + (p===aiPad?1.7:0))*0.0025;
  });
}
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  QUALITY.tick(dt);                 // 动态分辨率调节(仅自动档生效)
  elapsed += dt;
  playerStance = autoStance();        // 正/反手自动选择（球拍与球的相对位置）

  if(mode==='menu') demoPlayer(dt);
  else if(mode==='watch') aiMovePlayer(dt);
  else playerControl(dt);
  aiMove(dt);
  if(mode!=='watch') updateWindupTrigger();   // 观看模式由 aiMovePlayer 触发引拍

  if(state==='awaitServe'){
    const pad = server==='player' ? playerPad : aiPad;
    // 抛球点：端线后（规则）——球在拍后方、端线外侧约 0.5m（真实发球站位），台面之上，先垂直抛起
    const behind = server==='player' ? 1 : -1;         // 玩家侧 +Z(AI侧的场外)，AI 侧 -Z
    ball.pos.set(pad.group.position.x, TABLE_TOP + 0.05, clamp(pad.group.position.z, server==='player'?TABLE_L/2:-3, server==='player'?3:-TABLE_L/2) + behind*0.50);
    ball.vel.set(0,0,0); ball.spin.set(0,0,0);
  }else if(ball.active){
    const n = Math.max(1, Math.ceil(dt/(1/120))), h = dt/n;
    for(let i=0;i<n;i++) physicsStep(h);
  }

  ballMesh.position.copy(ball.pos);
  ballMesh.rotation.x += ball.spin.x*dt*0.8;
  ballMesh.rotation.y += ball.spin.y*dt*0.8 + dt*0.6;
  ballMesh.rotation.z += ball.spin.z*dt*0.8;
  trailHist[trailHead].copy(ball.pos);            // 环形缓冲写入(零分配)
  trailHead = (trailHead+1)%TRAIL_N;
  const tf = clamp((ball.vel.length()-1.4)/3.6, 0, 1);
  const ls = ball.lastStroke;
  const isBh = ls==='backhand'||ls==='ai-backhand';
  const isFh = ls==='forehand'||ls==='ai-forehand';
  const relS = ball.spin.x * Math.sign(ball.vel.z || 1);          // +上旋 / -下旋
  if(isBh && ball.vel.length()>4) _trailCol.set(0x7fd8ff);
  else if(relS < -40) _trailCol.set(0x8fe8c8);                   // 下旋球：青绿拖尾
  else if(isFh && (Math.abs(ball.spin.x)>90 || Math.abs(ball.spin.y)>50)) _trailCol.set(0xffb27f);
  else _trailCol.set(0xaee2ff);
  for(let i=0;i<TRAIL_N;i++){
    const m = trailMeshes[i], k = 1-i/TRAIL_N;
    m.position.copy(trailHist[(trailHead-1-i+TRAIL_N*2)%TRAIL_N]);   // 最新点在前
    m.scale.setScalar(Math.max(0.05, k*(0.7+tf*0.5)));
    m.material.opacity = tf*k*0.5;
    m.material.color.copy(_trailCol);
  }
  for(const r of rings) if(r.life>0){
    r.life -= dt*2.4;
    if(r.life<=0) r.m.visible = false;
    else{ r.m.scale.setScalar(0.35+(1-r.life)*1.6); r.m.material.opacity = r.life*0.8; }
  }
  if(flashLife>0){
    flashLife -= dt*7;
    flashSpr.material.opacity = Math.max(0, flashLife)*0.9;
    flashSpr.scale.setScalar(0.08+(1-Math.max(0,flashLife))*0.3);
  }
  if(ASSIST.showLanding && state==='rally' && !ballDead && lastHitter==='ai' && ball.vel.z>0){
    if(elapsed-landT > 0.1){
      landT = elapsed;
      const L = predictLanding();
      if(L && L.z>0){ landRing.visible = true; landRing.position.set(L.x, TABLE_TOP+0.006, L.z); }
      else landRing.visible = false;
    }
    landRing.material.opacity = 0.55+Math.sin(elapsed*8)*0.25;
    landRing.scale.setScalar(1+Math.sin(elapsed*8)*0.12);
  }else landRing.visible = false;

  updatePaddlePose(dt);
  updateAimReticle(dt);
  updateSpinMeter();
  updateStanceChip();
  updateWindupUI();
  updateCounterHint();
  updatePushHint();
  updateServeUI();
  updateTouchUI();

  ledTex.offset.x = (ledTex.offset.x + dt*0.05) % 1;

  camX += (clamp(ball.pos.x*0.14,-0.4,0.4)-camX)*Math.min(1, dt*2.5);
  shake *= Math.exp(-dt*5);
  fovKick *= Math.exp(-dt*5);
  const newFov = baseFov + fovKick;           // 扣杀/爆冲 FOV 冲击反馈
  if(Math.abs(newFov - camera.fov) > 0.01){   // fov 实际未变时跳过投影矩阵重算
    camera.fov = newFov;
    camera.updateProjectionMatrix();
  }
  camera.position.set(camX+(Math.random()-0.5)*shake,
                      camBaseY+Math.sin(elapsed*0.55)*0.02+(Math.random()-0.5)*shake, camBaseZ);
  camera.lookAt(camX*0.5, 0.8, -0.45);

  renderer.render(scene, camera);
}
/* 相机随宽高比自适应：横屏保持原始视角，竖屏拉高拉远+扩 FOV，保证整张球台可见（不强制横屏） */
const CAM_WIDE = { fov:40, y:2.72, z:4.88 };   // 横屏基准（原始值）
const CAM_TALL = { fov:68, y:3.35, z:6.10 };   // 竖屏预设
let baseFov = CAM_WIDE.fov, camBaseY = CAM_WIDE.y, camBaseZ = CAM_WIDE.z;
function fitCameraToAspect(){
  const a = innerWidth/innerHeight;
  const t = clamp((1.5-a)/(1.5-0.75), 0, 1);   // a≥1.5 → 横屏基准；a≤0.75 → 竖屏预设；中间平滑过渡
  baseFov  = THREE.MathUtils.lerp(CAM_WIDE.fov, CAM_TALL.fov, t);
  camBaseY = THREE.MathUtils.lerp(CAM_WIDE.y,   CAM_TALL.y,   t);
  camBaseZ = THREE.MathUtils.lerp(CAM_WIDE.z,   CAM_TALL.z,   t);
}
window.addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight;
  fitCameraToAspect();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------- 15. 启动 ---------------- */
updateScoreUI();
demoServe();
if(TOUCH) applyTouchTexts();   // demoServe 可能重写状态行，最后再按触屏替换文案
fitCameraToAspect();
animate();
