#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入 2001 Swedish Open (Skovde) MS/WS 比赛数据。"""
import json
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
EVENT_TYPE = "ittf公开赛"
EVENT_YEAR = "2001"

# 姓名映射: 原始(不含国家代码) -> 标准格式 (遵循 player-name-format.md)
NAME_MAP = {
    # ===== MS =====
    "TUGWELL Finn": "Finn TUGWELL",
    "CABESTANY Cedrik": "Cedrik CABESTANY",
    "RODRIGUEZ Alejandro": "Alejandro RODRIGUEZ",
    "MOLDOVAN Istvan": "Istvan MOLDOVAN",
    "ROBERTSON Adam": "Adam ROBERTSON",
    "KUZMIN Fedor": "Fedor KUZMIN",
    "SALAMANCA Juan": "Juan SALAMANCA",
    "GARDOS Robert": "Robert GARDOS",
    "WAHLGREN Magnus": "Magnus WAHLGREN",
    "HENZELL William": "William HENZELL",
    "PAPIC Juan": "Juan PAPIC",
    "LARSEN Glen": "Glen LARSEN",
    "KLASEK Marek": "Marek KLASEK",
    "MARTINEZ Michel": "Michel MARTINEZ",
    "MIRAULT Cedric": "Cedric MIRAULT",
    "MITAMURA Muneaki": "Muneaki MITAMURA",
    "ASAMOAH Cyprian": "Cyprian ASAMOAH",
    "KELLER Raphael": "Raphael KELLER",
    "LUNDQVIST Jens": "Jens LUNDQVIST",
    "MONRAD Martin": "Martin MONRAD",
    "YOON Jaeyoung": "YOON Jaeyoung",
    "WANG Jianfeng": "WANG Jianfeng",
    "ERLANDSEN Geir": "Geir ERLANDSEN",
    "LIU Heng": "LIU Heng",
    "HOREJSI Miroslav": "Miroslav HOREJSI",
    "MAZE Michael": "Michael MAZE",
    "LEGOUT Christophe": "Christophe LEGOUT",
    "ELOI Damien": "Damien ELOI",
    "PAVELKA Tomas": "Tomas PAVELKA",
    "KO Lai Chak": "KO Lai Chak",
    "WOSIK Torben": "Torben WOSIK",
    "LEE Chulseung": "LEE Chulseung",
    "JONG Kyong Chol": "JONG Kyong Chol",
    "YAN Sen": "YAN Sen",
    "SAIVE Philippe": "Philippe SAIVE",
    "NILSSON Stefan": "Stefan NILSSON",
    "KEEN Trinko": "Trinko KEEN",
    "CHEN Weixing": "CHEN Weixing",
    "LI Ching": "LI Ching",
    "KUSINSKI Marcin": "Marcin KUSINSKI",
    "HEISTER Danny": "Danny HEISTER",
    "KRZESZEWSKI Tomasz": "Tomasz KRZESZEWSKI",
    "HAKANSSON Fredrik": "Fredrik HAKANSSON",
    "KARLSSON Peter": "Peter KARLSSON",
    "LEUNG Chu Yan": "LEUNG Chu Yan",
    "RYU Seungmin": "RYU Seungmin",
    "CHEUNG Yuk": "CHEUNG Yuk",
    "TASEI Kunihito": "Kunihito TASEI",
    "WANG Hao": "WANG Hao",
    "TASAKI Toshio": "Toshio TASAKI",
    "KIM Song Hui": "KIM Song Hui",
    "WANG Liqin": "WANG Liqin",
    "BOLL Timo": "Timo BOLL",
    "MA Wenge": "MA Wenge",
    "LIU Guoliang": "LIU Guoliang",
    "SAIVE Jean-Michel": "Jean-Michel SAIVE",
    "KORBEL Petr": "Petr KORBEL",
    "OH Sangeun": "OH Sangeun",
    "MA Lin": "MA Lin",
    "KIM Taeksoo": "KIM Taeksoo",
    "BLASZCZYK Lucjan": "Lucjan BLASZCZYK",
    "CHILA Patrick": "Patrick CHILA",
    "SCHLAGER Werner": "Werner SCHLAGER",
    "WALDNER Jan-Ove": "Jan-Ove WALDNER",
    "CHUANG Chih-Yuan": "CHUANG Chih-Yuan",
    "ROSSKOPF Jorg": "Jorg ROSSKOPF",
    "LIU Guozheng": "LIU Guozheng",
    "DERELI Sukru": "Sukru DERELI",
    "KOSOWSKI Jakub": "Jakub KOSOWSKI",
    "SORENSEN Mads": "Mads SORENSEN",
    "O Il": "O Il",
    "YOUNG Terry": "Terry YOUNG",
    "BENTSEN Allan": "Allan BENTSEN",
    "CLOSSET Marc": "Marc CLOSSET",
    "JENKINS Ryan": "Ryan JENKINS",
    "OLEJNIK Martin": "Martin OLEJNIK",
    "MANSSON Magnus": "Magnus MANSSON",
    "BAGGALEY Andrew": "Andrew BAGGALEY",
    "QUENTEL Dorian": "Dorian QUENTEL",
    "CHANG Miao": "CHANG Miao",
    "ROSVALL Henrik": "Henrik ROSVALL",
    "ILLAS Erik": "Erik ILLAS",
    "YUNG Kyong Chol": "YUNG Kyong Chol",
    "MOLIN Magnus": "Magnus MOLIN",
    "SORENSEN Joachim": "Joachim SORENSEN",
    "ZOOGLING Mikael": "Mikael ZOOGLING",
    "SAKAMOTO Ryusuke": "Ryusuke SAKAMOTO",
    "BRATANOV Martin": "Martin BRATANOV",
    "SVENSSON Robert": "Robert SVENSSON",
    "ANSNES Eirik": "Eirik ANSNES",
    "HIELSCHER Lars": "Lars HIELSCHER",
    "GORAK Daniel": "Daniel GORAK",
    "YEO Chansoo": "YEO Chansoo",
    "JINDRAK Karl": "Karl JINDRAK",
    "SKOVSEN Mads": "Mads SKOVSEN",
    "GONZALES Raymond": "Raymond GONZALES",
    "PISTEJ Lubomir": "Lubomir PISTEJ",
    "KIM Joosang": "KIM Joosang",
    "KNUDSEN Morten": "Morten KNUDSEN",
    "JOVER Sebastien": "Sebastien JOVER",
    "WAKINOTANI Katsutoshi": "Katsutoshi WAKINOTANI",
    "BARDON Michal": "Michal BARDON",
    "NILSSON Peter": "Peter NILSSON",
    "KONGSGAARD Christian": "Christian KONGSGAARD",
    "KISHIKAWA Seiya": "Seiya KISHIKAWA",
    "KONECNY Tomas": "Tomas KONECNY",
    "STENBERG Marten": "Marten STENBERG",
    "SANADA Koji": "Koji SANADA",
    "CARNEROS Alfredo": "Alfredo CARNEROS",
    "GAVLAS Antonin": "Antonin GAVLAS",
    "STENBERG Mattias": "Mattias STENBERG",
    "HOLM Anders": "Anders HOLM",
    "STEPANEK David": "David STEPANEK",
    "PAK Won Chol": "PAK Won Chol",
    "MORALES Augusto": "Augusto MORALES",
    "TOKIC Bojan": "Bojan TOKIC",
    "MULLER Frank": "Frank MULLER",
    "SEREDA Peter": "Peter SEREDA",
    "SWANSON Alex": "Alex SWANSON",
    # ===== WS =====
    "LI Jiawei": "LI Jiawei",
    "BOROS Tamara": "Tamara BOROS",
    "BAI Yang": "BAI Yang",
    "GUO Yan (1982)": "GUO Yan",
    "TASEI Mikie": "Mikie TASEI",
    "JENSEN Janne": "Janne JENSEN",
    "BERGLUND Anna": "Anna BERGLUND",
    "GOURIN Anne-Sophie": "Anne-Sophie GOURIN",
    "SJOGREN Marie": "Marie SJOGREN",
    "MOREL Silvia": "Silvia MOREL",
    "COSTES Agathe": "Agathe COSTES",
    "EKHOLM Matilda": "Matilda EKHOLM",
    "TEPES Sofija": "Sofija TEPES",
    "STEFANSKA Kinga": "Kinga STEFANSKA",
    "PARK Miyoung": "PARK Miyoung",
    "WIGOW Susanna": "Susanna WIGOW",
    "TAMBORINI Aurelie": "Aurelie TAMBORINI",
    "WESTHOLM Sofia": "Sofia WESTHOLM",
    "PARKER Katy": "Katy PARKER",
    "PARK Bokyung": "PARK Bokyung",
    "REGENWETTER Peggy": "Peggy REGENWETTER",
    "VAKKILA Nina": "Nina VAKKILA",
    "ENOCSSON Evelina": "Evelina ENOCSSON",
    "HARABASZOVA Lenka": "Lenka HARABASZOVA",
    "SILVESTRE Julia": "Julia SILVESTRE",
    "OLSSON Marie": "Marie OLSSON",
    "RODRIGUEZ Berta": "Berta RODRIGUEZ",
    "CECHOVA Dana": "Dana CECHOVA",
    "BOMANN Anne-Cathrine": "Anne-Cathrine BOMANN",
    "NORDENBERG Linda": "Linda NORDENBERG",
    "WON Youngah": "WON Youngah",
    "FINNEMANN Pia": "Pia FINNEMANN",
    "ROHDIN Sara": "Sara ROHDIN",
    "GLADIEUX Elisabeth": "Elisabeth GLADIEUX",
    "STEWARD Kathryn": "Kathryn STEWARD",
    "LINDSTROM Jennie": "Jennie LINDSTROM",
    "ALVAREZ Patricia": "Patricia ALVAREZ",
    "LEGAY Solene": "Solene LEGAY",
    "HO Yang-Han": "HO Yang-Han",
    "CIGANKOVA Nataliya": "Nataliya CIGANKOVA",
    "GAJIC Jelena": "Jelena GAJIC",
    "JONSSON Carina": "Carina JONSSON",
    "JOHANSSON Frida": "Frida JOHANSSON",
    "JIANG Huajun": "JIANG Huajun",
    "DAUNTON Bethan": "Bethan DAUNTON",
    "HALAS Helena": "Helena HALAS",
    "KOSTROMINA Tatyana (1973)": "Tatyana KOSTROMINA",
    "STRBIKOVA Renata": "Renata STRBIKOVA",
    "GANINA Svetlana": "Svetlana GANINA",
    "LU Yun-Feng": "LU Yun-Feng",
    "GOBEL Jessica": "Jessica GOBEL",
    "SCHALL Elke": "Elke SCHALL",
    "JONSSON Susanne": "Susanne JONSSON",
    "GAO Xi": "GAO Xi",
    "FUJINUMA Ai": "Ai FUJINUMA",
    "HIURA Reiko": "Reiko HIURA",
    "VACHOVCOVA Alena": "Alena VACHOVCOVA",
    "KIM Bokrae": "KIM Bokrae",
    "TAN Paey Fern": "TAN Paey Fern",
    "JOHANSSON Sandra": "Sandra JOHANSSON",
    "ZHANG Xueling": "ZHANG Xueling",
    "NEGRISOLI Laura": "Laura NEGRISOLI",
    "RYU Jihae": "RYU Jihae",
    "NEMES Olga": "Olga NEMES",
    "LEE Eunsil": "LEE Eunsil",
    "LI Jia": "LI Jia",
    "PAVLOVICH Viktoria": "Viktoria PAVLOVICH",
    "YANG Ying": "YANG Ying",
    "NI Xia Lian": "NI Xia Lian",
    "NISHII Yuka": "Yuka NISHII",
    "JING Junhong": "JING Junhong",
    "KONISHI An": "An KONISHI",
    "STRUSE Nicole": "Nicole STRUSE",
}

