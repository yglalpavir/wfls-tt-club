#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Feeder Varazdin 2026 - 数据录入脚本
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
    # Round of 64 - 14 Mar
    ("2026-03-14", "KIM Gaon", "Maxime ANTOINE MICHARD"),
    ("2026-03-14", "Hugo DESCHAMPS", "TSENG Tzu-Yu"),
    ("2026-03-14", "Tom SCHWEIGER", "Ioannis SGOUROPOULOS"),
    ("2026-03-14", "Radim MORAVEK", "Ondrej KVETON"),
    ("2026-03-14", "Esteban DORR", "Rares SIPOS"),
    ("2026-03-14", "Leon BENKO", "Brin VOVK PETROVSKI"),
    ("2026-03-14", "Peter HRIBAR", "Laurens DEVOS"),
    ("2026-03-14", "Maciej KOLODZIEJCZYK", "Florent LAMBIET"),
    ("2026-03-14", "Miguel PANTOJA", "Carlos FRANCO"),
    ("2026-03-14", "Jo YOKOTANI", "Amir Hossein HODAEI"),
    ("2026-03-14", "Alexis KOURAICHI", "Ivor BAN"),
    ("2026-03-14", "Juan PEREZ", "Borna PETEK"),
    ("2026-03-14", "WOO Hyeonggyu", "Benno OEHME"),
    ("2026-03-14", "Diego LILLO", "Tom CLOSSET"),
    ("2026-03-14", "Ivan HENCL", "Simeon MARTIN"),
    ("2026-03-14", "Norbert TAULER", "Romain BRARD"),
    # Round of 32 - 14 Mar
    ("2026-03-14", "Kazuki HAMADA", "KIM Gaon"),
    ("2026-03-14", "Hugo DESCHAMPS", "Felipe ARADO"),
    ("2026-03-14", "Tom SCHWEIGER", "LIN Yen-Chun"),
    ("2026-03-14", "Florian BOURRASSAUD", "Radim MORAVEK"),
    ("2026-03-14", "Esteban DORR", "Jules ROLLAND"),
    ("2026-03-14", "Vincent PICARD", "Leon BENKO"),
    ("2026-03-14", "Lubomir PISTEJ", "Peter HRIBAR"),
    ("2026-03-14", "Deni KOZUL", "Maciej KOLODZIEJCZYK"),
    ("2026-03-14", "Cedric MEISSNER", "Miguel PANTOJA"),
    ("2026-03-14", "Jo YOKOTANI", "QUEK Izaac"),
    ("2026-03-14", "KWON Hyuk", "Alexis KOURAICHI"),
    ("2026-03-14", "Juan PEREZ", "CHANG Yu-An"),
    ("2026-03-14", "WOO Hyeonggyu", "Ylane BATIX"),
    ("2026-03-14", "Csaba ANDRAS", "Diego LILLO"),
    ("2026-03-14", "Borgar HAUG", "Ivan HENCL"),
    ("2026-03-14", "Alvaro ROBLES", "Norbert TAULER"),
    # Round of 16 - 15 Mar
    ("2026-03-15", "Kazuki HAMADA", "Hugo DESCHAMPS"),
    ("2026-03-15", "Florian BOURRASSAUD", "Tom SCHWEIGER"),
    ("2026-03-15", "Esteban DORR", "Vincent PICARD"),
    ("2026-03-15", "Deni KOZUL", "Lubomir PISTEJ"),
    ("2026-03-15", "Cedric MEISSNER", "Jo YOKOTANI"),
    ("2026-03-15", "Juan PEREZ", "KWON Hyuk"),
    ("2026-03-15", "Csaba ANDRAS", "WOO Hyeonggyu"),
    ("2026-03-15", "Alvaro ROBLES", "Borgar HAUG"),
    # Quarter Final - 15 Mar
    ("2026-03-15", "Kazuki HAMADA", "Florian BOURRASSAUD"),
    ("2026-03-15", "Esteban DORR", "Deni KOZUL"),
    ("2026-03-15", "Juan PEREZ", "Cedric MEISSNER"),
    ("2026-03-15", "Csaba ANDRAS", "Alvaro ROBLES"),
    # Semi Final - 16 Mar
    ("2026-03-16", "Kazuki HAMADA", "Esteban DORR"),
    ("2026-03-16", "Csaba ANDRAS", "Juan PEREZ"),
    # Final - 16 Mar
    ("2026-03-16", "Csaba ANDRAS", "Kazuki HAMADA"),
]

