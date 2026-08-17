#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入 2001 German Open (Bayreuth) MS/WS 比赛数据。"""
import json
import os
import re
import importlib.util

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
EVENT_TYPE = "ittf公开赛"
EVENT_YEAR = "2001"

# 复用 Skovde 脚本的标准名映射（共享球员）
_spec = importlib.util.spec_from_file_location("skovde", os.path.join(BASE_DIR, "import_skovde_2001.py"))
_sk = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sk)

NAME_MAP = dict(_sk.NAME_MAP)
NAME_MAP.update({
    # ===== MS 新增 =====
    "FETH Stefan": "Stefan FETH",
    "CIOCIU Traian": "Traian CIOCIU",
    "FILIMON Andrei": "Andrei FILIMON",
    "VLOTINOS Ioannis": "Ioannis VLOTINOS",
    "SUSS Christian": "Christian SUSS",
    "LINDNER Adam": "Adam LINDNER",
    "GIONIS Panagiotis": "Panagiotis GIONIS",
    "DZIUBANSKI Michal": "Michal DZIUBANSKI",
    "KEINATH Thomas": "Thomas KEINATH",
    "SAMSONOV Vladimir": "Vladimir SAMSONOV",
    "ZWICKL Daniel": "Daniel ZWICKL",
    "VARIN Eric": "Eric VARIN",
    "GRUJIC Slobodan": "Slobodan GRUJIC",
    "FRANZ Peter": "Peter FRANZ",
    "PODPINKA Andras": "Andras PODPINKA",
    "SHMYREV Maxim": "Maxim SHMYREV",
    "JIANG Weizhong": "JIANG Weizhong",
    "YANG Min": "YANG Min",
    "SMIRNOV Alexey": "Alexey SMIRNOV",
    "JOO Saehyuk": "JOO Saehyuk",
    "KARAKASEVIC Aleksandar": "Aleksandar KARAKASEVIC",
    "TSIOKAS Ntaniel": "Ntaniel TSIOKAS",
    "TOSIC Roko": "Roko TOSIC",
    "KIM Gunhwan": "KIM Gunhwan",
    "VOZICKY Bohumil": "Bohumil VOZICKY",
    "FEJER-KONNERTH Zoltan": "Zoltan FEJER-KONNERTH",
    "MONDELLO Massimiliano": "Massimiliano MONDELLO",
    "PIACENTINI Valentino": "Valentino PIACENTINI",
    "TRUKSA Jaromir": "Jaromir TRUKSA",
    "PERSSON Jorgen": "Jorgen PERSSON",
    "CIOTI Constantin": "Constantin CIOTI",
    "CRISAN Adrian": "Adrian CRISAN",
    "CHTCHETININE Evgueni": "Evgueni CHTCHETININE",
    "KREANGA Kalinikos": "Kalinikos KREANGA",
    "PLACHY Josef": "Josef PLACHY",
    "LIU Song": "LIU Song",
    "PRIMORAC Zoran": "Zoran PRIMORAC",
    "DELOBBE Damien": "Damien DELOBBE",
    "STEPHAN Gabriel": "Gabriel STEPHAN",
    "PAPAGEORGIOU Konstantinos": "Konstantinos PAPAGEORGIOU",
    "CAENARO Sandro": "Sandro CAENARO",
    "BYKOV Viktor": "Viktor BYKOV",
    "MAIER Christoph": "Christoph MAIER",
    "CSABA Bence": "Bence CSABA",
    "KOSTAL Radek": "Radek KOSTAL",
    "HUBBARD Andrew": "Andrew HUBBARD",
    "MARKOVIC Rade": "Rade MARKOVIC",
    "VUKELIC Boris": "Boris VUKELIC",
    "JANSSENS Tim": "Tim JANSSENS",
    "PRESSLMAYER Bernhard": "Bernhard PRESSLMAYER",
    "SURBEK Dragutin": "Dragutin SURBEK",
    "GREZO Martin": "Martin GREZO",
    "KRIVIC Jakov": "Jakov KRIVIC",
    "DEMETER Lehel": "Lehel DEMETER",
    "DIAA Sherif": "Sherif DIAA",
    "TOMASI Stefano": "Stefano TOMASI",
    "CHUMAKOU Dmitry": "Dmitry CHUMAKOU",
    "WEITZ Daniel": "Daniel WEITZ",
    "MOSELHY Emad": "Emad MOSELHY",
    "RUSHTON Andrew": "Andrew RUSHTON",
    "JANSSENS Bram": "Bram JANSSENS",
    "MARSI Marton": "Marton MARSI",
    "DUAN Yongjun": "DUAN Yongjun",
    "BALL Andreas": "Andreas BALL",
    "DAVID Petr": "Petr DAVID",
    "MONTEIRO Thiago": "Thiago MONTEIRO",
    "FICKINGER David": "David FICKINGER",
    "IGNJATOVIC Sasa": "Sasa IGNJATOVIC",
    "GREEN Wally": "Wally GREEN",
    "SCHLICHTER Jorg": "Jorg SCHLICHTER",
    "JAPEC Tomislav": "Tomislav JAPEC",
    "KOLODZIEJCZYK Wojciech": "Wojciech KOLODZIEJCZYK",
    "MOHLER Nicola": "Nicola MOHLER",
    "MORITZ Fabian": "Fabian MORITZ",
    "PERRY Alex": "Alex PERRY",
    "CHRISTE Michael": "Michael CHRISTE",
    "SALEH Ahmed": "Ahmed SALEH",
    "ANDRIANOV Sergei": "Sergei ANDRIANOV",
    "STEHLE Nico": "Nico STEHLE",
    "LASHIN Elsayed": "Elsayed LASHIN",
    "MILICEVIC Srdan": "Srdan MILICEVIC",
    "SZAFRANEK Piotr": "Piotr SZAFRANEK",
    "STEGER Bastian": "Bastian STEGER",
    "TAMAS Cristian": "Cristian TAMAS",
    # ===== WS 新增 =====
    "BENTSEN Eldijana": "Eldijana BENTSEN",
    "STEFF Mihaela": "Mihaela STEFF",
    "LOVAS Petra": "Petra LOVAS",
    "KIM Kyungah": "KIM Kyungah",
    "KRAMER Tanja": "Tanja KRAMER",
    "FAZEKAS Maria": "Maria FAZEKAS",
    "TOTH Krisztina": "Krisztina TOTH",
    "BATORFI Csilla": "Csilla BATORFI",
    "MELNIK Galina": "Galina MELNIK",
    "SVENSSON Asa": "Asa SVENSSON",
    "SCHOPP Jie": "SCHOPP Jie",
    "ZAMFIR Adriana": "Adriana ZAMFIR",
    "DOBESOVA Jana": "Jana DOBESOVA",
    "LIU Jia": "LIU Jia",
    "BOILEAU Anne": "Anne BOILEAU",
    "LOGATZKAYA Tatyana": "Tatyana LOGATZKAYA",
    "ODOROVA Eva": "Eva ODOROVA",
    "KIM Mookyo": "KIM Mookyo",
    "KIM Kyungha": "KIM Kyungha",
    "BADESCU Otilia": "Otilia BADESCU",
    "ELLO Vivien": "Vivien ELLO",
    "PASKAUSKIENE Ruta": "Ruta PASKAUSKIENE",
    "DERMASTIJA Petra": "Petra DERMASTIJA",
    "GOROWSKA Magdalena": "Magdalena GOROWSKA",
    "MEYER Benedicte": "Benedicte MEYER",
    "PALER-TIMMERMANN Michele": "Michele PALER-TIMMERMANN",
    "ASHRAF Ayatollah": "Ayatollah ASHRAF",
    "MOLNAR Zita": "Zita MOLNAR",
    "OSMAN Bacent": "Bacent OSMAN",
    "FILI Christina": "Christina FILI",
    "ROHR Meike": "Meike ROHR",
    "ABDELAZIZ Shimaa": "Shimaa ABDELAZIZ",
    "PIETKIEWICZ Monika": "Monika PIETKIEWICZ",
    "HEINTZ Jessie": "Jessie HEINTZ",
    "MOLIK Patricja": "Patricja MOLIK",
    "EGGEL Melanie": "Melanie EGGEL",
    "LANG Kristin": "Kristin LANG",
    "NTOULAKI Ekaterina": "Ekaterina NTOULAKI",
    "SCHMID Tini": "Tini SCHMID",
    "HAN Kwangsun": "HAN Kwangsun",
    "KUSZAJ Iwona": "Iwona KUSZAJ",
    "HAAN Simone": "Simone HAAN",
    "WANG Yu (YOB=1981)": "WANG Yu",
    "VACENOVSKA Iveta": "Iveta VACENOVSKA",
    "CICHOCKA Magdalena": "Magdalena CICHOCKA",
    "LEE Hyangmi": "LEE Hyangmi",
    "POHAR Martina": "Martina POHAR",
    "HERCZIG Judit": "Judit HERCZIG",
    "BUKA-EDEL Ekaterina": "Ekaterina BUKA-EDEL",
    "POTA Georgina": "Georgina POTA",
    "HORAKOVA Libuse": "Libuse HORAKOVA",
    "NIKOULAE Laoura-Ioulia": "Laoura-Ioulia NIKOULAE",
    "DING Yan": "DING Yan",
    "KOLAROVA Nina": "Nina KOLAROVA",
    "MOLNAR Cornelia": "Cornelia MOLNAR",
    "IVANCAN Irene": "Irene IVANCAN",
    "KOLAROVA Dominika": "Dominika KOLAROVA",
    "TODOROVIC Biljana": "Biljana TODOROVIC",
    "DEMIENOVA Zuzana": "Zuzana DEMIENOVA",
    "ROHR Gaby": "Gaby ROHR",
    "LUCZAKOWSKA Daria": "Daria LUCZAKOWSKA",
    "STEFANOVA Nikoleta": "Nikoleta STEFANOVA",
    "OLLMER Marie": "Marie OLLMER",
    "VOLAKAKI Archontoula": "Archontoula VOLAKAKI",
    "SCHNEIDER Katharina": "Katharina SCHNEIDER",
    "LOWER Helen": "Helen LOWER",
    "URBAN Alexandra": "Alexandra URBAN",
    "DEATON Nicola": "Nicola DEATON",
    "CSERNYIK Ildiko": "Ildiko CSERNYIK",
    "SHABAN Zeina": "Zeina SHABAN",
    "BOLLMEIER Nadine": "Nadine BOLLMEIER",
    "SMISTIKOVA Martina": "Martina SMISTIKOVA",
    "ROBERTSON Laura": "Laura ROBERTSON",
    "UNTEA Cristina": "Cristina UNTEA",
    "MEYERHOFER Katrin": "Katrin MEYERHOFER",
    "YOON Jihye": "YOON Jihye",
    "WICKI Sonia": "Sonia WICKI",
    "PAVLOVICH Veronika": "Veronika PAVLOVICH",
})


