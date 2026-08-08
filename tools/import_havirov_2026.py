#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Feeder Havirov 2026 - 数据录入脚本
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
# MS (Men's Singles) - 47 matches
# ============================================================
ms_matches = [
    # Round of 64 - 15 Apr
    ("2026-04-15", "Carlos FRANCO", "Clement LAINE"),
    ("2026-04-15", "Nandan NARESH", "Martin ANDERSEN"),
    ("2026-04-15", "Ondrej KVETON", "Mihai BOBOCICA"),
    ("2026-04-15", "Albert VILARDELL", "Amirreza ABBASI"),
    ("2026-04-15", "Andrei PUTUNTICA", "JANG Seongil"),
    ("2026-04-15", "Connor GREEN", "Benjamin FRUCHART"),
    ("2026-04-15", "Vincent PICARD", "Hayate SUZUKI"),
    ("2026-04-15", "KWON Hyuk", "Remi BETELU"),
    ("2026-04-15", "Hiromu KOBAYASHI", "Jan VALENTA"),
    ("2026-04-15", "Romain BRARD", "YIU Kwan To"),
    ("2026-04-15", "Yuto KIZUKURI", "Pavel SIRUCEK"),
    ("2026-04-15", "Marek BADOWSKI", "Stepan BRHEL"),
    ("2026-04-15", "Jakub ZELINKA", "Emanuel OTALVARO"),
    ("2026-04-15", "Guilherme TEODORO", "Felipe ARADO"),
    ("2026-04-15", "Yang WANG", "KWAN Man Ho"),
    ("2026-04-15", "Lubomir PISTEJ", "Abdullah YIGENLER"),
    # Round of 32 - 15 Apr
    ("2026-04-15", "Lubomir JANCARIK", "Carlos FRANCO"),
    ("2026-04-15", "Deni KOZUL", "Nandan NARESH"),
    ("2026-04-15", "Gustavo GOMEZ", "Ondrej KVETON"),
    ("2026-04-15", "Aditya SAREEN", "Albert VILARDELL"),
    ("2026-04-15", "Lilian BARDET", "Andrei PUTUNTICA"),
    ("2026-04-15", "Connor GREEN", "John OYEBODE"),
    ("2026-04-15", "Vincent PICARD", "Niagol STOYANOV"),
    ("2026-04-15", "KWON Hyuk", "CHAN Baldwin"),
    ("2026-04-15", "Alvaro ROBLES", "Hiromu KOBAYASHI"),
    ("2026-04-15", "Romain BRARD", "Akash PAL"),
    ("2026-04-15", "Yuto KIZUKURI", "Payas JAIN"),
    ("2026-04-15", "Marek BADOWSKI", "Joe SEYFRIED"),
    ("2026-04-15", "Elias RANEFUR", "Jakub ZELINKA"),
    ("2026-04-15", "Jules ROLLAND", "Guilherme TEODORO"),
    ("2026-04-15", "Yang WANG", "Ryuusei KAWAKAMI"),
    ("2026-04-15", "Lubomir PISTEJ", "Finn LUU"),
    # Round of 16 - 16 Apr
    ("2026-04-16", "Deni KOZUL", "Lubomir JANCARIK"),
    ("2026-04-16", "Gustavo GOMEZ", "Aditya SAREEN"),
    ("2026-04-16", "Lilian BARDET", "Connor GREEN"),
    ("2026-04-16", "KWON Hyuk", "Vincent PICARD"),
    ("2026-04-16", "Romain BRARD", "Alvaro ROBLES"),
    ("2026-04-16", "Yuto KIZUKURI", "Marek BADOWSKI"),
    ("2026-04-16", "Elias RANEFUR", "Jules ROLLAND"),
    ("2026-04-16", "Lubomir PISTEJ", "Yang WANG"),
    # Quarter Final - 16 Apr
    ("2026-04-16", "Deni KOZUL", "Gustavo GOMEZ"),
    ("2026-04-16", "Lilian BARDET", "KWON Hyuk"),
    ("2026-04-16", "Yuto KIZUKURI", "Romain BRARD"),
    ("2026-04-16", "Elias RANEFUR", "Lubomir PISTEJ"),
    # Semi Final - 17 Apr
    ("2026-04-17", "Deni KOZUL", "Lilian BARDET"),
    ("2026-04-17", "Yuto KIZUKURI", "Elias RANEFUR"),
    # Final - 17 Apr
    ("2026-04-17", "Yuto KIZUKURI", "Deni KOZUL"),
]

