#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Feeder Otocec 2026 - 数据录入脚本
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
    # Round of 64 - 9 Mar
    ("2026-03-09", "KIM Gaon", "Tommaso GIOVANNETTI"),
    ("2026-03-09", "Peter HRIBAR", "Norbert TAULER"),
    ("2026-03-09", "Vincent PICARD", "Keishi HAGIHARA"),
    ("2026-03-09", "Borna PETEK", "LEE Hyeonho"),
    ("2026-03-09", "David SZANTOSI", "Alexander VALUCH"),
    ("2026-03-09", "Jo YOKOTANI", "Mattias MONGIUSTI"),
    ("2026-03-09", "Rafael DE LAS HERAS", "Brin VOVK PETROVSKI"),
    ("2026-03-09", "Daniele PINTO", "Leon BENKO"),
    ("2026-03-09", "Diego LILLO", "Miguel PANTOJA"),
    ("2026-03-09", "Connor GREEN", "Maxime ANTOINE MICHARD"),
    ("2026-03-09", "Fanbo MENG", "Maciej KOLODZIEJCZYK"),
    ("2026-03-09", "Daniel BERZOSA", "Juan PEREZ"),
    ("2026-03-09", "Maciej KUBIK", "Kanta TOKUDA"),
    ("2026-03-09", "Mihai BOBOCICA", "Samuel WALKER"),
    ("2026-03-09", "Ivor BAN", "Rares SIPOS"),
    ("2026-03-09", "WOO Hyeonggyu", "Federico VALLINO"),
    # Round of 32 - 9 Mar
    ("2026-03-09", "KIM Gaon", "Eduard IONESCU"),
    ("2026-03-09", "Csaba ANDRAS", "Peter HRIBAR"),
    ("2026-03-09", "Vincent PICARD", "Guilherme TEODORO"),
    ("2026-03-09", "Mattias KARLSSON", "Borna PETEK"),
    ("2026-03-09", "Tom JARVIS", "David SZANTOSI"),
    ("2026-03-09", "LIN Yen-Chun", "Jo YOKOTANI"),
    ("2026-03-09", "Rafael DE LAS HERAS", "Darius MOVILEANU"),
    ("2026-03-09", "CHANG Yu-An", "Daniele PINTO"),
    ("2026-03-09", "Kay STUMPER", "Diego LILLO"),
    ("2026-03-09", "Connor GREEN", "Leonardo IIZUKA"),
    ("2026-03-09", "KWON Hyuk", "Fanbo MENG"),
    ("2026-03-09", "Kazuki HAMADA", "Daniel BERZOSA"),
    ("2026-03-09", "Jules ROLLAND", "Maciej KUBIK"),
    ("2026-03-09", "Mihai BOBOCICA", "Amirreza ABBASI"),
    ("2026-03-09", "Ivor BAN", "Felipe ARADO"),
    ("2026-03-09", "Leo DE NODREST", "WOO Hyeonggyu"),
    # Round of 16 - 10 Mar
    ("2026-03-10", "Csaba ANDRAS", "KIM Gaon"),
    ("2026-03-10", "Mattias KARLSSON", "Vincent PICARD"),
    ("2026-03-10", "Tom JARVIS", "LIN Yen-Chun"),
    ("2026-03-10", "CHANG Yu-An", "Rafael DE LAS HERAS"),
    ("2026-03-10", "Connor GREEN", "Kay STUMPER"),
    ("2026-03-10", "Kazuki HAMADA", "KWON Hyuk"),
    ("2026-03-10", "Mihai BOBOCICA", "Jules ROLLAND"),
    ("2026-03-10", "Leo DE NODREST", "Ivor BAN"),
    # Quarter Final - 10 Mar
    ("2026-03-10", "Mattias KARLSSON", "Csaba ANDRAS"),
    ("2026-03-10", "Tom JARVIS", "CHANG Yu-An"),
    ("2026-03-10", "Kazuki HAMADA", "Connor GREEN"),
    ("2026-03-10", "Mihai BOBOCICA", "Leo DE NODREST"),
    # Semi Final - 11 Mar
    ("2026-03-11", "Mattias KARLSSON", "Tom JARVIS"),
    ("2026-03-11", "Mihai BOBOCICA", "Kazuki HAMADA"),
    # Final - 11 Mar
    ("2026-03-11", "Mattias KARLSSON", "Mihai BOBOCICA"),
]

