/* =====================================================================
 *  player-log.js — 玩家行为记录（浏览器）
 *  · 记录玩家在真实对局中的每次击球：来球情境(ctx) + 出球动作(act)
 *  · 存入 localStorage（滚动窗口，保留最近 1500 板）
 *  · 导出：PLAYER_LOG.exportJSON() → 复制到 data/player-logs.json，
 *    再用 node tools/fit-player.js 拟合成"玩家模型"，作为 AI 训练对手
 *  · 挂载：index.html 在 state.js 之后加载（无依赖）
 * ===================================================================== */
'use strict';
const PLAYER_LOG = (() => {
  const KEY = 'tt_player_log_v1';
  const MAX = 1500;                       // 滚动窗口：保留最近 N 板
  let logs = [];
  try{ const raw = localStorage.getItem(KEY); if(raw) logs = JSON.parse(raw); }
  catch(e){ logs = []; }
  if(!Array.isArray(logs)) logs = [];

  function push(sample){
    logs.push(sample);
    if(logs.length > MAX) logs = logs.slice(-MAX);
    try{ localStorage.setItem(KEY, JSON.stringify(logs)); }catch(e){ /* 满则忽略 */ }
  }
  function all(){ return logs; }
  function count(){ return logs.length; }
  function exportJSON(){ return JSON.stringify(logs); }
  function clear(){ logs = []; try{ localStorage.removeItem(KEY); }catch(e){} }
  return { push, all, count, exportJSON, clear };
})();
