# -*- coding: utf-8 -*-
"""第二轮验证：修正 WTT URL 与 tooltip 检测方式"""
import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8799"
OUT = r"S:\wfls-tt-club\wfls-tt-club\.playwright-mcp"

def note(msg):
    print(msg, flush=True)

JS_CHARTS = """() => {
    const ids = ['paRankChart','paTypeChart','paGapChart','paMonthlyChart','paFormChart'];
    const out = {};
    for (const id of ids) { const el = document.getElementById(id); out[id] = el ? !!Chart.getChart(el) : false; }
    return out;
}"""

def gap_hover_check(page):
    """hover 实力差图表每一行，验证 tooltip 的 dataIndex 与鼠标行一致（用 Chart.js 内部状态）"""
    page.evaluate("document.getElementById('paGapChart').scrollIntoView({block:'center'})")
    page.wait_for_timeout(400)
    rows = page.evaluate("""() => {
        const c = Chart.getChart(document.getElementById('paGapChart'));
        return c.getDatasetMeta(0).data.map((el, i) => ({ i, y: el.y }));
    }""")
    box = page.locator("#paGapChart").bounding_box()
    bad = 0
    for r in rows:
        px = box["x"] + (box["width"] * 0.45)
        py = box["y"] + r["y"]
        page.mouse.move(px, py, steps=4)
        page.wait_for_timeout(300)
        st = page.evaluate("""(mi) => {
            const c = Chart.getChart(document.getElementById('paGapChart'));
            const tp = c.tooltip;
            const act = c.getActiveElements();
            if (!tp || !tp.dataPoints || !tp.dataPoints.length) return { none: true };
            return {
                dataIndex: tp.dataPoints[0].dataIndex,
                title: tp.title ? tp.title[0] : '',
                body: tp.body ? tp.body.map(b => b.lines.join(' ')).join(' | ') : ''
            };
        }""", r["i"])
        if st.get("none"):
            note("  row %d: NO tooltip" % r["i"]); bad += 1
        elif st["dataIndex"] != r["i"]:
            note("  row %d: MISMATCH tooltip.dataIndex=%d title=%r" % (r["i"], st["dataIndex"], st["title"])); bad += 1
        else:
            note("  row %d OK: %r | %r" % (r["i"], st["title"], st["body"]))
    return bad

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)

    # ---------- A. club 实力差 hover（补测，用内部状态） ----------
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/player.html?uid=10000", wait_until="domcontentloaded")
    page.wait_for_selector("#playerAnalyticsBody canvas", timeout=25000)
    page.wait_for_timeout(600)
    note("[A] club gap hover:")
    bad = gap_hover_check(page)
    note("[A] mismatches: %d" % bad)
    # hover 中间行截图
    box = page.locator("#paGapChart").bounding_box()
    rows = page.evaluate("""() => Chart.getChart(document.getElementById('paGapChart')).getDatasetMeta(0).data.map(el => el.y)""")
    page.mouse.move(box["x"] + box["width"]*0.45, box["y"] + rows[2], steps=4)
    page.wait_for_timeout(300)
    page.screenshot(path=OUT + "\\vb-club-gap-hover.png")
    note("[A] pageerrors: %s" % json.dumps(errs[:5], ensure_ascii=False))
    page.close()

    # ---------- B. WTT 页（player 参数） ----------
    page2 = ctx.new_page()
    errs2 = []
    page2.on("pageerror", lambda e: errs2.append(str(e)))
    page2.goto(BASE + "/wtt_player.html?cat=ms&player=" + "WANG%20Chuqin", wait_until="domcontentloaded")
    try:
        page2.wait_for_selector("#playerAnalyticsBody canvas", timeout=45000)
        note("[B] wtt_player.html: analytics rendered OK")
    except Exception as e:
        note("[B] FAIL: %s" % e)
    page2.wait_for_timeout(900)
    note("[B] wtt charts: %s" % json.dumps(page2.evaluate(JS_CHARTS)))
    legend_state = page2.evaluate("""() => {
        const l = document.querySelector('.pa-type-legend');
        return l ? { cls: l.className, items: l.children.length } : null;
    }""")
    note("[B] type legend: %s" % json.dumps(legend_state, ensure_ascii=False))
    page2.screenshot(path=OUT + "\\vb-wtt-light-top.png", clip={"x": 0, "y": 0, "width": 1280, "height": 900})
    # WTT gap hover
    note("[B] wtt gap hover:")
    bad2 = gap_hover_check(page2)
    note("[B] wtt mismatches: %d" % bad2)
    # WTT 暗色
    page2.evaluate("document.getElementById('themeToggle').click()")
    page2.wait_for_timeout(900)
    wcolors = page2.evaluate("""() => {
        const c = Chart.getChart(document.getElementById('paGapChart'));
        return { isDarkGrid: c.options.scales.x.grid.color.call ? 'fn' : c.options.scales.x.grid.color,
                 legend: c.options.plugins.legend.labels.color };
    }""")
    note("[B] wtt dark colors: %s" % json.dumps(wcolors))
    page2.evaluate("document.getElementById('paGapChart').scrollIntoView({block:'center'})")
    page2.wait_for_timeout(300)
    page2.screenshot(path=OUT + "\\vb-wtt-dark-gap.png")
    note("[B] wtt pageerrors: %s" % json.dumps(errs2[:5], ensure_ascii=False))
    page2.close()

    # ---------- C. WTT EN 模式（localStorage 预设后新开页） ----------
    ctx2 = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
    page3 = ctx2.new_page()
    page3.add_init_script("try { localStorage.setItem('wfls-lang.v1', 'en'); } catch(e) {}")
    page3.goto(BASE + "/wtt_player.html?cat=ms&player=WANG%20Chuqin", wait_until="domcontentloaded")
    try:
        page3.wait_for_selector("#playerAnalyticsBody canvas", timeout=45000)
        page3.wait_for_timeout(900)
        residue = page3.evaluate("""() => {
            const body = document.getElementById('playerAnalyticsBody');
            const txt = body.innerText || '';
            const m = txt.match(/[\\u4e00-\\u9fff]+/g);
            return m ? Array.from(new Set(m)).slice(0, 15) : [];
        }""")
        note("[C] wtt EN residue: %s" % json.dumps(residue, ensure_ascii=False))
        page3.screenshot(path=OUT + "\\vb-wtt-en-top.png", clip={"x": 0, "y": 0, "width": 1280, "height": 900})
    except Exception as e:
        note("[C] FAIL: %s" % e)
    page3.close()
    ctx2.close()
    browser.close()

print("\n=== ROUND2 COMPLETE ===")
