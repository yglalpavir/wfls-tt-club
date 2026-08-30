# -*- coding: utf-8 -*-
"""抓取 results.ittf.link 2012 年 ITTF 赛事记录（World Tour / Olympic / WTTC / World Cup），按赛事分文件。

输出 docs/result_ittf_link/2012/<赛事名>.txt，格式与 docs/result_ittf_link/2004、2005 原始文件一致。

关键结构（已探明）：
- 赛事列表 list 27：/index.php/events/list/27?resetfilters=1&vw_tournaments___yr[value][]=2012&limit27=100
    列：Event ID, Year, Name, Event Type, Event Kind, Matches, Start Date, End Date
- 单赛事匹配表 list 68：/index.php/event-matches/list/68?resetfilters=1&abc=<id>&vw_matches___tournament_id_raw[value][]=<id>
    HTML 分页：&limit68=100&limitstart68=N
    CSV 导出：&format=csv   （每赛事 1 次请求，优先使用）
    列：Year, Event, Player A, Player B, Player X, Player Y, Sub-event, Stage, Round, Result, Games, Winner, Winner

- 429 限流：读 retry-after，短（<3600s）则等待后重试；长则打印提示并退出码 75（由 --wait 外层等待）。
- 断点续传：已完成的赛事文件跳过。

用法：
  python -u tools/scrape_ittf_2012.py --events-only
  python -u tools/scrape_ittf_2012.py --all --csv   # 优先 CSV 导出
  python -u tools/scrape_ittf_2012.py --all --html  # 强制 HTML 分页
  python -u tools/scrape_ittf_2012.py --all --wait  # 遇超长冷却自动等待后再继续
  python -u tools/scrape_ittf_2012.py --resume --all
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import time

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ittf_client import BASE, IttfClient, GATE_MARKER

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "result_ittf_link", "2012")
WORK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_ittf_2012_work")

YEAR = "2012"
TARGET_TYPES = [
    "ITTF World Tour / Pro Tour",
    "Olympic Games",
    "ITTF WTTC",
    "ITTF World Cup",
]
TABLE_HEADER = ["Year", "Event", "Player A", "Player B", "Player X", "Player Y",
                "Sub-event", "Stage", "Round", "Result", "Games", "Winner", "Winner"]

EXIT_COOLDOWN = 75


def say(msg):
    print(msg, flush=True)


def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def is_gated(html):
    return (not html) or GATE_MARKER in html or "com-users-login" in html


def safe_name(s):
    return re.sub(r'[\\/:*?"<>|]', "_", (s or "")).strip()


def match_types(t):
    if not t:
        return False
    tl = t.strip().lower()
    return any(et.lower() in tl for et in TARGET_TYPES)


# --------------------------------------------------------------- 429 异常

class CooldownError(RuntimeError):
    def __init__(self, wait, desc):
        super().__init__("cooldown %ds %s" % (wait, desc))
        self.wait = wait
        self.desc = desc


# ---------------------------------------------------------------- 客户端封装（带限流）

class Fetch:
    def __init__(self, client: IttfClient, pause: float, auto_wait: bool):
        self.c = client
        self.pause = pause
        self.auto_wait = auto_wait

    def get(self, url_or_path, desc="", timeout=150):
        r = self.c.get(url_or_path, wait=False, allow_redirects=True, timeout=timeout)
        if r.status_code == 429:
            ra = r.headers.get("retry-after")
            try:
                wait = int(ra or 0)
            except (TypeError, ValueError):
                wait = 300
            wait = max(30, min(wait, 86400))
            if wait >= 3600 and not self.auto_wait:
                raise CooldownError(wait, desc)
            m = wait / 60.0
            say("  !! 429 限流，等待 %.1f 分钟 (%s)" % (m, desc or url_or_path))
            time.sleep(wait)
            # 等完重试一次
            r = self.c.get(url_or_path, wait=False, allow_redirects=True, timeout=timeout)
            if r.status_code == 429:
                raise CooldownError(wait, desc)
        if r.status_code != 200:
            # 会话可能失效
            if is_gated(r.text or ""):
                say("  !! 会话失效，重新登录...")
                self.c.login()
                r = self.c.get(url_or_path, wait=False, allow_redirects=True, timeout=timeout)
        if self.pause:
            time.sleep(self.pause)
        return r


# ---------------------------------------------------------------- HTML 行提取

HTML_ROW_RE = None


def rows_by_id(soup, prefix):
    pat = re.compile(r"^%s_row_\d+$" % re.escape(prefix))
    out = []
    for tr in soup.find_all("tr", id=pat):
        cells = [norm(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
        out.append(cells)
    return out


def footer(soup):
    nav = soup.select_one(".fabrikNav")
    return norm(nav.get_text(" ", strip=True)) if nav else ""


# ---------------------------------------------------------------- 赛事列表

def collect_events(f: Fetch):
    """按年份筛选抓取赛事列表。"""
    out, start = [], 0
    while start < 5000:
        u = ("/index.php/events/list/27?resetfilters=1&vw_tournaments___yr[value][]=%s"
             "&limit27=100&limitstart27=%d" % (YEAR, start))
        r = f.get(u, desc="赛事列表 limitstart=%d" % start)
        soup = BeautifulSoup(r.text or "", "lxml")
        rows = rows_by_id(soup, "list_27_com_fabrik_27")
        out.extend(rows)
        if len(rows) < 100:
            break
        start += 100
    return out


# ---------------------------------------------------------------- 单赛事匹配

def collect_matches_html(f: Fetch, eid):
    """HTML 分页抓取（回退方案）。"""
    rows, total, start = [], 0, 0
    seen = set()
    while start < 30000:
        u = ("/index.php/event-matches/list/68?resetfilters=1&abc=%s"
             "&vw_matches___tournament_id_raw[value][]=%s"
             "&limit68=100&limitstart68=%d" % (eid, eid, start))
        r = f.get(u, desc="匹配 HTML liststart=%d (event %s)" % (start, eid))
        soup = BeautifulSoup(r.text or "", "lxml")
        page = rows_by_id(soup, "list_68_com_fabrik_68")
        fb = footer(soup)
        m = re.search(r"Total: (\d+)", fb)
        if m:
            total = int(m.group(1))
        for rw in page:
            key = "\t".join(rw)
            if key not in seen:
                seen.add(key)
                rows.append(rw)
        if total and len(rows) >= total:
            break
        if len(page) < 100:
            break
        start += 100
    # HTML 行最后一个是空 checkbox 列，砍掉保持 13 列
    return [rw[:13] for rw in rows]


def collect_matches_csv(f: Fetch, eid):
    """CSV 导出抓取（1 次请求，优先）。返回 (rows, headers, raw)。"""
    u = ("/index.php/event-matches/list/68?resetfilters=1&abc=%s"
         "&vw_matches___tournament_id_raw[value][]=%s&format=csv" % (eid, eid))
    r = f.get(u, desc="匹配 CSV (event %s)" % eid)
    b = r.text or ""
    # csv 可能是 \t 或 , 分隔；用 csv.reader 兼容
    content = b.lstrip("\ufeff")
    try:
        dialect = csv.Sniffer().sniff(content[:4000], delimiters="\t,;")
    except Exception:
        dialect = csv.excel_tab
    reader = list(csv.reader(io.StringIO(content), dialect=dialect))
    if not reader:
        return [], [], b
    headers = reader[0]
    data = [row for row in reader[1:] if row and any(c.strip() for c in row)]
    return data, headers, b


def _csv_to_rows(data, headers):
    """把 CSV 行规整为 13 列表头顺序。"""
    if not data:
        return []
    # 尝试按头名映射
    hmap = {h.strip().lower(): i for i, h in enumerate(headers)}
    want = [h.lower() for h in TABLE_HEADER]
    idx = [hmap.get(w) for w in want]
    # Player A/B/X/Y 若是两列分开的（A、B、X、Y）则拼成 PlayerA 等；这里站点本身就是 A/B/X/Y 4 列
    if all(i is not None for i in idx):
        out = []
        for row in data:
            cells = [(row[i] if i is not None and i < len(row) else "") for i in idx]
            out.append(cells)
        return out
    # 退化为按位置取前 13 列
    return [row[:13] for row in data]


def collect_matches(f: Fetch, eid, use_csv=True, use_html=True):
    rows, total = [], 0
    if use_csv:
        try:
            data, headers, raw = collect_matches_csv(f, eid)
            rows = _csv_to_rows(data, headers)
            say("    CSV: 头=%s 行=%d" % (headers[:6], len(data)))
            if rows:
                total = len(rows)
                return rows, total
        except Exception as e:
            say("    [CSV失败] %s" % type(e).__name__)
    if use_html:
        rows = collect_matches_html(f, eid)
        total = len(rows)
    return rows, total


# ---------------------------------------------------------------- 写文件（历史格式）

def write_event_file(path, ev, rows):
    n_pages = max(1, (len(rows) + 99) // 100)
    meta = "\t".join([
        ev.get("year", YEAR), ev["name"], ev.get("type", ""), ev.get("kind", ""),
        ev.get("matches", ""), ev.get("start", ""), ev.get("end", ""),
    ])
    lines = [meta, "", "", "\t".join(TABLE_HEADER), "Display #", "", "", "100"]
    if n_pages == 1:
        lines.append("Total: %d" % len(rows))
    else:
        lines.append("Page 1 of %d Total: %d" % (n_pages, len(rows)))
    lines.append("")
    if n_pages > 1:
        lines.append("Start")
        lines.append("Prev")
        lines += [str(i) for i in range(1, n_pages + 1)]
        lines.append("Next")
        lines.append("End")
    for r in rows:
        cells = (r + [""] * len(TABLE_HEADER))[: len(TABLE_HEADER)]
        lines.append("\t".join(cells))
    with open(path, "w", encoding="utf-8", newline="\r\n") as fh:
        fh.write("\r\n".join(lines) + "\r\n")


# ---------------------------------------------------------------- 主流程

def ensure_login(c, cookie):
    if cookie and c.login_with_cookie(cookie):
        say("会话 Cookie 登录成功")
        return True
    c.login()
    say("用户名/密码登录成功")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookie", default=os.environ.get("ITTF_COOKIE"))
    ap.add_argument("--event", help="只抓指定赛事（名称关键字）")
    ap.add_argument("--events-only", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--resume", action="store_true", help="跳过已存在文件")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--pause", type=float, default=3.0)
    ap.add_argument("--csv", action="store_true", help="优先 CSV 导出")
    ap.add_argument("--html", action="store_true", help="强制 HTML 分页")
    ap.add_argument("--wait", action="store_true", help="遇超长冷却(>=1h)自动等待")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    use_csv = not args.html
    use_html = not args.csv or args.html

    os.makedirs(WORK_DIR, exist_ok=True)
    c = IttfClient(verbose=args.debug, pause=min(args.pause, 2.0))
    ensure_login(c, args.cookie)
    f = Fetch(c, args.pause, args.wait)

    say("\n== 拉取 %s 年赛事列表 ==" % YEAR)
    ev_rows = collect_events(f)
    say("命中行数: %d" % len(ev_rows))
    if not ev_rows:
        say("[WARN] 未取到赛事，终止。")
        return 1

    events = []
    for r in ev_rows:
        if len(r) < 8:
            continue
        events.append({"id": r[0], "year": r[1], "name": r[2], "type": r[3],
                       "kind": r[4], "matches": r[5], "start": r[6], "end": r[7]})

    say("2012 出现的赛事类型: %s" % sorted({e["type"] for e in events}))
    target = [e for e in events if match_types(e["type"])]
    say("命中目标赛事 %d 站:" % len(target))
    for e in sorted(target, key=lambda x: x.get("start") or ""):
        say("  [%s] %-52s %s ~ %s  id=%s" % (e["type"], e["name"][:52], e["start"], e["end"], e["id"]))

    with open(os.path.join(WORK_DIR, "events_2012.json"), "w", encoding="utf-8") as fh:
        json.dump(events, fh, ensure_ascii=False, indent=2)
    with open(os.path.join(WORK_DIR, "target_2012.json"), "w", encoding="utf-8") as fh:
        json.dump(target, fh, ensure_ascii=False, indent=2)

    if args.events_only:
        say("（--events-only，未抓匹配）")
        return 0

    todo = target
    if args.event:
        k = args.event.lower()
        todo = [e for e in target if k in e["name"].lower() or e["id"] == args.event]
        if not todo:
            say("[ERR] 未匹配到赛事: %s" % args.event)
            return 2

    os.makedirs(OUT_DIR, exist_ok=True)
    report = {}
    total_rows = 0
    done, errors = 0, 0
    for i, e in enumerate(sorted(todo, key=lambda x: x.get("start") or ""), 1):
        path = os.path.join(OUT_DIR, safe_name(e["name"]) + ".txt")
        if args.resume and os.path.exists(path) and os.path.getsize(path) > 0:
            say("[%d/%d] SKIP（已存在）: %s" % (i, len(todo), e["name"]))
            report[e["name"]] = "skip-existing"
            continue
        say("\n[%d/%d] %s  (id=%s, %s)" % (i, len(todo), e["name"], e["id"], e["type"]))
        try:
            rows, total = collect_matches(f, e["id"], use_csv=use_csv, use_html=use_html)
            if not rows:
                say("    [WARN] 0 行，跳过")
                report[e["name"]] = {"rows": 0}
                continue
            write_event_file(path, e, rows)
            total_rows += len(rows)
            done += 1
            report[e["name"]] = {"rows": len(rows), "file": os.path.basename(path)}
            say("    -> %d 行写入 %s" % (len(rows), os.path.basename(path)))
        except CooldownError as ex:
            say("\n!! 命中超长冷却 %d 秒，已中断。请稍后加 --resume 续跑。" % ex.wait)
            report[e["name"]] = {"cooldown": ex.wait}
            with open(os.path.join(WORK_DIR, "report.json"), "w", encoding="utf-8") as fh:
                json.dump(report, fh, ensure_ascii=False, indent=2)
            return EXIT_COOLDOWN
        except Exception as ex:
            errors += 1
            say("    [ERR] %s: %s" % (type(ex).__name__, ex))
            report[e["name"]] = {"error": "%s: %s" % (type(ex).__name__, ex)}
        time.sleep(0.8)

    say("\n== 完成 ==")
    say("输出目录: %s" % OUT_DIR)
    say("成功 %d 站 / 失败 %d 站 / 总匹配行 %d" % (done, errors, total_rows))
    with open(os.path.join(WORK_DIR, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())