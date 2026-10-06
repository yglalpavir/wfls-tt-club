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
      toast(gameT('g_toast_netcord'), '', 'gold', 900);
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
/* 玩家正/反手自动选择 v2.3：触球时刻几何 + 横向趋势预判 + 情境偏置 + 方向不对称滞回
   + OU 平滑噪声 + minHold 软坡 + 不确定度自适应（算法核心在 simcore.js#resolveStance，
   实机/训练器/AI 单一逻辑源；本函数只做预测缓存与状态写入）。
   玩家姿态的唯一所有者：menu/play/watch 全模式都经此更新 playerStance 与 playerPad.stance。
   预测击球点缓存随 TTC 自适应（远球省 CPU / 贴脸逐帧精判，predictXAtZ 是前向模拟 CPU 热点）；
   无来球（还原期）时 resolveStance 保持当前姿态，死球超过 resetHold 秒回正手基准握法
   ——真人回中还原，不跟远处球位乱切。
   触球前按"当前姿态×来球速度"的承诺窗口（SIM.commitTOf：正手锁得早、快球锁得早）锁姿态
   （挥拍已启动）；引拍期间不锁——磁吸会提前引拍，
   逐帧重估才能在球掠过体线时跟随切换（翻面动画逐帧插值，视觉自然）。
   gvx 传平滑拍速（main.js#playerControl 维护 playerPad.svx）：对触球瞬间的拍球
   相对位置决策，拍子追球不再把信号扫过分界线；bvx 传来球横向速度：趋势外推半个
   挥拍时间，"球往怀里钻"提前倒反手、贴线球由趋势定方向。 */
