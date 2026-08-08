#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Feeder Lille 2026 - 数据录入脚本
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
# MS (Men's Singles) - 31 matches
# ============================================================
ms_matches = [
    # Round of 32 - 29 Jan
    ("2026-01-29", "Flavien COTON", "Esteban DORR"),
    ("2026-01-29", "Bastien DUPONT", "Martin ALLEGRO"),
    ("2026-01-29", "Niagol STOYANOV", "Clement LAINE"),
    ("2026-01-29", "Jules ROLLAND", "Marek BADOWSKI"),
    ("2026-01-29", "Joe SEYFRIED", "Vincent PICARD"),
    ("2026-01-29", "Amir Hossein HODAEI", "Daniel BERZOSA"),
    ("2026-01-29", "Csaba ANDRAS", "Tommaso GIOVANNETTI"),
    ("2026-01-29", "Marcos FREITAS", "Remi BETELU"),
    ("2026-01-29", "Mateusz ZALEWSKI", "Luka MLADENOVIC"),
    ("2026-01-29", "Diego LILLO", "Fabio RAKOTOARIMANANA"),
    ("2026-01-29", "Wim VERDONSCHOT", "Martin FRIIS"),
    ("2026-01-29", "Romain RUIZ", "Adrien RASSENFOSSE"),
    ("2026-01-29", "Andre BERTELSMEIER", "Mael VAN DESSEL"),
    ("2026-01-29", "Maciej KUBIK", "Antoine RAZAFINARIVO"),
    ("2026-01-29", "Alexis KOURAICHI", "Romain BRARD"),
    ("2026-01-29", "Mehdi BOULOUSSA", "Leo DE NODREST"),
    # Round of 16 - 30 Jan
    ("2026-01-30", "Flavien COTON", "Bastien DUPONT"),
    ("2026-01-30", "Jules ROLLAND", "Niagol STOYANOV"),
    ("2026-01-30", "Joe SEYFRIED", "Amir Hossein HODAEI"),
    ("2026-01-30", "Csaba ANDRAS", "Marcos FREITAS"),
    ("2026-01-30", "Mateusz ZALEWSKI", "Diego LILLO"),
    ("2026-01-30", "Wim VERDONSCHOT", "Romain RUIZ"),
    ("2026-01-30", "Andre BERTELSMEIER", "Maciej KUBIK"),
    ("2026-01-30", "Alexis KOURAICHI", "Mehdi BOULOUSSA"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "Jules ROLLAND", "Flavien COTON"),
    ("2026-01-30", "Joe SEYFRIED", "Csaba ANDRAS"),
    ("2026-01-30", "Wim VERDONSCHOT", "Mateusz ZALEWSKI"),
    ("2026-01-30", "Andre BERTELSMEIER", "Alexis KOURAICHI"),
    # Semi Final - 31 Jan
    ("2026-01-31", "Jules ROLLAND", "Joe SEYFRIED"),
    ("2026-01-31", "Wim VERDONSCHOT", "Andre BERTELSMEIER"),
    # Final - 31 Jan
    ("2026-01-31", "Wim VERDONSCHOT", "Jules ROLLAND"),
]