# ============================================================
# WS (Women's Singles) - 47 matches
# ============================================================
ws_matches = [
    # Round of 64 - 9 Mar
    ("2026-03-09", "Sara TOKIC", "Lara OPEKA"),
    ("2026-03-09", "Filippa BERGAND", "Claire PICARD"),
    ("2026-03-09", "Lilou MASSART", "Julia LEAL"),
    ("2026-03-09", "Dora COSIC", "Ana TOFANT"),
    ("2026-03-09", "Hardee PATEL", "Tijana JOKIC"),
    ("2026-03-09", "Zuzanna WIELGOS", "Arantxa COSSIO"),
    ("2026-03-09", "Manami IMAEDA", "Karina SHIRAY"),
    ("2026-03-09", "Andrea PAVLOVIC", "Laura RAHOTIN"),
    ("2026-03-09", "Klara HRABICOVA", "Lea PAULIN"),
    ("2026-03-09", "Jana VASENDOVA", "Anna KLEMPEROVA"),
    ("2026-03-09", "Elvira RAD", "Brianna BURGOS"),
    ("2026-03-09", "Rachel MORET", "Kulapassr VIJITVIRIYAGUL"),
    ("2026-03-09", "Phatsaraphon WONGLAKHON", "Anna WEGRZYN"),
    ("2026-03-09", "Yuka KANEYOSHI", "Tjasa NOVAK"),
    ("2026-03-09", "Tin-Tin HO", "Katarina STRAZAR"),
    ("2026-03-09", "Josephina NEUMANN", "Kotomi OMODA"),
    # Round of 32 - 9 Mar
    ("2026-03-09", "YEH Yi-Tian", "Sara TOKIC"),
    ("2026-03-09", "Claire PICARD", "Filippa BERGAND"),
    ("2026-03-09", "Misuzu TAKEYA", "Lilou MASSART"),
    ("2026-03-09", "Dora COSIC", "Sofia-Xuan ZHANG"),
    ("2026-03-09", "YOO Yerin", "Hardee PATEL"),
    ("2026-03-09", "Zuzanna WIELGOS", "LEE Daeun"),
    ("2026-03-09", "Hana ARAPOVIC", "Manami IMAEDA"),
    ("2026-03-09", "Christina KALLBERG", "Andrea PAVLOVIC"),
    ("2026-03-09", "Gaia MONFARDINI", "Klara HRABICOVA"),
    ("2026-03-09", "Katarzyna WEGRZYN", "Jana VASENDOVA"),
    ("2026-03-09", "Ivana MALOBABIC", "Elvira RAD"),
    ("2026-03-09", "Linda BERGSTROM", "Rachel MORET"),
    ("2026-03-09", "Phatsaraphon WONGLAKHON", "KIM Seongjin"),
    ("2026-03-09", "Yuka KANEYOSHI", "LEE Zion"),
    ("2026-03-09", "Kotomi OMODA", "Josephina NEUMANN"),
    ("2026-03-09", "Tin-Tin HO", "Lea RAKOVAC"),
    # Round of 16 - 10 Mar
    ("2026-03-10", "YEH Yi-Tian", "Claire PICARD"),
    ("2026-03-10", "Misuzu TAKEYA", "Dora COSIC"),
    ("2026-03-10", "YOO Yerin", "Zuzanna WIELGOS"),
    ("2026-03-10", "Christina KALLBERG", "Hana ARAPOVIC"),
    ("2026-03-10", "Gaia MONFARDINI", "Katarzyna WEGRZYN"),
    ("2026-03-10", "Linda BERGSTROM", "Ivana MALOBABIC"),
    ("2026-03-10", "Phatsaraphon WONGLAKHON", "Yuka KANEYOSHI"),
    ("2026-03-10", "Kotomi OMODA", "Tin-Tin HO"),
    # Quarter Final - 10 Mar
    ("2026-03-10", "YEH Yi-Tian", "Misuzu TAKEYA"),
    ("2026-03-10", "YOO Yerin", "Christina KALLBERG"),
    ("2026-03-10", "Gaia MONFARDINI", "Linda BERGSTROM"),
    ("2026-03-10", "Kotomi OMODA", "Phatsaraphon WONGLAKHON"),
    # Semi Final - 11 Mar
    ("2026-03-11", "YEH Yi-Tian", "YOO Yerin"),
    ("2026-03-11", "Kotomi OMODA", "Linda BERGSTROM"),
    # Final - 11 Mar
    ("2026-03-11", "YEH Yi-Tian", "Kotomi OMODA"),
]

