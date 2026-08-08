#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Feeder Doha 2026 - 数据录入脚本
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
    ("2026-01-29", "Nikita ARTEMENKO", "WEN Ruibo"),
    ("2026-01-29", "Alan KURMANGALIYEV", "Remi CHAMBET-WEIL"),
    ("2026-01-29", "Martin ANDERSEN", "LAI Yong Han"),
    ("2026-01-29", "XU Yingbin", "Cedric MEISSNER"),
    ("2026-01-29", "HUANG Youzheng", "LEE Seungsoo"),
    ("2026-01-29", "XU Haidong", "Evgeny TIKHONOV"),
    ("2026-01-29", "Amirreza ABBASI", "Sultan AL-KUWARI"),
    ("2026-01-29", "YUAN Licen", "Iskender KHARKI"),
    ("2026-01-29", "Snehit SURAVAJJULA", "Ahmed KORANI"),
    ("2026-01-29", "Balazs LEI", "Julian RZIHAUSCHEK"),
    ("2026-01-29", "Kazuki YOSHIYAMA", "Denis IVONIN"),
    ("2026-01-29", "Sathiyan GNANASEKARAN", "LI Hechen"),
    ("2026-01-29", "Ryoichi YOSHIYAMA", "Connor GREEN"),
    ("2026-01-29", "TAN Zhao Ray", "Wassim ESSID"),
    ("2026-01-29", "Mohammed ABDULWAHHAB", "Abdullah ABDULWAHHAB"),
    ("2026-01-29", "CHEN Junsong", "Thitaphat PREECHAYAN"),
    # Round of 16 - 30 Jan
    ("2026-01-30", "Nikita ARTEMENKO", "Alan KURMANGALIYEV"),
    ("2026-01-30", "XU Yingbin", "Martin ANDERSEN"),
    ("2026-01-30", "HUANG Youzheng", "XU Haidong"),
    ("2026-01-30", "YUAN Licen", "Amirreza ABBASI"),
    ("2026-01-30", "Balazs LEI", "Snehit SURAVAJJULA"),
    ("2026-01-30", "Sathiyan GNANASEKARAN", "Kazuki YOSHIYAMA"),
    ("2026-01-30", "Ryoichi YOSHIYAMA", "TAN Zhao Ray"),
    ("2026-01-30", "CHEN Junsong", "Mohammed ABDULWAHHAB"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "Nikita ARTEMENKO", "XU Yingbin"),
    ("2026-01-30", "HUANG Youzheng", "YUAN Licen"),
    ("2026-01-30", "Sathiyan GNANASEKARAN", "Balazs LEI"),
    ("2026-01-30", "Ryoichi YOSHIYAMA", "CHEN Junsong"),
    # Semi Final - 31 Jan
    ("2026-01-31", "HUANG Youzheng", "Nikita ARTEMENKO"),
    ("2026-01-31", "Ryoichi YOSHIYAMA", "Sathiyan GNANASEKARAN"),
    # Final - 31 Jan
    ("2026-01-31", "HUANG Youzheng", "Ryoichi YOSHIYAMA"),
]

