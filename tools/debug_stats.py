"""调试 profile stats 结构"""
import httpx

c = httpx.Client(headers={
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0",
})
r = c.get("https://ranking.ittf.com/public/s/player/profile/121404", timeout=30)
d = r.json()

stats = d.get("stats", {})
print(f"Stats keys: {list(stats.keys())}")
for k, v in stats.items():
    print(f"\n{k}: type={type(v).__name__}")
    if isinstance(v, dict):
        print(f"  keys={list(v.keys())}")
        if "byYear" in v:
            byYear = v["byYear"]
            print(f"  byYear: type={type(byYear).__name__}, len={len(byYear)}")
            if byYear:
                print(f"  first: {byYear[0]}")
                print(f"  last: {byYear[-1]}")

c.close()
