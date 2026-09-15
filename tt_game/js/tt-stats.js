/* =====================================================================
 *  tt-stats.js — 「鼠标上的tt玩家」实机遥测
 *  · 背景：仓库里所有胜率都是仿真内数据（tools/*.log），实机一条都没有，
 *    导致"模型变强了"无从验证——尤其仿真与实机不一致时更是如此。
 *  · 本模块在实机累积每侧得分/触球/动作分布/失分原因，是唯一可信的实机判据。
 *  · 挂点：rules.pointTo（得分+失分原因）、tt-player.ttHit（触球/擦网）、
 *         tt-player.ttTick（动作分布）
 *  · 只在至少一侧是 ttmouse（DQN）模型时计入，其余对局不计。
 *  · 用法：TT_STATS.reset() / snapshot() / pointsShare() / chipText() / push()
 * ===================================================================== */
'use strict';

const TT_STATS = (() => {
  const TTM = 'ttmouse';
  const blank = () => ({ model: '', pts: 0, contacts: 0, nets: 0,
                         dec: 0, ctrl: 0, txSum: 0, mySum: 0, txMin: 1.9, txMax: -1.9,
                         lost: { net: 0, out: 0, double: 0, serve: 0, other: 0 } });
  let cur = null, nSnap = 0;

  /* 当前模式下某侧的模型名（每次实时读取，不缓存——用户可在对局中切换模型） */
  function modelOf(side){
    let m = '';
    try{
      if(typeof sideModel === 'function') m = sideModel(side) || '';
      else if(typeof mode !== 'undefined' && mode === 'watch')
        m = side === 'player' ? (typeof fightL !== 'undefined' ? fightL : '')
                              : (typeof fightR !== 'undefined' ? fightR : '');
      else if(typeof aiModel !== 'undefined') m = side === 'ai' ? aiModel : '';
    }catch(e){ m = ''; }
    return m;
  }
  const pairName = () => modelOf('player') + ' vs ' + modelOf('ai');
  function active(){ return !!cur && (cur.sides.player.model === TTM || cur.sides.ai.model === TTM); }

  /* 失分原因归类（msg 是 UI 文案，用关键词归类；未知落 other） */
  function reasonOf(msg){
    const s = String(msg || '');
    if(/下网|未过网|撞网|网/.test(s)) return 'net';
    if(/出界|出台|出台/.test(s)) return 'out';
    if(/双跳/.test(s)) return 'double';
    if(/发球/.test(s)) return 'serve';
    return 'other';
  }
  const rate = (n, d) => d ? +(n / d * 100).toFixed(1) : 0;
  const view = (s) => ({ model: s.model, pts: s.pts, contacts: s.contacts,
                         netRate: rate(s.nets, s.contacts),
                         dec: s.dec, ctrlRate: rate(s.ctrl, s.dec),
                         txMean: s.dec ? +(s.txSum / s.dec).toFixed(3) : 0,
                         myMean: s.dec ? +(s.mySum / s.dec).toFixed(3) : 0,
                         txRange: [+(Math.min(s.txMin, 1.9)).toFixed(2), +(Math.max(s.txMax, -1.9)).toFixed(2)],
                         lostBy: s.lost });

  function snap(){
    if(!cur || !active()) return null;
    return { n: cur.n, t0: cur.t0, ptsTotal: cur.ptsTotal, pair: cur.pair,
             player: view(cur.sides.player), ai: view(cur.sides.ai) };
  }
  function pointsShare(){
    const s = snap(); if(!s) return null;
    const dqnSide = s.player.model === TTM ? 'player' : 'ai';
    const oppSide = dqnSide === 'player' ? 'ai' : 'player';
    const a = s[dqnSide].pts, b = s[oppSide].pts;
    return { dqnSide, oppSide, dqnModel: s[dqnSide].model, oppModel: s[oppSide].model,
             dqnPts: a, oppPts: b, total: a + b,
             share: (a + b) ? +(a / (a + b) * 100).toFixed(1) : null };
  }

  return {
    TTM,
    /* 换模型/开新局时调用；快照编号递增，便于跨局拼接 */
    reset(){
      const lp = modelOf('player'), la = modelOf('ai');
      cur = { n: ++nSnap, t0: Date.now(), ptsTotal: 0, pair: lp + ' vs ' + la,
              sides: { player: blank(), ai: blank() }, lastReason: '', lastWinner: '' };
      cur.sides.player.model = lp; cur.sides.ai.model = la;
    },
    /* 模型选择变化时自动开新快照（对局中切换模型不会把两段混在一个统计里）。
     * 只有两侧里有一侧是 DQN 时才计，所以普通对局零开销。 */
    sync(){
      const live = pairName();
      if(!cur || cur.pair !== live){ if(cur && (cur.sides.player.model === TTM || cur.sides.ai.model === TTM)) this.push(); this.reset(); }
    },
    /* rules.pointTo 调用：计一分，并把失分原因归到输家名下 */
    record(winner, msg){
      if(!cur || !active()) return;
      cur.sides[winner].pts++; cur.ptsTotal++;
      const loser = winner === 'player' ? 'ai' : 'player';
      const k = reasonOf(msg); cur.sides[loser].lost[k]++;
      cur.lastReason = msg || ''; cur.lastWinner = winner; cur.lastT = Date.now();
    },
    /* ttHit 调用：一次成功触球；net=true 表示这板出球撞网/下网 */
    noteHit(side, net){
      if(!cur || !active()) return;
      const s = cur.sides[side]; if(!s) return;
      s.contacts++; if(net) s.nets++;
    },
    /* ttTick 决策帧调用：动作分布 */
    noteAction(side, cmd){
      if(!cur || !active() || !cmd) return;
      const s = cur.sides[side]; if(!s) return;
      s.dec++; s.txSum += cmd.tx || 0; s.mySum += cmd.my != null ? cmd.my : 0.5;
      if(cmd.ctrl) s.ctrl++;
      if(cmd.tx > s.txMax) s.txMax = cmd.tx;
      if(cmd.tx < s.txMin) s.txMin = cmd.tx;
    },
    snapshot(){ return snap(); },
    pointsShare,
    /* 上报到训练控制台（无服务端 / 不可用时静默失败，绝不抛出） */
    push(){
      const s = snap();
      if(!s || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
      try{
        const body = JSON.stringify({ at: Date.now(), pair: cur.pair, snap: s, share: pointsShare() });
        return navigator.sendBeacon('/api/ttstats', new Blob([body], { type: 'application/json' }));
      }catch(e){ return false; }
    },
    /* HUD 一行文案；无 DQN 参赛或尚无得分时返回空串 */
    chipText(){
      const p = pointsShare(); if(!p || p.total === 0) return '';
      const d = snap()[p.dqnSide];
      return 'DQN ' + p.dqnPts + ':' + p.oppPts + ' (' + p.share + '%)'
           + ' · ' + d.contacts + ' 触球 / 擦网 ' + (d.netRate || 0) + '% · 对手 ' + p.oppModel;
    },
  };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = TT_STATS;