# ============================================================
# WS (Women's Singles) - 47 matches
# ============================================================
ws_matches = [
    # Round of 64 - 14 Mar
    ("2026-03-14", "Bianca MEI-ROSU", "Dora COSIC"),
    ("2026-03-14", "Kulapassr VIJITVIRIYAGUL", "Ema LABOSOVA"),
    ("2026-03-14", "LEE Daeun", "Brianna BURGOS"),
    ("2026-03-14", "Yuka KANEYOSHI", "Zuzanna WIELGOS"),
    ("2026-03-14", "Franziska SCHREINER", "Arantxa COSSIO"),
    ("2026-03-14", "Ivana MALOBABIC", "Andrea PAVLOVIC"),
    ("2026-03-14", "Elvira RAD", "Lilou MASSART"),
    ("2026-03-14", "Ana TOFANT", "Phatsaraphon WONGLAKHON"),
    ("2026-03-14", "Ioana SINGEORZAN", "Jana VASENDOVA"),
    ("2026-03-14", "Claire PICARD", "Eugenia SASTRE"),
    ("2026-03-14", "Sachi AOKI", "Karina SHIRAY"),
    ("2026-03-14", "Anna WEGRZYN", "Klara HRABICOVA"),
    ("2026-03-14", "Franka MISKIC", "Dominika WILTSCHKOVA"),
    ("2026-03-14", "Anna BRZYSKA", "Sara TOKIC"),
    ("2026-03-14", "Maria BERZOSA", "Ainhoa CRISTOBAL"),
    ("2026-03-14", "Matilda HANSSON", "Kornelija RILISKYTE"),
    # Round of 32 - 14 Mar
    ("2026-03-14", "Bianca MEI-ROSU", "Sakura YOKOI"),
    ("2026-03-14", "Kulapassr VIJITVIRIYAGUL", "LEE Zion"),
    ("2026-03-14", "LEE Daeun", "Audrey ZARIF"),
    ("2026-03-14", "Yuka KANEYOSHI", "Giorgia PICCOLIN"),
    ("2026-03-14", "Maria XIAO", "Franziska SCHREINER"),
    ("2026-03-14", "Ivana MALOBABIC", "Elena ZAHARIA"),
    ("2026-03-14", "Tatiana KUKULKOVA", "Elvira RAD"),
    ("2026-03-14", "Ana TOFANT", "KIM Seongjin"),
    ("2026-03-14", "Ioana SINGEORZAN", "Camille LUTZ"),
    ("2026-03-14", "Katarzyna WEGRZYN", "Claire PICARD"),
    ("2026-03-14", "Sachi AOKI", "Hana ARAPOVIC"),
    ("2026-03-14", "YOO Yerin", "Anna WEGRZYN"),
    ("2026-03-14", "Nina MITTELHAM", "Franka MISKIC"),
    ("2026-03-14", "Misuzu TAKEYA", "Anna BRZYSKA"),
    ("2026-03-14", "Maria BERZOSA", "Laura WATANABE"),
    ("2026-03-14", "Charlotte LUTZ", "Matilda HANSSON"),
    # Round of 16 - 15 Mar
    ("2026-03-15", "Bianca MEI-ROSU", "Kulapassr VIJITVIRIYAGUL"),
    ("2026-03-15", "Yuka KANEYOSHI", "LEE Daeun"),
    ("2026-03-15", "Maria XIAO", "Ivana MALOBABIC"),
    ("2026-03-15", "Tatiana KUKULKOVA", "Ana TOFANT"),
    ("2026-03-15", "Ioana SINGEORZAN", "Katarzyna WEGRZYN"),
    ("2026-03-15", "Sachi AOKI", "YOO Yerin"),
    ("2026-03-15", "Nina MITTELHAM", "Misuzu TAKEYA"),
    ("2026-03-15", "Charlotte LUTZ", "Maria BERZOSA"),
    # Quarter Final - 15 Mar
    ("2026-03-15", "Yuka KANEYOSHI", "Bianca MEI-ROSU"),
    ("2026-03-15", "Maria XIAO", "Tatiana KUKULKOVA"),
    ("2026-03-15", "Sachi AOKI", "Ioana SINGEORZAN"),
    ("2026-03-15", "NINA MITTELHAM", "Charlotte LUTZ"),
    # Semi Final - 16 Mar
    ("2026-03-16", "Yuka KANEYOSHI", "Maria XIAO"),
    ("2026-03-16", "NINA MITTELHAM", "Sachi AOKI"),
    # Final - 16 Mar
    ("2026-03-16", "Yuka KANEYOSHI", "NINA MITTELHAM"),
]

