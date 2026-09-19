/* =====================================================================
 *  input.js — 鼠标 / 键盘输入，开始 / 重置 / 音效开关
 * ===================================================================== */
'use strict';

/* ---------------- 13. 输入 ---------------- */
let targetX = 0, targetZ = 1.32;
let mouseNy = 0.5;   // 指针垂直位置（0=上/深压 · 1=下/摆短）→ 驱动弧线与落点深度
// 正/反手由 autoStance() 自动选择（按球拍与球的位置），无需 Shift/右键切换
function refreshStance(){ playerStance = autoStance(); }

/* ---- 触屏检测：主指针为粗指针（手机/平板）即启用；触屏笔记本首次触摸时动态启用 ---- */
let TOUCH = matchMedia('(pointer:coarse)').matches;
if(TOUCH) document.documentElement.classList.add('touch');
window.addEventListener('touchstart', ()=>{
  if(TOUCH) return;
  TOUCH = true;
  document.documentElement.classList.add('touch');
  applyTouchTexts();
}, {once:true, passive:true});

function pointerTrack(e){
  const nx = (e.clientX/innerWidth)*2-1, ny = e.clientY/innerHeight;
  mouseNy = ny;
  targetX = clamp(nx*1.35, -X_CLAMP, X_CLAMP);
  targetZ = 0.92 + ny*0.8;
  // （发球不再区分短球/急长球；鼠标上下仍控制击球落点深度）
}
/* 触屏映射：与鼠标同源，但整体上移 ~12% 屏高——球拍悬于手指上方不被遮挡（归一化后全程深度可达） */
const TOUCH_LIFT = 0.12;
function touchTrack(e){
  const lift = innerHeight*TOUCH_LIFT;
  const ny = clamp((e.clientY-lift)/(innerHeight-lift), 0, 1);
  mouseNy = ny;
  targetX = clamp(((e.clientX/innerWidth)*2-1)*1.35, -X_CLAMP, X_CLAMP);
  targetZ = 0.92 + ny*0.8;
}
/* 触屏拖动：第一根落指控制球拍（第二指留给按钮）；轻点（位移小+时间短）= 发球 */
let touchId = null, touchStart = null, touchMoved = false;
window.addEventListener('pointermove', e=>{
  if(e.pointerType==='touch'){
    if(e.pointerId!==touchId) return;
    if(touchStart && Math.hypot(e.clientX-touchStart.x, e.clientY-touchStart.y)>12) touchMoved = true;
    touchTrack(e);
    return;
  }
  pointerTrack(e);
});
window.addEventListener('pointerdown', e=>{
  ensureAudio();
  if(e.pointerType==='touch'){
    if(e.target.closest('button') || touchId!==null) return;   // 按钮触摸与多指不抢控制权
    touchId = e.pointerId;
    touchStart = { x:e.clientX, y:e.clientY, t:performance.now() };
    touchMoved = false;
    touchTrack(e);
    return;
  }
  pointerTrack(e);
  if(e.button===2){ rmbHold = true; refreshStance(); return; }
  if(mode==='menu') return;
  if(e.target.closest('button')) return;
  if(state==='awaitServe' && server==='player') startToss();
});
window.addEventListener('pointerup', e=>{
  if(e.pointerType==='touch'){
    if(e.pointerId!==touchId) return;
    touchId = null;
    const ms = performance.now()-touchStart.t;
    // 拖动定位松手不误发球；静止轻点才抛球（鼠标仍保持按下即发，不变）
    if(!touchMoved && ms<350 && mode==='play' && state==='awaitServe' && server==='player') startToss();
    return;
  }
  if(e.button===2){ rmbHold = false; refreshStance(); }
});
window.addEventListener('pointercancel', e=>{ if(e.pointerId===touchId) touchId = null; });
window.addEventListener('contextmenu', e=>e.preventDefault());
window.addEventListener('keydown', e=>{
  // 发球（下旋发球已取消，恒定上旋）：S=左旋 D=右旋（A 保留仅驱动发球动画）
  if(e.code==='KeyA') serveKeys.a = true;
  if(e.code==='KeyS') serveKeys.s = true;          // 发球：左侧旋
  if(e.code==='KeyD') serveKeys.d = true;          // 发球：右侧旋
  // 发球旋转强度：Q=调弱 E=调强（发球前调，0..1）
  if(e.code==='KeyQ'){ if(mode==='play' && state==='awaitServe' && server==='player'){ serveCfg.power = clamp(serveCfg.power-0.2, 0, 1); } }
  if(e.code==='KeyE'){ if(mode==='play' && state==='awaitServe' && server==='player'){ serveCfg.power = clamp(serveCfg.power+0.2, 0, 1); } }
  if(e.code==='ControlLeft'||e.code==='ControlRight') ctrlHold = true;   // 搓球
  if(e.key==='Shift' && !e.repeat){ shiftHold = true; refreshStance(); }
  ensureAudio();
  if(mode==='menu'){ startGame(); return; }
  if(e.code==='Space' || e.code==='Enter'){
    e.preventDefault();
    if(state==='awaitServe' && server==='player') startToss();
  }
  if(e.code==='KeyR') resetMatch();
  if(e.code==='KeyM') toggleSound();
  if(e.code==='Escape' && mode==='watch') toMenu();   // 观看模式 Esc 返回
});
window.addEventListener('keyup', e=>{
  if(e.code==='KeyA') serveKeys.a = false;
  if(e.code==='KeyS') serveKeys.s = false;
  if(e.code==='KeyD') serveKeys.d = false;
  if(e.code==='ControlLeft'||e.code==='ControlRight') ctrlHold = false;
  if(e.key==='Shift'){ shiftHold = false; refreshStance(); }
});
function toggleSound(){
  soundOn = !soundOn;
  if(master) master.gain.value = soundOn?0.85:0;
  $('btnSound').firstElementChild.textContent = '音效：' + (soundOn?'开':'关');
}
$('btnSound').onclick = e=>{ e.stopPropagation(); ensureAudio(); toggleSound(); };
/* ---- 画质按钮：自动 → 高 → 中 → 低 循环（localStorage 记忆，刷新后 MSAA 等完全生效） ---- */
const btnQuality = $('btnQuality');
if(btnQuality){
  btnQuality.firstElementChild.textContent = '画质：' + QUALITY.modeLabel();
  btnQuality.onclick = e=>{
    e.stopPropagation();
    QUALITY.cycle();
    btnQuality.firstElementChild.textContent = '画质：' + QUALITY.modeLabel();
    toast('画质：' + QUALITY.modeLabel(),
      QUALITY.mode==='auto' ? '按设备自动档位 + 动态分辨率调节' : '分辨率与阴影已即时应用', 'gold', 1500);
  };
}
$('btnReset').onclick = e=>{ e.stopPropagation(); if(mode!=='menu') resetMatch(); };
$('btnAgain').onclick = e=>{ e.stopPropagation(); if(mode==='watch') startFight(); else resetMatch(); };
$('btnStart').onclick = e=>{ e.stopPropagation(); startGame(); };
// 注意：不再给 startOverlay 挂全局 pointerdown→startGame（否则点击页面任意处都会开赛）
// 只有「开始比赛 / AI 斗蛐蛐」按钮或按任意键才启动
$('btnWatch').onclick = e=>{ e.stopPropagation(); startFight(); };

