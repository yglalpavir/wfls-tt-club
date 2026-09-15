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
function setStatus(t){ $('statusLine').textContent = t; }
function repop(el){ el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
function updateScoreUI(){
  const py=$('ptsYou'), pa=$('ptsAi');
  if(py.textContent != String(scoreYou)){ py.textContent = scoreYou; repop(py); }
  if(pa.textContent != String(scoreAi)){ pa.textContent = scoreAi; repop(pa); }
  $('dotYou').classList.toggle('on', server==='player' && state!=='over');
  $('dotAi').classList.toggle('on', server==='ai' && state!=='over');
  const gpY = scoreYou>=10 && scoreYou>scoreAi, gpA = scoreAi>=10 && scoreAi>scoreYou;
  $('gpYou').classList.toggle('on', gpY); $('gpAi').classList.toggle('on', gpA);
  const deuce = scoreYou>=10 && scoreYou===scoreAi;
  $('midLabel').textContent = mode==='watch'
    ? ('系列 '+seriesWinsL+' : '+seriesWinsR+' · 5局三胜')
    : (deuce ? 'DEUCE · 平分' : ((gpY||gpA) ? '局点 GAME POINT' : '11分制 · ITTF 规则'));
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
  if(nl) nl.textContent = '左·'+MODEL_NAMES[fightL];
  if(nr) nr.textContent = '右·'+MODEL_NAMES[fightR];
}
/* 斗蛐蛐：5局三胜结束 → 系列结果 */
function fightEnd(){
  if(mode!=='watch') return;
  const lWin = seriesWinsL > seriesWinsR;
  const wName = (lWin ? '左·' : '右·') + MODEL_NAMES[lWin ? fightL : fightR];
  $('endKicker').textContent = 'AI 斗蛐蛐 · 五局三胜 · 决出冠军';
  const t = $('endTitle');
  t.textContent = wName + ' 获胜!'; 
  t.className = 'ov-title win';
  $('endScore').textContent = '系列 ' + seriesWinsL + ' : ' + seriesWinsR;
  $('endStats').textContent = (MODEL_NAMES[fightL] + ' vs ' + MODEL_NAMES[fightR]) + ' · 不换边 · 最长回合 '+longestRally+' 拍';
  $('endOverlay').classList.remove('hidden');
  spawnConfetti(); playWin();
}
let toastT = 0;
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
function updateStanceChip(){
  if(chipState === playerStance) return;
  chipState = playerStance;
  stanceChipEl.className = playerStance;
  if(windupOn) stanceChipEl.classList.add('windup');   // className 重写会清掉引拍标记,按当前状态补回
  stanceTxtEl.textContent = playerStance==='forehand' ? '正手 FOREHAND' : '反手 BACKHAND';
  stanceSubEl.textContent = playerStance==='forehand' ? '极重上旋 · 重炮 · 几乎不漏球' : '快速 · 大角度 · 快撕中等旋转';
  void stanceChipEl.offsetWidth; stanceChipEl.classList.add('pop');
  tone(playerStance==='forehand'?340:560, 0, 0.05, 'square', 0.06);
}
/* 发球 chip 的红色顶边是静态样式(#serveChip.top),不再每帧 toggle */
let serveOn = null, serveTxtV = '', serveSideV = '';
function updateServeUI(){
  if(!serveChipEl) return;
  const on = mode==='play' && (state==='awaitServe'||state==='toss') && server==='player';
  if(on !== serveOn){ serveOn = on; serveChipEl.classList.toggle('on', on); }
  if(!on) return;
  // 同步当前按键到 serveCfg（发球前调节：S=左旋 D=右旋）
  serveCfg.side = (serveKeys.s?1:0) - (serveKeys.d?1:0);
  const sideTxt = serveCfg.side===1 ? '◀ 左侧旋' : (serveCfg.side===-1 ? '▶ 右侧旋' : '直');
  const pIdx = serveCfg.power<0.4 ? '弱' : (serveCfg.power>0.7 ? '强' : '中');
  // 主标签：旋转组合（下旋发球已取消 → 恒定▲上旋 + ◀/▶侧），副标签：强度（值变化才写 DOM）
  const t1 = '▲上旋' + (serveCfg.side!==0?'·'+sideTxt:'');
  if(t1 !== serveTxtV){ serveTxtV = t1; serveTxtEl.textContent = t1; }
  const t2 = '旋转强度' + pIdx;
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
    stanceSubEl.textContent = '引拍蓄力中…';
  }else if(!w && windupSub){
    windupSub = false;
    stanceSubEl.textContent = playerStance==='forehand' ? '极重上旋 · 重炮 · 几乎不漏球' : '快速 · 大角度 · 快撕中等旋转';
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
function showEnd(win){
  $('endKicker').textContent = '比赛结束 · GAME OVER';
  const t = $('endTitle');
  t.textContent = win ? '胜利!' : '惜败';
  t.className = 'ov-title ' + (win?'win':'lose');
  $('endScore').textContent = scoreYou + ' : ' + scoreAi;
  $('endStats').textContent = '最长回合 '+longestRally+' 拍 · 总得分 '+(scoreYou+scoreAi);
  $('endOverlay').classList.remove('hidden');
  win ? (spawnConfetti(), playWin()) : playLose();
}