# ============================================================
# MD (Men's Doubles) - 15 matches
# ============================================================
md_matches = [
    # Round of 16 - 14 Mar
    ("2026-03-14", "Esteban DORR/Florian BOURRASSAUD", "Leon BENKO/Ivan HENCL"),
    ("2026-03-14", "Csaba ANDRAS/Ivor BAN", "Riyan DUTTA/Shihan PALKHIVALA"),
    ("2026-03-14", "Deni KOZUL/Peter HRIBAR", "LIN Yen-Chun/CHANG Yu-An"),
    ("2026-03-14", "David SZANTOSI/Botond VARGA", "KIM Gaon/KWON Hyuk"),
    ("2026-03-14", "Stepan BRHEL/Jakub KAUCKY", "Jakub MAKARA/Vit KADLEC"),
    ("2026-03-14", "Miguel PANTOJA/Norbert TAULER", "Tom CLOSSET/Alessi MASSART"),
    ("2026-03-14", "Brin VOVK PETROVSKI/Miha PODOBNIK", "Ondrej KVETON/Radim MORAVEK"),
    ("2026-03-14", "Kazuki HAMADA/Jo YOKOTANI", "Deni VALE/Borna PETEK"),
    # Quarter Final - 15 Mar
    ("2026-03-15", "Esteban DORR/Florian BOURRASSAUD", "Csaba ANDRAS/Ivor BAN"),
    ("2026-03-15", "David SZANTOSI/Botond VARGA", "Deni KOZUL/Peter HRIBAR"),
    ("2026-03-15", "Miguel PANTOJA/Norbert TAULER", "Stepan BRHEL/Jakub KAUCKY"),
    ("2026-03-15", "Kazuki HAMADA/Jo YOKOTANI", "Brin VOVK PETROVSKI/Miha PODOBNIK"),
    # Semi Final - 15 Mar
    ("2026-03-15", "Esteban DORR/Florian BOURRASSAUD", "David SZANTOSI/Botond VARGA"),
    ("2026-03-15", "Kazuki HAMADA/Jo YOKOTANI", "Miguel PANTOJA/Norbert TAULER"),
    # Final - 16 Mar
    ("2026-03-16", "Esteban DORR/Florian BOURRASSAUD", "Kazuki HAMADA/Jo YOKOTANI"),
]

