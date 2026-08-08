#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Feeder Vadodara 2026 - 数据录入脚本
从网页复制的比赛数据解析并追加到 score-log 文件
"""

import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WTT_DIR = os.path.join(ROOT_DIR, "wtt_data")

EVENT_TYPE = "支线赛"
EVENT_YEAR = "2026"

# Indian players use 名 姓 format (given name first, surname uppercase)

# ============================================================
# MS (Men's Singles) - 31 matches
# ============================================================
ms_matches = [
    # Round of 32 - 9 Jan
    ("2026-01-09", "Manush SHAH", "Parth MAGAR"),
    ("2026-01-09", "Jash MODI", "Akash GUPTA"),
    ("2026-01-09", "Yashansh MALIK", "Ronit BHANJA"),
    ("2026-01-09", "Priyanuj BHATTACHARYYA", "Navid SHAMS"),
    ("2026-01-09", "Snehit SURAVAJJULA", "Pratham MADLANI"),
    ("2026-01-09", "Divyansh SRIVASTAVA", "Balamurugan RAJASEKARAN"),
    ("2026-01-09", "Mudit DANI", "Ved SHETH"),
    ("2026-01-09", "Ankur BHATTACHARJEE", "Abhinandh PRADHIVADHI"),
    ("2026-01-09", "Payas JAIN", "Kushal CHOPDA"),
    ("2026-01-09", "Sarthak ARYA", "Sarth MISHRA"),
    ("2026-01-09", "Abdulaziz BU SHULAYBI", "Abhilash RAVAL"),
    ("2026-01-09", "Edward LY", "Arnav KARNAVAR"),
    ("2026-01-09", "Akash PAL", "Abdulrahman AL TAHER"),
    ("2026-01-09", "Shankhadip DAS", "Harkunwar SINGH"),
    ("2026-01-09", "Sougata SARKAR", "Rajeev CHIKANBANJAR"),
    ("2026-01-09", "Sanil SHETTY", "Harmeet DESAI"),
    # Round of 16 - 10 Jan
    ("2026-01-10", "Manush SHAH", "Jash MODI"),
    ("2026-01-10", "Priyanuj BHATTACHARYYA", "Yashansh MALIK"),
    ("2026-01-10", "Snehit SURAVAJJULA", "Divyansh SRIVASTAVA"),
    ("2026-01-10", "Ankur BHATTACHARJEE", "Mudit DANI"),
    ("2026-01-10", "Payas JAIN", "Sarthak ARYA"),
    ("2026-01-10", "Edward LY", "Abdulaziz BU SHULAYBI"),
    ("2026-01-10", "Akash PAL", "Shankhadip DAS"),
    ("2026-01-10", "Sougata SARKAR", "Sanil SHETTY"),
    # Quarter Final - 10 Jan
    ("2026-01-10", "Manush SHAH", "Priyanuj BHATTACHARYYA"),
    ("2026-01-10", "Snehit SURAVAJJULA", "Ankur BHATTACHARJEE"),
    ("2026-01-10", "Payas JAIN", "Edward LY"),
    ("2026-01-10", "Akash PAL", "Sougata SARKAR"),
    # Semi Final - 11 Jan
    ("2026-01-11", "Manush SHAH", "Snehit SURAVAJJULA"),
    ("2026-01-11", "Payas JAIN", "Akash PAL"),
    # Final - 11 Jan
    ("2026-01-11", "Manush SHAH", "Payas JAIN"),
]

# ============================================================
# WS (Women's Singles) - 31 matches
# ============================================================
ws_matches = [
    # Round of 32 - 9 Jan
    ("2026-01-09", "YANG Ha Eun", "Jennifer VARGHESE"),
    ("2026-01-09", "Ananya CHANDE", "Debolina DAS"),
    ("2026-01-09", "Poymantee BAISYA", "Kavya BHATT"),
    ("2026-01-09", "Sutirtha MUKHERJEE", "Sampada BHIWANDKAR"),
    ("2026-01-09", "Yashaswini GHORPADE", "Ananya MURALIDHARAN"),
    ("2026-01-09", "Sayali WANI", "Neha KUMARI"),
    ("2026-01-09", "Anusha KUTUMBALE", "Garima GOYAL"),
    ("2026-01-09", "LEE Zion", "Selena SELVAKUMAR"),
    ("2026-01-09", "Ayhika MUKHERJEE", "Avani TRIPATHI"),
    ("2026-01-09", "Maria RONY", "Pritha VARTIKAR"),
    ("2026-01-09", "RYU Hanna", "Tanishka KALBHAIRAV"),
    ("2026-01-09", "Hansini MATHAN", "YOO Yerin"),
    ("2026-01-09", "Syndrela DAS", "Naisha REWASKAR"),
    ("2026-01-09", "Yashini SIVASANKAR", "Hardee PATEL"),
    ("2026-01-09", "Divyanshi BHOWMICK", "Suhana SAINI"),
    ("2026-01-09", "PARK Gahyeon", "Taneesha KOTECHA"),
    # Round of 16 - 10 Jan
    ("2026-01-10", "YANG Ha Eun", "Ananya CHANDE"),
    ("2026-01-10", "Sutirtha MUKHERJEE", "Poymantee BAISYA"),
    ("2026-01-10", "Yashaswini GHORPADE", "Sayali WANI"),
    ("2026-01-10", "Anusha KUTUMBALE", "LEE Zion"),
    ("2026-01-10", "Ayhika MUKHERJEE", "Maria RONY"),
    ("2026-01-10", "RYU Hanna", "Hansini MATHAN"),
    ("2026-01-10", "Syndrela DAS", "Yashini SIVASANKAR"),
    ("2026-01-10", "Divyanshi BHOWMICK", "PARK Gahyeon"),
    # Quarter Final - 10 Jan
    ("2026-01-10", "Sutirtha MUKHERJEE", "YANG Ha Eun"),
    ("2026-01-10", "Anusha KUTUMBALE", "Yashaswini GHORPADE"),
    ("2026-01-10", "RYU Hanna", "Ayhika MUKHERJEE"),
    ("2026-01-10", "Syndrela DAS", "Divyanshi BHOWMICK"),
    # Semi Final - 11 Jan
    ("2026-01-11", "Anusha KUTUMBALE", "Sutirtha MUKHERJEE"),
    ("2026-01-11", "RYU Hanna", "Syndrela DAS"),
    # Final - 11 Jan
    ("2026-01-11", "RYU Hanna", "Anusha KUTUMBALE"),
]

# ============================================================
# MD (Men's Doubles) - 14 matches (1 BYE skipped)
# ============================================================
md_matches = [
    # Round of 16 - 9 Jan
    ("2026-01-09", "Subrat VERMA/Sougata SARKAR", "Rubin MAHARJAN/Rajeev CHIKANBANJAR"),
    ("2026-01-09", "Harmeet DESAI/Snehit SURAVAJJULA", "Umesh KUMAR/Rajiv SAHU"),
    ("2026-01-09", "Navid SHAMS/Edward LY", "Ayaz MURAD/Abhilash RAVAL"),
    ("2026-01-09", "Riyan DUTTA/Kumar HARSHIT", "Sanyog KAPALIA/Alex MAHARJAN"),
    ("2026-01-09", "Ronit BHANJA/Oishik GHOSH", "Ali ALKHADRAWI/Abdulaziz BU SHULAYBI"),
    ("2026-01-09", "Arnav KARNAVAR/Neil MULYE", "Kunwar THAPAR/Hitesh DOGRA"),
    ("2026-01-09", "Akash PAL/Mudit DANI", "Divyansh SRIVASTAVA/Sarth MISHRA"),
    # Quarter Final - 10 Jan
    ("2026-01-10", "Ankur BHATTACHARJEE/Payas JAIN", "Subrat VERMA/Sougata SARKAR"),
    ("2026-01-10", "Harmeet DESAI/Snehit SURAVAJJULA", "Navid SHAMS/Edward LY"),
    ("2026-01-10", "Ronit BHANJA/Oishik GHOSH", "Riyan DUTTA/Kumar HARSHIT"),
    ("2026-01-10", "Akash PAL/Mudit DANI", "Arnav KARNAVAR/Neil MULYE"),
    # Semi Final - 10 Jan
    ("2026-01-10", "Ankur BHATTACHARJEE/Payas JAIN", "Harmeet DESAI/Snehit SURAVAJJULA"),
    ("2026-01-10", "Akash PAL/Mudit DANI", "Ronit BHANJA/Oishik GHOSH"),
    # Final - 11 Jan
    ("2026-01-11", "Ankur BHATTACHARJEE/Payas JAIN", "Akash PAL/Mudit DANI"),
]

# ============================================================
# WD (Women's Doubles) - 15 matches
# ============================================================
wd_matches = [
    # Round of 16 - 9 Jan
    ("2026-01-09", "YOO Yerin/RYU Hanna", "Kavya BASKAR/Pranati PARAMESH"),
    ("2026-01-09", "Suhana SAINI/Hardee PATEL", "Nithya MANI/Ananya MURALIDHARAN"),
    ("2026-01-09", "Sampada BHIWANDKAR/Hansini MATHAN", "Anusha KUTUMBALE/Poymantee BAISYA"),
    ("2026-01-09", "Selena SELVAKUMAR/Jennifer VARGHESE", "Tanishka KALBHAIRAV/Maria RONY"),
    ("2026-01-09", "Kavya BHATT/Avani TRIPATHI", "Divyanshi BHOWMICK/Syndrela DAS"),
    ("2026-01-09", "PARK Gahyeon/LEE Zion", "Neha KUMARI/Mukta DALVI"),
    ("2026-01-09", "Sayali WANI/Taneesha KOTECHA", "Pritha VARTIKAR/Ananya CHANDE"),
    ("2026-01-09", "Ayhika MUKHERJEE/Sutirtha MUKHERJEE", "Yashini SIVASANKAR/Thanuja NAGARAJAN"),
    # Quarter Final - 10 Jan
    ("2026-01-10", "YOO Yerin/RYU Hanna", "Suhana SAINI/Hardee PATEL"),
    ("2026-01-10", "Selena SELVAKUMAR/Jennifer VARGHESE", "Sampada BHIWANDKAR/Hansini MATHAN"),
    ("2026-01-10", "PARK Gahyeon/LEE Zion", "Kavya BHATT/Avani TRIPATHI"),
    ("2026-01-10", "Ayhika MUKHERJEE/Sutirtha MUKHERJEE", "Sayali WANI/Taneesha KOTECHA"),
    # Semi Final - 10 Jan
    ("2026-01-10", "YOO Yerin/RYU Hanna", "Selena SELVAKUMAR/Jennifer VARGHESE"),
    ("2026-01-10", "Ayhika MUKHERJEE/Sutirtha MUKHERJEE", "PARK Gahyeon/LEE Zion"),
    # Final - 11 Jan
    ("2026-01-11", "YOO Yerin/RYU Hanna", "Ayhika MUKHERJEE/Sutirtha MUKHERJEE"),
]

# ============================================================
# XD (Mixed Doubles) - 15 matches
# ============================================================
xd_matches = [
    # Round of 16 - 9 Jan
    ("2026-01-09", "Payas JAIN/Syndrela DAS", "Akash PAL/Poymantee BAISYA"),
    ("2026-01-09", "Preyesh SURESH/Selena SELVAKUMAR", "Divyansh SRIVASTAVA/Pritha VARTIKAR"),
    ("2026-01-09", "Ankur BHATTACHARJEE/Taneesha KOTECHA", "Balamurugan RAJASEKARAN/Jennifer VARGHESE"),
    ("2026-01-09", "Abhinandh PRADHIVADHI/Nithya MANI", "Arnav KARNAVAR/Sampada BHIWANDKAR"),
    ("2026-01-09", "Raegan ALBUQUERQUE/Suhana SAINI", "Akash GUPTA/Garima GOYAL"),
    ("2026-01-09", "Mudit DANI/Ayhika MUKHERJEE", "Rubin MAHARJAN/Evana THAPA"),
    ("2026-01-09", "Ronit BHANJA/Sutirtha MUKHERJEE", "Priyanuj BHATTACHARYYA/Kavya BHATT"),
    ("2026-01-09", "Harmeet DESAI/Yashaswini GHORPADE", "Jash MODI/Divyanshi BHOWMICK"),
    # Quarter Final - 10 Jan
    ("2026-01-10", "Payas JAIN/Syndrela DAS", "Preyesh SURESH/Selena SELVAKUMAR"),
    ("2026-01-10", "Ankur BHATTACHARJEE/Taneesha KOTECHA", "Abhinandh PRADHIVADHI/Nithya MANI"),
    ("2026-01-10", "Raegan ALBUQUERQUE/Suhana SAINI", "Mudit DANI/Ayhika MUKHERJEE"),
    ("2026-01-10", "Harmeet DESAI/Yashaswini GHORPADE", "Ronit BHANJA/Sutirtha MUKHERJEE"),
    # Semi Final - 10 Jan
    ("2026-01-10", "Payas JAIN/Syndrela DAS", "Ankur BHATTACHARJEE/Taneesha KOTECHA"),
    ("2026-01-10", "Harmeet DESAI/Yashaswini GHORPADE", "Raegan ALBUQUERQUE/Suhana SAINI"),
    # Final - 11 Jan
    ("2026-01-11", "Payas JAIN/Syndrela DAS", "Harmeet DESAI/Yashaswini GHORPADE"),
]


def add_event_coefficient():
    """Add 'Feeder' event type to all event-coefficient.json files"""
    categories = ["ms", "ws", "md", "wd", "xd"]
    for cat in categories:
        coef_file = os.path.join(WTT_DIR, cat, "event-coefficient.json")
        with open(coef_file, "r", encoding="utf-8") as f:
            coef = json.load(f)
        if EVENT_TYPE not in coef:
            coef[EVENT_TYPE] = 0.25
            with open(coef_file, "w", encoding="utf-8", newline="\n") as f:
                json.dump(coef, f, ensure_ascii=False, indent=2)
                f.write("\n")
            print(f"  Added 'Feeder' to {cat}/event-coefficient.json")
        else:
            print(f"  'Feeder' already exists in {cat}/event-coefficient.json")


def normalize_doubles_name(name):
    """
    Normalize doubles names:
    - MD/WD: alphabetical order by surname
    - XD: male first, female second (we assume input is already correct)
    """
    # This is a simplified version - the frontend also normalizes
    # For now, we trust the input order from the draw
    return name


def append_to_scorelog(category, matches):
    """Append match records to the score-log file"""
    # Determine file name
    if category == "ws":
        filename = f"score-log-{EVENT_YEAR}-ws.json"
    elif category == "ms":
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    elif category == "md":
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    elif category == "wd":
        filename = f"score-log-{EVENT_YEAR}-ws.json"
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

    # Combine and sort by date
    all_records = existing + new_records
    all_records.sort(key=lambda r: (r["日期"], r["类型"], r["胜者"], r["负者"]))

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

    print(f"  {category.upper()}: {len(new_records)} new records added (total: {len(all_records)})")
    return len(new_records)


def verify_data(category, expected_count):
    """Verify the imported data"""
    if category == "ws":
        filename = f"score-log-{EVENT_YEAR}-ws.json"
    elif category == "ms":
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    elif category == "md":
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    elif category == "wd":
        filename = f"score-log-{EVENT_YEAR}-ws.json"
    elif category == "xd":
        filename = f"score-log-{EVENT_YEAR}-wtt.json"

    filepath = os.path.join(WTT_DIR, category, filename)
    with open(filepath, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    feeder_records = [r for r in data if r["类型"] == EVENT_TYPE]
    print(f"  {category.upper()}: {len(feeder_records)} Feeder records found (expected: {expected_count})")

    # Check for duplicates
    seen = set()
    dupes = 0
    for r in feeder_records:
        key = (r["日期"], r["类型"], r["胜者"], r["负者"])
        if key in seen:
            dupes += 1
        seen.add(key)

    if dupes > 0:
        print(f"  WARNING: {dupes} duplicate records found in {category.upper()}!")
    else:
        print(f"  {category.upper()}: No duplicates found")

    return len(feeder_records) == expected_count


def main():
    print("=" * 60)
    print("WTT Feeder Vadodara 2026 - Data Import")
    print("=" * 60)

    # Step 1: Add event coefficient
    print("\n[1/3] Adding 'Feeder' event type to event-coefficient.json...")
    add_event_coefficient()

    # Step 2: Import match data
    print("\n[2/3] Importing match data...")
    total = 0
    total += append_to_scorelog("ms", ms_matches)
    total += append_to_scorelog("ws", ws_matches)
    total += append_to_scorelog("md", md_matches)
    total += append_to_scorelog("wd", wd_matches)
    total += append_to_scorelog("xd", xd_matches)
    print(f"\n  Total new records: {total}")

    # Step 3: Verify
    print("\n[3/3] Verifying imported data...")
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
