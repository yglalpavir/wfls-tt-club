"""最终调试 - 测试 fetch_player_profile 在 WttApi 内的行为"""
import sys
sys.path.insert(0, 's:/wfls-tt-club/wfls-tt-club/tools')
from wtt_api_client import WttApi

api = WttApi()
try:
    # Direct call
    p = api.fetch_player_profile(121404)
    print(f"Type: {type(p).__name__}")
    if isinstance(p, dict):
        player = p.get("player", {})
        print(f"Name: {player.get('Name', '?')}")
        print("SUCCESS!")
    else:
        print(f"Unexpected type: {p[:200] if isinstance(p, str) else p}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
finally:
    api.close()
