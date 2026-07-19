/* ========================================
   main.js - 入口初始化
   ======================================== */

async function loadRankingDataForViz() {
    const progressEl = document.getElementById('playerCheckboxList');
    function showProgress(msg) {
        if (progressEl) {
            progressEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;color:var(--text-secondary);">
                <div class="wtt-spinner" style="width:32px;height:32px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin-bottom:12px;"></div>
                <p style="font-size:0.9rem;margin:0;">${msg || '加载数据中...'}</p>
            </div>`;
        }
    }

    showProgress('准备下载数据文件...');

    try {
        const dataFiles = [
            { name: 'score-log.json',        loader: loadScoreLogForViz,      label: '比赛记录' },
            { name: 'initial-scores.json',   loader: loadInitialScores,       label: '初始积分' },
            { name: 'event-coefficient.json',loader: loadEventCoefficients,   label: '赛事系数' },
            { name: 'seasons.json',          loader: loadSeasons,             label: '赛季配置' }
        ];

        for (let i = 0; i < dataFiles.length; i++) {
            const f = dataFiles[i];
            showProgress(`正在下载 ${f.label} (${i + 1}/${dataFiles.length}): ${f.name}`);
            await new Promise(r => setTimeout(r, 0));
            await f.loader();
        }

        // 加载球员标签（可选）
        try { await loadPlayerTagsData(); } catch(e) {}

        if (!initialScoresData || !eventCoefficients || !seasonsData) throw new Error('数据加载失败');

        showProgress('正在计算排名积分...');
        await new Promise(r => setTimeout(r, 0));

        // 同步计算（club数据量小，不需要分块异步）
        rankingTimeline = calculateAllRankingsWithSeasons(scoreLogData, initialScoresData.initialScores, seasonsData);
        const rt = calculateRealtimeRanking();
        if (rt) rankingTimeline.push(rt);
        return true;
    } catch(e) {
        console.error('DataViz: 排名计算失败', e);
        rankingTimeline = [];
        if (progressEl) {
            progressEl.innerHTML = '<div style="padding:20px;color:var(--accent-red);">❌ 排名数据加载失败，请刷新页面重试</div>';
        }
        return false;
    }
}

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