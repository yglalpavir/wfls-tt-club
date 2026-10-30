/* 提交页「入库动态」：读取 data/submission-log.json 并渲染时间线。
   数据源缺失时整块保持隐藏，不在访客页面显示任何生成/维护提示。 */
(function () {
    'use strict';

    var section = document.getElementById('sbLogSection');
    if (!section) return;

    var feed = document.getElementById('sbLogFeed');
    var emptyEl = document.getElementById('sbLogEmpty');
    var noResultEl = document.getElementById('sbLogNoResult');
    var footEl = document.getElementById('sbLogFoot');
    var moreBtn = document.getElementById('sbLogMore');
    var countEl = document.getElementById('sbLogCount');
    var sparkEl = document.getElementById('sbLogSpark');
    var sparkTotalEl = document.getElementById('sbLogSparkTotal');
    var statRecentEl = document.getElementById('sbLogStatRecent');
    var statBatchesEl = document.getElementById('sbLogStatBatches');
    var statUpdatedEl = document.getElementById('sbLogStatUpdated');
    var searchEl = document.getElementById('sbLogSearch');
    var searchClearEl = document.getElementById('sbLogSearchClear');
    var segEl = section.querySelector('.sb-log-seg');

    var CHANNELS = ['form', 'issue', 'manual', 'archive'];
    var CHANNEL_ICON = {
        form: 'fa-cloud-arrow-up',
        issue: 'fa-code-branch',
        manual: 'fa-pen-to-square',
        archive: 'fa-box-archive'
    };
    var PAGE_SIZE = 6;
    var MAX_COLLAPSED = 4;
    var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var state = {
        entries: [],
        filter: 'all',
        query: '',
        visible: PAGE_SIZE,
        expanded: {},
        seen: {},
        observer: null,
        settleTimer: null,
        searchTimer: null
    };

    function lang() {
        return typeof currentLang === 'string' ? currentLang : 'zh';
    }

    function T(key, vars) {
        var dict = (typeof i18n !== 'undefined' && i18n[lang()]) || {};
        var text = dict[key];
        if (text == null) {
            var fallback = (typeof i18n !== 'undefined' && i18n.zh) || {};
            text = fallback[key] != null ? fallback[key] : key;
        }
        text = String(text);
        if (vars) {
            Object.keys(vars).forEach(function (k) {
                text = text.split('{' + k + '}').join(String(vars[k]));
            });
        }
        return text;
    }

    function esc(value) {
        var text = value == null ? '' : String(value);
        if (typeof escapeHtml === 'function') return escapeHtml(text);
        return text.replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function str(value) {
        return value == null ? '' : String(value).trim();
    }

    function typeLabel(type) {
        if (!type) return '';
        return typeof eventTypeLabel === 'function' ? eventTypeLabel(type) : type;
    }

    function parseRecord(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var date = str(raw['日期']);
        var win = str(raw['胜者']);
        var lose = str(raw['负者']);
        if (win || lose) {
            var games = Array.isArray(raw['局分'])
                ? raw['局分'].map(str).filter(Boolean)
                : [];
            var rec = {
                kind: 'match',
                date: date,
                type: str(raw['类型']),
                format: str(raw['赛制']),
                winner: win,
                loser: lose,
                score: str(raw['比分']),
                games: games
            };
            rec.search = [date, rec.type, rec.format, win, lose, rec.score, games.join(' ')].join(' ').toLowerCase();
            return rec;
        }
        var object = str(raw['对象']);
        var hasPoints = raw['分数'] != null && str(raw['分数']) !== '';
        if (object || hasPoints) {
            var points = parseFloat(str(raw['分数']).replace(/[^0-9.+-]/g, ''));
            if (!isFinite(points)) points = 0;
            return {
                kind: 'bonus',
                date: date,
                object: object,
                points: points,
                search: [date, object, String(points)].join(' ').toLowerCase()
            };
        }
        return null;
    }

    function parseEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var at = str(raw.at);
        var ts = Date.parse(at);
        if (!at || !isFinite(ts)) return null;
        var records = (Array.isArray(raw.records) ? raw.records : []).map(parseRecord).filter(Boolean);
        if (!records.length) return null;
        var channel = CHANNELS.indexOf(raw.channel) >= 0 ? raw.channel : 'archive';
        var submitter = str(raw.submitter);
        var note = str(raw.note);
        return {
            id: str(raw.id) || at,
            at: at,
            day: at.slice(0, 10),
            ts: ts,
            channel: channel,
            submitter: submitter,
            note: note,
            noteEn: str(raw.note_en),
            records: records,
            search: [submitter, note, channel].concat(records.map(function (r) { return r.search; })).join(' ').toLowerCase()
        };
    }

    function normalize(doc) {
        var raw = doc && Array.isArray(doc.entries) ? doc.entries : [];
        return raw.map(parseEntry).filter(Boolean).sort(function (a, b) { return b.ts - a.ts; });
    }

    function filteredEntries() {
        var q = state.query.trim().toLowerCase();
        return state.entries.filter(function (entry) {
            if (state.filter !== 'all' && !entry.records.some(function (r) { return r.kind === state.filter; })) {
                return false;
            }
            if (q && entry.search.indexOf(q) < 0) return false;
            return true;
        });
    }

    function recordsFor(entry) {
        if (state.filter === 'all') return entry.records;
        return entry.records.filter(function (r) { return r.kind === state.filter; });
    }

    function timeAgo(ts) {
        var diff = Math.max(0, Date.now() - ts);
        var min = Math.floor(diff / 60000);
        if (min < 1) return T('sb_log_just_now');
        if (min < 60) return T('sb_log_minutes', { n: min });
        var hr = Math.floor(min / 60);
        if (hr < 24) return T('sb_log_hours', { n: hr });
        var day = Math.floor(hr / 24);
        if (day < 7) return T('sb_log_days', { n: day });
        if (day < 30) return T('sb_log_weeks', { n: Math.floor(day / 7) });
        if (day < 365) return T('sb_log_months', { n: Math.floor(day / 30) });
        return T('sb_log_years', { n: Math.floor(day / 365) });
    }

    function absTime(ts) {
        try {
            return new Intl.DateTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }).format(new Date(ts));
        } catch (e) {
            return new Date(ts).toLocaleString();
        }
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function dayKey(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function dayLabel(entryDay) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var yesterday = new Date(today.getTime() - 86400000);
        if (entryDay === dayKey(today)) return T('sb_log_day_today');
        if (entryDay === dayKey(yesterday)) return T('sb_log_day_yesterday');
        var parts = entryDay.split('-');
        if (parts.length !== 3) return entryDay;
        var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
        if (isNaN(d.getTime())) return entryDay;
        if (lang() === 'zh') {
            return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + '日一二三四五六'.charAt(d.getDay());
        }
        try {
            return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', weekday: 'short' }).format(d);
        } catch (e) {
            return entryDay;
        }
    }

    function countLabel(n, kind) {
        return T(kind === 'bonus' ? 'sb_log_records_bonus' : 'sb_log_records_match', { n: n });
    }

    function recordsCountLabel(recs) {
        var hasMatch = recs.some(function (r) { return r.kind === 'match'; });
        var hasBonus = recs.some(function (r) { return r.kind === 'bonus'; });
        if (hasMatch && hasBonus) return T('sb_log_records', { n: recs.length });
        return countLabel(recs.length, hasBonus ? 'bonus' : 'match');
    }

    function displayName(entry) {
        return entry.submitter || T('sb_log_anon_' + entry.channel);
    }

    function submitterAvatar(entry) {
        var initial = esc(entry.submitter.charAt(0));
        var player = typeof getPlayerByName === 'function' ? getPlayerByName(entry.submitter) : null;
        var qq = player && player.qq ? String(player.qq).trim() : '';
        if (qq) {
            var url = 'https://q1.qlogo.cn/g?b=qq&nk=' + encodeURIComponent(qq) + '&s=640';
            return '<span class="sb-log-avatar has-img ch-' + entry.channel + '" aria-hidden="true">' +
                '<span class="sb-log-avatar-fallback">' + initial + '</span>' +
                '<img class="sb-log-avatar-img" src="' + esc(url) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">' +
                '</span>';
        }
        return '<span class="sb-log-avatar ch-' + entry.channel + '" aria-hidden="true">' + initial + '</span>';
    }

    function avatar(entry) {
        if (entry.submitter) return submitterAvatar(entry);
        var icon = CHANNEL_ICON[entry.channel] || CHANNEL_ICON.archive;
        return '<span class="sb-log-avatar ch-' + entry.channel + '" aria-hidden="true"><i class="fa-solid ' + icon + '" aria-hidden="true"></i></span>';
    }

    function noteFor(entry) {
        if (!entry.note && !entry.noteEn) return '';
        return lang() === 'en' ? (entry.noteEn || entry.note) : entry.note;
    }

    function recordRow(rec) {
        var dateText = rec.date ? rec.date.slice(5).replace('-', '/') : '';
        if (rec.kind === 'bonus') {
            var up = rec.points >= 0;
            var pts = (up ? '+' : '') + (Number.isInteger(rec.points) ? rec.points : rec.points.toFixed(1));
            return '<li class="sb-log-rec is-bonus">' +
                '<span class="sb-log-type is-bonus">' + esc(T('sb_log_bonus')) + '</span>' +
                '<span class="sb-log-date">' + esc(dateText) + '</span>' +
                '<span class="sb-log-bonus-name">' + esc(rec.object) + '</span>' +
                '<span class="sb-log-points ' + (up ? 'up' : 'down') + '">' + esc(pts) + '</span>' +
                '</li>';
        }

        var mid = rec.score
            ? rec.score.replace(/\s*[-:：]\s*/g, ':')
            : T('sb_log_win');
        var games = rec.games.length
            ? '<span class="sb-log-games">' + rec.games.map(function (g) {
                return '<span class="sb-log-game">' + esc(g) + '</span>';
            }).join('') + '</span>'
            : '';
        return '<li class="sb-log-rec">' +
            '<span class="sb-log-type' + (rec.type === '双打' ? ' is-doubles' : '') + '">' + esc(typeLabel(rec.type)) + '</span>' +
            '<span class="sb-log-date">' + esc(dateText) + '</span>' +
            '<span class="sb-log-scoreline">' +
                '<span class="sb-log-winner">' + esc(rec.winner) + '</span>' +
                (mid ? '<span class="sb-log-score">' + esc(mid) + '</span>' : '') +
                '<span class="sb-log-loser">' + esc(rec.loser) + '</span>' +
            '</span>' +
            games +
            '</li>';
    }

    function entryMarkup(entry, index) {
        var recs = recordsFor(entry);
        if (!recs.length) return '';
        var expanded = !!state.expanded[entry.id];
        var shown = expanded ? recs : recs.slice(0, MAX_COLLAPSED);
        var hiddenCount = recs.length - shown.length;
        var fresh = Date.now() - entry.ts < 3 * 86400000;
        var settled = !!state.seen[entry.id];

        var note = noteFor(entry);
        var noteHtml = note ? '<p class="sb-log-note">' + esc(note) + '</p>' : '';
        var expandHtml = recs.length > MAX_COLLAPSED
            ? '<button type="button" class="sb-log-expand" data-expand="' + esc(entry.id) + '">' +
                (expanded ? T('sb_log_collapse') : T('sb_log_expand', { n: hiddenCount })) +
              '</button>'
            : '';

        return '<article class="sb-log-entry' + (settled ? ' is-settled' : '') + (fresh ? ' is-fresh' : '') + '" style="--i:' + Math.min(index, 6) + '" data-id="' + esc(entry.id) + '">' +
            '<div class="sb-log-rail">' + avatar(entry) + '</div>' +
            '<div class="sb-log-card">' +
                '<div class="sb-log-card-head">' +
                    '<div class="sb-log-who">' +
                        '<span class="sb-log-name">' + esc(displayName(entry)) + '</span>' +
                        '<span class="sb-log-chip ch-' + entry.channel + '">' + esc(T('sb_log_channel_' + entry.channel)) + '</span>' +
                    '</div>' +
                    '<div class="sb-log-meta">' +
                        '<time class="sb-log-time" datetime="' + esc(entry.at) + '" title="' + esc(absTime(entry.ts)) + '">' + esc(timeAgo(entry.ts)) + '</time>' +
                        (fresh ? '<span class="sb-log-new">' + esc(T('sb_log_new')) + '</span>' : '') +
                        '<span class="sb-log-counted"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>' + esc(T('sb_log_counted')) + '</span>' +
                    '</div>' +
                '</div>' +
                noteHtml +
                '<ul class="sb-log-records">' + shown.map(recordRow).join('') + '</ul>' +
                '<div class="sb-log-card-foot">' +
                    '<span class="sb-log-total">' + esc(recordsCountLabel(recs)) + '</span>' +
                    expandHtml +
                '</div>' +
            '</div>' +
            '</article>';
    }

    function skeletonMarkup() {
        var one = '<div class="sb-log-skel"><span class="sb-log-skel-avatar"></span><div class="sb-log-skel-card">' +
            '<span class="sb-log-skel-line w40"></span><span class="sb-log-skel-line w70"></span><span class="sb-log-skel-line w55"></span>' +
            '</div></div>';
        return one + one + one;
    }

    function setNumber(el, to) {
        if (!el) return;
        var from = parseInt(el.getAttribute('data-value') || '0', 10);
        if (!isFinite(from)) from = 0;
        el.setAttribute('data-value', String(to));
        if (reduceMotion || from === to) {
            el.textContent = String(to);
            return;
        }
        var start = null;
        var duration = 680;
        function tick(now) {
            if (start == null) start = now;
            var p = Math.min(1, (now - start) / duration);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = String(Math.round(from + (to - from) * eased));
            if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        setTimeout(function () {
            if (el.getAttribute('data-value') === String(to)) el.textContent = String(to);
        }, duration + 120);
    }

    function renderStats() {
        var cutoff = Date.now() - 30 * 86400000;
        var recent = 0;
        state.entries.forEach(function (entry) {
            if (entry.ts >= cutoff) recent += entry.records.length;
        });
        setNumber(statRecentEl, recent);
        setNumber(statBatchesEl, state.entries.length);
        if (statUpdatedEl) {
            var latest = state.entries[0];
            statUpdatedEl.textContent = latest ? timeAgo(latest.ts) : '—';
            if (latest) statUpdatedEl.title = absTime(latest.ts);
        }
    }

    function renderSpark() {
        if (!sparkEl) return;
        var days = [];
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        for (var i = 13; i >= 0; i--) {
            var d = new Date(today.getTime() - i * 86400000);
            days.push({ key: dayKey(d), date: d, count: 0 });
        }
        var byKey = {};
        days.forEach(function (day) { byKey[day.key] = day; });
        state.entries.forEach(function (entry) {
            var day = byKey[entry.day];
            if (day) day.count += entry.records.length;
        });
        var max = 1;
        var total = 0;
        days.forEach(function (day) {
            if (day.count > max) max = day.count;
            total += day.count;
        });
        if (sparkTotalEl) {
            sparkTotalEl.textContent = T('sb_log_spark_total', { n: total });
        }
        var wdZh = '日一二三四五六';
        var wdEn = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        sparkEl.innerHTML = days.map(function (day, idx) {
            var pct = day.count ? Math.max(10, Math.round(day.count / max * 100)) : 3;
            var label = lang() === 'zh' ? wdZh.charAt(day.date.getDay()) : wdEn[day.date.getDay()];
            var isToday = idx === days.length - 1;
            var title = (day.date.getMonth() + 1) + '/' + day.date.getDate() + ' · ' + T('sb_log_records', { n: day.count });
            return '<span class="sb-log-bar' + (isToday ? ' is-today' : '') + (day.count ? '' : ' is-empty') + '" style="--h:' + pct + '%;--i:' + idx + '" title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
                '<span class="sb-log-bar-fill"></span>' +
                '<span class="sb-log-bar-day">' + esc(label) + '</span>' +
                '</span>';
        }).join('');
    }

    function renderFeed() {
        var filtered = filteredEntries();
        var start = 0;
        var end = Math.min(state.visible, filtered.length);
        var shown = filtered.slice(start, end);
        var html = '';
        var prevDay = '';

        shown.forEach(function (entry, index) {
            if (entry.day !== prevDay) {
                html += '<div class="sb-log-day"><span>' + esc(dayLabel(entry.day)) + '</span></div>';
                prevDay = entry.day;
            }
            html += entryMarkup(entry, index);
        });

        feed.innerHTML = html;
        feed.hidden = !shown.length;

        var hasEntries = state.entries.length > 0;
        emptyEl.hidden = hasEntries;
        noResultEl.hidden = !(hasEntries && !filtered.length);

        var totalRecords = filtered.reduce(function (sum, entry) {
            return sum + recordsFor(entry).length;
        }, 0);
        countEl.textContent = T('sb_log_total', { n: filtered.length, m: totalRecords });

        var remaining = filtered.length - end;
        footEl.hidden = !filtered.length;
        moreBtn.hidden = remaining <= 0;
        if (remaining > 0) {
            moreBtn.textContent = T('sb_log_more') + ' · ' + T('sb_log_more_count', { n: remaining });
        }

        observeEntries();
        settleSoon();
    }

    function observeEntries() {
        if (reduceMotion || typeof IntersectionObserver !== 'function') {
            Array.prototype.forEach.call(feed.querySelectorAll('.sb-log-entry'), function (el) {
                el.classList.add('is-in');
            });
            return;
        }
        if (!state.observer) {
            state.observer = new IntersectionObserver(function (items) {
                items.forEach(function (item) {
                    if (item.isIntersecting) {
                        item.target.classList.add('is-in');
                        state.observer.unobserve(item.target);
                    }
                });
            }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        }
        Array.prototype.forEach.call(feed.querySelectorAll('.sb-log-entry:not(.is-in):not(.is-settled)'), function (el) {
            state.observer.observe(el);
        });
    }

    function settleSoon() {
        if (state.settleTimer) clearTimeout(state.settleTimer);
        state.settleTimer = setTimeout(function () {
            state.entries.forEach(function (entry) { state.seen[entry.id] = true; });
        }, 1100);
    }

    function renderAll() {
        renderStats();
        renderSpark();
        renderFeed();
    }

    function syncSearchClear() {
        if (searchClearEl) searchClearEl.hidden = !state.query;
    }

    function ensurePlayers() {
        if (typeof playersData !== 'undefined' && playersData && Array.isArray(playersData.players)) {
            return Promise.resolve();
        }
        if (typeof loadPlayers === 'function') {
            return loadPlayers().catch(function () {});
        }
        return Promise.resolve();
    }

    function load() {
        fetch('data/submission-log.json', { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (doc) {
                state.entries = normalize(doc);
                return ensurePlayers().then(function () {
                    section.hidden = false;
                    if (state.entries.length && !reduceMotion) {
                        feed.innerHTML = skeletonMarkup();
                    }
                    renderAll();
                });
            })
            .catch(function () {
                section.hidden = true;
            });
    }

    if (segEl) {
        segEl.addEventListener('click', function (ev) {
            var btn = ev.target.closest ? ev.target.closest('button[data-filter]') : null;
            if (!btn) return;
            var value = btn.getAttribute('data-filter');
            if (value === state.filter) return;
            state.filter = value;
            state.visible = PAGE_SIZE;
            Array.prototype.forEach.call(segEl.querySelectorAll('button'), function (b) {
                var active = b === btn;
                b.classList.toggle('is-active', active);
                b.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            renderFeed();
        });
    }

    if (searchEl) {
        searchEl.addEventListener('input', function () {
            if (state.searchTimer) clearTimeout(state.searchTimer);
            state.searchTimer = setTimeout(function () {
                state.query = searchEl.value || '';
                state.visible = PAGE_SIZE;
                syncSearchClear();
                renderFeed();
            }, 130);
        });
    }

    if (searchClearEl) {
        searchClearEl.addEventListener('click', function () {
            if (searchEl) {
                searchEl.value = '';
                searchEl.focus();
            }
            state.query = '';
            state.visible = PAGE_SIZE;
            syncSearchClear();
            renderFeed();
        });
    }

    if (moreBtn) {
        moreBtn.addEventListener('click', function () {
            state.visible += PAGE_SIZE;
            renderFeed();
        });
    }

    if (feed) {
        feed.addEventListener('click', function (ev) {
            var btn = ev.target.closest ? ev.target.closest('[data-expand]') : null;
            if (!btn) return;
            var id = btn.getAttribute('data-expand');
            if (!id) return;
            if (state.expanded[id]) delete state.expanded[id];
            else state.expanded[id] = true;
            state.seen[id] = true;
            renderFeed();
        });
    }

    window.sbLogReapplyI18n = function () {
        if (!state.entries.length) return;
        syncSearchClear();
        renderAll();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }
})();
