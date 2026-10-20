/* =====================================================================
 *  move-limit.js — 模型侧「移动预算」（单一真相源）
 * =====================================================================
 *  为什么需要它
 *  ------------
 *  玩家侧的拍面在物理上由「鼠标目标」驱动：
 *      x += (tx - x) * min(1, dt * MOUSE_PACE)          （tt-player.js / input-sim.js 同款）
 *  真人的 tx 来自真实鼠标（js/input.js 事件）⇒ 拍速由手臂决定，天然有限。
 *  模型的 tx 是控制器**每帧重算的精确拦截点** ⇒ 等价于「鼠标瞬移」，
 *  唯一的约束是 MOUSE_SV_CAP=7 m/s 的硬钳 ⇒ 0.2 秒横穿整个半台。
 *  于是模型「够得到」一切 ⇒ 它的超高实力全部来自防守，而不是战术
 *  （实测：HIP L1 vs 地狱 AI 97.1%，失分里「够不到」= 0%）。
 *
 *  这个模块给模型侧加一个**物理层的速度上限**（真人水平 ~1.5~2.5 m/s），
 *  让「跑不快」成为真实约束 ⇒ 站位/落点开始有价值。
 *
 *  ★ 关键设计
 *  1) **单一真相源**：实机（tt-player.js）与训练孪生（input-sim.js）读同一份
 *     MOVE_LIMIT —— 这两处公式逐行同构，各写一份必然漂移（历史上已经因此
 *     出过一次「训练/实机失配」事故）。
 *  2) **只影响模型侧**：真人的拍面走 main.js#playerControl（另一条路径），
 *     所以访客手感完全不变。
 *  3) **默认不限**（cap=null ⇒ 与限速前的行为逐位等价），
 *     限速值由实机扫描决定后再写进 DEFAULT_CAP。
 * ===================================================================== */
'use strict';

const MOVE_LIMIT = {
  /* 横向拍速上限（m/s）。null = 不限（= 限速前行为）。 */
  cap: null,
  /* 纵向（拍面深度）拍速上限（m/s）。null = 不限。 */
  capZ: null,
  /* 出厂默认：限速值由 tools/hip-eval.js --grid moveCap=... 实机扫描决定。
   * null = 不限（扫描前的基线口径）。
   *
   * ★ 选定值 2.0 m/s（2026-10-21，实机扫描 12 局/格 vs 地狱 AI，maxsec 120）：
   *   cap 1.6 → 31.7%  失分里「够不到」92%   （防守全破，模型太弱）
   *   cap 2.0 → 45.4%  失分里「够不到」 6%   ← 选定：防守刚好破一个口子
   *   cap 2.4 → 64.5%  失分里「够不到」 0%   （防守仍是铁桶）
   *   cap 2.8 → 78.6%  失分里「够不到」 0%
   *   不限   → 97.4%  失分里「够不到」 0%   （基线：全靠防守）
   * 判据（见 docs/tech/hip-framework.md §1.17.2）：限速必须让「够不到」重新出现，
   * 否则模型依旧靠密不透风的防守取胜（用户明确不要的结果）。
   */
  DEFAULT_CAP: 2.0,
  DEFAULT_CAP_Z: null,
};

/* 设置移动预算。o = { cap, capZ }；null / 非有限数 = 不限；<=0 也视为不限。 */
function setMoveLimit(o){
  if(!o) return MOVE_LIMIT;
  if('cap' in o){
    const v = Number(o.cap);
    MOVE_LIMIT.cap = (isFinite(v) && v > 0) ? v : null;
  }
  if('capZ' in o){
    const v = Number(o.capZ);
    MOVE_LIMIT.capZ = (isFinite(v) && v > 0) ? v : null;
  }
  return MOVE_LIMIT;
}
function getMoveLimit(){ return MOVE_LIMIT; }

/* 复位到出厂默认（扫描/评测时用来回到基线口径）。 */
function resetMoveLimit(){
  MOVE_LIMIT.cap = MOVE_LIMIT.DEFAULT_CAP;
  MOVE_LIMIT.capZ = MOVE_LIMIT.DEFAULT_CAP_Z;
  return MOVE_LIMIT;
}

/* ★ 限速的唯一执行点。
 *   cur/target：当前拍位 / 目标拍位（m）
 *   rate：跟随速率（1/s），与原式的 dt*rate 语义一致
 *   cap：速度上限（m/s），null = 不限
 *   返回新的拍位。
 *   cap=null 时**逐位等价**于原式 cur + (target-cur)*min(1, dt*rate)。
 */
function moveStep(cur, target, rate, dt, cap){
  if(cap == null) return cur + (target - cur) * Math.min(1, dt * rate);
  const want = (target - cur) * rate;          // 期望速度 m/s
  const v = want > cap ? cap : (want < -cap ? -cap : want);
  return cur + v * dt;
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { MOVE_LIMIT, setMoveLimit, getMoveLimit, resetMoveLimit, moveStep };
}

/* 出厂默认：cap 初始化成 DEFAULT_CAP。
 * 限速值由实机扫描（tools/hip-eval.js --grid moveCap=...）决定后改这一处即可。 */
MOVE_LIMIT.cap = MOVE_LIMIT.DEFAULT_CAP;
MOVE_LIMIT.capZ = MOVE_LIMIT.DEFAULT_CAP_Z;
