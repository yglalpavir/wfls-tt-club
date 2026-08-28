#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tーミーグ(卓球Tリーグ) 赛果抓取脚本 — 获取尚未抓取的比赛数据。

从 https://tleague.jp/schedule/detail.php?id=N 抓取比赛详情页，
仅保留正文包含「試合結果」的页面，落盘 tools/tleague_data/{id}.json
（该目录已在 .gitignore 中，不入库）。

用法：
    python tools/import_tleague_scrape.py                      # 增量抓取（跳过已存在）
    python tools/import_tleague_scrape.py --start 1278         # 指定 id 区间
    python tools/import_tleague_scrape.py --update             # 强制重抓已存在页面
    python tools/import_tleague_scrape.py --scan-only          # 仅扫描缺档，不写盘
"""

import argparse
import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://tleague.jp/schedule/detail.php?id={}"
DEFAULT_START = 1
DEFAULT_END = 2000
SAVE_DIR = Path(__file__).resolve().parent / "tleague_data"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
RESULT_RE = re.compile(r"試合結果")


def fetch_page(match_id):
    """抓取页面 HTML；失败（404/超时/异常）返回 None。"""
    try:
        r = requests.get(BASE_URL.format(match_id), headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return None
        return r.text
    except Exception as exc:  # noqa: BLE001
        print(f"  警告: id={match_id} 请求失败: {exc}", file=__import__("sys").stderr)
        return None


def parse_page(html, match_id):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.text.strip() if soup.title else ""
    return {
        "id": match_id,
        "title": title,
        "url": BASE_URL.format(match_id),
        "raw_text": soup.get_text("\n", strip=True),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=int, default=DEFAULT_START, help="起始 id，默认 1")
    parser.add_argument("--end", type=int, default=DEFAULT_END, help="结束 id，默认 2000")
    parser.add_argument("--update", action="store_true", help="强制重抓已存在页面")
    parser.add_argument("--scan-only", action="store_true", help="只扫描（含已存在），不写盘、不抓新页")
    parser.add_argument("--sleep", type=float, default=0.3, help="相邻请求间隔秒数，默认 0.3")
    args = parser.parse_args()

    if args.scan_only and args.update:
        parser.error("--scan-only 与 --update 不能同时使用")

    SAVE_DIR.mkdir(parents=True, exist_ok=True)

    found_ids = []
    missing_ids = []
    skipped = 0
    existing = {
        int(p.stem) for p in SAVE_DIR.glob("*.json") if p.stem.isdigit()
    }

    for match_id in range(args.start, args.end + 1):
        path = SAVE_DIR / f"{match_id}.json"
        if path.exists() and not args.update:
            skipped += 1
            continue
        if args.scan_only and match_id in existing:
            # 已存在则视为命中，仅统计，不重抓
            found_ids.append(match_id)
            continue

        html = fetch_page(match_id)
        if html is None or not RESULT_RE.search(html):
            missing_ids.append(match_id)
            continue

        found_ids.append(match_id)
        if not args.scan_only:
            data = parse_page(html, match_id)
            path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"  已抓取 id={match_id} -> {path.name}")
        time.sleep(args.sleep)

    mode = "扫描" if args.scan_only else "抓取"
    print(f"\n{mode}完成:")
    found_tag = "新发现（结果页）" if args.scan_only else "本次抓取（结果页）"
    print(f"  {found_tag}: {len(found_ids)} 个，id 样例: {found_ids[:10]}")
    print(f"  已有页面（跳过）: {skipped} 个")
    print(f"  未命中/无结果页: {len(missing_ids)} 个")
    if missing_ids:
        print(f"  缺档范围样例: {missing_ids[:20]} ..."
              f"{(missing_ids[-8:] if len(missing_ids) > 20 else '')}")


if __name__ == "__main__":
    main()