let _spBX = 0, _spT = -1;   // 预测击球点缓存
const _spNoise = { v: 0, t: -1 };   // OU 平滑噪声状态（resolveStance 原地更新）
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
    commit = ttc > 0 && ttc < SIM.commitTOf(playerStance, ball.vel.z);
  }
  const st = SIM.resolveStance({ bx, gx: g.x, gz: g.z, cur: playerStance,
    lastSwitch: playerPad.stanceT, now: elapsed, inbound, commit,
    idle: !ball.active || ballDead,
    gvx: playerPad.svx || 0, bvx: ball.vel.x, ttc, ballY: ball.pos.y, spinY: ball.spin.y,
    noiseBox: _spNoise });
  if(st !== playerStance){
    playerStance = st;
    playerPad.stance = st;      // stanceT：供磁吸过渡成本（stanceRampOf）与 minHold 软坡读取
    playerPad.stanceT = elapsed;
  }
  return st;
}
/* 搓球握法：按住Ctrl + 下旋来球 → 左半台(反手位)自动倒板反手搓，右半台正手搓；否则按握法 */
function pushStanceOf(){
  /* ★ 「鼠标上的tt玩家」对局：本侧姿态由 TT_PLAYER 拥有（tt-player.js#stanceTick），
   * 输入口径与训练侧 input-sim#stanceOf 逐项一致。真人玩家侧仍走 autoStance()。
   * 不这么切分的话，同一个 SIM.resolveStance 会吃到两套不同的输入
   * （自适应预测缓存 vs 每板一次且不随磁吸漂移的预测点；gvx/bvx/strokeSwitches 的
   *  给法也不同），于是选出的 STROKE 不同 → 触球窗口与磁吸强度都不同 ——
   * 也就是 agent 训的是「训练侧那套姿态下的自己」。 */
  if(typeof TT_PLAYER !== 'undefined' && TT_PLAYER.isReady() && TT_PLAYER.isTtSide('player')
     && typeof mode !== 'undefined' && mode === 'watch'){
    return TT_PLAYER.getStance('player');
  }
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
  // 接发球板（第一板）：对方刚发完球、本板为回合第一次回球 → 无法触发爆冲（resolveHit 内压制）
  const receive = rallyCount<=1 && lastHitter!=='player';
  // 前冲力度：0=挡拍 1=前冲（menu 演示强制 0.75）——与 AI 共用同一公式
  const fwd = mode==='menu' ? 0.75 : clamp(-playerPad.svz/7, 0, 1);
  // 调用共享出球核心（与 AI 完全相同）——含爆扣/爆抽/爆冲(非接发)/快撕/搓球/拉球全部判定
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
    receive,
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
  if(isPush){ toast(gameT('g_toast_push'), gameT('g_toast_push_sub'), 'you', 700); }
  else if(isSmash){
    toast(gameT(r.stroke==='forehand' ? 'g_toast_fh_smash' : 'g_toast_bh_smash'), Math.round(pace*3.6)+' km/h', 'you', 900);
    shake = Math.max(shake, 0.08); fovKick = Math.max(fovKick, 5.0);
  }
  else if(isCounter){
    toast(gameT('g_toast_counter'), Math.round(pace*3.6)+' km/h', 'you', 900);
    flashSpr.material.color.set(0x9fe8ff);
    shake = Math.max(shake, 0.045); fovKick = Math.max(fovKick, 2.8);
  }
  else if(isLoop){ toast(gameT('g_toast_fh_loop'), rpm+' RPM', 'you', 900); shake = Math.max(shake, 0.05); fovKick = Math.max(fovKick, 3.2); }
  else if(Math.abs(side)>SPIN.toastThresh){ toast(gameT('g_toast_sidespin'), gameT(playerPad.svx<0?'g_curve_l':'g_curve_r'), 'gold', 800); playSwipe(clamp(Math.abs(side)/SPIN.sideCap,0.5,1)); }
  else if(!receive && r.stroke==='forehand' && pace>4.6 && topMag>140){ toast(gameT('g_toast_fh_loop'), rpm+' RPM', 'you', 800); fovKick = Math.max(fovKick, 2.2); }
  else if(receive && r.stroke==='forehand' && pace>4.2){ toast(gameT('g_toast_fh_drive'), Math.round(pace*3.6)+' km/h', 'you', 700); }   // 接发第一板无爆冲，强回球涌现为快带
  else if(r.stroke==='backhand' && pace>4.3) toast(gameT('g_toast_bh_snap'), '', 'you', 800);
  else if(r.stroke==='backhand' && Math.abs(ax)>0.68) toast(gameT('g_toast_wide'), '', 'gold', 700);
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
  if(d.mode==='push') toast(gameT('g_toast_ai_push'), gameT('g_toast_ai_push_sub'), 'ai', 700);
  else if(d.mode==='lift') toast(gameT('g_toast_ai_lift'), '', 'ai', 700);
  else if(d.mode==='counter') toast(gameT('g_toast_ai_counter'), Math.round(d.pace*3.6)+' km/h', 'ai', 800);
  else if(d.mode==='loop' && d.relOut>150) toast(gameT('g_toast_ai_loop'), gameT('g_toast_ai_loop_sub'), 'ai', 900);
  else if(d.mode==='smash'){ toast(gameT('g_toast_ai_smash'), '', 'ai', 700); shake = Math.max(shake, 0.045); fovKick = Math.max(fovKick, 2.6); }
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
  const stance = pushStanceOf();                                   // 搓球用对应半台握法（左半台反手倒板）
  /* 容错窗口统一走 SIM.fitWindow（与训练 input-sim#tryPlayerFit 同一份公式）。
     allowPush 传 ctrlHold：真人只有「按住 Ctrl 且来球下旋」才拿搓球宽容窗口，
     AI 侧与训练侧只看球是否下旋 —— 这是三处有意不同的唯一一条，其余共用。 */
  const W = SIM.fitWindow(stance, relTop(), ball.pos.y, ball.vel, ball.spin, !!ctrlHold);
  const fitV = W.fitV, fitH = W.fitH, fitZ = W.fitZ;
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
  // ★ 与玩家对称：接球拟合窗口走 SIM.fitWindow（下旋来球自动获得搓球拟合，
  //   判据只看球是否下旋、不看 agent 按没按 Ctrl —— 与训练侧已对齐）
  const stance = aiPad.stance;   // 姿态由 aiMoveShared resolveStance 维护
  const W = SIM.fitWindow(stance, relTop(), ball.pos.y, ball.vel, ball.spin);
  const fitV = W.fitV, fitH = W.fitH, fitZ = W.fitZ;
  const g = aiPad.group.position, plane = g.z+PAD_HD;
  const zF = fitZ || 0.05;
  const swept = (_prev.z>=plane-zF && ball.pos.z<plane+zF && ball.vel.z<0);   // 玩家侧 swept 的严格镜像
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
  /* 台面弹跳先于磁吸：训练侧 input-sim#playerReceive 的顺序是
     「子步积分 → 弹跳 → 磁吸 → 触球判定」，磁吸读到的是弹跳后的球高。
     实机原来把磁吸放在积分之后、弹跳之前，读到的是弹跳前的高度 ——
     半高球（high 判据 p.y > TABLE_TOP+0.13）在两种顺序下判定不同，
     弹起越低差别越大。对齐成「弹跳 → 磁吸」，两侧口径才真正同一。 */
  if(v.y<0 && p.y-BALL_R<=TABLE_TOP && _prev.y-BALL_R>TABLE_TOP-0.05
     && Math.abs(p.x)<=TABLE_W/2+BALL_R*0.6 && Math.abs(p.z)<=TABLE_L/2+BALL_R*0.6){
    p.y = TABLE_TOP+BALL_R; tableBounce();
  }
  if(state==='rally' && !ballDead){
    /* 磁吸统一走 SIM.magnetStep（训练侧 input-sim 同一份，mir 区分左右）。
     * pushMag 只给真人玩家侧（constants.js 写明 PUSH.fit.mag 是「玩家专用」）；
     * agent 侧（ttmouse / 斗蛐蛐两侧）传 false，与原实机 AI 侧口径一致。 */
    if(canHit.player && v.z>0){
      const pushF = (ctrlHold && relTop() < -8) ? PUSH.fit : null;
      if(playerPad.phase==='ready') beginWindup(playerPad, pushF ? 'push' : playerStance, pushF ? 0.5 : 0.55);
      SIM.magnetStep(p, v, s, { mir: 1, padX: playerPad.group.position.x,
        padZ: playerPad.group.position.z, padY: playerPad.group.position.y,
        stance: playerStance, stanceT: playerPad.stanceT, now: elapsed,
        canHit: true, ctrl: !!ctrlHold, pushMag: true, dt });
    }
    if(canHit.ai && v.z<0){
      SIM.magnetStep(p, v, s, { mir: -1, padX: aiPad.group.position.x,
        padZ: aiPad.group.position.z, padY: aiPad.group.position.y,
        stance: aiPad.stance, stanceT: aiPad.stanceT, now: elapsed,
        canHit: true, ctrl: false, pushMag: false, dt });
    }
  }
  checkNet();
  if(state==='rally' && !ballDead){ tryPlayerHit(); tryAIHit(); }
  if(!ballDead){
    /* 出界判定统一走 SIM.outOfBounds（训练侧 playerReceive 同一份）。
     * 原来的两个条件合起来会死锁：
     *   · 落地判死要求 v.y<0，但台外地面反弹（下面的 else 分支）把 v.y 变正，
     *     球就在 y=BALL_R 上下振荡，落地判死大半帧不成立；
     *   · 而 |x|>7.5 / |z|>7.5 离台面（半长 1.37）太远，阻尼会让球先停住，
     *     永远到不了 7.5。
     * 结果：球停在台外 4~6 米处无限弹跳，state 永远停在 rally/toss，这一分打不完。
     * 表现为「某一分突然卡住 / AI 与玩家都不动」，与哪一方发球无关。
     * 修法（已在 SIM.outOfBounds 里）：加「落到台面外的地面上」判死
     *     （按台面外接矩形 + 一点余量），并把硬阈值收到台面尺寸的量级，
     *     作为兜底防飞出场外太远。 */
    if(SIM.outOfBounds(p, v)) resolveOut();
  }else{
    if(p.y<=BALL_R && v.y<0){ p.y=BALL_R; v.y=-v.y*0.5; v.x*=0.72; v.z*=0.72; }
  }
}
