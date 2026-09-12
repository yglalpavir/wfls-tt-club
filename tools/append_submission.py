#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""解析 GitHub issue 正文中的比赛记录提交，追加进 data/score-log.json。

由 .github/workflows/submission-review.yml 在 issue 被打上「审核通过」标签时调用，
也可本地手动测试：python tools/append_submission.py <issue-body.md>

流程：
1. 从正文提取 ```json 围栏代码块，解析为记录（数组或单个对象）
2. 校验（口径与 tools/ci_validate.py 一致）：
   - 日期合法且不晚于今天
   - 比赛记录：胜者/负者成对、不自弈、姓名已登记（别名自动规范化为正式姓名）、
     类型 ∈ event-coefficient.json、显式赛制合法
   - 加分记录：对象已登记、分数可解析为非零数值（规范化为带符号字符串）
   - 可选比分：总比分「x-y」（胜者局数在前）与逐局分数互相自洽且与赛制吻合
   - 只接受已知字段（日期/类型/赛制/胜者/负者/对象/分数/比分/局分）
3. 通过后追加到 data/score-log.json 末尾（2 空格缩进、UTF-8、末尾换行）

同日 (日期,类型,胜者,负者) 完全重复属正常多次对局，不做去重（README 有口径说明）。
退出码：0 成功；1 解析/校验失败（错误详情已打印，供工作流原样评论到 issue）。
"""
import json
import os
import re
import sys
from datetime import date, datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCORE_LOG = os.path.join(ROOT, "data", "score-log.json")
PLAYERS = os.path.join(ROOT, "data", "players.json")
COEFF = os.path.join(ROOT, "data", "event-coefficient.json")

ALLOWED_KEYS = {"日期", "类型", "赛制", "胜者", "负者", "对象", "分数", "比分", "局分"}
WINS_NEEDED = {"bo3": 2, "bo5": 3, "bo7": 4}
FENCE_RE = re.compile(r"```(?:json|JSON)\s*\n(.*?)```", re.DOTALL)
TOTAL_SCORE_RE = re.compile(r"^(\d{1,2})\s*[-:：]\s*(\d{1,2})$")
GAME_SCORE_RE = re.compile(r"^(\d{1,2})\s*[-:：]\s*(\d{1,2})$")


def fail(msg):
    print("[FAIL] " + msg)


def info(msg):
    print("[OK] " + msg)


def load_json(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def valid_iso(d):
    try:
        datetime.strptime(str(d), "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def extract_records(body):
    """从 issue 正文提取比赛记录 JSON，返回记录列表。

    依次尝试：```json 围栏 → issue 表单「比赛记录 JSON」段落的裸 JSON → 整段正文。
    """
    candidates = list(FENCE_RE.findall(body))
    section = re.search(
        r"#{2,4}\s*比赛记录\s*JSON[^\n]*\n(.*?)(?=\n-{3,}\s*\n|\n#{2,4}\s|\Z)", body, re.DOTALL
    )
    if section:
        candidates.append(section.group(1))
    candidates.append(body)
    usable = [c for c in (c.strip() for c in candidates) if c.startswith(("[", "{"))]
    if not usable:
        fail("正文中没有找到比赛记录 JSON。请保留「比赛记录 JSON」字段自动填入的内容（```json [...] ``` 围栏或裸 JSON 数组均可）。")
        return None
    for idx, block in enumerate(usable):
        try:
            data = json.loads(block)
        except ValueError as e:
            fail(f"第 {idx + 1} 处 JSON 解析失败：{e}")
            continue
        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list) or not data:
            fail(f"第 {idx + 1} 处 JSON 应为非空的记录数组或对象")
            continue
        if not all(isinstance(r, dict) for r in data):
            fail("记录数组中存在非对象条目")
            continue
        return data
    return None


def normalize_score(raw):
    """加分分数规范化为带符号字符串，如 '+50' / '-30'。"""
    val = float(str(raw))
    text = format(val, "g")
    return text if text.startswith("-") else "+" + text


def load_context():
    """加载校验上下文：选手姓名集/别名映射、类型白名单、赛制键、默认赛制。供本脚本与 import_submissions_csv.py 复用。"""
    players = load_json(PLAYERS) or {}
    names, alias_map = set(), {}
    for p in players.get("players", []):
        nm = p.get("name")
        if not nm:
            continue
        names.add(nm)
        for a in p.get("aliases") or []:
            alias_map[a] = nm

    coeff = load_json(COEFF) or {}
    coeff_types = {k for k, v in coeff.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
    format_coeffs = coeff.get("赛制系数") if isinstance(coeff, dict) else None
    format_keys = {str(k).lower() for k in format_coeffs} if isinstance(format_coeffs, dict) else set()
    default_formats = coeff.get("默认赛制") if isinstance(coeff.get("默认赛制"), dict) else {}
    return names, alias_map, coeff_types, format_keys, default_formats


def append_to_score_log(records):
    """追加记录到 data/score-log.json（2 空格缩进、UTF-8、末尾换行），返回追加后总条数。"""
    with open(SCORE_LOG, encoding="utf-8-sig") as f:
        log = json.load(f)
    log.extend(records)
    with open(SCORE_LOG, "w", encoding="utf-8", newline="\n") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return len(log)


def alias_map_canonical(raw, alias_map):
    """输入姓名规范化：按别名表映射为正式姓名，未登记则原样返回（去首尾空白）。"""
    name = str(raw or "").strip()
    return alias_map.get(name, name)


def validate_match(rec, today, names, alias_map, coeff_types, format_keys, default_formats):
    errs, out = [], {}
    for key in rec:
        if key not in ALLOWED_KEYS:
            errs.append(f"未知字段「{key}」（允许：{sorted(ALLOWED_KEYS)}）")

    d = rec.get("日期")
    if not valid_iso(d):
        errs.append(f"日期 {d!r} 不是合法 YYYY-MM-DD")
    elif str(d) > today:
        errs.append(f"日期 {d} 在未来")
    else:
        out["日期"] = d

    et = rec.get("类型")
    if et not in coeff_types:
        errs.append(f"类型 {et!r} 不在 event-coefficient.json 白名单中（可用：{sorted(coeff_types)}）")
    else:
        out["类型"] = et

    fmt = rec.get("赛制")
    fmt_l = str(fmt).lower() if fmt not in (None, "") else None
    if fmt_l is not None and fmt_l != "default" and fmt_l not in format_keys:
        errs.append(f"赛制 {fmt!r} 不合法（可用：default / {sorted(format_keys)}）")
    elif fmt_l is not None:
        out["赛制"] = fmt_l
    else:
        out["赛制"] = "default"

    for side in ("胜者", "负者"):
        raw_name = rec.get(side)
        if not raw_name:
            errs.append(f"缺少「{side}」")
            continue
        name = alias_map.get(str(raw_name).strip(), str(raw_name).strip())
        if name not in names:
            errs.append(f"{side}「{raw_name}」未在 players.json 登记（含别名）")
        else:
            out[side] = name
    if out.get("胜者") and out.get("负者") and out["胜者"] == out["负者"]:
        errs.append(f"胜者与负者相同（{out['胜者']}）")

    # 赛制确定后即可知道胜方需要拿几局
    eff_fmt = fmt_l if (fmt_l and fmt_l != "default") else (default_formats or {}).get(et)
    eff_fmt = str(eff_fmt).lower() if eff_fmt else None
    needed = WINS_NEEDED.get(eff_fmt)

    total = rec.get("比分")
    games = rec.get("局分")
    w = l = None
    if total is not None:
        m = TOTAL_SCORE_RE.match(str(total).strip())
        if not m:
            errs.append(f"总比分 {total!r} 格式应为「胜者局数-负者局数」，如 3-1")
        else:
            w, l = int(m.group(1)), int(m.group(2))
            if w <= l:
                errs.append(f"总比分 {w}-{l}：胜者局数必须大于负者局数（胜者在前的口径）")
            elif w > 4:
                errs.append(f"总比分 {w}-{l}：单打最多 bo7（胜方最多 4 局）")
            elif needed is not None and w != needed:
                errs.append(f"总比分 {w}-{l} 与赛制 {eff_fmt} 不符（{eff_fmt} 需胜 {needed} 局）")
            else:
                out["比分"] = f"{w}-{l}"

    if games is not None:
        if not isinstance(games, list) or not games:
            errs.append("「局分」应为逐局比分数组，如 [\"11-9\", \"8-11\", \"11-7\"]")
        else:
            parsed, bad, wins_left = [], [], 0
            for g in games:
                m = GAME_SCORE_RE.match(str(g).strip())
                if not m:
                    bad.append(str(g))
                    continue
                a, b = int(m.group(1)), int(m.group(2))
                if a == b:
                    bad.append(str(g))
                    continue
                wins_left += 1 if a > b else 0
                parsed.append(f"{a}-{b}")
            if bad:
                errs.append(f"局分中存在非法条目（格式应为「11-9」，且无平局）：{bad}")
            elif w is not None:
                if wins_left != w or len(parsed) != w + l:
                    errs.append(f"局分 {parsed} 与总比分 {w}-{l} 不自洽（应共 {w + l} 局、胜方赢 {w} 局）")
                else:
                    out["局分"] = parsed
            else:
                if wins_left <= len(parsed) - wins_left:
                    errs.append(f"局分 {parsed} 推不出胜方（按胜者视角记分，胜方赢的局须更多）")
                else:
                    out["比分"] = f"{wins_left}-{len(parsed) - wins_left}"
                    out["局分"] = parsed
    return errs, out


def validate_bonus(rec, today, names, alias_map):
    errs, out = [], {}
    for key in rec:
        if key not in ALLOWED_KEYS:
            errs.append(f"未知字段「{key}」（允许：{sorted(ALLOWED_KEYS)}）")

    d = rec.get("日期")
    if not valid_iso(d):
        errs.append(f"日期 {d!r} 不是合法 YYYY-MM-DD")
    elif str(d) > today:
        errs.append(f"日期 {d} 在未来")
    else:
        out["日期"] = d
    out["类型"] = "比赛结果加分"

    raw_name = rec.get("对象")
    if not raw_name:
        errs.append("缺少「对象」")
    else:
        name = alias_map.get(str(raw_name).strip(), str(raw_name).strip())
        if name not in names:
            errs.append(f"对象「{raw_name}」未在 players.json 登记（含别名）")
        else:
            out["对象"] = name

    raw = rec.get("分数")
    if raw is None or str(raw).strip() == "":
        errs.append("缺少「分数」")
    else:
        try:
            val = float(str(raw))
            if val == 0:
                errs.append(f"分数 {raw!r} 解析后为 0（非零数值才有效）")
            else:
                out["分数"] = normalize_score(raw)
        except ValueError:
            errs.append(f"分数 {raw!r} 无法解析为数值")
    return errs, out


def main():
    if len(sys.argv) < 2:
        print("用法: python tools/append_submission.py <issue-body.md>")
        return 1
    body_path = sys.argv[1]
    with open(body_path, encoding="utf-8-sig") as f:
        body = f.read()

    names, alias_map, coeff_types, format_keys, default_formats = load_context()

    records = extract_records(body)
    if records is None:
        return 1

    today = date.today().isoformat()
    normalized, all_errs = [], []
    for i, rec in enumerate(records, 1):
        if rec.get("胜者") or rec.get("负者"):
            errs, out = validate_match(rec, today, names, alias_map, coeff_types, format_keys, default_formats)
            desc = f"{out.get('日期')} {out.get('类型')}·{out.get('赛制')} {out.get('胜者')} 胜 {out.get('负者')}" if not errs else ""
        elif rec.get("对象") or rec.get("类型") == "比赛结果加分":
            errs, out = validate_bonus(rec, today, names, alias_map)
            desc = f"{out.get('日期')} 调整 {out.get('对象')} {out.get('分数')}" if not errs else ""
        else:
            errs = ["记录既不是比赛（无胜者/负者）也不是加分调整（无对象）"]
            out, desc = {}, ""
        if errs:
            all_errs.extend(f"第 {i} 条记录：" + e for e in errs)
        else:
            normalized.append(out)
            info(f"第 {i} 条通过：{desc}")

    if all_errs:
        print()
        for e in all_errs:
            fail(e)
        return 1

    total = append_to_score_log(normalized)
    print()
    info(f"已追加 {len(normalized)} 条记录到 data/score-log.json（现共 {total} 条）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