# ============================================================
# WS (Women's Singles) - 47 matches
# ============================================================
ws_matches = [
    # Round of 64 - 15 Apr
    ("2026-04-15", "TSAI Yun-En", "Suhana SAINI"),
    ("2026-04-15", "Sutirtha MUKHERJEE", "LEE Daeun"),
    ("2026-04-15", "Asuka SASAO", "Josephina NEUMANN"),
    ("2026-04-15", "Ece HARAC", "Hanka KODET"),
    ("2026-04-15", "Veronika POLAKOVA", "Jana VASENDOVA"),
    ("2026-04-15", "Sachi AOKI", "Agathe AVEZOU"),
    ("2026-04-15", "Isa COK", "Laura WATANABE"),
    ("2026-04-15", "Karin GROFOVA", "Anna WEGRZYN"),
    ("2026-04-15", "Tin-Tin HO", "Nicole ARLIA"),
    ("2026-04-15", "Zuzanna WIELGOS", "Taneesha KOTECHA"),
    ("2026-04-15", "CHOI Haeeun", "Sarvinoz MIRKADIROVA"),
    ("2026-04-15", "CHOI Seoyeon", "Elvira RAD"),
    ("2026-04-15", "Matilda HANSSON", "Barbora VARADY"),
    ("2026-04-15", "Kasumi KIMURA", "CHEN Min-Hsin"),
    ("2026-04-15", "Filippa BERGAND", "Nithya MANI"),
    ("2026-04-15", "Debora VIVARELLI", "Ivana MALOBABIC"),
    # Round of 32 - 15 Apr
    ("2026-04-15", "Yangzi LIU", "TSAI Yun-En"),
    ("2026-04-15", "Sutirtha MUKHERJEE", "Giulia TAKAHASHI"),
    ("2026-04-15", "Asuka SASAO", "Jessica REYES LAI"),
    ("2026-04-15", "KIM Seongjin", "Ece HARAC"),
    ("2026-04-15", "Kaho AKAE", "Veronika POLAKOVA"),
    ("2026-04-15", "Sachi AOKI", "Jiamuwa WU"),
    ("2026-04-15", "Katarzyna WEGRZYN", "Isa COK"),
    ("2026-04-15", "Christina KALLBERG", "Karin GROFOVA"),
    ("2026-04-15", "HUANG Yu-Jie", "Tin-Tin HO"),
    ("2026-04-15", "Yuan WAN", "Zuzanna WIELGOS"),
    ("2026-04-15", "Xiaoxin YANG", "CHOI Haeeun"),
    ("2026-04-15", "Linda BERGSTROM", "CHOI Seoyeon"),
    ("2026-04-15", "YOO Yerin", "Matilda HANSSON"),
    ("2026-04-15", "Kasumi KIMURA", "Tatiana KUKULKOVA"),
    ("2026-04-15", "Filippa BERGAND", "Paulina VEGA"),
    ("2026-04-15", "Anna HURSEY", "Debora VIVARELLI"),
    # Round of 16 - 16 Apr
    ("2026-04-16", "Yangzi LIU", "Sutirtha MUKHERJEE"),
    ("2026-04-16", "Asuka SASAO", "KIM Seongjin"),
    ("2026-04-16", "Kaho AKAE", "Sachi AOKI"),
    ("2026-04-16", "Christina KALLBERG", "Katarzyna WEGRZYN"),
    ("2026-04-16", "HUANG Yu-Jie", "Yuan WAN"),
    ("2026-04-16", "Xiaoxin YANG", "Linda BERGSTROM"),
    ("2026-04-16", "Kasumi KIMURA", "YOO Yerin"),
    ("2026-04-16", "Anna HURSEY", "Filippa BERGAND"),
    # Quarter Final - 16 Apr
    ("2026-04-16", "Asuka SASAO", "Yangzi LIU"),
    ("2026-04-16", "Kaho AKAE", "Christina KALLBERG"),
    ("2026-04-16", "HUANG Yu-Jie", "Xiaoxin YANG"),
    ("2026-04-16", "Kasumi KIMURA", "Anna HURSEY"),
    # Semi Final - 17 Apr
    ("2026-04-17", "Kaho AKAE", "Asuka SASAO"),
    ("2026-04-17", "HUANG Yu-Jie", "Kasumi KIMURA"),
    # Final - 17 Apr
    ("2026-04-17", "Kaho AKAE", "HUANG Yu-Jie"),
]

