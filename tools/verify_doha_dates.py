#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核对构造的日期/轮次与原始浏览器数据的日期一致。"""
import re, ast
from pathlib import Path

raw = Path(r"s:\wfls-tt-club\wfls-tt-club\tools\doha_doubles_raw.txt").read_text(encoding="utf-8")
src = Path(r"s:\wfls-tt-club\wfls-tt-club\tools\add_doha_doubles_2025.py").read_text(encoding="utf-8")

tree = ast.parse(src)
data = {}
for node in ast.walk(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id in ("MD", "WD", "XD"):
                data[t.id] = ast.literal_eval(node.value)

sec = re.split(r"(男双|女双|混双)", raw)
bodies = {}
for i in range(1, len(sec), 2):
    bodies[sec[i]] = sec[i+1] if i+1 < len(sec) else ""

MONTH = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,"Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}

def get_date(blk):
    m = re.search(r"(\w+), (\d+) (\w+) (\d+)", blk)
    if not m:
        return None
    return f"{int(m.group(4)):04d}-{MONTH[m.group(3)]:02d}-{int(m.group(2)):02d}"

def split_matches(body):
    return [b for b in body.split("Match Centre") if b.strip()]

# 每个类别里，块顺序应与构造顺序一致（同一轮次内部顺序相同）
for cat, key in (("男双","MD"), ("女双","WD"), ("混双","XD")):
    records = data[key]
    blocks = split_matches(bodies[cat])
    print(f"\n===== {cat} ({key}) =====")
    mism = 0
    for i, (date, w, l) in enumerate(records):
        if i >= len(blocks):
            print(f"  场次{i+1} 超出原始块数")
            mism += 1
            continue
        bdate = get_date(blocks[i])
        if bdate != date:
            mism += 1
            print(f"  场次{i+1} 日期不符: 构造 {date} vs 原始 {bdate}  ({w})")
    if mism == 0:
        print(f"  全部 {len(records)} 场日期核对通过 [OK]")