# ============================================================
# WD (Women's Doubles) - 15 matches
# ============================================================
wd_matches = [
    # Round of 16 - 14 Mar
    ("2026-03-14", "NINA MITTELHAM/Franziska SCHREINER", "Sachi AOKI/Sakura YOKOI"),
    ("2026-03-14", "Anna WEGRZYN/Katarzyna WEGRZYN", "Alice NILSSON/Matilda HANSSON"),
    ("2026-03-14", "Anna BRZYSKA/Zuzanna WIELGOS", "Camille LUTZ/Charlotte LUTZ"),
    ("2026-03-14", "Misuzu TAKEYA/Yuka KANEYOSHI", "Ainhoa CRISTOBAL/Elvira RAD"),
    ("2026-03-14", "Maria BERZOSA/Bianca MEI-ROSU", "Ivana MALOBABIC/Andrea PAVLOVIC"),
    ("2026-03-14", "Tatiana KUKULKOVA/Audrey ZARIF", "Ema CINCUROVA/Nikoleta PUCHOVANOVA"),
    ("2026-03-14", "Jana VASENDOVA/Klara HRABICOVA", "Brianna BURGOS/Lilou MASSART"),
    ("2026-03-14", "KIM Seongjin/LEE Daeun", "Sara TOKIC/Ana TOFANT"),
    # Quarter Final - 15 Mar
    ("2026-03-15", "NINA MITTELHAM/Franziska SCHREINER", "Anna WEGRZYN/Katarzyna WEGRZYN"),
    ("2026-03-15", "Misuzu TAKEYA/Yuka KANEYOSHI", "Anna BRZYSKA/Zuzanna WIELGOS"),
    ("2026-03-15", "Tatiana KUKULKOVA/Audrey ZARIF", "Maria BERZOSA/Bianca MEI-ROSU"),
    ("2026-03-15", "KIM Seongjin/LEE Daeun", "Jana VASENDOVA/Klara HRABICOVA"),
    # Semi Final - 15 Mar
    ("2026-03-15", "Misuzu TAKEYA/Yuka KANEYOSHI", "NINA MITTELHAM/Franziska SCHREINER"),
    ("2026-03-15", "Tatiana KUKULKOVA/Audrey ZARIF", "KIM Seongjin/LEE Daeun"),
    # Final - 16 Mar
    ("2026-03-16", "Misuzu TAKEYA/Yuka KANEYOSHI", "Tatiana KUKULKOVA/Audrey ZARIF"),
]

# ============================================================
# XD (Mixed Doubles) - 15 matches
# ============================================================
xd_matches = [
    # Round of 16 - 14 Mar
    ("2026-03-14", "Alvaro ROBLES/Maria XIAO", "Vit KADLEC/Klara HRABICOVA"),
    ("2026-03-14", "Ivan HENCL/Dora COSIC", "Deni KOZUL/Sara TOKIC"),
    ("2026-03-14", "Felipe ARADO/Karina SHIRAY", "Simeon MARTIN/Dominika WILTSCHKOVA"),
    ("2026-03-14", "Cedric MEISSNER/NINA MITTELHAM", "Peter HRIBAR/Ana TOFANT"),
    ("2026-03-14", "Florian BOURRASSAUD/Charlotte LUTZ", "Leon BENKO/Lana BENKO"),
    ("2026-03-14", "Ivor BAN/Hana ARAPOVIC", "Radim MORAVEK/Jana VASENDOVA"),
    ("2026-03-14", "Alessi MASSART/Lilou MASSART", "WOO Hyeonggyu/LEE Daeun"),
    ("2026-03-14", "Stepan BRHEL/Linda ZADEROVA", "Lubomir PISTEJ/Tatiana KUKULKOVA"),
    # Quarter Final - 14 Mar
    ("2026-03-14", "Alvaro ROBLES/Maria XIAO", "Ivan HENCL/Dora COSIC"),
    ("2026-03-14", "Cedric MEISSNER/NINA MITTELHAM", "Felipe ARADO/Karina SHIRAY"),
    ("2026-03-14", "Florian BOURRASSAUD/Charlotte LUTZ", "Ivor BAN/Hana ARAPOVIC"),
    ("2026-03-14", "Alessi MASSART/Lilou MASSART", "Stepan BRHEL/Linda ZADEROVA"),
    # Semi Final - 15 Mar
    ("2026-03-15", "Alvaro ROBLES/Maria XIAO", "Cedric MEISSNER/NINA MITTELHAM"),
    ("2026-03-15", "Alessi MASSART/Lilou MASSART", "Florian BOURRASSAUD/Charlotte LUTZ"),
    # Final - 16 Mar
    ("2026-03-16", "Alessi MASSART/Lilou MASSART", "Alvaro ROBLES/Maria XIAO"),
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
    print("WTT Feeder Varazdin 2026 - Data Import (append only)")
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
