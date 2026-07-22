"""TTS API 快速批量爬取 WS/MD/WD/XD 比赛数据"""
import requests, json, time, sys
from pathlib import Path

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6InJhbmtpbmdzIiwiaWF0IjoxNzg0NzI1MTY4LCJleHAiOjE3ODQ3MjY5Njh9.Cjm_Hxad1zWFK2TNEXuxZCrOGTHcwXkye7hmw1sZhHE"
H = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "Mozilla/5.0"}
BASE = "https://api.ttsranking.com/api"
OUT = Path("wtt_data")
DELAY = 0.25

CATS = {"ws": "WS", "md": "MD", "wd": "WD", "xd": "XD"}

for cat_key, cat_name in CATS.items():
    print(f"\n=== {cat_name} ===")

    # Step 1: Get all player IDs
    print("Getting player list...")
    all_ids = {}
    for offset in range(0, 5000, 500):
        try:
            r = requests.get(f"{BASE}/rankings?category={cat_key}&scope=active&offset={offset}&limit=500",
                           headers=H, timeout=20)
            data = r.json()
            if not data.get("success"): break
            for row in data.get("rows", []):
                pid = row["id"]
                if cat_key == "ws":
                    name = row.get("name", "?")
                else:
                    name = f"{row.get('p1','?')}/{row.get('p2','?')}"
                all_ids[pid] = name
            if len(data.get("rows", [])) < 500: break
            time.sleep(0.5)
        except Exception as e:
            print(f"  Rankings error at offset {offset}: {e}")
            time.sleep(2)
    print(f"  Found {len(all_ids)} players")

    # Step 2: Fetch matches for each player
    print("Fetching matches...")
    all_matches = []
    processed = 0
    errors = 0

    for pid, pname in list(all_ids.items()):
        processed += 1
        if processed % 100 == 0:
            print(f"  {processed}/{len(all_ids)} - {len(all_matches)} matches (errors: {errors})")

        try:
            r = requests.get(f"{BASE}/players/{pid}/matches", headers=H, timeout=15)
            data = r.json()
            if data.get("success"):
                for m in data.get("matches", []):
                    m["_player_id"] = pid
                    m["_player_name"] = pname
                    m["_category"] = cat_key
                    all_matches.append(m)
        except Exception as e:
            errors += 1
            if errors > 50:
                print(f"  Too many errors ({errors}), continuing...")
                errors = 0
            time.sleep(1)

        time.sleep(DELAY)

    print(f"  Total: {len(all_matches)} matches (raw)")

    # Step 3: Deduplicate and save
    seen = set()
    unique = []
    for m in all_matches:
        mid = m.get("match_id")
        if mid not in seen:
            seen.add(mid)
            unique.append(m)

    print(f"  Unique: {len(unique)} matches")

    cat_dir = OUT / cat_key
    cat_dir.mkdir(parents=True, exist_ok=True)
    out_path = cat_dir / "score-log-tts-raw.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(unique, f, ensure_ascii=False, indent=2)
    print(f"  Saved: {out_path}")

print("\nDone!")