# ============================================================
# MD (Men's Doubles) - 15 matches
# ============================================================
md_matches = [
    # Round of 16 - 9 Mar
    ("2026-03-09", "Keishi HAGIHARA/Jo YOKOTANI", "Leonardo IIZUKA/Guilherme TEODORO"),
    ("2026-03-09", "Daniel BERZOSA/Juan PEREZ", "KIM Gaon/KWON Hyuk"),
    ("2026-03-09", "Rafael DE LAS HERAS/Diego LILLO", "Darius MOVILEANU/Eduard IONESCU"),
    ("2026-03-09", "WOO Hyeonggyu/Vincent PICARD", "Alexander VALUCH/Samuel PALUSEK"),
    ("2026-03-09", "Leon BENKO/Ivan HENCL", "Miha PODOBNIK/Brin VOVK PETROVSKI"),
    ("2026-03-09", "Kazuki HAMADA/Kanta TOKUDA", "Connor GREEN/Samuel WALKER"),
    ("2026-03-09", "Ivor BAN/Csaba ANDRAS", "Maciej KOLODZIEJCZYK/Julian RZIHAUSCHEK"),
    ("2026-03-09", "Leo DE NODREST/Jules ROLLAND", "CHANG Yu-An/LIN Yen-Chun"),
    # Quarter Final - 10 Mar
    ("2026-03-10", "Daniel BERZOSA/Juan PEREZ", "Keishi HAGIHARA/Jo YOKOTANI"),
    ("2026-03-10", "Rafael DE LAS HERAS/Diego LILLO", "WOO Hyeonggyu/Vincent PICARD"),
    ("2026-03-10", "Kazuki HAMADA/Kanta TOKUDA", "Leon BENKO/Ivan HENCL"),
    ("2026-03-10", "Leo DE NODREST/Jules ROLLAND", "Ivor BAN/Csaba ANDRAS"),
    # Semi Final - 10 Mar
    ("2026-03-10", "Rafael DE LAS HERAS/Diego LILLO", "Daniel BERZOSA/Juan PEREZ"),
    ("2026-03-10", "Leo DE NODREST/Jules ROLLAND", "Kazuki HAMADA/Kanta TOKUDA"),
    # Final - 11 Mar
    ("2026-03-11", "Rafael DE LAS HERAS/Diego LILLO", "Leo DE NODREST/Jules ROLLAND"),
]

