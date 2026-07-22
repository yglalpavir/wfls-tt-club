"""深入探索 TTS API 端点和数据格式"""
import requests, json

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6InJhbmtpbmdzIiwiaWF0IjoxNzg0NzI4NDQ5LCJleHAiOjE3ODQ3MzAyNDl9.7RqEZGzswJP1t7gVI4PL_JNwC5ofHC2AbIDh82Zg48w"
H = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "Mozilla/5.0"}
BASE = "https://api.ttsranking.com/api"

# 1. 查看 player matches 完整字段
print("=== Player 250 (林诗栋) 第一场比赛完整数据 ===")
r = requests.get(f"{BASE}/players/250/matches?limit=1", headers=H, timeout=15)
d = r.json()
if d.get("matches"):
    m = d["matches"][0]
    print(json.dumps(m, ensure_ascii=False, indent=2))

# 2. 查看 player matches 返回结构
print("\n=== Player matches 返回结构 ===")
print(f"Keys: {list(d.keys())}")
print(f"Total (if available): {d.get('total', 'N/A')}")
print(f"Returned: {len(d.get('matches', []))}")

# 3. 尝试不同的 matches 端点参数
print("\n=== 尝试 /api/matches 不同参数 ===")
for params in [
    "?category=ms&offset=0&limit=3",
    "?category=ms&scope=active&offset=0&limit=3",
    "?player_id=250&offset=0&limit=3",
    "",
]:
    try:
        r = requests.get(f"{BASE}/matches{params}", headers=H, timeout=15)
        d = r.json()
        rows = d.get("rows", d.get("matches", []))
        print(f"  matches{params}: total={d.get('total','?')}, rows={len(rows)}")
    except Exception as e:
        print(f"  matches{params}: ERROR - {e}")

# 4. 尝试 events 端点不同参数
print("\n=== 尝试 /api/events 不同参数 ===")
for params in ["", "?limit=5", "?category=ms"]:
    try:
        r = requests.get(f"{BASE}/events{params}", headers=H, timeout=15)
        d = r.json()
        total = d.get("total", 0)
        rows = d.get("rows", d.get("events", []))
        print(f"  events{params}: total={total}, returned={len(rows)}")
        if rows:
            print(f"    第一条: {json.dumps(rows[0], ensure_ascii=False)[:200]}")
    except Exception as e:
        print(f"  events{params}: ERROR - {e}")

# 5. 尝试 players 端点
print("\n=== 尝试 /api/players 端点 ===")
try:
    r = requests.get(f"{BASE}/players/250", headers=H, timeout=15)
    d = r.json()
    print(f"  players/250 keys: {list(d.keys())}")
    # 限制输出
    for k, v in d.items():
        if isinstance(v, (str, int, float, bool)):
            print(f"    {k}: {v}")
        elif isinstance(v, list):
            print(f"    {k}: list of {len(v)} items")
        elif isinstance(v, dict):
            print(f"    {k}: dict with keys {list(v.keys())}")
except Exception as e:
    print(f"  players/250: ERROR - {e}")

# 6. 尝试获取更多比赛，测试分页
print("\n=== 测试分页 ===")
for offset in [0, 50, 100]:
    try:
        r = requests.get(f"{BASE}/players/250/matches?limit=50&offset={offset}", headers=H, timeout=15)
        d = r.json()
        matches = d.get("matches", [])
        if matches:
            print(f"  offset={offset}: got {len(matches)} matches, first date={matches[0].get('event_name','?')[:30]}")
    except Exception as e:
        print(f"  offset={offset}: ERROR - {e}")

# 7. 尝试 rankings 获取详细数据
print("\n=== Rankings 详细数据 ===")
try:
    r = requests.get(f"{BASE}/rankings?category=ms&scope=active&offset=0&limit=2", headers=H, timeout=15)
    d = r.json()
    print(f"  Keys: {list(d.keys())}")
    if d.get("rows"):
        print(f"  第一条: {json.dumps(d['rows'][0], ensure_ascii=False)}")
except Exception as e:
    print(f"  ERROR: {e}")
