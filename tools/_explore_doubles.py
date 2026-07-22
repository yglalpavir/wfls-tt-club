"""探索双打排名数据结构"""
import requests, json, time

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6InJhbmtpbmdzIiwiaWF0IjoxNzg0NzI4NDQ5LCJleHAiOjE3ODQ3MzAyNDl9.7RqEZGzswJP1t7gVI4PL_JNwC5ofHC2AbIDh82Zg48w"
H = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "Mozilla/5.0"}
BASE = "https://api.ttsranking.com/api"

# 获取 MD 排名数据（前3条）
print("=== MD 排名 (前3条) ===")
time.sleep(2)
r = requests.get(f"{BASE}/rankings?category=md&scope=active&offset=0&limit=3", headers=H, timeout=15)
d = r.json()
print(f"Keys: {list(d.keys())}")
print(f"total: {d.get('total')}")
for row in d.get("rows", []):
    print(f"  {json.dumps(row, ensure_ascii=False)}")

time.sleep(2)
# 获取 WD 排名
print("\n=== WD 排名 (前3条) ===")
r = requests.get(f"{BASE}/rankings?category=wd&scope=active&offset=0&limit=3", headers=H, timeout=15)
d = r.json()
for row in d.get("rows", []):
    print(f"  {json.dumps(row, ensure_ascii=False)}")

time.sleep(2)
# 获取 XD 排名
print("\n=== XD 排名 (前3条) ===")
r = requests.get(f"{BASE}/rankings?category=xd&scope=active&offset=0&limit=3", headers=H, timeout=15)
d = r.json()
for row in d.get("rows", []):
    print(f"  {json.dumps(row, ensure_ascii=False)}")

# 查看 MD 第一个 pair 的 matches
time.sleep(2)
print("\n=== MD pair 6456 (马龙) matches ===")
r = requests.get(f"{BASE}/players/6456/matches?limit=5", headers=H, timeout=15)
d = r.json()
print(f"count: {d.get('count')}")
for m in d.get("matches", [])[:3]:
    print(f"  {json.dumps(m, ensure_ascii=False)}")

# 查看 XD pair 24357 matches  
time.sleep(2)
print("\n=== XD pair 24357 matches ===")
r = requests.get(f"{BASE}/players/24357/matches?limit=5", headers=H, timeout=15)
d = r.json()
print(f"count: {d.get('count')}")
for m in d.get("matches", [])[:3]:
    print(f"  {json.dumps(m, ensure_ascii=False)}")
