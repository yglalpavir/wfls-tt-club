#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Feeder Cappadocia II 2026 - 数据录入脚本
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
    # Round of 32 - 9 Apr
    ("2026-04-09", "Tom JARVIS", "Gorkem OCAL"),
    ("2026-04-09", "Ioannis SGOUROPOULOS", "Abdulaziz BU SHULAYBI"),
    ("2026-04-09", "KWON Hyuk", "Berk OZTOPRAK"),
    ("2026-04-09", "Csaba ANDRAS", "Abdulrahman AL TAHER"),
    ("2026-04-09", "Mattias KARLSSON", "Emanuel OTALVARO"),
    ("2026-04-09", "Borgar HAUG", "Keisuke KIHO"),
    ("2026-04-09", "Lubomir PISTEJ", "Abdullah YIGENLER"),
    ("2026-04-09", "Ibrahim GUNDUZ", "Edward LY"),
    ("2026-04-09", "Akash PAL", "Abhinandh PRADHIVADHI"),
    ("2026-04-09", "JANG Seongil", "Payas JAIN"),
    ("2026-04-09", "Jo YOKOTANI", "Hakan ISIK"),
    ("2026-04-09", "Andrej GACINA", "Fabio RAKOTOARIMANANA"),
    ("2026-04-09", "Snehit SURAVAJJULA", "David SZANTOSI"),
    ("2026-04-09", "Ivor BAN", "Ali ALKHADRAWI"),
    ("2026-04-09", "Jash MODI", "Tom CLOSSET"),
    ("2026-04-09", "Horia Stefan URSUT", "Harmeet DESAI"),
    # Round of 16 - 10 Apr
    ("2026-04-10", "Tom JARVIS", "Ioannis SGOUROPOULOS"),
    ("2026-04-10", "Csaba ANDRAS", "KWON Hyuk"),
    ("2026-04-10", "Mattias KARLSSON", "Borgar HAUG"),
    ("2026-04-10", "Lubomir PISTEJ", "Ibrahim GUNDUZ"),
    ("2026-04-10", "JANG Seongil", "Akash PAL"),
    ("2026-04-10", "Andrej GACINA", "Jo YOKOTANI"),
    ("2026-04-10", "Ivor BAN", "Snehit SURAVAJJULA"),
    ("2026-04-10", "Horia Stefan URSUT", "Jash MODI"),
    # Quarter Final - 10 Apr
    ("2026-04-10", "Csaba ANDRAS", "Tom JARVIS"),
    ("2026-04-10", "Mattias KARLSSON", "Lubomir PISTEJ"),
    ("2026-04-10", "JANG Seongil", "Andrej GACINA"),
    ("2026-04-10", "Ivor BAN", "Horia Stefan URSUT"),
    # Semi Final - 11 Apr
    ("2026-04-11", "Csaba ANDRAS", "Mattias KARLSSON"),
    ("2026-04-11", "Ivor BAN", "JANG Seongil"),
    # Final - 11 Apr
    ("2026-04-11", "Csaba ANDRAS", "Ivor BAN"),
]

