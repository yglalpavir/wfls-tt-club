# -*- coding: utf-8 -*-
"""第三轮：验证 paTypeLabel WTT 词典修复 + hover 探针（修正版，直接用 chart.tooltip.getActiveElements 之外还检查 opacity）"""
import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8799"
OUT = r"S:\wfls-tt-club\wfls-tt-club\.playwright-mcp"

def note(msg):
    print(msg, flush=True)

def gap_hover_check(page, tag):
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
        page.mouse.move(px, py, steps=5)
        page.wait_for_timeout(320)
        st = page.evaluate("""(mi) => {
            const c = Chart.getChart(document.getElementById('paGapChart'));
            const tp = c.tooltip;
            const act = c.getActiveElements();
            return {
                nAct: act.length,
                actIdx: act.length ? act[0].index : -1,
                dataIdx: (tp && tp.dataPoints && tp.dataPoints.length) ? tp.dataPoints[0].dataIndex : -1,
                title: (tp && tp.title && tp.title.length) ? tp.title[0] : '',
                opacity: tp ? tp.opacity : 0
            };
        }""", r["i"])
        ok = st["nAct"] > 0 and st["actIdx"] == r["i"] and st["dataIdx"] == r["i"] and st["opacity"] > 0
        if ok:
            note("  %s row %d OK (tooltip opacity %.2f, title=%r)" % (tag, r["i"], st["opacity"], st["title"]))
        else:
            note("  %s row %d BAD: %s" % (tag, r["i"], json.dumps(st, ensure_ascii=False)))
            bad += 1
    return bad

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)

    # ---------- A. club hover（Chart.js 内部状态判定） ----------
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/player.html?uid=10000", wait_until="domcontentloaded")
    page.wait_for_selector("#playerAnalyticsBody canvas", timeout=25000)
    page.wait_for_timeout(600)
    note("[A] club gap hover (via chart state):")
    badA = gap_hover_check(page, "club")
    note("[A] mismatches: %d" % badA)
    page.close()

    # ---------- B. WTT EN 复验 ----------
    ctx2 = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
    page2 = ctx2.new_page()
    page2.add_init_script("try { localStorage.setItem('wfls-lang.v1', 'en'); } catch(e) {}")
    page2.goto(BASE + "/wtt_player.html?cat=ms&player=WANG%20Chuqin", wait_until="domcontentloaded")
    page2.wait_for_selector("#playerAnalyticsBody canvas", timeout=45000)
    page2.wait_for_timeout(900)
    residue = page2.evaluate("""() => {
        const body = document.getElementById('playerAnalyticsBody');
        const txt = body.innerText || '';
        const m = txt.match(/[\\u4e00-\\u9fff]+/g);
        return m ? Array.from(new Set(m)).slice(0, 20) : [];
    }""")
    note("[B] wtt EN residue after fix: %s" % json.dumps(residue, ensure_ascii=False))
    # tooltip 里的类型名也验证（环形图 tooltip 是 canvas 绘制，检查 Chart.js 回调输出）
    tip_label = page2.evaluate("""() => {
        const c = Chart.getChart(document.getElementById('paTypeChart'));
        // 触发第一个扇区的 tooltip 回调
        const meta = c.getDatasetMeta(0);
        if (!meta.data.length) return null;
        const el = meta.data[0];
        const dp = { dataIndex: 0, datasetIndex: 0, element: el, raw: c.data.datasets[0].data[0] };
        const label = c.options.plugins.tooltip.callbacks.label(dp);
        const title = c.options.plugins.tooltip.callbacks.title([dp]);
        const after = c.options.plugins.tooltip.callbacks.afterLabel ? c.options.plugins.tooltip.callbacks.afterLabel([dp]) : '';
        return { title, label, after };
    }""")
    note("[B] type tooltip callbacks: %s" % json.dumps(tip_label, ensure_ascii=False))
    page2.screenshot(path=OUT + "\\vc-wtt-en-top.png", clip={"x": 0, "y": 0, "width": 1280, "height": 900})
    # WTT hover
    note("[B] wtt gap hover:")
    badB = gap_hover_check(page2, "wtt")
    note("[B] wtt mismatches: %d" % badB)
    page2.close()
    ctx2.close()
    browser.close()

print("\n=== ROUND3 COMPLETE ===")