/* ---- 对战模型选择（普通AI / 地狱AI / 大满贯预备种子 / 鼠标上的tt玩家 / 地狱AI克星）----
 * 极端对手 / 极端·满档已取消可选（opponent-ladder.js 仍保留，供 train-input3.js 课程训练用） */
const MODEL_NAMES = { standard: '普通 AI', hell: '地狱 AI', grandslam: '大满贯预备种子', ttmouse: '鼠标上的tt玩家', nemesis: '地狱AI克星' };
const MODEL_HINTS = {
  standard: '普通 AI：标准水平 · 攻守平衡',
  hell: '地狱 AI：自对弈打法 · 会搓球/快撕/爆冲',
  grandslam: '大满贯预备种子：以你的打法为模板训练 · 攻守全能',
  ttmouse: '鼠标上的tt玩家：输入级 DQN 训练 · 用鼠标X/Y/Ctrl 三个原始输入打出真人手感',
  nemesis: '地狱AI克星：只针对地狱AI特训的克制打法 · 对地狱AI胜球率 59.0%（内战基线 49.5%）',
};
/* ---- 「鼠标上的tt玩家」权重懒加载：涉及该模型时提前注入，开赛时若未就绪则等待 ---- */
function maybePreloadTtWeights(){
  if(typeof TT_PLAYER === 'undefined') return;
  if(aiModel==='ttmouse' || fightL==='ttmouse' || fightR==='ttmouse')
    TT_PLAYER.ensureWeights().catch(err => console.warn('[tt] 权重加载失败：' + err.message));
}
function selectModel(m){
  aiModel = m;
  document.querySelectorAll('.model-btn').forEach(b => b.classList.toggle('active', b.dataset.model === m));
  const h = $('modelHint'); if(h) h.textContent = MODEL_HINTS[m] || '';
  maybePreloadTtWeights();
}
document.querySelectorAll('.model-btn').forEach(b => {
  b.addEventListener('click', e => { e.stopPropagation(); selectModel(b.dataset.model); });
});
selectModel(aiModel);
$('btnHelp').onclick = e=>{ e.stopPropagation(); $('helpOverlay').classList.remove('hidden'); };
$('btnHelpClose').onclick = e=>{ e.stopPropagation(); $('helpOverlay').classList.add('hidden'); };
$('btnMenu').onclick = e=>{ e.stopPropagation(); toMenu(); };

