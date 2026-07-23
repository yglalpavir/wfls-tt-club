"""
ITTF 比赛记录全量爬虫 (稳健版)
===============================
逐个球员处理，每完成一个球员立即保存增量JSON。
遇到超时自动跳过。

输出: ittf-pingpong_api/{ms,ws,md,wd,xd}/{year}.json
"""
import asyncio
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

TARGET_EVENTS = {"MS", "WS", "MD", "WD", "XD"}
CAT_MAP = {"S": "SINGLES", "D": "DOUBLES", "DI": "SINGLES"}
SUB_MAP = {
    ("SEN","M","S"):"MS", ("SEN","W","S"):"WS",
    ("SEN","M","D"):"MD", ("SEN","W","D"):"WD", ("SEN","X","D"):"XD",
    ("SEN","M","DI"):"MDI", ("SEN","W","DI"):"WDI", ("SEN","X","DI"):"XDI",
}

PLAYER_TIMEOUT = 120  # 单个球员最长等待


async def get_ranking(client, type_, gender, cat, label, max_retries=3):
    """获取排名前100的球员ID (带重试)"""
    url = (f"https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net"
           f"/ranking/{type_}_{CAT_MAP[cat]}.json?q={int(time.time()*1000)}")
    
    for attempt in range(max_retries):
        try:
            r = await client.get(url, timeout=30)
            data = r.json()
            code = SUB_MAP.get((type_, gender, cat), "")
            players = [p for p in data["Result"] if p.get("SubEventCode") == code]
            result = []
            for p in players:
                if cat == "D":
                    for k_id, k_name, k_org in [
                        ("IttfId1", "PlayerName1", "CountryCode1"),
                        ("IttfId1d", "PlayerName1d", "CountryCode1d"),
                    ]:
                        pid = p.get(k_id, "")
                        if pid:
                            result.append((pid, p.get(k_name, ""), p.get(k_org, "?"), gender))
                else:
                    pid = p.get("IttfId", "")
                    if pid:
                        result.append((pid, p.get("PlayerName", ""), p.get("CountryCode", "?"), gender))
            print(f"    {label}: +{len(players)} 人", flush=True)
            return result
        except Exception as e:
            if attempt < max_retries - 1:
                wait = (attempt + 1) * 5
                print(f"    ⚠️ {label} 重试 {attempt+1}/{max_retries} (等{wait}s)...", flush=True)
                await asyncio.sleep(wait)
            else:
                print(f"    ❌ {label}: {e}", flush=True)
                return []


async def fetch_player_matches(client, ittf_id, max_retries=3):
    """获取一个球员的全部比赛 (带重试)"""
    all_matches = []
    offset = 0
    page_size = 200

    while True:
        for attempt in range(max_retries):
            try:
                url = (f"https://ranking.ittf.com/public/s/player/matches/{ittf_id}"
                       f"?offset={offset}&size={page_size}&ind=1&dbl=1")
                r = await client.get(url, timeout=30)
                data = r.json()
                matches = data.get("Matches", [])
                tournaments = data.get("Tournaments", {})
                for m in matches:
                    tid = str(m.get("tourId", ""))
                    if tid and tid in tournaments:
                        m["_tournament"] = tournaments[tid]
                all_matches.extend(matches)
                total = data.get("total", 0)
                break  # 成功，退出重试循环
            except Exception as e:
                if attempt < max_retries - 1:
                    await asyncio.sleep((attempt + 1) * 3)
                else:
                    print(f"    ⚠️ {ittf_id} p{offset}: {e}", flush=True)
                    return all_matches  # 返回已获取的数据

        if not matches or len(matches) < page_size or len(all_matches) >= total:
            break
        offset += page_size

    return all_matches


def parse_year(date_str):
    """从 DD-MM-YYYY 提取年份"""
    try:
        parts = date_str.split("-")
        if len(parts) == 3 and parts[2].isdigit() and len(parts[2]) == 4:
            return parts[2]
    except:
        pass
    return None  # 无法解析的返回 None