# ============================================================
# WS (Women's Singles) - 31 matches
# ============================================================
ws_matches = [
    # Round of 32 - 29 Jan
    ("2026-01-29", "QIN Yuxuan", "BAI Siwen"),
    ("2026-01-29", "Rokaia ELBAZ", "Taneesha KOTECHA"),
    ("2026-01-29", "SER Lin Qian", "Arina SLAUTINA"),
    ("2026-01-29", "YANG Yiyun", "KONG Tsz Lam"),
    ("2026-01-29", "FAN Shuhan", "Aia MOHAMED"),
    ("2026-01-29", "TAN Zhao Yun", "Tianer YU"),
    ("2026-01-29", "Vlada VORONINA", "LEE Hoi Man"),
    ("2026-01-29", "HAN Feier", "ZHU Sibing"),
    ("2026-01-29", "PARK Gahyeon", "Olga VISHNIAKOVA"),
    ("2026-01-29", "ZHU Chengzhu", "HUANG Yu-Jie"),
    ("2026-01-29", "Olga VOROBEVA", "Sarvinoz MIRKADIROVA"),
    ("2026-01-29", "YEH Yi-Tian", "LOY Ming Ying"),
    ("2026-01-29", "Elizabet ABRAAMIAN", "Ayhika MUKHERJEE"),
    ("2026-01-29", "Tin-Tin HO", "Suhana SAINI"),
    ("2026-01-29", "YAO Ruixuan", "CHEN Chi-Shiuan"),
    ("2026-01-29", "Sayali WANI", "ZONG Geman"),
    # Round of 16 - 30 Jan
    ("2026-01-30", "QIN Yuxuan", "Rokaia ELBAZ"),
    ("2026-01-30", "YANG Yiyun", "SER Lin Qian"),
    ("2026-01-30", "FAN Shuhan", "TAN Zhao Yun"),
    ("2026-01-30", "HAN Feier", "Vlada VORONINA"),
    ("2026-01-30", "PARK Gahyeon", "ZHU Chengzhu"),
    ("2026-01-30", "YEH Yi-Tian", "Olga VOROBEVA"),
    ("2026-01-30", "Tin-Tin HO", "Elizabet ABRAAMIAN"),
    ("2026-01-30", "Sayali WANI", "YAO Ruixuan"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "YANG Yiyun", "QIN Yuxuan"),
    ("2026-01-30", "HAN Feier", "FAN Shuhan"),
    ("2026-01-30", "PARK Gahyeon", "YEH Yi-Tian"),
    ("2026-01-30", "Sayali WANI", "Tin-Tin HO"),
    # Semi Final - 31 Jan
    ("2026-01-31", "YANG Yiyun", "HAN Feier"),
    ("2026-01-31", "PARK Gahyeon", "Sayali WANI"),
    # Final - 31 Jan
    ("2026-01-31", "YANG Yiyun", "PARK Gahyeon"),
]

# ============================================================
# MD (Men's Doubles) - 15 matches (1 BYE skipped)
# ============================================================
md_matches = [
    # Round of 16 - 29 Jan
    ("2026-01-29", "HUANG Youzheng/WEN Ruibo", "Riyan DUTTA/Shihan PALKHIVALA"),
    ("2026-01-29", "Martin ANDERSEN/Alan KURMANGALIYEV", "Mohammed ABDULWAHHAB/Abdullah ABDULWAHHAB"),
    ("2026-01-29", "XU Haidong/CHEN Junsong", "Ahmed KORANI/Sultan AL-KUWARI"),
    ("2026-01-29", "Iskender KHARKI/Vladislav ZAKHAROV", "Thitaphat PREECHAYAN/Thanapak SUPHANPHASUCH"),
    ("2026-01-29", "Vladislav MAKAROV/Nikita ARTEMENKO", "LE Ellsworth/CHEW Clarence"),
    ("2026-01-29", "Kazuki YOSHIYAMA/Ryoichi YOSHIYAMA", "Abdulaziz AL ABDULLA/Yousif ABDALLA"),
    ("2026-01-29", "Remi CHAMBET-WEIL/Wassim ESSID", "LAI Yong Han/LAI Yong Ren"),
    ("2026-01-29", "XU Yingbin/YUAN Licen", "Evgeny TIKHONOV/Dmitrii VINOGRADOV"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "HUANG Youzheng/WEN Ruibo", "Martin ANDERSEN/Alan KURMANGALIYEV"),
    ("2026-01-30", "XU Haidong/CHEN Junsong", "Iskender KHARKI/Vladislav ZAKHAROV"),
    ("2026-01-30", "Kazuki YOSHIYAMA/Ryoichi YOSHIYAMA", "Vladislav MAKAROV/Nikita ARTEMENKO"),
    ("2026-01-30", "XU Yingbin/YUAN Licen", "Remi CHAMBET-WEIL/Wassim ESSID"),
    # Semi Final - 30 Jan
    ("2026-01-30", "HUANG Youzheng/WEN Ruibo", "XU Haidong/CHEN Junsong"),
    ("2026-01-30", "XU Yingbin/YUAN Licen", "Kazuki YOSHIYAMA/Ryoichi YOSHIYAMA"),
    # Final - 31 Jan
    ("2026-01-31", "XU Yingbin/YUAN Licen", "HUANG Youzheng/WEN Ruibo"),
]

