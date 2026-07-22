"""通过 JWT token 测试 TTS Ranking API"""
import requests, json

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6InJhbmtpbmdzIiwiaWF0IjoxNzg0NzI1MTY4LCJleHAiOjE3ODQ3MjY5Njh9.Cjm_Hxad1zWFK2TNEXuxZCrOGTHcwXkye7hmw1sZhHE"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "Mozilla/5.0"}

tests = [
    ("WS rankings", "https://api.ttsranking.com/api/rankings?category=ws&scope=active&offset=0&limit=3"),
    ("MD rankings", "https://api.ttsranking.com/api/rankings?category=md&scope=active&offset=0&limit=3"),
    ("WD rankings", "https://api.ttsranking.com/api/rankings?category=wd&scope=active&offset=0&limit=3"),
    ("XD rankings", "https://api.ttsranking.com/api/rankings?category=xd&scope=active&offset=0&limit=3"),
    ("Player matches (full)", "https://api.ttsranking.com/api/players/1416/matches?limit=100"),
    ("Events", "https://api.ttsranking.com/api/events"),
    ("Global matches WS", "https://api.ttsranking.com/api/matches?category=ws&offset=0&limit=5"),
]

for name, url in tests:
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        data = r.json()
        print(f"\n=== {name} ===")
        print(f"Status: {r.status_code}")
        print(json.dumps(data, ensure_ascii=False, indent=2)[:500])
    except Exception as e:
        print(f"\n❌ {name}: {e}")
