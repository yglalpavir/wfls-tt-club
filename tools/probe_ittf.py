# -*- coding: utf-8 -*-
"""登录后一次性探测 results.ittf.link 结构，为抓取脚本定参。

产出 tools/_probe_out/ 下：
  events.html / scheduled.html / eventresults.html  —— 页面原文
  structure.txt                                     —— 关键结构汇总
  lists.json                                        —— 发现的 Fabrik listid 清单

用法：
  ITTF_USER=xx ITTF_PASS=yy python tools/probe_ittf.py
  ITTF_COOKIE='PHPSESSID=...; ...' python tools/probe_ittf.py
  python tools/probe_ittf.py --eventid 3326      # 指定样例事件
"""
import argparse
import base64
import json
import os
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ittf_client import BASE, IttfClient, GATE_MARKER, find_login_gated

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_probe_out")
PAGES = [
    ("events", "/index.php/events"),
    ("events2", "/index.php/events-2"),
    ("players_matches_per_event", "/index.php/matches/players-matches-per-event"),
    ("wtt_running_matches", "/index.php/matches/wtt-running-events-matches"),
]


def fabrik_info(html):
    """提取 Fabrik 列表的关键结构信息。"""
    info = {}
    info["listids"] = sorted(set(re.findall(r"listid=([0-9]+)", html)))
    info["module_lists"] = sorted(set(re.findall(r'id="list_(\d+)_mod_fabrik_list_(\d+)"', html)))
    info["list_tables"] = sorted(set(re.findall(r'id="list_(\d+)[^"]*"', html))[:20])
    info["rowkeys"] = sorted(set(re.findall(r'id="list_\d+_mod_fabrik_list_\d+_row_(\d+)"', html)))[:30]
    info["fields"] = sorted(set(re.findall(r'(?:fab|vw)_[a-zA-Z0-9_]+', html)))
    info["filter_inputs"] = sorted(set(re.findall(r'name="(fab[a-zA-Z0-9_\[\]\.]+)"', html))
                                   + re.findall(r'name="(vw[a-zA-Z0-9_\[\]\.]+)"', html))
    info["form_actions"] = sorted(set(re.findall(r'<form[^>]+action="([^"]+)"', html)))
    info["fabrik_js_urls"] = sorted(set(re.findall(r'[^"\'\s]+com_fabrik[^"\'\s]*\.js[^"\'\s]*', html)))
    info["pagination"] = sorted(set(re.findall(r'(?:limitstart|liststart|limit|start|page)=[0-9]+', html)))
    return info


def soup_tables(html):
    soup = BeautifulSoup(html, "lxml")
    out = []
    for i, t in enumerate(soup.find_all("table")):
        tid = t.get("id")
        rows = t.find_all("tr")
        if not rows:
            continue
        head = [th.get_text(" ", strip=True) for th in rows[0].find_all(["th", "td"])]
        out.append({"idx": i, "id": tid, "nrows": len(rows), "headers": head[:20]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--eventid", default="3326")
    ap.add_argument("--cookie", default=os.environ.get("ITTF_COOKIE"))
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    c = IttfClient(verbose=True)

    logged = False
    if args.cookie:
        logged = c.login_with_cookie(args.cookie)
    if not logged:
        try:
            logged = c.login()
        except SystemExit as e:
            print(str(e))
            return 2
    if not logged:
        print("登录失败：无法访问受保护页面（凭据错误 / Cookie 过期）。")
        return 3

    lines = []
    lists = {}

    targets = list(PAGES)
    targets.append(("scheduled", "/index.php/scheduled-matches?eventid=" + args.eventid))
    targets.append(("eventresults", "/index.php/event-results?eventid=" + args.eventid))

    for name, path in targets:
        try:
            r = c.get(path)
        except Exception as e:
            print("  [ERR] %s: %s" % (name, e))
            continue
        html = r.text or ""
        open(os.path.join(OUT_DIR, name + ".html"), "w", encoding="utf-8").write(html)
        gated = GATE_MARKER in html or "com-users-login" in html
        ci = fabrik_info(html)
        tables = soup_tables(html)
        lists[name] = {
            "url_final": r.url, "status": r.status_code, "len": len(html),
            "gated": gated, "info": ci, "tables": tables,
        }
        lines.append("=" * 78)
        lines.append("%s  %s" % (name, path))
        lines.append("  status=%s final=%s len=%d gated=%s"
                     % (r.status_code, r.url, len(html), gated))
        lines.append("  listids=%s" % ci["listids"])
        lines.append("  module_lists=%s" % ci["module_lists"])
        lines.append("  rowkeys=%s" % (ci["rowkeys"] or "[]"))
        lines.append("  pagination=%s" % (ci["pagination"] or "[]"))
        lines.append("  form_actions=%s" % ci["form_actions"])
        lines.append("  filter_inputs(%d)=%s" % (len(ci["filter_inputs"]),
                                                 ci["filter_inputs"][:60]))
        lines.append("  fields(%d):" % len(ci["fields"]))
        for f in ci["fields"][:120]:
            lines.append("      - " + f)
        for t in tables:
            lines.append("  TABLE[%s] id=%s nrows=%d headers=%s"
                         % (t["idx"], t["id"], t["nrows"], t["headers"]))

    open(os.path.join(OUT_DIR, "structure.txt"), "w", encoding="utf-8").write("\n".join(lines))
    with open(os.path.join(OUT_DIR, "lists.json"), "w", encoding="utf-8") as f:
        json.dump(lists, f, ensure_ascii=False, indent=2)

    print("\n结构报告: tools/_probe_out/structure.txt")
    print("页面原文: tools/_probe_out/*.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
