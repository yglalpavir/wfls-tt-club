import json
from pathlib import Path

d = Path("wtt_data/ms")
for f in sorted(d.glob("score-log-20*.json")):
    data = json.loads(f.read_text(encoding="utf-8"))
    yr = f.stem.split("-")[2]
    real = [r for r in data if not str(r.get("日期","")).startswith("_")]
    print(f"MS {yr}: {len(real)} matches")
    if real:
        r = real[0]
        d = r.get("日期","?"); t = r.get("类型","?"); w = r.get("胜者","?"); l = r.get("负者","?")
        print(f"   sample: {d} | {t} | {w} vs {l}")

print()
# Also check WS/MD/WD/XD
for cat in ["ws","md","wd","xd"]:
    catd = Path(f"wtt_data/{cat}")
    sf = catd / "score-log.json"
    if sf.exists():
        data = json.loads(sf.read_text(encoding="utf-8"))
        real = [r for r in data if not str(r.get("日期","")).startswith("_") and not str(r.get("日期","")).startswith("_temp")]
        print(f"{cat.upper()} total: {len(real)} matches")
