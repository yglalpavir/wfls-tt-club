#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Feeder Düsseldorf 2026 - 数据录入脚本
直接追加到 score-log 文件末尾，不排序
"""

import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WTT_DIR = os.path.join(ROOT_DIR, "wtt_data")

EVENT_TYPE = "支线赛"
EVENT_YEAR = "2026"

# ============================================================
# MS (Men's Singles) - 47 matches (16 R64 + 16 R32 + 8 R16 + 4 QF + 2 SF + 1 F)
# ============================================================
ms_matches = [
    # Round of 64 - 4 Mar
    ("2026-03-04", "Maciej KUBIK", "Keishi HAGIHARA"),
    ("2026-03-04", "Borgar HAUG", "Nandan NARESH"),
    ("2026-03-04", "Ivor BAN", "KWON Hyuk"),
    ("2026-03-04", "Laurens DEVOS", "Daniel BERZOSA"),
    ("2026-03-04", "Sota NODA", "Loic STOLL"),
    ("2026-03-04", "Samuel WALKER", "Bakdaulet AKIMALI"),
    ("2026-03-04", "Andrei PUTUNTICA", "Lleyton ULLMANN"),
    ("2026-03-04", "Guilherme TEODORO", "Tom SCHWEIGER"),
    ("2026-03-04", "Alberto MINO", "Benno OEHME"),
    ("2026-03-04", "LIN Yen-Chun", "Gabrielius CAMARA"),
    ("2026-03-04", "Marek BADOWSKI", "KIM Gaon"),
    ("2026-03-04", "Filip ZELJKO", "Tomoki OMODA"),
    ("2026-03-04", "Andrei ISTRATE", "Rafael DE LAS HERAS"),
    ("2026-03-04", "Mateusz ZALEWSKI", "TSENG Tzu-Yu"),
    ("2026-03-04", "Panagiotis GIONIS", "Fanbo MENG"),
    ("2026-03-04", "Andreas LEVENKO", "Jann Mari NAYRE"),
    # Round of 32 - 4 Mar
    ("2026-03-04", "Leo DE NODREST", "Maciej KUBIK"),
    ("2026-03-04", "Cedric MEISSNER", "Borgar HAUG"),
    ("2026-03-04", "Kay STUMPER", "Ivor BAN"),
    ("2026-03-04", "Ricardo WALTHER", "Laurens DEVOS"),
    ("2026-03-04", "Adrien RASSENFOSSE", "Sota NODA"),
    ("2026-03-04", "Samuel WALKER", "Rogelio CASTRO"),
    ("2026-03-04", "Andrei PUTUNTICA", "Cedric NUYTINCK"),
    ("2026-03-04", "Andre BERTELSMEIER", "Guilherme TEODORO"),
    ("2026-03-04", "Kirill GERASSIMENKO", "Alberto MINO"),
    ("2026-03-04", "Steffen MENGEL", "LIN Yen-Chun"),
    ("2026-03-04", "Marek BADOWSKI", "Leonardo IIZUKA"),
    ("2026-03-04", "Filip ZELJKO", "Wim VERDONSCHOT"),
    ("2026-03-04", "Andrei ISTRATE", "Tom JARVIS"),
    ("2026-03-04", "Luka MLADENOVIC", "Mateusz ZALEWSKI"),
    ("2026-03-04", "Panagiotis GIONIS", "Edward LY"),
    ("2026-03-04", "Kazuki HAMADA", "Andreas LEVENKO"),
    # Round of 16 - 5 Mar
    ("2026-03-05", "Leo DE NODREST", "Cedric MEISSNER"),
    ("2026-03-05", "Ricardo WALTHER", "Kay STUMPER"),
    ("2026-03-05", "Adrien RASSENFOSSE", "Samuel WALKER"),
    ("2026-03-05", "Andre BERTELSMEIER", "Andrei PUTUNTICA"),
    ("2026-03-05", "Steffen MENGEL", "Kirill GERASSIMENKO"),
    ("2026-03-05", "Filip ZELJKO", "Marek BADOWSKI"),
    ("2026-03-05", "Luka MLADENOVIC", "Andrei ISTRATE"),
    ("2026-03-05", "Panagiotis GIONIS", "Kazuki HAMADA"),
    # Quarter Final - 5 Mar
    ("2026-03-05", "Ricardo WALTHER", "Leo DE NODREST"),
    ("2026-03-05", "Adrien RASSENFOSSE", "Andre BERTELSMEIER"),
    ("2026-03-05", "Filip ZELJKO", "Steffen MENGEL"),
    ("2026-03-05", "Luka MLADENOVIC", "Panagiotis GIONIS"),
    # Semi Final - 6 Mar
    ("2026-03-06", "Adrien RASSENFOSSE", "Ricardo WALTHER"),
    ("2026-03-06", "Filip ZELJKO", "Luka MLADENOVIC"),
    # Final - 6 Mar
    ("2026-03-06", "Adrien RASSENFOSSE", "Filip ZELJKO"),
]

# ============================================================
# WS (Women's Singles) - 47 matches
# ============================================================
ws_matches = [
    # Round of 64 - 4 Mar
    ("2026-03-04", "Victoria STRASSBURGER", "Julia LEAL"),
    ("2026-03-04", "Karina SHIRAY", "Sarvinoz MIRKADIROVA"),
    ("2026-03-04", "Anastasiya DYMYTRENKO", "Nomin BAASAN"),
    ("2026-03-04", "Veronika MATIUNINA", "Elisavet TERPOU"),
    ("2026-03-04", "Matilde PINTO", "Tijana JOKIC"),
    ("2026-03-04", "Shuohan MEN", "Koharu ITAGAKI"),
    ("2026-03-04", "Xia Lian NI", "Debora VIVARELLI"),
    ("2026-03-04", "Adina DIACONU", "Tin-Tin HO"),
    ("2026-03-04", "Sophia KLEE", "Manami IMAEDA"),
    ("2026-03-04", "Vivien SCHOLZ", "Dora COSIC"),
    ("2026-03-04", "Franziska SCHREINER", "Josephina NEUMANN"),
    ("2026-03-04", "Barbora VARADY", "Hardee PATEL"),
    ("2026-03-04", "Elise PUJOL", "Leah TVEIT"),
    ("2026-03-04", "Elisa NGUYEN", "Enisa SADIKOVIC"),
    ("2026-03-04", "Lorena MORSCH", "Mari BALDWIN"),
    ("2026-03-04", "Yuka KANEYOSHI", "Dominika WILTSCHKOVA"),
    # Round of 32 - 4 Mar
    ("2026-03-04", "Anna HURSEY", "Victoria STRASSBURGER"),
    ("2026-03-04", "Brianna BURGOS", "Karina SHIRAY"),
    ("2026-03-04", "Christina KALLBERG", "Anastasiya DYMYTRENKO"),
    ("2026-03-04", "Natalia BAJOR", "Veronika MATIUNINA"),
    ("2026-03-04", "Mo ZHANG", "Matilde PINTO"),
    ("2026-03-04", "Kotomi OMODA", "Shuohan MEN"),
    ("2026-03-04", "Xiaona SHAN", "Xia Lian NI"),
    ("2026-03-04", "LI Yu-Jhun", "Adina DIACONU"),
    ("2026-03-04", "HUANG Yu-Jie", "Sophia KLEE"),
    ("2026-03-04", "Izabela LUPULESKU", "Vivien SCHOLZ"),
    ("2026-03-04", "Franziska SCHREINER", "Giulia TAKAHASHI"),
    ("2026-03-04", "YEH Yi-Tian", "Barbora VARADY"),
    ("2026-03-04", "Margaryta PESOTSKA", "Elise PUJOL"),
    ("2026-03-04", "CHIEN Tung-Chuan", "Elisa NGUYEN"),
    ("2026-03-04", "Sabina SURJAN", "Lorena MORSCH"),
    ("2026-03-04", "Yuka KANEYOSHI", "Annett KAUFMANN"),
    # Round of 16 - 5 Mar
    ("2026-03-05", "Anna HURSEY", "Brianna BURGOS"),
    ("2026-03-05", "Natalia BAJOR", "Christina KALLBERG"),
    ("2026-03-05", "Kotomi OMODA", "Mo ZHANG"),
    ("2026-03-05", "LI Yu-Jhun", "Xiaona SHAN"),
    ("2026-03-05", "Izabela LUPULESKU", "HUANG Yu-Jie"),
    ("2026-03-05", "YEH Yi-Tian", "Franziska SCHREINER"),
    ("2026-03-05", "Margaryta PESOTSKA", "CHIEN Tung-Chuan"),
    ("2026-03-05", "Yuka KANEYOSHI", "Sabina SURJAN"),
    # Quarter Final - 5 Mar
    ("2026-03-05", "Anna HURSEY", "Natalia BAJOR"),
    ("2026-03-05", "Kotomi OMODA", "LI Yu-Jhun"),
    ("2026-03-05", "YEH Yi-Tian", "Izabela LUPULESKU"),
    ("2026-03-05", "Yuka KANEYOSHI", "Margaryta PESOTSKA"),
    # Semi Final - 6 Mar
    ("2026-03-06", "Anna HURSEY", "Kotomi OMODA"),
    ("2026-03-06", "Yuka KANEYOSHI", "YEH Yi-Tian"),
    # Final - 6 Mar
    ("2026-03-06", "Yuka KANEYOSHI", "Anna HURSEY"),
]

# ============================================================
# MD (Men's Doubles) - 15 matches
# ============================================================
md_matches = [
    # Round of 16 - 4 Mar
    ("2026-03-04", "Wim VERDONSCHOT/Cedric MEISSNER", "Guilherme TEODORO/Leonardo IIZUKA"),
    ("2026-03-04", "Ivor BAN/Filip ZELJKO", "Tom SCHWEIGER/Andre BERTELSMEIER"),
    ("2026-03-04", "Nazar TRETIAK/Anton LIMONOV", "Connor GREEN/Samuel WALKER"),
    ("2026-03-04", "Sota NODA/Tomoki OMODA", "Aidos KENZHIGULOV/Dastan KENZHIGULOV"),
    ("2026-03-04", "Keishi HAGIHARA/Hayato MIKI", "Sanzhar ZHUBANOV/Bakdaulet AKIMALI"),
    ("2026-03-04", "Luka MLADENOVIC/Leo DE NODREST", "Leon BENKO/Ivan HENCL"),
    ("2026-03-04", "Iskender KHARKI/Irisbek ARTUKMETOV", "Fanbo MENG/Kay STUMPER"),
    ("2026-03-04", "Kazuki HAMADA/Kanta TOKUDA", "Laurens DEVOS/Mael VAN DESSEL"),
    # Quarter Final - 5 Mar
    ("2026-03-05", "Wim VERDONSCHOT/Cedric MEISSNER", "Ivor BAN/Filip ZELJKO"),
    ("2026-03-05", "Sota NODA/Tomoki OMODA", "Nazar TRETIAK/Anton LIMONOV"),
    ("2026-03-05", "Luka MLADENOVIC/Leo DE NODREST", "Keishi HAGIHARA/Hayato MIKI"),
    ("2026-03-05", "Kazuki HAMADA/Kanta TOKUDA", "Iskender KHARKI/Irisbek ARTUKMETOV"),
    # Semi Final - 5 Mar
    ("2026-03-05", "Sota NODA/Tomoki OMODA", "Wim VERDONSCHOT/Cedric MEISSNER"),
    ("2026-03-05", "Kazuki HAMADA/Kanta TOKUDA", "Luka MLADENOVIC/Leo DE NODREST"),
    # Final - 6 Mar
    ("2026-03-06", "Sota NODA/Tomoki OMODA", "Kazuki HAMADA/Kanta TOKUDA"),
]

# ============================================================
# WD (Women's Doubles) - 15 matches
# ============================================================
wd_matches = [
    # Round of 16 - 4 Mar
    ("2026-03-04", "CHIEN Tung-Chuan/LI Yu-Jhun", "Shuohan MEN/Mo ZHANG"),
    ("2026-03-04", "Dora COSIC/Tijana JOKIC", "Matilde PINTO/Julia LEAL"),
    ("2026-03-04", "Tin-Tin HO/Anna HURSEY", "Koharu ITAGAKI/Lisa WANG"),
    ("2026-03-04", "Giulia TAKAHASHI/Karina SHIRAY", "Enisa SADIKOVIC/Vivien SCHOLZ"),
    ("2026-03-04", "Veronika MATIUNINA/Anastasiya DYMYTRENKO", "Jasmin WONG/Hannah SILCOCK"),
    ("2026-03-04", "Izabela LUPULESKU/Sabina SURJAN", "Franziska SCHREINER/Sophia KLEE"),
    ("2026-03-04", "Manami IMAEDA/Kotomi OMODA", "Josephina NEUMANN/Lorena MORSCH"),
    ("2026-03-04", "Natalia BAJOR/Barbora VARADY", "Xia Lian NI/Sarah DE NUTTE"),
    # Quarter Final - 5 Mar
    ("2026-03-05", "CHIEN Tung-Chuan/LI Yu-Jhun", "Dora COSIC/Tijana JOKIC"),
    ("2026-03-05", "Tin-Tin HO/Anna HURSEY", "Giulia TAKAHASHI/Karina SHIRAY"),
    ("2026-03-05", "Izabela LUPULESKU/Sabina SURJAN", "Veronika MATIUNINA/Anastasiya DYMYTRENKO"),
    ("2026-03-05", "Natalia BAJOR/Barbora VARADY", "Manami IMAEDA/Kotomi OMODA"),
    # Semi Final - 5 Mar
    ("2026-03-05", "CHIEN Tung-Chuan/LI Yu-Jhun", "Tin-Tin HO/Anna HURSEY"),
    ("2026-03-05", "Natalia BAJOR/Barbora VARADY", "Izabela LUPULESKU/Sabina SURJAN"),
    # Final - 6 Mar
    ("2026-03-06", "CHIEN Tung-Chuan/LI Yu-Jhun", "Natalia BAJOR/Barbora VARADY"),
]

# ============================================================
# XD (Mixed Doubles) - 15 matches
# ============================================================
xd_matches = [
    # Round of 16 - 4 Mar
    ("2026-03-04", "Samuel ARPAS/Barbora VARADY", "Guilherme TEODORO/Giulia TAKAHASHI"),
    ("2026-03-04", "Wim VERDONSCHOT/Josephina NEUMANN", "Hayato MIKI/Manami IMAEDA"),
    ("2026-03-04", "Connor GREEN/Tin-Tin HO", "Ricardo WALTHER/Ying HAN"),
    ("2026-03-04", "Ivan HENCL/Dora COSIC", "Mael VAN DESSEL/Enisa SADIKOVIC"),
    ("2026-03-04", "Edward LY/Mo ZHANG", "Jann Mari NAYRE/Shuohan MEN"),
    ("2026-03-04", "Tomoki OMODA/Kotomi OMODA", "Iskender KHARKI/Sarvinoz MIRKADIROVA"),
    ("2026-03-04", "Maciej KUBIK/Natalia BAJOR", "Dimitrij OVTCHAROV/Annett KAUFMANN"),
    ("2026-03-04", "Borgar HAUG/Anna HURSEY", "Nandan NARESH/Sophia KLEE"),
    # Quarter Final - 5 Mar
    ("2026-03-05", "Samuel ARPAS/Barbora VARADY", "Wim VERDONSCHOT/Josephina NEUMANN"),
    ("2026-03-05", "Connor GREEN/Tin-Tin HO", "Ivan HENCL/Dora COSIC"),
    ("2026-03-05", "Edward LY/Mo ZHANG", "Tomoki OMODA/Kotomi OMODA"),
    ("2026-03-05", "Borgar HAUG/Anna HURSEY", "Maciej KUBIK/Natalia BAJOR"),
    # Semi Final - 5 Mar
    ("2026-03-05", "Connor GREEN/Tin-Tin HO", "Samuel ARPAS/Barbora VARADY"),
    ("2026-03-05", "Borgar HAUG/Anna HURSEY", "Edward LY/Mo ZHANG"),
    # Final - 6 Mar
    ("2026-03-06", "Connor GREEN/Tin-Tin HO", "Borgar HAUG/Anna HURSEY"),
]


def normalize_name(name):
    """统一姓名内的混合大小写异常（如 NatalIA -> Natalia、PaulINE -> Pauline），
    防止同一球员因录入笔误被拆成多个档案。
    处理单位：按空格分词、连字符再分段；全大写姓氏（BAJOR）、正常首字母大写词
    （Natalia / Tung-Chuan / Tin-Tin / DE NUTTE 的 DE）原样通过。
    注意：不调整姓氏与名字的先后顺序；整词全大写的名字（如 CLEMENT LAINE）无法自动识别，需人工核对。"""
    def fix_part(p):
        if len(p) < 2 or p.isupper() or p.islower():
            return p
        if p[0].isupper() and p[1:].islower():
            return p
        fixed = p[0].upper() + p[1:].lower()
        print(f"  [normalize] {p} -> {fixed}")
        return fixed

    def fix_word(w):
        return "-".join(fix_part(part) for part in w.split("-"))

    return "/".join(" ".join(fix_word(w) for w in team.split())
                    for team in name.split("/"))


def append_to_scorelog(category, matches):
    """Append match records to the end of the score-log file (no sorting)"""
    # Determine file name
    if category == "ws":
        filename = f"score-log-{EVENT_YEAR}-ws.json"
    elif category == "ms":
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    elif category == "md":
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    elif category == "wd":
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    elif category == "xd":
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    else:
        raise ValueError(f"Unknown category: {category}")

    filepath = os.path.join(WTT_DIR, category, filename)

    # Read existing data
    with open(filepath, "r", encoding="utf-8-sig") as f:
        existing = json.load(f)

    # Build set of existing records for deduplication
    existing_keys = set()
    for r in existing:
        key = (r["日期"], r["类型"], r["胜者"], r["负者"])
        existing_keys.add(key)

    # Build new records
    new_records = []
    for date, winner, loser in matches:
        winner = normalize_name(winner)
        loser = normalize_name(loser)
        key = (date, EVENT_TYPE, winner, loser)
        if key not in existing_keys:
            record = {
                "日期": date,
                "类型": EVENT_TYPE,
                "胜者": winner,
                "负者": loser
            }
            new_records.append(record)
            existing_keys.add(key)

    # Append to end (no sorting)
    all_records = existing + new_records

    # Write back - XD uses compact format, others use indented
    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        if category == "xd":
            # Compact single-line format for XD
            f.write("[\n")
            for i, record in enumerate(all_records):
                line = json.dumps(record, ensure_ascii=False)
                if i < len(all_records) - 1:
                    line += ","
                f.write(line + "\n")
            f.write("]")
        else:
            # Indented format for others
            json.dump(all_records, f, ensure_ascii=False, indent=2)
            f.write("\n")

    print(f"  {category.upper()}: {len(new_records)} new records appended (total: {len(all_records)})")
    return len(new_records)


def main():
    print("=" * 60)
    print("WTT Feeder Düsseldorf 2026 - Data Import (append only)")
    print("=" * 60)

    # Import match data
    print("\nImporting match data...")
    total = 0
    total += append_to_scorelog("ms", ms_matches)
    total += append_to_scorelog("ws", ws_matches)
    total += append_to_scorelog("md", md_matches)
    total += append_to_scorelog("wd", wd_matches)
    total += append_to_scorelog("xd", xd_matches)
    print(f"\n  Total new records: {total}")


if __name__ == "__main__":
    main()
