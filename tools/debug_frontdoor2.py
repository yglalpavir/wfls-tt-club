"""调试 WTT Frontdoor 响应 - 使用 httpx (原生支持 brotli)"""
import time, json, httpx

url = 'https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking/SEN_SINGLES.json?q=' + str(int(time.time()*1000))

headers = {
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.worldtabletennis.com',
    'Origin': 'https://www.worldtabletennis.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

with httpx.Client() as client:
    r = client.get(url, headers=headers, timeout=30)

print(f"Status: {r.status_code}")
print(f"Content-Encoding: {r.headers.get('Content-Encoding', 'none')}")
print(f"Text length: {len(r.text)}")
print(f"First 200 chars: {r.text[:200]}")

data = r.json()
print(f"\nJSON success! Type: {type(data).__name__}")
if isinstance(data, dict):
    print(f"Keys: {list(data.keys())}")
    result = data.get("Result", [])
    print(f"Result: {len(result)} items")
    if result:
        ms = [p for p in result if p.get("SubEventCode") == "MS"]
        ws = [p for p in result if p.get("SubEventCode") == "WS"]
        md = [p for p in result if p.get("SubEventCode") == "MD"]
        wd = [p for p in result if p.get("SubEventCode") == "WD"]
        xd = [p for p in result if p.get("SubEventCode") == "XD"]
        print(f"MS: {len(ms)}, WS: {len(ws)}, MD: {len(md)}, WD: {len(wd)}, XD: {len(xd)}")
        print(f"\n男子单打 Top 10:")
        for p in ms[:10]:
            print(f"  {p.get('CurrentRank')}. {p.get('PlayerName')} ({p.get('CountryCode')}) Pts:{p.get('RankingPointsYTD')}")
        print(f"\n女子单打 Top 10:")
        for p in ws[:10]:
            print(f"  {p.get('CurrentRank')}. {p.get('PlayerName')} ({p.get('CountryCode')}) Pts:{p.get('RankingPointsYTD')}")
    codes = set(p.get("SubEventCode") for p in result)
    print(f"\nAll SubEventCodes: {codes}")
elif isinstance(data, list):
    print(f"List of {len(data)}")
