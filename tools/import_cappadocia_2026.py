#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Feeder Cappadocia 2026 - 数据录入脚本
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
    # Round of 32 - 4 Feb
    ("2026-02-04", "Clement LAINE", "Adrien RASSENFOSSE"),
    ("2026-02-04", "Kenan KAHRAMAN", "Vladislav ZAKHAROV"),
    ("2026-02-04", "Abdullah YIGENLER", "Maksim GREBNEV"),
    ("2026-02-04", "Fanbo MENG", "Carlo ROSSI"),
    ("2026-02-04", "Ibrahim GUNDUZ", "Niagol STOYANOV"),
    ("2026-02-04", "Martin FROSETH", "Martin ANDERSEN"),
    ("2026-02-04", "Nikita ARTEMENKO", "Evgeny TIKHONOV"),
    ("2026-02-04", "Ovidiu IONESCU", "Andrei ISTRATE"),
    ("2026-02-04", "YIU Kwan To", "Andrea PUPPO"),
    ("2026-02-04", "Dmitrii VINOGRADOV", "Bakdaulet AKIMALI"),
    ("2026-02-04", "Amirmahdi KESHAVARZI", "Zhenlong LIU"),
    ("2026-02-04", "Elias RANEFUR", "Irisbek ARTUKMETOV"),
    ("2026-02-04", "Matteo MUTTI", "Borgar HAUG"),
    ("2026-02-04", "Darius MOVILEANU", "Dominykas SAMUOLIS"),
    ("2026-02-04", "Samuel WALKER", "Vladislav MAKAROV"),
    ("2026-02-04", "Gorkem OCAL", "Martin ALLEGRO"),
    # Round of 16 - 5 Feb
    ("2026-02-05", "Clement LAINE", "Kenan KAHRAMAN"),
    ("2026-02-05", "Abdullah YIGENLER", "Fanbo MENG"),
    ("2026-02-05", "Ibrahim GUNDUZ", "Martin FROSETH"),
    ("2026-02-05", "Nikita ARTEMENKO", "Ovidiu IONESCU"),
    ("2026-02-05", "Dmitrii VINOGRADOV", "YIU Kwan To"),
    ("2026-02-05", "Elias RANEFUR", "Amirmahdi KESHAVARZI"),
    ("2026-02-05", "Darius MOVILEANU", "Matteo MUTTI"),
    ("2026-02-05", "Gorkem OCAL", "Samuel WALKER"),
    # Quarter Final - 5 Feb
    ("2026-02-05", "Abdullah YIGENLER", "Clement LAINE"),
    ("2026-02-05", "Nikita ARTEMENKO", "Ibrahim GUNDUZ"),
    ("2026-02-05", "Elias RANEFUR", "Dmitrii VINOGRADOV"),
    ("2026-02-05", "Darius MOVILEANU", "Gorkem OCAL"),
    # Semi Final - 6 Feb
    ("2026-02-06", "Nikita ARTEMENKO", "Abdullah YIGENLER"),
    ("2026-02-06", "Darius MOVILEANU", "Elias RANEFUR"),
    # Final - 6 Feb
    ("2026-02-06", "Nikita ARTEMENKO", "Darius MOVILEANU"),
]

