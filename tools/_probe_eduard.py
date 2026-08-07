import httpx, time, json
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

def fetch(url):
    return httpx.get(url, headers=HEADERS, timeout=40).json()

# 1) Eduard IONESCU matches
pid = 135023
d = fetch(f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset=0&size=400&ind=1&dbl=1")
tours = d.get("Tournaments", {})
matches = d.get("Matches", [])
print("Eduard total matches:", len(matches))
mtwc_tid = None
for tid, t in tours.items():
    if isinstance(t, dict):
        desc = json.dumps(t.get('Desc', {}), ensure_ascii=False)
        if ("Mixed Team" in desc or "Chengdu" in desc) and "2024" in desc:
            print("MTWC candidate:", tid, desc, t.get('From'), t.get('To'))
            mtwc_tid = str(tid)
print("chosen mtwc_tid:", mtwc_tid)
print("\n===== Eduard IONESCU matches at MTWC =====")
for m in matches:
    if str(m.get("tourId")) == mtwc_tid:
        date = m.get("Date"); ev = m.get("Event"); typ = m.get("Type")
        stage = m.get("Stage"); comps = m.get("Competitors", [])
        names = []
        for c in comps:
            pl = c.get("Players", [])
            names.append("+".join(p.get("Name","") for p in pl))
        print(f"[{date}] Ev={ev} T={typ} S={stage} | {' vs '.join(names)} | {m.get('Desc','')}")
