/* ========================================
   match-detail.js - 比赛详情页（match.html / wtt_match.html）
   展示单场比赛：大比分/局分、双方赛前/赛后积分、积分产生明细、赛前胜率预测、历史交锋。
   计算口径完全复用 score-engine 回放模式，与 player-page.js / wtt_player.js 逐位一致：
   - club：delta 的快照日期取今天（实时口径，衰减 + 定格）
   - WTT：快照日期取比赛日本身（权重恒 1，零和、无赛制系数），与 wtt_player.js 相同
   页面派发：main.js initPage 通过 #matchDetailBody 标记调用 initMatchDetail()。
   ======================================== */

/* WTT 模式：wtt_match.html 在本脚本加载前设 window.MD_WTT_MODE = true。
   差异集中在：数据加载（wttLoadSettingsAndFiles）、计算上下文（wttWithDataContextAsync）、
   球员链接（wttLinkPlayerName）；引擎全局由 wttWithDataContext 在计算期临时切换。 */
const MD_WTT = typeof window.MD_WTT_MODE !== 'undefined' && !!window.MD_WTT_MODE;

let mdModel = null;   // 计算结果缓存（含 error 态），语言切换时据此重渲染
let mdReady = false;

function mdPlayerLink(name) {
    if (MD_WTT && typeof wttLinkPlayerName === 'function') { return wttLinkPlayerName(name); }
    return linkPlayerName(name);
}

function mdLoadingHtml() {
    return `<div style="text-align:center;padding:60px 0;">
        <div class="wtt-spinner" style="width:36px;height:36px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin:0 auto 12px;"></div>
        <p style="color:var(--text-secondary);">${i18n[currentLang].data_viz_loading}</p>
    </div>`;
}

function mdRenderError(title, hint, showBack) {
    const body = document.getElementById('matchDetailBody');
    if (!body) return;
    const backUrl = MD_WTT ? ('wtt_ranking.html' + (mdModel && mdModel.cat ? '?cat=' + encodeURIComponent(mdModel.cat) : '')) : 'ranking.html';
    body.innerHTML = `<div class="detail-error" style="text-align:center;padding:48px 20px;">
        <i class="fa-solid fa-circle-question" style="font-size:2.2rem;color:var(--text-tertiary);"></i>
        <h3 style="margin:14px 0 8px;color:var(--text-primary);">${escapeHtml(title)}</h3>
        ${hint ? `<p style="color:var(--text-secondary);font-size:.88rem;margin:0 0 6px;">${escapeHtml(hint)}</p>` : ''}
        ${showBack ? `<a class="btn btn-sm btn-primary" style="margin-top:14px;" href="${backUrl}"><i class="fa-solid fa-arrow-left"></i> ${escapeHtml(i18n[currentLang].md_back_ranking)}</a>` : ''}
    </div>`;
}

/* club 模式数据加载（与 loadRankingDataForViz 同一组文件，但不计算排名时间线） */
async function mdLoadClubData() {
    const loaders = [loadPlayers, loadScoreLogData, loadInitialScores, loadEventCoefficients, loadDecayConfig, loadSeasons];
    for (const loader of loaders) {
        if (await loader() === false) return false;
    }
    return !!(scoreLogData && scoreLogData.length && initialScoresData && seasonsData && eventCoefficients);
}