/* ---- 触屏按钮：按住类（pointerdown/up/cancel + 指针捕获，保证可靠释放） ---- */
function holdBtn(el, on, off){
  if(!el) return;
  el.addEventListener('pointerdown', e=>{
    e.stopPropagation(); ensureAudio();
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    on(); el.classList.add('active');
  });
  const end = ()=>{
    if(!el.classList.contains('active')) return;
    off(); el.classList.remove('active');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
}
holdBtn($('btnPush'),  ()=>{ ctrlHold = true;  }, ()=>{ ctrlHold = false; });   // 搓球 = 桌面 Ctrl
holdBtn($('btnSpinL'), ()=>{ serveKeys.s = true; }, ()=>{ serveKeys.s = false; }); // 发球左旋 = 桌面 S
holdBtn($('btnSpinR'), ()=>{ serveKeys.d = true; }, ()=>{ serveKeys.d = false; }); // 发球右旋 = 桌面 D
/* 发球旋转强度 −/＋：与桌面 Q/E 同条件同步长 */
function adjustServePower(d){
  if(mode==='play' && state==='awaitServe' && server==='player')
    serveCfg.power = clamp(serveCfg.power+d, 0, 1);
}
if($('btnPowMinus')) $('btnPowMinus').addEventListener('pointerdown', e=>{ e.stopPropagation(); ensureAudio(); adjustServePower(-0.2); });
if($('btnPowPlus'))  $('btnPowPlus').addEventListener('pointerdown',  e=>{ e.stopPropagation(); ensureAudio(); adjustServePower(0.2); });
/* 观看模式退出（对应桌面 Esc） */
if($('btnExitWatch')) $('btnExitWatch').onclick = e=>{ e.stopPropagation(); toMenu(); };

/* ---- 触屏静态文案替换（"按任意键"等键盘措辞 → 触屏措辞） ---- */
function applyTouchTexts(){
  const sl = $('statusLine');
  if(sl && sl.textContent.indexOf('按任意键')>=0) sl.textContent = 'AI 演示对局 · 点击「开始比赛」开始';
  const ph = $('pushHint');
  if(ph) ph.textContent = '◎ 下旋来球 · 按住「搓」钮搓球';
}
if(TOUCH) applyTouchTexts();

function toMenu(){
  mode = 'menu'; ballDead = true;
  scoreYou = scoreAi = 0; longestRally = 0;
  $('endOverlay').classList.add('hidden');
  $('startOverlay').classList.remove('hidden');
  updateScoreUI();
  demoServe();
}

function startGame(){
  if(mode!=='menu') return;
  const go = ()=>{
    ensureAudio(); mode = 'play';
    $('startOverlay').classList.add('hidden');
    resetMatch();
  };
  // 选了「鼠标上的tt玩家」但权重未就绪：等懒加载完成再开赛（失败也照常开赛，该侧回退普通 AI）
  if(aiModel==='ttmouse' && typeof INPUT_AI_WEIGHTS === 'undefined' && typeof TT_PLAYER !== 'undefined')
    TT_PLAYER.ensureWeights().then(go).catch(()=>go());
  else go();
}
/* AI 斗蛐蛐：两侧 AI（可相同/不同）对战，5局三胜，不换边 */
function startFight(){
  if(mode==='play') return;
  const go = ()=>{
    ensureAudio(); mode = 'watch';
    aiModel = fightR;                     // 右侧（原 AI 侧）决策/移动用 aiModel=fightR
    $('startOverlay').classList.add('hidden');
    scoreYou = scoreAi = 0; longestRally = 0; ballDead = true;
    seriesWinsL = seriesWinsR = 0;        // 新一季：重置系列比分
    $('endOverlay').classList.add('hidden'); $('confetti').innerHTML = '';
    setFightNames();
    updateScoreUI();
    setStatus('AI 斗蛐蛐 · ' + MODEL_NAMES[fightL] + ' vs ' + MODEL_NAMES[fightR] + ' · 5局三胜');
    setupServe();
    toast('AI 斗蛐蛐', MODEL_NAMES[fightL] + ' vs ' + MODEL_NAMES[fightR] + ' · 5局三胜 · 不换边', 'gold', 1800);
  };
  const needW = (fightL==='ttmouse' || fightR==='ttmouse')
    && typeof INPUT_AI_WEIGHTS === 'undefined' && typeof TT_PLAYER !== 'undefined';
  if(needW) TT_PLAYER.ensureWeights().then(go).catch(()=>go());
  else go();
}
function resetMatch(){
  if(mode==='menu') return;
  scoreYou = scoreAi = 0; longestRally = 0; ballDead = true;
  $('endOverlay').classList.add('hidden'); $('confetti').innerHTML = '';
  updateScoreUI();
  setupServe(mode==='watch' ? undefined : 'player');
  toast('比赛开始', '正手重旋 · 反手快撕 · 对轰开始', 'gold', 1600);
}
/* 斗蛐蛐两侧 AI 选择（可相同可不同） */
const fightSel = document.querySelectorAll('.oc-diff select');
const fightSelMap = { fightL: 'fightL', fightR: 'fightR' };
if($('fightL')) $('fightL').addEventListener('change', e=>{ fightL = e.target.value; syncFightHint(); });
if($('fightR')) $('fightR').addEventListener('change', e=>{ fightR = e.target.value; syncFightHint(); });
function syncFightHint(){
  const h = $('fightHint'); if(!h) return;
  const same = fightL===fightR;
  h.textContent = MODEL_NAMES[fightL] + (same ? '（内战）' : ' vs ' + MODEL_NAMES[fightR]) + ' · 不换边 · 先赢3大局者胜';
}
syncFightHint();
