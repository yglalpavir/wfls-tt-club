#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CI 数据校验门禁：
1. data/ 与 wtt_data/ 全部 JSON 可解析
2. score-log 结构与引用完整性：记录必须是对象、胜者/负者成对、球员存在于 players.json、
   无自弈、日期合法且不晚于今天
3. 加分记录（对象/分数 形态）的分数必须可解析为非零数值
4. 赛制校验：显式赛制 ∈ 赛制系数键 ∪ {default}；缺省赛制依赖的「默认赛制」必须覆盖该类型；
   decay-config 的 noDecayTypes ⊆ 已定义类型
5. 比赛类型都在 event-coefficient.json 中有定义
6. 赛季：ISO 日期、start<=end、不重叠、snapshotDates 合法且落在赛季内
7. players.json：uid/姓名唯一、initialScore 为数值、status 枚举
8. draws.json：competitionId 引用有效、卡片 id 唯一、winner 取值合法
9. 赛季覆盖检查：当前日期超出最后一个赛季结束时失败（强制创建新赛季，防止口径漂移）

注：同日 (日期,类型,胜者,负者) 完全重复的记录属正常多次对局（README 有口径说明），不做去重检测。
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
warn_count = 0


def err(msg):
    errors.append(msg)
    print("  [FAIL] " + msg)


def warn(msg):
    global warn_count
    warn_count += 1
    print("  [警告] " + msg)


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
    for dirpath, dirs, files in os.walk(os.path.join(ROOT, sub)):
        dirs[:] = [d for d in dirs if d not in ("__pycache__", "node_modules")]
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
scorelog_raw = load(scorelog_path)
if scorelog_raw is not None and not isinstance(scorelog_raw, list):
    err("data/score-log.json 不是数组")
    scorelog_raw = None
scorelog = [r for r in (scorelog_raw or []) if isinstance(r, dict)]
bad_shape = len(scorelog_raw or []) - len(scorelog)
if bad_shape:
    err(f"{bad_shape} 条 score-log 记录不是对象")
today = date.today().isoformat()
unknown, selfplay, baddate, future, incomplete = set(), 0, 0, 0, 0
for r in scorelog:
    d = r.get("日期")
    if not valid_iso(d):
        baddate += 1
    elif str(d) > today:
        future += 1
    if r.get("胜者"):
        if not r.get("负者"):
            incomplete += 1
        if r["胜者"] not in names:
            unknown.add(r["胜者"])
        if r.get("负者") and r["负者"] not in names:
            unknown.add(r["负者"])
        if r.get("负者") and r["胜者"] == r["负者"]:
            selfplay += 1
    elif r.get("对象") and r["对象"] not in names:
        unknown.add(r["对象"])
if incomplete:
    err(f"{incomplete} 条记录只有胜者没有负者")
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
if not (baddate or future or incomplete):
    ok("日期全部合法且无未来日期")

# ---- 3) 加分记录分数校验 ----
print("[3] 加分记录分数校验")
bonus_bad = 0
for r in scorelog:
    if r.get("胜者") or not r.get("对象"):
        continue
    raw = r.get("分数")
    try:
        val = float(str(raw))
    except (TypeError, ValueError):
        val = 0.0
    if val == 0:
        bonus_bad += 1
if bonus_bad:
    err(f"{bonus_bad} 条加分记录的分数无法解析为非零数值（如 \"+5O\" 会被前端静默吞成 0）")
else:
    ok("加分分数全部可解析且非零")