# ============================================================
# WS (Women's Singles) - 31 matches
# ============================================================
ws_matches = [
    # Round of 32 - 4 Feb
    ("2026-02-04", "Zuzanna WIELGOS", "Sibel ALTINKAYA"),
    ("2026-02-04", "Vlada VORONINA", "Taneesha KOTECHA"),
    ("2026-02-04", "Yuka KANEYOSHI", "Ioana SINGEORZAN"),
    ("2026-02-04", "Ece HARAC", "Katarzyna WEGRZYN"),
    ("2026-02-04", "NG Wing Lam", "Betul Nur KAHRAMAN"),
    ("2026-02-04", "Yui SAKUMA", "Sayali WANI"),
    ("2026-02-04", "Tin-Tin HO", "Merve DEMIR"),
    ("2026-02-04", "Elena ZAHARIA", "Josephina NEUMANN"),
    ("2026-02-04", "ZHU Chengzhu", "Syndrela DAS"),
    ("2026-02-04", "Valeriia SHCHERBATYKH", "Anastasiya DYMYTRENKO"),
    ("2026-02-04", "Veronika MATIUNINA", "Zhanerke KOSHKUMBAYEVA"),
    ("2026-02-04", "Valeriia KOTSIUR", "PARK Gahyeon"),
    ("2026-02-04", "Gaia MONFARDINI", "Maria PANFILOVA"),
    ("2026-02-04", "WONG Hoi Tung", "Arina SLAUTINA"),
    ("2026-02-04", "Rin MENDE", "Hardee PATEL"),
    ("2026-02-04", "Divyanshi BHOWMICK", "YOO Yerin"),
    # Round of 16 - 5 Feb
    ("2026-02-05", "Vlada VORONINA", "Zuzanna WIELGOS"),
    ("2026-02-05", "Yuka KANEYOSHI", "Ece HARAC"),
    ("2026-02-05", "Yui SAKUMA", "NG Wing Lam"),
    ("2026-02-05", "Elena ZAHARIA", "Tin-Tin HO"),
    ("2026-02-05", "Valeriia SHCHERBATYKH", "ZHU Chengzhu"),
    ("2026-02-05", "Veronika MATIUNINA", "Valeriia KOTSIUR"),
    ("2026-02-05", "WONG Hoi Tung", "Gaia MONFARDINI"),
    ("2026-02-05", "Rin MENDE", "Divyanshi BHOWMICK"),
    # Quarter Final - 5 Feb
    ("2026-02-05", "Yuka KANEYOSHI", "Vlada VORONINA"),
    ("2026-02-05", "Yui SAKUMA", "Elena ZAHARIA"),
    ("2026-02-05", "Valeriia SHCHERBATYKH", "Veronika MATIUNINA"),
    ("2026-02-05", "Rin MENDE", "WONG Hoi Tung"),
    # Semi Final - 6 Feb
    ("2026-02-06", "Yui SAKUMA", "Yuka KANEYOSHI"),
    ("2026-02-06", "Rin MENDE", "Valeriia SHCHERBATYKH"),
    # Final - 6 Feb
    ("2026-02-06", "Rin MENDE", "Yui SAKUMA"),
]

# ============================================================
# MD (Men's Doubles) - 9 matches (7 BYEs skipped)
# ============================================================
md_matches = [
    # Round of 16 - 4 Feb
    ("2026-02-04", "Vladislav MAKAROV/Nikita ARTEMENKO", "Mohammed TAHER/Zhiar MOHAMMED"),
    ("2026-02-04", "Evgeny TIKHONOV/Dmitrii VINOGRADOV", "Dominykas SAMUOLIS/Martin ANDERSEN"),
    # Quarter Final - 5 Feb
    ("2026-02-05", "Martin ALLEGRO/Adrien RASSENFOSSE", "Vladislav MAKAROV/Nikita ARTEMENKO"),
    ("2026-02-05", "LI Hon Ming/YIU Kwan To", "Vladislav ZAKHAROV/Martin FROSETH"),
    ("2026-02-05", "Darius MOVILEANU/Andrei ISTRATE", "Gorkem OCAL/Kenan KAHRAMAN"),
    ("2026-02-05", "Evgeny TIKHONOV/Dmitrii VINOGRADOV", "Ibrahim GUNDUZ/Abdullah YIGENLER"),
    # Semi Final - 5 Feb
    ("2026-02-05", "Martin ALLEGRO/Adrien RASSENFOSSE", "LI Hon Ming/YIU Kwan To"),
    ("2026-02-05", "Darius MOVILEANU/Andrei ISTRATE", "Evgeny TIKHONOV/Dmitrii VINOGRADOV"),
    # Final - 6 Feb
    ("2026-02-06", "Martin ALLEGRO/Adrien RASSENFOSSE", "Darius MOVILEANU/Andrei ISTRATE"),
]

