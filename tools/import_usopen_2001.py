#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入 2001 US Open (Fort Lauderdale) MS/WS 比赛数据。"""
import json
import os
import re
import importlib.util

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
EVENT_TYPE = "ittf公开赛"
EVENT_YEAR = "2001"

# 复用 Japan Open 脚本的标准名映射（共享球员）
_spec = importlib.util.spec_from_file_location("japan", os.path.join(BASE_DIR, "import_japanopen_2001.py"))
_jp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_jp)

NAME_MAP = dict(_jp.NAME_MAP)
NAME_MAP.update({
    # ===== 中式（华裔代表他国）=====
    "CHIU Wennin": "CHIU Wennin",
    "FAN Yiyong": "FAN Yiyong",
    "GAO Jun": "GAO Jun",
    "GUO Keli": "GUO Keli",
    "HUANG Johnny": "HUANG Johnny",
    "JIA Beibei": "JIA Beibei",
    "LI Qiangbing": "LI Qiangbing",
    "NIU Jianfeng": "NIU Jianfeng",
    "SUNG Virginia": "SUNG Virginia",
    "WANG Chen": "WANG Chen",
    "WANG Tingting": "WANG Tingting",
    "XU Chris": "XU Chris",
    "YANG Simone": "YANG Simone",
    "YU Fu": "YU Fu",
    "ZHANG Yining": "ZHANG Yining",
    "ZHUANG David": "ZHUANG David",
    # ===== 韩国 =====
    "KIM Seung Hun": "KIM Seung Hun",
    "KIM Soongsil": "KIM Soongsil",
    "SHIN Soohee": "SHIN Soohee",
    # ===== 印度 =====
    "BABOOR Chetan": "Chetan BABOOR",
    "DAS Mouma": "Mouma DAS",
    "GHATAK Poulomi": "Poulomi GHATAK",
    "GHOSH Mantu": "Mantu GHOSH",
    "INDU Nagapattinam R": "Indu NAGAPATTINAM R",
    "ROY Soumyadeep": "Soumyadeep ROY",
    "SAHA Subhajit": "Subhajit SAHA",
    "SUBRAMANYAM Raman": "Raman SUBRAMANYAM",
    # ===== 乌干达/尼日利亚 =====
    "EKUN Abas": "Abas EKUN",
    "KYAKOBYE June": "June KYAKOBYE",
    "MUSUBIIRE Sylas": "Sylas MUSUBIIRE",
    "OMODING Julius": "Julius OMODING",
    "OYEBODE Michael": "Michael OYEBODE",
    "SENYONDO Mildred": "Mildred SENYONDO",
    # ===== 拉丁美洲 =====
    "ALVAREZ Ruth": "Ruth ALVAREZ",
    "FLORES Omar": "Omar FLORES",
    "GIANNINI Antonio": "Antonio GIANNINI",
    "GUANCHEZ Mariana": "Mariana GUANCHEZ",
    "HERRERA Jorge": "Jorge HERRERA",
    "HOYAMA Hugo": "Hugo HOYAMA",
    "MOSELEY Kibibi": "Kibibi MOSELEY",
    "MUJICA Henry": "Henry MUJICA",
    "OVIEDO Alejandro": "Alejandro OVIEDO",
    "PEREZ Luisana": "Luisana PEREZ",
    "RAMOS Fabiola": "Fabiola RAMOS",
    "RONDON Ely": "Ely RONDON",
    "VENTURA DOS ANJOS Bruno": "Bruno VENTURA DOS ANJOS",
    "WER Estuardo": "Estuardo WER",
    # ===== 美国/加拿大/欧洲 =====
    "ALBAN Keith": "Keith ALBAN",
    "BANH THUA Tawny": "Tawny BANH THUA",
    "BISPHAM Anson": "Anson BISPHAM",
    "BOSIKA Mimi": "Mimi BOSIKA",
    "BUTLER Jimmy": "Jimmy BUTLER",
    "CADA Petra": "Petra CADA",
    "CRETU Razvan": "Razvan CRETU",
    "GABRIEL Santiago": "Santiago GABRIEL",
    "HAZINSKI Mark": "Mark HAZINSKI",
    "HERBERT Gareth": "Gareth HERBERT",
    "JAIN Ashoo": "Ashoo JAIN",
    "KASSAM Faazil": "Faazil KASSAM",
    "LAGOGIANNIS Konstantinos": "Konstantinos LAGOGIANNIS",
    "LUPULESKU Ilija": "Ilija LUPULESKU",
    "OWENS Eric": "Eric OWENS",
    "PACE Brian": "Brian PACE",
    "PETER-PAUL Pradeeban": "Pradeeban PETER-PAUL",
    "RATHER Jasna": "Jasna RATHER",
    "ROUFEH Mahin": "Mahin ROUFEH",
    "ROUSSY Marie-Christine": "Marie-Christine ROUSSY",
})


# 赛段 -> 日期 (04-08 Jul 2001, 合理分配)
def match_date(stage, round_):
    if stage == "Qualification":
        return "2001-07-04"
    # Main Draw
    if round_ in ("R64", "R32"):
        return "2001-07-05"
    if round_ in ("R16", "QuarterFinal"):
        return "2001-07-06"
    if round_ == "SemiFinal":
        return "2001-07-07"
    if round_ == "Final":
        return "2001-07-08"
    return "2001-07-05"


def parse_split():
    rawfile = os.path.join(BASE_DIR, "_usopen2001_raw.txt")
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
    print("US Open Fort Lauderdale 2001")
    ms_records, ws_records, missing = parse_split()
    print(f"  MS: {len(ms_records)}  WS: {len(ws_records)}")
    if missing:
        print("  [missing]")
        for m in sorted(set(missing)):
            print("    ", m)
    append_to_scorelog("ms", ms_records)
    append_to_scorelog("ws", ws_records)