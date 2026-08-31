# -*- coding: utf-8 -*-
"""抓取 results.ittf.link 2012 年 ITTF 赛事记录（World Tour / Olympic / WTTC / World Cup），按赛事分文件。

请求策略（最小化 + 可验证完整性）：
1. 事件列表：1 次 CSV 导出请求（全量，一页取 95 条）。失败回退 HTML。
2. 匹配数据（三档降级）：
   a) 合并 CSV：把 26 个赛事 id 塞进 vw_matches___tournament_id_raw[value][]，format=csv → 1 次请求
   b) 逐赛事 CSV：失败回退 26 次请求
   c) HTML 分页：最后兜底
3. 完整性校验零额外请求：事件列表自带的 Matches 列直接对比写入行数。
4. 429 长冷却（>=3600s）直接退出并保存进度，不循环。

输出 docs/result_ittf_link/2012/<赛事名>.txt，格式与历史 .txt 一致。

用法：
  python -u tools/scrape_ittf_2012.py --events-only
  python -u tools/scrape_ittf_2012.py --all              # 合并优先，自动降级
  python -u tools/scrape_ittf_2012.py --all --per-event  # 跳过合并，直接逐赛事
  python -u tools/scrape_ittf_2012.py --all --html       # 强制 HTML 分页
  python -u tools/scrape_ittf_2012.py --resume --all
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import random
import re
import sys
import time

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ittf_client import BASE, GATE_MARKER, IttfClient

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "result_ittf_link", "2012")
WORK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_ittf_2012_work")

YEAR = "2012"
TARGET_TYPES = ["ITTF World Tour / Pro Tour", "Olympic Games", "ITTF WTTC", "ITTF World Cup"]
TABLE_HEADER = ["Year", "Event", "Player A", "Player B", "Player X", "Player Y",
                "Sub-event", "Stage", "Round", "Result", "Games", "Winner", "Winner"]
EXIT_COOLDOWN = 75

# ---------------------------------------------------------------- 输出

def say(msg):
    print(msg, flush=True)


def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def safe_name(s):
    return re.sub(r'[\\/:*?"<>|]', "_", (s or "")).strip()


def is_gated(html):
    return (not html) or GATE_MARKER in html or "com-users-login" in html


def match_types(t):
    tl = (t or "").strip().lower()
    return any(et.lower() in tl for et in TARGET_TYPES)


# --------------------------------------------------------------- 429 异常

class CooldownError(RuntimeError):
    def __init__(self, wait, desc):
        super().__init__("cooldown %ds %s" % (wait, desc))
        self.wait = wait
        self.desc = desc


# --------------------------------------------------------------- 冷却感知客户端

class Fetch:
    def __init__(self, client: IttfClient, pause: float):
        self.c = client
        self.pause = pause

    def get(self, url_or_path, desc="", timeout=150):
        r = self.c.get(url_or_path, wait=False, allow_redirects=True, timeout=timeout)
        if r.status_code == 429:
            try:
                wait = int(r.headers.get("retry-after") or 0)
            except (TypeError, ValueError):
                wait = 300
            wait = max(30, min(wait, 86400))
            if wait >= 3600:
                raise CooldownError(wait, desc)
            say("  !! 429 限流，等待 %.1f 分钟后重试 1 次 (%s)" % (wait / 60, desc or url_or_path))
            time.sleep(wait)
            r = self.c.get(url_or_path, wait=False, allow_redirects=True, timeout=timeout)
            if r.status_code == 429:
                try:
                    wait2 = int(r.headers.get("retry-after") or 600)
                except (TypeError, ValueError):
                    wait2 = 600
                raise CooldownError(wait2, desc)
        if r.status_code != 200 or is_gated(r.text or ""):
            say("  !! 会话失效 (status=%s)，重新登录..." % r.status_code)
            self.c.login()
            r = self.c.get(url_or_path, wait=False, allow_redirects=True, timeout=timeout)
        if self.pause:
            time.sleep(self.pause + random.uniform(0, 0.8))
        return r


# --------------------------------------------------------------- HTML 解析

def _rows_by_id(soup, prefix):
    pat = re.compile(r"^%s_row_\d+$" % re.escape(prefix))
    return [[norm(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
            for tr in soup.find_all("tr", id=pat)]


def _footer(soup):
    nav = soup.select_one(".fabrikNav")
    return norm(nav.get_text(" ", strip=True)) if nav else ""


# --------------------------------------------------------------- 事件列表（1 次请求）

def collect_events(f: Fetch):
    u = ("/index.php/events/list/27?format=csv&resetfilters=1"
         "&vw_tournaments___yr[value][]=%s" % YEAR)
    try:
        r = f.get(u, desc="事件列表 CSV")
        text = (r.text or "").lstrip("\ufeff")
        if text.lower().lstrip().startswith("<html"):
            raise ValueError("非 CSV 响应")
        try:
            dialect = csv.Sniffer().sniff(text[:2000], delimiters="\t,;")
        except Exception:
            dialect = csv.excel_tab
        return [rw for rw in csv.reader(io.StringIO(text), dialect=dialect) if rw]
    except Exception as e:
        say("    [事件列表 CSV 失败: %s -> 回退 HTML]" % type(e).__name__)

    out, start = [], 0
    while start < 5000:
        u = ("/index.php/events/list/27?resetfilters=1&vw_tournaments___yr[value][]=%s"
             "&limit27=100&limitstart27=%d" % (YEAR, start))
        r = f.get(u, desc="事件列表 HTML offset=%d" % start)
        rows = _rows_by_id(BeautifulSoup(r.text or "", "lxml"), "list_27_com_fabrik_27")
        out.extend(rows)
        if len(rows) < 100:
            break
        start += 100
    return out


def _parse_events(raw_rows):
    out = []
    for r in raw_rows:
        if len(r) < 8:
            continue
        eid = r[0].strip()
        if not eid.isdigit():
            continue
        out.append({"id": eid, "year": r[1], "name": r[2], "type": r[3],
                    "kind": r[4], "matches": r[5], "start": r[6], "end": r[7]})
    return out


# --------------------------------------------------------------- 匹配数据

WANT = ["year", "event", "player a", "player b", "player x", "player y",
        "sub-event", "stage", "round", "result", "games", "winner"]


def _pick_delim(text):
    if not _is_text_csv(text):
        return "\t"
    for delim in [",", "\t", ";"]:
        if delim in text[:200]:
            return delim
    return ","


def _csv_to_rows(text):
    """解析 CSV 文本，返回 13 列 rows（按历史格式，第 13 列 Winner 副本）。"""
    rows = [rw for rw in csv.reader(io.StringIO(text.lstrip("\ufeff")),
                                     delimiter=_pick_delim(text)) if rw]
    if not rows:
        return [], [], False
    headers = rows[0]
    data = [rw for rw in rows[1:] if rw and any(c.strip() for c in rw)]
    hmap = {h.strip().lower(): i for i, h in enumerate(headers)}
    idx = [hmap.get(w) for w in WANT]
    if all(i is not None for i in idx):
        out = []
        ncols = len(data[0]) if data else 13
        for row in data:
            cells = [row[i] if i < len(row) else "" for i in idx]
            # 第 13 列：若源 CSV 是 13 列（两列 Winner 都有），取第 12 位；否则留空
            cells.append(row[12] if ncols > 12 and 12 < len(row) else "")
            out.append(cells)
        return out, headers, True
    return [rw[:13] for rw in data], headers, False


def _is_text_csv(text):
    return (not text.lower().lstrip().startswith("<html")
            and "com-fabrik" not in text.lower()
            and "com-users-login" not in text.lower())


def _fetch_csv(f: Fetch, ids):
    """按 id 列表发起 CSV 请求。返回 (13 列 rows, header, is_good)。"""
    joined = "&".join("vw_matches___tournament_id_raw[value][]=%s" % i for i in ids)
    u = "/index.php/event-matches/list/68?format=csv&resetfilters=1&%s" % joined
    r = f.get(u, desc="匹配 CSV (ids=%d)" % len(ids))
    return _csv_to_rows(r.text or "")


def _html_matches(f: Fetch, eid):
    rows, start = [], 0
    seen = set()
    while start < 30000:
        u = ("/index.php/event-matches/list/68?resetfilters=1&abc=%s"
             "&vw_matches___tournament_id_raw[value][]=%s"
             "&limit68=100&limitstart68=%d" % (eid, eid, start))
        r = f.get(u, desc="匹配 HTML (event %s, offset %d)" % (eid, start))
        soup = BeautifulSoup(r.text or "", "lxml")
        page = _rows_by_id(soup, "list_68_com_fabrik_68")
        fb = _footer(soup)
        total = int(re.search(r"Total: (\d+)", fb).group(1)) if re.search(r"Total: (\d+)", fb) else None
        for rw in page:
            key = "\t".join(rw)
            if key not in seen:
                seen.add(key)
                rows.append(rw[:13])
        if total and len(rows) >= total:
            break
        if len(page) < 100:
            break
        start += 100
    return rows


# --------------------------------------------------------------- 写文件

def write_event_file(path, ev, rows):
    n_pages = max(1, (len(rows) + 99) // 100)
    meta = "\t".join([ev.get("year", YEAR), ev["name"], ev.get("type", ""),
                      ev.get("kind", ""), ev.get("matches", ""),
                      ev.get("start", ""), ev.get("end", "")])
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


# --------------------------------------------------------------- 主流程

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
    ap.add_argument("--event", help="只抓指定事件（名称关键字或 id）")
    ap.add_argument("--events-only", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--pause", type=float, default=4.5)
    ap.add_argument("--offline-events", action="store_true",
                    help="不请求事件列表，直接用缓存 target_2012.json（最小请求模式）")
    ap.add_argument("--per-event", action="store_true", help="跳过合并，直接逐赛事")
    ap.add_argument("--html", action="store_true", help="强制 HTML 分页")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    c = IttfClient(verbose=args.debug, pause=0.0)
    ensure_login(c, args.cookie)
    f = Fetch(c, args.pause)

    # --offline-events：直接用缓存的事件清单，不请求站点（最少请求模式）
    cache = os.path.join(WORK_DIR, "target_2012.json")
    if args.offline_events and os.path.exists(cache):
        with open(cache, encoding="utf-8") as fh:
            target = json.load(fh)
        events = target
        say("== 使用缓存事件清单（%d 站），跳过事件列表请求 ==" % len(target))
    else:
        say("== 拉取 %s 年事件列表 ==" % YEAR)
        raw = collect_events(f)
        events = _parse_events(raw)
        say("事件行数: %d" % len(events))
        if not events:
            say("[ERR] 未取到事件，终止。")
            return 1
        say("2012 出现类型: %s" % sorted({e["type"] for e in events}))
        target = sorted([e for e in events if match_types(e["type"])],
                        key=lambda x: x.get("start") or "")
        say("命中目标 %d 站:" % len(target))
        for e in target:
            say("  [%-26s] %-52s %s~%s  id=%s  Matches=%s" %
                (e["type"], e["name"][:52], e["start"], e["end"], e["id"], e["matches"]))

    os.makedirs(WORK_DIR, exist_ok=True)
    for name, data in [("events_2012.json", events), ("target_2012.json", target)]:
        with open(os.path.join(WORK_DIR, name), "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)

    if args.events_only:
        say("（--events-only，未抓匹配）")
        return 0

    todo = target
    if args.event:
        k = args.event.lower()
        todo = [e for e in target if k in e["name"].lower() or e["id"] == args.event]
        if not todo:
            say("[ERR] 未匹配到事件: %s" % args.event)
            return 2

    # ---------- 取匹配：合并 CSV（1 次）优先，失败则逐赛事 CSV，HTML 分页必须 --html ----------
    all_rows = {}   # event_name -> [rows]
    mode = "none"
    html_ok = args.html   # 是否允许 HTML 分页（默认禁止，避免重蹈覆辙）
    if html_ok:
        say("\n[WARN] --html 启用，将允许 HTML 分页（请求量大，仅在 CSV 失效时使用）")

    if not html_ok:
        # 合并 CSV
        say("\n== 合并 CSV：1 次请求取全部 %d 站匹配 ==" % len(todo))
        rows_all, headers, ok = _fetch_csv(f, [e["id"] for e in todo])
        if ok and rows_all:
            for rw in rows_all:
                all_rows.setdefault(rw[1], []).append(rw)
            covered = [e for e in todo if e["name"] in all_rows]
            missing = [e for e in todo if e["name"] not in all_rows]
            say("  合并 CSV 成功：覆盖 %d/%d 站，共 %d 行" % (len(covered), len(todo), len(rows_all)))
            mode = "combined"
            # 缺的站逐站补（1 次请求/站）
            for m in missing:
                say("  逐站 CSV 补抓: id=%s" % m["id"])
                per_rows, _, per_ok = _fetch_csv(f, [m["id"]])
                if per_ok and per_rows:
                    all_rows[m["name"]] = per_rows
                else:
                    say("  [WARN] %s CSV 失败，跳过该站（用 --resume 重跑）" % m["name"])
        else:
            # 合并失败 → 逐站 CSV
            say("\n== 合并 CSV 失败，改为逐站 CSV（每站 1 次请求） ==")
            for m in todo:
                say("  逐站 CSV: id=%s" % m["id"])
                per_rows, _, per_ok = _fetch_csv(f, [m["id"]])
                if per_ok and per_rows:
                    all_rows[m["name"]] = per_rows
                else:
                    say("  [WARN] %s CSV 失败，跳过（用 --resume 重跑）" % m["name"])
            mode = "per-event"
    else:
        mode = "html"

    # ---------- 写文件 ----------
    os.makedirs(OUT_DIR, exist_ok=True)
    report, done, total_rows = {}, 0, 0
    for i, e in enumerate(todo, 1):
        path = os.path.join(OUT_DIR, safe_name(e["name"]) + ".txt")
        if args.resume and os.path.exists(path) and os.path.getsize(path) > 0:
            say("[%d/%d] SKIP %s" % (i, len(todo), e["name"]))
            report[e["name"]] = "skip-existing"
            continue
        say("\n[%d/%d] %s  id=%s" % (i, len(todo), e["name"], e["id"]))
        try:
            if mode in ("combined", "per-event"):
                rows = all_rows.get(e["name"]) or []
            else:
                rows = _html_matches(f, e["id"])
        except CooldownError as ex:
            say("\n!! 冷却 %d 秒，已退出（用 --resume 续跑）" % ex.wait)
            with open(os.path.join(WORK_DIR, "report.json"), "w", encoding="utf-8") as fh:
                json.dump(report, fh, ensure_ascii=False, indent=2)
            return EXIT_COOLDOWN
        except Exception as ex:
            say("    [ERR] %s: %s" % (type(ex).__name__, ex))
            report[e["name"]] = {"error": "%s: %s" % (type(ex).__name__, ex)}
            continue

        if not rows:
            say("    [WARN] 0 行，跳过")
            report[e["name"]] = {"rows": 0}
            continue
        write_event_file(path, e, rows)
        exp = e.get("matches")
        warn = ""
        if exp and exp.isdigit():
            diff = abs(len(rows) - int(exp))
            if diff > 3:
                warn = "  ! Matches 列=%s 实际=%d 差异=%d" % (exp, len(rows), diff)
        done += 1
        total_rows += len(rows)
        say("    -> %d 行写入 %s%s" % (len(rows), os.path.basename(path), warn))
        report[e["name"]] = {"rows": len(rows), "file": os.path.basename(path), "mode": mode}

    say("\n== 完成 == 模式=%s  成功 %d/%d  总行 %d  目录 %s" %
        (mode, done, len(todo), total_rows, OUT_DIR))
    with open(os.path.join(WORK_DIR, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
