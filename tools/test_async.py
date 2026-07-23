"""快速测试异步并发是否工作"""
import asyncio, httpx, time

HEADERS = {
    "Accept": "application/json",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0",
}

async def fetch_one(client, pid, name, sem):
    async with sem:
        t0 = time.time()
        r = await client.get(
            f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset=0&size=200&ind=1&dbl=1",
            timeout=30
        )
        data = r.json()
        t1 = time.time()
        return pid, name, len(data.get("Matches", [])), t1 - t0

async def main():
    sem = asyncio.Semaphore(3)  # 3 concurrent
    async with httpx.AsyncClient(headers=HEADERS, timeout=30) as client:
        players = [
            (121558, "王楚钦"),
            (122044, "莫雷加德"),
            (135996, "松岛辉空"),
            (121582, "林昀儒"),
            (115641, "雨果"),
        ]
        tasks = [fetch_one(client, pid, name, sem) for pid, name in players]
        
        t0 = time.time()
        results = await asyncio.gather(*tasks)
        t1 = time.time()
        
        for pid, name, count, dur in results:
            print(f"  {name}: {count} matches, {dur:.1f}s")
        print(f"  Total: {t1-t0:.1f}s (串行预估: {sum(d for _,_,_,d in results):.1f}s)")

asyncio.run(main())
