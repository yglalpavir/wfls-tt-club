#!/usr/bin/env python3
"""
TTS Ranking 快速爬虫 - 专注爬取指定数量的球员数据

用法:
  python tools/tts_quick_scrape.py --token <TOKEN> --cat ms --n 100
"""

import json, time, re, sys, argparse
from pathlib import Path
from datetime import datetime
from curl_cffi import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "wtt_data"
BASE = "https://api.ttsranking.com/api"
IMPERSONATE = "chrome110"

CATEGORY_INFO = {
    "ms": {"name": "男子单打", "kind": "singles"},
    "ws": {"name": "女子单打", "kind": "singles"},
    "md": {"name": "男子双打", "kind": "doubles"},
    "wd": {"name": "女子双打", "kind": "doubles"},
    "xd": {"name": "混合双打", "kind": "doubles"},
}


def api_get(url, token, timeout=20):
    """简单的 API GET 请求"""
    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers, impersonate=IMPERSONATE, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            time.sleep(2 * (attempt + 1))
        except Exception as e:
            print(f"    retry {attempt+1}: {type(e).__name__}", flush=True)
            time.sleep(3 * (attempt + 1))
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True)
    parser.add_argument("--cat", required=True, choices=["ms","ws","md","wd","xd"])
    parser.add_argument("--n", type=int, default=100, help="要爬取的球员数量")
    parser.add_argument("--delay", type=float, default=0.3)
    args = parser.parse_args()

    cat = args.cat
    info = CATEGORY_INFO[cat]
    is_doubles = info["kind"] == "doubles"

    print(f"TTS Quick Scrape: {info['name']} ({cat.upper()})", flush=True)
    print(f"Target: top {args.n} players", flush=True)

    # 1. Get rankings
    print("Fetching rankings...", flush=True)
    players = {}
    for offset in range(0, args.n, 100):
        limit = min(100, args.n - offset)
        data = api_get(f"{BASE}/rankings?category={cat}&scope=active&offset={offset}&limit={limit}", args.token)
        if not data:
            break
        for row in data.get("rows", []):
            pid = row["id"]
            if is_doubles:
                name = f"{row.get('p1','?')}/{row.get('p2','?')}"
            else:
                name = row.get("name", "?")
            players[pid] = name
        if len(data.get("rows", [])) < limit:
            break
        time.sleep(0.2)

    print(f"  Got {len(players)} players", flush=True)

    # 2. Fetch matches
    print("Fetching matches...", flush=True)
    all_matches = {}
    processed = 0
    errors = 0

    for pid, pname in players.items():
        processed += 1
        if processed % 20 == 0:
            print(f"  {processed}/{len(players)}: {len(all_matches)} unique matches, {errors} errors", flush=True)

        data = api_get(f"{BASE}/players/{pid}/matches?limit=50", args.token, timeout=15)
        if data is None:
            errors += 1
            if errors > 10:
                print(f"  Too many errors, stopping", flush=True)
                break
            continue

        for m in data.get("matches", []):
            mid = m.get("match_id")
            if mid not in all_matches:
                result = m.get("result", "")
                opponent = m.get("opponent", "").split("(")[0].strip()
                event_cn = m.get("event_name_cn", "")
                event_en = m.get("event_name", "")

                # Extract date
                date_match = re.search(r'(\d{4})', event_en)
                date_str = f"{date_match.group(1)}-01-01" if date_match else None
                if not date_str:
                    continue

                # Classify event
                if not event_cn:
                    etype = "其他赛事"
                elif "大满贯" in event_cn:
                    etype = "大满贯"
                elif "冠军赛" in event_cn:
                    etype = "冠军赛"
                elif "球星挑战赛" in event_cn:
                    etype = "球星挑战赛"
                elif "挑战赛" in event_cn:
                    etype = "常规挑战赛"
                elif "总决赛" in event_cn or "世界杯" in event_cn:
                    etype = "总决赛"
                elif "世锦赛" in event_cn or "世乒赛" in event_cn or "锦标赛" in event_cn:
                    etype = "世锦赛"
                elif "奥运" in event_cn:
                    etype = "奥运会"
                else:
                    etype = "其他赛事"

                if result == "W":
                    winner, loser = pname, opponent
                else:
                    winner, loser = opponent, pname

                all_matches[mid] = {
                    "日期": date_str,
                    "类型": etype,
                    "胜者": winner,
                    "负者": loser,
                }

        time.sleep(args.delay)

    # 3. Save
    records = list(all_matches.values())
    out_path = DATA_DIR / cat / "score-log-tts.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"\nDone! {len(records)} records saved to {out_path}", flush=True)


if __name__ == "__main__":
    main()
