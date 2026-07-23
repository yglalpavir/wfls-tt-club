"""测试 fetch_all_players 是否影响后续请求"""
import sys
sys.path.insert(0, 's:/wfls-tt-club/wfls-tt-club/tools')
from wtt_api_client import WttApi

api = WttApi()
try:
    # 先测试正常
    p = api.fetch_player_profile(121404)
    print(f"Before all_players: {type(p).__name__} - {p.get('player',{}).get('Name','?')}")

    # 再调用 all_players
    players = api.fetch_all_players(500)
    print(f"All players: {len(players)} loaded")

    # 再测试 profile
    p2 = api.fetch_player_profile(121404)
    print(f"After all_players: {type(p2).__name__}")
    if isinstance(p2, dict):
        print(f"  Name: {p2.get('player',{}).get('Name','?')}")
    else:
        print(f"  Content type: {p2[:100] if isinstance(p2, str) else 'unknown'}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
finally:
    api.close()
