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
                        '<span class="ut-option-label">' + esc(o.label) + '</span>' +
                        '</button>';
                }).join('');
                return '' +
                    '<div class="ut-video-wrap">' +
                        '<video class="ut-video" id="utVideo" src="' + esc(q.video) + '" controls playsinline preload="metadata"></video>' +
                        '<div class="ut-video-missing" id="utVideoMissing" hidden>' +
                            '<i class="fa-solid fa-film"></i>' +
                            '<p>示范视频待补充<br><small>' + esc(q.video) + '</small></p>' +
                        '</div>' +
                    '</div>' +
                    '<p class="ut-prompt">' + esc(q.prompt) + '</p>' +
                    '<div class="ut-options" role="group" aria-label="选项">' + opts + '</div>';
            },
            grade: function (q, chosen) { return chosen === q.answer; }
        }
    };

    /* 模式注册表（扩展点：未来可加 'timed'、'streak' 等） */
    var UT_MODES = {
        practice: { label: '练习模式', description: '逐题作答，即时反馈与解析' }
    };

    /* ---------- 状态 ---------- */

    var state = {
        meta: null,
        questions: [],
        index: 0,
        correct: 0,
        answered: false
    };

    /* ---------- 视图 ---------- */

    function renderWelcome() {
        var best = getBest();
        var bestHtml = best
            ? '<p class="ut-best"><i class="fa-solid fa-trophy"></i> 历史最佳：' + best.correct + '/' + best.total + '（' + best.percent + '%）</p>'
            : '';
        stage.innerHTML = '' +
            '<div class="ut-welcome">' +
                '<div class="ut-welcome-icon"><i class="fa-solid fa-whistle"></i></div>' +
                '<h2>' + esc(state.meta.title || '乒乓球裁判特训') + '</h2>' +
                '<p class="ut-welcome-desc">' + esc(state.meta.description || '') + '</p>' +
                '<ul class="ut-rules">' +
                    '<li><i class="fa-solid fa-circle-play"></i> 观看发球视频</li>' +
                    '<li><i class="fa-solid fa-angles-up"></i> 判断抛球是否近乎垂直</li>' +
                    '<li><i class="fa-solid fa-scale-balanced"></i> 做出你的判罚</li>' +
                '</ul>' +
                '<p class="ut-count">共 ' + state.questions.length + ' 题 · ' + esc(UT_MODES.practice.description) + '</p>' +
                bestHtml +
                '<button type="button" class="btn btn-primary ut-start-btn" data-ut-action="start">开始特训 <i class="fa-solid fa-arrow-right"></i></button>' +
            '</div>';
    }

    function renderQuestion() {
        var q = state.questions[state.index];
        var renderer = UT_RENDERERS[q.type] || UT_RENDERERS['video-choice'];
        state.answered = false;

        var progress = state.questions.map(function (_, i) {
            var cls = 'ut-dot';
            if (i < state.index) cls += ' done';
            if (i === state.index) cls += ' current';
            return '<span class="' + cls + '"></span>';
        }).join('');

        stage.innerHTML = '' +
            '<div class="ut-quiz">' +
                '<div class="ut-quiz-head">' +
                    '<span class="ut-step">第 ' + (state.index + 1) + ' / ' + state.questions.length + ' 题</span>' +
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
        var map = { 'toss-angle': '抛球角度' };
        return map[topic] || topic || '综合判罚';
    }

    function renderVerdict(q, chosen) {
        var renderer = UT_RENDERERS[q.type] || UT_RENDERERS['video-choice'];
        var ok = renderer.grade(q, chosen);
        if (ok) state.correct++;

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
                    (ok ? '判罚正确！' : '误判了……') +
                '</div>' +
                '<p class="ut-explain">' + esc(q.explanation || '') + '</p>' +
                (q.ruleRef ? '<p class="ut-rule-ref"><i class="fa-solid fa-book"></i> ' + esc(q.ruleRef) + '</p>' : '') +
                '<button type="button" class="btn btn-primary ut-next-btn" data-ut-action="' + (isLast ? 'finish' : 'next') + '">' +
                    (isLast ? '查看成绩' : '下一题') + ' <i class="fa-solid fa-arrow-right"></i>' +
                '</button>' +
            '</div>';
        verdict.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderResult() {
        var total = state.questions.length;
        var correct = state.correct;
        var percent = total ? Math.round((correct / total) * 100) : 0;
        var passScore = (state.meta && state.meta.passScore) || 60;
        var passed = percent >= passScore;
        var isNewBest = saveBest({ correct: correct, total: total, percent: percent, at: Date.now() });

        var rank, icon;
        if (percent >= 100) { rank = '国际级裁判'; icon = 'fa-crown'; }
        else if (percent >= 80) { rank = '国家级裁判'; icon = 'fa-medal'; }
        else if (percent >= passScore) { rank = '持证上岗'; icon = 'fa-id-card'; }
        else { rank = '见习裁判'; icon = 'fa-user-graduate'; }

        stage.innerHTML = '' +
            '<div class="ut-result">' +
                '<div class="ut-result-icon ' + (passed ? 'pass' : 'fail') + '"><i class="fa-solid ' + icon + '"></i></div>' +
                '<h2>' + (passed ? '特训通过！' : '继续加油！') + '</h2>' +
                '<div class="ut-score-ring" style="--ut-percent:' + percent + '">' +
                    '<span class="ut-score-num">' + percent + '<small>%</small></span>' +
                '</div>' +
                '<p class="ut-result-detail">答对 ' + correct + ' / ' + total + ' 题 · 评级：<strong>' + rank + '</strong></p>' +
                (isNewBest ? '<p class="ut-new-best"><i class="fa-solid fa-trophy"></i> 新纪录！</p>' : '') +
                '<div class="ut-result-actions">' +
                    '<button type="button" class="btn btn-primary" data-ut-action="restart"><i class="fa-solid fa-rotate-right"></i> 再来一轮</button>' +
                    '<a class="btn btn-secondary" href="index.html"><i class="fa-solid fa-house"></i> 返回首页</a>' +
                '</div>' +
            '</div>';
    }

    /* ---------- 流程控制 ---------- */

    function startQuiz() {
        state.index = 0;
        state.correct = 0;
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
            stage.innerHTML = '' +
                '<div class="ut-error">' +
                    '<i class="fa-solid fa-triangle-exclamation"></i>' +
                    '<p>题库加载失败，请稍后再试。</p>' +
                    '<button type="button" class="btn btn-primary" onclick="location.reload()">重新加载</button>' +
                '</div>';
        });
})();
