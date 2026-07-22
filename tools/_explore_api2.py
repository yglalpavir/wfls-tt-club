"""深入探索 TTS API - Part 2"""
import requests, json, time

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6InJhbmtpbmdzIiwiaWF0IjoxNzg0NzI4NDQ5LCJleHAiOjE3ODQ3MzAyNDl9.7RqEZGzswJP1t7gVI4PL_JNwC5ofHC2AbIDh82Zg48w"
H = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "Mozilla/5.0"}
BASE = "https://api.ttsranking.com/api"

# WS 排名
print("=== WS 排名 ===")
for attempt in range(3):
    try:
        r = requests.get(f"{BASE}/rankings?category=ws&scope=active&offset=0&limit=1", headers=H, timeout=15)
        d = r.json()
        total = d.get("total", 0)
        row = d["rows"][0] if d.get("rows") else {}
        name = row.get("name", "?")
        print(f"  WS: total={total}, top={name} (id={row.get('id','?')})")
        break
    except Exception as e:
        print(f"  WS attempt {attempt+1}: {type(e).__name__}: {e}")
        time.sleep(2)

# 查看各球员的比赛总数
print("\n=== 球员比赛数量 ===")
player_tests = [
    (250, "林诗栋 MS"),
    (249, "王楚钦 MS"),
    (251, "雨果 MS"),
    (6456, "马龙 MD pair"),
    (21833, "桥本帆乃香 WD pair"),
    (24357, "王楚钦 XD pair"),
]
for pid, desc in player_tests:
    try:
        r = requests.get(f"{BASE}/players/{pid}/matches?limit=1", headers=H, timeout=15)
        d = r.json()
        count = d.get("count", "?")
        matches = d.get("matches", [])
        last = matches[0].get("event_name_cn", "?") if matches else "?"
        print(f"  {desc} (id={pid}): {count} matches, last: {last}")
    except Exception as e:
        print(f"  {desc}: ERROR - {e}")
    time.sleep(0.3)

# 双打比赛数据格式
print("\n=== 双打比赛数据格式 ===")
r = requests.get(f"{BASE}/players/6456/matches?limit=1", headers=H, timeout=15)
d = r.json()
if d.get("matches"):
    m = d["matches"][0]
    print(f"  Keys: {list(m.keys())}")
    print(f"  Full: {json.dumps(m, ensure_ascii=False, indent=2)}")

# 查看玩家详情中的 ranking 信息
print("\n=== 玩家详情 ===")
r = requests.get(f"{BASE}/players/250", headers=H, timeout=15)
d = r.json()
print(f"  林诗栋: {json.dumps(d, ensure_ascii=False, indent=2)}")

# 尝试查看双打玩家的详情
print("\n=== 双打玩家详情 ===")
for pid in [6456, 21833, 24357]:
    try:
        r = requests.get(f"{BASE}/players/{pid}", headers=H, timeout=15)
        d = r.json()
        kind = d.get("kind", "?")
        name = d.get("name_cn", d.get("name", "?"))
        ranking = d.get("ranking", {})
        print(f"  id={pid}: kind={kind}, name={name}, ranking={ranking}")
    except Exception as e:
        print(f"  id={pid}: ERROR - {e}")
    time.sleep(0.3)
