/* ========================================
   data-scale.js — 数据规模页（data_scale.html）
   实时统计 = 浏览器直接 fetch 便便宜的数据算出来；
   预计算 = data/dataset-stats.json（部署时由 tools/gen_dataset_stats.py 生成，
   装 wtt_data 那 10 MB 的汇总，浏览器算不出来）。
   每个数字取 live ?? pre，取不到就整块不渲染 —— 页面不出现任何报错或内部实现说明。
   ======================================== */
(function () {
    'use strict';

    var WTT_DIRS = ['ms', 'ws', 'md', 'wd', 'xd'];
    var VIDEO_EXT = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    var IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp'];

    var state = { ready: false, live: null, pre: null, assets: null, chart: null, themeObserver: null };

    /* ---------- 取数 ---------- */

    function getJson(url) {
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
            return r.json();
        });
    }
    // 单个数据源失败不应拖垮整页
    function softJson(url) { return getJson(url).catch(function () { return null; }); }

    function tally(list, keyFn) {
        var map = new Map();
        list.forEach(function (it) {
            var k = keyFn(it);
            if (k == null) return;
            map.set(k, (map.get(k) || 0) + 1);
        });
        return map;
    }

    function uniq(arr) { return Array.from(new Set(arr)); }

    function loadClubStats() {
        // 走共享 loader：它会建好 players 索引，playerDisplayName() 才能在英文模式下取到拼音名
        return Promise.all([
            loadPlayers(), softJson('data/score-log.json'),
            softJson('data/seasons.json'), softJson('data/draws.json'),
            softJson('data/news/index.json'), softJson('data/competitions/index.json'),
            softJson('data/qa/index.json'), softJson('data/changelog.json')
        ]).then(function (r) {
            var players = (playersData && playersData.players) || [];
            var log = r[1] || [], seasons = r[2] || [], draws = r[3] || [];
            var news = r[4] || [], comps = r[5] || [], qa = r[6] || [], changelog = r[7] || [];

            // 比赛记录 = 同时有胜者与负者；其余为积分调整记录
            var matches = log.filter(function (x) { return x['胜者'] && x['负者']; });
            var adjusts = log.filter(function (x) { return !x['胜者'] && x['对象'] && x['分数']; });

            var days = new Set(), months = new Map(), types = new Map();
            var minDate = null, maxDate = null, games = 0;
            matches.forEach(function (m) {
                var d = m['日期'];
                if (typeof d !== 'string' || d.length < 10) return;
                days.add(d.slice(0, 10));
                var ym = d.slice(0, 7);
                months.set(ym, (months.get(ym) || 0) + 1);
                if (m['类型']) types.set(m['类型'], (types.get(m['类型']) || 0) + 1);
                if (minDate === null || d < minDate) minDate = d;
                if (maxDate === null || d > maxDate) maxDate = d;
                if (Array.isArray(m['局分'])) games += m['局分'].length;
            });

            var snapshotDays = 0;
            seasons.forEach(function (s) { if (Array.isArray(s.snapshotDates)) snapshotDays += s.snapshotDates.length; });

            var drawCards = 0, drawLinks = 0;
            draws.forEach(function (d) {
                if (Array.isArray(d.cards)) drawCards += d.cards.length;
                if (Array.isArray(d.connections)) drawLinks += d.connections.length;
            });

            var tagTally = new Map(), honors = [], roles = [];
            players.forEach(function (p) {
                (p.tags || []).forEach(function (t) { tagTally.set(t, (tagTally.get(t) || 0) + 1); });
                honors = honors.concat(p.honors || []);
                if (p.role) roles.push(p.name);
            });

            var mediaCount = 0;
            [news, comps, qa].forEach(function (list) {
                list.forEach(function (it) { mediaCount += (it.media || []).length; });
            });

            return {
                players: players.length,
                matches: matches.length,
                games: games,
                matchDays: days.size,
                minDate: minDate, maxDate: maxDate,
                months: Array.from(months.entries()).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }),
                types: Array.from(types.entries()).sort(function (a, b) { return b[1] - a[1]; }),
                adjusts: adjusts.length,
                adjustSum: adjusts.reduce(function (s, x) { return s + (parseFloat(x['分数']) || 0); }, 0),
                seasons: seasons.length, snapshotDays: snapshotDays,
                drawCards: drawCards, drawLinks: drawLinks,
                tags: Array.from(tagTally.entries()).sort(function (a, b) { return b[1] - a[1]; }),
                honors: uniq(honors), roles: roles,
                entries: news.length + comps.length + qa.length,
                entriesByType: { news: news.length, competitions: comps.length, qa: qa.length },
                media: mediaCount, releases: changelog.length
            };
        });
    }

    // 年度赛事档案份数与排名快照点：manifest.json + seasons.json，加起来不到 50 KB
    function loadProStats() {
        return Promise.all(WTT_DIRS.map(function (d) { return softJson('wtt_data/' + d + '/manifest.json'); }))
            .then(function (manifests) {
                return Promise.all(WTT_DIRS.map(function (d) { return softJson('wtt_data/' + d + '/seasons.json'); }))
                    .then(function (seasonLists) {
                        var files = 0, years = [], seasons = 0, snaps = 0;
                        manifests.forEach(function (m) {
                            (m && m.scoreFiles || []).forEach(function (f) {
                                files++;
                                var y = f.match(/(\d{4})/);
                                if (y) years.push(Number(y[1]));
                            });
                        });
                        seasonLists.forEach(function (list) {
                            (list || []).forEach(function (s) {
                                seasons++;
                                if (Array.isArray(s.snapshotDates)) snaps += s.snapshotDates.length;
                            });
                        });
                        var out = { files: files, seasons: seasons, snapshots: snaps };
                        if (years.length) out.years = [Math.min.apply(null, years), Math.max.apply(null, years)];
                        return out;
                    });
            });
    }

    /* 素材库：复用 docs.html 的数据源，按扩展名归成视频/图片/其他三档 */
    function loadAssets() {
        return softJson('Assets/manifest.json').then(function (m) {
            if (!m || !m.tree) return null;
            var b = { video: { n: 0, bytes: 0 }, image: { n: 0, bytes: 0 }, doc: { n: 0, bytes: 0 } };
            (function walk(node) {
                (node.c || []).forEach(function (child) {
                    if (child.t === 'd') { walk(child); return; }
                    var e = (child.e || '').toLowerCase();
                    var k = VIDEO_EXT.indexOf(e) >= 0 ? 'video' : IMAGE_EXT.indexOf(e) >= 0 ? 'image' : 'doc';
                    b[k].n++;
                    b[k].bytes += child.sz || 0;
                });
            })(m.tree);
            return { fileCount: m.fileCount, buckets: b };
        });
    }

    /* ---------- 格式化 ---------- */

    function t(key, vars) {
        var s = (i18n[currentLang] && i18n[currentLang][key]) || key;
        if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
        return s;
    }
    function fmtInt(n) {
        if (typeof n !== 'number' || !isFinite(n)) return '';
        return n.toLocaleString(currentLang === 'zh' ? 'zh-CN' : 'en-US');
    }
    function fmtBytes(b) {
        if (typeof b !== 'number' || !isFinite(b) || b <= 0) return '';
        var mb = b / 1024 / 1024;
        return (mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB');
    }
    function wttLabel(key) {
        return (i18n[currentLang] && i18n[currentLang]['wtt_cat_' + key]) || key;
    }
    function cssVar(name, fallback) {
        var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    }

    /* ---------- 片段 ---------- */

    // value/sub/label 任一为空则整块不渲染（数据源缺失时安静跳过）
    function kpi(icon, value, label, tone, sub) {
        if (!value || !label) return '';
        return '<div class="ds-kpi glass-card' + (tone ? ' ds-tone-' + tone : '') + '">' +
            '<i class="fa-solid ' + icon + '"></i>' +
            '<span class="ds-kpi-value">' + escapeHtml(value) + '</span>' +
            '<span class="ds-kpi-label">' + escapeHtml(label) + '</span>' +
            (sub ? '<span class="ds-kpi-sub">' + escapeHtml(sub) + '</span>' : '') +
            '</div>';
    }

    function kpiRow(tiles) {
        var html = tiles.filter(Boolean).join('');
        return html ? '<div class="ds-kpi-row">' + html + '</div>' : '';
    }

    // items: [{ label, value, text }]，条宽按本组最大值归一
    function bars(items, tone) {
        if (!items.length) return '';
        var max = items.reduce(function (m, x) { return Math.max(m, x.value); }, 0) || 1;
        return '<div class="ds-bars">' + items.map(function (it) {
            var pct = Math.max(1.5, it.value / max * 100);
            return '<div class="ds-bar-row">' +
                '<span class="ds-bar-label">' + escapeHtml(it.label) + '</span>' +
                '<span class="ds-bar-track"><span class="ds-bar-fill' + (tone ? ' ds-fill-' + tone : '') +
                '" style="width:' + pct.toFixed(1) + '%" role="img" aria-label="' +
                escapeHtml(it.label + ' ' + it.text) + '"></span></span>' +
                '<span class="ds-bar-value">' + escapeHtml(it.text) + '</span>' +
                '</div>';
        }).join('') + '</div>';
    }

    function chipBlock(title, items) {
        if (!items.length) return '';
        return '<div class="ds-chip-block"><h4>' + escapeHtml(title) + '</h4><div class="ds-chips">' +
            items.map(function (x) { return '<span class="ds-chip">' + escapeHtml(x) + '</span>'; }).join('') +
            '</div></div>';
    }

    function links(html) { return html ? '<div class="ds-links">' + html + '</div>' : ''; }

    function btn(href, label, icon) {
        return '<a href="' + escapeHtml(href) + '" class="btn btn-sm ds-btn">' +
            (icon ? '<i class="fa-solid ' + icon + '"></i>' : '') + escapeHtml(label) + '</a>';
    }

    function section(id, title, desc, body) {
        if (!body) return '';
        return '<section class="ds-section" id="' + id + '">' +
            '<div class="ds-section-head"><h2>' + escapeHtml(title) + '</h2>' +
            (desc ? '<p>' + escapeHtml(desc) + '</p>' : '') + '</div>' + body + '</section>';
    }

    function card(title, body) {
        if (!body) return '';
        return '<div class="ds-card glass-card"><h3>' + escapeHtml(title) + '</h3>' + body + '</div>';
    }

    function asOfDate() {
        var L = state.live, wttTo = state.pre && state.pre.wtt && state.pre.wtt.dateRange && state.pre.wtt.dateRange.to;
        return [L && L.maxDate, wttTo].filter(Boolean).sort().pop() || null;
    }

    /* ---------- 各板块 ---------- */

    function renderHeroMeta() {
        var el = document.getElementById('dsHeroMeta');
        var L = state.live;
        if (!el || !L) return;
        var range = state.pre && state.pre.wtt && state.pre.wtt.dateRange;
        var bits = [];
        var asOf = asOfDate();
        if (asOf) bits.push(t('ds_asof') + ' ' + asOf);
        if (L.minDate && L.maxDate) bits.push(t('ds_club_range') + ' ' + L.minDate + ' – ' + L.maxDate);
        if (range) bits.push(t('ds_pro_range') + ' ' + range.from + ' – ' + range.to);
        el.innerHTML = bits.map(escapeHtml).join('<span class="ds-sep">·</span>');
    }

    function renderOverview() {
        var L = state.live, totals = (state.pre && state.pre.wtt && state.pre.wtt.totals) || {};
        return kpiRow([
            kpi('fa-users', fmtInt(L.players), t('ds_kpi_members')),
            kpi('fa-table-tennis-paddle-ball', fmtInt(L.matches), t('ds_kpi_club_matches'), 'blue'),
            kpi('fa-globe', fmtInt(totals.records), t('ds_kpi_pro_records'), 'gold'),
            kpi('fa-star', fmtInt(totals.players), t('ds_kpi_pro_players'), 'gold')
        ]);
    }

    function renderClub() {
        var L = state.live;
        var row = kpiRow([
            kpi('fa-calendar', fmtInt(L.seasons), t('ds_kpi_seasons')),
            kpi('fa-camera', fmtInt(L.snapshotDays), t('ds_kpi_snapshot_days')),
            kpi('fa-clock', fmtInt(L.matchDays), t('ds_kpi_match_days')),
            kpi('fa-list-ol', fmtInt(L.games), t('ds_kpi_games')),
            kpi('fa-sliders', fmtInt(L.adjusts), t('ds_kpi_adjust'), null,
                (L.adjustSum > 0 ? '+' : '') + fmtInt(Math.round(L.adjustSum))),
            kpi('fa-sitemap', fmtInt(L.drawCards), t('ds_kpi_draws'))
        ]);

        var grid = '<div class="ds-grid">' +
            card(t('ds_bars_types_title'), bars(L.types.map(function (x) {
                return { label: eventTypeLabel(x[0]), value: x[1], text: fmtInt(x[1]) };
            }), 'blue')) +
            card(t('ds_chart_month_title'), L.months.length ?
                '<p class="ds-card-desc">' + escapeHtml(t('ds_chart_month_desc')) + '</p>' +
                '<div class="ds-chart-box"><canvas id="dsMonthChart"></canvas></div>' : '') +
            '</div>';

        var chips = chipBlock(t('ds_chips_tags'), L.tags.map(function (x) {
            return playerTagLabel(x[0]) + ' ×' + x[1];
        })) +
            chipBlock(t('ds_chips_honors'), L.honors.map(playerHonorLabel)) +
            chipBlock(t('ds_chips_roles'), L.roles.map(playerDisplayName));

        return row + grid + chips;
    }

    function renderPro() {
        var wtt = (state.pre && state.pre.wtt) || {};
        var totals = wtt.totals || {};
        var lw = state.live.wtt || {};
        var years = wtt.years || lw.years;

        var desc = years ? t('ds_sec_wtt_desc', {
            years: years[1] - years[0] + 1,
            seasons: fmtInt(lw.seasons),
            files: fmtInt(lw.files)
        }) : '';

        var row = kpiRow([
            kpi('fa-trophy', fmtInt(totals.records), t('ds_kpi_pro_records'), 'gold'),
            kpi('fa-star', fmtInt(totals.players), t('ds_kpi_pro_players'), 'gold'),
            kpi('fa-camera', fmtInt(lw.snapshots), t('ds_kpi_pro_snapshots')),
            kpi('fa-tags', fmtInt(totals.eventTypes), t('ds_kpi_pro_events')),
            kpi('fa-calendar-days', years ? fmtInt(years[1] - years[0] + 1) : '', t('ds_kpi_pro_years'))
        ]);

        var barsHtml = card(t('ds_bars_pro_title'), bars((wtt.dirs || []).map(function (d) {
            return { label: wttLabel(d.key), value: d.records, text: fmtInt(d.records) };
        }), 'gold'));

        var btns = links(
            btn('wtt_hub.html', t('ds_btn_pro_home'), 'fa-house') +
            btn('wtt_ranking.html', t('ds_btn_pro_rank'), 'fa-ranking-star') +
            btn('wtt_dataviz.html', t('ds_btn_pro_viz'), 'fa-chart-column') +
            btn('qa.html', t('ds_btn_rules'), 'fa-book-open')
        );

        return { desc: desc, body: row + barsHtml + btns };
    }

    function renderContent() {
        var L = state.live, P = state.pre || {}, A = state.assets;
        var row = kpiRow([
            kpi('fa-newspaper', fmtInt(L.entries), t('ds_kpi_entries')),
            kpi('fa-clock-rotate-left', P.content ? fmtInt(P.content.revisions) : '', t('ds_kpi_revisions')),
            kpi('fa-paperclip', fmtInt(L.media), t('ds_kpi_media')),
            kpi('fa-list', fmtInt(L.releases), t('ds_kpi_releases')),
            kpi('fa-photo-film', A ? fmtInt(A.fileCount) : '', t('ds_kpi_asset_files'))
        ]);

        var assetCard = '';
        if (A) {
            var b = A.buckets;
            assetCard = card(t('ds_bars_asset_title'), bars([
                { label: t('ds_asset_video'), value: b.video.bytes, text: fmtBytes(b.video.bytes) + ' · ' + t('ds_asset_files_fmt', { n: fmtInt(b.video.n) }) },
                { label: t('ds_asset_image'), value: b.image.bytes, text: fmtBytes(b.image.bytes) + ' · ' + t('ds_asset_files_fmt', { n: fmtInt(b.image.n) }) },
                { label: t('ds_asset_doc'), value: b.doc.bytes, text: fmtBytes(b.doc.bytes) + ' · ' + t('ds_asset_files_fmt', { n: fmtInt(b.doc.n) }) }
            ], 'green'));
        }

        var vol = P.bytes && P.bytes.total
            ? '<p class="ds-note">' + escapeHtml(t('ds_data_volume', { size: fmtBytes(P.bytes.total) })) + '</p>' : '';

        var btns = links(
            btn('news.html', t('ds_btn_news'), 'fa-newspaper') +
            btn('competitions.html', t('ds_btn_comp'), 'fa-trophy') +
            btn('qa.html', t('ds_btn_qa'), 'fa-circle-question') +
            btn('changelog.html', t('ds_btn_changelog'), 'fa-clock-rotate-left') +
            btn('docs.html', t('ds_btn_docs'), 'fa-folder-open')
        );

        return row + (assetCard ? '<div class="ds-grid ds-grid-1">' + assetCard + '</div>' : '') + vol + btns;
    }

    function renderJoin() {
        var asOf = asOfDate();
        return {
            desc: '',
            body: '<p class="ds-lead">' + escapeHtml(t('ds_sec_join_desc')) + '</p>' +
                (asOf ? '<p class="ds-note">' + escapeHtml(t('ds_asof') + ' ' + asOf) + '</p>' : '') +
                links(btn('submit.html', t('ds_btn_submit'), 'fa-pen-to-square') +
                    btn('qa.html', t('ds_btn_rules'), 'fa-book-open') +
                    btn('changelog.html', t('ds_btn_changelog'), 'fa-clock-rotate-left'))
        };
    }

    function render() {
        var body = document.getElementById('dsBody');
        if (!body || !state.live) return;
        var pro = renderPro(), join = renderJoin();

        body.innerHTML = renderOverview() +
            section('ds-sec-club', t('ds_sec_club'), t('ds_sec_club_desc'), renderClub()) +
            section('ds-sec-pro', t('ds_sec_wtt'), pro.desc, pro.body) +
            section('ds-sec-content', t('ds_sec_content'), t('ds_sec_content_desc'), renderContent()) +
            section('ds-sec-join', t('ds_sec_join'), join.desc, join.body);

        renderHeroMeta();
        renderChart();
    }

    /* ---------- 逐月柱状图 ---------- */

    function renderChart() {
        var canvas = document.getElementById('dsMonthChart');
        if (!canvas || !state.live || !state.live.months.length) return;
        // Chart.js 没加载成功就静默不画图，页面其余部分照常
        if (typeof Chart !== 'function') { canvas.parentNode.innerHTML = ''; return; }

        if (state.chart) { state.chart.destroy(); state.chart = null; }
        var months = state.live.months;

        state.chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: months.map(function (m) {
                    return t('ds_month_fmt', { m: Number(m[0].split('-')[1]) });
                }),
                datasets: [{
                    label: '',
                    data: months.map(function (m) { return m[1]; }),
                    backgroundColor: cssVar('--accent-blue', '#007bff'),
                    borderRadius: 6,
                    maxBarThickness: 46
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // 静态数据板：不做入场动画，首帧同步画出（不依赖 rAF）
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: cssVar('--text-secondary', '#4a5568') }, grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        ticks: { color: cssVar('--text-secondary', '#4a5568'), precision: 0 },
                        grid: { color: cssVar('--border-color', '#e2e8f0') }
                    }
                }
            }
        });
    }

    // 主题切换只改 <html> 的 class，图表配色要跟着重读
    function watchTheme() {
        if (state.themeObserver || !window.MutationObserver) return;
        state.themeObserver = new MutationObserver(function () {
            var ch = state.chart;
            if (!state.ready || !ch || !document.getElementById('dsMonthChart')) return;
            ch.data.datasets[0].backgroundColor = cssVar('--accent-blue', '#007bff');
            ch.options.scales.x.ticks.color = cssVar('--text-secondary', '#4a5568');
            ch.options.scales.y.ticks.color = cssVar('--text-secondary', '#4a5568');
            ch.options.scales.y.grid.color = cssVar('--border-color', '#e2e8f0');
            ch.update('none');
        });
        state.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    /* ---------- 语言切换重渲染（setLanguage 探测 dataScaleReapplyI18n） ---------- */

    function reapplyI18n() {
        if (!state.ready) return;
        render();
    }
    window.dataScaleReapplyI18n = reapplyI18n;

    /* ---------- 启动 ---------- */

    function statusHtml(kind) {
        var box = document.getElementById('dsBody');
        if (!box) return;
        box.innerHTML = '<div class="ds-status"><span class="' + (kind === 'load' ? 'ds-spinner' : 'ds-status-icon') +
            '"></span><p>' + escapeHtml(t(kind === 'load' ? 'ds_loading' : 'ds_error')) + '</p></div>';
    }

    function init() {
        if (document.getElementById('dsBody') === null) return;
        statusHtml('load');
        Promise.all([loadClubStats(), loadProStats(), softJson('data/dataset-stats.json'), loadAssets()])
            .then(function (r) {
                state.live = r[0];
                state.live.wtt = r[1] || {};
                state.pre = r[2];
                state.assets = r[3];
                state.ready = true;
                render();
                watchTheme();
            })
            .catch(function (e) {
                console.error('DataScale: 加载失败', e);
                statusHtml('error');
            });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
