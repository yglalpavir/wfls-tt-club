#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tリーグ(卓球Tリーグ) 2026-2027 赛季 -> WTT score-log 数据录入脚本。

读取 tools/tleague_data/ 下已抓取的赛果页面（字段与 import_tleague_scrape.py
保持一致），解析每场对阵，按性别与单双打分别合并进 wtt_data：

    - 男子单打  -> wtt_data/ms/score-log-<year>-wtt.json  （类型「T联赛」）
    - 女子单打  -> wtt_data/ws/score-log-<year>-ws.json
    - 男子双打  -> wtt_data/md/score-log-<year>-wtt.json
    - 女子双打  -> wtt_data/wd/score-log-<year>-wtt.json

另外，若某女子双打记录此前被误放在 md 中（与本次解析结果一致），会自动从 md
移除并归位到 wd，从而只处理 2026-2027 新赛季范围内的数据，不触碰历史年份。

姓名规范化遵循 wtt_data/player-name-format.md：
    - 日籍等 -> 名 姓（姓全大写）：Sho SONE / Kazuhiro YOSHIMURA
    - 中文（含台湾）-> 姓 名：LIN Yun-Ju / PARK Ganghyeon
    双打按页面展示顺序组合为 «A/B»。

用法：
    python tools/import_tleague_scorelog.py            # 解析并合并（幂等）
    python tools/import_tleague_scorelog.py --check    # 只报告将发生的变更，不写盘
