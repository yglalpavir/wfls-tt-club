/* ========================================
 * 彩蛋：乒乓球裁判特训 (umpire-training.js)
 *
 * 数据：data/umpire-quiz.json
 * 视频：assets/videos/umpire/{questionId}.mp4（由题目 video 字段指定，暂无则为占位）
 *
 * 扩展指南：
 *  - 新题型：向 UT_RENDERERS 注册 { render, grade }，并在题目 JSON 中设置对应 "type"。
 *  - 新模式（限时、连对挑战等）：扩展 UT_MODES，或在 startQuiz 前过滤/排序 questions。
 *  - 成绩持久化：localStorage key "wfls-ut-best.v1"。
 * ======================================== */

(function () {
    'use strict';

    var DATA_URL = 'data/umpire-quiz.json';
    var BEST_KEY = 'wfls-ut-best.v1';

    var stage = document.getElementById('utStage');
    if (!stage) return;

    /* ---------- 工具 ---------- */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* ---------- i18n ---------- */

    function utLang() {
        try {
            if (typeof i18n !== 'undefined' && typeof currentLang !== 'undefined' && i18n[currentLang]) return currentLang;
        } catch (e) { /* ignore */ }
        return 'zh';
    }

    // 读取字典（key 缺失时回退中文原文，保证未合入字典时 zh 不变）
    function utT(key, zhFallback) {
        try {
            if (typeof i18n !== 'undefined' && typeof currentLang !== 'undefined' && i18n[currentLang] && i18n[currentLang][key] != null) return i18n[currentLang][key];
        } catch (e) { /* ignore */ }
        return zhFallback;
    }

    function utFmt(tpl, vars) {
        return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, function (m, k) {
            return (vars && vars[k] != null) ? vars[k] : m;
        });
    }

    // 数据侧英文字段（umpire-quiz.json 的 *_en 字段尚未提供，Phase 3 补齐后自动生效）
    function utField(obj, baseKey) {
        if (!obj) return '';
        if (utLang() === 'en' && obj[baseKey + '_en']) return obj[baseKey + '_en'];
        return obj[baseKey] == null ? '' : obj[baseKey];
    }

    // meta（title/description）目前只有中文字段：英文模式先查站点字典，数据侧补上 *_en 后自动优先
    function utMetaText(baseKey, key, zhFallback) {
        if (utLang() === 'en' && !(state.meta && state.meta[baseKey + '_en'])) return utT(key, zhFallback);
        return utField(state.meta, baseKey) || utT(key, zhFallback);
    }

    function getBest() {
        try { return JSON.parse(localStorage.getItem(BEST_KEY)) || null; }
        catch (e) { return null; }
    }

    function saveBest(record) {
        var prev = getBest();
        if (!prev || record.percent > prev.percent) {
            try { localStorage.setItem(BEST_KEY, JSON.stringify(record)); } catch (e) { /* ignore */ }
            return true;
        }
        return false;
    }

    /* ---------- 题型渲染器注册表（扩展点） ---------- */

    /**
     * renderer = {
     *   render(q, ctx)   -> HTML 字符串（题目区，视频/选项等）
     *   grade(q, chosen) -> boolean 是否答对
     * }
     */
    var UT_RENDERERS = {
        // 视频选择题：播放发球视频，选择抛球角度判定
        'video-choice': {
            render: function (q) {
                var opts = q.options.map(function (o) {
                    return '<button type="button" class="ut-option" data-ut-option="' + esc(o.id) + '">' +
                        '<span class="ut-option-key">' + esc(o.id.toUpperCase()) + '</span>' +
                        '<span class="ut-option-label">' + esc(utField(o, 'label')) + '</span>' +
                        '</button>';
                }).join('');
                return '' +
                    '<div class="ut-video-wrap">' +
                        '<video class="ut-video" id="utVideo" src="' + esc(q.video) + '" controls playsinline preload="metadata"></video>' +
                        '<div class="ut-video-missing" id="utVideoMissing" hidden>' +
                            '<i class="fa-solid fa-film"></i>' +
                            '<p>' + esc(utT('ut_video_missing', '示范视频待补充')) + '<br><small>' + esc(q.video) + '</small></p>' +
                        '</div>' +
                    '</div>' +
                    '<p class="ut-prompt">' + esc(utField(q, 'prompt')) + '</p>' +
                    '<div class="ut-options" role="group" aria-label="' + esc(utT('ut_options_aria', '选项')) + '">' + opts + '</div>';
            },
            grade: function (q, chosen) { return chosen === q.answer; }
        }
    };

    /* 模式注册表（扩展点：未来可加 'timed'、'streak' 等） */
    var UT_MODES = {
        practice: { labelKey: 'ut_mode_practice', label: '练习模式', descKey: 'ut_mode_practice_desc', description: '逐题作答，即时反馈与解析' }
    };

    /* ---------- 状态 ---------- */

    var state = {
        meta: null,
        questions: [],
        index: 0,
        correct: 0,
        answered: false,
        lastChosen: null,   // 语言切换重绘时保留当前判定
        lastNewBest: false, // 「新纪录！」只在首次结算时产生
        screen: null         // welcome | question | result | error
    };

    /* ---------- 视图 ---------- */

    function renderWelcome() {
        state.screen = 'welcome';
        var best = getBest();
        var bestHtml = best
            ? '<p class="ut-best"><i class="fa-solid fa-trophy"></i> ' + esc(utFmt(utT('ut_best', '历史最佳：{c}/{t}（{p}%）'), { c: best.correct, t: best.total, p: best.percent })) + '</p>'
            : '';
        stage.innerHTML = '' +
            '<div class="ut-welcome">' +
                '<div class="ut-welcome-icon"><i class="fa-solid fa-whistle"></i></div>' +
                '<h2>' + esc(utMetaText('title', 'ut_default_title', '乒乓球裁判特训')) + '</h2>' +
                '<p class="ut-welcome-desc">' + esc(utMetaText('description', 'ut_default_desc', '观看发球视频，判断抛球角度是否合规。')) + '</p>' +
                '<ul class="ut-rules">' +
                    '<li><i class="fa-solid fa-circle-play"></i> ' + esc(utT('ut_rule_watch', '观看发球视频')) + '</li>' +
                    '<li><i class="fa-solid fa-angles-up"></i> ' + esc(utT('ut_rule_judge', '判断抛球是否近乎垂直')) + '</li>' +
                    '<li><i class="fa-solid fa-scale-balanced"></i> ' + esc(utT('ut_rule_verdict', '做出你的判罚')) + '</li>' +
                '</ul>' +
                '<p class="ut-count">' + esc(utFmt(utT('ut_count', '共 {n} 题'), { n: state.questions.length })) + ' · ' + esc(utT(UT_MODES.practice.descKey, UT_MODES.practice.description)) + '</p>' +
                bestHtml +
                '<button type="button" class="btn btn-primary ut-start-btn" data-ut-action="start">' + esc(utT('ut_start', '开始特训')) + ' <i class="fa-solid fa-arrow-right"></i></button>' +
            '</div>';
    }

    function renderQuestion() {
        state.screen = 'question';
        var q = state.questions[state.index];
        var renderer = UT_RENDERERS[q.type] || UT_RENDERERS['video-choice'];
        state.answered = false;
        state.lastChosen = null;

        var progress = state.questions.map(function (_, i) {
            var cls = 'ut-dot';
            if (i < state.index) cls += ' done';
            if (i === state.index) cls += ' current';
            return '<span class="' + cls + '"></span>';
        }).join('');

        stage.innerHTML = '' +
            '<div class="ut-quiz">' +
                '<div class="ut-quiz-head">' +
                    '<span class="ut-step">' + esc(utFmt(utT('ut_step', '第 {cur} / {total} 题'), { cur: state.index + 1, total: state.questions.length })) + '</span>' +
                    '<span class="ut-topic">' + esc(topicLabel(q.topic)) + '</span>' +
                    '<div class="ut-progress">' + progress + '</div>' +
                '</div>' +
                '<div class="ut-body">' + renderer.render(q) + '</div>' +
                '<div class="ut-verdict" id="utVerdict" hidden></div>' +
            '</div>';

        var video = document.getElementById('utVideo');
        if (video) {
            video.addEventListener('error', function () {
                video.style.display = 'none';
                var missing = document.getElementById('utVideoMissing');
                if (missing) missing.hidden = false;
            });
        }
    }

    function topicLabel(topic) {
        var map = { 'toss-angle': 'toss' };
        var k = map[topic];
        if (k === 'toss') return utT('ut_topic_toss', '抛球角度');
        return utT('ut_topic_general', '综合判罚');
    }

    function renderVerdict(q, chosen, opts) {
        opts = opts || {};
        var renderer = UT_RENDERERS[q.type] || UT_RENDERERS['video-choice'];
        var ok = renderer.grade(q, chosen);
        if (ok && opts.count !== false) state.correct++;
        if (opts.count !== false) { state.answered = true; state.lastChosen = chosen; }

        // 选项高亮
        stage.querySelectorAll('.ut-option').forEach(function (btn) {
            var id = btn.getAttribute('data-ut-option');
            btn.disabled = true;
            if (id === q.answer) btn.classList.add('correct');
            else if (id === chosen) btn.classList.add('wrong');
        });

        var isLast = state.index >= state.questions.length - 1;
        var verdict = document.getElementById('utVerdict');
        verdict.hidden = false;
        verdict.innerHTML = '' +
            '<div class="ut-verdict-inner ' + (ok ? 'ok' : 'bad') + '">' +
                '<div class="ut-verdict-title">' +
                    '<i class="fa-solid ' + (ok ? 'fa-circle-check' : 'fa-circle-xmark') + '"></i>' +
                    esc(ok ? utT('ut_verdict_ok', '判罚正确！') : utT('ut_verdict_bad', '误判了……')) +
                '</div>' +
                '<p class="ut-explain">' + esc(utField(q, 'explanation')) + '</p>' +
                (utField(q, 'ruleRef') ? '<p class="ut-rule-ref"><i class="fa-solid fa-book"></i> ' + esc(utField(q, 'ruleRef')) + '</p>' : '') +
                '<button type="button" class="btn btn-primary ut-next-btn" data-ut-action="' + (isLast ? 'finish' : 'next') + '">' +
                    esc(isLast ? utT('ut_finish', '查看成绩') : utT('ut_next', '下一题')) + ' <i class="fa-solid fa-arrow-right"></i>' +
                '</button>' +
            '</div>';
        verdict.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderResult(isReapply) {
        state.screen = 'result';
        var total = state.questions.length;
        var correct = state.correct;
        var percent = total ? Math.round((correct / total) * 100) : 0;
        var passScore = (state.meta && state.meta.passScore) || 60;
        var passed = percent >= passScore;
        var isNewBest = isReapply ? !!state.lastNewBest : saveBest({ correct: correct, total: total, percent: percent, at: Date.now() });
        state.lastNewBest = isNewBest;

        var rank, icon;
        if (percent >= 100) { rank = utT('ut_rank_intl', '国际级裁判'); icon = 'fa-crown'; }
        else if (percent >= 80) { rank = utT('ut_rank_nat', '国家级裁判'); icon = 'fa-medal'; }
        else if (percent >= passScore) { rank = utT('ut_rank_certified', '持证上岗'); icon = 'fa-id-card'; }
        else { rank = utT('ut_rank_trainee', '见习裁判'); icon = 'fa-user-graduate'; }

        stage.innerHTML = '' +
            '<div class="ut-result">' +
                '<div class="ut-result-icon ' + (passed ? 'pass' : 'fail') + '"><i class="fa-solid ' + icon + '"></i></div>' +
                '<h2>' + esc(passed ? utT('ut_pass_title', '特训通过！') : utT('ut_fail_title', '继续加油！')) + '</h2>' +
                '<div class="ut-score-ring" style="--ut-percent:' + percent + '">' +
                    '<span class="ut-score-num">' + percent + '<small>%</small></span>' +
                '</div>' +
                '<p class="ut-result-detail">' + utFmt(utT('ut_result_detail', '答对 {c} / {t} 题 · 评级：<strong>{rank}</strong>'), { c: correct, t: total, rank: esc(rank) }) + '</p>' +
                (isNewBest ? '<p class="ut-new-best"><i class="fa-solid fa-trophy"></i> ' + esc(utT('ut_new_best', '新纪录！')) + '</p>' : '') +
                '<div class="ut-result-actions">' +
                    '<button type="button" class="btn btn-primary" data-ut-action="restart"><i class="fa-solid fa-rotate-right"></i> ' + esc(utT('ut_restart', '再来一轮')) + '</button>' +
                    '<a class="btn btn-secondary" href="index.html"><i class="fa-solid fa-house"></i> ' + esc(utT('ut_back_home', '返回首页')) + '</a>' +
                '</div>' +
            '</div>';
    }

    function renderLoadError() {
        state.screen = 'error';
        stage.innerHTML = '' +
            '<div class="ut-error">' +
                '<i class="fa-solid fa-triangle-exclamation"></i>' +
                '<p>' + esc(utT('ut_load_fail', '题库加载失败，请稍后再试。')) + '</p>' +
                '<button type="button" class="btn btn-primary" onclick="location.reload()">' + esc(utT('ut_reload', '重新加载')) + '</button>' +
            '</div>';
    }

    /* 语言切换钩子（setLanguage 探测函数名：umpireTrainingReapplyI18n） */
    function umpireTrainingReapplyI18n() {
        if (!stage) return;
        if (state.screen === 'error') { renderLoadError(); return; }
        if (!state.meta || !state.questions.length) return;
        if (state.screen === 'question') {
            var q = state.questions[state.index];
            if (!q) return;
            var chosen = state.lastChosen;
            var answered = state.answered;
            renderQuestion();
            if (answered && chosen != null) renderVerdict(q, chosen, { count: false });
        } else if (state.screen === 'result') {
            renderResult(true);
        } else {
            renderWelcome();
        }
    }
    window.umpireTrainingReapplyI18n = umpireTrainingReapplyI18n;

    /* ---------- 流程控制 ---------- */

    function startQuiz() {
        state.index = 0;
        state.correct = 0;
        state.answered = false;
        state.lastChosen = null;
        state.lastNewBest = false;
        renderQuestion();
    }

    stage.addEventListener('click', function (e) {
        var actionBtn = e.target.closest('[data-ut-action]');
        if (actionBtn) {
            var action = actionBtn.getAttribute('data-ut-action');
            if (action === 'start' || action === 'restart') startQuiz();
            else if (action === 'next') { state.index++; renderQuestion(); }
            else if (action === 'finish') renderResult();
            return;
        }
        var optBtn = e.target.closest('[data-ut-option]');
        if (optBtn && !state.answered) {
            state.answered = true;
            renderVerdict(state.questions[state.index], optBtn.getAttribute('data-ut-option'));
        }
    });

    /* ---------- 启动 ---------- */

    fetch(DATA_URL)
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            state.meta = data.meta || {};
            state.questions = (data.questions || []).filter(function (q) { return q && q.id; });
            if (!state.questions.length) throw new Error('empty');
            renderWelcome();
        })
        .catch(function () {
            renderLoadError();
        });
})();
