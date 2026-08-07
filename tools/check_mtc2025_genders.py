#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核对2025成都混团所有球员的性别映射（从 wtt_common.js WTT_KNOWN_GENDERS）。"""
import json, re
from pathlib import Path

ROOT = Path(r"s:\wfls-tt-club\wfls-tt-club")
src = (ROOT / "js" / "wtt_common.js").read_text(encoding="utf-8")
m = re.search(r"WTT_KNOWN_GENDERS = \{(.*?)\};", src, re.S)
known = dict(re.findall(r'"([^"]+)":\s*"([MF])"', m.group(1)))
print("库中球员数:", len(known))

cards = json.loads((ROOT / "tools" / "mtc2025_matchcards.json").read_text(encoding="utf-8"))
players = {}
for c in cards:
    for mm in c.get("teamParentData", {}).get("extended_info", {}).get("matches", []):
        mr = mm.get("match_result", {})
        for co in mr.get("competitiors", []):
            org = co.get("competitiorOrg")
            for p in co.get("players", []):
                n = p.get("playerName")
                if n:
                    players.setdefault(n, set()).add(org)

missing = []
for n in sorted(players):
    rev = " ".join(reversed(n.split(" ")))
    if n in known:
        status = "known(" + known[n] + ")"
    elif rev in known:
        status = "REV-> " + rev + "(" + known[rev] + ")"
    else:
        status = "MISSING"
        missing.append(n)
    print(f"{n} => {status}")

print("\n缺失球员:", missing)