def save_all(categorized, label=""):
    """保存当前全部数据到文件"""
    for evt in sorted(TARGET_EVENTS):
        evt_lower = evt.lower()
        years = categorized.get(evt, {})
        for year in sorted(years.keys(), reverse=True):
            matches = years[year]
            matches.sort(key=lambda m: m.get("Date", ""), reverse=True)
            # 安全的文件名
            safe_year = year if year and year.isdigit() else "unknown"
            filepath = OUTPUT_DIR / evt_lower / f"{safe_year}.json"
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(matches, f, ensure_ascii=False, indent=2)
    if label:
        print(f"  💾 {label}", flush=True)


async def main():
    print("=" * 60, flush=True)
    print("ITTF 比赛记录全量爬虫 (稳健版)", flush=True)
    print("=" * 60, flush=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for evt in TARGET_EVENTS:
        (OUTPUT_DIR / evt.lower()).mkdir(exist_ok=True)

    async with httpx.AsyncClient(headers=HEADERS, timeout=60) as client:
        # ===== 1. 获取球员ID =====
        print("\n📋 第1步: 收集球员ID...", flush=True)

        all_ids = {}
        id_order = []

        for type_, gender, cat, event_code, label in [
            ("SEN", "M", "S", "MS", "男子单打"),
            ("SEN", "W", "S", "WS", "女子单打"),
            ("SEN", "M", "D", "MD", "男子双打"),
            ("SEN", "W", "D", "WD", "女子双打"),
            ("SEN", "X", "D", "XD", "混合双打"),
        ]:
            players = await get_ranking(client, type_, gender, cat, label)
            for pid, name, org, gender in players:
                if pid not in all_ids:
                    all_ids[pid] = {"name": name, "org": org, "gender": gender}
                    id_order.append(pid)
            await asyncio.sleep(0.3)

        print(f"   共 {len(all_ids)} 名球员", flush=True)

        # ===== 2. 逐个爬取 (带超时) =====
        print(f"\n🏓 第2步: 逐个爬取比赛...", flush=True)

        seen_keys = set()
        categorized = defaultdict(lambda: defaultdict(list))
        completed = 0
        skipped = 0
        timeout_count = 0
        total_matches = 0
        start_time = time.time()

        for idx, pid in enumerate(id_order, 1):
            info = all_ids[pid]
            name = info["name"]

            try:
                # 单个球员超时保护
                matches = await asyncio.wait_for(
                    fetch_player_matches(client, pid),
                    timeout=PLAYER_TIMEOUT
                )
            except asyncio.TimeoutError:
                print(f"  [{idx}/{len(id_order)}] ⏰ {name}({pid}) 超时跳过", flush=True)
                timeout_count += 1
                skipped += 1
                continue
            except Exception as e:
                print(f"  [{idx}/{len(id_order)}] ❌ {name}({pid}): {e}", flush=True)
                skipped += 1
                continue

            if not matches:
                skipped += 1
                continue

            for m in matches:
                key = m.get("Key", "")
                if not key or key in seen_keys:
                    continue
                seen_keys.add(key)
                evt = m.get("Event", "?")
                if evt not in TARGET_EVENTS:
                    continue
                year = parse_year(m.get("Date", ""))
                if year is None:
                    year = "unknown"
                categorized[evt][year].append(m)
                total_matches += 1

            completed += 1

            # 每10个球员显示进度并保存
            if idx % 10 == 0 or idx == len(id_order):
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                eta = (len(id_order) - idx) / rate if rate > 0 else 0
                print(f"  [{idx}/{len(id_order)}] {total_matches}场 | "
                      f"skip:{skipped} | timeout:{timeout_count} | "
                      f"{rate:.1f}人/s | ETA:{eta:.0f}s",
                      flush=True)
                save_all(categorized, f"已保存 ({idx}/{len(id_order)})")

        # ===== 3. 最终保存 =====
        print(f"\n💾 最终保存...", flush=True)
        save_all(categorized, "最终保存")

        # 元数据
        meta = {
            "source": "ranking.ittf.com/public/s/player/matches",
            "players_total": len(all_ids),
            "players_completed": completed,
            "players_skipped": skipped,
            "players_timeout": timeout_count,
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

        print(f"\n✅ 完成! 总比赛: {total_matches} 场", flush=True)
        print(f"   超时跳过: {timeout_count}, 无数据: {skipped - timeout_count}", flush=True)
        print(f"   输出: {OUTPUT_DIR}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
