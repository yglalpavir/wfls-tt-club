"""调试 player profile API"""
import httpx, json

headers = {
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.worldtabletennis.com',
    'Origin': 'https://www.worldtabletennis.com',
    'User-Agent': 'Mozilla/5.0',
}
with httpx.Client(headers=headers) as c:
    r = c.get('https://ranking.ittf.com/public/s/player/profile/121404', timeout=30)
    print(f"Status: {r.status_code}")
    print(f"Content-Type: {r.headers.get('content-type', '?')}")
    print(f"Content-Encoding: {r.headers.get('content-encoding', '?')}")
    print(f"Text length: {len(r.text)}")
    print(f"First 500: {r.text[:500]}")
    print(f"First char: {repr(r.text[:1])}")
    try:
        d = r.json()
        print(f"JSON OK, keys: {list(d.keys())}")
        player = d.get("player", {})
        print(f"Player type: {type(player).__name__}")
        if isinstance(player, dict):
            print(f"  FamilyName: {player.get('FamilyName','?')}")
            print(f"  GivenName: {player.get('GivenName','?')}")
        elif isinstance(player, str):
            print(f"  player is string: {player[:100]}")
    except Exception as e:
        print(f"JSON error: {type(e).__name__}: {e}")
