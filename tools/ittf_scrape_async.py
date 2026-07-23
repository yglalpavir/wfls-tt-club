"""
ITTF 比赛记录全量爬虫 (异步并发版)
==================================
使用 asyncio + httpx.AsyncClient 并发请求，大幅提速。

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

CONCURRENT = 6  # 并发数 (不要太高以免被限流)


async def get_ranking(client, type_, gender, cat, label):
    """获取排名前100的球员ID"""
    url = (f"https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net"
           f"/ranking/{type_}_{CAT_MAP[cat]}.json?q={int(time.time()*1000)}")
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
        print(f"    ❌ {label}: {e}", flush=True)
        return []


async def fetch_matches_for_player(client, ittf_id, sem):
    """获取一个球员的全部比赛"""
    all_matches = []
    offset = 0
    page_size = 200

    async with sem:
        while True:
            try:
                url = (f"https://ranking.ittf.com/public/s/player/matches/{ittf_id}"
                       f"?offset={offset}&size={page_size}&ind=1&dbl=1")
                r = await client.get(url, timeout=30)
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
            except Exception as e:
                print(f"    ⚠️ {ittf_id} offset={offset}: {e}", flush=True)
                await asyncio.sleep(2)
                break

    return ittf_id, all_matches


def parse_year(date_str):
    """从 DD-MM-YYYY 提取年份"""
    try:
        return date_str.split("-")[2]
    except:
        return "????"


async def main():
    print("=" * 60, flush=True)
    print("ITTF 比赛记录全量爬虫 (异步并发版)", flush=True)
    print("=" * 60, flush=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for evt in TARGET_EVENTS:
        (OUTPUT_DIR / evt.lower()).mkdir(exist_ok=True)

    sem = asyncio.Semaphore(CONCURRENT)

    async with httpx.AsyncClient(headers=HEADERS, timeout=60) as client:
        # ===== 1. 获取球员ID =====
        print("\n📋 第1步: 收集球员ID...", flush=True)

        all_ids = {}  # id -> {name, org, gender}
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

        # ===== 2. 并发爬取 =====
        print(f"\n🏓 第2步: 并发爬取比赛 (并发={CONCURRENT})...", flush=True)

        tasks = []
        for pid in id_order:
            tasks.append(asyncio.create_task(
                fetch_matches_for_player(client, pid, sem)))

        seen_keys = set()
        categorized = defaultdict(lambda: defaultdict(list))
        completed = 0
        skipped = 0
        total_matches = 0
        start_time = time.time()

        # 分批执行以显示进度 (使用 wait + timeout 防止卡死)
        batch_size = 20
        BATCH_TIMEOUT = 120  # 单批次最长等待时间
        
        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i+batch_size]
            
            # 使用 asyncio.wait 而非 gather，避免一个任务卡住整个批次
            done, pending = await asyncio.wait(batch, timeout=BATCH_TIMEOUT)
            
            # 取消未完成的任务
            for task in pending:
                task.cancel()
            if pending:
                print(f"    ⚠️ {len(pending)} 任务超时，已取消", flush=True)
                skipped += len(pending)
            
            for task in done:
                try:
                    ittf_id, matches = task.result()
                except Exception as e:
                    print(f"    ⚠️ 任务异常: {e}", flush=True)
                    skipped += 1
                    continue
                    
                if not matches:
                    skipped += 1
                else:
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

            elapsed = time.time() - start_time
            rate = completed / elapsed if elapsed > 0 else 0
            print(f"  [{completed}/{len(id_order)}] "
                  f"{total_matches}场 | {len(seen_keys)}u | "
                  f"skip:{skipped} | {rate:.1f}人/s",
                  flush=True)

        # ===== 3. 保存 =====
        print(f"\n💾 第3步: 排序并保存...", flush=True)

        for evt in sorted(TARGET_EVENTS):
            evt_lower = evt.lower()
            years = categorized.get(evt, {})
            for year in sorted(years.keys(), reverse=True):
                matches = years[year]
                matches.sort(key=lambda m: m.get("Date", ""), reverse=True)
                filepath = OUTPUT_DIR / evt_lower / f"{year}.json"
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(matches, f, ensure_ascii=False, indent=2)
                print(f"  {evt}/{year}.json: {len(matches)} 场", flush=True)

        # ===== 4. 元数据 =====
        meta = {
            "source": "ranking.ittf.com/public/s/player/matches",
            "players_total": len(all_ids),
            "players_with_data": completed - skipped,
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

        print(f"\n✅ 完成! 总比赛: {total_matches} 场", flush=True)
        print(f"   输出: {OUTPUT_DIR}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