/* ---- 定位与回放计算 ---- */
function mdCompute() {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date') || '';
    const type = params.get('type') || '';
    const w = params.get('w') || '';
    const l = params.get('l') || '';
    const n = Math.max(1, parseInt(params.get('n') || '1', 10) || 1);
    const cat = MD_WTT ? (wttCurrentCategory || params.get('cat') || 'ms') : null;
    if (!date || !type || !w || !l) return { error: 'notfound', cat };

    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));

    // 定位目标记录：元组计次（稳定排序下同日保持文件序，与引擎口径一致）
    let targetIdx = -1, occurrence = 0;
    for (let i = 0; i < sortedLog.length; i++) {
        const r = sortedLog[i];
        if (r['日期'] === date && r['类型'] === type && r['胜者'] === w && r['负者'] === l) {
            occurrence++;
            if (occurrence === n) { targetIdx = i; break; }
        }
    }
    if (targetIdx < 0 || !isMatchRecord(sortedLog[targetIdx])) return { error: 'notfound', cat };
    const target = sortedLog[targetIdx];

    // 赛季定位（与 getSeasonForDate 相同的越界回退：早于首季归首季、晚于末季归末季）
    let si = seasonsData.findIndex(s => target['日期'] >= s.startDate && target['日期'] <= s.endDate);
    if (si < 0) si = target['日期'] > seasonsData[seasonsData.length - 1].endDate ? seasonsData.length - 1 : 0;
    const season = seasonsData[si];
    // 定格批次与 player-page.js 一致：按整个赛季窗口构建。
    // 注意：getSeasonStartScores 内部的继承回放会改写 playerTypeBatches，故原始值要先存，权重也要在批次在位时取
    const prevBatches = playerTypeBatches;
    const scores = { ...getSeasonStartScores(si) };

    // 回放窗口：目标早于赛季开始（极端边界）时把窗口下界放宽到比赛日，否则按赛季起点
    const windowStart = target['日期'] < season.startDate ? target['日期'] : season.startDate;
    if (SCORE_TIME_DECAY_ENABLED !== false) playerTypeBatches = buildPlayerTypeBatches(sortedLog.filter(r => r['日期'] >= windowStart && r['日期'] <= season.endDate));

    const today = getTodayStr();
    let preW = null, preL = null, wg = 0, wl = 0, rawGain = 0, timeWW = 1, timeWL = 1;
    try {
        for (let i = 0; i < sortedLog.length; i++) {
            const r = sortedLog[i];
            if (r['日期'] > season.endDate) break;
            if (r['日期'] < windowStart) continue;
            // club：全部按今天口径（实时衰减+定格，同 player-page.js）；WTT：每场用自己的日期当快照（权重恒 1，同 wtt_player.js）
            const snap = MD_WTT ? r['日期'] : today;
            if (isMatchRecord(r)) {
                const rw = r['胜者'], rl = r['负者'];
                if (!scores[rw]) scores[rw] = DEFAULT_INITIAL_SCORE;
                if (!scores[rl]) scores[rl] = DEFAULT_INITIAL_SCORE;
                if (i === targetIdx) {
                    preW = scores[rw];
                    preL = scores[rl];
                    const dual = calcMatchPointsDual(rw, rl, r['类型'], r['日期'], snap, scores, r['赛制']);
                    wg = dual.wGain; wl = dual.lLoss;
                    rawGain = calcRawPoints(rw, rl, r['类型'], scores, r['赛制']);
                    // 胜负双方衰减权重不同：各按自己的 球员×类型 批次定格/衰减
                    timeWW = getFreezeWeight(rw, r['类型'], r['日期'], snap);
                    timeWL = getFreezeWeight(rl, r['类型'], r['日期'], snap);
                    break;
                }
                const gd = calcMatchPointsDual(rw, rl, r['类型'], r['日期'], snap, scores, r['赛制']);
                scores[rw] = Math.max(SCORE_FLOOR, scores[rw] + gd.wGain);
                scores[rl] = Math.max(SCORE_FLOOR, scores[rl] - gd.lLoss);
            } else if (isBonusRecord(r)) {
                const t = r['对象'], b = parseFloat(r['分数']) || 0;
                if (!scores[t]) scores[t] = DEFAULT_INITIAL_SCORE;
                scores[t] = Math.max(SCORE_FLOOR, scores[t] + b);
            }
        }
    } finally {
        playerTypeBatches = prevBatches;
    }
    if (preW == null || preL == null) return { error: 'notfound', cat };

    // 赛前 H2H（严格早于比赛日；顺带为每条记录记当日次序，供交锋表行链接到各自详情页）
    const h2hList = [];
    let h2hWWins = 0, h2hLWins = 0;
    const occCount = {};
    for (const r of sortedLog) {
        if (r['日期'] >= target['日期']) break;
        if (!isMatchRecord(r)) continue;
        const key = r['日期'] + '|' + r['类型'] + '|' + r['胜者'] + '|' + r['负者'];
        occCount[key] = (occCount[key] || 0) + 1;
        const rw = r['胜者'], rl = r['负者'];
        if ((rw === w && rl === l) || (rw === l && rl === w)) {
            h2hList.push({ date: r['日期'], type: r['类型'], winner: rw, loser: rl, n: occCount[key], score: r['比分'] || null });
            if (rw === w) h2hWWins++; else h2hLWins++;
        }
    }
    // 交锋表倒序展示（最近在前）。在计算阶段倒序而非渲染阶段：语言切换会重复调用
    // renderMatchDetail(mdModel)，若在渲染时 reverse 会导致顺序随重渲染来回翻转。
    // n（当日发生次序）在升序遍历时已赋好，倒序显示不影响详情页定位。
    h2hList.reverse();

    // 赛前状态分与三因子预测（两方向之和恒为 1）
    const fW = calcFormScore(w, target['日期']);
    const fL = calcFormScore(l, target['日期']);
    const predW = calcPredictedWinRate(preW, preL, h2hWWins, h2hLWins, fW, fL);
    const predL = calcPredictedWinRate(preL, preW, h2hLWins, h2hWWins, fL, fW);

    // 积分产生明细（各项即 calcMatchPoints 的乘数；最终以 calcMatchPointsDual 结果为准）
    const gap = preW - preL;
    const base = getBaseScore(gap);
    const eventC = getEventCoefficient(target['类型']);
    const fmtMult = getFormatMultiplier(target['类型'], target['赛制']);
    if (MD_WTT) { timeWW = 1; timeWL = 1; }

    return {
        cat,
        w, l, n,
        date: target['日期'], type: target['类型'],
        format: (target['赛制'] && target['赛制'] !== 'default') ? target['赛制'] : ((eventCoefficients && typeof eventCoefficients['默认赛制'] === 'object' && eventCoefficients['默认赛制'][target['类型']]) || ''),
        score: target['比分'] || null,
        games: Array.isArray(target['局分']) ? target['局分'] : null,
        seasonLabel: season.label || season.id || (season.startDate + ' ~ ' + season.endDate),
        preW, preL,
        postW: preW + wg,
        postL: preL - wl,
        deltaW: wg,
        deltaL: -wl,
        rawW: rawGain,
        rawL: -rawGain * LOSER_POINT_MULTIPLIER,
        breakdown: { gap, base, eventC, fmtMult, timeWW, timeWL },
        h2h: { list: h2hList, wWins: h2hWWins, lWins: h2hLWins },
        form: { w: fW, l: fL },
        pred: { w: predW, l: predL }
    };
}

