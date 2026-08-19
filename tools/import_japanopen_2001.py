#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入 2001 Japan Open (Yokohama) MS/WS 比赛数据。"""
import json
import os
import re
import importlib.util

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
EVENT_TYPE = "ittf公开赛"
EVENT_YEAR = "2001"

# 复用 Bayreuth 脚本的标准名映射（共享球员）
_spec = importlib.util.spec_from_file_location("bayreuth", os.path.join(BASE_DIR, "import_bayreuth_2001.py"))
_bay = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bay)

NAME_MAP = dict(_bay.NAME_MAP)
NAME_MAP.update({
    # ===== 中式（中国大陆/台湾/香港/新加坡）=====
    "CHANG Yen-Shu": "CHANG Yen-Shu",
    "CHIANG Peng-Lung": "CHIANG Peng-Lung",
    "HUANG Yi-Hua": "HUANG Yi-Hua",
    "LIN Ling": "LIN Ling",
    "PAN Chun-Chu": "PAN Chun-Chu",
    "WANG Nan": "WANG Nan",
    "YANG Meng-Hsing": "YANG Meng-Hsing",
    "ZHAN Jian": "ZHAN Jian",
    "ZHANG Chao": "ZHANG Chao",
    "ZHANG Rui": "ZHANG Rui",
    # ===== 韩国 =====
    "KWON Hyunjoo": "KWON Hyunjoo",
    "LIM Jaehyun": "LIM Jaehyun",
    "PARK Kyungae (II)": "PARK Kyungae",
    "SUK Eunmi": "SUK Eunmi",
    "SUK Solji": "SUK Solji",
    "YANG Heesuk": "YANG Heesuk",
    # ===== 日本 =====
    "FUKUHARA Ai": "Ai FUKUHARA",
    "HIRANO Sayaka": "Sayaka HIRANO",
    "IMAFUKU Kumi": "Kumi IMAFUKU",
    "ISEKI Seiko": "Seiko ISEKI",
    "ITO Midori": "Midori ITO",
    "KAWAMURA Tomoe": "Tomoe KAWAMURA",
    "KIHO Shinnosuke": "Shinnosuke KIHO",
    "KISHI Mayu": "Mayu KISHI",
    "KURASHIMA Yosuke": "Yosuke KURASHIMA",
    "MATSUSHITA Koji": "Koji MATSUSHITA",
    "NISHII Miyuki": "Miyuki NISHII",
    "OKAZAKI Keiko": "Keiko OKAZAKI",
    "OMORI Takahiro": "Takahiro OMORI",
    "TAKAKIWA Kenichi": "Kenichi TAKAKIWA",
    "TAKEDA Akiko": "Akiko TAKEDA",
    "UMEMURA Aya": "Aya UMEMURA",
    "YUZAWA Ryo": "Ryo YUZAWA",
})


# 赛段 -> 日期 (21-24 Sep 2001, 合理分配)
def match_date(stage, round_):
    if stage == "Qualification":
        return "2001-09-21"
    # Main Draw
    if round_ in ("R64", "R32"):
        return "2001-09-22"
    if round_ in ("R16", "QuarterFinal"):
        return "2001-09-23"
    if round_ in ("SemiFinal", "Final"):
        return "2001-09-24"
    return "2001-09-22"


def parse_split():
    rawfile = os.path.join(BASE_DIR, "_japanopen2001_raw.txt")
    ms_, ws_ = [], []
    missing = []
    with open(rawfile, "r", encoding="utf-8-sig") as f:
        raw_lines = [l.rstrip("\n") for l in f]
    lines = []
    i = 0
    while i < len(raw_lines):
        l = raw_lines[i].strip()
        if not l:
            i += 1
            continue
        cols = [c.strip() for c in l.split("\t")]
        if cols and cols[-1] in ("MS", "WS") and len(cols) < 8 and i + 1 < len(raw_lines):
            nxt = raw_lines[i + 1].strip()
            if nxt:
                lines.append(l + "\t" + nxt)
                i += 2
                continue
        lines.append(l)
        i += 1

    for line in lines:
        cols = [c.strip() for c in line.split("\t")]
        if len(cols) < 10 or cols[0] != "2001":
            continue
        subevent = cols[6]
        stage = cols[7]
        round_ = cols[8]
        winner_raw = cols[11] if len(cols) > 11 else ""

        def extract_name(raw):
            m = re.match(r"^(.*?) \(([A-Z]{3})\)$", raw)
            return m.group(1) if m else raw

        pa = extract_name(cols[2])
        pb = extract_name(cols[4])
        pw = extract_name(winner_raw)
        na, nb, nw = NAME_MAP.get(pa), NAME_MAP.get(pb), NAME_MAP.get(pw)
        if not (na and nb and nw):
            for label, raw in (("A", cols[2]), ("B", cols[4]), ("W", winner_raw)):
                if raw not in NAME_MAP:
                    missing.append(f"{label}:{raw}")
            continue
        if nw == na:
            w, l = na, nb
        elif nw == nb:
            w, l = nb, na
        else:
            missing.append(f"WINNER-MISMATCH: {cols[2]} vs {cols[4]} -> {winner_raw}")
            continue
        rec = (match_date(stage, round_), EVENT_TYPE, w, l)
        if subevent == "MS":
            ms_.append(rec)
        elif subevent == "WS":
            ws_.append(rec)
    return ms_, ws_, missing


def append_to_scorelog(category, records):
    if category == "ws":
        filename = f"score-log-{EVENT_YEAR}-ws.json"
    else:
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    filepath = os.path.join(WTT_DIR, category, filename)
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8-sig") as f:
            existing = json.load(f)
    else:
        existing = []
    existing_keys = set((r["日期"], r["类型"], r["胜者"], r["负者"]) for r in existing)
    new_records = []
    for date, etype, winner, loser in records:
        key = (date, etype, winner, loser)
        if key not in existing_keys:
            new_records.append({"日期": date, "类型": etype, "胜者": winner, "负者": loser})
            existing_keys.add(key)
    all_records = existing + new_records
    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  {category.upper()}: {len(new_records)} new (total: {len(all_records)})")
    return len(new_records)


if __name__ == "__main__":
    print("Japan Open Yokohama 2001")
    ms_records, ws_records, missing = parse_split()
    print(f"  MS: {len(ms_records)}  WS: {len(ws_records)}")
    if missing:
        print("  [missing]")
        for m in sorted(set(missing)):
            print("    ", m)
    append_to_scorelog("ms", ms_records)
    append_to_scorelog("ws", ws_records)