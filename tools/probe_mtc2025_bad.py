#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查未能判定的子盘。"""
import json
from pathlib import Path

ROOT = Path(r"s:\wfls-tt-club\wfls-tt-club")
CARDS = json.loads((ROOT / "tools" / "mtc2025_matchcards.json").read_text(encoding="utf-8"))

PLAYERS = {}
# 重新加载玩家映射
exec(open(ROOT / "tools" / "parse_mtc2025.py", encoding="utf-8").read().split("def norm")[0])
# 从parse脚本获取PLAYERS（直接import会有副作用，改为手动复制）
import sys
sys.path.insert(0, str(ROOT / "tools"))
# 直接内联已知映射 —— 这里简单加载
from parse_mtc2025 import PLAYERS, norm, get_comps, get_players, get_pname

cnt = 0
for card in CARDS:
    team = card.get("teamParentData", {}).get("extended_info", {})
    for m in team.get("matches", []):
        mr = m.get("match_result", {})
        comps = get_comps(mr)
        if len(comps) == 2:
            counts = [len(get_players(c)) for c in comps]
            if counts not in ([1,1],[2,2]):
                cnt += 1
                if cnt <= 10:
                    print("== 子盘", mr.get("documentCode") or mr.get("DocumentCode"), "players数:", counts)
                    for c in comps:
                        pls = get_players(c)
                        print("    type:", c.get("CompetitorType") or c.get("competitorType"),
                              "players:", [(get_pname(p), norm(get_pname(p))) for p in pls])
print("共", cnt, "盘 players数异常")
