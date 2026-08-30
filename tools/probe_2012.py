# -*- coding: utf-8 -*-
"""冷却结束后的小型探测：
1. 事件列表按年份筛选（vw_tournaments___yr[value][]=2012）是否生效 → 拿到 2012 目标赛事 ID
2. event-matches 是否支持高 limit（limit68=1000），从而每赛事一次请求
用法：ITTF_USER=.. ITTF_PASS=.. python tools/probe_2012.py
"""
import os
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ittf_client import IttfClient, BASE

sys.stdout.reconfigure(encoding="utf-8")


def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def rows_by_id(soup, prefix):
    pat = re.compile(r"^%s_row_\d+$" % re.escape(prefix))
    return [[norm(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
            for tr in soup.find_all("tr", id=pat)]


def footer(soup):
    nav = soup.select_one(".fabrikNav")
    return norm(nav.get_text(" ", strip=True)) if nav else ""


c = IttfClient(verbose=False, pause=3.0)
if os.environ.get("ITTF_COOKIE"):
    c.login_with_cookie(os.environ["ITTF_COOKIE"])
if not c.is_logged_in():
    c.login()
print("logged_in:", c.is_logged_in())

# ---- 1) 年份筛选 ----
u = "/index.php/events/list/27?resetfilters=1&vw_tournaments___yr[value][]=2012&limit27=100&limitstart27=0"
r = c.get(u, wait=True)
soup = BeautifulSoup(r.text or "", "lxml")
rows = rows_by_id(soup, "list_27_com_fabrik_27")
print("\n2012 赛事行数:", len(rows), "| footer:", footer(soup))
for row in rows[:40]:
    if len(row) >= 8:
        print("  id=%s | %-48s | type=%s | kind=%s | matches=%s | %s~%s"
              % (row[0], row[2][:48], row[3], row[4], row[5], row[6], row[7]))

# ---- 2) 样例赛事高 limit ----
if rows:
    eid = rows[0][0]
    for lim in ("1000", "500", "200"):
        u2 = ("/index.php/event-matches/list/68?resetfilters=1&abc=%s"
              "&vw_matches___tournament_id_raw[value][]=%s&limit68=%s&limitstart68=0" % (eid, eid, lim))
        r2 = c.get(u2, wait=True)
        soup2 = BeautifulSoup(r2.text or "", "lxml")
        rws = rows_by_id(soup2, "list_68_com_fabrik_68")
        fb = footer(soup2)
        print("\n>>> limit68=%s -> 行=%d | %s" % (lim, len(rws), fb[:90]))
        if rws:
            print("    样例:", rws[0][:8])
        if len(rws) >= int(lim):
            print("    保持完全页，继续提高")
        else:
            print("    非完全页，当前 limit 有效")
            break

print("\nDONE")