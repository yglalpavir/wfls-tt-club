"""快速测试 matches API"""
import httpx, time
c = httpx.Client(headers={
    'Accept': 'application/json',
    'Referer': 'https://www.worldtabletennis.com',
    'Origin': 'https://www.worldtabletennis.com',
    'User-Agent': 'Mozilla/5.0',
}, timeout=30)

t0 = time.time()
r = c.get('https://ranking.ittf.com/public/s/player/matches/121558?offset=0&size=200&ind=1&dbl=1')
t1 = time.time()

data = r.json()
print(f"Status: {r.status_code}, Time: {t1-t0:.1f}s")
print(f"Matches: {len(data.get('Matches',[]))}")
print(f"Total: {data.get('total','?')}")
c.close()
