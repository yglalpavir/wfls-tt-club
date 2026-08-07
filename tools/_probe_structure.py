import httpx, time
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}
FRONTDOOR = "https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking"
data = httpx.get(f"{FRONTDOOR}/SEN_SINGLES.json?q={int(time.time()*1000)}", headers=HEADERS, timeout=30).json()
print("top keys:", list(data.keys()))
res = data.get("Result", [])
print("num results:", len(res))
if res:
    print("sample entry keys:", list(res[0].keys()))
    print("sample:", json.dumps(res[0], ensure_ascii=False))
    # print MS entries only
    ms = [p for p in res if p.get("SubEventCode")=="MS"]
    print("\nMS count:", len(ms))
    for p in ms[:5]:
        print(json.dumps(p, ensure_ascii=False)[:300])