# 赛段 -> 日期 (18-21 Oct 2001, 合理分配)
def match_date(stage, round_):
    if stage == "Qualification":
        return "2001-10-18"
    # Main Draw
    if round_ in ("R64", "R32"):
        return "2001-10-19"
    if round_ == "R16":
        return "2001-10-20"
    if round_ == "QuarterFinal":
        return "2001-10-20"
    if round_ == "SemiFinal":
        return "2001-10-21"
    if round_ == "Final":
        return "2001-10-21"
    return "2001-10-19"


def parse_raw(filepath):
    """解析 tab 分隔原始数据，处理断行/缺列。"""
    records = []
    missing = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        raw_lines = [l.rstrip("\n") for l in f]

    # 合并被拆分的行（如 CIOCIU/TAMAS 被断成两行）
    lines = []
    i = 0
    while i < len(raw_lines):
        l = raw_lines[i].strip()
        if not l:
            i += 1
            continue
        cols = [c.strip() for c in l.split("\t")]
        # 若该行以 'MS'/'WS' 结尾且非完整行，则与下一行合并
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
        if len(cols) < 10:
            continue
        if cols[0] != "2001":
            continue
        player_a_raw = cols[2]
        player_b_raw = cols[4]
        subevent = cols[6]
        stage = cols[7]
        round_ = cols[8]
        winner_raw = cols[11] if len(cols) > 11 else ""

        def extract_name(raw):
            m = re.match(r"^(.*?) \(([A-Z]{3})\)$", raw)
            return m.group(1) if m else raw

        pa = extract_name(player_a_raw)
        pb = extract_name(player_b_raw)
        pw = extract_name(winner_raw)

        name_a = NAME_MAP.get(pa)
        name_b = NAME_MAP.get(pb)
        name_w = NAME_MAP.get(pw)

        for label, key, raw in (("A", pa, player_a_raw), ("B", pb, player_b_raw), ("W", pw, winner_raw)):
            if key not in NAME_MAP:
                missing.append(f"{label}:{raw}")

        if name_a is None or name_b is None or name_w is None:
            continue

        if name_w == name_a:
            winner, loser = name_a, name_b
        elif name_w == name_b:
            winner, loser = name_b, name_a
        else:
            missing.append(f"WINNER-MISMATCH: {player_a_raw} vs {player_b_raw} -> {winner_raw}")
            continue

        records.append((match_date(stage, round_), EVENT_TYPE, winner, loser))
    return records, missing


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
    print("German Open Bayreuth 2001")
    rawfile = os.path.join(BASE_DIR, "_bayreuth2001_raw.txt")
    records, missing = parse_raw(rawfile)
    print(f"  parsed total: {len(records)}")
    if missing:
        print("  [missing]")
        for m in sorted(set(missing)):
            print("    ", m)
    ms = [r for r in records if False]  # 占位，实际按文件切分
    # 重新按子项目分
    ms_records, ws_records = [], []
    with open(rawfile, "r", encoding="utf-8-sig") as f:
        content = f.read()
    # 简单方案: 解析时已按 subevent 判断，此处再跑一次带 subevent 的解析
    def parse_split():
        ms_, ws_ = [], []
        raw_lines = [l.rstrip("\n") for l in content.split("\n")]
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
            pa = re.match(r"^(.*?) \(([A-Z]{3})\)$", cols[2]).group(1)
            pb = re.match(r"^(.*?) \(([A-Z]{3})\)$", cols[4]).group(1)
            pw = re.match(r"^(.*?) \(([A-Z]{3})\)$", winner_raw).group(1) if re.match(r"^(.*?) \(([A-Z]{3})\)$", winner_raw) else winner_raw
            na, nb, nw = NAME_MAP.get(pa), NAME_MAP.get(pb), NAME_MAP.get(pw)
            if not (na and nb and nw):
                continue
            if nw == na:
                w, l = na, nb
            elif nw == nb:
                w, l = nb, na
            else:
                continue
            rec = (match_date(stage, round_), EVENT_TYPE, w, l)
            if subevent == "MS":
                ms_.append(rec)
            elif subevent == "WS":
                ws_.append(rec)
        return ms_, ws_

    ms_records, ws_records = parse_split()
    print(f"  MS: {len(ms_records)}  WS: {len(ws_records)}")
    append_to_scorelog("ms", ms_records)
    append_to_scorelog("ws", ws_records)