# 赛段 -> 日期 (21-25 Nov 2001, 合理分配)
def match_date(stage, round_):
    if stage == "Qualification":
        if round_:
            return "2001-11-22"
        return "2001-11-21"
    # Main Draw
    if round_ in ("R64", "R32"):
        return "2001-11-23"
    if round_ == "R16":
        return "2001-11-24"
    if round_ == "QuarterFinal":
        return "2001-11-24"
    if round_ == "SemiFinal":
        return "2001-11-25"
    if round_ == "Final":
        return "2001-11-25"
    return "2001-11-23"


def parse_raw(filepath):
    """解析 tab 分隔的原始数据，返回 (日期, 类型, 胜者, 负者) 列表。"""
    records = []
    missing = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            cols = [c.strip() for c in line.split("\t")]
            # 0=Year 1=Event 2=PlayerA 4=PlayerB 6=Sub-event 7=Stage 8=Round 11=Winner
            player_a_raw = cols[2]
            player_b_raw = cols[4]
            subevent = cols[6]
            stage = cols[7]
            round_ = cols[8]
            winner_raw = cols[11]

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
    print("Swedish Open Skovde 2001")
    for cat, rawfile in (("ms", "_skovde2001_ms_raw.txt"), ("ws", "_skovde2001_ws_raw.txt")):
        records, missing = parse_raw(os.path.join(BASE_DIR, rawfile))
        print(f"  {cat.upper()}: parsed {len(records)}")
        if missing:
            print("  [missing]")
            for m in sorted(set(missing)):
                print("    ", m)
        append_to_scorelog(cat, records)