#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 sitemap.xml 与 RSS 订阅（feed.xml）。

- sitemap.xml：收录全部可收录（club）页面，lastmod 取该文件最后一次 git 提交日期，
  内容页再与 data/ 最新条目日期取较大者。WTT/admin/404 沿用 robots noindex 不收录。
- feed.xml：RSS 2.0，取 data/news/index.json 中 visible !== false 的最近 20 条，
  链接到 detail.html?type=news&id={id}。

用法:
  python tools/generate_meta.py            # 写入 sitemap.xml / feed.xml
  python tools/generate_meta.py --check    # 与磁盘内容比对，不一致则退出码 1（CI 门禁）
"""
import json
import os
import subprocess
import sys
from datetime import date, datetime
from xml.sax.saxutils import escape

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://yglalpavir.github.io/wfls-tt-club/"

PAGES = [
    "index.html", "news.html", "competitions.html", "ranking.html",
    "data_viz.html", "personal_stats.html", "player.html", "detail.html",
    "members.html", "qa.html", "changelog.html", "contact.html",
]
FEED_BASE = "news"      # feed 的内容类型
FEED_LIMIT = 20


def git_head_lastmod():
    """HEAD 提交日期（YYYY-MM-DD）。用 HEAD 而非按文件取历史，保证 shallow CI checkout
    与本地完整 clone 生成结果一致；从未提交过则返回今天。"""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs"],
            cwd=ROOT, capture_output=True, text=True,
        ).stdout.strip()
        return out or date.today().isoformat()
    except Exception:
        return date.today().isoformat()


def build_sitemap():
    today = date.today().isoformat()
    head_lm = git_head_lastmod()
    # 内容数据最新的条目日期 —— 作为内容页 lastmod 的下限参考
    latest_content = today
    try:
        for t in ("news", "competitions", "qa"):
            p = os.path.join(ROOT, "data", t, "index.json")
            with open(p, encoding="utf-8-sig") as f:
                for it in json.load(f):
                    d = str(it.get("date") or "")
                    if d and d > latest_content:
                        latest_content = d
    except Exception:
        pass

    rows = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for page in PAGES:
        lm = max(head_lm, latest_content) if page in (
            "news.html", "competitions.html", "qa.html", "detail.html", "index.html") else head_lm
        rows.append("\t<url>")
        rows.append("\t\t<loc>{}</loc>".format(SITE + page))
        rows.append("\t\t<lastmod>{}</lastmod>".format(lm))
        rows.append("\t</url>")
    rows.append("</urlset>")
    return "\n".join(rows) + "\n"


def build_feed():
    p = os.path.join(ROOT, "data", FEED_BASE, "index.json")
    with open(p, encoding="utf-8-sig") as f:
        items = json.load(f)
    items = [i for i in items if i.get("visible") is not False][:FEED_LIMIT]

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<rss version="2.0">',
             '<channel>',
             '<title>WFLS Table Tennis Club - 社团动态</title>',
             '<link>{}</link>'.format(SITE + "news.html"),
             '<description>武汉外国语学校乒乓球社团的最新动态</description>',
             '<language>zh-CN</language>']
    for it in items:
        guid = "{}detail.html?type={}&amp;id={}".format(SITE, FEED_BASE, escape(str(it.get("id") or "")))
        lines.append("<item>")
        lines.append("<title>{}</title>".format(escape(str(it.get("title") or ""))))
        lines.append("<link>{}</link>".format(guid))
        lines.append("<guid isPermaLink=\"false\">{}</guid>".format(guid))
        lines.append("<description>{}</description>".format(escape(str(it.get("excerpt") or ""))))
        d = str(it.get("date") or "")
        try:
            rfc = datetime.strptime(d, "%Y-%m-%d").strftime("%a, %d %b %Y 00:00:00 +0000")
        except ValueError:
            rfc = datetime.utcnow().strftime("%a, %d %b %Y 00:00:00 +0000")
        lines.append("<pubDate>{}</pubDate>".format(rfc))
        lines.append("</item>")
    lines.append("</channel>")
    lines.append("</rss>")
    return "\n".join(lines) + "\n"


def main():
    check = "--check" in sys.argv
    outputs = {
        "sitemap.xml": build_sitemap(),
        "feed.xml": build_feed(),
    }
    stale = []
    for name, content in outputs.items():
        path = os.path.join(ROOT, name)
        if check:
            current = None
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    current = f.read()
            if current != content:
                stale.append(name)
                print("  [过期] {} 与重新生成结果不一致（请运行 python tools/generate_meta.py）".format(name))
            else:
                print("  [OK] {} 已是最新".format(name))
        else:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)
            print("  [写入] {}".format(name))
    if check and stale:
        sys.exit(1)


if __name__ == "__main__":
    main()