# ---- 4) 赛制校验 ----
print("[4] 赛制字段与默认赛制覆盖")
coeff = load(os.path.join(ROOT, "data", "event-coefficient.json")) or {}
coeff_types = {k for k, v in (coeff or {}).items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
format_coeffs = coeff.get("赛制系数") if isinstance(coeff, dict) else None
default_formats = coeff.get("默认赛制") if isinstance(coeff, dict) else None
format_keys = {str(k).lower() for k in format_coeffs} if isinstance(format_coeffs, dict) else set()
bad_formats, uncovered_defaults = set(), set()
for r in scorelog:
    if not r.get("胜者"):
        continue
    et = r.get("类型")
    fmt = r.get("赛制")
    if fmt in (None, ""):
        df = (default_formats or {}).get(et) if isinstance(default_formats, dict) else None
        if df is None and et in coeff_types:
            uncovered_defaults.add(et)
        elif df is not None and str(df).lower() not in format_keys and str(df).lower() != "default":
            uncovered_defaults.add(et)
    elif str(fmt).lower() != "default" and str(fmt).lower() not in format_keys:
        bad_formats.add(str(fmt))
if bad_formats:
    err(f"赛制取值不在 赛制系数 键中: {sorted(bad_formats)}（可用: {sorted(format_keys)}）")
else:
    ok("显式赛制取值全部合法")
if uncovered_defaults:
    err(f"以下类型的记录缺省「赛制」，但「默认赛制」未配置或非法（将按倍率 1 静默处理）: {sorted(uncovered_defaults)}")
else:
    ok("缺省赛制的类型均被「默认赛制」覆盖")
decay_cfg = load(os.path.join(ROOT, "data", "decay-config.json")) or {}
no_decay = decay_cfg.get("noDecayTypes") if isinstance(decay_cfg, dict) else None
if isinstance(no_decay, list):
    stray = sorted(set(no_decay) - coeff_types)
    if stray:
        err(f"decay-config.json 的 noDecayTypes 含未定义类型: {stray}")
    else:
        ok("noDecayTypes ⊆ 已定义类型")

# ---- 5) 类型白名单 ----
print("[5] 比赛类型 ∈ event-coefficient.json")
bad_types = sorted({r.get("类型") for r in scorelog if r.get("胜者") and r.get("类型") not in coeff_types})
if bad_types:
    err(f"score-log 中存在未定义系数的类型: {bad_types}")
else:
    ok("比赛类型全部已定义")

# ---- 6) 赛季结构 ----
print("[6] 赛季结构检查")
seasons = load(os.path.join(ROOT, "data", "seasons.json")) or []
if not isinstance(seasons, list):
    err("data/seasons.json 不是数组")
    seasons = []
season_problems = 0
parsed_seasons = []
for s in seasons:
    if not isinstance(s, dict):
        err("seasons.json 存在非对象条目")
        season_problems += 1
        continue
    sid = s.get("id") or "?"
    sd, ed = s.get("startDate"), s.get("endDate")
    if not valid_iso(sd) or not valid_iso(ed):
        err(f"赛季 {sid}: startDate/endDate 不是合法 YYYY-MM-DD（{sd} ~ {ed}）")
        season_problems += 1
        continue
    if str(sd) > str(ed):
        err(f"赛季 {sid}: startDate 晚于 endDate（{sd} ~ {ed}）")
        season_problems += 1
        continue
    snaps = s.get("snapshotDates") or []
    if not isinstance(snaps, list):
        err(f"赛季 {sid}: snapshotDates 不是数组")
        season_problems += 1
        snaps = []
    for d in snaps:
        if not valid_iso(d):
            err(f"赛季 {sid}: snapshotDates 含非法日期 {d!r}")
            season_problems += 1
        elif not (str(sd) <= str(d) <= str(ed)):
            err(f"赛季 {sid}: snapshotDates 日期 {d} 不在赛季范围内（{sd} ~ {ed}）")
            season_problems += 1
    parsed_seasons.append((sid, str(sd), str(ed)))
ordered = sorted(parsed_seasons, key=lambda x: x[1])
for (id1, s1, e1), (id2, s2, e2) in zip(ordered, ordered[1:]):
    if s2 <= e1:
        err(f"赛季重叠: {id1}（{s1} ~ {e1}）与 {id2}（{s2} ~ {e2}）")
        season_problems += 1
    elif (datetime.strptime(s2, "%Y-%m-%d") - datetime.strptime(e1, "%Y-%m-%d")).days > 1:
        warn(f"赛季 {e1} → {s2} 存在 {((datetime.strptime(s2, '%Y-%m-%d') - datetime.strptime(e1, '%Y-%m-%d')).days - 1)} 天空窗（区间内比赛不归任何赛季）")
if not season_problems:
    ok("赛季日期/顺序/snapshotDates 全部合法")

# ---- 7) players.json schema ----
print("[7] players.json 结构检查")
plist = players.get("players")
if not isinstance(plist, list):
    err("players.json 缺少 players 数组")
    plist = []
uids, pnames, dup_uid, dup_name, bad_score, bad_status = set(), set(), 0, 0, 0, 0
STATUS_ENUM = {"active", "alumni"}
for p in plist:
    if not isinstance(p, dict):
        err("players.json 存在非对象条目")
        continue
    uid = p.get("uid")
    if uid in uids:
        dup_uid += 1
    elif uid is not None:
        uids.add(uid)
    nm = p.get("name")
    if nm in pnames:
        dup_name += 1
    elif nm:
        pnames.add(nm)
    sc = p.get("initialScore")
    if sc is not None and not isinstance(sc, (int, float)):
        bad_score += 1
    st = p.get("status")
    if st is not None and st not in STATUS_ENUM:
        bad_status += 1
if dup_uid:
    err(f"players.json 存在 {dup_uid} 个重复 uid")
if dup_name:
    err(f"players.json 存在 {dup_name} 个重复姓名")
if bad_score:
    err(f"players.json 存在 {bad_score} 个非数值 initialScore（会触发前端字符串拼接链）")
if bad_status:
    err(f"players.json 存在未知 status（允许: {sorted(STATUS_ENUM)}）")
if not (dup_uid or dup_name or bad_score or bad_status):
    ok(f"{len(plist)} 名球员 uid/姓名唯一，initialScore 与 status 合法")

# ---- 8) draws.json 引用 ----
print("[8] draws.json 引用检查")
draws = load(os.path.join(ROOT, "data", "draws.json")) or []
comp_dir = os.path.join(ROOT, "data", "competitions")
comp_ids = {d for d in os.listdir(comp_dir) if os.path.isdir(os.path.join(comp_dir, d))} if os.path.isdir(comp_dir) else set()
draw_problems = 0
if not isinstance(draws, list):
    err("data/draws.json 不是数组")
    draws = []
for dr in draws:
    if not isinstance(dr, dict):
        err("draws.json 存在非对象条目")
        draw_problems += 1
        continue
    did = dr.get("id") or "?"
    cid = dr.get("competitionId")
    if cid is not None and cid not in comp_ids:
        err(f"淘汰赛 {did}: competitionId \"{cid}\" 不存在（现有: {sorted(comp_ids)}）")
        draw_problems += 1
    cards = dr.get("cards") or []
    seen_cards = set()
    for c in cards if isinstance(cards, list) else []:
        if not isinstance(c, dict):
            continue
        card_id = c.get("id")
        if card_id in seen_cards:
            err(f"淘汰赛 {did}: 卡片 id 重复（{card_id}）")
            draw_problems += 1
        elif card_id is not None:
            seen_cards.add(card_id)
        w = c.get("winner")
        if w is not None and w not in (0, 1, 2):
            err(f"淘汰赛 {did}: 卡片 {card_id} 的 winner 取值非法（{w!r}，应为 0=平局/1/2/null）")
            draw_problems += 1
if not draw_problems:
    ok(f"{len(draws)} 张淘汰赛布表引用有效")
else:
    err(f"draws.json 共 {draw_problems} 处问题")

# ---- 9) 赛季过期守卫 ----
print("[9] 赛季过期守卫")
if not seasons:
    err("data/seasons.json 为空或缺失")
else:
    last = max(s.get("endDate", "") for s in seasons if isinstance(s, dict))
    if today > last:
        err(f"当前日期 {today} 已超出最后一个赛季结束日 {last} —— 请在 data/seasons.json 创建新赛季，"
            f"否则新比赛将持续计入被延伸的旧赛季且不会触发跨赛季积分继承")
    else:
        ok(f"赛季覆盖至 {last}")

print()
if errors:
    print(f"CI 校验失败：{len(errors)} 项问题" + (f"（另有 {warn_count} 条警告）" if warn_count else ""))
    sys.exit(1)
print("CI 校验全部通过" + (f"（{warn_count} 条警告）" if warn_count else ""))
