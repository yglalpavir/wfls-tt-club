/* ========================================
   docs-browser.js — docs.html 网站文档文件管理器
   数据源：Assets/manifest.json（由 tools/gen_assets_manifest.py 生成；部署时由 deploy
   工作流现场重建，本地开发需手动运行一次该脚本）。纯前端只读浏览。

   约定：
   - 任何文件/目录访问都先在 manifest 树中按路径查到节点，再拼 URL —— 用户输入的
     hash 永远不会直接拼进请求路径（防伪造路径）。
   - 全部渲染经 escapeHtml，交互走事件委托 + data-* 属性（无内联 onclick）。
   - hash 路由：#/目录 → 浏览该目录；#/目录/文件 → 浏览父目录并打开预览。
   - 文案走 common.js 的 i18n 词典（docs_* 键）；t() 带中文回退，common.js 缺失时
     页面仍可用。语言切换由 common.js setLanguage 回调 docsBrowserReapplyI18n()。
   ======================================== */
(function () {
    "use strict";

    var $ = function (id) { return document.getElementById(id); };

    /* ---------- i18n ---------- */

    // 词典在 common.js（全局 i18n/currentLang）；zhFallback 保证独立运行时仍有中文文案
    function t(key, zhFallback) {
        if (typeof i18n !== "undefined" && typeof currentLang !== "undefined") {
            var pack = i18n[currentLang];
            if (pack && pack[key] != null) return pack[key];
        }
        return zhFallback !== undefined ? zhFallback : key;
    }
    function tpl(key, zhFallback, vars) {
        var s = t(key, zhFallback);
        return s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    }

    /* ---------- 通用工具 ---------- */

    function escapeHtml(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // <pre> 文本上下文只需转义 & < >；保留引号原样，代码高亮的字符串正则才能直接匹配
    function escapeCode(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function formatSize(b) {
        if (b == null || isNaN(b)) return "";
        if (b < 1024) return b + " B";
        var units = ["KB", "MB", "GB", "TB"];
        var v = b, i = -1;
        do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
        return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + " " + units[i];
    }

    function urlOf(path) {
        // 每段单独编码：中文/空格文件名安全，"/" 分隔符保留
        return "Assets/" + String(path).split("/").map(encodeURIComponent).join("/");
    }

    /* ---------- 类型体系 ---------- */

    var EXT_TYPE_MAP = {
        png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
        bmp: "image", avif: "image", ico: "image",
        svg: "svg",
        mp4: "video", webm: "video", ogv: "video", mov: "video", m4v: "video", mkv: "video",
        mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio", aac: "audio", opus: "audio",
        pdf: "pdf",
        md: "markdown", markdown: "markdown",
        txt: "text", log: "text", csv: "text", tsv: "text", json: "text",
        js: "text", mjs: "text", cjs: "text", ts: "text", css: "text", html: "text", htm: "text",
        xml: "text", py: "text", yml: "text", yaml: "text", ini: "text", conf: "text",
        sh: "text", bat: "text", ps1: "text", sql: "text", vtt: "text", srt: "text",
        xlsx: "sheet", xls: "sheet",
        doc: "doc", docx: "doc", ppt: "ppt", pptx: "ppt",
        zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive", tgz: "archive"
    };

    // lk = common.js i18n 键；label = 中文回退
    var TYPE_META = {
        folder:   { icon: "fa-solid fa-folder",          cls: "t-folder",  lk: "docs_type_folder",   label: "文件夹" },
        image:    { icon: "fa-solid fa-file-image",      cls: "t-image",   lk: "docs_type_image",    label: "图片" },
        svg:      { icon: "fa-solid fa-bezier-curve",    cls: "t-svg",     lk: "docs_type_svg",      label: "SVG 矢量图" },
        video:    { icon: "fa-solid fa-file-video",      cls: "t-video",   lk: "docs_type_video",    label: "视频" },
        audio:    { icon: "fa-solid fa-file-audio",      cls: "t-audio",   lk: "docs_type_audio",    label: "音频" },
        pdf:      { icon: "fa-solid fa-file-pdf",        cls: "t-pdf",     lk: "docs_type_pdf",      label: "PDF 文档" },
        markdown: { icon: "fa-brands fa-markdown",       cls: "t-md",      lk: "docs_type_markdown", label: "Markdown" },
        text:     { icon: "fa-solid fa-file-lines",      cls: "t-text",    lk: "docs_type_text",     label: "文本/代码" },
        sheet:    { icon: "fa-solid fa-file-excel",      cls: "t-sheet",   lk: "docs_type_sheet",    label: "表格" },
        doc:      { icon: "fa-solid fa-file-word",       cls: "t-doc",     lk: "docs_type_doc",      label: "Word 文档" },
        ppt:      { icon: "fa-solid fa-file-powerpoint", cls: "t-ppt",     lk: "docs_type_ppt",      label: "PPT 演示" },
        archive:  { icon: "fa-solid fa-file-zipper",     cls: "t-archive", lk: "docs_type_archive",  label: "压缩包" },
        other:    { icon: "fa-solid fa-file",            cls: "t-other",   lk: "docs_type_other",    label: "文件" }
    };

    function typeOf(node) {
        return node.t === "d" ? "folder" : (EXT_TYPE_MAP[node.e] || "other");
    }

    function typeLabel(typeKey) {
        var meta = TYPE_META[typeKey] || TYPE_META.other;
        return t(meta.lk, meta.label);
    }

    var FILTER_GROUPS = [
        { key: "all",   lk: "docs_f_all",   label: "全部",      types: null },
        { key: "image", lk: "docs_f_image", label: "图片",      types: ["image", "svg"] },
        { key: "video", lk: "docs_f_video", label: "视频",      types: ["video"] },
        { key: "audio", lk: "docs_f_audio", label: "音频",      types: ["audio"] },
        { key: "text",  lk: "docs_f_text",  label: "文本/代码", types: ["text", "markdown"] },
        { key: "doc",   lk: "docs_f_doc",   label: "文档",      types: ["pdf", "sheet", "doc", "ppt", "archive"] }
    ];

    var TEXT_MAX_CHARS = 2 * 1024 * 1024; // 文本预览上限（超出截断）

    /* ---------- 状态 ---------- */

    var state = {
        manifest: null,
        index: null,           // Map: path -> node（含根 ""）
        path: "",              // 当前目录（"" = Assets 根）
        view: "grid",          // grid | list
        q: "",                 // 筛选关键字
        chip: "all",           // 当前类型筛选
        preview: null,         // { files: [...], idx: int }
        pvSource: false,       // SVG 源码模式
        pvWrap: false,         // 文本自动换行
        seq: 0                 // 异步预览竞态守卫
    };

    try {
        var savedView = localStorage.getItem("wfls-docs-view");
        if (savedView === "grid" || savedView === "list") state.view = savedView;
    } catch (e) { /* localStorage 不可用则用默认值 */ }

    function resetZoomFn() { /* 由图片预览构建时覆盖 */ }

    /* ---------- manifest 索引 ---------- */

    function buildIndex() {
        // 目录与文件都入索引：#/目录/文件 深链路由要按路径查到文件节点
        state.index = new Map();
        (function walk(node, path) {
            node._p = path;
            state.index.set(path, node);
            (node.c || []).forEach(function (child) {
                var cp = path ? path + "/" + child.n : child.n;
                child._p = cp;
                state.index.set(cp, child);
                if (child.t === "d") walk(child, cp);
            });
        })(state.manifest.tree, "");
    }

    function dirNode() { return state.index.get(state.path); }

    function visibleEntries() {
        var dir = dirNode();
        if (!dir) return [];
        var q = state.q.toLowerCase();
        var group = FILTER_GROUPS.filter(function (g) { return g.key === state.chip; })[0];
        return (dir.c || []).filter(function (n) {
            if (q && String(n.n).toLowerCase().indexOf(q) === -1) return false;
            // 文件夹不受类型筛选影响（保证仍可导航）
            if (n.t !== "d" && group && group.types && group.types.indexOf(typeOf(n)) === -1) return false;
            return true;
        });
    }

    function previewFiles() {
        return visibleEntries().filter(function (n) { return n.t === "f"; });
    }

    /* ---------- hash 路由 ---------- */

    function replaceHash(path) {
        history.replaceState(null, "", "#/" + path);
    }

    function navigateTo(path) {
        if (state.preview) closePreview({ skipHash: true });
        location.hash = "#/" + path;
    }

    function applyRoute() {
        var raw = location.hash.replace(/^#\/?/, "");
        try { raw = decodeURIComponent(raw); } catch (err) { /* 保留原样走查树 */ }
        raw = raw.replace(/\/+$/, "");
        var node = raw === "" ? state.manifest.tree : state.index.get(raw);
        if (!node) { location.replace("#/"); return; }
        if (node.t === "d") {
            if (state.preview) closePreview({ skipHash: true });
            // 搜索词是目录上下文的，切目录时清空，避免"新目录看起来是空的"
            if (state.path !== raw && state.q) {
                state.q = "";
                $("fmSearch").value = "";
            }
            state.path = raw;
            renderCurrent();
        } else {
            var slash = raw.lastIndexOf("/");
            state.path = slash === -1 ? "" : raw.slice(0, slash);
            renderCurrent();
            var files = previewFiles();
            var idx = files.indexOf(node);
            if (idx === -1 && (state.q || state.chip !== "all")) {
                // 深链文件被当前筛选挡住时，清空筛选保证可见
                state.q = ""; state.chip = "all"; $("fmSearch").value = "";
                renderCurrent();
                files = previewFiles();
                idx = files.indexOf(node);
            }
            if (state.preview && state.preview.files[state.preview.idx] === node) return;
            if (idx !== -1) openPreview(idx, { fromRoute: true });
        }
    }

    /* ---------- 渲染：面包屑 / 统计 / 筛选 ---------- */

    function renderCrumbs() {
        var segs = state.path ? state.path.split("/") : [];
        var html = '<button type="button" class="crumb' + (segs.length ? "" : " current") + '" data-path=""' +
            (segs.length ? "" : ' aria-current="page"') + '><i class="fa-solid fa-cube"></i> Assets</button>';
        segs.forEach(function (seg, i) {
            var p = segs.slice(0, i + 1).join("/");
            var last = i === segs.length - 1;
            html += '<i class="fa-solid fa-chevron-right crumb-sep"></i>' +
                '<button type="button" class="crumb' + (last ? " current" : "") + '" data-path="' + escapeHtml(p) + '"' +
                (last ? ' aria-current="page"' : "") + ">" + escapeHtml(seg) + "</button>";
        });
        $("fmCrumbs").innerHTML = html;
    }

    function renderStats() {
        var dir = dirNode();
        if (!dir) { $("fmStats").textContent = ""; return; }
        var parts = [];
        if (dir.dc > 0) parts.push(tpl("docs_unit_dirs", "{n} 个子文件夹", { n: dir.dc }));
        parts.push(tpl("docs_unit_files", "{n} 个文件", { n: dir.fc }));
        parts.push(formatSize(dir.sz));
        $("fmStats").textContent = parts.join(" · ");
    }

    function renderChips() {
        var dir = dirNode();
        var files = (dir ? (dir.c || []) : []).filter(function (n) { return n.t === "f"; });
        var html = FILTER_GROUPS.map(function (g) {
            var count = !g.types ? files.length : files.filter(function (n) {
                return g.types.indexOf(typeOf(n)) !== -1;
            }).length;
            var active = state.chip === g.key;
            var zero = count === 0 && !active;
            return '<button type="button" class="chip' + (active ? " active" : "") + '"' +
                (zero ? " disabled" : "") + ' data-chip="' + g.key + '">' + t(g.lk, g.label) +
                ' <b>' + count + "</b></button>";
        }).join("");
        // 目录内没有文件（如 Assets 根只有子文件夹）时，类型筛选行没有意义，直接隐藏
        $("fmChips").innerHTML = html;
        $("fmChips").hidden = files.length === 0;
    }

    /* ---------- 渲染：列表 ---------- */

    function folderMetaText(n) {
        var files = tpl("docs_unit_files", "{n} 个文件", { n: n.fc });
        if (!n.fc && !n.dc) return t("docs_folder_empty", "空文件夹") + " · " + formatSize(n.sz);
        return files + (n.dc ? " · " + tpl("docs_unit_dirs", "{n} 个子文件夹", { n: n.dc }) : "") + " · " + formatSize(n.sz);
    }

    function gridItemHTML(n, fileIdx) {
        if (n.t === "d") {
            return '<div class="fm-item is-folder" role="button" tabindex="0" data-path="' + escapeHtml(n._p) + '">' +
                '<div class="fm-thumb"><i class="fa-solid fa-folder"></i></div>' +
                '<div class="fm-name" title="' + escapeHtml(n.n) + '">' + escapeHtml(n.n) + "</div>" +
                '<div class="fm-meta">' + escapeHtml(folderMetaText(n)) + "</div></div>";
        }
        var t2 = typeOf(n), meta = TYPE_META[t2];
        var thumb = t2 === "image"
            ? '<img src="' + escapeHtml(urlOf(n._p)) + '" alt="" loading="lazy" decoding="async">'
            : '<i class="' + meta.icon + '"></i><span class="fm-ext">' +
              escapeHtml(n.e ? n.e.toUpperCase() : "?") + "</span>";
        return '<div class="fm-item" role="button" tabindex="0" data-file-idx="' + fileIdx + '">' +
            '<div class="fm-thumb ' + meta.cls + '">' + thumb + "</div>" +
            '<div class="fm-name" title="' + escapeHtml(n.n) + '">' + escapeHtml(n.n) + "</div>" +
            '<div class="fm-meta">' + escapeHtml(typeLabel(t2)) + " · " + formatSize(n.sz) + "</div></div>";
    }

    function rowHTML(n, fileIdx) {
        var t2 = typeOf(n), meta = TYPE_META[t2];
        var kind = typeLabel(t2);
        var iconCls = n.t === "d" ? TYPE_META.folder.cls : meta.cls;
        var icon = n.t === "d" ? TYPE_META.folder.icon : meta.icon;
        return '<div class="fm-row" role="button" tabindex="0" data-' +
            (n.t === "d" ? 'path="' + escapeHtml(n._p) + '"' : 'file-idx="' + fileIdx + '"') + ">" +
            '<span class="fm-row-icon ' + iconCls + '"><i class="' + icon + '"></i></span>' +
            '<span class="fm-row-name" title="' + escapeHtml(n.n) + '">' + escapeHtml(n.n) + "</span>" +
            '<span class="fm-row-kind">' + escapeHtml(kind) + "</span>" +
            '<span class="fm-row-size">' + (n.t === "d" ? escapeHtml(folderMetaText(n)) : formatSize(n.sz)) + "</span>" +
            '<span class="fm-row-go"><i class="fa-solid fa-chevron-right"></i></span></div>';
    }

    function renderListing() {
        var entries = visibleEntries();
        var fileCounter = 0;
        var gridHtml = "", listHtml = "";
        entries.forEach(function (n) {
            var idx = n.t === "f" ? fileCounter++ : -1;
            gridHtml += gridItemHTML(n, idx);
            listHtml += rowHTML(n, idx);
        });
        $("fmGrid").innerHTML = gridHtml;
        $("fmList").innerHTML = listHtml;
        var empty = $("fmEmpty");
        if (!entries.length) {
            empty.innerHTML = state.q
                ? '<i class="fa-solid fa-magnifying-glass"></i><p>' + escapeHtml(tpl("docs_empty_search", "没有匹配「{q}」的条目", { q: state.q })) + "</p>"
                : '<i class="fa-solid fa-folder-open"></i><p>' + escapeHtml(t("docs_empty_dir", "此文件夹为空")) + "</p>";
            empty.hidden = false;
        } else {
            empty.hidden = true;
        }
        $("fmGrid").hidden = state.view !== "grid";
        $("fmList").hidden = state.view !== "list";
    }

    function renderCurrent() {
        renderCrumbs();
        renderStats();
        renderChips();
        renderListing();
    }

    /* ---------- 预览模态 ---------- */

    function pauseMedia() {
        Array.prototype.forEach.call(
            document.querySelectorAll("#pvBody video, #pvBody audio"),
            function (el) { try { el.pause(); } catch (e) { /* 忽略 */ } }
        );
    }

    function openPreview(idx, opts) {
        opts = opts || {};
        var files = previewFiles();
        if (!files.length || idx < 0 || idx >= files.length) return;
        state.preview = { files: files, idx: idx };
        state.pvSource = false;
        $("pvOverlay").hidden = false;
        document.body.style.overflow = "hidden";
        renderPreview();
        if (!opts.fromRoute) replaceHash(files[idx]._p);
        var closeBtn = $("pvClose");
        if (closeBtn) closeBtn.focus();
    }

    function goPreview(delta) {
        if (!state.preview) return;
        var n = state.preview.files.length;
        state.preview.idx = (state.preview.idx + delta + n) % n;
        state.pvSource = false;
        renderPreview();
        replaceHash(state.preview.files[state.preview.idx]._p);
    }

    function closePreview(opts) {
        opts = opts || {};
        if (!state.preview) return;
        pauseMedia();
        state.preview = null;
        $("pvBody").innerHTML = "";
        $("pvOverlay").hidden = true;
        document.body.style.overflow = "";
        resetZoomFn = function () { };
        if (!opts.skipHash) { replaceHash(state.path); applyRoute(); }
    }

    function renderPreview() {
        var pv = state.preview;
        if (!pv) return;
        var node = pv.files[pv.idx];
        var t2 = typeOf(node), meta = TYPE_META[t2];
        var fullPath = node._p;

        // 从一个文件切到另一个文件（←/→ 或 hash 路由）时必须清掉上一个预览的媒体元素
        pauseMedia();
        var body = $("pvBody");
        body.innerHTML = "";

        $("pvIcon").className = "pv-fileicon " + meta.cls;
        $("pvIcon").innerHTML = '<i class="' + meta.icon + '"></i>';
        $("pvName").textContent = node.n;
        $("pvName").title = node.n;
        $("pvSub").textContent = typeLabel(t2) + " · " + formatSize(node.sz) +
            (node.e ? " · ." + node.e : "");
        $("pvOpen").href = urlOf(fullPath);
        $("pvDownload").href = urlOf(fullPath);
        $("pvDownload").setAttribute("download", node.n);
        $("pvPos").textContent = (pv.idx + 1) + " / " + pv.files.length;
        var single = pv.files.length < 2;
        $("pvPrev").disabled = single;
        $("pvNext").disabled = single;

        // 头部动作按钮按类型显隐
        $("pvSourceBtn").hidden = t2 !== "svg";
        $("pvSourceBtn").innerHTML = state.pvSource
            ? '<i class="fa-solid fa-image"></i> ' + escapeHtml(t("docs_pv_rendered", "图片预览"))
            : '<i class="fa-solid fa-code"></i> ' + escapeHtml(t("docs_pv_source", "查看源码"));
        $("pvWrapBtn").hidden = t2 !== "text" && t2 !== "markdown";
        $("pvWrapBtn").innerHTML = state.pvWrap
            ? '<i class="fa-solid fa-arrows-left-right-to-line"></i> ' + escapeHtml(t("docs_wrap_off", "不换行"))
            : '<i class="fa-solid fa-arrows-left-right"></i> ' + escapeHtml(t("docs_wrap_on", "自动换行"));
        $("pvZoomBtn").hidden = (t2 !== "image" && !(t2 === "svg" && !state.pvSource));

        body.className = "pv-body mode-" + (t2 === "image" || t2 === "svg" ? (state.pvSource ? "text" : "media")
            : t2 === "video" || t2 === "audio" || t2 === "pdf" ? "media"
            : t2 === "text" || t2 === "markdown" ? "text" : "fallback");

        resetZoomFn = function () { };
        var token = ++state.seq;
        if (t2 === "image") buildImageView(node, fullPath, body, false);
        else if (t2 === "svg") {
            if (state.pvSource) buildTextView(node, fullPath, body, token, "xml");
            else buildImageView(node, fullPath, body, true);
        }
        else if (t2 === "video") buildVideoView(node, fullPath, body);
        else if (t2 === "audio") buildAudioView(node, fullPath, body);
        else if (t2 === "pdf") buildPdfView(node, fullPath, body);
        else if (t2 === "markdown") buildMarkdownView(node, fullPath, body, token);
        else if (t2 === "text") buildTextView(node, fullPath, body, token, node.e);
        else buildFallbackView(node, body);
    }

    function buildImageView(node, fullPath, body, isSvg) {
        var wrap = document.createElement("div");
        wrap.className = "pv-imgwrap";
        var img = document.createElement("img");
        img.className = "pv-img";
        img.alt = node.n;
        img.decoding = "async";
        img.src = urlOf(fullPath);
        wrap.appendChild(img);
        body.appendChild(wrap);

        var badge = document.createElement("span");
        badge.className = "pv-zoombadge";
        badge.textContent = "100%";
        body.appendChild(badge);

        var zoom = { s: 1, x: 0, y: 0 };
        var apply = function () {
            img.style.transform = "translate(" + zoom.x + "px," + zoom.y + "px) scale(" + zoom.s + ")";
            badge.textContent = Math.round(zoom.s * 100) + "%";
        };
        resetZoomFn = function () { zoom.s = 1; zoom.x = 0; zoom.y = 0; apply(); };

        wrap.addEventListener("wheel", function (e) {
            e.preventDefault();
            var rect = wrap.getBoundingClientRect();
            var mx = e.clientX - rect.left - rect.width / 2;
            var my = e.clientY - rect.top - rect.height / 2;
            var factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
            var ns = Math.min(12, Math.max(0.15, zoom.s * factor));
            var f = ns / zoom.s;
            zoom.x = mx - (mx - zoom.x) * f;
            zoom.y = my - (my - zoom.y) * f;
            zoom.s = ns;
            apply();
        }, { passive: false });

        var drag = null;
        wrap.addEventListener("pointerdown", function (e) {
            if (e.button !== 0) return;
            drag = { px: e.clientX, py: e.clientY, x: zoom.x, y: zoom.y };
            wrap.classList.add("grabbing");
            try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        });
        wrap.addEventListener("pointermove", function (e) {
            if (!drag) return;
            zoom.x = drag.x + (e.clientX - drag.px);
            zoom.y = drag.y + (e.clientY - drag.py);
            apply();
        });
        wrap.addEventListener("pointerup", function () { drag = null; wrap.classList.remove("grabbing"); });
        wrap.addEventListener("pointercancel", function () { drag = null; wrap.classList.remove("grabbing"); });
        wrap.addEventListener("dblclick", resetZoomFn);

        img.addEventListener("load", function () { wrap.classList.add("loaded"); });
        img.addEventListener("error", function () {
            body.innerHTML = "";
            body.className = "pv-body mode-fallback";
            buildErrorView(body, urlOf(fullPath), t("docs_img_fail", "图片加载失败"));
        });
    }

    function buildVideoView(node, fullPath, body) {
        var v = document.createElement("video");
        v.controls = true;
        v.playsInline = true;
        v.preload = "metadata";
        v.src = urlOf(fullPath);
        v.addEventListener("error", function () {
            body.innerHTML = "";
            body.className = "pv-body mode-fallback";
            buildErrorView(body, urlOf(fullPath), t("docs_video_fail", "浏览器不支持直接播放该视频格式（如 MOV），请下载后播放"));
        });
        body.appendChild(v);
    }

    function buildAudioView(node, fullPath, body) {
        var box = document.createElement("div");
        box.className = "pv-audio";
        box.innerHTML = '<i class="fa-solid fa-music"></i><div class="pv-audio-name"></div>';
        box.querySelector(".pv-audio-name").textContent = node.n;
        var a = document.createElement("audio");
        a.controls = true;
        a.preload = "metadata";
        a.src = urlOf(fullPath);
        a.addEventListener("error", function () {
            box.innerHTML = "";
            buildErrorView(body, urlOf(fullPath), t("docs_audio_fail", "浏览器不支持该音频格式"));
        });
        box.appendChild(a);
        body.appendChild(box);
    }

    function buildPdfView(node, fullPath, body) {
        var iframe = document.createElement("iframe");
        iframe.className = "pv-iframe";
        iframe.src = urlOf(fullPath);
        iframe.title = node.n;
        body.appendChild(iframe);
    }

    function buildTextView(node, fullPath, body, token, ext) {
        var pre = document.createElement("pre");
        pre.className = "pv-pre" + (state.pvWrap ? " wrap" : "");
        pre.textContent = t("docs_loading_text", "加载中…");
        body.appendChild(pre);
        fetch(urlOf(fullPath)).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
        }).then(function (text) {
            if (token !== state.seq) return; // 用户已切换到其他预览
            var truncated = false;
            if (text.length > TEXT_MAX_CHARS) {
                text = text.slice(0, TEXT_MAX_CHARS);
                truncated = true;
            }
            if (ext === "json") {
                try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (err) { /* 按原文展示 */ }
            }
            pre.innerHTML = "";
            var code = document.createElement("code");
            code.innerHTML = highlightCode(escapeCode(text), ext);
            pre.appendChild(code);
            if (truncated) {
                var note = document.createElement("div");
                note.className = "pv-truncnote";
                note.textContent = tpl("docs_trunc_note", "文件较大，仅显示前 {n} MB，完整内容请下载查看。", { n: TEXT_MAX_CHARS / 1024 / 1024 });
                body.appendChild(note);
            }
        }).catch(function () {
            if (token !== state.seq) return;
            pre.textContent = "";
            body.innerHTML = "";
            body.className = "pv-body mode-fallback";
            buildErrorView(body, urlOf(fullPath), t("docs_text_fail", "文本内容加载失败"));
        });
    }

    function buildMarkdownView(node, fullPath, body, token) {
        var box = document.createElement("div");
        box.className = "pv-md";
        box.textContent = t("docs_loading_text", "加载中…");
        body.appendChild(box);
        fetch(urlOf(fullPath)).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
        }).then(function (text) {
            if (token !== state.seq) return;
            ensureMarked().then(function () {
                if (token !== state.seq) return;
                try { box.innerHTML = window.marked.parse(text); }
                catch (err) { showRaw(box, text); }
            }).catch(function () {
                if (token !== state.seq) return;
                showRaw(box, text);
            });
        }).catch(function () {
            if (token !== state.seq) return;
            body.innerHTML = "";
            body.className = "pv-body mode-fallback";
            buildErrorView(body, urlOf(fullPath), t("docs_md_fail", "Markdown 加载失败"));
        });
        function showRaw(el, text) {
            el.innerHTML = "";
            var pre = document.createElement("pre");
            pre.className = "pv-pre" + (state.pvWrap ? " wrap" : "");
            pre.textContent = text;
            el.appendChild(pre);
            el.classList.add("raw");
        }
    }

    // marked 按需懒加载（与全站其他页面同一 CDN + SRI）
    var markedPromise = null;
    function ensureMarked() {
        if (window.marked) return Promise.resolve();
        if (!markedPromise) {
            markedPromise = new Promise(function (resolve, reject) {
                var s = document.createElement("script");
                s.src = "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js";
                s.integrity = "sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi";
                s.crossOrigin = "anonymous";
                s.onload = function () { resolve(); };
                s.onerror = function () { markedPromise = null; reject(new Error("marked load failed")); };
                document.head.appendChild(s);
            });
        }
        return markedPromise;
    }

    function buildFallbackView(node, body) {
        var t2 = typeOf(node), meta = TYPE_META[t2];
        var box = document.createElement("div");
        box.className = "pv-fallback";
        box.innerHTML =
            '<i class="' + meta.icon + '"></i>' +
            '<div class="pv-fb-name"></div>' +
            '<div class="pv-fb-meta">' + escapeHtml(typeLabel(t2)) + " · " + formatSize(node.sz) + "</div>" +
            "<p>" + escapeHtml(t("docs_unsupported", "该格式暂不支持网页内预览")) + "</p>" +
            '<div class="pv-fb-btns">' +
            '<a class="fm-btn primary" href="' + escapeHtml(urlOf(node._p)) + '" download="' + escapeHtml(node.n) + '"><i class="fa-solid fa-download"></i> ' + escapeHtml(t("docs_download_file", "下载文件")) + "</a>" +
            '<a class="fm-btn" href="' + escapeHtml(urlOf(node._p)) + '" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> ' + escapeHtml(t("docs_open_new", "新窗口打开")) + "</a>" +
            "</div>";
        box.querySelector(".pv-fb-name").textContent = node.n;
        body.appendChild(box);
    }

    function buildErrorView(body, url, msg) {
        var box = document.createElement("div");
        box.className = "pv-fallback";
        box.innerHTML =
            '<i class="fa-solid fa-circle-exclamation"></i>' +
            "<p>" + escapeHtml(msg) + "</p>" +
            '<div class="pv-fb-btns">' +
            '<a class="fm-btn primary" href="' + escapeHtml(url) + '" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> ' + escapeHtml(t("docs_open_new", "新窗口打开")) + "</a>" +
            "</div>";
        body.appendChild(box);
    }

    /* ---------- 轻量代码高亮（单趟正则，输入已转义 & < >） ---------- */

    var CODE_KEYWORDS = "const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|typeof|instanceof|import|export|from|async|await|try|catch|finally|throw|def|lambda|self|None|True|False|null|undefined|true|false";

    function highlightCode(escaped, ext) {
        var re = new RegExp(
            '("(?:[^"\\\\\\n]|\\\\[\\s\\S])*"|\'(?:[^\'\\\\\\n]|\\\\[\\s\\S])*\'|`(?:[^`\\\\]|\\\\[\\s\\S])*`)' + // 字符串
            "|(//[^\\n]*|/\\*[\\s\\S]*?\\*/|#[^\\n]*" + (ext === "html" || ext === "htm" || ext === "xml" ? "|<!--[\\s\\S]*?-->" : "") + ")" + // 注释
            "|\\b(0x[0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b" + // 数字
            "|\\b(" + CODE_KEYWORDS + ")\\b", // 关键字
            "g");
        return escaped.replace(re, function (m, str, com, num, kw) {
            if (str) return '<span class="tok-str">' + str + "</span>";
            if (com) return '<span class="tok-com">' + com + "</span>";
            if (num) return '<span class="tok-num">' + num + "</span>";
            if (kw) return '<span class="tok-kw">' + kw + "</span>";
            return m;
        });
    }

    /* ---------- 事件绑定 ---------- */

    function bindEvents() {
        // 列表点击（网格 + 列表共用容器）
        var listing = $("fmListing");
        listing.addEventListener("click", function (e) {
            var fileEl = e.target.closest("[data-file-idx]");
            if (fileEl) { openPreview(parseInt(fileEl.getAttribute("data-file-idx"), 10)); return; }
            var dirEl = e.target.closest("[data-path]");
            if (dirEl) navigateTo(dirEl.getAttribute("data-path"));
        });
        listing.addEventListener("keydown", function (e) {
            if (e.key !== "Enter" && e.key !== " ") return;
            var el = e.target.closest("[data-file-idx],[data-path]");
            if (!el) return;
            e.preventDefault();
            if (el.hasAttribute("data-file-idx")) openPreview(parseInt(el.getAttribute("data-file-idx"), 10));
            else navigateTo(el.getAttribute("data-path"));
        });

        // 缩略图加载失败 → 退回图标（捕获阶段才能收到 img error）
        listing.addEventListener("error", function (e) {
            var img = e.target;
            if (!img || img.tagName !== "IMG") return;
            var thumb = img.closest(".fm-thumb");
            if (thumb) {
                img.remove();
                thumb.classList.add("thumb-broken");
                thumb.innerHTML = '<i class="fa-solid fa-image"></i><span class="fm-ext">?</span>';
            }
        }, true);

        // 面包屑 / 类型筛选
        $("fmCrumbs").addEventListener("click", function (e) {
            var crumb = e.target.closest("[data-path]");
            if (crumb) navigateTo(crumb.getAttribute("data-path"));
        });
        $("fmChips").addEventListener("click", function (e) {
            var chip = e.target.closest("[data-chip]");
            if (!chip || chip.disabled) return;
            state.chip = chip.getAttribute("data-chip");
            renderChips();
            renderListing();
        });

        // 搜索
        $("fmSearch").addEventListener("input", function () {
            state.q = this.value.trim();
            renderListing();
        });

        // 视图切换
        $("viewToggle").addEventListener("click", function () {
            state.view = state.view === "grid" ? "list" : "grid";
            try { localStorage.setItem("wfls-docs-view", state.view); } catch (err) { /* 忽略 */ }
            updateViewToggle();
            renderListing();
        });

        // 刷新（重新拉 manifest，绕过缓存）
        $("refreshBtn").addEventListener("click", function () {
            var icon = this.querySelector("i");
            if (icon) icon.classList.add("spinning");
            loadManifest(true, function () {
                if (icon) icon.classList.remove("spinning");
            });
        });

        // 预览模态
        $("pvOverlay").addEventListener("click", function (e) {
            if (e.target === this) closePreview();
        });
        $("pvClose").addEventListener("click", function () { closePreview(); });
        $("pvPrev").addEventListener("click", function () { goPreview(-1); });
        $("pvNext").addEventListener("click", function () { goPreview(1); });
        $("pvSourceBtn").addEventListener("click", function () {
            state.pvSource = !state.pvSource;
            renderPreview();
        });
        $("pvWrapBtn").addEventListener("click", function () {
            state.pvWrap = !state.pvWrap;
            renderPreview();
        });
        $("pvZoomBtn").addEventListener("click", function () { resetZoomFn(); });

        // 全局键盘
        document.addEventListener("keydown", function (e) {
            if (state.preview) {
                if (e.key === "Escape") { e.preventDefault(); closePreview(); }
                else if (e.key === "ArrowLeft") { e.preventDefault(); goPreview(-1); }
                else if (e.key === "ArrowRight") { e.preventDefault(); goPreview(1); }
            }
        });

        window.addEventListener("hashchange", applyRoute);
    }

    function updateViewToggle() {
        $("viewToggle").innerHTML = state.view === "grid"
            ? '<i class="fa-solid fa-list"></i>'
            : '<i class="fa-solid fa-grip"></i>';
        $("viewToggle").title = state.view === "grid"
            ? t("docs_view_list", "切换为列表视图")
            : t("docs_view_grid", "切换为网格视图");
    }

    /* ---------- 加载 / 错误态 ---------- */

    function setLoading(on) {
        $("fmLoading").hidden = !on;
        if (on) {
            $("fmError").hidden = true;
            $("fmListing").hidden = true;
        } else {
            $("fmListing").hidden = false;
        }
    }

    function setError() {
        $("fmLoading").hidden = true;
        $("fmListing").hidden = true;
        var err = $("fmError");
        err.innerHTML =
            '<i class="fa-solid fa-triangle-exclamation"></i>' +
            "<p>" + escapeHtml(t("docs_err_title", "未能加载 Assets/manifest.json")) + "</p>" +
            '<p class="fm-err-hint">' + escapeHtml(t("docs_err_hint", "该文件在部署时由 deploy 工作流自动生成；本地开发请先运行：")) + '<code>python tools/gen_assets_manifest.py</code></p>' +
            '<button type="button" class="fm-btn primary" id="fmRetry"><i class="fa-solid fa-rotate-right"></i> ' + escapeHtml(t("docs_retry", "重试")) + "</button>";
        err.hidden = false;
        $("fmRetry").addEventListener("click", function () { loadManifest(false); });
    }

    function loadManifest(bust, done) {
        setLoading(true);
        var url = "Assets/manifest.json" + (bust ? "?t=" + Date.now() : "");
        fetch(url, { cache: "no-cache" }).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        }).then(function (m) {
            state.manifest = m;
            buildIndex();
            setLoading(false);
            applyRoute();
            if (done) done();
        }).catch(function () {
            setError();
            if (done) done();
        });
    }

    /* ---------- i18n 重刷（common.js setLanguage 回调 + 初始化时兜底） ---------- */

    function reapplyI18n() {
        var input = $("fmSearch");
        if (input) {
            input.placeholder = t("docs_search_ph", "在当前目录筛选…");
            input.setAttribute("aria-label", t("docs_search_ph", "在当前目录筛选…"));
        }
        var crumbs = $("fmCrumbs");
        if (crumbs) crumbs.setAttribute("aria-label", t("docs_crumb_aria", "目录路径"));
        var chips = $("fmChips");
        if (chips) chips.setAttribute("aria-label", t("docs_filter_aria", "按类型筛选"));
        var dialog = $("pvDialog");
        if (dialog) dialog.setAttribute("aria-label", t("docs_pv_dialog", "文件预览"));
        var loadingP = document.querySelector("#fmLoading p");
        if (loadingP) loadingP.textContent = t("docs_loading", "正在扫描 Assets 目录…");
        updateViewToggle();
        if (state.manifest) renderCurrent();
        if (state.preview) renderPreview();
        var err = $("fmError");
        if (err && !err.hidden) setError();
    }
    window.docsBrowserReapplyI18n = reapplyI18n;

    /* ---------- 启动 ---------- */

    function init() {
        updateViewToggle();
        bindEvents();
        // common.js 的 setLanguage 在 docs-browser.js 加载前已执行过一次，
        // 这里补一次同步，保证 en 用户的 placeholder / 动态文案就位
        reapplyI18n();
        loadManifest(false);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
