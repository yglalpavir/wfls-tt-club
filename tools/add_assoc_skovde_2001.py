#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为 2001 Swedish Open (Skovde) / German Open (Bayreuth) 球员补充 assoc.json 协会籍记录。"""
import json
import os
import re
import importlib.util

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")

# 复用导入脚本的 NAME_MAP（标准名）
def _load_import_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(BASE_DIR, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

NAME_MAP = {}
for _mname, _fname in (("skovde", "import_skovde_2001.py"), ("bayreuth", "import_bayreuth_2001.py")):
    _mod = _load_import_module(_mname, _fname)
    NAME_MAP.update(_mod.NAME_MAP)

# 国家代码 -> 全称（与现有 assoc.json 惯例一致）
COUNTRY_MAP = {
    "AUS": "Australia", "AUT": "Austria", "ARG": "Argentina", "BEL": "Belgium",
    "BIH": "Bosnia and Herzegovina", "BLR": "Belarus", "BRA": "Brazil", "CAN": "Canada",
    "CHI": "Chile", "CHN": "China", "CRO": "Croatia", "CZE": "Czechia",
    "DEN": "Denmark", "EGY": "Egypt", "ENG": "England", "ESP": "Spain", "FRA": "France",
    "GER": "Germany", "GRE": "Greece", "HKG": "Hong Kong, China", "HUN": "Hungary",
    "ITA": "Italy", "JOR": "Jordan", "JPN": "Japan",
    "KOR": "Korea Republic", "LIE": "Liechtenstein", "LTU": "Lithuania", "LUX": "Luxembourg",
    "NED": "Netherlands", "NOR": "Norway", "NZL": "New Zealand", "POL": "Poland", "PRK": "Korea DPR",
    "ROU": "Romania", "RUS": "Russia", "SGP": "Singapore", "SLO": "Slovenia",
    "SRB": "Serbia", "SUI": "Switzerland", "SVK": "Slovak Republic",
    "SWE": "Sweden", "TPE": "Chinese Taipei", "TUR": "Turkiye", "USA": "USA", "WAL": "Wales",
}


def extract_players(rawfile, cat=None):
    """原始文件: 原始名(去国家) -> 国家代码集合（兼容断行/缺列）。
    cat 指定 'ms'/'ws' 时仅提取对应子项目的球员。"""
    players = {}
    with open(rawfile, encoding="utf-8-sig") as f:
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
        if len(cols) < 7:
            continue
        if cat and cols[6] != cat.upper():
            continue
        for raw in (cols[2], cols[4]):
            m = re.match(r"^(.*?) \(([A-Z]{3})\)$", raw)
            if m:
                players.setdefault(m.group(1), set()).add(m.group(2))
    return players


def identity(name):
    return " ".join(sorted(re.sub(r"[^A-Z0-9]", "", t) for t in name.upper().split() if re.sub(r"[^A-Z0-9]", "", t)))


def add_to_assoc(cat, rawfile):
    filepath = os.path.join(WTT_DIR, cat, "assoc.json")
    with open(filepath, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    existing_ids = {identity(k): k for k in data}
    raw_players = extract_players(rawfile, cat=cat)

    added = 0
    missing_code = []
    for raw_name, codes in sorted(raw_players.items()):
        std_name = NAME_MAP.get(raw_name)
        if not std_name:
            missing_code.append(f"{raw_name} 无标准名")
            continue
        if identity(std_name) in existing_ids:
            continue
        code = sorted(codes)[0]
        country = COUNTRY_MAP.get(code)
        if not country:
            missing_code.append(f"{std_name} 国家代码 {code} 未映射")
            continue
        data[std_name] = {"assoc": code, "country": country, "source": "user-confirmed"}
        existing_ids[identity(std_name)] = std_name
        added += 1

    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  {cat.upper()}: +{added} (total {len(data)})")
    if missing_code:
        print("  [问题]")
        for m in missing_code:
            print("    ", m)


if __name__ == "__main__":
    print("补充 assoc.json (2001 Skovde + Bayreuth)")
    add_to_assoc("ms", "_skovde2001_ms_raw.txt")
    add_to_assoc("ws", "_skovde2001_ws_raw.txt")
    add_to_assoc("ms", "_bayreuth2001_raw.txt")
    add_to_assoc("ws", "_bayreuth2001_raw.txt")