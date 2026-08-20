#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为 2014 年 ITTF 赛事（14 站）球员补充 assoc.json 协会籍记录（MS/WS）。

覆盖：MS/WS + U21MS/U21WS（一并导入 ms/ws）+ 世乒团体 Tokyo MT/WT 单打。
只增不改：已存在的球员（按名称恒等）跳过；国家代码只增不改。
2014 新增国家代码：BAN ESA FRO GGY GUM LAO NAM PLE。
"""
import json
import os
import re
import importlib.util

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
RAW_DIR = os.path.join(os.path.dirname(BASE_DIR), "docs", "result_ittf_link", "2014")

# 复用 import_2014 的标准名映射
_spec = importlib.util.spec_from_file_location("imp2014", os.path.join(BASE_DIR, "import_2014.py"))
_imp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_imp)
NAME_MAP = _imp.NAME_MAP

COUNTRY_MAP = {
    "AUS": "Australia", "AUT": "Austria", "ARG": "Argentina", "BAR": "Barbados",
    "BEL": "Belgium", "BIH": "Bosnia and Herzegovina", "BLR": "Belarus", "BRA": "Brazil",
    "BUL": "Bulgaria", "CAN": "Canada", "CHI": "Chile", "CHN": "China", "CMR": "Cameroon",
    "CRO": "Croatia", "CZE": "Czechia", "DEN": "Denmark", "ECU": "Ecuador", "EGY": "Egypt",
    "ENG": "England", "ESP": "Spain", "FRA": "France", "GER": "Germany", "GRE": "Greece",
    "GUA": "Guatemala", "HKG": "Hong Kong, China", "HUN": "Hungary",
    "IND": "India", "IRI": "Iran", "ISR": "Israel", "ITA": "Italy", "JOR": "Jordan", "JPN": "Japan",
    "KOR": "Korea Republic", "LIE": "Liechtenstein", "LTU": "Lithuania", "LUX": "Luxembourg",
    "MDA": "Moldova", "MON": "Monaco", "NED": "Netherlands", "NGR": "Nigeria", "NOR": "Norway",
    "NZL": "New Zealand", "POL": "Poland", "POR": "Portugal", "PRK": "Korea DPR",
    "ROU": "Romania", "RUS": "Russia", "SGP": "Singapore", "SLO": "Slovenia", "SRB": "Serbia",
    "SUD": "Sudan", "SUI": "Switzerland", "SVK": "Slovak Republic", "SWE": "Sweden",
    "TPE": "Chinese Taipei", "TUR": "Turkiye", "UGA": "Uganda", "UKR": "Ukraine",
    "USA": "USA", "UZB": "Uzbekistan", "VEN": "Venezuela", "WAL": "Wales",
    "ALB": "Albania", "ALG": "Algeria", "ARM": "Armenia", "ARU": "Aruba", "BDI": "Burundi",
    "BEN": "Benin", "CAM": "Cambodia", "CGO": "Congo", "CIV": "Cote d'Ivoire",
    "COD": "DR Congo", "CRC": "Costa Rica", "CYP": "Cyprus", "DOM": "Dominican Republic",
    "EST": "Estonia", "FIJ": "Fiji", "GAB": "Gabon", "GHA": "Ghana", "GUI": "Guinea",
    "GUY": "Guyana", "INA": "Indonesia", "IRL": "Ireland", "ISL": "Iceland", "JAM": "Jamaica",
    "KAZ": "Kazakhstan", "KSA": "Saudi Arabia", "KUW": "Kuwait", "LAT": "Latvia",
    "LBN": "Lebanon", "LCA": "Saint Lucia", "MAC": "Macau, China", "MAD": "Madagascar",
    "MAR": "Morocco", "MAS": "Malaysia", "MDV": "Maldives", "MEX": "Mexico",
    "MGL": "Mongolia", "MKD": "North Macedonia", "MLT": "Malta", "MRI": "Mauritius",
    "PER": "Peru", "PUR": "Puerto Rico", "PYF": "French Polynesia", "QAT": "Qatar",
    "RSA": "South Africa", "SCO": "Scotland", "SEN": "Senegal", "SEY": "Seychelles",
    "SMR": "San Marino", "SOM": "Somalia", "SRI": "Sri Lanka", "THA": "Thailand",
    "TKM": "Turkmenistan", "TOG": "Togo", "TTO": "Trinidad and Tobago", "TUN": "Tunisia",
    "VIE": "Vietnam", "YEM": "Yemen",

    # 2004 新增
    "AZE": "Azerbaijan", "BRN": "Bahrain", "COL": "Colombia", "FIN": "Finland",
    "HON": "Honduras", "KEN": "Kenya", "KOS": "Kosovo", "LBA": "Libya",
    "NEP": "Nepal", "PAK": "Pakistan", "TJK": "Tajikistan", "UAE": "United Arab Emirates",
    "URU": "Uruguay",

    # 2005 新增
    "KGZ": "Kyrgyzstan", "PAR": "Paraguay",

    # 2013 新增
    "CUB": "Cuba", "IRQ": "Iraq", "MNE": "Montenegro", "PAN": "Panama",

    # 2014 新增
    "BAN": "Bangladesh", "ESA": "El Salvador", "FRO": "Faroe Islands",
    "GGY": "Guernsey", "GUM": "Guam", "LAO": "Laos", "NAM": "Namibia",
    "PLE": "Palestine",

    # 既有 DB 已有代码（补全 COUNTRY_MAP）
    "ANG": "Angola", "BOT": "Botswana", "JEY": "Jersey",
    "NCL": "France", "PHI": "Philippines", "SYR": "Syria",
}


def extract_players(cat):
    """从全部原始文件提取 原始名 -> 国家代码集合（MS/WS + U21 + MT/WT，兼容断行）。"""
    want = {"ms": ("MS", "U21MS", "MT"), "ws": ("WS", "U21WS", "WT")}[cat]
    players = {}
    for fname in sorted(os.listdir(RAW_DIR)):
        if not fname.endswith(".txt"):
            continue
        with open(os.path.join(RAW_DIR, fname), encoding="utf-8-sig") as f:
            raw_lines = [l.rstrip("\n") for l in f]
        lines = []
        i = 0
        while i < len(raw_lines):
            l = raw_lines[i].strip()
            if not l:
                i += 1
                continue
            cols = [c.strip() for c in l.split("\t")]
            if cols and cols[-1] in ("MS", "WS", "MD", "WD", "XD", "U21MS", "U21WS", "MT", "WT") and len(cols) < 8 and i + 1 < len(raw_lines):
                nxt = raw_lines[i + 1].strip()
                if nxt:
                    lines.append(l + "\t" + nxt)
                    i += 2
                    continue
            lines.append(l)
            i += 1
        for line in lines:
            cols = [c.strip() for c in line.split("\t")]
            if len(cols) < 7 or not re.match(r"^\d{4}$", cols[0]):
                continue
            if cols[6] not in want:
                continue
            for raw in (cols[2], cols[4]):
                m = re.match(r"^(.*?) \(([A-Z]{3})\)$", raw)
                if m:
                    players.setdefault(m.group(1), set()).add(m.group(2))
    return players


def identity(name):
    return " ".join(sorted(re.sub(r"[^A-Z0-9]", "", t) for t in name.upper().split() if re.sub(r"[^A-Z0-9]", "", t)))


def add_to_assoc(cat):
    filepath = os.path.join(WTT_DIR, cat, "assoc.json")
    with open(filepath, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    existing_ids = {identity(k): k for k in data}
    raw_players = extract_players(cat)

    added = 0
    problems = []
    for raw_name, codes in sorted(raw_players.items()):
        std_name = NAME_MAP.get(raw_name)
        if not std_name:
            problems.append(f"{raw_name} 无标准名")
            continue
        if identity(std_name) in existing_ids:
            continue
        code = sorted(codes)[0]
        country = COUNTRY_MAP.get(code)
        if not country:
            problems.append(f"{std_name} 国家代码 {code} 未映射")
            continue
        data[std_name] = {"assoc": code, "country": country, "source": "user-confirmed"}
        existing_ids[identity(std_name)] = std_name
        added += 1

    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  {cat.upper()}: +{added} (total {len(data)})")
    if problems:
        print("  [问题]")
        for p in sorted(set(problems)):
            print("    ", p)


if __name__ == "__main__":
    print("补充 assoc.json (2014 十四站赛事)")
    add_to_assoc("ms")
    add_to_assoc("ws")