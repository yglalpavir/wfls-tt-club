#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证手工构造的 MD/WD/XD 配对与原始浏览器数据一致。"""
import re, sys
from pathlib import Path

sys.path.insert(0, r"s:\wfls-tt-club\wfls-tt-club\tools")
raw = Path(r"s:\wfls-tt-club\wfls-tt-club\tools\doha_doubles_raw.txt").read_text(encoding="utf-8")

# 提取构造脚本里的数据（导入模块会执行写文件，故改为手动解析构造脚本的列表）
# 我们直接重新定义期望数据，从 add_doha_doubles_2025.py 读取列表更稳妥：不执行，用正则抓取
# 这里我们改为解析 add 脚本文件中的 "组合A/组合B"
import ast

src = Path(r"s:\wfls-tt-club\wfls-tt-club\tools\add_doha_doubles_2025.py").read_text(encoding="utf-8")

# 解析脚本中 MD / WD / XD 三个列表（每个元素 ("date","w","l")）
# 用 ast 提取
tree = ast.parse(src)
md = wd = xd = None
for node in ast.walk(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id in ("MD", "WD", "XD"):
                val = ast.literal_eval(node.value)
                if t.id == "MD": md = val
                elif t.id == "WD": wd = val
                elif t.id == "XD": xd = val

# 把原始数据按类别切分
sec = re.split(r"(男双|女双|混双)", raw)
bodies = {}
for i in range(1, len(sec), 2):
    bodies[sec[i]] = sec[i+1] if i+1 < len(sec) else ""

def split_matches(body):
    """按 'Match Centre' 分割成比赛块。"""
    blocks = body.split("Match Centre")
    blocks = [b for b in blocks if b.strip()]
    return blocks

def check(cat, records, body):
    blocks = split_matches(body)
    print(f"\n===== {cat}: 构造 {len(records)} 场, 原始块 {len(blocks)} 场 =====")
    if len(records) != len(blocks):
        print(f"  !! 数量不一致: 构造 {len(records)} vs 原始 {len(blocks)}")
    ok = True
    for i, (date, w, l) in enumerate(records):
        if i >= len(blocks):
            break
        blk = blocks[i]
        # 球员名检查（子串）
        missing = []
        for p in w.split("/") + l.split("/"):
            p = p.strip()
            if p not in blk:
                missing.append(p)
        if missing:
            ok = False
            print(f"  场次{i+1} ({w} vs {l}) 缺失: {missing}")
            print(f"      块内容: {blk[:100]}")
    if ok:
        print(f"  {cat}: 全部 {len(records)} 场配对核对通过 [OK]")
    return ok

allok = True
for cat, recs in (("男双", md), ("女双", wd), ("混双", xd)):
    allok &= check(cat, recs, bodies[cat])

print("\n总体:", "通过" if allok else "有误")