# ============================================================
# WS (Women's Singles) - 31 matches
# ============================================================
ws_matches = [
    # Round of 32 - 29 Jan
    ("2026-01-29", "Katarzyna WEGRZYN", "LI Yu-Jhun"),
    ("2026-01-29", "Anna WEGRZYN", "Nandeshwaree JALIM"),
    ("2026-01-29", "Elvira RAD", "Lilou MASSART"),
    ("2026-01-29", "CHIEN Tung-Chuan", "Audrey ZARIF"),
    ("2026-01-29", "Britt EERLAND", "Leana HOCHART"),
    ("2026-01-29", "Debora VIVARELLI", "Jade HUYNH"),
    ("2026-01-29", "Nina GUO ZHENG", "Hana ARAPOVIC"),
    ("2026-01-29", "Giorgia PICCOLIN", "Ivana MALOBABIC"),
    ("2026-01-29", "Gaia MONFARDINI", "Sarah DE NUTTE"),
    ("2026-01-29", "Matilda HANSSON", "Elise PUJOL"),
    ("2026-01-29", "Sofia-Xuan ZHANG", "Dora COSIC"),
    ("2026-01-29", "Natalia BAJOR", "Andrea PAVLOVIC"),
    ("2026-01-29", "Yuan WAN", "Nicole ARLIA"),
    ("2026-01-29", "Adina DIACONU", "Isa COK"),
    ("2026-01-29", "Camille LUTZ", "Rachel MORET"),
    ("2026-01-29", "Zuzanna WIELGOS", "Charlotte LUTZ"),
    # Round of 16 - 30 Jan
    ("2026-01-30", "Katarzyna WEGRZYN", "Anna WEGRZYN"),
    ("2026-01-30", "CHIEN Tung-Chuan", "Elvira RAD"),
    ("2026-01-30", "Britt EERLAND", "Debora VIVARELLI"),
    ("2026-01-30", "Giorgia PICCOLIN", "Nina GUO ZHENG"),
    ("2026-01-30", "Gaia MONFARDINI", "Matilda HANSSON"),
    ("2026-01-30", "Natalia BAJOR", "Sofia-Xuan ZHANG"),
    ("2026-01-30", "Yuan WAN", "Adina DIACONU"),
    ("2026-01-30", "Camille LUTZ", "Zuzanna WIELGOS"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "Katarzyna WEGRZYN", "CHIEN Tung-Chuan"),
    ("2026-01-30", "Britt EERLAND", "Giorgia PICCOLIN"),
    ("2026-01-30", "Natalia BAJOR", "Gaia MONFARDINI"),
    ("2026-01-30", "Camille LUTZ", "Yuan WAN"),
    # Semi Final - 31 Jan
    ("2026-01-31", "Katarzyna WEGRZYN", "Britt EERLAND"),
    ("2026-01-31", "Natalia BAJOR", "Camille LUTZ"),
    # Final - 31 Jan
    ("2026-01-31", "Katarzyna WEGRZYN", "Natalia BAJOR"),
]

# ============================================================
# MD (Men's Doubles) - 15 matches
# ============================================================
md_matches = [
    # Round of 16 - 29 Jan
    ("2026-01-29", "Martin ALLEGRO/Adrien RASSENFOSSE", "Fabio RAKOTOARIMANANA/Antoine RAZAFINARIVO"),
    ("2026-01-29", "Vincent PICARD/Alexis KOURAICHI", "Leon BENKO/Ivan HENCL"),
    ("2026-01-29", "Wim VERDONSCHOT/Andre BERTELSMEIER", "Daniel BERZOSA/Miguel PANTOJA"),
    ("2026-01-29", "Maciej KUBIK/Mateusz ZALEWSKI", "Norbert TAULER/Albert VILARDELL"),
    ("2026-01-29", "Denis DORCESCU/Benjamin FRUCHART", "Maheidine BELLA/Noah VITEL"),
    ("2026-01-29", "Diego LILLO/Rafael DE LAS HERAS", "Barish MOULLET/Sam BOCCARD"),
    ("2026-01-29", "Nathan LAM/Antoine NOIRAULT", "Itay AVIVI/Eitay SHUSHAN"),
    ("2026-01-29", "Jules ROLLAND/Leo DE NODREST", "Antoine DOYEN/Alex NAUMI"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "Martin ALLEGRO/Adrien RASSENFOSSE", "Vincent PICARD/Alexis KOURAICHI"),
    ("2026-01-30", "Maciej KUBIK/Mateusz ZALEWSKI", "Wim VERDONSCHOT/Andre BERTELSMEIER"),
    ("2026-01-30", "Diego LILLO/Rafael DE LAS HERAS", "Denis DORCESCU/Benjamin FRUCHART"),
    ("2026-01-30", "Jules ROLLAND/Leo DE NODREST", "Nathan LAM/Antoine NOIRAULT"),
    # Semi Final - 30 Jan
    ("2026-01-30", "Martin ALLEGRO/Adrien RASSENFOSSE", "Maciej KUBIK/Mateusz ZALEWSKI"),
    ("2026-01-30", "Jules ROLLAND/Leo DE NODREST", "Diego LILLO/Rafael DE LAS HERAS"),
    # Final - 31 Jan
    ("2026-01-31", "Jules ROLLAND/Leo DE NODREST", "Martin ALLEGRO/Adrien RASSENFOSSE"),
]

