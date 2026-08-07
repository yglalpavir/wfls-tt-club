#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分块打印每场比赛结构，便于核对。"""
import re
from pathlib import Path

raw = Path(r"s:\wfls-tt-club\wfls-tt-club\tools\doha_doubles_raw.txt").read_text(encoding="utf-8")

# 按类别切分
sec = re.split(r"(男双|女双|混双)", raw)
# 找出三个部分
for i in range(1, len(sec), 2):
    label = sec[i]
    body = sec[i+1] if i+1 < len(sec) else ""
    print("="*40, label, "="*40)
    # 每场比赛以 "Match Centre" 结尾，前面是日期
    # 用正则匹配 组合1 比分 组合2 比分 日期
    matches = re.findall(r"([0-9A-Za-zÀ-ÿ'() ./-]+?)([0-3])([0-9A-Za-zÀ-ÿ'() ./-]+?)([0-3])\s+(\w+, \d+ \w+ \d+)", body)
    print("检测到场次数:", len(matches))
    for m in matches[:5]:
        print("  组合A:", m[0][:60], "| 比分", m[1])
        print("  组合B:", m[2][:60], "| 比分", m[3])
        print("  日期:", m[4])
