# -*- coding: utf-8 -*-
"""第五轮：真实鼠标逐行悬停实力差图表，每行截图（决定性视觉验证）
另附 rAF 等待后的状态探针作参考。
"""
import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8799"
OUT = r"S:\wfls-tt-club\wfls-tt-club\.playwright-mcp"

def note(msg):
    print(msg, flush=True)

def row_hover_shots(page, tag):
    page.evaluate("document.getElementById('paGapChart').scrollIntoView({block:'center'})")
    page.wait_for_timeout(500)
    card_box = page.evaluate("""() => {
        const el = document.getElementById('paGapChart').closest('.pa-card');
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }""")
    rows = page.evaluate("""() => {
        const c = Chart.getChart(document.getElementById('paGapChart'));
        return c.getDatasetMeta(0).data.map((el, i) => ({ i, y: el.y }));
    }""")
    box = page.locator("#paGapChart").bounding_box()
    for r in rows:
        px = box["x"] + box["width"] * 0.45
        py = box["y"] + r["y"]
        page.mouse.move(px + 3, py + 2, steps=6)
        page.wait_for_timeout(420)
        page.screenshot(path="%s\\vd-%s-row%d.png" % (OUT, tag, r["i"]),
                        clip={"x": card_box["x"], "y": card_box["y"],
                              "width": card_box["width"], "height": card_box["height"]})
        # rAF 后状态探针（参考）
        st = page.evaluate("""() => new Promise(res => {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const c = Chart.getChart(document.getElementById('paGapChart'));
                const tp = c.tooltip;
                const act = c.getActiveElements();
                res({ nAct: act.length, idx: act.length ? act[0].index : -1,
                      op: tp.opacity, title: tp.title && tp.title[0] });
            }));
        })""")
        note("  %s row %d: probe=%s" % (tag, r["i"], json.dumps(st, ensure_ascii=False)))

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)

    # club
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/player.html?uid=10000", wait_until="domcontentloaded")
    page.wait_for_selector("#playerAnalyticsBody canvas", timeout=25000)
    page.wait_for_timeout(600)
    note("[club] row hover shots:")
    row_hover_shots(page, "club")
    note("[club] pageerrors: %s" % json.dumps(errs[:4], ensure_ascii=False))
    page.close()

    # WTT（zh）
    page2 = ctx.new_page()
    page2.goto(BASE + "/wtt_player.html?cat=ms&player=WANG%20Chuqin", wait_until="domcontentloaded")
    page2.wait_for_selector("#playerAnalyticsBody canvas", timeout=45000)
    page2.wait_for_timeout(900)
    note("[wtt] row hover shots (rows are 6 too):")
    row_hover_shots(page2, "wtt")
    page2.close()
    browser.close()

print("\n=== ROUND5 COMPLETE ===")