"""

import argparse
import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
WTT_DIR = ROOT_DIR / "wtt_data"
TLEAGUE_DIR = BASE_DIR / "tleague_data"

EVENT_TYPE = "T联赛"

FILE_NAME = {
    "ms": "score-log-{year}-wtt.json",
    "ws": "score-log-{year}-ws.json",
    "md": "score-log-{year}-wtt.json",
    "wd": "score-log-{year}-wtt.json",
}

WOMEN_TOKENS = (
    "アビエル", "神奈川", "トップおとめ", "おとめ", "ピンポンズ",
    "日本生命", "レッド", "エルフ", "日本ペイント", "マレッツ",
    "カグヤ", "九州", "カリーナ", "名古屋", "京都",
)

NAME_MAP = {
    # 男子（T.T彩たま / 木下マイスター東京，2026-07-25 场）
    "丹羽 孝希": "Koki NIWA",
    "吉村 和弘": "Kazuhiro YOSHIMURA",
    "有延 大夢": "Taimu ARINOBU",
    "リン ユンジュ": "LIN Yun-Ju",
    "パク ガンヒョン": "PARK Ganghyeon",
    "曽根 翔": "Sho SONE",
    "酒井 明日翔": "Asuka SAKAI",
    "木造 勇人": "Yuto KIZUKURI",
    # 女子（木下アビエル神奈川 / トップおとめピンポンズ名古屋，2026-07-25 场）
    "ユ ハンナ": "YOO Hanna",
    "チェン イーチン": "CHENG I-Ching",
    "永尾 尭子": "Akiko NAGAO",
    "南波 侑里香": "Yurika NANBA",
    "張本 美和": "Miwa HARIMOTO",
    "木村 香純": "Kasumi KIMURA",
    "岡田 琴菜": "Kotona OKADA",
    "木原 美悠": "Miyuu KIHARA",
    "小塩 遥菜": "Haruna KOISHIO",
}


def load_extra_name_map():
    """从 wtt_data/ms/tleague_player.json 载入更多男子名单作为补充。"""
    path = WTT_DIR / "ms" / "tleague_player.json"
    if not path.exists():
        return {}
    pool = {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    for value in data.values():
        if isinstance(value, dict):
            for jp, rom in value.items():
                pool.setdefault(jp, rom)
    pool["曽根 翔"] = "Sho SONE"  # 与既有 score-log 数据命名对齐
    return pool


def unify_name_map():
    merged = load_extra_name_map()
    merged.update(NAME_MAP)  # 显式条目优先
    return merged


def extract_date_venue_teams(lines):
    """返回 (date, venue, (team_a, team_b), team_total_indexes)。

    在 "日期行 .. 審判行" 区段内扫描队伍总分（独立整数行，仅两处；
    局分行均形如 «x - y»，游戏明细位于 審判 之后，不影响定位）。
    """
    date = date_i = None
    for i, ln in enumerate(lines):
        if re.match(r"^20\d\d\u5e74\d+月\d+日", ln):
            m = re.search(r"(20\d\d)\u5e74(\d+)月(\d+)日", ln)
            date = "%s-%02d-%02d" % (m.group(1), int(m.group(2)), int(m.group(3)))
            date_i = i
            break
    if date is None:
        return None
    judge_i = None
    for i in range(date_i + 1, len(lines)):
        if "審判" in lines[i]:
            judge_i = i
            break
    end_i = judge_i if judge_i is not None else len(lines)

    totals = []
    for i in range(date_i + 1, end_i):
        if re.fullmatch(r"\d{1,3}", lines[i]):
            totals.append(i)
    if len(totals) < 2:
        return None
    team_a = lines[totals[0] - 1]
    team_b = lines[totals[1] - 1]
    venue = ""
    for j in range(totals[0] - 2, date_i, -1):
        if lines[j].strip():
            venue = lines[j]
            break
    return date, venue, (team_a, team_b), totals


def parse_scoreboard(raw_text):
    """解析含赛果的页面 -> (date, teams, matchups, page_id)。

    matchups: [(a_names, (a_sets, b_sets), b_names), ...]
    每页第 1 场始终为双打（4 名选手），其余为单打（2 名选手）。
    返回 None 表示该页无赛果（仅赛程）。
    """
    lines = [x.strip() for x in raw_text.split("\n")]
    meta = extract_date_venue_teams(lines)
    if meta is None:
        return None
    date, venue, teams, totals = meta

    # 对阵区 = 队A总分行 之后 至 队B名行之前（队B名行 = totals[1]-1）
    seg = [ln for ln in lines[totals[0] + 1 : totals[1] - 1] if ln != "WIN"]

    score_lines = [i for i, ln in enumerate(seg) if re.fullmatch(r"\d+\s*-\s*\d+", ln)]
    if not score_lines:
        return None
    n = len(score_lines)  # 对阵场次
    name_counts = [4] + [2] * (n - 1)  # 第 1 场双打，其余单打

    matchups = []
    pos = 0
    for k, _cnt in enumerate(name_counts):
        a_cnt = 2 if k == 0 else 1
        b_cnt = 2 if k == 0 else 1
        if pos + a_cnt + 1 + b_cnt > len(seg):
            return None
        a_names = seg[pos:pos + a_cnt]
        pos += a_cnt
        m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", seg[pos])
        if not m:
            return None
        a_sets, b_sets = int(m.group(1)), int(m.group(2))
        pos += 1
        b_names = seg[pos:pos + b_cnt]
        pos += b_cnt
        matchups.append((a_names, (a_sets, b_sets), b_names))

    if pos != len(seg):
        return None
    return date, venue, teams, matchups


def is_women_match(teams):
    hits = [t for t in teams if any(tk in t for tk in WOMEN_TOKENS)]
    if len(hits) == 1:
        raise ValueError(f"无法判定性别归属: {teams}")
    return len(hits) == 2


def build_records(parse, name_map):
    """把解析结果转成 [(category, year, date, winner, loser, preview), ...]。"""
    date, _venue, teams, matchups = parse
    women = is_women_match(teams)
    records = []
    for k, (a_names, (a_sets, b_sets), b_names) in enumerate(matchups):
        is_doubles = k == 0
        side_a = "/".join(name_map[n] for n in a_names)
        side_b = "/".join(name_map[n] for n in b_names)
        if a_sets > b_sets:
            winner, loser = side_a, side_b
        elif b_sets > a_sets:
            winner, loser = side_b, side_a
        else:
            raise ValueError(f"{date} 对阵局分相等，无法判定胜负")
        cat = "wd" if (is_doubles and women) else \
              "md" if (is_doubles and not women) else \
              "ws" if women else "ms"
        records.append((cat, date[:4], date, winner, loser,
                        "双打" if is_doubles else "单打"))
    return records


def load_scorelog(category, year):
    path = WTT_DIR / category / FILE_NAME[category].format(year=year)
    if not path.exists():
        return [], path
    with open(path, encoding="utf-8") as f:
        return json.load(f), path


def write_scorelog(category, year, records):
    path = WTT_DIR / category / FILE_NAME[category].format(year=year)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  {category.upper()} {year}: 共 {len(records)} 条 -> {path.name}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--season", default="2026-2027", help="赛季标签，仅用于提示")
    ap.add_argument("--min-date", default="2026-07-01",
                    help="只处理该日期起（含）的赛果，默认 2026-07-01")
    ap.add_argument("--check", action="store_true", help="只报告变更，不写盘")
    args = ap.parse_args()

    print("=" * 60)
    print(f"Tリーグ {args.season} -> WTT score-log 录入"
          f"（{'CHECK' if args.check else '执行'}）")
    print("=" * 60)

    name_map = unify_name_map()
    parsed_pages = []
    for path in sorted(TLEAGUE_DIR.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        parse = parse_scoreboard(raw.get("raw_text", ""))
        if parse is None:
            continue
        if parse[0] < args.min_date:
            continue
        try:
            recs = build_records(parse, name_map)
        except (KeyError, ValueError) as exc:
            print(f"  提示: id={raw.get('id')} 日期={parse[0]} 未处理 -> {exc}")
            continue
        parsed_pages.append((str(raw.get("id")), parse, recs))

    additions = {c: [] for c in ("ms", "ws", "md", "wd")}
    for pid, parse, recs in parsed_pages:
        date = parse[0]
        teams = parse[2]
        print(f"  [{pid}] {date} {'/'.join(teams)}"
              f" -> {'女' if is_women_match(teams) else '男'} 共 {len(recs)} 场")
        for cat, year, d, winner, loser, kind in recs:
            additions[cat].append((year, d, winner, loser))
            print(f"      {cat.upper()} {year}: {kind} "
                  f"{winner} 胜 {loser}")

    grand_total = 0
    for cat in ("ms", "ws", "md", "wd"):
        by_year = {}
        for year, d, winner, loser in additions[cat]:
            by_year.setdefault(year, []).append((d, winner, loser))
        for year in sorted(by_year):
            records, path = load_scorelog(cat, year)
            keyset = {(r["日期"], r["类型"], r["胜者"], r["负者"]) for r in records}
            added = 0
            for d, winner, loser in by_year[year]:
                key = (d, EVENT_TYPE, winner, loser)
                if key in keyset:
                    continue
                if not args.check:
                    records.append(
                        {"日期": d, "类型": EVENT_TYPE,
                         "胜者": winner, "负者": loser})
                    keyset.add(key)
                added += 1
            if not args.check and added:
                write_scorelog(cat, year, records)
            grand_total += added
            if added:
                print(f"  {cat.upper()} {year}: +{added} 条"
                      f"（已存在自动跳过）")

    # 女子双打误放 md 的移正：只针对本届解析所得比分（范围受限->安全性）
    md_removed = 0
    for year, d, winner, loser in additions["wd"]:
        md_records, md_path = load_scorelog("md", year)
        target = {"日期": d, "类型": EVENT_TYPE,
                  "胜者": winner, "负者": loser}
        if target in md_records:
            if not args.check:
                write_scorelog("md", year,
                               [r for r in md_records if r != target])
            md_removed += 1
            print(f"  MD {year}: -1 条（女子双打归位 wd: "
                  f"{winner} 胜 {loser}）")

    print(f"\n  新增合计: {grand_total}；md 移正: {md_removed} 条")
    if args.check:
        print("  [--check] 以上为将发生的变更，尚未写盘。")
    else:
        print("  已完成。具体赛果挂在 wtt_data 各分类下，无需改 manifest。")


if __name__ == "__main__":
    main()