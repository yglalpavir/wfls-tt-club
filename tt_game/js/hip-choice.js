/* HIP L2'：安全动作集（Safe Action Set）
 * ---------------------------------------------------------------------------
 * 为什么不用 336 类原始意图？（见 docs/reports/hip-m2-findings.md §6）
 *   1) 玩家侧真正能控的只有 3~4 维：出球深度 my、落点偏移、搓球、拍面深度。
 *      336 类里绝大多数组合在物理上**不可执行**（打长出界 / 够不到），
 *      学习空间被大量「必然失败」的样本淹没（stroke 头 top1 只有 33.7%）。
 *   2) 挥拍是要付代价的：落点偏移只能靠挥拍实现，而挥拍会让拍子漂离球
 *      （漂移 ≈ 0.065·vCmd，接触窗口只有 ±0.14m）。
 *      ⇒ 动作空间里必须**自带代价**，不能指望学生自己学会「少挥」。
 *
 * 所以这里的动作空间 = K 个**实机验证过安全**的选项（每个选项 = 一个 my × 落点偏移），
 * 学生只做 K 分类，输出一律落在「已知安全」的格子里。
 * 落点偏移靠「相对自然落点的偏移」表达，因为自然落点随球的位置变化，
 * 绝对落点是做不到的（拍子必须在球旁边 ±0.14m）。
 *
 * 教师（tools/hip-choice-teacher.js）负责给每个选项打分并选最优，
 * 学生（tools/hip-choice-train.js）只学这个 K 分类。
 */
const HIP_CHOICE = (() => {
  /* ---- 选项表（K = 11）----
   * my    : 出球深度/弧线旋钮（pz 通道把拍面深度与出球深度解耦 ⇒ my 是纯出球旋钮）
   * aim   : 相对「自然落点」的偏移（米）—— 靠挥拍实现，代价已计入教师打分
   * ctrl  : 是否搓球（只在下旋来球时可用）
   *
   * ★ 2026-10-20 重排（第六个真 bug 修完之后）：
   *   旧表把 my 钉死在 0.54（当时扫出来的尖峰），但那个尖峰是在
   *   「拍面深度由 my 推出」的口径下测的；pz 通道上线后 my 只管出球，
   *   实机二维扫描（padZOffset × myDrive，20 局/格）显示
   *   my ∈ {0.50, 0.54, 0.58} 都安全（自己出界 3~8 球/局），
   *   尖峰消失、变成平台 ⇒ **深度值得让学习层自己选**。
   */
  const OPTIONS = [
    /* —— 常规选项：my × 落点偏移（9 个）—— */
    { id: 0,  name: 'm50-c', my: 0.50, aim:  0.00, ctrl: false },
    { id: 1,  name: 'm50-l', my: 0.50, aim: -0.24, ctrl: false },
    { id: 2,  name: 'm50-r', my: 0.50, aim:  0.24, ctrl: false },
    { id: 3,  name: 'm54-c', my: 0.54, aim:  0.00, ctrl: false },
    { id: 4,  name: 'm54-l', my: 0.54, aim: -0.24, ctrl: false },
    { id: 5,  name: 'm54-r', my: 0.54, aim:  0.24, ctrl: false },
    { id: 6,  name: 'm58-c', my: 0.58, aim:  0.00, ctrl: false },
    { id: 7,  name: 'm58-l', my: 0.58, aim: -0.24, ctrl: false },
    { id: 8,  name: 'm58-r', my: 0.58, aim:  0.24, ctrl: false },
    /* —— 搓球选项：只在下旋来球时可选（fitWindow 的 pushF 只对下旋生效）—— */
    { id: 9,  name: 'push-c', my: 0.56, aim:  0.00, ctrl: true  },
    { id: 10, name: 'push-r', my: 0.56, aim:  0.12, ctrl: true  },
  ];
  const N_OPT = OPTIONS.length;

  /* ---- 掩码：搓球只在下旋来球且球不高时可选 ----
   * 搓球的落点/手法是 PUSH 分支（arc=PUSH.arc+arcSafe、control=0.9），
   * 只有 fitWindow 的 pushF（横向容差 0.026→0.170）在**下旋**时才生效，
   * 而 L1 的搓球判据还有「球高 < pushHeight(0.95)」这一条。 */
  function mask(ctx){
    const m = new Uint8Array(N_OPT);
    const rtop = (ctx && ctx.rtop != null) ? ctx.rtop : 0;
    const by = (ctx && ctx.by != null) ? ctx.by : 0;
    const back = rtop < -8;                     // 下旋来球
    const low = by < 0.95;                     // 球不太高
    for(let i = 0; i < N_OPT; i++){
      const o = OPTIONS[i];
      m[i] = (o.ctrl && !(back && low)) ? 0 : 1;
    }
    return m;
  }

  /* ---- 选项 → 控制量（aimX 是相对自然落点的偏移，由调用方加到自然落点上）---- */
  function optionToControls(id, ctx){
    const o = OPTIONS[id] || OPTIONS[4];
    return { my: o.my, ctrl: !!o.ctrl, aimOffset: o.aim, optId: o.id, name: o.name };
  }

  /* ---- 自然落点（与 hip-skill 的 aim 律一致）---- */
  function naturalAim(obs, AIM){
    const a = AIM || { xFromPos: 0.55, xFromSwipe: 0.30 };
    const px = obs && obs.px != null ? obs.px : 0;
    const svx = obs && obs.svx ? obs.svx : 0;
    return a.xFromPos * px + a.xFromSwipe * svx;
  }

  /* ---- 选项 → L1 意图对象（want 用自然落点 + 偏移）---- */
  function optionToIntent(id, obs, AIM){
    const c = optionToControls(id, obs);
    const nat = naturalAim(obs, AIM);
    const lim = 0.62;
    const aimX = Math.max(-lim, Math.min(lim, nat + c.aimOffset));
    return { my: c.my, ctrl: c.ctrl, aimX: aimX, optId: c.optId, name: c.name };
  }

  return { OPTIONS, N_OPT, mask, optionToControls, optionToIntent, naturalAim };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = { HIP_CHOICE };
