"""Probe ITTF/WTT API for 2024 Chengdu Mixed Team World Cup player lineups."""
import httpx, json, time

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

FRONTDOOR = "https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking"

def fetch(url):
    r = httpx.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

# 1) find player IDs from frontdoor rankings (MS/WS top100 + MDI/WDI/XDI + DOUBLES)
ids = {}
try:
    data = fetch(f"{FRONTDOOR}/SEN_SINGLES.json?q={int(time.time()*1000)}")
    for p in data.get("Result", []):
        name = f"{p.get('FamilyName','')} {p.get('GivenName','')}".strip()
        code = p.get("SubEventCode")
        if any(k in name for k in ["IONESCU", "NARESH", "WANG", "KAWAKAMI", "HAGIHARA", "TANAKA", "MORI", "SASAO", "AKAE", "MENDE", "SAMARA", "SZOCS", "MOVILEANU", "KUAI", "GOODWIN", "MOYLAND", "KE", "REYES"]):
            pid = p.get("PersonId") or p.get("playerId") or p.get("ID")
            ids.setdefault(name, {}).setdefault(code, pid)
            print(f"[SINGLES {code}] {name} -> {pid}")
except Exception as e:
    print(f"SINGLES err {type(e).__name__}: {e}")

try:
    data = fetch(f"{FRONTDOOR}/SEN_DOUBLES.json?q={int(time.time()*1000)}")
    for p in data.get("Result", []):
        name = f"{p.get('FamilyName','')} {p.get('GivenName','')}".strip()
        code = p.get("SubEventCode")
        pid = p.get("PersonId") or p.get("playerId") or p.get("ID")
        ids.setdefault(name, {}).setdefault(code, pid)
except Exception as e:
    print(f"DOUBLES err {type(e).__name__}: {e}")

print("\n--- collected IDs ---")
for name, codes in ids.items():
    print(name, codes)

# 2) query matches for key players
def query_matches(pid, label):
    url = f"https://ranking.ittf.com/public/s/player/matches/{pid}?offset=0&size=300&ind=1&dbl=1"
    try:
        d = fetch(url)
    except Exception as e:
        print(f"matches err {label}: {type(e).__name__}: {e}")
        return
    tours = d.get("Tournaments", {})
    matches = d.get("Matches", [])
    print(f"\n===== {label} (pid={pid}) matches={len(matches)} =====")
    for m in matches:
        tid = str(m.get("tourId",""))
        t = tours.get(tid, {})
        tname = (t.get("Name") or t.get("name") or t.get("TournamentName") or "") if isinstance(t, dict) else ""
        tname = str(tname)
        date = m.get("Date") or m.get("date") or ""
        if "Mixed Team" in tname or "Chengdu" in tname or "2024" in tname:
            print(json.dumps(m, ensure_ascii=False)[:400])

# find IDs: use frontdoor values for those found; query known ids
QUERY = [
    ("Eduard IONESCU", None),
    ("Ovidiu IONESCU", None),
    ("Sid NARESH", None),
    ("Nandan NARESH", None),
    ("WANG Manyu", None),
    ("WANG Yidi", None),
]
print("\n\n===== matches queries =====")
for label, pid in QUERY:
    # best-effort pid from ids
    if pid is None:
        # find a name key containing label last+first parts
        found = None
        for name, codes in ids.items():
            if label.split()[0] in name and label.split()[-1] in name:
                # prefer the specific one
                for code, v in codes.items():
                    if v: found = v; break
        pid = found
    if pid:
        query_matches(pid, label)
    else:
        print(f"\n{label}: NO PID FOUND")
