"""测试 TTS API 连接状态和 token 是否有效"""
import requests, json, base64, time

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6InJhbmtpbmdzIiwiaWF0IjoxNzg0NzI4NDQ5LCJleHAiOjE3ODQ3MzAyNDl9.7RqEZGzswJP1t7gVI4PL_JNwC5ofHC2AbIDh82Zg48w"
H = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "Mozilla/5.0"}

# 解析 token 信息
try:
    payload = json.loads(base64.b64decode(TOKEN.split(".")[1] + "==").decode())
    exp = payload.get("exp", 0)
    remaining = exp - time.time()
    print(f"Token 过期时间: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(exp))}")
    print(f"Token 剩余: {remaining/60:.0f} 分钟 ({remaining/3600:.1f} 小时)")
    if remaining < 0:
        print("Token 已过期!")
except Exception as e:
    print(f"Token 解析失败: {e}")

# 测试排名 API - 所有类别
print("\n=== 排名 API ===")
for cat in ["ms", "ws", "md", "wd", "xd"]:
    try:
        r = requests.get(
            f"https://api.ttsranking.com/api/rankings?category={cat}&scope=active&offset=0&limit=1",
            headers=H, timeout=15
        )
        d = r.json()
        n = d.get("total", 0)
        row = d["rows"][0] if d.get("rows") else {}
        name = row.get("name", row.get("p1", "?"))
        print(f"  {cat}: total={n}, top={name} (id={row.get('id','?')})")
    except Exception as e:
        print(f"  {cat}: ERROR - {e}")

# 测试 events API
print("\n=== Events API ===")
try:
    r = requests.get("https://api.ttsranking.com/api/events", headers=H, timeout=15)
    d = r.json()
    total = d.get("total", 0)
    rows = d.get("rows", [])
    print(f"  total={total}, returned={len(rows)}")
    if rows:
        for ev in rows[:5]:
            print(f"  - {ev}")
except Exception as e:
    print(f"  ERROR: {e}")

# 测试 matches API
print("\n=== Matches API (全局) ===")
for cat in ["ms", "ws", "md", "wd", "xd"]:
    try:
        r = requests.get(
            f"https://api.ttsranking.com/api/matches?category={cat}&offset=0&limit=2",
            headers=H, timeout=15
        )
        d = r.json()
        total = d.get("total", 0)
        rows = d.get("rows", [])
        print(f"  {cat}: total={total}, returned={len(rows)}")
        if rows:
            print(f"    第一条: {json.dumps(rows[0], ensure_ascii=False)[:200]}")
    except Exception as e:
        print(f"  {cat}: ERROR - {e}")

# 测试 player matches API
print("\n=== Player Matches API ===")
try:
    r = requests.get(
        "https://api.ttsranking.com/api/players/250/matches?limit=2",
        headers=H, timeout=15
    )
    d = r.json()
    matches = d.get("matches", d.get("rows", []))
    print(f"  player 250 (林诗栋): {len(matches)} matches returned")
    if matches:
        print(f"    第一条: {json.dumps(matches[0], ensure_ascii=False)[:300]}")
except Exception as e:
    print(f"  ERROR: {e}")
