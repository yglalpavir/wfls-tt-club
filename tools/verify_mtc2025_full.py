#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 overallScores 权威核对生成 JSON 中所有盘面的胜负方向。"""
import json
import sys
from pathlib import Path

sys.path.insert(0, r"s:\wfls-tt-club\wfls-tt-club\tools")
from parse_mtc2025 import CARDS, norm, get_comps, get_players, get_pname, get_scores, parse_date

results = {"MS": [], "WS": [], "MD": [], "WD": [], "XD": []}

for card in CARDS:
    date = parse_date((card.get("matchDateTime") or {}).get("startDateLocal", ""))
    team = card.get("teamParentData", {}).get("extended_info", {})
    for m in team.get("matches", []):
        mr = m.get("match_result", {})
        comps = get_comps(mr)
        if len(comps) != 2:
            continue
        h, a = comps[0], comps[1]
        # 判定项目（复用parse逻辑，简化：直接用players数+性别）
        def pn(p): return get_pname(p)
        def sex(c): 
            gs=[norm(pn(p))[1] for p in get_players(c)]
            return gs
        def cat():
            counts=[len(get_players(c)) for c in comps]
            gs=[sex(c) for c in comps]
            if counts==[1,1]:
                return "MS" if gs[0][0]=="M" else ("WS" if gs[0][0]=="F" else None)
            if counts==[2,2]:
                s=set(gs[0]+gs[1])
                if s=={"M"}: return "MD"
                if s=={"F"}: return "WD"
                if s=={"M","F"}: return "XD"
            return None
        c=cat()
        if not c: continue
        ov = mr.get("overallScores") or mr.get("OverallScores") or ""
        hw,aw=0,0
        try:
            p=ov.split("-"); hw,aw=int(p[0]),int(p[1])
        except: 
            hs=[int(x) for x in get_scores(h).split(",") if x]
            as_=[int(x) for x in get_scores(a).split(",") if x]
            hw=sum(1 for x,y in zip(hs,as_) if x>y); aw=sum(1 for x,y in zip(hs,as_) if y>x)
        win = h if hw>aw else a
        lose = a if hw>aw else h
        def combo(comp):
            ps=[norm(pn(p))[0] for p in get_players(comp)]
            return "/".join(ps) if len(ps)>1 else ps[0]
        results[c].append({"日期":date,"类型":"世界杯团体","胜者":combo(win),"负者":combo(lose)})

mismatch=0
for cat in ["MS","WS","MD","WD","XD"]:
    gen=json.loads((Path(r"s:\wfls-tt-club\wfls-tt-club\tools")/f"_mtc2025_{cat}.json").read_text(encoding="utf-8"))
    ref=results[cat]
    gen_sorted=sorted(gen,key=lambda r:(r["日期"],r["胜者"],r["负者"]))
    ref_sorted=sorted(ref,key=lambda r:(r["日期"],r["胜者"],r["负者"]))
    if len(gen_sorted)!=len(ref_sorted):
        print(f"{cat}: 数量不一致 gen={len(gen_sorted)} ref={len(ref_sorted)}")
        continue
    for g,r in zip(gen_sorted,ref_sorted):
        if g!=r:
            mismatch+=1
            print(f"{cat} 不一致: gen={g} vs ref={r}")
    if gen_sorted==ref_sorted:
        print(f"{cat}: {len(gen_sorted)} 条全部一致 [OK]")

print("\n总计不一致:", mismatch)
