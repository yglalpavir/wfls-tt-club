# -*- coding: utf-8 -*-
"""player.html / wtt_player.html 图表 UI 验证脚本（上次会话接续）
验证项：
1. club player.html 图表渲染（light/zh）
2. 实力差图表 hover 定位修复（axis:'y'）
3. WTT 页 + 暗色主题重画 + EN 模式
"""
import json, sys, time, io
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8799"
OUT = r"S:\wfls-tt-club\wfls-tt-club\.playwright-mcp"

results = []
def note(msg):
    print(msg, flush=True)
    results.append(msg)

def wait_analytics(page, timeout=25000):
    """等待 #playerAnalyticsBody 渲染出图表 canvas"""
    page.wait_for_selector("#playerAnalyticsBody canvas", timeout=timeout)

def hover_gap_row(page, label_substr):
    """在实力差图表上 hover 指定行的 y 位置，返回 tooltip 内容与鼠标位置"""
    box = page.locator("#paGapChart").bounding_box()
    assert box, "paGapChart canvas not found"
    # 取图表中间高度扫一行：找到目标行 label 的 y 坐标 —— 通过 y 轴 tick 文本位置近似
    # 更直接：用 Chart.js 的 meta 拿每行中心 y
    info = page.evaluate("""(yFrac) => {
        const c = Chart.getChart(document.getElementById('paGapChart'));
        if (!c) return null;
        const meta = c.getDatasetMeta(0);
        const rows = meta.data.map((el, i) => ({ i, y: el.y, x: el.x }));
        return { area: c.chartArea, rows };
    }""", 0)
    rows = info["rows"]
    # 找「对手强 >=100」行（数据里 wins 应为 14）
    target = None
    for r in rows:
        # 通过 tooltip 验证：hover 该行中点
        target = r
        break
    py = box["y"] + target["y"]
    px = box["x"] + (info["area"]["left"] + info["area"]["right"]) / 2
    page.mouse.move(px, py, steps=4)
    page.wait_for_timeout(400)
    tip = page.evaluate("""() => {
        const t = document.querySelector('.chartjs-tooltip');
        if (!t || t.style.opacity === '0' || !t.offsetParent && getComputedStyle(t).opacity === '0') return null;
        return { text: t.innerText, top: t.style.top, left: t.style.left };
    }""")
    return {"rowY": target["y"], "mouseY": target["y"], "tooltip": tip}

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)

    # ---------- 1. club player.html (light/zh) ----------
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "/player.html?uid=10000", wait_until="domcontentloaded")
    try:
        wait_analytics(page)
        note("[1] club player.html: analytics rendered OK")
    except Exception as e:
        note("[1] FAIL: analytics not rendered: %s" % e)
    page.wait_for_timeout(800)

    # 图表实例存在性
    charts = page.evaluate("""() => {
        const ids = ['paRankChart','paTypeChart','paGapChart','paMonthlyChart','paFormChart'];
        const out = {};
        for (const id of ids) { const el = document.getElementById(id); out[id] = el ? !!Chart.getChart(el) : false; }
        return out;
    }""")
    note("[1] chart instances: %s" % json.dumps(charts))

    # 图表高度检查（图例撑爆卡片的回归检测）
    heights = page.evaluate("""() => {
        const out = {};
        for (const id of ['paTypeChart','paGapChart']) {
            const card = document.getElementById(id).closest('.pa-card');
            out[id] = { cardH: Math.round(card.getBoundingClientRect().height) };
        }
        return out;
    }""")
    note("[1] card heights: %s" % json.dumps(heights))
    page.screenshot(path=OUT + "\\va-club-light-top.png", clip={"x": 0, "y": 0, "width": 1280, "height": 900})

    # ---------- 2. 实力差 hover 定位 ----------
    page.evaluate("document.getElementById('paGapChart').scrollIntoView({block:'center'})")
    page.wait_for_timeout(300)
    # 依次 hover 每一行（用 Chart.js meta 的 y 坐标），验证 tooltip 行内容与鼠标所在行一致
    rows_check = page.evaluate("""() => {
        const c = Chart.getChart(document.getElementById('paGapChart'));
        const meta0 = c.getDatasetMeta(0);
        return meta0.data.map((el, i) => ({ i, y: el.y }));
    }""")
    mismatch = 0
    for r in rows_check:
        box = page.locator("#paGapChart").bounding_box()
        px = box["x"] + 200  # 图表区左侧 1/3 处，条形区域内
        py = box["y"] + r["y"]
        page.mouse.move(px, py, steps=3)
        page.wait_for_timeout(260)
        got = page.evaluate("""() => {
            const t = document.querySelector('.chartjs-tooltip');
            if (!t) return null;
            const op = getComputedStyle(t).opacity;
            if (op === '0') return null;
            return t.innerText;
        }""")
        # 期望：tooltip 第一行（title）为该行的 label；从 Chart.js 反查
        expect_title = page.evaluate("""(idx) => {
            const c = Chart.getChart(document.getElementById('paGapChart'));
            // 标签顺序 = ordered 数组 = 渲染时的 labels
            const ticks = c.scales.y.ticks;
            return ticks[idx] ? ticks[idx].label : null;
        }""", r["i"])
        if got is None:
            note("[2] row %d (%s): NO tooltip" % (r["i"], expect_title))
            mismatch += 1
        else:
            first_line = got.strip().splitlines()[0] if got.strip() else ""
            ok = expect_title and first_line and (expect_title in first_line or first_line in expect_title)
            note("[2] row %d: hover->title '%s' expected '%s' %s" % (r["i"], first_line, expect_title, "OK" if ok else "MISMATCH"))
            if not ok: mismatch += 1
    note("[2] gap hover mismatches: %d" % mismatch)
    # 留一张 hover 状态截图
    box = page.locator("#paGapChart").bounding_box()
    if rows_check:
        page.mouse.move(box["x"] + 200, box["y"] + rows_check[len(rows_check)//2]["y"], steps=3)
        page.wait_for_timeout(300)
    page.screenshot(path=OUT + "\\va-club-gap-hover.png")

    # ---------- 3. club 暗色主题（重画机制） ----------
    page.evaluate("document.getElementById('themeToggle').click()")
    page.wait_for_timeout(900)
    dark = page.evaluate("document.documentElement.classList.contains('dark-mode')")
    note("[3] dark toggled: %s" % dark)
    # 验证图表确实重画了（网格颜色变化是证据）：取 rank 图的 borderColor
    rank_color = page.evaluate("""() => {
        const c = Chart.getChart(document.getElementById('paRankChart'));
        const d = c.data.datasets[0];
        return { border: d.borderColor, gridY: c.options.scales.y.grid.color };
    }""")
    note("[3] rank chart colors after dark: %s" % json.dumps(rank_color))
    page.screenshot(path=OUT + "\\va-club-dark.png")

    # ---------- 4. EN 模式 ----------
    page.evaluate("document.getElementById('langToggle').click()")
    page.wait_for_timeout(1200)
    texts = page.evaluate("""() => {
        const t = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
        return {
            rank: t('#playerAnalyticsBody .pa-card:nth-of-type(1) .personal-card-header'),
            gapHint: t('.pa-card-hint'),
        };
    }""")
    note("[4] EN texts: %s" % json.dumps(texts))
    # 中文残留检测（深度数据分析区内）
    residue = page.evaluate("""() => {
        const body = document.getElementById('playerAnalyticsBody');
        if (!body) return [];
        const txt = body.innerText || '';
        const m = txt.match(/[\\u4e00-\\u9fff]+/g);
        return m ? Array.from(new Set(m)).slice(0, 12) : [];
    }""")
    note("[4] EN mode Chinese residue in analytics: %s" % json.dumps(residue, ensure_ascii=False))
    page.screenshot(path=OUT + "\\va-club-en.png")

    note("[*] console errors: %s" % json.dumps([e for e in errors if 'favicon' not in e][:8], ensure_ascii=False))
    page.close()

    # ---------- 5. WTT player 页（light/zh） ----------
    page2 = ctx.new_page()
    errors2 = []
    page2.on("console", lambda m: errors2.append(m.text) if m.type == "error" else None)
    page2.on("pageerror", lambda e: errors2.append(str(e)))
    page2.goto(BASE + "/wtt_player.html?cat=ms&uid=wangchuqin", wait_until="domcontentloaded")
    try:
        page2.wait_for_selector("#playerAnalyticsBody canvas", timeout=30000)
        note("[5] wtt_player.html: analytics rendered OK")
    except Exception as e:
        note("[5] FAIL: %s" % e)
    page2.wait_for_timeout(800)
    wtt_states = page2.evaluate("""() => {
        const ids = ['paRankChart','paTypeChart','paGapChart','paMonthlyChart','paFormChart'];
        const out = {};
        for (const id of ids) { const el = document.getElementById(id); out[id] = el ? !!Chart.getChart(el) : false; }
        const legend = document.querySelector('.pa-type-legend');
        return { charts: out, legendMany: legend ? legend.className.includes('many') : null,
                 legendItems: legend ? legend.children.length : 0 };
    }""")
    note("[5] wtt charts: %s" % json.dumps(wtt_states))
    page2.screenshot(path=OUT + "\\va-wtt-light.png", clip={"x": 0, "y": 0, "width": 1280, "height": 900})

    note("[*] wtt console errors: %s" % json.dumps([e for e in errors2 if 'favicon' not in e][:8], ensure_ascii=False))
    page2.close()
    browser.close()

print("\n=== VERIFICATION COMPLETE ===")