/* ---- 渲染 ---- */
// 头像：club 模式优先 QQ 头像（与 members 页同一图源，失败回退名字首字符）；WTT 无本站档案，恒为首字符
// 扁平圆形：胜者描边强调即可，不用发光环/脉冲圈/角标这类"头像框"装饰
function mdAvatarHtml(name, isW) {
    const p = (!MD_WTT && typeof getPlayerByName === 'function') ? getPlayerByName(name) : null;
    const qq = p && p.qq && String(p.qq).trim() ? String(p.qq).trim() : '';
    const img = qq ? `<img class="md-avatar-img" src="https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(qq)}&s=640" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
    return `<div class="md-avatar ${isW ? 'md-avatar-w' : ''}">${escapeHtml(name.charAt(0))}${img}</div>`;
}

// 复制链接（clipboard API，拒绝时回退 textarea + execCommand）
function mdCopyText(text) {
    const legacy = () => new Promise(resolve => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove(); resolve(ok);
    });
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true).catch(() => legacy());
    return legacy();
}


// 站点惯例（player-page/ranking 弹窗一致）：主数字为未衰减值，括号内为按今天口径计入的衰减值
function mdDeltaHtml(raw, decayed, withDecayed) {
    const sign = raw >= 0 ? '+' : '';
    const cls = raw >= 0 ? 'md-change-pos' : 'md-change-neg';
    const note = withDecayed ? `<span class="md-decayed-note">（${i18n[currentLang].md_eff_now} ${decayed >= 0 ? '+' : ''}${decayed.toFixed(1)}）</span>` : '';
    return `<span class="${cls}">${sign}${raw.toFixed(1)}</span>${note}`;
}

// 记分牌两侧的积分变动胶囊（胜绿负红，带趋势箭头）
function mdDeltaPillHtml(raw, decayed, withDecayed) {
    const pos = raw >= 0;
    const note = withDecayed ? `<span class="md-decayed-note">${i18n[currentLang].md_eff_now} ${decayed >= 0 ? '+' : ''}${decayed.toFixed(1)}</span>` : '';
    return `<div class="md-delta-pill ${pos ? 'md-delta-pos' : 'md-delta-neg'}"><i class="fa-solid fa-caret-${pos ? 'up' : 'down'}"></i> ${pos ? '+' : ''}${raw.toFixed(1)}${note}</div>`;
}

// 记分牌一侧（胜者/负者）：头像 + 名字（带胜/负小标签）+ 赛前→赛后积分一行 + 变动胶囊
function mdArenaSideHtml(m, side, T) {
    const isW = side === 'w';
    const name = isW ? m.w : m.l;
    const pre = isW ? m.preW : m.preL;
    const post = isW ? m.postW : m.postL;
    const clubDelta = !MD_WTT;   // WTT 无衰减：raw 与 decayed 相同，只显示一个
    const deltaPill = isW ? mdDeltaPillHtml(m.rawW, m.deltaW, clubDelta) : mdDeltaPillHtml(m.rawL, m.deltaL, clubDelta);
    return `<div class="md-side ${isW ? 'md-side-w' : 'md-side-l'}">
        ${mdAvatarHtml(name, isW)}
        <div class="md-player-name">${mdPlayerLink(name)}<span class="md-side-tag ${isW ? 'md-tag-w' : 'md-tag-l'}">${isW ? T.md_winner_badge : T.md_loser_badge}</span></div>
        <div class="md-pts-line">
            <span class="md-pts-one"><em>${T.md_pre_score}</em>${pre.toFixed(1)}</span>
            <i class="fa-solid fa-arrow-right md-pts-arrow" aria-hidden="true"></i>
            <span class="md-pts-one md-pts-post"><em>${T.md_post_score}</em>${post.toFixed(1)}</span>
        </div>
        ${deltaPill}
    </div>`;
}

function renderMatchDetail(m) {
    const body = document.getElementById('matchDetailBody');
    if (!body) return;
    if (m.error === 'notfound') { mdRenderError(i18n[currentLang].md_not_found_title, i18n[currentLang].md_not_found_hint, true); return; }
    const T = i18n[currentLang];
    const backUrl = MD_WTT ? ('wtt_ranking.html?cat=' + encodeURIComponent(m.cat || 'ms')) : 'ranking.html';

    // 记分牌顶部信息条：日期/类型/赛制/赛季
    const chips = [];
    chips.push(`<span class="md-chip"><i class="fa-solid fa-calendar-day"></i> ${escapeHtml(m.date)}</span>`);
    chips.push(`<span class="md-chip"><i class="fa-solid fa-trophy"></i> ${escapeHtml(m.type)}</span>`);
    if (m.format) chips.push(`<span class="md-chip"><i class="fa-solid fa-layer-group"></i> ${escapeHtml(String(m.format).toUpperCase())}</span>`);
    chips.push(`<span class="md-chip"><i class="fa-solid fa-flag"></i> ${escapeHtml(String(m.seasonLabel))}</span>`);

    // 中列：状态 pill + 大比分（"3-1" → 3 : 1 巨型渐变数字，胜方绿色高亮；无比分退回 VS）
    let centerHtml;
    if (m.score) {
        const sm = String(m.score).match(/^(\d{1,2})\s*[-:：]\s*(\d{1,2})$/);
        const big = sm
            ? (() => {
                const aWin = parseInt(sm[1], 10) >= parseInt(sm[2], 10);
                return `<span class="md-digit ${aWin ? 'md-digit-win' : 'md-digit-loss'}">${sm[1]}</span><span class="md-score-sep">:</span><span class="md-digit ${aWin ? 'md-digit-loss' : 'md-digit-win'}">${sm[2]}</span>`;
            })()
            : escapeHtml(m.score);
        centerHtml = `<div class="md-status"><span class="md-status-dot"></span>${T.md_status_ft}</div><div class="md-big-score">${big}</div><div class="md-score-sub">${T.md_score_title}${T.md_score_persp}</div>`;
    } else {
        centerHtml = `<div class="md-status"><span class="md-status-dot"></span>${T.md_status_ft}</div><div class="md-vs-text">VS</div>`;
    }

    // 小比分卡：赛况记分明细表（行=双方、列=逐局，局内高分格高亮，末列为大比分；附总得分）
    let gamesHtml;
    if (m.games && m.games.length) {
        const parsed = m.games.map(g => {
            const mt = String(g).match(/^(\d{1,2})\s*[-:：]\s*(\d{1,2})$/);
            return mt ? { a: parseInt(mt[1], 10), b: parseInt(mt[2], 10) } : null;
        });
        if (parsed.every(p => p)) {
            let totA = 0, totB = 0, setsW = 0, setsL = 0;
            const wCells = [], lCells = [];
            parsed.forEach(p => {
                totA += p.a; totB += p.b;
                const wWon = p.a > p.b;   // 局分恒为胜者视角：a 大则胜者赢下该局
                if (wWon) setsW++; else setsL++;
                wCells.push(`<td class="${wWon ? 'md-st-win' : ''}">${p.a}</td>`);
                lCells.push(`<td class="${wWon ? '' : 'md-st-win'}">${p.b}</td>`);
            });
            const headCells = parsed.map((_, gi) => `<th>G${gi + 1}</th>`).join('');
            gamesHtml = `<div class="md-scoretable-wrap"><table class="md-scoretable">
                <thead><tr><th class="md-st-name-col"></th>${headCells}<th class="md-st-sets-col">${T.md_sets_col}</th></tr></thead>
                <tbody>
                    <tr><td class="md-st-name"><i class="fa-solid fa-trophy md-trophy" aria-hidden="true"></i>${mdPlayerLink(m.w)}</td>${wCells.join('')}<td class="md-st-sets md-st-win">${setsW}</td></tr>
                    <tr><td class="md-st-name">${mdPlayerLink(m.l)}</td>${lCells.join('')}<td class="md-st-sets">${setsL}</td></tr>
                </tbody></table></div>
                <div class="md-st-foot"><span class="md-st-total"><i class="fa-solid fa-table-tennis-paddle-ball"></i>${T.md_pts_total} <b>${totA}</b><span class="md-st-total-sep">:</span><b>${totB}</b></span></div>
                <div class="md-note"><i class="fa-solid fa-circle-info"></i> ${T.md_games_note}</div>`;
        } else {
            // 个别局分无法解析时退回逐局 chip 展示原始字符串
            const chipsHtml = m.games.map((g, gi) => {
                const mt = String(g).match(/^(\d{1,2})\s*[-:：]\s*(\d{1,2})$/);
                const a = mt ? parseInt(mt[1], 10) : null, b = mt ? parseInt(mt[2], 10) : null;
                const winGame = a != null && b != null && a > b;
                return `<span class="md-game-chip ${winGame ? 'md-game-w' : 'md-game-l'}"><span class="md-game-idx">G${gi + 1}</span><span class="md-game-score">${escapeHtml(String(g).replace('-', '–'))}</span></span>`;
            }).join('');
            gamesHtml = `<div class="md-games">${chipsHtml}</div><div class="md-note"><i class="fa-solid fa-circle-info"></i> ${T.md_games_note}</div>`;
        }
    } else {
        gamesHtml = `<div class="md-placeholder"><i class="fa-solid fa-circle-info"></i> ${T.md_score_none}<div class="md-note">${(MD_WTT && T.md_score_none_hint_wtt) ? T.md_score_none_hint_wtt : T.md_score_none_hint}</div></div>`;
    }

    // 积分产生明细：基础分×系数 = 本场产生（未衰减）；时间权重后 = 当前计入
    const bd = m.breakdown;
    const bdRow = (icon, label, desc, val, extra) =>
        `<div class="md-bd-row${extra ? ' ' + extra : ''}"><span class="md-bd-ico"><i class="fa-solid ${icon}"></i></span><div class="md-bd-text"><div class="md-bd-label">${label}</div>${desc ? `<div class="md-bd-desc">${desc}</div>` : ''}</div><div class="md-bd-val">${val}</div></div>`;
    const loserNote = raw => T.md_breakdown_loser_note.replace('{n}', String(LOSER_POINT_MULTIPLIER)).replace('{val}', raw);
    // 顶部公式链：基础 → ×赛事 → ×赛制 → = 产生（一眼看懂积分怎么来；衰减步骤在下文明细行）
    const fNodes = [];
    fNodes.push(`<span class="md-f-node"><b>${bd.base}</b><i>${T.md_breakdown_base}</i></span>`);
    fNodes.push(`<span class="md-f-node"><b>×${bd.eventC}</b><i>${T.md_breakdown_event}</i></span>`);
    if (!MD_WTT) fNodes.push(`<span class="md-f-node"><b>×${bd.fmtMult}</b><i>${T.md_breakdown_format}</i></span>`);
    const arrow = '<span class="md-f-arrow"><i class="fa-solid fa-angle-right"></i></span>';
    const formulaHtml = `<div class="md-formula">${fNodes.join(arrow)}<span class="md-f-arrow"><i class="fa-solid fa-equals"></i></span><span class="md-f-node md-f-res"><b>${m.rawW >= 0 ? '+' : ''}${m.rawW.toFixed(1)}</b><i>${T.md_breakdown_result}</i></span></div>`;
    const bdRows = [];
    bdRows.push(bdRow('fa-scale-balanced', T.md_breakdown_base, `${T.md_breakdown_gap} ${bd.gap >= 0 ? '+' : ''}${bd.gap.toFixed(1)} · ${bd.gap >= 0 ? T.md_breakdown_base_lead : T.md_breakdown_base_upset}`, bd.base));
    bdRows.push(bdRow('fa-trophy', T.md_breakdown_event, escapeHtml(m.type), `×${bd.eventC}`));
    if (!MD_WTT) bdRows.push(bdRow('fa-layer-group', T.md_breakdown_format, m.format ? escapeHtml(String(m.format).toUpperCase()) : '', `×${bd.fmtMult}`));
    bdRows.push(bdRow('fa-bolt', `<strong>${T.md_breakdown_result}</strong>`, loserNote(Math.abs(m.rawL).toFixed(1)), mdDeltaHtml(m.rawW, m.deltaW, false), 'md-bd-total'));
    if (MD_WTT) {
        bdRows.push(bdRow('fa-clock', T.md_breakdown_decay, '', T.md_breakdown_decay_off));
    } else {
        // 胜负双方衰减权重一般不同（各自 球员×类型 批次的定格日不同）：不同则分开展示
        const decayVal = Math.abs(bd.timeWW - bd.timeWL) < 1e-9
            ? `×${bd.timeWW.toFixed(3)}`
            : `${T.md_winner_badge} ×${bd.timeWW.toFixed(3)} · ${T.md_loser_badge} ×${bd.timeWL.toFixed(3)}`;
        bdRows.push(bdRow('fa-clock', T.md_breakdown_decay, '', decayVal));
        bdRows.push(bdRow('fa-check-double', T.md_eff_now, loserNote(Math.abs(m.deltaL).toFixed(1)), mdDeltaHtml(m.deltaW, m.deltaW, false), 'md-bd-total'));
    }

    // 赛前胜率卡
    const predWpct = (m.pred.w * 100), predLpct = (m.pred.l * 100);
    const hit = m.pred.w >= 0.5;
    const predBadge = `<span class="md-pred-badge ${hit ? 'md-pred-hit' : 'md-pred-upset'}"><i class="fa-solid ${hit ? 'fa-circle-check' : 'fa-bolt'}"></i> ${hit ? T.md_pred_hit : T.md_pred_upset}</span>`;
    const h2hSummary = (m.h2h.wWins + m.h2h.lWins) > 0
        ? T.md_h2h_summary.replace('{n}', String(m.h2h.wWins + m.h2h.lWins)).replace('{a}', mdPlayerLink(m.w)).replace('{aw}', String(m.h2h.wWins)).replace('{b}', mdPlayerLink(m.l)).replace('{bw}', String(m.h2h.lWins))
        : T.md_h2h_none;
    const fmtForm = v => `<b class="${v >= 0 ? 'md-change-pos' : 'md-change-neg'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}</b>`;

    // 历史交锋表
    let h2hTable = '';
    if (m.h2h.list.length) {
        const rows = m.h2h.list.map(r => {
            const url = buildMatchDetailUrl(r.date, r.type, r.winner, r.loser, r.n, m.cat);
            return `<tr><td><a class="player-name-link" href="${url}">${escapeHtml(r.date)}</a></td><td>${escapeHtml(r.type)}</td><td>${mdPlayerLink(r.winner)}</td><td>${r.score ? escapeHtml(r.score) : '-'}</td></tr>`;
        }).join('');
        h2hTable = `<div class="md-card glass-card md-anim"><div class="md-card-title"><i class="fa-solid fa-clock-rotate-left"></i> ${T.md_h2h_title}</div><div class="score-detail-table-wrapper md-h2h-wrap"><table class="score-detail-table"><thead><tr><th>${T.data_viz_col_date}</th><th>${T.data_viz_col_type}</th><th>${T.data_viz_col_winner}</th><th>${T.md_col_score}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }

    document.title = `${m.w} vs ${m.l} · ${T.md_hero_title}`;

    // 头部行：返回 + 右侧工具（同日多场时的场次标记、复制链接）
    const occChip = m.n > 1 ? `<span class="md-occ"><i class="fa-solid fa-repeat"></i> ${T.md_occurrence.replace('{n}', String(m.n))}</span>` : '';

    body.innerHTML = `
        <div class="md-header-row">
            <a class="btn btn-sm btn-secondary" href="${backUrl}"><i class="fa-solid fa-arrow-left"></i> ${T.md_back_ranking}</a>
            <div class="md-header-tools">${occChip}<button type="button" class="btn btn-sm btn-secondary md-copy-btn"><i class="fa-solid fa-link"></i> ${T.md_copy_link}</button></div>
        </div>
        <div class="md-arena md-anim">
            <div class="md-arena-meta">${chips.join('')}</div>
            <div class="md-arena-main">
                ${mdArenaSideHtml(m, 'w', T)}
                <div class="md-center">${centerHtml}</div>
                ${mdArenaSideHtml(m, 'l', T)}
            </div>
        </div>
        <div class="md-card glass-card md-anim">
            <div class="md-card-title"><i class="fa-solid fa-table-tennis-paddle-ball"></i> ${T.md_games_title}</div>
            ${gamesHtml}
        </div>
        <div class="md-duo">
            <div class="md-card glass-card md-anim">
                <div class="md-card-title"><i class="fa-solid fa-calculator"></i> ${T.md_breakdown_title}</div>
                ${formulaHtml}
                <div class="md-bd-list">${bdRows.join('')}</div>
            </div>
            <div class="md-card glass-card md-anim">
                <div class="md-card-title"><i class="fa-solid fa-percent"></i> ${T.md_pred_title} ${predBadge}</div>
                <div class="md-pred-hero">
                    <div class="md-pred-side"><div class="md-pred-pct md-pred-pct-w">${predWpct.toFixed(1)}<small>%</small></div><div class="md-pred-name">${mdPlayerLink(m.w)}</div></div>
                    <div class="md-pred-side md-pred-side-r"><div class="md-pred-pct md-pred-pct-l">${predLpct.toFixed(1)}<small>%</small></div><div class="md-pred-name">${mdPlayerLink(m.l)}</div></div>
                </div>
                <div class="md-pred-track"><div class="md-pred-seg md-seg-w" style="width:${predWpct.toFixed(1)}%;"></div><div class="md-pred-seg md-seg-l" style="width:${predLpct.toFixed(1)}%;"></div></div>
                <div class="md-note"><i class="fa-solid fa-chart-line"></i> ${T.md_pred_form}：${escapeHtml(m.w)} ${fmtForm(m.form.w)} · ${escapeHtml(m.l)} ${fmtForm(m.form.l)}</div>
                <div class="md-note"><i class="fa-solid fa-handshake"></i> ${h2hSummary}</div>
                <div class="md-note"><i class="fa-solid fa-circle-info"></i> ${T.md_pred_model_note}</div>
            </div>
        </div>
        ${h2hTable}
    `;

    // 复制链接按钮（事件绑定在渲染后，避免内联 handler）
    const copyBtn = body.querySelector('.md-copy-btn');
    if (copyBtn) {
        const origHtml = copyBtn.innerHTML;
        copyBtn.addEventListener('click', () => {
            mdCopyText(window.location.href).then(ok => {
                if (!ok) return;
                copyBtn.classList.add('md-copied');
                copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> ${i18n[currentLang].md_copied}`;
                setTimeout(() => { copyBtn.classList.remove('md-copied'); copyBtn.innerHTML = origHtml; }, 1600);
            });
        });
    }
}

/* ---- 入口（main.js 通过 #matchDetailBody 派发）---- */
async function initMatchDetail() {
    const body = document.getElementById('matchDetailBody');
    if (!body || mdReady) return;
    body.innerHTML = mdLoadingHtml();
    let ok = false;
    try {
        if (MD_WTT) {
            wttDetectCategory();
            await wttLoadSettingsAndFiles(true, null);
            ok = !!(wttScoreLogData && wttScoreLogData.length);
            if (ok) {
                wttApplyNameNormalization();   // 与其他 WTT 页一致：匹配前先做名字归一
                mdModel = await wttWithDataContextAsync(() => mdCompute());
            }
        } else {
            ok = await mdLoadClubData();
            if (ok) mdModel = mdCompute();
        }
    } catch (e) {
        console.error('MatchDetail: 初始化失败', e);
        ok = false;
    }
    mdReady = true;
    if (!ok || !mdModel) { mdRenderError(i18n[currentLang].md_load_fail, '', true); return; }
    renderMatchDetail(mdModel);
}

/* 语言切换整体重渲染（setLanguage 探测 matchDetailReapplyI18n） */
function matchDetailReapplyI18n() {
    if (!mdReady || !mdModel) return;
    renderMatchDetail(mdModel);
}
