#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CI 数据校验门禁：
1. data/ 与 wtt_data/ 全部 JSON 可解析
2. score-log 引用的球员存在于 players.json（姓名或别名）；无自弈记录；日期合法且不晚于今天
3. 比赛类型都在 event-coefficient.json 中有定义
4. 赛季覆盖检查：当前日期超出最后一个赛季结束时失败（强制创建新赛季，防止口径漂移）
用法: python tools/ci_validate.py
"""
import json
import os
import sys
from datetime import date, datetime

# Windows GBK 控制台兜底：输出统一走 UTF-8（CI Linux 环境不受影响）
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []


def err(msg):
    errors.append(msg)
    print("  [FAIL] " + msg)


def ok(msg):
    print("  [OK] " + msg)


def load(path):
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except Exception as e:
        err(f"{path} JSON 解析失败: {e}")
        return None


def valid_iso(d):
    try:
        datetime.strptime(str(d), "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


# ---- 1) 全量 JSON 可解析 ----
print("[1] JSON 解析检查")
json_count = 0
for sub in ("data", "wtt_data"):
    for dirpath, _, files in os.walk(os.path.join(ROOT, sub)):
        if "__pycache__" in dirpath:
            continue
        for fn in files:
            if fn.endswith(".json"):
                json_count += 1
                load(os.path.join(dirpath, fn))
ok(f"{json_count} 个 JSON 文件解析通过" if not errors else f"{json_count} 个文件中有解析失败")

# ---- 2) 球员引用完整性 ----
print("[2] score-log 与 players.json 引用完整性")
players = load(os.path.join(ROOT, "data", "players.json")) or {}
names = set()
for p in players.get("players", []):
    if p.get("name"):
        names.add(p["name"])
        for a in p.get("aliases") or []:
            names.add(a)
scorelog_path = os.path.join(ROOT, "data", "score-log.json")
scorelog = load(scorelog_path) or []
today = date.today().isoformat()
unknown, selfplay, baddate, future = set(), 0, 0, 0
for r in scorelog:
    d = r.get("日期")
    if not valid_iso(d):
        baddate += 1
    elif str(d) > today:
        future += 1
    if r.get("胜者"):
        if r["胜者"] not in names:
            unknown.add(r["胜者"])
        if r["负者"] not in names:
            unknown.add(r["负者"])
        if r["胜者"] == r["负者"]:
            selfplay += 1
    elif r.get("对象") and r["对象"] not in names:
        unknown.add(r["对象"])
if unknown:
    err(f"未在 players.json 中登记的姓名: {sorted(unknown)}")
else:
    ok("所有姓名均已登记")
if selfplay:
    err(f"发现 {selfplay} 条自弈记录（胜者==负者）")
else:
    ok("无自弈记录")
if baddate:
    err(f"{baddate} 条日期不是合法 YYYY-MM-DD")
if future:
    err(f"{future} 条日期在未来（{today} 之后）")
if not (baddate or future):
    ok("日期全部合法且无未来日期")

# ---- 3) 类型白名单 ----
print("[3] 比赛类型 ∈ event-coefficient.json")
coeff = load(os.path.join(ROOT, "data", "event-coefficient.json")) or {}
coeff_types = {k for k, v in coeff.items() if isinstance(v, (int, float))}  # 排除「赛制系数」「默认赛制」等保留键
bad_types = sorted({r.get("类型") for r in scorelog if r.get("胜者") and r.get("类型") not in coeff_types})
if bad_types:
    err(f"score-log 中存在未定义系数的类型: {bad_types}")
else:
    ok("比赛类型全部已定义")

# ---- 4) 赛季覆盖 ----
print("[4] 赛季过期守卫")
seasons = load(os.path.join(ROOT, "data", "seasons.json")) or []
if not seasons:
    err("data/seasons.json 为空或缺失")
else:
    last = max(s.get("endDate", "") for s in seasons)
    if today > last:
        err(f"当前日期 {today} 已超出最后一个赛季结束日 {last} —— 请在 data/seasons.json 创建新赛季，"
            f"否则新比赛将持续计入被延伸的旧赛季且不会触发跨赛季积分继承")
    else:
        ok(f"赛季覆盖至 {last}")

print()
if errors:
    print(f"CI 校验失败：{len(errors)} 项问题")
    sys.exit(1)
print("CI 校验全部通过")
