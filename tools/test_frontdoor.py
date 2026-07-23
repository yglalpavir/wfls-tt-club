"""测试 WTT Frontdoor API"""
import httpx, time
url = f"https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking/SEN_SINGLES.json?q={int(time.time()*1000)}"
headers = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0",
}
try:
    r = httpx.get(url, headers=headers, timeout=30)
    print(f"Status: {r.status_code}, len: {len(r.text)}")
    print(r.text[:200])
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
