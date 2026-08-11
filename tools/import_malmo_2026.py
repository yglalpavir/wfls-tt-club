#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Grand Smash Malmo 2026 - 数据录入脚本
直接追加到 score-log 文件末尾，不排序
日期统一为 2026-08-11（与用户提供一致）
"""

import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WTT_DIR = os.path.join(ROOT_DIR, "wtt_data")

EVENT_TYPE = "大满贯"
EVENT_YEAR = "2026"
EVENT_DATE = "2026-08-11"

# ============================================================
# MS (Men's Singles) - 81 matches
# ============================================================
ms_matches = [
    # Round of 64
    ("Anders LIND", "Maciej KUBIK"),
    ("JANG Woojin", "Adrien RASSENFOSSE"),
    ("Dimitrij OVTCHAROV", "Truls MOREGARD"),
    ("Anton KALLBERG", "Vladimir SIDORENKO"),
    ("Csaba ANDRAS", "Dang QIU"),
    ("Darko JORGIC", "Deni KOZUL"),
    ("Hugo CALDERANO", "William BERGENBLOCK"),
    ("FENG Yi-Hsin", "Manush SHAH"),
    ("Joao GERALDO", "Finn LUU"),
    ("Thibault PORET", "Patrick FRANZISKA"),
    ("XIANG Peng", "LIM Jonghoon"),
    ("LIN Yun-Ju", "Lubomir JANCARIK"),
    ("KUO Guan-Hong", "Benedikt DUDA"),
    ("Yukiya UDA", "Simon GAUZY"),
    ("Elias RANEFUR", "Iulian CHIRITA"),
    ("Tomislav PUCAR", "Alvaro ROBLES"),
    ("Jonathan GROTH", "Mattias KARLSSON"),
    ("Shunsuke TOGAMI", "WONG Chun Ting"),
    ("Maharu YOSHIMURA", "Kirill GERASSIMENKO"),
    ("ZHOU Qihao", "AN Jaehyun"),
    ("Cedric NUYTINCK", "Nicholas LUM"),
    ("WEN Ruibo", "Lilian BARDET"),
    ("Omar ASSAR", "CHEN Junsong"),
    ("PARK Ganghyeon", "Flavien COTON"),
    ("LIN Shidong", "CHEN Yuanyu"),
    # Qualifying Round 3
    ("Csaba ANDRAS", "Wim VERDONSCHOT"),
    ("Milosz REDZIMSKI", "HUNG Jing-Kai"),
    ("Deni KOZUL", "PARK Gyuhyeon"),
    ("Alvaro ROBLES", "KAO Cheng-Jui"),
    ("Maciej KUBIK", "Dimitrije LEVAJAC"),
    ("QUEK Izaac", "Connor GREEN"),
    ("Iulian CHIRITA", "Vladislav URSU"),
    ("Cedric NUYTINCK", "Harmeet DESAI"),
    # Qualifying Round 2
    ("Wim VERDONSCHOT", "Guilherme TEODORO"),
    ("Milosz REDZIMSKI", "Samuel WALKER"),
    ("Csaba ANDRAS", "Edward LY"),
    ("HUNG Jing-Kai", "CHAN Baldwin"),
    ("PARK Gyuhyeon", "Ricardo WALTHER"),
    ("Deni KOZUL", "Andreas LEVENKO"),
    ("Alvaro ROBLES", "Nikita ARTEMENKO"),
    ("Connor GREEN", "Andrej GACINA"),
    ("Dimitrije LEVAJAC", "Ovidiu IONESCU"),
    ("KAO Cheng-Jui", "Marek BADOWSKI"),
    ("Maciej KUBIK", "Payas JAIN"),
    ("QUEK Izaac", "Liam PITCHFORD"),
    ("Cedric NUYTINCK", "Martin ALLEGRO"),
    ("Vladislav URSU", "Ivor BAN"),
    ("Iulian CHIRITA", "Marcos FREITAS"),
    ("Harmeet DESAI", "Tom JARVIS"),
    # Qualifying Round 1
    ("CHAN Baldwin", "Bosman BOTHA"),
    ("Samuel WALKER", "Matteo MUTTI"),
    ("Milosz REDZIMSKI", "Ylane BATIX"),
    ("Edward LY", "John OYEBODE"),
    ("HUNG Jing-Kai", "LAM Siu Hang"),
    ("Csaba ANDRAS", "Aditya SAREEN"),
    ("Guilherme TEODORO", "Adam WALLIN"),
    ("PARK Gyuhyeon", "CHANG Yu-An"),
    ("Wim VERDONSCHOT", "Juan PEREZ"),
    ("Ricardo WALTHER", "Filip ZELJKO"),
    ("Andreas LEVENKO", "Dean SHU"),
    ("Deni KOZUL", "Tiago APOLONIA"),
    ("Alvaro ROBLES", "Luka MLADENOVIC"),
    ("Nikita ARTEMENKO", "Akash PAL"),
    ("Marek BADOWSKI", "Noshad ALAMIYAN"),
    ("KAO Cheng-Jui", "Martin FRIIS"),
    ("Ovidiu IONESCU", "Youssef ABDELAZIZ"),
    ("Dimitrije LEVAJAC", "Yang WANG"),
    ("Payas JAIN", "Mehdi BOULOUSSA"),
    ("Maciej KUBIK", "Abdel-Kader SALIFOU"),
    ("QUEK Izaac", "Lubomir PISTEJ"),
    ("Liam PITCHFORD", "Anders ERIKSSON"),
    ("Andrej GACINA", "Elias SJOGREN"),
    ("Connor GREEN", "Mohamed ELBEIALI"),
    ("Vladislav URSU", "Leonardo IIZUKA"),
    ("Ivor BAN", "Niagol STOYANOV"),
    ("Marcos FREITAS", "Timothy CHOI"),
    ("Cedric NUYTINCK", "Albin INGESTROM"),
    ("Iulian CHIRITA", "Gustavo GOMEZ"),
    ("Martin ALLEGRO", "Sid NARESH"),
    ("Harmeet DESAI", "Noa DAHLSTROM"),
    ("Tom JARVIS", "Darius MOVILEANU"),
]

# ============================================================
# WS (Women's Singles) - 80 matches
# ============================================================
ws_matches = [
    # Round of 64
    ("Diya CHITALE", "Sreeja AKULA"),
    ("CHENG I-Ching", "Yangzi LIU"),
    ("Sofia POLCANOVA", "LEE Eunhye"),
    ("Hina HAYATA", "Jia Nan YUAN"),
    ("Christina KALLBERG", "Margaryta PESOTSKA"),
    ("ZENG Jian", "Xiaoxin YANG"),
    ("SHIN Yubin", "Nomin BAASAN"),
    ("Nina MITTELHAM", "Bernadette SZOCS"),
    ("Satsuki ODO", "Filippa BERGAND"),
    ("SU Tsz Tung", "Maria XIAO"),
    ("PENG Yu-Han", "Prithika PAVADE"),
    ("WANG Manyu", "Dina MESHREF"),
    ("Sabine WINTER", "Bruna TAKAHASHI"),
    ("LI Yu-Jhun", "YOO Yerin"),
    ("QIN Yuxuan", "Mima ITO"),
    ("Giorgia PICCOLIN", "Charlotte LUTZ"),
    ("Elizabeta SAMARA", "Andreea DRAGOMAN"),
    ("Ying HAN", "Natalia BAJOR"),
    ("SHI Xunyao", "Mo ZHANG"),
    ("KIM Nayeong", "Amy WANG"),
    ("CHIEN Tung-Chuan", "Fu YU"),
    ("CHEN Yi", "Minhyung JEE"),
    ("Honoka HASHIMOTO", "YEH Yi-Tian"),
    ("Miyuu KIHARA", "DOO Hoi Kem"),
    # Qualifying Round 3
    ("Diya CHITALE", "Syndrela DAS"),
    ("YOO Yerin", "NG Wing Lam"),
    ("Giorgia PICCOLIN", "Sally MOYLAND"),
    ("Xiaoxin YANG", "Orawan PARANANG"),
    ("Elena ZAHARIA", "Audrey ZARIF"),
    ("CHIEN Tung-Chuan", "Sarah DE NUTTE"),
    ("PENG Yu-Han", "Xia Lian NI"),
    ("SU Tsz Tung", "HUANG Yu-Jie"),
    # Qualifying Round 2
    ("Syndrela DAS", "YANG Ha Eun"),
    ("Giorgia PICCOLIN", "Mariam ALHODABY"),
    ("Diya CHITALE", "Divyanshi BHOWMICK"),
    ("Sally MOYLAND", "TAN Zhao Yun"),
    ("YOO Yerin", "Gaia MONFARDINI"),
    ("NG Wing Lam", "Jessica REYES LAI"),
    ("Xiaoxin YANG", "TEE Ai Xin"),
    ("Orawan PARANANG", "Giulia TAKAHASHI"),
    ("Elena ZAHARIA", "Xiaona SHAN"),
    ("Audrey ZARIF", "Tin-Tin HO"),
    ("Sarah DE NUTTE", "Nicole ARLIA"),
    ("PENG Yu-Han", "Lea RAKOVAC"),
    ("CHIEN Tung-Chuan", "Zuzanna WIELGOS"),
    ("Xia Lian NI", "Jieni SHAO"),
    ("HUANG Yu-Jie", "Adina DIACONU"),
    ("SU Tsz Tung", "Constantina PSIHOGIOS"),
    # Qualifying Round 1
    ("YANG Ha Eun", "Izabela LUPULESKU"),
    ("Giorgia PICCOLIN", "SER Lin Qian"),
    ("Syndrela DAS", "LOY Ming Ying"),
    ("Divyanshi BHOWMICK", "Camille LUTZ"),
    ("TAN Zhao Yun", "Hana ARAPOVIC"),
    ("Diya CHITALE", "Yuan WAN"),
    ("Mariam ALHODABY", "Sofia-Xuan ZHANG"),
    ("Sally MOYLAND", "CHANG Li Sian"),
    ("YOO Yerin", "Tatiana KUKULKOVA"),
    ("Gaia MONFARDINI", "Laura WATANABE"),
    ("Jessica REYES LAI", "Daniela ORTEGA"),
    ("Xiaoxin YANG", "Alice NILSSON"),
    ("NG Wing Lam", "Lilou MASSART"),
    ("TEE Ai Xin", "Angelina BEBAWY"),
    ("Xiaona SHAN", "Ivana MALOBABIC"),
    ("Orawan PARANANG", "Yashaswini GHORPADE"),
    ("Giulia TAKAHASHI", "Alma ROOSE"),
    ("Elena ZAHARIA", "Debora VIVARELLI"),
    ("Audrey ZARIF", "Leah TVEIT"),
    ("Tin-Tin HO", "Sabina SURJAN"),
    ("Sarah DE NUTTE", "Franziska SCHREINER"),
    ("Nicole ARLIA", "Isa COK"),
    ("Zuzanna WIELGOS", "LYNE Karen"),
    ("CHIEN Tung-Chuan", "Sarvinoz MIRKADIROVA"),
    ("Lea RAKOVAC", "Ece HARAC"),
    ("PENG Yu-Han", "Agnes SVENSSON"),
    ("Xia Lian NI", "Zauresh AKASHEVA"),
    ("Jieni SHAO", "Katarzyna WEGRZYN"),
    ("SU Tsz Tung", "Sibel ALTINKAYA"),
    ("HUANG Yu-Jie", "HEO Yerim"),
    ("Constantina PSIHOGIOS", "Paulina VEGA"),
    ("Adina DIACONU", "Veronika MATIUNINA"),
]

# ============================================================
# MD (Men's Doubles) - 6 matches (Round of 32)
# ============================================================
md_matches = [
    ("Kristian KARLSSON/Anton KALLBERG", "Darko JORGIC/Deni KOZUL"),
    ("Daniel BERZOSA/Juan PEREZ", "RANEFUR/KARLSSON"),
    ("NARESH/NARESH", "Noa DAHLSTROM/Bosman BOTHA"),
    ("Maciej KUBIK/Milosz REDZIMSKI", "Jakub ZELINKA/Lubomir PISTEJ"),
    ("Youssef ABDELAZIZ/Mohamed ELBEIALI", "Andrej GACINA/Ivor BAN"),
    ("Ovidiu IONESCU/Darius MOVILEANU", "Tom JARVIS/Connor GREEN"),
]

# ============================================================
# WD (Women's Doubles) - 7 matches (Round of 32)
# ============================================================
wd_matches = [
    ("Nomin BAASAN/Agnes SVENSSON", "BENJEGARD/NILSSON"),
    ("Adriana DIAZ/Honoka HASHIMOTO", "LAI/SHAN"),
    ("Tatiana KUKULKOVA/Syndrela DAS", "Daniela ORTEGA/Paulina VEGA"),
    ("Dina MESHREF/Hana GODA", "Nina MITTELHAM/Yangzi LIU"),
    ("CHIEN Tung-Chuan/LI Yu-Jhun", "Christina KALLBERG/Filippa BERGAND"),
    ("Elizabeta SAMARA/Bernadette SZOCS", "Prithika PAVADE/Charlotte LUTZ"),
    ("LOY Ming Ying/SER Lin Qian", "Orawan PARANANG/Natalia BAJOR"),
]

# ============================================================
# XD (Mixed Doubles) - 8 matches (Round of 32)
# ============================================================
xd_matches = [
    ("Kristian KARLSSON/Nina MITTELHAM", "Omar ASSAR/Hana GODA"),
    ("Ovidiu IONESCU/Bernadette SZOCS", "Elias RANEFUR/Filippa BERGAND"),
    ("Gustavo GOMEZ/Daniela ORTEGA", "LY/ZHANG"),
    ("Alexis LEBRUN/Satsuki ODO", "Ivor BAN/Hana ARAPOVIC"),
    ("Anders LIND/Anna HURSEY", "Kristian KARLSSON/Christina KALLBERG"),
    ("Patrick FRANZISKA/Adriana DIAZ", "Connor GREEN/Tin-Tin HO"),
    ("LIANG/MOYLAND", "Guilherme TEODORO/Paulina VEGA"),
    ("Lubomir PISTEJ/Tatiana KUKULKOVA", "Youssef ABDELAZIZ/Mariam ALHODABY"),
]


def append_to_scorelog(category, matches):
    """Append match records to the end of the score-log file (no sorting)"""
    if category == "ws":
        filename = f"score-log-{EVENT_YEAR}-ws.json"
    else:
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    filepath = os.path.join(WTT_DIR, category, filename)

    with open(filepath, "r", encoding="utf-8-sig") as f:
        existing = json.load(f)

    existing_keys = set()
    for r in existing:
        key = (r["日期"], r["类型"], r["胜者"], r["负者"])
        existing_keys.add(key)

    new_records = []
    for winner, loser in matches:
        key = (EVENT_DATE, EVENT_TYPE, winner, loser)
        if key not in existing_keys:
            record = {
                "日期": EVENT_DATE,
                "类型": EVENT_TYPE,
                "胜者": winner,
                "负者": loser
            }
            new_records.append(record)
            existing_keys.add(key)

    all_records = existing + new_records

    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        if category == "xd":
            f.write("[\n")
            for i, record in enumerate(all_records):
                line = json.dumps(record, ensure_ascii=False)
                if i < len(all_records) - 1:
                    line += ","
                f.write(line + "\n")
            f.write("]")
        else:
            json.dump(all_records, f, ensure_ascii=False, indent=2)
            f.write("\n")

    print(f"  {category.upper()}: {len(new_records)} new records appended (total: {len(all_records)})")
    return len(new_records)


def verify_data(category, expected_count):
    """Verify the imported data"""
    if category == "ws":
        filename = f"score-log-{EVENT_YEAR}-ws.json"
    else:
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    filepath = os.path.join(WTT_DIR, category, filename)

    with open(filepath, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    event_records = [r for r in data if r["类型"] == EVENT_TYPE and r["日期"] == EVENT_DATE]
    print(f"  {category.upper()}: {len(event_records)} 大满贯/{EVENT_DATE} records (expected: {expected_count})")

    seen = set()
    dupes = 0
    for r in event_records:
        key = (r["日期"], r["类型"], r["胜者"], r["负者"])
        if key in seen:
            dupes += 1
        seen.add(key)

    if dupes > 0:
        print(f"  WARNING: {dupes} duplicate records found in {category.upper()}!")
    else:
        print(f"  {category.upper()}: No duplicates found")

    return len(event_records) == expected_count


def main():
    print("=" * 60)
    print(f"WTT Grand Smash Malmo 2026 - Data Import (append only) [{EVENT_DATE}]")
    print("=" * 60)

    print("\n[1/2] Importing match data...")
    total = 0
    total += append_to_scorelog("ms", ms_matches)
    total += append_to_scorelog("ws", ws_matches)
    total += append_to_scorelog("md", md_matches)
    total += append_to_scorelog("wd", wd_matches)
    total += append_to_scorelog("xd", xd_matches)
    print(f"\n  Total new records: {total}")

    print("\n[2/2] Verifying imported data...")
    all_ok = True
    all_ok &= verify_data("ms", len(ms_matches))
    all_ok &= verify_data("ws", len(ws_matches))
    all_ok &= verify_data("md", len(md_matches))
    all_ok &= verify_data("wd", len(wd_matches))
    all_ok &= verify_data("xd", len(xd_matches))

    if all_ok:
        print("\nAll data imported successfully!")
    else:
        print("\nVerification failed - please check the output above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
