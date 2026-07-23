"""
ITTF 比赛记录爬虫 - 从保存的球员ID列表继续
===========================================
纯爬取版本：直接从 ittf-pingpong_api/_player_ids.json 读取ID，
跳过排名API，只调用 matches API。

如果 _player_ids.json 不存在，从已有的排名数据文件提取。
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
API_KEYS = {
    "apikey": "2bf8b222-532c-4c60-8ebe-eb6fdfebe84a",
    "secapimkey": "S_WTT_882jjh7basdj91834783mds8j2jsd81",
}

TARGET_EVENTS = {"MS", "WS", "MD", "WD", "XD"}
PLAYER_TIMEOUT = 120


def get_player_ids():
    """获取球员ID列表"""
    id_file = OUTPUT_DIR / "_player_ids.json"
    
    if id_file.exists():
        with open(id_file) as f:
            data = json.load(f)
        print(f"   从 {id_file} 读取 {len(data)} 名球员", flush=True)
        return {p["id"]: {"name": p["name"], "org": p["org"], "gender": p["gender"]}
                for p in data}, [p["id"] for p in data]
    
    # 方法1: 尝试 WTT Frontdoor
    print("   尝试 WTT Frontdoor...", flush=True)
    import httpx as sync_httpx
    
    CAT_MAP = {"S": "SINGLES", "D": "DOUBLES"}
    SUB_MAP = {
        ("SEN","M","S"):"MS", ("SEN","W","S"):"WS",
        ("SEN","M","D"):"MD", ("SEN","W","D"):"WD", ("SEN","X","D"):"XD",
        ("SEN","M","DI"):"MDI", ("SEN","W","DI"):"WDI", ("SEN","X","DI"):"XDI",
    }
    
    all_ids = {}
    order = []
    
    client = sync_httpx.Client(headers=HEADERS, timeout=30)
    try:
        for type_, gender, cat, _, label in [
            ("SEN", "M", "S", "MS", "男子单打"),
            ("SEN", "W", "S", "WS", "女子单打"),
            ("SEN", "M", "D", "MD", "男子双打"),
            ("SEN", "W", "D", "WD", "女子双打"),
            ("SEN", "X", "D", "XD", "混合双打"),
        ]:
            try:
                url = (f"https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net"
                       f"/ranking/{type_}_{CAT_MAP[cat]}.json?q={int(time.time()*1000)}")
                r = client.get(url)
                data = r.json()
                code = SUB_MAP.get((type_, gender, cat), "")
                players = [p for p in data["Result"] if p.get("SubEventCode") == code]
                for p in players:
                    if cat == "D":
                        for k_id, k_name, k_org in [
                            ("IttfId1", "PlayerName1", "CountryCode1"),
                            ("IttfId1d", "PlayerName1d", "CountryCode1d"),
                        ]:
                            pid = p.get(k_id, "")
                            if pid and pid not in all_ids:
                                all_ids[pid] = {"name": p.get(k_name, ""), "org": p.get(k_org, "?"), "gender": gender}
                                order.append(pid)
                    else:
                        pid = p.get("IttfId", "")
                        if pid and pid not in all_ids:
                            all_ids[pid] = {"name": p.get("PlayerName", ""), "org": p.get("CountryCode", "?"), "gender": gender}
                            order.append(pid)
                print(f"    {label}: +{len(players)} 人, 累计 {len(all_ids)}", flush=True)
            except Exception as e:
                print(f"    ❌ {label} (Frontdoor): {e}", flush=True)
            time.sleep(0.5)
    
        # 方法2: 如果Frontdoor失败，用 WTT All Players API
        if len(all_ids) < 100:
            print("   Frontdoor 数据不足，尝试 WTT All Players API...", flush=True)
            try:
                r = client.get(
                    "https://wttcmsapigateway-new.azure-api.net/ttu/Players/GetPlayers?limit=20000",
                    headers={**HEADERS, **API_KEYS}, timeout=60
                )
                players = r.json().get("Result", [])
                ranked = [p for p in players if p.get("PlayerRankingPosition")]
                for p in ranked:
                    pid = str(p.get("IttfId", ""))
                    if pid and pid not in all_ids:
                        all_ids[pid] = {
                            "name": p.get("PlayerFamilyNameFirst", p.get("PlayerName", "")),
                            "org": p.get("PlayerOrg", p.get("Org", "?")),
                            "gender": p.get("PlayerGender", p.get("Gender", "?")),
                        }
                        order.append(pid)
                print(f"   WTT Players: +{len(ranked)} 有排名球员, 累计 {len(all_ids)}", flush=True)
            except Exception as e:
                print(f"   ❌ WTT Players: {e}", flush=True)
    finally:
        client.close()
    
    # 保存ID列表
    if all_ids:
        id_list = [{"id": pid, **info} for pid, info in all_ids.items()]
        with open(id_file, "w", encoding="utf-8") as f:
            json.dump(id_list, f, ensure_ascii=False, indent=2)
        print(f"   已保存 {len(id_list)} 个ID到 {id_file}", flush=True)
    
    return all_ids, order


async def fetch_matches(client, ittf_id):
    """获取球员全部比赛"""
    all_matches = []
    offset = 0
    
    while True:
        try:
            url = (f"https://ranking.ittf.com/public/s/player/matches/{ittf_id}"
                   f"?offset={offset}&size=200&ind=1&dbl=1")
            r = await client.get(url, timeout=30)
            data = r.json()
            matches = data.get("Matches", [])
            if not matches:
                break
            tournaments = data.get("Tournaments", {})
            for m in matches:
                tid = str(m.get("tourId", ""))
                if tid and tid in tournaments:
                    m["_tournament"] = tournaments[tid]
            all_matches.extend(matches)
            total = data.get("total", 0)
            if len(matches) < 200 or len(all_matches) >= total:
                break
            offset += 200
        except Exception as e:
            print(f"    ⚠️ {ittf_id} p{offset}: {e}", flush=True)
            break
    return all_matches


def parse_year(d):
    try:
        parts = d.split("-")
        if len(parts) == 3 and parts[2].isdigit():
            return parts[2]
    except:
        pass
    return "unknown"


def save_data(categorized):
    for evt in sorted(TARGET_EVENTS):
        evt_dir = OUTPUT_DIR / evt.lower()
        years = categorized.get(evt, {})
        for year in sorted(years.keys(), reverse=True):
            matches = years[year]
            matches.sort(key=lambda m: m.get("Date", ""), reverse=True)
            with open(evt_dir / f"{year}.json", "w", encoding="utf-8") as f:
                json.dump(matches, f, ensure_ascii=False, indent=2)


async def main():
    print("=" * 60, flush=True)
    print("ITTF 比赛记录爬虫 (纯爬取版)", flush=True)
    print("=" * 60, flush=True)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for evt in TARGET_EVENTS:
        (OUTPUT_DIR / evt.lower()).mkdir(exist_ok=True)
    
    # 获取ID
    all_ids, id_order = get_player_ids()
    
    # 爬取
    print(f"\n🏓 爬取 {len(id_order)} 名球员的比赛...", flush=True)
    
    seen_keys = set()
    categorized = defaultdict(lambda: defaultdict(list))
    completed = skipped = timeout_count = total_matches = 0
    start_time = time.time()
    
    async with httpx.AsyncClient(headers=HEADERS, timeout=60) as client:
        for idx, pid in enumerate(id_order, 1):
            info = all_ids[pid]
            name = info["name"]
            
            try:
                matches = await asyncio.wait_for(
                    fetch_matches(client, pid), timeout=PLAYER_TIMEOUT)
            except asyncio.TimeoutError:
                print(f"  [{idx}/{len(id_order)}] ⏰ {name}({pid})", flush=True)
                timeout_count += 1; skipped += 1; continue
            except Exception as e:
                print(f"  [{idx}/{len(id_order)}] ❌ {name}({pid}): {e}", flush=True)
                skipped += 1; continue
            
            if not matches:
                skipped += 1; continue
            
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
            
            completed += 1
            
            if idx % 10 == 0 or idx == len(id_order):
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                eta = (len(id_order) - idx) / rate if rate > 0 else 0
                print(f"  [{idx}/{len(id_order)}] {total_matches}场 | "
                      f"skip:{skipped} | t/o:{timeout_count} | "
                      f"{rate:.1f}/s | ETA:{eta:.0f}s", flush=True)
                save_data(categorized)
    
    # 最终保存
    print(f"\n💾 最终保存...", flush=True)
    save_data(categorized)
    
    meta = {
        "source": "ranking.ittf.com/public/s/player/matches",
        "players_total": len(all_ids),
        "players_completed": completed, "players_skipped": skipped,
        "players_timeout": timeout_count, "total_unique_matches": total_matches,
        "events": {evt: {year: len(categorized[evt][year])
                         for year in sorted(categorized[evt].keys())}
                   for evt in sorted(TARGET_EVENTS) if evt in categorized},
        "scraped_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    with open(OUTPUT_DIR / "_metadata.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ {total_matches} 场 | 超时:{timeout_count} | 跳过:{skipped}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
