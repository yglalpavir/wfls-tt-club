/* ========================================
   score-engine.js - 积分计算核心
   ======================================== */

function isMatchRecord(record) { return record['胜者'] && record['负者']; }
function isBonusRecord(record) { return record['类型'] === '比赛结果加分' && record['对象']; }

function getBaseScore(gap) { const ag = Math.abs(gap); if (gap >= 0) { if (ag <= 49) return 30; if (ag <= 99) return 24; if (ag <= 149) return 20; if (ag <= 199) return 16; if (ag <= 299) return 12; if (ag <= 399) return 8; return 4; } if (ag <= 49) return 30; if (ag <= 99) return 36; if (ag <= 149) return 42; if (ag <= 199) return 48; if (ag <= 299) return 54; if (ag <= 399) return 60; return 66; }
function getEventCoefficient(et) { if (!eventCoefficients) return 0.2; return eventCoefficients[et] || 0.2; }
function getTimeWeight(matchDate, snapshotDate) { const mt = new Date(matchDate + 'T00:00:00').getTime(), st = new Date(snapshotDate + 'T00:00:00').getTime(); const dd = (st - mt) / 86400000; if (dd < 0) return 0; return Math.pow(2, -dd / HALF_LIFE_DAYS); }
function calcMatchPoints(winner, loser, eventType, matchDate, snapshotDate, currentScores) { const wScore = currentScores[winner] || 1300, lScore = currentScores[loser] || 1300; return getBaseScore(wScore - lScore) * getEventCoefficient(eventType) * getTimeWeight(matchDate, snapshotDate); }
function calcRawPoints(winner, loser, eventType, currentScores) { const wScore = currentScores[winner] || 1300, lScore = currentScores[loser] || 1300; return getBaseScore(wScore - lScore) * getEventCoefficient(eventType); }

function getActivePlayers(sortedLog, startDate, endDate) { const ap = new Set(); sortedLog.forEach(r => { if (r['日期'] < startDate || r['日期'] > endDate) return; if (isMatchRecord(r)) { ap.add(r['胜者']); ap.add(r['负者']); } else if (isBonusRecord(r)) { ap.add(r['对象']); } }); return ap; }

