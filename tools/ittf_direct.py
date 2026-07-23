"""
直接爬取 - 使用已知的球员ID列表
===============================
跳过排名API，直接爬取比赛数据。
"""
import asyncio, httpx, json, time
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "ittf-pingpong_api"

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

TARGET_EVENTS = {"MS", "WS", "MD", "WD", "XD"}

# 已知球员ID (从之前的排名获取)
KNOWN_PLAYERS = [
    # 男子单打 Top100
    (121558, "WANG Chuqin", "CHN", "M"),
    (122044, "Truls MOREGARD", "SWE", "M"),
    (135996, "Sora MATSUSHIMA", "JPN", "M"),
    (132537, "Felix LEBRUN", "FRA", "M"),
    (123980, "Tomokazu HARIMOTO", "JPN", "M"),
    (137237, "LIN Shidong", "CHN", "M"),
    (121582, "LIN Yun-Ju", "TPE", "M"),
    (115641, "Hugo CALDERANO", "BRA", "M"),
    (114936, "JANG Woojin", "KOR", "M"),
    (114715, "Dang QIU", "GER", "M"),
    (116620, "Benedikt DUDA", "GER", "M"),
    (102832, "Patrick FRANZISKA", "GER", "M"),
    (133694, "Shunsuke TOGAMI", "JPN", "M"),
    (116021, "Kanak JHA", "USA", "M"),
    (115029, "Anders LIND", "DEN", "M"),
    (118927, "Darko JORGIC", "SLO", "M"),
    (112062, "Simon GAUZY", "FRA", "M"),
    (119588, "LIANG Jingkun", "CHN", "M"),
    (132992, "Alexis LEBRUN", "FRA", "M"),
    (124576, "Vladimir SIDORENKO", "RUS", "M"),
    (134718, "Thibault PORET", "FRA", "M"),
    (135050, "CHEN Yuanyu", "CHN", "M"),
    (135888, "XIANG Peng", "CHN", "M"),
    (144528, "Flavien COTON", "FRA", "M"),
    (134442, "Hiroto SHINOZUKA", "JPN", "M"),
    (107028, "Dimitrij OVTCHAROV", "GER", "M"),
    (119533, "ZHOU Qihao", "CHN", "M"),
    (122777, "Yukiya UDA", "JPN", "M"),
    (121514, "AN Jaehyun", "KOR", "M"),
    (203067, "WEN Ruibo", "CHN", "M"),
]

def parse_year(d):
    try:
        parts = d.split("-")
        if len(parts) == 3 and parts[2].isdigit():
            return parts[2]
    except: pass
    return "unknown"

async def fetch_one(client, pid):
    matches = []
    offset = 0
    while True:
        try:
            url = (f"https://ranking.ittf.com/public/s/player/matches/{pid}"
                   f"?offset={offset}&size=200&ind=1&dbl=1")
            r = await client.get(url, timeout=30)
            data = r.json()
            batch = data.get("Matches", [])
            if not batch: break
            tournaments = data.get("Tournaments", {})
            for m in batch:
                tid = str(m.get("tourId", ""))
                if tid and tid in tournaments:
                    m["_tournament"] = tournaments[tid]
            matches.extend(batch)
            total = data.get("total", 0)
            if len(batch) < 200 or len(matches) >= total: break
            offset += 200
        except Exception as e:
            print(f"    ⚠️ {pid} p{offset}: {e}", flush=True)
            break
    return pid, matches

async def main():
    print("=" * 60, flush=True)
    print("ITTF 比赛记录爬虫 (直接版)", flush=True)
    print("=" * 60, flush=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for evt in TARGET_EVENTS:
        (OUTPUT_DIR / evt.lower()).mkdir(exist_ok=True)

    # 构建ID映射
    all_ids = {str(pid): {"name": name, "org": org, "gender": gender}
               for pid, name, org, gender in KNOWN_PLAYERS}
    id_order = [str(pid) for pid, _, _, _ in KNOWN_PLAYERS]

    print(f"   共 {len(KNOWN_PLAYERS)} 名球员", flush=True)

    seen_keys = set()
    categorized = defaultdict(lambda: defaultdict(list))
    completed = skipped = total_matches = 0
    start_time = time.time()

    async with httpx.AsyncClient(headers=HEADERS, timeout=60) as client:
        for idx, pid in enumerate(id_order, 1):
            info = all_ids[pid]
            name = info["name"]

            try:
                _, matches = await asyncio.wait_for(
                    fetch_one(client, pid), timeout=120)
            except asyncio.TimeoutError:
                print(f"  [{idx}/{len(id_order)}] ⏰ {name}", flush=True)
                skipped += 1; continue
            except Exception as e:
                print(f"  [{idx}/{len(id_order)}] ❌ {name}: {e}", flush=True)
                skipped += 1; continue

            if not matches:
                skipped += 1; continue

            for m in matches:
                key = m.get("Key", "")
                if not key or key in seen_keys: continue
                seen_keys.add(key)
                evt = m.get("Event", "?")
                if evt not in TARGET_EVENTS: continue
                year = parse_year(m.get("Date", ""))
                categorized[evt][year].append(m)
                total_matches += 1

            completed += 1

            if idx % 5 == 0 or idx == len(id_order):
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                eta = (len(id_order) - idx) / rate if rate > 0 else 0
                print(f"  [{idx}/{len(id_order)}] {total_matches}场 | "
                      f"skip:{skipped} | {rate:.1f}/s | ETA:{eta:.0f}s",
                      flush=True)
                # 增量保存
                for evt in sorted(TARGET_EVENTS):
                    years = categorized.get(evt, {})
                    for year in sorted(years.keys(), reverse=True):
                        mlist = years[year]
                        mlist.sort(key=lambda m: m.get("Date", ""), reverse=True)
                        with open(OUTPUT_DIR / evt.lower() / f"{year}.json",
                                  "w", encoding="utf-8") as f:
                            json.dump(mlist, f, ensure_ascii=False, indent=2)

    print(f"\n✅ {total_matches} 场 | skip:{skipped}", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
