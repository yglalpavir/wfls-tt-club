/* =====================================================================
 *  ui.js — HUD / 界面 DOM 更新
 * ===================================================================== */
'use strict';

/* ---------------- 8. UI ---------------- */
const $ = id => document.getElementById(id);
const smFill = $('smFill'), smVal = $('smVal'), smEl = $('spinMeter');
const counterHintEl = $('counterHint'), pushHintEl = $('pushHint');
/* 每帧更新的元素一律缓存引用,禁止在帧循环里反复 getElementById */
const stanceChipEl = $('stanceChip'), stanceTxtEl = $('stanceTxt'), stanceSubEl = $('stanceSub');
const serveChipEl = $('serveChip'), serveTxtEl = $('serveChipTxt'), serveSideEl = $('serveChipSide');
const touchServeEl = $('touchServe');

/* statusLine 文案:直接传字符串(已是当前语言)或传函数,语言切换时按函数重算 */
let lastStatus = null;
function setStatus(v){
  lastStatus = (v === undefined || v === null) ? null : v;
  $('statusLine').textContent = (typeof v === 'function') ? v() : v;
}
function repop(el){ el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
/* 中部横幅(比分板中缝):随模式/局点/平分动态变化 */
function midLabelText(){
  if(mode==='watch') return gameT('g_st_series', {a: seriesWinsL, b: seriesWinsR});
  const gpY = scoreYou>=10 && scoreYou>scoreAi, gpA = scoreAi>=10 && scoreAi>scoreYou;
  const deuce = scoreYou>=10 && scoreYou===scoreAi;
  if(deuce) return gameT('g_deuce');
  if(gpY||gpA) return gameT('g_game_point_state');
  return gameT('g_mid_label');
}
function updateScoreUI(){
  const py=$('ptsYou'), pa=$('ptsAi');
  if(py.textContent != String(scoreYou)){ py.textContent = scoreYou; repop(py); }
  if(pa.textContent != String(scoreAi)){ pa.textContent = scoreAi; repop(pa); }
  $('dotYou').classList.toggle('on', server==='player' && state!=='over');
  $('dotAi').classList.toggle('on', server==='ai' && state!=='over');
  const gpY = scoreYou>=10 && scoreYou>scoreAi, gpA = scoreAi>=10 && scoreAi>scoreYou;
  $('gpYou').classList.toggle('on', gpY); $('gpAi').classList.toggle('on', gpA);
  $('midLabel').textContent = midLabelText();
  /* 实机遥测 chip：仅「鼠标上的tt玩家」参赛时显示（每分刷新一次） */
  if(typeof TT_STATS !== 'undefined'){
    const txt = TT_STATS.chipText(), chip = $('ttStatsChip');
    if(chip && chip.textContent !== txt){ chip.textContent = txt; chip.classList.toggle('hidden', !txt); }
    if(txt) TT_STATS.push();
  }
}
/* 斗蛐蛐：HUD 两侧名字（不换边 → 开场设一次即可） */
function setFightNames(){
  if(mode!=='watch') return;
  const nl = $('nameYou'), nr = $('nameAi');
  if(nl) nl.textContent = gameT('g_left_prefix') + modelLabel(fightL);
  if(nr) nr.textContent = gameT('g_right_prefix') + modelLabel(fightR);
}
/* 斗蛐蛐：5局三胜结束 → 系列结果 */
function fightEnd(){
  if(mode!=='watch') return;
  lastEndFn = fightEnd;
  const lWin = seriesWinsL > seriesWinsR;
  const wName = (lWin ? gameT('g_left_prefix') : gameT('g_right_prefix')) + modelLabel(lWin ? fightL : fightR);
  $('endKicker').textContent = gameT('g_fight_end_kicker');
  const t = $('endTitle');
  t.textContent = wName + gameT('g_win_suffix');
  t.className = 'ov-title win';
  $('endScore').textContent = gameT('g_series') + ' ' + seriesWinsL + ' : ' + seriesWinsR;
  $('endStats').textContent = modelLabel(fightL) + ' vs ' + modelLabel(fightR) + gameT('g_fight_stats', {r: longestRally});
  $('endOverlay').classList.remove('hidden');
  spawnConfetti(); playWin();
}
let toastT = 0;
/* toast 为瞬时提示:入参按当前语言即时翻译,切换语言不回溯已消失的提示 */
function toast(big, sub, cls, dur){
  const el = $('toast');
  el.className = ''; $('toastBig').textContent = big; $('toastSub').textContent = sub||'';
  if(cls) el.classList.add(cls);
  void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(()=>el.classList.remove('show'), dur||1500);
}
function flash(side){
  const el = $('flash'); el.className = ''; void el.offsetWidth;
  el.classList.add(side==='you' ? 'f-you' : 'f-ai');
}
function updateRallyChip(){
  $('rallyN').textContent = rallyCount;
  $('rallyChip').classList.toggle('hot', rallyCount>=3);
}
/* 握法文案(纯写 DOM,不带音效/动画 —— 供 updateStanceChip 与语言切换共用) */
function writeStanceText(){
  const fh = playerStance === 'forehand';
  stanceTxtEl.textContent = gameT(fh ? 'g_stance_fh' : 'g_stance_bh');
  stanceSubEl.textContent = windupSub ? gameT('g_windup') : gameT(fh ? 'g_stance_fh_sub' : 'g_stance_bh_sub');
}
function updateStanceChip(){
  if(chipState === playerStance) return;
  chipState = playerStance;
  stanceChipEl.className = playerStance;
  if(windupOn) stanceChipEl.classList.add('windup');   // className 重写会清掉引拍标记,按当前状态补回
  writeStanceText();
  void stanceChipEl.offsetWidth; stanceChipEl.classList.add('pop');
  tone(playerStance==='forehand'?340:560, 0, 0.05, 'square', 0.06);
}
/* 发球 chip 的红色顶边是静态样式(#serveChip.top),不再每帧 toggle */
let serveOn = null, serveTxtV = null, serveSideV = null;
function updateServeUI(){
  if(!serveChipEl) return;
  const on = mode==='play' && (state==='awaitServe'||state==='toss') && server==='player';
  if(on !== serveOn){ serveOn = on; serveChipEl.classList.toggle('on', on); }
  if(!on) return;
  // 同步当前按键到 serveCfg（发球前调节：S=左旋 D=右旋）
  serveCfg.side = (serveKeys.s?1:0) - (serveKeys.d?1:0);
  const sideTxt = serveCfg.side===1 ? gameT('g_serve_side_l') : (serveCfg.side===-1 ? gameT('g_serve_side_r') : gameT('g_serve_side_n'));
  const pIdx = serveCfg.power<0.4 ? gameT('g_pw_weak') : (serveCfg.power>0.7 ? gameT('g_pw_strong') : gameT('g_pw_mid'));
  // 主标签：旋转组合（下旋发球已取消 → 恒定▲上旋 + ◀/▶侧），副标签：强度（值变化才写 DOM）
  const t1 = gameT('g_serve_top') + (serveCfg.side!==0 ? '·'+sideTxt : '');
  if(t1 !== serveTxtV){ serveTxtV = t1; serveTxtEl.textContent = t1; }
  const t2 = gameT('g_serve_pow_fmt', {p: pIdx});
  if(t2 !== serveSideV){ serveSideV = t2; serveSideEl.textContent = t2; }
}
/* 触屏控件显隐联动（仅触屏设备生效）：搓球钮=对局中 · 发球簇=玩家发球阶段 · 退出钮=观看模式 */
let tPlay = null, tWatch = null, tServe = null;
function updateTouchUI(){
  if(!TOUCH) return;
  const playing = mode==='play';
  if(playing !== tPlay){ tPlay = playing; document.documentElement.classList.toggle('playing', playing); }
  const watching = mode==='watch';
  if(watching !== tWatch){ tWatch = watching; document.documentElement.classList.toggle('watching', watching); }
  const serving = playing && (state==='awaitServe'||state==='toss') && server==='player';
  if(serving !== tServe){ tServe = serving; if(touchServeEl) touchServeEl.classList.toggle('on', serving); }
}
/* 击球命中标记：触球瞬间屏幕中央十字闪光（玩家红 / AI 蓝） */
function showHitMarker(ai){
  const el = $('hitMarker'); if(!el) return;
  el.className = ''; void el.offsetWidth;
  el.classList.add(ai?'ai':'you','show');
}
/* 引拍/蓄力指示：引拍时握法徽章金色脉冲 + 文案、蓄力条发光 */
let windupSub = false, windupOn = null;
function updateWindupUI(){
  const w = playerPad.phase==='windup';
  if(w !== windupOn){
    windupOn = w;
    stanceChipEl.classList.toggle('windup', w);
    smEl.classList.toggle('charging', w);
  }
  if(w && !windupSub){
    windupSub = true;
    stanceSubEl.textContent = gameT('g_windup');
  }else if(!w && windupSub){
    windupSub = false;
    writeStanceText();
  }
}
function spawnConfetti(){
  const c = $('confetti'); c.innerHTML = '';
  const cols = ['#ff4d4f','#f0a500','#007bff','#52c41a','#4da3ff'];
  for(let i=0;i<90;i++){
    const d = document.createElement('i');
    d.style.left = Math.random()*100+'%';
    d.style.background = cols[i%cols.length];
    d.style.animationDuration = (2.4+Math.random()*2.2)+'s';
    d.style.animationDelay = (Math.random()*1.2)+'s';
    c.appendChild(d);
  }
}
/* 终局面板的渲染器(赢/输/斗蛐蛐),语言切换时若面板可见则重画 */
let lastEndFn = null;
function showEnd(win){
  lastEndFn = ()=>showEnd(win);
  $('endKicker').textContent = gameT('g_end_over');
  const t = $('endTitle');
  t.textContent = win ? gameT('g_end_win') : gameT('g_lose');
  t.className = 'ov-title ' + (win?'win':'lose');
  $('endScore').textContent = scoreYou + ' : ' + scoreAi;
  $('endStats').textContent = gameT('g_end_stats', {r: longestRally, t: scoreYou + scoreAi});
  $('endOverlay').classList.remove('hidden');
  win ? (spawnConfetti(), playWin()) : playLose();
}

/* 语言切换钩子：重画所有「当前语言」相关的动态文案(toast 等瞬时文案不回溯) */
function uiReapplyI18n(){
  windupSub = false;
  serveTxtV = null; serveSideV = null; serveOn = null;
  writeStanceText();
  chipState = playerStance;   // 文案已重写,同步脏标记(避免下一帧重复 pop+音效)
  if(windupOn){ windupSub = true; stanceSubEl.textContent = gameT('g_windup'); }
  if(typeof lastStatus === 'function') setStatus(lastStatus);
  updateServeUI();
  updateScoreUI();
  setFightNames();
  if(lastEndFn && !$('endOverlay').classList.contains('hidden')) lastEndFn();
}
