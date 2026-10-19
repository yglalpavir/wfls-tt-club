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

    var state = { ready: false, live: null, pre: null, assets: null, chart: null, themeObserver: null, netW: 0 };
    var netResizeTimer = null, netResizeBound = false;

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
            // 档案 visible === false（暂不展示）的成员不计入公开统计
            var players = ((playersData && playersData.players) || []).filter(function (p) { return p && p.visible !== false; });
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
                media: mediaCount, releases: changelog.length,
                net: buildGraph(matches, players)
            };
        });
    }

    /* ---------- 交手网络：把比赛记录折成一张关系图 ---------- */

    // 节点 = 出场过的成员，边 = 对手组合（权重 = 交手次数）。
    // 双打按场上四位选手互相交手计入；分开的连通集团原样保留（不做任何“体检”判定）。
    function buildGraph(matches, players) {
        var nodes = [], byUid = {};
        // 每位公开成员先占一个位置：没有交手记录的成员同样算在人数里，
        // 但他们不进那张网（度为 0），最后收在图下方的虚线框
        players.forEach(function (p) {
            if (!p || p.uid == null) return;
            var k = String(p.uid);
            if (byUid[k] != null) return;
            byUid[k] = nodes.length;
            nodes.push({
                uid: k, name: p.name,
                enroll: (p.grade && p.grade.enroll) || 0,
                deg: 0, games: 0, nb: []
            });
        });

        function sideNames(v) {
            if (typeof v !== 'string' || !v) return [];
            // splitPairNames 只认 "A/B" 组合，单打名返回 null —— 回退到整名
            var parts = (typeof splitPairNames === 'function') ? splitPairNames(v) : null;
            if (!parts) parts = v.indexOf('/') >= 0 ? v.split('/') : [v];
            return parts.map(function (s) { return String(s).trim(); }).filter(Boolean);
        }
        function nodeOf(name) {
            var p = typeof getPlayerByName === 'function' ? getPlayerByName(name) : null;
            if (!p || p.uid == null) return -1;
            var k = String(p.uid);
            // 档案暂不展示的成员不进图（byUid 里没有他们）
            return byUid[k] != null ? byUid[k] : -1;
        }

        var pairMap = {}, edges = [];
        matches.forEach(function (m) {
            var wa = sideNames(m['胜者']).map(nodeOf).filter(function (i) { return i >= 0; });
            var la = sideNames(m['负者']).map(nodeOf).filter(function (i) { return i >= 0; });
            if (!wa.length || !la.length) return;

            var once = {};
            wa.concat(la).forEach(function (i) {
                if (once[i]) return;
                once[i] = 1;
                nodes[i].games++;
            });

            wa.forEach(function (a) {
                la.forEach(function (b) {
                    if (a === b) return;
                    var x = Math.min(a, b), y = Math.max(a, b), key = x + '|' + y;
                    var e = pairMap[key];
                    if (!e) {
                        e = pairMap[key] = { a: x, b: y, w: 0 };
                        edges.push(e);
                        nodes[x].deg++; nodes[y].deg++;
                        nodes[x].nb.push(y); nodes[y].nb.push(x);
                    }
                    e.w++;
                });
            });
        });

        // 连通分量：只连有交集的成员，零度成员单独收在图下方的虚线框里
        var seenNode = [], comps = [], isolated = [], maxDeg = 0;
        nodes.forEach(function (nd, i) {
            if (nd.deg > maxDeg) maxDeg = nd.deg;
            if (!nd.deg) { isolated.push(i); return; }
            if (seenNode[i]) return;
            seenNode[i] = 1;
            var stack = [i], comp = [];
            while (stack.length) {
                var v = stack.pop();
                comp.push(v);
                nodes[v].nb.forEach(function (u) {
                    if (!seenNode[u]) { seenNode[u] = 1; stack.push(u); }
                });
            }
            comps.push(comp);
        });
        comps.sort(function (a, b) { return b.length - a.length; });

        // 年级只用来上色，不参与布局（同年级之间的交手并不比随机更多，按年级分堆会凭空造出结构）
        var years = [];
        nodes.forEach(function (nd) {
            if (nd.enroll && years.indexOf(nd.enroll) < 0) years.push(nd.enroll);
        });
        years.sort(function (a, b) { return a - b; });
        nodes.forEach(function (nd) { nd.ci = nd.enroll ? years.indexOf(nd.enroll) : -1; });

        return {
            nodes: nodes, edges: edges, comps: comps, isolated: isolated,
            years: years, maxDeg: maxDeg
        };
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

    /* ---------- 交手网络：渲染 ---------- */

    var NET_PAD = 24, NET_COLORS = 4, NET_LABEL_SIZE = 10.5;

    function netDisplay(name) {
        return typeof playerDisplayName === 'function' ? playerDisplayName(name) : name;
    }
    function cohortLabel(y) {
        return y ? t('ds_net_cohort', { y: y }) : t('ds_net_cohort_other');
    }
    // 年级只用颜色区分（顺序从早到晚），颜色在 CSS 里绑定主题变量，切主题不用重画
    function netCohortClass(ci) {
        return (ci >= 0 && ci < NET_COLORS) ? 'ds-net-c' + ci : 'ds-net-cx';
    }
    // 文本宽度估算：CJK 约 1em，其余约 0.56em
    function netTextWidth(s, size) {
        var w = 0;
        for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e7f ? size : size * 0.56;
        return w;
    }
    function netNodeR(nd, maxDeg) {
        return 4 + 7 * Math.sqrt((nd.deg || 0) / (maxDeg || 1));
    }
    function netProfileUrl(nd) {
        return typeof getPlayerProfileUrl === 'function' ? getPlayerProfileUrl(nd.uid) : '';
    }

    // 单个连通集团的世界坐标布局（Fruchterman–Reingold）：只负责形状，尺寸交给外面统一缩放
    function netLayoutBlock(ids, N) {
        var n = ids.length;
        var local = {}, xs = [], ys = [], i;
        ids.forEach(function (gi, idx) { local[gi] = idx; });

        var kk = 42;
        for (i = 0; i < n; i++) {
            var a = i * 2.399963 + 0.9;
            var r0 = kk * Math.sqrt(i + 0.6);
            xs[i] = Math.cos(a) * r0;
            ys[i] = Math.sin(a) * r0;
        }

        var es = [];
        N.edges.forEach(function (e) {
            var a = local[e.a], b = local[e.b];
            if (a != null && b != null) es.push([a, b, e.w]);
        });

        var iters = Math.min(340, 160 + n * 4);
        var temp = kk * 1.5;
        for (var it = 0; it < iters; it++) {
            var dx = [], dy = [];
            for (i = 0; i < n; i++) { dx[i] = 0; dy[i] = 0; }
            for (i = 0; i < n; i++) {
                for (var j = i + 1; j < n; j++) {
                    var vx = xs[i] - xs[j], vy = ys[i] - ys[j];
                    var d2 = vx * vx + vy * vy;
                    if (d2 < 0.01) { vx = 0.11; vy = 0.07; d2 = 0.017; }
                    // 斥力用 1/d²（而不是 FR 的 1/d）：近处推得狠、远处迅速衰减，
                    // 中宫不会糊成一团，外围也不会被一个离群点顶得满画布飞
                    var d = Math.sqrt(d2), f = kk * kk * kk / d2;
                    // 远处的点不再互相排斥：否则 40 多个"只打过一两场"的边缘成员会
                    // 被整张图一起往外推，撑成一圈均匀的环，中宫反而被压扁
                    var cut = kk * 3.6;
                    if (d > cut) f *= Math.max(0, 1 - (d - cut) / (kk * 2.2));
                    dx[i] += vx / d * f; dy[i] += vy / d * f;
                    dx[j] -= vx / d * f; dy[j] -= vy / d * f;
                }
            }
            es.forEach(function (e) {
                var vx = xs[e[1]] - xs[e[0]], vy = ys[e[1]] - ys[e[0]];
                var d = Math.sqrt(vx * vx + vy * vy) || 0.01;
                // 交手越多的组合拉得越紧（有上限，避免一对 “老对手” 把两个人粘死）
                var f = Math.min(d * d / kk, kk * 0.85) * 1.0 * (1 + 0.1 * Math.min(3, e[2] - 1));
                dx[e[0]] += vx / d * f; dy[e[0]] += vy / d * f;
                dx[e[1]] -= vx / d * f; dy[e[1]] -= vy / d * f;
            });
            for (i = 0; i < n; i++) {
                dx[i] -= xs[i] * 0.03;
                dy[i] -= ys[i] * 0.03;
                var dl = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01;
                var step = Math.min(dl, temp);
                xs[i] += dx[i] / dl * step;
                ys[i] += dy[i] / dl * step;
            }
            temp *= 0.978;
        }

        // 尾部压缩：把外围收回到中宫旁边，长线变短线。
        // 之前用 pow(...,0.45) 是「单调压扁」，结果每个边缘成员的半径几乎相同，
        // 整张图变成一圈均匀的烟花；这里改成线性收缩 0.42，保留疏密差别
        var rad = [];
        for (i = 0; i < n; i++) rad.push(Math.sqrt(xs[i] * xs[i] + ys[i] * ys[i]));
        var sorted = rad.slice().sort(function (a, b) { return a - b; });
        var Rc = sorted[Math.max(0, Math.floor(sorted.length * 0.8) - 1)] || 1;
        for (i = 0; i < n; i++) {
            if (rad[i] > Rc) {
                var nr = Rc + (rad[i] - Rc) * 0.42;
                xs[i] *= nr / rad[i]; ys[i] *= nr / rad[i];
            }
        }

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (i = 0; i < n; i++) {
            if (xs[i] < minX) minX = xs[i];
            if (xs[i] > maxX) maxX = xs[i];
            if (ys[i] < minY) minY = ys[i];
            if (ys[i] > maxY) maxY = ys[i];
        }
        return {
            ids: ids, xs: xs, ys: ys, minX: minX, minY: minY,
            w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY)
        };
    }

    // 圆点半径是固定像素值，缩放之后会有点挨得过近：在像素空间把它们互相推开
    function netSpreadNodes(N, pos, ids, maxDeg, rounds) {
        var margin = 11;
        var total = 0;
        for (var it = 0; it < rounds * 24; it++) {
            var moved = 0;
            for (var i = 0; i < ids.length; i++) {
                var a = ids[i], pa = pos[a];
                if (!pa) continue;
                var ra = netNodeR(N.nodes[a], maxDeg);
                for (var j = i + 1; j < ids.length; j++) {
                    var b = ids[j], pb = pos[b];
                    if (!pb) continue;
                    var need = ra + netNodeR(N.nodes[b], maxDeg) + margin;
                    var vx = pb.x - pa.x, vy = pb.y - pa.y;
                    var d = Math.sqrt(vx * vx + vy * vy);
                    if (d >= need) continue;
                    if (d < 0.01) { vx = 0.83; vy = 0.56; d = 1; }   // 完全重合时挑一个固定方向
                    var push = (need - d) * 0.5;
                    pa.x -= vx / d * push; pa.y -= vy / d * push;
                    pb.x += vx / d * push; pb.y += vy / d * push;
                    moved++;
                }
            }
            total += moved;
            if (!moved) break;
        }
        return total;
    }

    // 把图整体收进画布（只缩不放）并居中，返回实际缩放比例
    function netFitToBox(pos, ids, x0, x1, y0, y1) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        ids.forEach(function (gi) {
            var p = pos[gi];
            if (!p) return;
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });
        if (minX === Infinity) return 1;
        var s = Math.min(1, (x1 - x0) / Math.max(1, maxX - minX), (y1 - y0) / Math.max(1, maxY - minY));
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        var tx = (x0 + x1) / 2, ty = (y0 + y1) / 2;
        ids.forEach(function (gi) {
            var p = pos[gi];
            if (!p) return;
            p.x = tx + (p.x - cx) * s;
            p.y = ty + (p.y - cy) * s;
        });
        return s;
    }

    // 放一个名字：八个候选位逐个打分，压住别的名字最贵、压住别人的点次之，
    // 都不划算就干脆不标（悬停时再临时补上，所以静态标签可以留得很稀）
    function netPlaceLabel(N, pos, gi, ctx, cls) {
        var nd = N.nodes[gi], p = pos[gi];
        if (!nd || !p) return null;
        var r = netNodeR(nd, N.maxDeg);
        var txt = netDisplay(nd.name);
        var wpx = netTextWidth(txt, NET_LABEL_SIZE) + 2;
        var slots = [
            [p.x + r + 6, p.y, 'start'],
            [p.x - r - 6, p.y, 'end'],
            [p.x, p.y - r - 7, 'middle'],
            [p.x, p.y + r + 13, 'middle'],
            [p.x + r * 0.7 + 3, p.y - r * 0.8, 'start'],
            [p.x - r * 0.7 - 3, p.y - r * 0.8, 'end'],
            [p.x + r * 0.7 + 3, p.y + r * 0.8 + 7, 'start'],
            [p.x - r * 0.7 - 3, p.y + r * 0.8 + 7, 'end']
        ];
        var best = null, bestScore = Infinity;
        slots.forEach(function (s) {
            var x0 = s[2] === 'start' ? s[0] : s[2] === 'end' ? s[0] - wpx : s[0] - wpx / 2;
            var box = { x0: x0, y0: s[1] - 5.5, x1: x0 + wpx, y1: s[1] + 4.5, sx: s[0], sy: s[1], anchor: s[2] };
            if (box.x0 < 3 || box.x1 > ctx.W - 3 || box.y0 < 2 || box.y1 > ctx.H - 2) return;
            var score = 0;
            if (ctx.bias) {
                var lvx = s[0] - p.x, lvy = s[1] - p.y;
                var lvl = Math.sqrt(lvx * lvx + lvy * lvy);
                var ovx = p.x - ctx.cx, ovy = p.y - ctx.cy;
                var ovl = Math.sqrt(ovx * ovx + ovy * ovy);
                if (lvl > 0.01 && ovl > 1) {
                    // 与「向外」方向一致的位置更划算（权重小于压住别的字，只作倾向）
                    score += (1 - (lvx * ovx + lvy * ovy) / (lvl * ovl)) * 7;
                }
            }
            ctx.obst.forEach(function (b) {
                var ox = Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0);
                var oy = Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0);
                if (ox > 0 && oy > 0) score += ox * oy * 3 + 100;
            });
            N.nodes.forEach(function (o, oi) {
                if (oi === gi) return;
                var op = pos[oi];
                if (!op) return;
                var orx = netNodeR(o, N.maxDeg);
                var ox = Math.min(box.x1, op.x + orx) - Math.max(box.x0, op.x - orx);
                var oy = Math.min(box.y1, op.y + orx) - Math.max(box.y0, op.y - orx);
                if (ox > 0 && oy > 0) score += ox * oy * 8;
            });
            if (score < bestScore) { bestScore = score; best = box; }
        });
        if (!best || bestScore >= 40) return null;
        best.gi = gi;
        ctx.obst.push(best);
        ctx.out.push('<text class="ds-net-lab' + (cls ? ' ' + cls : '') + '" data-l="' + gi +
            '" x="' + best.sx.toFixed(1) + '" y="' + best.sy.toFixed(1) +
            '" text-anchor="' + best.anchor + '" dominant-baseline="middle">' + escapeHtml(txt) + '</text>');
        return best;
    }

    function netLabelCtx(N, pos, obst, W, H) {
        var cx = 0, cy = 0, cn = 0;
        pos.forEach(function (q) { if (q) { cx += q.x; cy += q.y; cn++; } });
        return {
            obst: obst || [], out: [], W: W, H: H,
            cx: cn ? cx / cn : W / 2, cy: cn ? cy / cn : H / 2,
            bias: cn > 8
        };
    }

    // 静态标签：只标对手最多的前 limit 位，其余靠悬停补
    function netPlaceLabels(N, pos, order, limit, W, H) {
        var ctx = netLabelCtx(N, pos, [], W, H);
        var boxes = [];
        order.some(function (gi) {
            if (boxes.length >= limit) return true;
            var b = netPlaceLabel(N, pos, gi, ctx);
            if (b) boxes.push(b);
            return false;
        });
        return { html: ctx.out.join(''), boxes: boxes };
    }

    // 悬停时给邻居补名字：借静态标签的占位当障碍，放不下就不放（最多 14 个）
    function netHoverLabels(N, pos, i, staticBoxes, W, H) {
        var ctx = netLabelCtx(N, pos, staticBoxes.slice(), W, H);
        var done = {}, n = 0;
        staticBoxes.forEach(function (b) { done[b.gi] = 1; });
        var order = N.nodes[i].nb.slice().sort(function (a, b) {
            return N.nodes[b].deg - N.nodes[a].deg;
        });
        order.some(function (gi) {
            if (n >= 14) return true;
            if (done[gi]) return false;
            if (netPlaceLabel(N, pos, gi, ctx, 'is-hot-lab')) n++;
            return false;
        });
        return ctx.out.join('');
    }

    function renderNetwork() {
        var N = state.live && state.live.net;
        if (!N || !N.comps.length || N.comps[0].length < 2) return '';

        var stats = [
            [N.nodes.length, t('ds_kpi_members')],
            [N.edges.length, t('ds_net_pairs')],
            [N.comps[0].length, t('ds_net_largest')],
            [N.isolated.length, t('ds_net_isolated')]
        ];
        var statHtml = '<div class="ds-net-stats">' + stats.map(function (s) {
            return '<div class="ds-net-stat"><span class="ds-net-stat-v">' + escapeHtml(fmtInt(s[0])) +
                '</span><span class="ds-net-stat-l">' + escapeHtml(s[1]) + '</span></div>';
        }).join('') + '</div>';

        var legend = N.years.map(function (y, i) {
            var cnt = 0;
            N.nodes.forEach(function (nd) { if (nd.enroll === y) cnt++; });
            return '<li><span class="ds-net-swatch ' + netCohortClass(i) + '"></span>' +
                '<span>' + escapeHtml(cohortLabel(y)) + '</span><em>' + escapeHtml(fmtInt(cnt)) + '</em></li>';
        }).join('');
        var ungraded = 0;
        N.nodes.forEach(function (nd) { if (!nd.enroll) ungraded++; });
        if (ungraded) {
            legend += '<li><span class="ds-net-swatch ds-net-cx"></span><span>' +
                escapeHtml(t('ds_net_cohort_other')) + '</span><em>' + escapeHtml(fmtInt(ungraded)) + '</em></li>';
        }

        var keys = '<div class="ds-net-keys">' +
            '<span class="ds-net-key"><svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true">' +
            '<line x1="1" y1="2" x2="29" y2="2" stroke-width="1"/>' +
            '<line x1="1" y1="6" x2="29" y2="6" stroke-width="2"/>' +
            '<line x1="1" y1="10" x2="29" y2="10" stroke-width="3"/></svg>' +
            escapeHtml(t('ds_net_key_edge')) + '</span>' +
            (N.isolated.length ? '<span class="ds-net-key"><span class="ds-net-dash" aria-hidden="true"></span>' +
                escapeHtml(t('ds_net_isolated')) + '</span>' : '') +
            '</div>';

        // 触屏没有悬停：换一句「点一下」的说法
        var touchOnly = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
        var rail = '<aside class="ds-net-rail">' + statHtml +
            '<ul class="ds-net-legend">' + legend + '</ul>' + keys +
            '<p class="ds-net-hint">' +
            escapeHtml(t(touchOnly ? 'ds_net_hint_touch' : 'ds_net_hint')) + '</p></aside>';

        return {
            card: '<div class="ds-card glass-card"><div class="ds-net">' +
                '<div class="ds-net-stage" id="dsNetGraph"></div>' + rail + '</div></div>',
            note: '<p class="ds-note">' + escapeHtml(t('ds_net_note')) + '</p>'
        };
    }

    function renderNetworkGraph() {
        var host = document.getElementById('dsNetGraph');
        var N = state.live && state.live.net;
        if (!host || !N || !N.comps.length) return;

        var W = Math.max(240, Math.round(host.clientWidth || 320));
        state.netW = host.clientWidth || W;
        var narrow = W < 520;

        var maxDeg = N.maxDeg || 1;
        var maxEdgeW = 1;
        N.edges.forEach(function (e) { if (e.w > maxEdgeW) maxEdgeW = e.w; });
        var wLog = Math.log(1 + maxEdgeW) || 1;
        var maxR = netNodeR({ deg: maxDeg }, maxDeg);

        // 每个连通集团各自布局（世界坐标），再并排摆开、缩放到画布内
        var blocks = N.comps.map(function (comp) { return netLayoutBlock(comp, N); });
        var gap = 44, totalW = 0, maxH = 1;
        blocks.forEach(function (b) {
            totalW += b.w;
            if (b.h > maxH) maxH = b.h;
        });
        totalW += gap * Math.max(0, blocks.length - 1);

        var cursor = 0;
        blocks.forEach(function (b) {
            b.dx = cursor - b.minX;
            b.dy = (maxH - b.h) / 2 - b.minY;
            cursor += b.w + gap;
        });

        var pad = NET_PAD + maxR;
        var availW = Math.max(60, W - 2 * pad);
        // 画布高度按布局自身的宽高比来定（力导向没有唯一正确的长宽比）：
        // 布局偏窄就给它方一点的画布，偏宽就压扁一点，别硬塞进固定高度里把点挤在一起
        var aspect = totalW / Math.max(1, maxH);
        var targetAspect = Math.max(1.05, Math.min(narrow ? 1.2 : 1.95, aspect));
        var graphH = Math.round(Math.max(narrow ? 300 : 340,
            Math.min(narrow ? 520 : 700, W / targetAspect)));
        var availH = Math.max(60, graphH - 2 * pad);

        // 横向允许有限度拉伸把卡片用满；超过上限就保持等比、左右留白
        var k = Math.min(availW / totalW, availH / maxH);
        var kx = k * Math.min(availW / totalW / k, 1.45);
        var ky = k * Math.min(availH / maxH / k, 1.45);
        var ox = (W - totalW * kx) / 2;
        var oy = (graphH - maxH * ky) / 2;

        var pos = [], graphIds = [];
        blocks.forEach(function (b) {
            b.ids.forEach(function (gi, i) {
                pos[gi] = { x: ox + (b.dx + b.xs[i]) * kx, y: oy + (b.dy + b.ys[i]) * ky };
                graphIds.push(gi);
            });
        });

        // 推开 ↔ 收回：单次「推开再缩放」会把刚推出来的间距又按比例压回去，
        // 所以反复几轮，直到这一次完全不用再缩（s≈1）为止
        for (var cyc = 0; cyc < 8; cyc++) {
            netSpreadNodes(N, pos, graphIds, maxDeg, 4);
            if (netFitToBox(pos, graphIds, pad, W - pad, pad, graphH - pad) > 0.999) break;
        }

        // 图下方的虚线框：一条边都没有的成员排成若干行，不参与上面那张网
        var bandItems = N.isolated.map(function (gi) {
            var nm = netDisplay(N.nodes[gi].name);
            return { gi: gi, name: nm, w: 10 + netTextWidth(nm, NET_LABEL_SIZE) };
        });
        var bandTop = graphH + 14, rowH = 24;
        var bandX = NET_PAD + 16, bandMaxX = W - NET_PAD - 16;
        var bx = bandX, by = 0, rows = 0;
        bandItems.forEach(function (it) {
            if (!rows) rows = 1;
            if (bx + it.w > bandMaxX && bx > bandX) { bx = bandX; by += rowH; rows++; }
            it.x = bx; it.y = by;
            bx += it.w + 18;
        });
        var bandH = bandItems.length ? 50 + (rows - 1) * rowH : 0;
        var H = bandItems.length ? bandTop + bandH + 8 : graphH;

        // 边：细的（交手少的）先画，粗的压在上面
        var edgeHtml = '', hitHtml = '';
        N.edges.map(function (e, i) { return i; })
            .sort(function (a, b) { return N.edges[a].w - N.edges[b].w; })
            .forEach(function (i) {
                var e = N.edges[i], pa = pos[e.a], pb = pos[e.b];
                if (!pa || !pb) return;
                var d = 'M' + pa.x.toFixed(1) + ' ' + pa.y.toFixed(1) + 'L' + pb.x.toFixed(1) + ' ' + pb.y.toFixed(1);
                var lw = 0.9 + 2.4 * Math.log(1 + e.w) / wLog;
                var lo = 0.05 + 0.5 * Math.log(1 + e.w) / wLog;
                edgeHtml += '<path class="ds-net-edge" data-k="' + i + '" d="' + d +
                    '" stroke-width="' + lw.toFixed(2) + '" stroke-opacity="' + lo.toFixed(2) + '"/>';
                hitHtml += '<path class="ds-net-hit" data-e="' + i + '" d="' + d + '"/>';
            });

        var nodeHtml = graphIds.slice().sort(function (a, b) {
            return N.nodes[a].deg - N.nodes[b].deg;
        }).map(function (gi) {
            var nd = N.nodes[gi], p = pos[gi], r = netNodeR(nd, maxDeg);
            var title = netDisplay(nd.name) + ' · ' + cohortLabel(nd.enroll);
            return '<a class="ds-net-g" data-n="' + gi + '" href="' + escapeHtml(netProfileUrl(nd)) + '">' +
                '<circle class="ds-net-ring" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (r + 3.6).toFixed(1) + '"/>' +
                '<circle class="ds-net-node ' + netCohortClass(nd.ci) + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>' +
                '<title>' + escapeHtml(title) + '</title></a>';
        }).join('');

        // 静态标签只留最关键的十几个，其余靠悬停补：全部都标上就是一团字
        var labelLimit = narrow ? 9 : Math.max(10, Math.min(16, Math.round(W / 60)));
        var placed = netPlaceLabels(N, pos,
            graphIds.slice().sort(function (a, b) { return N.nodes[b].deg - N.nodes[a].deg; }),
            labelLimit, W, graphH);
        var labelHtml = placed.html;

        var bandHtml = '';
        if (bandItems.length) {
            bandHtml = '<rect class="ds-net-band" x="' + NET_PAD + '" y="' + bandTop +
                '" width="' + (W - 2 * NET_PAD) + '" height="' + bandH + '" rx="12"/>' +
                '<text class="ds-net-band-cap" x="' + (NET_PAD + 16) + '" y="' + (bandTop + 19) + '">' +
                escapeHtml(t('ds_net_isolated') + ' · ' + t('ds_net_people', { n: bandItems.length })) + '</text>' +
                bandItems.map(function (it) {
                    var nd = N.nodes[it.gi], p = { x: it.x, y: bandTop + 38 + it.y };
                    pos[it.gi] = p;
                    var title = netDisplay(nd.name) + ' · ' + cohortLabel(nd.enroll);
                    return '<a class="ds-net-g" data-n="' + it.gi + '" href="' + escapeHtml(netProfileUrl(nd)) + '">' +
                        '<circle class="ds-net-ring" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="8"/>' +
                        '<circle class="ds-net-node ' + netCohortClass(nd.ci) + '" cx="' + p.x.toFixed(1) +
                        '" cy="' + p.y.toFixed(1) + '" r="4.2"/>' +
                        '<text class="ds-net-band-name" x="' + (p.x + 9).toFixed(1) + '" y="' + p.y.toFixed(1) +
                        '" dominant-baseline="middle">' + escapeHtml(it.name) + '</text>' +
                        '<title>' + escapeHtml(title) + '</title></a>';
                }).join('');
        }

        // 光晕跟着主集团最终位置走（取实际落点，缩放/推开之后的坐标）
        var gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
        N.comps[0].forEach(function (gi) {
            var p = pos[gi];
            if (!p) return;
            if (p.x < gMinX) gMinX = p.x;
            if (p.x > gMaxX) gMaxX = p.x;
            if (p.y < gMinY) gMinY = p.y;
            if (p.y > gMaxY) gMaxY = p.y;
        });
        var gx = (gMinX + gMaxX) / 2, gy = (gMinY + gMaxY) / 2;
        var glow = '<circle class="ds-net-glow" cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="' +
            (Math.max(gMaxX - gMinX, gMaxY - gMinY) * 0.62 + 90).toFixed(1) + '" fill="url(#dsNetGlow)"/>';

        host.innerHTML = '<div class="ds-net-tip" aria-hidden="true"></div>' +
            '<svg class="ds-net-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
            '" role="group" aria-label="' +
            escapeHtml(t('ds_net_aria', { members: N.nodes.length, pairs: N.edges.length })) + '">' +
            '<defs><radialGradient id="dsNetGlow">' +
            '<stop offset="0%" style="stop-color:var(--accent-blue);stop-opacity:.12"/>' +
            '<stop offset="100%" style="stop-color:var(--accent-blue);stop-opacity:0"/>' +
            '</radialGradient></defs>' +
            glow + bandHtml +
            '<g class="ds-net-edges">' + edgeHtml + '</g>' +
            '<g class="ds-net-hits">' + hitHtml + '</g>' +
            '<g class="ds-net-nodes">' + nodeHtml + '</g>' +
            '<g class="ds-net-labels">' + labelHtml + '</g>' +
            '</svg>';

        netWire(host.querySelector('.ds-net-svg'), host, N, pos, placed.boxes, W, graphH);
    }

    // 悬停：高亮一位成员的整圈交手，其余压暗；悬停一条边看这组对手打了几场
    function netWire(svg, host, N, pos, labelBoxes, W, H) {
        if (!svg) return;
        var tip = host.querySelector('.ds-net-tip');
        var labGroup = svg.querySelector('.ds-net-labels');
        var nodeEls = [].slice.call(svg.querySelectorAll('[data-n]'));
        var lineEls = [].slice.call(svg.querySelectorAll('.ds-net-edge'));
        var labEls = [].slice.call(svg.querySelectorAll('.ds-net-lab'));
        var nodeByI = [], lineByK = [], labByI = [];
        nodeEls.forEach(function (el) { nodeByI[+el.getAttribute('data-n')] = el; });
        lineEls.forEach(function (el) { lineByK[+el.getAttribute('data-k')] = el; });
        labEls.forEach(function (el) { labByI[+el.getAttribute('data-l')] = el; });

        var hot = null;

        function placeTip(px, py) {
            var w = host.clientWidth || 320;
            var tw = tip.offsetWidth || 180, th = tip.offsetHeight || 44;
            // 让开光标底下的那个点：默认放右上，靠边就翻到左边 / 下面
            var x = px + 16;
            if (x + tw > w - 6) x = px - 16 - tw;
            if (x < 6) x = 6;
            var below = py - 12 - th < 6;
            var y = below ? py + 16 : py - 12;
            tip.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(0,' +
                (below ? '0' : '-100%') + ')';
        }
        function showTip(html, px, py) {
            tip.innerHTML = html;
            tip.classList.add('is-on');
            placeTip(px, py);
        }
        function clear() {
            if (!hot) return;
            hot = null;
            svg.classList.remove('is-focus');
            nodeEls.forEach(function (el) { el.classList.remove('is-hot', 'is-near'); });
            lineEls.forEach(function (el) { el.classList.remove('is-hot'); });
            labEls.forEach(function (el) { el.classList.remove('is-near', 'is-self'); });
            // 悬停时临时补的名字整批撤掉
            if (labGroup) {
                var dyn = labGroup.querySelectorAll('.is-hot-lab');
                for (var d = 0; d < dyn.length; d++) dyn[d].parentNode.removeChild(dyn[d]);
            }
            tip.classList.remove('is-on');
        }
        function focusNode(i, px, py) {
            if (hot && hot.t === 'n' && hot.i === i) { placeTip(px, py); return; }
            clear();
            hot = { t: 'n', i: i };
            svg.classList.add('is-focus');
            if (nodeByI[i]) nodeByI[i].classList.add('is-hot');
            N.nodes[i].nb.forEach(function (j) { if (nodeByI[j]) nodeByI[j].classList.add('is-near'); });
            // 自己的名字让给浮层显示（否则浮层刚好压在同一串字上）
            if (labByI[i]) labByI[i].classList.add('is-self');
            N.nodes[i].nb.forEach(function (j) { if (labByI[j]) labByI[j].classList.add('is-near'); });
            for (var k = 0; k < N.edges.length; k++) {
                var e = N.edges[k];
                if ((e.a === i || e.b === i) && lineByK[k]) lineByK[k].classList.add('is-hot');
            }
            // 邻居里没有静态名字的，临时补上（放不下就不放，宁可少标也不叠字）
            if (labGroup && labelBoxes) {
                labGroup.insertAdjacentHTML('beforeend', netHoverLabels(N, pos, i, labelBoxes, W, H));
            }
            var nd = N.nodes[i];
            showTip('<b>' + escapeHtml(netDisplay(nd.name)) + '</b><span>' +
                escapeHtml(t('ds_net_tip_node', { cohort: cohortLabel(nd.enroll), opp: nd.deg, games: nd.games })) +
                '</span>', px, py);
        }
        function focusEdge(i, px, py) {
            if (hot && hot.t === 'e' && hot.i === i) { placeTip(px, py); return; }
            clear();
            hot = { t: 'e', i: i };
            svg.classList.add('is-focus');
            var e = N.edges[i];
            if (lineByK[i]) lineByK[i].classList.add('is-hot');
            if (nodeByI[e.a]) nodeByI[e.a].classList.add('is-hot');
            if (nodeByI[e.b]) nodeByI[e.b].classList.add('is-hot');
            if (labByI[e.a]) labByI[e.a].classList.add('is-near');
            if (labByI[e.b]) labByI[e.b].classList.add('is-near');
            showTip('<b>' + escapeHtml(netDisplay(N.nodes[e.a].name)) + ' × ' +
                escapeHtml(netDisplay(N.nodes[e.b].name)) + '</b><span>' +
                escapeHtml(t('ds_net_tip_edge', { n: e.w })) + '</span>', px, py);
        }
        function hitTarget(ev) {
            var el = ev.target;
            return (el && el.closest) ? el.closest('[data-n],[data-e]') : null;
        }
        svg.addEventListener('pointermove', function (ev) {
            var el = hitTarget(ev);
            var rect = host.getBoundingClientRect();
            var px = ev.clientX - rect.left, py = ev.clientY - rect.top;
            if (!el) { clear(); return; }
            var ni = el.getAttribute('data-n');
            if (ni != null) { focusNode(+ni, px, py); return; }
            var ei = el.getAttribute('data-e');
            if (ei != null) focusEdge(+ei, px, py);
        });
        svg.addEventListener('pointerleave', clear);
        svg.addEventListener('focusin', function (ev) {
            var el = hitTarget(ev);
            if (!el) return;
            var ni = el.getAttribute('data-n');
            if (ni == null) return;
            var p = pos[+ni] || { x: 80, y: 80 };
            focusNode(+ni, p.x, p.y + 4);
        });
        svg.addEventListener('focusout', clear);
    }

    function render() {
        var body = document.getElementById('dsBody');
        if (!body || !state.live) return;
        var pro = renderPro(), join = renderJoin(), net = renderNetwork();

        body.innerHTML = renderOverview() +
            section('ds-sec-club', t('ds_sec_club'), t('ds_sec_club_desc'), renderClub()) +
            section('ds-sec-net', t('ds_sec_net'), t('ds_sec_net_desc'), net ? net.card + net.note : '') +
            section('ds-sec-pro', t('ds_sec_wtt'), pro.desc, pro.body) +
            section('ds-sec-content', t('ds_sec_content'), t('ds_sec_content_desc'), renderContent()) +
            section('ds-sec-join', t('ds_sec_join'), join.desc, join.body);

        renderHeroMeta();
        renderChart();
        renderNetworkGraph();
    }

    // 容器宽度变了才重画（手机转屏 / 侧栏收起），当作纯几何调整
    function onNetResize() {
        if (netResizeTimer) clearTimeout(netResizeTimer);
        netResizeTimer = setTimeout(function () {
            var host = document.getElementById('dsNetGraph');
            if (!host || !state.ready || !state.live || !state.live.net) return;
            if (Math.abs((host.clientWidth || 0) - state.netW) < 24) return;
            renderNetworkGraph();
        }, 160);
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
                if (!netResizeBound) {
                    netResizeBound = true;
                    window.addEventListener('resize', onNetResize);
                }
            })
            .catch(function (e) {
                console.error('DataScale: 加载失败', e);
                statusHtml('error');
            });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
