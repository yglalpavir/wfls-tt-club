#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""探查每场队际赛子盘的实际结构，找出比分/competitors在哪。"""
import json
from pathlib import Path

ROOT = Path(r"s:\wfls-tt-club\wfls-tt-club")
CARDS = json.loads((ROOT / "tools" / "mtc2025_matchcards.json").read_text(encoding="utf-8"))

print("总场数:", len(CARDS))
for card in CARDS:
    code = card.get("documentCode", "")
    desc = card.get("subEventDescription", "")
    te = card.get("teamParentData", {}).get("extended_info", {})
    ms = te.get("matches", [])
    # 统计哪些子盘有 competitors
    with_comp = 0
    for m in ms:
        mr = m.get("match_result", {})
        if mr.get("competitiors"):
            with_comp += 1
    print(f"{code} | {desc} | 子盘{len(ms)} 有competitors {with_comp}")
    # 打印第一个有/无的子盘keys
    for m in ms[:1]:
        mr = m.get("match_result", {})
        print("     match_result keys:", list(mr.keys())[:20])
        print("     competitors:", len(mr.get("competitiors", [])))
        print("     full_msg:", str(mr.get("full_msg"))[:80])