# ============================================================
# WS (Women's Singles) - 31 matches
# ============================================================
ws_matches = [
    # Round of 32 - 9 Apr
    ("2026-04-09", "Ozge YILMAZ", "Nursema COKLAR"),
    ("2026-04-09", "Suhana SAINI", "KIM Dahee"),
    ("2026-04-09", "Ece HARAC", "Malamatenia PAPADIMITRIOU"),
    ("2026-04-09", "Nicole ARLIA", "Adina DIACONU"),
    ("2026-04-09", "Sutirtha MUKHERJEE", "Betul Nur KAHRAMAN"),
    ("2026-04-09", "Taneesha KOTECHA", "CHOI Haeeun"),
    ("2026-04-09", "Syndrela DAS", "HEO Yerim"),
    ("2026-04-09", "Kotona OKADA", "Nithya MANI"),
    # Round of 16 - 10 Apr
    ("2026-04-10", "Sreeja AKULA", "Ozge YILMAZ"),
    ("2026-04-10", "Ayhika MUKHERJEE", "Suhana SAINI"),
    ("2026-04-10", "Yashaswini GHORPADE", "Ece HARAC"),
    ("2026-04-10", "Xiaoxin YANG", "Nicole ARLIA"),
    ("2026-04-10", "Elena ZAHARIA", "Sutirtha MUKHERJEE"),
    ("2026-04-10", "Diya CHITALE", "Taneesha KOTECHA"),
    ("2026-04-10", "Syndrela DAS", "Sarah DE NUTTE"),
    ("2026-04-10", "Kotona OKADA", "Nina MITTELHAM"),
    # Quarter Final - 10 Apr
    ("2026-04-10", "Sreeja AKULA", "Ayhika MUKHERJEE"),
    ("2026-04-10", "Yashaswini GHORPADE", "Xiaoxin YANG"),
    ("2026-04-10", "Elena ZAHARIA", "Diya CHITALE"),
    ("2026-04-10", "Kotona OKADA", "Syndrela DAS"),
    # Semi Final - 11 Apr
    ("2026-04-11", "Yashaswini GHORPADE", "Sreeja AKULA"),
    ("2026-04-11", "Kotona OKADA", "Elena ZAHARIA"),
    # Final - 11 Apr
    ("2026-04-11", "Kotona OKADA", "Yashaswini GHORPADE"),
]

# ============================================================
# MD (Men's Doubles) - 11 matches (5 BYEs skipped)
# ============================================================
md_matches = [
    # Round of 16 - 9 Apr
    ("2026-04-09", "Ali ALKHADRAWI/Abdulaziz BU SHULAYBI", "Khalid ALSHAREIF/Salem ALSUWAILEM"),
    ("2026-04-09", "Abdulrahman AL TAHER/Yousuf HANIFA", "Bodhisatwa CHAUDHURY/Oishik GHOSH"),
    ("2026-04-09", "Jo YOKOTANI/Keisuke KIHO", "Jash MODI/Abhinandh PRADHIVADHI"),
    ("2026-04-09", "JANG Seongil/KWON Hyuk", "Jakub KAUCKY/Lubomir PISTEJ"),
    ("2026-04-09", "Ivor BAN/Csaba ANDRAS", "Kenan KAHRAMAN/Gorkem OCAL"),
    # Quarter Final - 10 Apr
    ("2026-04-10", "Ali ALKHADRAWI/Abdulaziz BU SHULAYBI", "Akash PAL/Payas JAIN"),
    ("2026-04-10", "Ibrahim GUNDUZ/Abdullah YIGENLER", "Abdulrahman AL TAHER/Yousuf HANIFA"),
    ("2026-04-10", "Jo YOKOTANI/Keisuke KIHO", "JANG Seongil/KWON Hyuk"),
    ("2026-04-10", "Ivor BAN/Csaba ANDRAS", "Harmeet DESAI/Snehit SURAVAJJULA"),
    # Semi Final - 10 Apr
    ("2026-04-10", "Ibrahim GUNDUZ/Abdullah YIGENLER", "Ali ALKHADRAWI/Abdulaziz BU SHULAYBI"),
    ("2026-04-10", "Ivor BAN/Csaba ANDRAS", "Jo YOKOTANI/Keisuke KIHO"),
    # Final - 11 Apr
    ("2026-04-11", "Ivor BAN/Csaba ANDRAS", "Ibrahim GUNDUZ/Abdullah YIGENLER"),
]