# ============================================================
# WD (Women's Doubles) - 10 matches (6 BYEs skipped)
# ============================================================
wd_matches = [
    # Round of 16 - 4 Feb
    ("2026-02-04", "Gaia MONFARDINI/Josephina NEUMANN", "Katarzyna WEGRZYN/Zuzanna WIELGOS"),
    ("2026-02-04", "Syndrela DAS/Divyanshi BHOWMICK", "Valeriia KOTSIUR/Valeriia SHCHERBATYKH"),
    ("2026-02-04", "Elena ZAHARIA/Ioana SINGEORZAN", "Veronika MATIUNINA/Anastasiya DYMYTRENKO"),
    # Quarter Final - 5 Feb
    ("2026-02-05", "NG Wing Lam/WONG Hoi Tung", "Gaia MONFARDINI/Josephina NEUMANN"),
    ("2026-02-05", "Maria PANFILOVA/Arina SLAUTINA", "Taneesha KOTECHA/Sayali WANI"),
    ("2026-02-05", "Syndrela DAS/Divyanshi BHOWMICK", "PARK Gahyeon/YOO Yerin"),
    ("2026-02-05", "Elena ZAHARIA/Ioana SINGEORZAN", "Ece HARAC/Ozge YILMAZ"),
    # Semi Final - 5 Feb
    ("2026-02-05", "NG Wing Lam/WONG Hoi Tung", "Maria PANFILOVA/Arina SLAUTINA"),
    ("2026-02-05", "Syndrela DAS/Divyanshi BHOWMICK", "Elena ZAHARIA/Ioana SINGEORZAN"),
    # Final - 6 Feb
    ("2026-02-06", "Syndrela DAS/Divyanshi BHOWMICK", "NG Wing Lam/WONG Hoi Tung"),
]

# ============================================================
# XD (Mixed Doubles) - 12 matches (4 BYEs skipped)
# ============================================================
xd_matches = [
    # Round of 16 - 4 Feb
    ("2026-02-04", "Dmitrii VINOGRADOV/Arina SLAUTINA", "Evgeny TIKHONOV/Maria PANFILOVA"),
    ("2026-02-04", "Clement LAINE/Gaia MONFARDINI", "Andrei ISTRATE/Ioana SINGEORZAN"),
    ("2026-02-04", "Vladislav MAKAROV/Vlada VORONINA", "Vladislav ZAKHAROV/Zhanerke KOSHKUMBAYEVA"),
    # Quarter Final - 5 Feb
    ("2026-02-05", "YIU Kwan To/NG Wing Lam", "Dmitrii VINOGRADOV/Arina SLAUTINA"),
    ("2026-02-05", "Abdullah YIGENLER/Ece HARAC", "Dominykas SAMUOLIS/Mille STOFFREGEN"),
    ("2026-02-05", "Clement LAINE/Gaia MONFARDINI", "LI Hon Ming/Tin-Tin HO"),
    ("2026-02-05", "Darius MOVILEANU/Elena ZAHARIA", "Vladislav MAKAROV/Vlada VORONINA"),
    # Semi Final - 5 Feb
    ("2026-02-05", "Abdullah YIGENLER/Ece HARAC", "YIU Kwan To/NG Wing Lam"),
    ("2026-02-05", "Darius MOVILEANU/Elena ZAHARIA", "Clement LAINE/Gaia MONFARDINI"),
    # Final - 6 Feb
    ("2026-02-06", "Darius MOVILEANU/Elena ZAHARIA", "Abdullah YIGENLER/Ece HARAC"),
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
    print("WTT Feeder Cappadocia 2026 - Data Import (append only)")
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