# ============================================================
# WD (Women's Doubles) - 14 matches
# ============================================================
wd_matches = [
    # Round of 16 - 29 Jan
    ("2026-01-29", "CHIEN Tung-Chuan/LI Yu-Jhun", "Nomin BAASAN/Matilda HANSSON"),
    ("2026-01-29", "Leana HOCHART/Nina GUO ZHENG", "Jeanne ROBBES/Vivien SCHOLZ"),
    ("2026-01-29", "Natalia BAJOR/Zuzanna WIELGOS", "Karoline MISCHEK/Dora COSIC"),
    ("2026-01-29", "Elvira RAD/Ainhoa CRISTOBAL", "Agathe AVEZOU/Clea DE STOPPELEIRE"),
    ("2026-01-29", "Fanny DOUTAZ/Ludivine MAURER", "Rheann CHUNG/Camila ARGUELLES"),
    ("2026-01-29", "Nicole ARLIA/Gaia MONFARDINI", "Giorgia PICCOLIN/Debora VIVARELLI"),
    ("2026-01-29", "Anna WEGRZYN/Katarzyna WEGRZYN", "Jade HUYNH/Elise PUJOL"),
    ("2026-01-29", "Audrey ZARIF/Camille LUTZ", "Rachel MORET/Sarah DE NUTTE"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "CHIEN Tung-Chuan/LI Yu-Jhun", "Leana HOCHART/Nina GUO ZHENG"),
    ("2026-01-30", "Natalia BAJOR/Zuzanna WIELGOS", "Elvira RAD/Ainhoa CRISTOBAL"),
    ("2026-01-30", "Nicole ARLIA/Gaia MONFARDINI", "Fanny DOUTAZ/Ludivine MAURER"),
    ("2026-01-30", "Anna WEGRZYN/Katarzyna WEGRZYN", "Audrey ZARIF/Camille LUTZ"),
    # Semi Final - 30 Jan
    ("2026-01-30", "CHIEN Tung-Chuan/LI Yu-Jhun", "Natalia BAJOR/Zuzanna WIELGOS"),
    ("2026-01-30", "Nicole ARLIA/Gaia MONFARDINI", "Anna WEGRZYN/Katarzyna WEGRZYN"),
    # Final - 31 Jan
    ("2026-01-31", "CHIEN Tung-Chuan/LI Yu-Jhun", "Nicole ARLIA/Gaia MONFARDINI"),
]

# ============================================================
# XD (Mixed Doubles) - 15 matches
# ============================================================
xd_matches = [
    # Round of 16 - 29 Jan
    ("2026-01-29", "Flavien COTON/Charlotte LUTZ", "Eitay SHUSHAN/Vivien SCHOLZ"),
    ("2026-01-29", "Sam BOCCARD/Fanny DOUTAZ", "Nathan LAM/Nina GUO ZHENG"),
    ("2026-01-29", "Wim VERDONSCHOT/Yuan WAN", "Barish MOULLET/Rachel MORET"),
    ("2026-01-29", "Ivan HENCL/Dora COSIC", "Luka MLADENOVIC/Karoline MISCHEK"),
    ("2026-01-29", "Clement LAINE/Gaia MONFARDINI", "Leon BENKO/Andrea PAVLOVIC"),
    ("2026-01-29", "Maciej KUBIK/Natalia BAJOR", "Romain BRARD/Clea DE STOPPELEIRE"),
    ("2026-01-29", "Joe SEYFRIED/Leana HOCHART", "Leo DE NODREST/Camille LUTZ"),
    ("2026-01-29", "Marek BADOWSKI/Zuzanna WIELGOS", "Niagol STOYANOV/Giorgia PICCOLIN"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "Flavien COTON/Charlotte LUTZ", "Sam BOCCARD/Fanny DOUTAZ"),
    ("2026-01-30", "Wim VERDONSCHOT/Yuan WAN", "Ivan HENCL/Dora COSIC"),
    ("2026-01-30", "Maciej KUBIK/Natalia BAJOR", "Clement LAINE/Gaia MONFARDINI"),
    ("2026-01-30", "Marek BADOWSKI/Zuzanna WIELGOS", "Joe SEYFRIED/Leana HOCHART"),
    # Semi Final - 30 Jan
    ("2026-01-30", "Wim VERDONSCHOT/Yuan WAN", "Flavien COTON/Charlotte LUTZ"),
    ("2026-01-30", "Marek BADOWSKI/Zuzanna WIELGOS", "Maciej KUBIK/Natalia BAJOR"),
    # Final - 31 Jan
    ("2026-01-31", "Marek BADOWSKI/Zuzanna WIELGOS", "Wim VERDONSCHOT/Yuan WAN"),
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
    print("WTT Feeder Lille 2026 - Data Import (append only)")
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
