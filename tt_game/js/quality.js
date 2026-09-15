/* =====================================================================
 *  quality.js — 画质分级与动态分辨率调节(移动端性能优化)
 *  · 档位:high(桌面·与原版一致) / med(触屏默认) / low(低端触屏)
 *    high: DPR≤2 · MSAA开 · 2048 PCFSoft 阴影
 *    med : DPR≤1.5 · MSAA关 · 1024 PCF 阴影
 *    low : DPR≤1.25 · MSAA关 · 无阴影
 *  · 档位来源优先级:URL ?q=high|med|low > localStorage 记忆 > 自动检测
 *  · 自动档下运行时监测 FPS:持续偏慢 → 降渲染分辨率;持续流畅 → 升回
 *  · scene.js 创建 renderer 后调 QUALITY.init(renderer);main.js 每帧调 QUALITY.tick(dt)
 *  · 注意:antialias 是 WebGL 上下文创建参数,本会话内切换档位只即时调整
 *    分辨率与阴影;MSAA 差异在下次刷新(按 localStorage 记忆)后生效
 * ===================================================================== */
'use strict';

const QUALITY = (() => {
  const STORE_KEY = 'tt_quality';
  const IS_TOUCH = matchMedia('(pointer:coarse)').matches;

  /* ---- 档位参数表 ---- */
  const TIERS = {
    high: { antialias: true,  dprCap: 2,    shadow: 2, shadowSize: 2048 },
    med:  { antialias: false, dprCap: 1.5,  shadow: 1, shadowSize: 1024 },
    low:  { antialias: false, dprCap: 1.25, shadow: 0, shadowSize: 1024 },
  };
  const MODE_LABEL = { auto: '自动', high: '高', med: '中', low: '低' };

  /* ---- 档位来源:URL 参数 > localStorage > 自动检测 ---- */
  function detectTier(){
    if(!IS_TOUCH) return 'high';
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 8;                     // deviceMemory 仅 Chrome 提供,缺省视为充足
    if(cores <= 4 || mem <= 4) return 'low';
    if(cores <= 6 && devicePixelRatio >= 3) return 'low';        // 高分屏中端机
    return 'med';
  }
  function loadSavedMode(){
    try{
      const m = localStorage.getItem(STORE_KEY);
      if(m === 'auto' || TIERS[m]) return m;
    }catch(_){}
    return null;
  }
  let mode = 'auto';
  {
    const q = new URLSearchParams(location.search).get('q');
    if(q === 'auto' || TIERS[q]) mode = q;
    else mode = loadSavedMode() || 'auto';
  }

  let tier = mode === 'auto' ? detectTier() : mode;   // 当前生效档位
  let renderer = null, dirLightRef = null;
  let appliedShadowType = null;

  /* ---- 动态分辨率调节(仅自动档):FPS 滑动窗口评估,带双向回滞 ---- */
  const SCALES = [1, 0.85, 0.72, 0.6];
  let scaleIdx = 0, winAcc = 0, winCnt = 0, badWins = 0, goodWins = 0;
  const WIN_T = 1.5;            // 每个评估窗口时长(秒)
  function applyRes(){
    if(!renderer) return;
    const t = TIERS[tier];
    renderer.setPixelRatio(Math.min(devicePixelRatio, t.dprCap) * SCALES[scaleIdx]);
  }
  function tick(dt){
    if(mode !== 'auto' || !renderer || dt <= 0) return;
    winAcc += dt; winCnt++;
    if(winAcc < WIN_T) return;
    const fps = winCnt / winAcc;
    winAcc = 0; winCnt = 0;
    if(fps < 45){                                   // 连续 2 个窗口偏慢 → 降一档分辨率
      goodWins = 0;
      if(++badWins >= 2 && scaleIdx < SCALES.length - 1){ scaleIdx++; badWins = 0; applyRes(); }
    }else if(fps > 57){                             // 连续 4 个窗口流畅 → 升回一档(不超初始)
      badWins = 0;
      if(++goodWins >= 4 && scaleIdx > 0){ scaleIdx--; goodWins = 0; applyRes(); }
    }else{ badWins = 0; goodWins = 0; }
  }

  /* ---- 运行时应用档位(手动切换用;MSAA 除外,见文件头注) ---- */
  function applyRuntime(){
    if(!renderer) return;
    const t = TIERS[tier];
    scaleIdx = 0; badWins = 0; goodWins = 0; winAcc = 0; winCnt = 0;
    applyRes();
    renderer.shadowMap.enabled = t.shadow > 0;
    const wantType = t.shadow === 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.type = wantType;
    try{ dirLightRef = dirLightRef || (typeof dirLight !== 'undefined' ? dirLight : null); }catch(_){}
    if(dirLightRef){
      dirLightRef.shadow.mapSize.set(t.shadowSize, t.shadowSize);
      if(dirLightRef.shadow.map){ dirLightRef.shadow.map.dispose(); dirLightRef.shadow.map = null; }
    }
    /* 阴影开关/类型是着色器变体:变化时需让材质重新编译(场景小,一次性卡顿可接受) */
    if(appliedShadowType !== null && appliedShadowType !== wantType && typeof scene !== 'undefined'){
      scene.traverse(o => {
        if(!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; });
      });
    }
    appliedShadowType = wantType;
  }

  /* ---- 对外接口 ---- */
  return {
    get mode(){ return mode; },                 // 'auto' | 'high' | 'med' | 'low'
    get tier(){ return tier; },                 // 当前生效档位
    get antialias(){ return TIERS[tier].antialias; },   // 仅供 scene.js 创建 renderer 时读取
    get dprCap(){ return TIERS[tier].dprCap; },
    get shadow(){ return TIERS[tier].shadow; },           // 0=关 1=PCF 2=PCFSoft
    get shadowSize(){ return TIERS[tier].shadowSize; },
    get resScale(){ return SCALES[scaleIdx]; },
    modeLabel(){ return MODE_LABEL[mode]; },
    init(r){ renderer = r; appliedShadowType = TIERS[tier].shadow === 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; applyRes(); },
    tick,
    setMode(m){
      if(m !== 'auto' && !TIERS[m]) return;
      mode = m;
      tier = m === 'auto' ? detectTier() : m;
      try{ localStorage.setItem(STORE_KEY, m); }catch(_){}
      applyRuntime();
    },
    cycle(){
      const order = ['auto', 'high', 'med', 'low'];
      this.setMode(order[(order.indexOf(mode) + 1) % order.length]);
      return this.modeLabel();
    },
  };
})();
