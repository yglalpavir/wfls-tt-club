"""特别调试 WttApi 的 fetch_player_profile"""
import sys
sys.path.insert(0, 's:/wfls-tt-club/wfls-tt-club/tools')
from wtt_api_client import WttApi

api = WttApi()
r = api.client.get(
    "https://ranking.ittf.com/public/s/player/profile/121404",
    timeout=30
)
print(f"Status: {r.status_code}")
print(f"Content-Type: {r.headers.get('content-type', '?')}")
print(f"Type of r.json(): {type(r.json()).__name__}")

# Check if response is JSON
try:
    d = r.json()
    print(f"Keys: {list(d.keys())}")
    print(f"Player type: {type(d.get('player')).__name__}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
    print(f"Raw text first 100: {r.text[:100]}")

api.close()
