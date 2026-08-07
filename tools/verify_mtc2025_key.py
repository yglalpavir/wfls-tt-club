#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核对决赛(FNL)、铜牌(34-)、半决赛(SFNL)的关键盘面与胜负方向。"""
import json
from pathlib import Path

ROOT = Path(r"s:\wfls-tt-club\wfls-tt-club")
CARDS = json.loads((ROOT / "tools" / "mtc2025_matchcards.json").read_text(encoding="utf-8"))

KEY = ["FNL", "34-", "SFNL"]

for card in CARDS:
    code = card.get("documentCode", "")
    if not any(k in code for k in KEY):
        continue
    print("\n====", card.get("subEventDescription"), code)
    team = card.get("teamParentData", {}).get("extended_info", {})
    for m in team.get("matches", []):
        mr = m.get("match_result", {})
        comps = mr.get("competitiors") or mr.get("Competitiors") or []
        desc = mr.get("subEventDescription") or mr.get("SubEventDescription")
        if len(comps) != 2:
            continue
        # 提取球员
        def pn(p): return p.get("playerName") or p.get("PlayerName")
        def pls(c): return "/".join(pn(p) for p in (c.get("players") or c.get("Players") or []))
        h, a = comps[0], comps[1]
        ov = mr.get("overallScores") or mr.get("OverallScores") or ""
        print(f"  {desc}: {pls(h)} [{ov}] {pls(a)}")