# ============================================================
# MD (Men's Doubles) - 15 matches
# ============================================================
md_matches = [
    # Round of 16 - 15 Apr
    ("2026-04-15", "CHAN Baldwin/YIU Kwan To", "Martin ANDERSEN/Nandan NARESH"),
    ("2026-04-15", "JANG Seongil/KWON Hyuk", "Samuel ARPAS/Mykhailo LOVHA"),
    ("2026-04-15", "Ondrej KVETON/Radim MORAVEK", "Payas JAIN/Akash PAL"),
    ("2026-04-15", "Joe SEYFRIED/Vincent PICARD", "Alexander CHEN/KWAN Man Ho"),
    ("2026-04-15", "Felipe ARADO/Guilherme TEODORO", "Stepan BRHEL/Jakub KAUCKY"),
    ("2026-04-15", "Hayate SUZUKI/Hiromu KOBAYASHI", "CHOI Hojun/BACK Donghoon"),
    ("2026-04-15", "Samuel PALUSEK/Damian FLORO", "Won BAE/Finn LUU"),
    ("2026-04-15", "Lubomir PISTEJ/Jakub ZELINKA", "Alexander VALUCH/Yang WANG"),
    # Quarter Final - 16 Apr
    ("2026-04-16", "CHAN Baldwin/YIU Kwan To", "JANG Seongil/KWON Hyuk"),
    ("2026-04-16", "Ondrej KVETON/Radim MORAVEK", "Joe SEYFRIED/Vincent PICARD"),
    ("2026-04-16", "Hayate SUZUKI/Hiromu KOBAYASHI", "Felipe ARADO/Guilherme TEODORO"),
    ("2026-04-16", "Samuel PALUSEK/Damian FLORO", "Lubomir PISTEJ/Jakub ZELINKA"),
    # Semi Final - 16 Apr
    ("2026-04-16", "CHAN Baldwin/YIU Kwan To", "Ondrej KVETON/Radim MORAVEK"),
    ("2026-04-16", "Samuel PALUSEK/Damian FLORO", "Hayate SUZUKI/Hiromu KOBAYASHI"),
    # Final - 17 Apr
    ("2026-04-17", "CHAN Baldwin/YIU Kwan To", "Samuel PALUSEK/Damian FLORO"),
]

