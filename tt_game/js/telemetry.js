/* =====================================================================
 *  telemetry.js — 训练打点器（浏览器 / Node 共用）
 *  · 目的：让离线训练脚本能向 Web UI 推送逐代/逐 ep 指标，
 *    同时保持 `node tools/train*.js` 命令行行为 100% 不变。
 *  · 门控：仅当 process.env.TT_TELEMETRY 为真时输出，否则 tick() 静默。
 *    server.js 启动训练子进程时注入该环境变量。
 *  · 协议：单行 JSON，固定前缀 ##TT## 便于服务端从混合 stdout 中切分。
 *      ##TT##{"t":"gen","gen":3,"fit":0.6632,"fDef":0.7653}
 *  · t 取值：gen（GA 代）/ ep（RL 轮）/ bc（行为克隆 pass）/ phase（阶段切换）
 *  · 用法：
 *      const T = require('./js/telemetry.js');
 *      curve.push({...}); T.tick(curve[curve.length - 1]);
 * ===================================================================== */
'use strict';

const TAG = '##TT##';

const TELEMETRY = (() => {
  /* 是否启用（Node 由环境变量决定；浏览器默认为空实现，避免污染游戏控制台） */
  function enabled(){
    if(typeof process === 'undefined' || !process.env) return false;
    const v = String(process.env.TT_TELEMETRY || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'on';
  }

  /* 同步写出一行（stdout 不可用时静默失败，绝不抛出） */
  function emit(raw){
    try{
      if(typeof process !== 'undefined' && process.stdout && typeof process.stdout.write === 'function'){
        process.stdout.write(raw + '\n');
      }
    }catch(e){ /* 忽略 */ }
  }

  /* 打点一个指标对象。obj 必须可 JSON 序列化且不含 undefined。 */
  function tick(obj){
    if(!enabled()) return;
    if(!obj || typeof obj !== 'object') return;
    try{ emit(TAG + JSON.stringify(obj)); }
    catch(e){ /* 序列化失败忽略，训练优先 */ }
  }

  /* 阶段/说明性消息（非指标，UI 只用于状态提示与日志高亮） */
  function phase(name, text){
    if(!enabled()) return;
    try{ emit(TAG + JSON.stringify({ t: 'phase', phase: name, msg: text || name })); }
    catch(e){ /* 忽略 */ }
  }

  return { TAG, enabled, tick, phase };
})();

if(typeof module !== 'undefined' && module.exports){
  module.exports = TELEMETRY;
}
if(typeof window !== 'undefined') window.TELEMETRY = TELEMETRY;
