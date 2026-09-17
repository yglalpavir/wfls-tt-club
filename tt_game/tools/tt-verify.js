'use strict';
/* 无头验证 tt-player 的 AI 侧镜像与出球逻辑（浏览器管线织布机测试） */
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js');
global.SIM = SIM; global.P = PP;
const IA = require('../js/input-agent.js');
const IW = require('../js/input-weights.js');
global.INPUT_AGENT = IA; global.INPUT_AI_WEIGHTS = IW.INPUT_AI_WEIGHTS;
global.fightL = 'ttmouse'; global.fightR = 'hell'; global.aiModel = 'ttmouse';
global.mode = 'play'; global.ballDead = false; global.shotBouncedOpp = false;
global.lastHitter = 'player'; global.ctrlHold = false;
global.elapsed = 0; global.rallyCount = 2;   // ttTick 姿态块/ttHit 接发判定读取的实机全局
/* 极简球对象（physics 用到的字段） */
global.ball = { pos: { x: 0, y: 0.9, z: 0 }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 },
                set(x,y,z){ this.x=x; this.y=y; this.z=z; }, active: true };
ball.vel.set = ball.vel.set || function(x,y,z){ this.x=x; this.y=y; this.z=z; };
ball.spin.set = ball.spin.set || function(x,y,z){ this.x=x; this.y=y; this.z=z; };
function stubPad(z){
  return { group: { position: { x: 0, z } }, svx: 0, svz: 0, ctrl: false, my: 0.5, phase: 'ready',
           flipTarget: 0, strokeT: 0, power: 0, swingType: '', recover: 0,
           stance: 'forehand', stanceT: -9 };   // 正/反手姿态（v2.2 起 ttTick 会读写）
}
const { TT_PLAYER } = require('../js/tt-player.js');
global.TT_PLAYER = TT_PLAYER;
TT_PLAYER.init();
if(!TT_PLAYER.isReady()){ console.log('FAIL: agent not ready'); process.exit(1); }

/* —— 场景：AI 侧（z<0）来球，应回球（出球 vz>0 朝向人类玩家） —— */
const aiPad = stubPad(-1.32);
TT_PLAYER.reset();
ball.pos = { x: -0.2, y: 1.1, z: -2.2 }; ball.vel = { x: 0.3, y: -0.5, z: 2.4 }; ball.spin = { x: -12, y: 6, z: 0 };
for(let i = 0; i < 240; i++){ global.elapsed = i / 60; TT_PLAYER.ttTick(1/60, 'ai', aiPad); }
const obsCheck = TT_PLAYER.agent;
console.log('AI 侧 tick 240 帧后 拍位: x=' + aiPad.group.position.x.toFixed(3) + ' z=' + aiPad.group.position.z.toFixed(3) +
  ' (期望 z≈-0.9..-1.72)  svz=' + aiPad.svz.toFixed(2) + ' ctrl=' + aiPad.ctrl);

/* —— 触球：把球移到拍前，调 ttHit —— */
ball.pos = { x: aiPad.group.position.x + 0.02, y: 0.91, z: aiPad.group.position.z - 0.03 };
ball.vel = { x: 0.1, y: 0.2, z: -2.0 }; ball.vel.set = function(x,y,z){ this.x=x; this.y=y; this.z=z; };
ball.spin = { x: -15, y: -4, z: 0 }; ball.spin.set = function(x,y,z){ this.x=x; this.y=y; this.z=z; };
const hit = TT_PLAYER.ttHit('ai', aiPad);
console.log('ttHit 触发: ' + hit);
console.log('出球: v=(' + ball.vel.x.toFixed(2) + ',' + ball.vel.y.toFixed(2) + ',' + ball.vel.z.toFixed(2) +
  ') spin=(' + ball.spin.x.toFixed(1) + ',' + ball.spin.y.toFixed(1) + ')');
if(!hit) console.log('FAIL: hit 未触发');
else if(ball.vel.z <= 0) console.log('FAIL: 出球 vz<=0（应朝人类玩家 +z）');
else console.log('OK: AI 回球方向正确（vz>0 朝向 +z 玩家）');