"""
深入探索 ITTF 比赛记录 API
api: ranking.ittf.com/public/s/player/matches/{ittfId}
"""
import httpx, json

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

def fetch(url, label=""):
    r = httpx.get(url, headers=HEADERS, timeout=30)
    print(f"[{r.status_code}] {label}")
    return r.json()

# ============================================================
# 1. 查看比赛 API 的完整返回结构
# ============================================================
print("=" * 65)
print("1. 比赛 API 顶层结构")
print("=" * 65)

pid = 121404  # 樊振东
data = fetch(f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset=0&size=2&ind=1&dbl=1", "matches")
print(f"顶层 keys: {list(data.keys())}")
for k, v in data.items():
    if isinstance(v, list):
        print(f"  {k}: list ({len(v)} items)")
    elif isinstance(v, dict):
        print(f"  {k}: dict, keys={list(v.keys())}")
    else:
        print(f"  {k}: {v}")

# ============================================================
# 2. 单场比赛的完整字段
# ============================================================
print("\n" + "=" * 65)
print("2. 单场比赛完整字段")
print("=" * 65)

matches = data.get("Matches", [])
if matches:
    m = matches[0]
    print(f"字段列表 ({len(m)} fields):")
    for k, v in m.items():
        val_str = str(v)[:80]
        print(f"  {k:<25s}: {val_str}")

    print(f"\n完整JSON (第一场):")
    print(json.dumps(m, ensure_ascii=False, indent=2)[:2000])

# ============================================================
# 3. Tournaments 结构
# ============================================================
print("\n" + "=" * 65)
print("3. Tournaments 结构")
print("=" * 65)

tours = data.get("Tournaments", {})
if tours:
    print(f"共 {len(tours)} 个赛事 (dict)")
    first_id = list(tours.keys())[0]
    t = tours[first_id]
    print(f"赛事 ID={first_id}:")
    for k, v in t.items():
        val_str = str(v)[:100]
        print(f"  {k}: {val_str}")

# ============================================================
# 4. 不同 size 参数
# ============================================================
print("\n" + "=" * 65)
print("4. 分页测试")
print("=" * 65)

for offset in [0, 100, 200]:
    d = fetch(
        f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset={offset}&size=1&ind=1&dbl=1",
        f"offset={offset}"
    )
    ms = d.get("Matches", [])
    if ms:
        m = ms[0]
        print(f"  offset={offset}: {m.get('MatchDate','?')} | "
              f"{m.get('TournamentName','?')[:40]} | "
              f"{m.get('EventName','?')[:20]} | "
              f"{m.get('Winner','?')} vs {m.get('Loser','?')} "
              f"({m.get('Result','?')})")

# ============================================================
# 5. 不同球员的比赛数据量
# ============================================================
print("\n" + "=" * 65)
print("5. 不同球员比赛数量")
print("=" * 65)

for pid, name in [(121404, "樊振东"), (121558, "王楚钦"), (131163, "孙颖莎"),
                   (123980, "张本智和"), (122044, "莫雷加德")]:
    d = fetch(
        f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset=0&size=1",
        f"{name}"
    )
    total = d.get("total", "?")
    print(f"  {name} ({pid}): {total} 场比赛")

# ============================================================
# 6. 双打比赛数据
# ============================================================
print("\n" + "=" * 65)
print("6. 双打比赛 vs 单打比赛")
print("=" * 65)

# 测试不同的 ind/dbl 参数
for pid, label, params in [
    (121404, "樊振东 单打", "ind=1&dbl=0"),
    (121404, "樊振东 双打", "ind=0&dbl=1"),
    (121404, "樊振东 全部", "ind=1&dbl=1"),
    (137237, "林诗栋 双打", "ind=0&dbl=1"),
]:
    d = fetch(
        f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset=0&size=2&{params}",
        label
    )
    matches = d.get("Matches", [])
    print(f"  total={d.get('total','?')}, returned={len(matches)}")
    if matches:
        m = matches[0]
        print(f"    第一场: [{m.get('Date','?')}] {m.get('Kind','?')} "
              f"{m.get('Desc','?')} (BestOf={m.get('BestOf','?')})")

# ============================================================
# 7. 查看不同 Level / Event 分布
# ============================================================
print("\n" + "=" * 65)
print("7. 赛事级别(Level)和项目(Event)分布")
print("=" * 65)

# 获取更多比赛来统计
d = fetch(
    f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset=0&size=100&ind=1&dbl=1",
    "100 matches"
)
matches = d.get("Matches", [])
levels = {}
events = {}
stages = {}
for m in matches:
    lv = m.get("Level", "?")
    ev = m.get("Event", "?")
    st = m.get("Stage", "?")
    levels[lv] = levels.get(lv, 0) + 1
    events[ev] = events.get(ev, 0) + 1
    stages[st] = stages.get(st, 0) + 1

print(f"  Level分布: {sorted(levels.items(), key=lambda x:-x[1])}")
print(f"  Event分布: {sorted(events.items(), key=lambda x:-x[1])}")
print(f"  Stage分布: {sorted(stages.items(), key=lambda x:-x[1])}")

# ============================================================
# 8. 查看不同球员的最近一场比赛
# ============================================================
print("\n" + "=" * 65)
print("8. 各球员最近一场比赛")
print("=" * 65)

for pid, name in [(121404, "樊振东"), (121558, "王楚钦"), (131163, "孙颖莎"),
                   (123980, "张本智和"), (122044, "莫雷加德")]:
    d = fetch(
        f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset=0&size=1&ind=1&dbl=1",
        name
    )
    ms = d.get("Matches", [])
    if ms:
        m = ms[0]
        comps = m.get("Competitors", [])
        players_str = " vs ".join(
            "/".join(p["Name"] for p in c["Players"])
            for c in comps
        )
        scores = " ".join(
            f"{c['Splits'][i]['Result']}-{comps[1]['Splits'][i]['Result']}"
            for i in range(min(len(c['Splits']) for c in comps))
            if not c['Splits'][i].get('IsWinner', True) is False or True
        )
        # Get game scores properly
        game_scores = []
        n_games = min(len(comps[0].get("Splits", [])), len(comps[1].get("Splits", [])))
        for i in range(n_games):
            s0 = comps[0]["Splits"][i]
            s1 = comps[1]["Splits"][i]
            r0 = s0.get("Result", "-")
            r1 = s1.get("Result", "-")
            if r0 != "-" and r1 != "-":
                game_scores.append(f"{r0}-{r1}")
        score_str = " ".join(game_scores)
        winner = next((c for c in comps if c.get("IsWinner")), None)
        winner_name = "/".join(p["Name"] for p in winner["Players"]) if winner else "?"
        print(f"  [{m.get('Date','?')}] {m.get('Level','?')} {m.get('Desc','?')}")
        print(f"    {players_str} → 胜者: {winner_name} ({score_str})")

print("\n✅ 完成!")
