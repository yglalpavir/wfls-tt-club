# -*- coding: utf-8 -*-
"""第六轮（最终）：等滚动停稳后逐行 hover；先证伪 smooth-scroll 干扰，再验证全行匹配"""
import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8799"
OUT = r"S:\wfls-tt-club\wfls-tt-club\.playwright-mcp"

def note(msg):
    print(msg, flush=True)

SCROLL_SETTLE_JS = """() => new Promise(res => {
    let last = window.scrollY, same = 0;
    const tick = () => {
        const y = window.scrollY;
        if (Math.abs(y - last) < 0.5) { same++; if (same >= 6) return res(window.scrollY); }
        else same = 0;
        last = y;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => res(window.scrollY), 3000);
})"""

def row_hover_check(page, tag, shoot=False):
    page.evaluate("document.getElementById('paGapChart').scrollIntoView({block:'center'})")
    page.evaluate(SCROLL_SETTLE_JS)
    page.wait_for_timeout(250)
    rows = page.evaluate("""() => {
        const c = Chart.getChart(document.getElementById('paGapChart'));
        return c.getDatasetMeta(0).data.map((el, i) => ({ i, y: el.y }));
    }""")
    box = page.locator("#paGapChart").bounding_box()  # 滚动停稳后再取
    card_box = page.evaluate("""() => {
        const r = document.getElementById('paGapChart').closest('.pa-card').getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }""")
    bad = 0
    for r in rows:
        px = box["x"] + box["width"] * 0.45
        py = box["y"] + r["y"]
        page.mouse.move(px, py, steps=5)
        page.wait_for_timeout(400)
        st = page.evaluate("""() => {
            const c = Chart.getChart(document.getElementById('paGapChart'));
            const tp = c.tooltip;
            const act = c.getActiveElements();
            return { nAct: act.length, idx: act.length ? act[0].index : -1,
                     op: tp.opacity, title: (tp.title && tp.title.length) ? tp.title[0] : '',
                     body: tp.body ? tp.body.map(b => b.lines.join(' ')).join(' | ') : '' };
        }""")
        ok = st["nAct"] > 0 and st["idx"] == r["i"] and st["op"] > 0
        if shoot:
            page.screenshot(path="%s\\ve-%s-row%d.png" % (OUT, tag, r["i"]),
                            clip={"x": card_box["x"], "y": card_box["y"],
                                  "width": card_box["width"], "height": card_box["height"]})
        if ok:
            note("  %s row %d OK: %r | %r" % (tag, r["i"], st["title"], st["body"]))
        else:
            note("  %s row %d BAD: %s" % (tag, r["i"], json.dumps(st, ensure_ascii=False)))
            bad += 1
    return bad

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2)

    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/player.html?uid=10000", wait_until="domcontentloaded")
    page.wait_for_selector("#playerAnalyticsBody canvas", timeout=25000)
    page.wait_for_timeout(600)
    note("[club] gap hover per-row (scroll settled):")
    badA = row_hover_check(page, "club", shoot=True)
    note("[club] mismatches: %d | pageerrors: %s" % (badA, json.dumps(errs[:4], ensure_ascii=False)))
    page.close()

    page2 = ctx.new_page()
    page2.goto(BASE + "/wtt_player.html?cat=ms&player=WANG%20Chuqin", wait_until="domcontentloaded")
    page2.wait_for_selector("#playerAnalyticsBody canvas", timeout=45000)
    page2.wait_for_timeout(900)
    note("[wtt] gap hover per-row (scroll settled):")
    badB = row_hover_check(page2, "wtt", shoot=False)
    note("[wtt] mismatches: %d" % badB)
    page2.close()
    browser.close()

print("\n=== ROUND6 COMPLETE ===")