# ============================================================
# WD (Women's Doubles) - 15 matches
# ============================================================
wd_matches = [
    # Round of 16 - 9 Mar
    ("2026-03-09", "Phatsaraphon WONGLAKHON/Kulapassr VIJITVIRIYAGUL", "Jana VASENDOVA/Klara HRABICOVA"),
    ("2026-03-09", "Zuzanna WIELGOS/Gaia MONFARDINI", "Lea PAULIN/Tjasa NOVAK"),
    ("2026-03-09", "Misuzu TAKEYA/Yuka KANEYOSHI", "Ivana MALOBABIC/Andrea PAVLOVIC"),
    ("2026-03-09", "Sofia-Xuan ZHANG/Elvira RAD", "Tijana JOKIC/Dora COSIC"),
    ("2026-03-09", "Anna WEGRZYN/Katarzyna WEGRZYN", "Lilou MASSART/Brianna BURGOS"),
    ("2026-03-09", "Sara TOKIC/Ana TOFANT", "Lara OPEKA/Katarina STRAZAR"),
    ("2026-03-09", "Kotomi OMODA/Manami IMAEDA", "Linda BERGSTROM/Christina KALLBERG"),
    # Quarter Final - 10 Mar
    ("2026-03-10", "KIM Seongjin/LEE Daeun", "Phatsaraphon WONGLAKHON/Kulapassr VIJITVIRIYAGUL"),
    ("2026-03-10", "Misuzu TAKEYA/Yuka KANEYOSHI", "Zuzanna WIELGOS/Gaia MONFARDINI"),
    ("2026-03-10", "Anna WEGRZYN/Katarzyna WEGRZYN", "Sofia-Xuan ZHANG/Elvira RAD"),
    ("2026-03-10", "Kotomi OMODA/Manami IMAEDA", "Sara TOKIC/Ana TOFANT"),
    # Semi Final - 10 Mar
    ("2026-03-10", "Misuzu TAKEYA/Yuka KANEYOSHI", "KIM Seongjin/LEE Daeun"),
    ("2026-03-10", "Kotomi OMODA/Manami IMAEDA", "Anna WEGRZYN/Katarzyna WEGRZYN"),
    # Final - 11 Mar
    ("2026-03-11", "KIM Seongjin/LEE Daeun", "Kotomi OMODA/Manami IMAEDA"),
]

# ============================================================
# XD (Mixed Doubles) - 15 matches
# ============================================================
xd_matches = [
    # Round of 16 - 9 Mar
    ("2026-03-09", "Ivor BAN/Hana ARAPOVIC", "Peter HRIBAR/Ana TOFANT"),
    ("2026-03-09", "Ivan HENCL/Dora COSIC", "Damjan ZELKO/Lara OPEKA"),
    ("2026-03-09", "Keishi HAGIHARA/Kotomi OMODA", "Joao MONTEIRO/Julia LEAL"),
    ("2026-03-09", "WOO Hyeonggyu/LEE Daeun", "Darius MOVILEANU/Lilou MASSART"),
    ("2026-03-09", "Brin VOVK PETROVSKI/Sara TOKIC", "Ziga ZIGON/Tjasa NOVAK"),
    ("2026-03-09", "Maciej KUBIK/Zuzanna WIELGOS", "Vit KADLEC/Klara HRABICOVA"),
    ("2026-03-09", "Riyan DUTTA/Hardee PATEL", "Gregor ZAFOSTNIK/Lea PAULIN"),
    ("2026-03-09", "Connor GREEN/Tin-Tin HO", "Miha PODOBNIK/Katarina STRAZAR"),
    # Quarter Final - 9 Mar
    ("2026-03-09", "Ivor BAN/Hana ARAPOVIC", "Ivan HENCL/Dora COSIC"),
    ("2026-03-09", "Keishi HAGIHARA/Kotomi OMODA", "WOO Hyeonggyu/LEE Daeun"),
    ("2026-03-09", "Brin VOVK PETROVSKI/Sara TOKIC", "Maciej KUBIK/Zuzanna WIELGOS"),
    ("2026-03-09", "Connor GREEN/Tin-Tin HO", "Riyan DUTTA/Hardee PATEL"),
    # Semi Final - 10 Mar
    ("2026-03-10", "Keishi HAGIHARA/Kotomi OMODA", "Ivor BAN/Hana ARAPOVIC"),
    ("2026-03-10", "Connor GREEN/Tin-Tin HO", "Brin VOVK PETROVSKI/Sara TOKIC"),
    # Final - 11 Mar
    ("2026-03-11", "Keishi HAGIHARA/Kotomi OMODA", "Connor GREEN/Tin-Tin HO"),
]


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
    print("WTT Feeder Otocec 2026 - Data Import (append only)")
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