# ============================================================
# WD (Women's Doubles) - 11 matches (5 BYEs skipped)
# ============================================================
wd_matches = [
    # Round of 16 - 9 Apr
    ("2026-04-09", "Lubomir PISTEJ/Sarah DE NUTTE", "Harmeet DESAI/Yashaswini GHORPADE"),
    ("2026-04-09", "JANG Seongil/HEO Yerim", "Akash PAL/Sreeja AKULA"),
    ("2026-04-09", "Mattias KARLSSON/Nina MITTELHAM", "Abhinandh PRADHIVADHI/Nithya MANI"),
    ("2026-04-09", "Abdullah YIGENLER/Ece HARAC", "Jash MODI/Taneesha KOTECHA"),
    ("2026-04-09", "Edward LY/CHOI Haeeun", "KWON Hyuk/KIM Dahee"),
    # Quarter Final - 10 Apr
    ("2026-04-10", "Harmeet DESAI/Yashaswini GHORPADE", "Lubomir PISTEJ/Sarah DE NUTTE"),
    ("2026-04-10", "JANG Seongil/HEO Yerim", "Akash PAL/Sreeja AKULA"),
    ("2026-04-10", "Abdullah YIGENLER/Ece HARAC", "Mattias KARLSSON/Nina MITTELHAM"),
    ("2026-04-10", "Payas JAIN/Syndrela DAS", "Edward LY/CHOI Haeeun"),
    # Semi Final - 10 Apr
    ("2026-04-10", "Harmeet DESAI/Yashaswini GHORPADE", "JANG Seongil/HEO Yerim"),
    ("2026-04-10", "Abdullah YIGENLER/Ece HARAC", "Payas JAIN/Syndrela DAS"),
    # Final - 11 Apr
    ("2026-04-11", "Harmeet DESAI/Yashaswini GHORPADE", "Abdullah YIGENLER/Ece HARAC"),
]

# ============================================================
# XD (Mixed Doubles) - 15 matches
# ============================================================
xd_matches = [
    # Round of 16 - 9 Apr
    ("2026-04-09", "Akash PAL/Sreeja AKULA", "Bodhisatwa CHAUDHURY/Nursema COKLAR"),
    ("2026-04-09", "Lubomir PISTEJ/Sarah DE NUTTE", "Khalid ALSHAREIF/Betul Nur KAHRAMAN"),
    ("2026-04-09", "Ivor BAN/Nithya MANI", "Jash MODI/Taneesha KOTECHA"),
    ("2026-04-09", "Mattias KARLSSON/Nina MITTELHAM", "Ali ALKHADRAWI/Nithya MANI"),
    ("2026-04-09", "JANG Seongil/HEO Yerim", "Abdulaziz BU SHULAYBI/Nursema COKLAR"),
    ("2026-04-09", "Jo YOKOTANI/Hina HAYATA", "Kenan KAHRAMAN/Malamatenia PAPADIMITRIOU"),
    ("2026-04-09", "Harmeet DESAI/Yashaswini GHORPADE", "KWON Hyuk/KIM Dahee"),
    ("2026-04-09", "Edward LY/CHOI Haeeun", "Hakan ISIK/Dora COSIC"),
    # Quarter Final - 9 Apr
    ("2026-04-09", "Akash PAL/Sreeja AKULA", "Lubomir PISTEJ/Sarah DE NUTTE"),
    ("2026-04-09", "Ivor BAN/Nithya MANI", "Mattias KARLSSON/Nina MITTELHAM"),
    ("2026-04-09", "JANG Seongil/HEO Yerim", "Jo YOKOTANI/Hina HAYATA"),
    ("2026-04-09", "Harmeet DESAI/Yashaswini GHORPADE", "Edward LY/CHOI Haeeun"),
    # Semi Final - 10 Apr
    ("2026-04-10", "Akash PAL/Sreeja AKULA", "Ivor BAN/Nithya MANI"),
    ("2026-04-10", "JANG Seongil/HEO Yerim", "Harmeet DESAI/Yashaswini GHORPADE"),
    # Final - 11 Apr
    ("2026-04-11", "Akash PAL/Sreeja AKULA", "JANG Seongil/HEO Yerim"),
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


def main():
    print("=" * 60)
    print("WTT Feeder Cappadocia II 2026 - Data Import (append only)")
    print("=" * 60)

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
