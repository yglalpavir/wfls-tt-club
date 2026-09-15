/* =====================================================================
 *  state.js — 游戏全局状态与工具函数
 * ===================================================================== */
'use strict';

/* ---------------- 7. 游戏状态 ---------------- */
let mode = 'menu';
let state = 'menu';
let server = 'player', lastHitter = null;
let isServe = false, shotBouncedOpp = false;
// 两跳发球状态机：isServe 为真时，发球需先落己方半台(sBouncedOwn)，再弹起过网落对方半台(shotBouncedOpp)
let serveBouncedOwn = false;
let canHit = { player:false, ai:false };
let netLet = false, lastNetBy = null, ballDead = true;
let scoreYou = 0, scoreAi = 0, rallyCount = 0, longestRally = 0;
let shake = 0, aiPosErr = 0, demoServer = 'ai', lastZone = '';
let aiModel = 'standard';                              // 对战模型：standard(普通AI) | hell(地狱AI) | grandslam(大满贯预备种子) | ttmouse(鼠标上的tt玩家·输入级DQN)
let fightL = 'hell', fightR = 'hell';                 // AI 斗蛐蛐双方模型（左=近侧/原玩家 · 右=远侧/原AI）
let seriesWinsL = 0, seriesWinsR = 0;                // 5局三胜系列胜场
const BEST_OF = 5, NEED_WINS = 3;                    // 五局三胜
let playerStance = 'forehand', chipState = 'forehand';
let shiftHold = false, rmbHold = false;
let serveKeys = { a:false, s:false, d:false };   // 发球按住：a=上旋(仅发球动画) s=左旋 d=右旋（下旋发球已取消）
let ctrlHold = false;                            // 按住 Ctrl = 主动搓球
let servePlan = null;                            // 发球旋转计划 {top,side,power,type}（startToss 决定，动画与击球一致）
// ★ 发球预调（发球前调好，点击抛发）：top=上旋(恒定，下旋发球已取消) side=左右旋 · power=强度0..1（发球不再区分短球/急长球）
let serveCfg = { top:true, side:0, power:0.5, type:'long' };
let willNet = false;                             // 对下旋抢点 → 下网标记
const other = s => s==='player' ? 'ai' : 'player';
const gauss = () => (Math.random()+Math.random()+Math.random()-1.5)*0.8;
