# -*- coding: utf-8 -*-
"""第四轮：合成事件法逐行验证实力差 hover（同步读取 chart 状态）"""
import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8799"
OUT = r"S:\wfls-tt-club\wfls-tt-club\.playwright-mcp"

def note(msg):
    print(msg, flush=True)

# 在浏览器内一次性完成：对每行 y 派发合成 mousemove，读取 tooltip 状态与期望 title
JS_SYNTH = """(rowsInfo) => {
    const canvas = document.getElementById('paGapChart');
    const c = Chart.getChart(canvas);
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + rect.width * 0.45;
    const out = [];
    for (const r of rowsInfo) {
        const y = rect.top + r.y;
        canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
        const tp = c.tooltip;
        const act = c.getActiveElements();
        const tpAct = tp.getActiveElements();
        const st = {
            rowIdx: r.i,
            nChartAct: act.length, chartActIdx: act.length ? act[0].index : -1,
            nTipAct: tpAct.length, tipActIdx: tpAct.length ? tpAct[0].index : -1,
            nPoints: tp.dataPoints ? tp.dataPoints.length : 0,
            dataIdx: (tp.dataPoints && tp.dataPoints.length) ? tp.dataPoints[0].dataIndex : -1,
            opacity: tp.opacity,
            title: (tp.title && tp.title.length) ? tp.title[0] : ''
        };
        out.push(st);
    }
    // 移出画布，清掉 tooltip
    canvas.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    return out;
}"""

def gap_hover_check(page, tag):
    page.evaluate("document.getElementById('paGapChart').scrollIntoView({block:'center'})")
    page.wait_for_timeout(400)
    rows = page.evaluate("""() => {
        const c = Chart.getChart(document.getElementById('paGapChart'));
        return c.getDatasetMeta(0).data.map((el, i) => ({ i, y: el.y }));
    }""")
    states = page.evaluate(JS_SYNTH, rows)
    bad = 0
    for st in states:
        i = st["rowIdx"]
        ok = st["chartActIdx"] == i and st["dataIdx"] == i and st["opacity"] > 0
        if ok:
            note("  %s row %d OK: title=%r opacity=%.2f" % (tag, i, st["title"], st["opacity"]))
        else:
            note("  %s row %d BAD: %s" % (tag, i, json.dumps(st, ensure_ascii=False)))
            bad += 1
    return bad

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)

    # ---------- A. club ----------
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/player.html?uid=10000", wait_until="domcontentloaded")
    page.wait_for_selector("#playerAnalyticsBody canvas", timeout=25000)
    page.wait_for_timeout(600)
    note("[A] club gap hover (synthetic events):")
    badA = gap_hover_check(page, "club")
    note("[A] mismatches: %d | pageerrors: %s" % (badA, json.dumps(errs[:4], ensure_ascii=False)))
    page.close()

    # ---------- B. WTT（zh） + EN tooltip 回调探针（修正传参） ----------
    ctx2 = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
    page2 = ctx2.new_page()
    page2.goto(BASE + "/wtt_player.html?cat=ms&player=WANG%20Chuqin", wait_until="domcontentloaded")
    page2.wait_for_selector("#playerAnalyticsBody canvas", timeout=45000)
    page2.wait_for_timeout(900)
    note("[B] wtt gap hover (zh):")
    badB = gap_hover_check(page2, "wtt")
    note("[B] wtt mismatches: %d" % badB)

    # EN tooltip 回调（label/afterLabel 接收单个 item；title 接收数组）
    page2.evaluate("document.getElementById('langToggle').click()")
    page2.wait_for_timeout(1200)
    tip_label = page2.evaluate("""() => {
        const c = Chart.getChart(document.getElementById('paTypeChart'));
        const meta = c.getDatasetMeta(0);
        if (!meta.data.length) return null;
        const dp = { dataIndex: 0, datasetIndex: 0, raw: c.data.datasets[0].data[0] };
        const cb = c.options.plugins.tooltip.callbacks;
        return {
            title: cb.title([dp]),
            label: cb.label(dp),
            afterLabel: cb.afterLabel ? cb.afterLabel(dp) : ''
        };
    }""")
    note("[B] wtt EN type tooltip: %s" % json.dumps(tip_label, ensure_ascii=False))
    residue = page2.evaluate("""() => {
        const body = document.getElementById('playerAnalyticsBody');
        const m = (body.innerText || '').match(/[\\u4e00-\\u9fff]+/g);
        return m ? Array.from(new Set(m)).slice(0, 15) : [];
    }""")
    note("[B] wtt EN residue: %s" % json.dumps(residue, ensure_ascii=False))
    page2.close()
    ctx2.close()
    browser.close()

print("\n=== ROUND4 COMPLETE ===")