function calculateAllRankingsWithSeasons(scoreLog, initialScores, seasons) {
    const sortedLog = [...scoreLog].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const allRankings = []; let seasonStartScores = { ...initialScores }; let currentScores = { ...initialScores };
    seasons.forEach((season, seasonIndex) => {
        if (seasonIndex > 0) { const ps = seasons[seasonIndex-1]; const pes = calculateEndScores(sortedLog, seasonStartScores, ps.startDate, ps.endDate); const is2 = {}; for (const n in seasonStartScores) { const ss = seasonStartScores[n]; const es = pes[n]||ss; is2[n] = ss+(es-ss)*0.5; } for (const n in initialScores) { if(!is2[n]) is2[n]=initialScores[n]; } currentScores=is2; seasonStartScores={...is2}; }
        const id = Object.entries(currentScores).sort((a,b)=>b[1]-a[1]).map(([n,pt])=>({'姓名':n,'当前积分':Math.round(pt*10)/10,'总场次':0,'胜率':'0%'}));
        allRankings.push({time:season.startDate,label:i18n[currentLang].season_initial_label.replace('{season}',season.label),season:season.label,isInitial:true,data:id});
        season.snapshotDates.forEach(sd => { if(sd<=season.startDate)return; const sc={...currentScores}; sortedLog.forEach(r=>{ if(r['日期']<season.startDate||r['日期']>sd)return; if(isMatchRecord(r)){const w=r['胜者'],l=r['负者'];if(!sc[w])sc[w]=1300;if(!sc[l])sc[l]=1300;const wg=calcMatchPoints(w,l,r['类型'],r['日期'],sd,sc);sc[w]=Math.max(SCORE_FLOOR,sc[w]+wg);sc[l]=Math.max(SCORE_FLOOR,sc[l]-wg*0.8);}else if(isBonusRecord(r)){const t=r['对象'];const b=parseFloat(r['分数'])||0;if(!sc[t])sc[t]=1300;sc[t]=Math.max(SCORE_FLOOR,sc[t]+b);} });
            const sap = getActivePlayers(sortedLog, season.startDate, sd);
            const sp = Object.entries(sc).filter(([n])=>sap.has(n)).sort((a,b)=>b[1]-a[1]).map(([n,pt])=>({'姓名':n,'当前积分':Math.round(pt*10)/10,'总场次':sortedLog.filter(r=>isMatchRecord(r)&&r['日期']>=season.startDate&&r['日期']<=sd&&(r['胜者']===n||r['负者']===n)).length,'胜率':(()=>{const ms=sortedLog.filter(r=>isMatchRecord(r)&&r['日期']>=season.startDate&&r['日期']<=sd&&(r['胜者']===n||r['负者']===n));if(!ms.length)return'0%';return Math.round((ms.filter(r=>r['胜者']===n).length/ms.length)*100)+'%';})()}));
            allRankings.push({time:sd,label:formatSnapshotLabel(sd),season:season.label,isInitial:false,data:sp}); });
        currentScores = calculateEndScores(sortedLog, currentScores, season.startDate, season.endDate);
    }); return allRankings;
}
function calculateEndScores(sl, ss, sst, sen) { const sc={...ss}; sl.forEach(r=>{ if(r['日期']<sst||r['日期']>sen)return; if(isMatchRecord(r)){const w=r['胜者'],l=r['负者'];if(!sc[w])sc[w]=1300;if(!sc[l])sc[l]=1300;const wg=calcMatchPoints(w,l,r['类型'],r['日期'],sen,sc);sc[w]=Math.max(SCORE_FLOOR,sc[w]+wg);sc[l]=Math.max(SCORE_FLOOR,sc[l]-wg*0.8);}else if(isBonusRecord(r)){const t=r['对象'];const b=parseFloat(r['分数'])||0;if(!sc[t])sc[t]=1300;sc[t]=Math.max(SCORE_FLOOR,sc[t]+b);} }); return sc; }
function formatSnapshotLabel(ds) { const d = new Date(ds + 'T00:00:00'); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`; }

// 获取快照日期所在的赛季
function getSeasonForDate(snapshotDate) {
    if (!seasonsData) return null;
    for (const season of seasonsData) {
        if (snapshotDate >= season.startDate && snapshotDate <= season.endDate) return season;
    }
    return seasonsData.length > 0 ? seasonsData[seasonsData.length-1] : null;
}

// 获取某赛季的初始积分（考虑继承）
function getSeasonStartScores(seasonIndex) {
    if (!initialScoresData || !seasonsData) return { ...initialScoresData.initialScores };
    if (seasonIndex <= 0) return { ...initialScoresData.initialScores };
    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    let startScores = { ...initialScoresData.initialScores };
    for (let i = 0; i < seasonIndex; i++) {
        const season = seasonsData[i];
        // 计算该赛季末积分
        const endScores = calculateEndScores(sortedLog, startScores, season.startDate, season.endDate);
        // 50% 继承规则：赛季初积分 + (赛季末 - 赛季初) * 0.5
        const inherited = {};
        for (const n in startScores) { const ss = startScores[n]; const es = endScores[n] || ss; inherited[n] = ss + (es - ss) * 0.5; }
        for (const n in initialScoresData.initialScores) { if (!inherited[n]) inherited[n] = initialScoresData.initialScores[n]; }
        startScores = inherited;
    }
    return { ...startScores };
}

// 计算实时积分（按当前日期快照）
function calculateRealtimeRanking() {
    if (!scoreLogData || !initialScoresData || !seasonsData || !seasonsData.length) return null;
    const today = new Date().toISOString().split('T')[0];
    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));

    // 找到今天所在的赛季（若今天已超出所有赛季，使用最后一个赛季并延伸至今天）
    let activeSeason = null, seasonIndex = -1;
    for (let i = 0; i < seasonsData.length; i++) {
        if (today >= seasonsData[i].startDate && today <= seasonsData[i].endDate) {
            activeSeason = seasonsData[i]; seasonIndex = i; break;
        }
    }
    if (!activeSeason) {
        activeSeason = seasonsData[seasonsData.length - 1];
        seasonIndex = seasonsData.length - 1;
    }

    // 计算赛季起始积分（含继承）
    let currentScores = { ...initialScoresData.initialScores };
    let seasonStartScores = { ...initialScoresData.initialScores };
    for (let i = 0; i <= seasonIndex; i++) {
        const season = seasonsData[i];
        if (i > 0) {
            const prevSeason = seasonsData[i - 1];
            const prevEndScores = calculateEndScores(sortedLog, seasonStartScores, prevSeason.startDate, prevSeason.endDate);
            const inherited = {};
            for (const n in seasonStartScores) { const ss = seasonStartScores[n]; const es = prevEndScores[n] || ss; inherited[n] = ss + (es - ss) * 0.5; }
            for (const n in initialScoresData.initialScores) { if (!inherited[n]) inherited[n] = initialScoresData.initialScores[n]; }
            currentScores = inherited; seasonStartScores = { ...inherited };
        }
        if (i < seasonIndex) { currentScores = calculateEndScores(sortedLog, currentScores, season.startDate, season.endDate); }
    }

    // 从当前赛季初计算到今天的积分
    const sc = { ...currentScores };
    const effectiveEnd = today < activeSeason.startDate ? activeSeason.startDate : today;
    sortedLog.forEach(r => {
        if (r['日期'] < activeSeason.startDate || r['日期'] > effectiveEnd) return;
        if (isMatchRecord(r)) {
            const w = r['胜者'], l = r['负者'];
            if (!sc[w]) sc[w] = 1300; if (!sc[l]) sc[l] = 1300;
            const wg = calcMatchPoints(w, l, r['类型'], r['日期'], effectiveEnd, sc);
            sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
            sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * 0.8);
        } else if (isBonusRecord(r)) {
            const t = r['对象']; const b = parseFloat(r['分数']) || 0;
            if (!sc[t]) sc[t] = 1300;
            sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
        }
    });

    const activeStart = activeSeason.startDate;
    const sap = getActivePlayers(sortedLog, activeStart, effectiveEnd);
    const sp = Object.entries(sc).filter(([n]) => sap.has(n)).sort((a, b) => b[1] - a[1]).map(([n, pt]) => ({
        '姓名': n, '当前积分': Math.round(pt * 10) / 10,
        '总场次': sortedLog.filter(r => isMatchRecord(r) && r['日期'] >= activeStart && r['日期'] <= effectiveEnd && (r['胜者'] === n || r['负者'] === n)).length,
        '胜率': (() => { const ms = sortedLog.filter(r => isMatchRecord(r) && r['日期'] >= activeStart && r['日期'] <= effectiveEnd && (r['胜者'] === n || r['负者'] === n)); if (!ms.length) return '0%'; return Math.round((ms.filter(r => r['胜者'] === n).length / ms.length) * 100) + '%'; })()
    }));

    return { time: today, label: i18n[currentLang].rank_realtime_label, season: activeSeason.label, isInitial: false, isRealtime: true, data: sp };
}

async function loadInitialScores() { try { initialScoresData = await (await fetch('data/initial-scores.json')).json(); return true; } catch(e) { console.error('initial-scores.json 加载失败', e); return false; } }
async function loadEventCoefficients() { try { eventCoefficients = await (await fetch('data/event-coefficient.json')).json(); return true; } catch(e) { console.error('event-coefficient.json 加载失败', e); return false; } }
async function loadSeasons() { try { seasonsData = await (await fetch('data/seasons.json')).json(); return true; } catch(e) { console.error('seasons.json 加载失败', e); seasonsData = []; return false; } }
async function loadScoreLogData() { try { scoreLogData = await (await fetch('data/score-log.json')).json(); } catch(e) { scoreLogData = []; } }
async function loadScoreLogForViz() { try { scoreLogData = await (await fetch('data/score-log.json')).json(); return true; } catch(e) { scoreLogData = []; return true; } }