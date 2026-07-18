/* ========================================
   main.js - 入口初始化
   ======================================== */

async function loadRankingDataForViz() { try { await Promise.all([loadInitialScores(), loadEventCoefficients(), loadSeasons(), loadScoreLogForViz(), loadPlayerTagsData()]); if (!initialScoresData || !eventCoefficients || !seasonsData) throw new Error('数据加载失败'); rankingTimeline = calculateAllRankingsWithSeasons(scoreLogData, initialScoresData.initialScores, seasonsData); const rt = calculateRealtimeRanking(); if (rt) rankingTimeline.push(rt); return true; } catch(e) { console.error('DataViz: 排名计算失败', e); rankingTimeline = []; return false; } }

function initPage() {
    loadAboutData(); loadMembersData(); loadNewsData(); loadCompetitionsData(); loadDrawsData(); loadQaData(); loadChangelogData();
    initCommon();
    const isRanking = !!document.getElementById('rankingFullBody'), isDataViz = !!document.getElementById('pointsTrendChart'), isWttDataViz = !!document.getElementById('wttPointsTrendChart'), isPersonalStats = !!document.getElementById('personalPlayerSelect'), isWttPersonalStats = !!document.getElementById('wttPersonalPlayerSelect') && !document.getElementById('wttPointsTrendChart');
    if (isRanking) { loadRankingData(); }
    if (isDataViz) { loadRankingDataForViz().then(() => { if (rankingTimeline.length) initDataViz(); }).catch(err => console.error('DataViz: 初始化失败', err)); }
    if (isPersonalStats) { loadRankingDataForViz().then(() => { if (rankingTimeline.length) initPersonalStats(); }).catch(err => console.error('PersonalStats: 初始化失败', err)); }
    if (isWttDataViz) { wttLoadRankingDataForViz().then(() => { if (wttRankingTimeline.length) initWttDataViz(); }).catch(err => console.error('WttDataViz: 初始化失败', err)); }
    if (isWttPersonalStats) { wttLoadRankingDataForPersonal().then(() => { if (wttRankingTimeline.length) initWttPersonalStats(); }).catch(err => console.error('WttPersonalStats: 初始化失败', err)); }
    initPdfViewer();
    if (window.location.pathname.includes('detail.html') && (newsData.length > 0 || competitionsData.length > 0)) updateDetailPage();
}

document.querySelectorAll('a[href^="#"]').forEach(a => { a.addEventListener('click', e => { const href = a.getAttribute('href'); if (href === '#') return; const t = document.querySelector(href); if (t) { e.preventDefault(); t.scrollIntoView({ behavior:'smooth' }); } }); });
function bootApp() {
    highlightNavByPath();
    initPage();
}
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}
window.addEventListener('popstate', highlightNavByPath);