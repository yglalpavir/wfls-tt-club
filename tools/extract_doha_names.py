#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从原始浏览器数据中提取所有候选球员名，用于验证手工构造的配对。"""
import re
from pathlib import Path

raw = Path(r"s:\wfls-tt-club\wfls-tt-club\tools\doha_doubles_raw.txt").read_text(encoding="utf-8")

# 去掉种子号 (n)
text = re.sub(r"\(\d+\)", "", raw)

# 提取形如 "单词 单词" 或含连字符的名字对（第二个词全大写=欧洲姓，或第一个词全大写=中国姓）
# 名字可能带 - 和撇号
name_pair = re.compile(
    r"([A-ZÀ-Þ][a-zà-ÿ]*(?:[' -][A-ZÀ-Þa-zà-ÿ]+)*) ([A-ZÀ-Þ]{2,}(?:[' -][A-ZÀ-Þ]+)*)"
    r"|"
    r"([A-ZÀ-Þ]{2,}(?:[' -][A-ZÀ-Þ]+)*) ([A-ZÀ-Þ][a-zà-ÿ]*(?:[' -][A-ZÀ-Þa-zà-ÿ]+)*)"
)

names = set()
for m in name_pair.finditer(text):
    a = m.group(1) or m.group(4)
    b = m.group(2) or m.group(3)
    if a and b:
        names.add((a, b))

print("候选球员名数量:", len(names))
for a, b in sorted(names):
    print(f"{a} {b}")