# ============================================================
# WD (Women's Doubles) - 14 matches (3 BYEs skipped)
# ============================================================
wd_matches = [
    # Round of 16 - 29 Jan
    ("2026-01-29", "TAN Zhao Yun/LAI Chloe", "Tin-Tin HO/Tianer YU"),
    ("2026-01-29", "Maria PANFILOVA/Arina SLAUTINA", "Aia MOHAMED/Rokaia ELBAZ"),
    ("2026-01-29", "HAN Feier/FAN Shuhan", "Sayali WANI/Taneesha KOTECHA"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "QIN Yuxuan/ZONG Geman", "TAN Zhao Yun/LAI Chloe"),
    ("2026-01-30", "KONG Tsz Lam/LEE Hoi Man", "SER Lin Qian/LOY Ming Ying"),
    ("2026-01-30", "YANG Yiyun/ZHU Sibing", "Maria PANFILOVA/Arina SLAUTINA"),
    ("2026-01-30", "HAN Feier/FAN Shuhan", "Elizabet ABRAAMIAN/Vlada VORONINA"),
    # Semi Final - 30 Jan
    ("2026-01-30", "QIN Yuxuan/ZONG Geman", "KONG Tsz Lam/LEE Hoi Man"),
    ("2026-01-30", "HAN Feier/FAN Shuhan", "YANG Yiyun/ZHU Sibing"),
    # Final - 31 Jan
    ("2026-01-31", "QIN Yuxuan/ZONG Geman", "HAN Feier/FAN Shuhan"),
]

# ============================================================
# XD (Mixed Doubles) - 15 matches
# ============================================================
xd_matches = [
    # Round of 16 - 29 Jan
    ("2026-01-29", "YUAN Licen/BAI Siwen", "CHEN Junsong/QIN Yuxuan"),
    ("2026-01-29", "Snehit SURAVAJJULA/Sayali WANI", "Tarvachinbo BUYAN/Khatansaikhan GANZORIG"),
    ("2026-01-29", "Vladislav MAKAROV/Vlada VORONINA", "LE Ellsworth/LAI Chloe"),
    ("2026-01-29", "CHEW Clarence/LOY Ming Ying", "Abdulaziz AL ABDULLA/Racha LOGHRAIBI"),
    ("2026-01-29", "TAN Zhao Ray/TAN Zhao Yun", "Sultan AL-KUWARI/Rokaia ELBAZ"),
    ("2026-01-29", "Connor GREEN/Tin-Tin HO", "Mohammed ABDULWAHHAB/Aia MOHAMED"),
    ("2026-01-29", "Dmitrii VINOGRADOV/Arina SLAUTINA", "HUANG Youzheng/ZONG Geman"),
    ("2026-01-29", "Evgeny TIKHONOV/Maria PANFILOVA", "Iskender KHARKI/Sarvinoz MIRKADIROVA"),
    # Quarter Final - 30 Jan
    ("2026-01-30", "YUAN Licen/BAI Siwen", "Snehit SURAVAJJULA/Sayali WANI"),
    ("2026-01-30", "CHEW Clarence/LOY Ming Ying", "Vladislav MAKAROV/Vlada VORONINA"),
    ("2026-01-30", "Connor GREEN/Tin-Tin HO", "TAN Zhao Ray/TAN Zhao Yun"),
    ("2026-01-30", "Evgeny TIKHONOV/Maria PANFILOVA", "Dmitrii VINOGRADOV/Arina SLAUTINA"),
    # Semi Final - 30 Jan
    ("2026-01-30", "CHEW Clarence/LOY Ming Ying", "YUAN Licen/BAI Siwen"),
    ("2026-01-30", "Evgeny TIKHONOV/Maria PANFILOVA", "Connor GREEN/Tin-Tin HO"),
    # Final - 31 Jan
    ("2026-01-31", "Evgeny TIKHONOV/Maria PANFILOVA", "CHEW Clarence/LOY Ming Ying"),
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


def verify_data(category, expected_count):
    """Verify the imported data"""
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

    filepath = os.path.join(WTT_DIR, category, filename)
    with open(filepath, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    feeder_records = [r for r in data if r["类型"] == EVENT_TYPE]
    print(f"  {category.upper()}: {len(feeder_records)} 支线赛 records found (expected: {expected_count})")

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
    print("WTT Feeder Doha 2026 - Data Import (append only)")
    print("=" * 60)

    # Import match data
    print("\n[1/2] Importing match data...")
    total = 0
    total += append_to_scorelog("ms", ms_matches)
    total += append_to_scorelog("ws", ws_matches)
    total += append_to_scorelog("md", md_matches)
    total += append_to_scorelog("wd", wd_matches)
    total += append_to_scorelog("xd", xd_matches)
    print(f"\n  Total new records: {total}")

    # Verify
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
