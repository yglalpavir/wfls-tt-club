"""
ITTF 比赛记录爬虫 - 第1步：摸底数据规模
"""
import httpx, json, time
from collections import Counter

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0",
}
API_KEYS = {
    "apikey": "2bf8b222-532c-4c60-8ebe-eb6fdfebe84a",
    "secapimkey": "S_WTT_882jjh7basdj91834783mds8j2jsd81",
}

client = httpx.Client(headers=HEADERS, timeout=60)

# ===== 1. 获取排名靠前的球员ID =====
print("=" * 60)
print("1. 获取排名前100球员 (各类别)")
print("=" * 60)

player_ids = {}  # id -> {name, org, gender, events}

def get_top100(type_, gender, cat, label):
    """从 WTT Frontdoor 获取前100"""
    cat_map = {"S": "SINGLES", "D": "DOUBLES", "DI": "SINGLES"}
    sub_map = {
        ("SEN","M","S"):"MS", ("SEN","W","S"):"WS",
        ("SEN","M","D"):"MD", ("SEN","W","D"):"WD", ("SEN","X","D"):"XD",
        ("SEN","M","DI"):"MDI", ("SEN","W","DI"):"WDI", ("SEN","X","DI"):"XDI",
    }
    url = f"https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking/{type_}_{cat_map[cat]}.json?q={int(time.time()*1000)}"
    try:
        r = client.get(url, timeout=30)
        data = r.json()
        code = sub_map.get((type_, gender, cat), f"{gender}{cat}")
        players = [p for p in data["Result"] if p.get("SubEventCode") == code]
        for p in players:
            if cat == "D":
                pid = p.get("IttfId1", "")
                pid2 = p.get("IttfId1d", "")
                name = f"{p.get('PlayerName1','')} / {p.get('PlayerName1d','')}"
                org = p.get("CountryCode1", "?")
                if pid:
                    player_ids[pid] = {"name": p.get("PlayerName1",""), "org": org, "gender": gender}
                if pid2:
                    player_ids[pid2] = {"name": p.get("PlayerName1d",""), "org": p.get("CountryCode1d","?"), "gender": gender}
            else:
                pid = p.get("IttfId", "")
                name = p.get("PlayerName", "")
                org = p.get("CountryCode", "?")
                if pid:
                    player_ids[pid] = {"name": name, "org": org, "gender": gender}
        print(f"  {label}: {len(players)} players -> total unique: {len(player_ids)}")
    except Exception as e:
        print(f"  ❌ {label}: {e}")

for type_, gender, cat, label in [
    ("SEN", "M", "S", "MS Top100"),
    ("SEN", "W", "S", "WS Top100"),
    ("SEN", "M", "D", "MD Top100"),
    ("SEN", "W", "D", "WD Top100"),
    ("SEN", "X", "D", "XD Top100"),
]:
    get_top100(type_, gender, cat, label)
    time.sleep(0.5)

# ===== 2. 抽样检查几个球员的比赛事件类型 =====
print(f"\n{'='*60}")
print(f"2. 抽样检查比赛事件类型 (共{len(player_ids)}名球员)")
print("=" * 60)

all_events = Counter()
all_levels = Counter()
all_years = Counter()
sample_count = 0

# 从每个性别取前20名来抽样
sample_ids = {}
for pid, info in player_ids.items():
    g = info.get("gender", "?")
    if g not in sample_ids:
        sample_ids[g] = []
    if len(sample_ids[g]) < 20:
        sample_ids[g].append(pid)

# 取一些样本来了解事件分布
all_sample = []
for g, ids in sample_ids.items():
    all_sample.extend(ids[:15])

print(f"  抽样 {len(all_sample)} 名球员...")

for pid in all_sample[:30]:  # 最多30个
    try:
        r = client.get(
            f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset=0&size=200&ind=1&dbl=1",
            timeout=30
        )
        data = r.json()
        matches = data.get("Matches", [])
        for m in matches:
            all_events[m.get("Event", "?")] += 1
            all_levels[m.get("Level", "?")] += 1
            all_years[m.get("Date", "????")[:4]] += 1
        sample_count += 1
        print(f"  {sample_count}. {player_ids[pid]['name']}({pid}): {len(matches)} matches")
        time.sleep(0.3)
    except Exception as e:
        print(f"  ❌ {pid}: {e}")

print(f"\n  Event分布: {all_events.most_common(20)}")
print(f"  Level分布: {all_levels.most_common(15)}")
print(f"  Year分布:  {sorted(all_years.items())}")

# ===== 3. 估算总量 =====
print(f"\n{'='*60}")
print("3. 数据量估算")
print("=" * 60)

# 如果用WTT All Players API获取更多ID
try:
    r = client.get(
        "https://wttcmsapigateway-new.azure-api.net/ttu/Players/GetPlayers?limit=1000",
        headers=API_KEYS, timeout=30
    )
    all_players = r.json().get("Result", [])
    print(f"  WTT All Players (limit=1000): {len(all_players)} 人")
    # 检查有排名的
    ranked = [p for p in all_players if p.get("PlayerRankingPosition")]
    print(f"  有排名的: {len(ranked)} 人")
except Exception as e:
    print(f"  ❌ All Players: {e}")

print(f"\n  当前收集到 {len(player_ids)} 名球员ID (来自排名Top100)")
avg_matches = (sum(all_events.values()) / sample_count) if sample_count > 0 else 0
print(f"  平均每名球员: {avg_matches:.0f} 场比赛")
print(f"  预估总数据量: ~{len(player_ids) * avg_matches:.0f} 场比赛")

client.close()
print("\n✅ 摸底完成!")
