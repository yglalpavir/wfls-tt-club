#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为 2001 Swedish Open (Skovde) 球员补充 assoc.json 协会籍记录。"""
import json
import os
import re
import importlib.util

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")

# 复用导入脚本的 NAME_MAP（标准名）
spec = importlib.util.spec_from_file_location("importer", os.path.join(BASE_DIR, "import_skovde_2001.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
NAME_MAP = mod.NAME_MAP

# 国家代码 -> 全称（与现有 assoc.json 惯例一致）
COUNTRY_MAP = {
    "AUS": "Australia", "AUT": "Austria", "BEL": "Belgium", "BLR": "Belarus",
    "CHI": "Chile", "CHN": "China", "CRO": "Croatia", "CZE": "Czechia",
    "DEN": "Denmark", "ENG": "England", "ESP": "Spain", "FRA": "France",
    "GER": "Germany", "HKG": "Hong Kong, China", "ITA": "Italy", "JPN": "Japan",
    "KOR": "Korea Republic", "LIE": "Liechtenstein", "LUX": "Luxembourg",
    "NED": "Netherlands", "NOR": "Norway", "POL": "Poland", "PRK": "Korea DPR",
    "ROU": "Romania", "RUS": "Russia", "SGP": "Singapore", "SLO": "Slovenia",
    "SRB": "Serbia", "SUI": "Switzerland", "SVK": "Slovak Republic",
    "SWE": "Sweden", "TPE": "Chinese Taipei", "TUR": "Turkiye", "WAL": "Wales",
}


def extract_players(rawfile):
    """原始文件: 原始名(去国家) -> 国家代码集合"""
    players = {}
    with open(rawfile, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            cols = [c.strip() for c in line.split("\t")]
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
    raw_players = extract_players(rawfile)

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
    print("补充 assoc.json (2001 Skovde)")
    add_to_assoc("ms", "_skovde2001_ms_raw.txt")
    add_to_assoc("ws", "_skovde2001_ws_raw.txt")