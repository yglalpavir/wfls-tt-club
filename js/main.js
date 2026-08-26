/* ========================================
   main.js - 入口初始化
   ======================================== */

async function loadRankingDataForViz() {
    const progressEl = document.getElementById('playerCheckboxList');
    function showProgress(msg) {
        if (progressEl) {
            progressEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;color:var(--text-secondary);">
                <div class="wtt-spinner" style="width:32px;height:32px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin-bottom:12px;"></div>
                <p style="font-size:0.9rem;margin:0;">${msg || i18n[currentLang].data_viz_loading}</p>
            </div>`;
        }
    }

    showProgress(i18n[currentLang].data_viz_prepare);

    try {
        const dataFiles = [
            { name: 'players.json',         loader: loadPlayers,           label: i18n[currentLang].data_viz_file_players },
            { name: 'score-log.json',        loader: loadScoreLogForViz,    label: i18n[currentLang].data_viz_file_matches },
            { name: 'initial-scores.json',   loader: loadInitialScores,     label: i18n[currentLang].data_viz_file_initial },
            { name: 'event-coefficient.json',loader: loadEventCoefficients,   label: i18n[currentLang].data_viz_file_event },
            { name: 'decay-config.json',     loader: loadDecayConfig,         label: i18n[currentLang].data_viz_file_decay },
            { name: 'seasons.json',          loader: loadSeasons,             label: i18n[currentLang].data_viz_file_season }
        ];

        for (let i = 0; i < dataFiles.length; i++) {
            const f = dataFiles[i];
            showProgress(i18n[currentLang].data_viz_downloading.replace('{label}', f.label).replace('{i}', i + 1).replace('{total}', dataFiles.length).replace('{file}', f.name));
            await new Promise(r => setTimeout(r, 0));
            if (await f.loader() === false) throw new Error(f.name + ' 加载失败');
        }

        // 加载球员标签（可选）
        try { await loadPlayerTagsData(); } catch(e) {}

        if (!initialScoresData || !eventCoefficients || !seasonsData) throw new Error('数据加载失败');

        showProgress(i18n[currentLang].data_viz_calculating);
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
            progressEl.innerHTML = '<div style="padding:20px;color:var(--accent-red);">' + i18n[currentLang].data_viz_load_fail + '</div>';
        }
        return false;
    }
}

function initPage() {
    // detail 页：直接加载目标内容，跳过全量索引，加载更快、反馈更及时
    if (window.location.pathname.includes('detail.html')) {
        initCommon();
        if (typeof initDetailPageDirect === 'function') initDetailPageDirect();
        return;
    }
    // 按页面 DOM 标记按需加载数据，避免每个页面都下载全部数据
    if (document.getElementById('aboutSections') || document.getElementById('heroLastUpdated') || document.getElementById('coreMembersGrid')) loadAboutData();
    if (document.getElementById('coreMembersGrid') || document.getElementById('allMembersGrid')) loadMembersData();
    if (document.getElementById('newsPreviewGrid') || document.getElementById('newsFullGrid') || document.getElementById('detailContent')) loadNewsData();
    if (document.getElementById('competitionsPreviewGrid') || document.getElementById('competitionsFullGrid') || document.getElementById('detailContent')) loadCompetitionsData();
    if (document.getElementById('detailDraws') || document.getElementById('drawsContainer') || document.getElementById('drawsSection')) loadDrawsData();
    if (document.getElementById('qaFullGrid') || document.getElementById('qaList') || document.getElementById('detailContent')) loadQaData();
    if (document.getElementById('changelogTimeline') || document.getElementById('changelogList')) loadChangelogData();
    initCommon();
    const isRanking = !!document.getElementById('rankingFullBody'), isDataViz = !!document.getElementById('pointsTrendChart'), isWttDataViz = !!document.getElementById('wttPointsTrendChart'), isPersonalStats = !!document.getElementById('personalResult'), isPlayerPage = !!document.getElementById('playerDetailContent'), isWttPersonalStats = !!document.getElementById('wttPersonalPlayerSearchContainer') && !document.getElementById('wttPointsTrendChart');
    if (isRanking) { loadRankingData(); }
    if (isDataViz) { loadRankingDataForViz().then(() => { if (rankingTimeline.length) { initDataViz(); if (typeof initDataVizExtra === 'function') initDataVizExtra(); } }).catch(err => console.error('DataViz: 初始化失败', err)); }
    if (isPersonalStats) { loadRankingDataForViz().then(() => initPersonalStats()).catch(err => console.error('PersonalStats: 初始化失败', err)); }
    if (isPlayerPage) { loadRankingDataForViz().then(() => initPlayerPage()).catch(err => console.error('PlayerPage: 初始化失败', err)); }
    if (isWttDataViz) { wttLoadRankingDataForViz().then(() => { if (wttRankingTimeline.length) { initWttDataViz(); if (typeof initWttDataVizExtra === 'function') initWttDataVizExtra(); } }).catch(err => console.error('WttDataViz: 初始化失败', err)); }
    if (isWttPersonalStats) { wttLoadRankingDataForPersonal().then(() => { if (wttRankingTimeline.length) initWttPersonalStats(); }).catch(err => console.error('WttPersonalStats: 初始化失败', err)); }
    initPdfViewer();
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