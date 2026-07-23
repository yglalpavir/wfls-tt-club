"""
ITTF 比赛记录全量爬虫
=====================
从 ranking.ittf.com 爬取全部比赛记录，按赛事类别(MS/WS/MD/WD/XD)和年份分文件夹保存。

策略:
  1. 从WTT排名获取球员ID (MS→WS→MD→WD→XD优先级)
  2. 逐球员获取其全部比赛 (翻页至无新数据)
  3. 按 match.Key 去重
  4. 按 Event+Year 分组保存

输出目录: ittf-pingpong_api/
  ms/  2020.json, 2019.json, ...
  ws/  2020.json, 2019.json, ...
  md/  ...
  wd/  ...
  xd/  ...
"""
import httpx
import json
import time
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

RANKING_CONFIG = [
    # (type_, gender, cat, event_code, label)
    ("SEN", "M", "S", "MS", "男子单打"),
    ("SEN", "W", "S", "WS", "女子单打"),
    ("SEN", "M", "D", "MD", "男子双打"),
    ("SEN", "W", "D", "WD", "女子双打"),
    ("SEN", "X", "D", "XD", "混合双打"),
]

TARGET_EVENTS = {"MS", "WS", "MD", "WD", "XD"}

CAT_MAP = {"S": "SINGLES", "D": "DOUBLES", "DI": "SINGLES"}
SUB_MAP = {
    ("SEN","M","S"):"MS", ("SEN","W","S"):"WS",
    ("SEN","M","D"):"MD", ("SEN","W","D"):"WD", ("SEN","X","D"):"XD",
    ("SEN","M","DI"):"MDI", ("SEN","W","DI"):"WDI", ("SEN","X","DI"):"XDI",
}


def get_player_ids(client):
    """从WTT排名获取所有球员ID，按优先级排列(MS优先)"""
    all_ids = {}
    order = []

    for type_, gender, cat, event_code, label in RANKING_CONFIG:
        print(f"  获取 {label} 排名...")
        url = (f"https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net"
               f"/ranking/{type_}_{CAT_MAP[cat]}.json?q={int(time.time()*1000)}")
        try:
            r = client.get(url, timeout=30)
            data = r.json()
            code = SUB_MAP.get((type_, gender, cat), f"{gender}{cat}")
            players = [p for p in data["Result"] if p.get("SubEventCode") == code]

            for p in players:
                if cat == "D":
                    for key_id, key_name, key_country in [
                        ("IttfId1", "PlayerName1", "CountryCode1"),
                        ("IttfId1d", "PlayerName1d", "CountryCode1d"),
                    ]:
                        pid = p.get(key_id, "")
                        if pid and pid not in all_ids:
                            all_ids[pid] = {
                                "name": p.get(key_name, ""),
                                "org": p.get(key_country, "?"),
                                "gender": gender,
                            }
                            order.append(pid)
                else:
                    pid = p.get("IttfId", "")
                    if pid and pid not in all_ids:
                        all_ids[pid] = {
                            "name": p.get("PlayerName", ""),
                            "org": p.get("CountryCode", "?"),
                            "gender": gender,
                        }
                        order.append(pid)
            print(f"    {label}: +{len(players)} 人, 累计 {len(all_ids)} 人")
        except Exception as e:
            print(f"    ❌ {label}: {e}")
        time.sleep(0.5)

    return all_ids, order


def fetch_player_matches(client, ittf_id, delay=0.15):
    """获取一个球员的全部比赛（翻页直到空）"""
    all_matches = []
    offset = 0
    page_size = 200

    while True:
        try:
            url = (f"https://ranking.ittf.com/public/s/player/matches/{ittf_id}"
                   f"?offset={offset}&size={page_size}&ind=1&dbl=1")
            r = client.get(url, timeout=30)
            data = r.json()
            matches = data.get("Matches", [])
            if not matches:
                break

            # 补充赛事信息
            tournaments = data.get("Tournaments", {})
            for m in matches:
                tid = str(m.get("tourId", ""))
                if tid and tid in tournaments:
                    m["_tournament"] = tournaments[tid]

            all_matches.extend(matches)
            total = data.get("total", 0)

            if len(matches) < page_size or len(all_matches) >= total:
                break

            offset += page_size
            time.sleep(delay)
        except Exception as e:
            print(f"    ⚠️ offset={offset} error: {e}")
            time.sleep(2)
            break

    return all_matches


def parse_year(date_str):
    """从 DD-MM-YYYY 提取年份"""
    try:
        parts = date_str.split("-")
        if len(parts) == 3:
            return parts[2]
    except:
        pass
    return "????"


def main():
    print("=" * 60)
    print("ITTF 比赛记录全量爬虫")
    print("=" * 60)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for evt in TARGET_EVENTS:
        (OUTPUT_DIR / evt.lower()).mkdir(exist_ok=True)

    client = httpx.Client(headers=HEADERS, timeout=60)

    # ===== 1. 获取球员ID =====
    print("\n📋 第1步: 收集球员ID...")
    all_ids, id_order = get_player_ids(client)
    print(f"   共 {len(all_ids)} 名球员")

    # ===== 2. 爬取比赛 =====
    print(f"\n🏓 第2步: 逐球员爬取比赛 (MS→WS→MD→WD→XD)...")

    seen_keys = set()
    categorized = defaultdict(lambda: defaultdict(list))

    completed = 0
    total_matches = 0
    skipped = 0

    for idx, pid in enumerate(id_order, 1):
        info = all_ids[pid]
        name = info["name"]

        if idx % 25 == 0 or idx == 1:
            print(f"  [{idx}/{len(id_order)}] {name}({pid}) ... "
                  f"{total_matches}场 | unique:{len(seen_keys)} | skip:{skipped}")

        matches = fetch_player_matches(client, pid, delay=0.12)
        if not matches:
            skipped += 1
            continue

        new_for_player = 0
        for m in matches:
            key = m.get("Key", "")
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)

            evt = m.get("Event", "?")
            if evt not in TARGET_EVENTS:
                continue

            year = parse_year(m.get("Date", ""))
            categorized[evt][year].append(m)
            total_matches += 1
            new_for_player += 1

        completed += 1

    print(f"\n   完成: {completed}/{len(id_order)} 球员")
    print(f"   跳过: {skipped} (无数据)")
    print(f"   去重后: {total_matches} 场比赛")

    # ===== 3. 排序并保存 =====
    print(f"\n💾 第3步: 排序并保存...")

    for evt in sorted(TARGET_EVENTS):
        evt_lower = evt.lower()
        years = categorized.get(evt, {})

        for year in sorted(years.keys(), reverse=True):
            matches = years[year]
            # 按日期降序
            matches.sort(key=lambda m: m.get("Date", ""), reverse=True)

            filepath = OUTPUT_DIR / evt_lower / f"{year}.json"
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(matches, f, ensure_ascii=False, indent=2)

            print(f"  {evt}/{year}.json: {len(matches)} 场")

    # ===== 4. 元数据 =====
    meta = {
        "source": "ranking.ittf.com/public/s/player/matches",
        "players_total": len(all_ids),
        "players_with_data": completed,
        "players_skipped": skipped,
        "total_unique_matches": total_matches,
        "events": {
            evt: {year: len(categorized[evt][year])
                  for year in sorted(categorized[evt].keys())}
            for evt in sorted(TARGET_EVENTS) if evt in categorized
        },
        "scraped_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    with open(OUTPUT_DIR / "_metadata.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 完成! 元数据 → {OUTPUT_DIR / '_metadata.json'}")
    client.close()


if __name__ == "__main__":
    main()