# ============================================================
# WD (Women's Doubles) - 15 matches
# ============================================================
wd_matches = [
    # Round of 16 - 15 Apr
    ("2026-04-15", "Yuan WAN/Yangzi LIU", "LEE Seungmi/CHOI Seoyeon"),
    ("2026-04-15", "Filippa BERGAND/Linda BERGSTROM", "Anna WEGRZYN/Katarzyna WEGRZYN"),
    ("2026-04-15", "Kaho AKAE/Asuka SASAO", "Jiamuwa WU/Jessica REYES LAI"),
    ("2026-04-15", "CHOI Yeseo/LEE Dahye", "Giulia TAKAHASHI/Laura WATANABE"),
    ("2026-04-15", "KIM Seongjin/CHOI Haeeun", "Tin-Tin HO/Anna HURSEY"),
    ("2026-04-15", "HUANG Yu-Jie/TSAI Yun-En", "Ema LABOSOVA/Isa COK"),
    ("2026-04-15", "Veronika POLAKOVA/Hanka KODET", "Karin GROFOVA/Anna KLEMPEREROVA"),
    ("2026-04-15", "Barbora VARADY/Tatiana KUKULKOVA", "Mille STOFFREGEN/Emma CLEMENT"),
    # Quarter Final - 16 Apr
    ("2026-04-16", "Filippa BERGAND/Linda BERGSTROM", "Yuan WAN/Yangzi LIU"),
    ("2026-04-16", "Kaho AKAE/Asuka SASAO", "CHOI Yeseo/LEE Dahye"),
    ("2026-04-16", "HUANG Yu-Jie/TSAI Yun-En", "KIM Seongjin/CHOI Haeeun"),
    ("2026-04-16", "Barbora VARADY/Tatiana KUKULKOVA", "Veronika POLAKOVA/Hanka KODET"),
    # Semi Final - 16 Apr
    ("2026-04-16", "Kaho AKAE/Asuka SASAO", "Filippa BERGAND/Linda BERGSTROM"),
    ("2026-04-16", "HUANG Yu-Jie/TSAI Yun-En", "Barbora VARADY/Tatiana KUKULKOVA"),
    # Final - 17 Apr
    ("2026-04-17", "Kaho AKAE/Asuka SASAO", "HUANG Yu-Jie/TSAI Yun-En"),
]

# ============================================================
# XD (Mixed Doubles) - 15 matches
# ============================================================
xd_matches = [
    # Round of 16 - 15 Apr
    ("2026-04-15", "Stepan BRHEL/Veronika POLAKOVA", "Guilherme TEODORO/Giulia TAKAHASHI"),
    ("2026-04-15", "Nandan NARESH/Jessica REYES LAI", "Payas JAIN/Taneesha KOTECHA"),
    ("2026-04-15", "Connor GREEN/Tin-Tin HO", "Louis LAINE/Claire PICARD"),
    ("2026-04-15", "Marek BADOWSKI/Zuzanna WIELGOS", "Benjamin FRUCHART/Isa COK"),
    ("2026-04-15", "BACK Donghoon/KIM Seoyun", "Abdullah YIGENLER/Ece HARAC"),
    ("2026-04-15", "Finn LUU/Yangzi LIU", "Akash PAL/Sutirtha MUKHERJEE"),
    ("2026-04-15", "Samuel ARPAS/Barbora VARADY", "Ondrej KVETON/Hanka KODET"),
    ("2026-04-15", "Lubomir PISTEJ/Tatiana KUKULKOVA", "Iskender KHARKI/Sarvinoz MIRKADIROVA"),
    # Quarter Final - 15 Apr
    ("2026-04-15", "Nandan NARESH/Jessica REYES LAI", "Stepan BRHEL/Veronika POLAKOVA"),
    ("2026-04-15", "Marek BADOWSKI/Zuzanna WIELGOS", "Connor GREEN/Tin-Tin HO"),
    ("2026-04-15", "BACK Donghoon/KIM Seoyun", "Finn LUU/Yangzi LIU"),
    ("2026-04-15", "Samuel ARPAS/Barbora VARADY", "Lubomir PISTEJ/Tatiana KUKULKOVA"),
    # Semi Final - 16 Apr
    ("2026-04-16", "Marek BADOWSKI/Zuzanna WIELGOS", "Nandan NARESH/Jessica REYES LAI"),
    ("2026-04-16", "Samuel ARPAS/Barbora VARADY", "BACK Donghoon/KIM Seoyun"),
    # Final - 17 Apr
    ("2026-04-17", "Samuel ARPAS/Barbora VARADY", "Marek BADOWSKI/Zuzanna WIELGOS"),
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
    print("WTT Feeder Havirov 2026 - Data Import (append only)")
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
