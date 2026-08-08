#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WTT_DIR = os.path.join(ROOT_DIR, "wtt_data")

EVENT_TYPE = "支线赛"
EVENT_YEAR = "2026"

ms_matches = [
    ("2026-04-20", "Sohan GILLES", "Alexander VALUCH"),
    ("2026-04-20", "Peter HRIBAR", "Vladimir PANDUREVIC"),
    ("2026-04-20", "Andrea PUPPO", "Antoine DOYEN"),
    ("2026-04-20", "Maciej KOLODZIEJCZYK", "Ondrej KVETON"),
    ("2026-04-20", "Amirreza ABBASI", "Samuel ARPAS"),
    ("2026-04-20", "Hiromu KOBAYASHI", "BACK Donghoon"),
    ("2026-04-20", "Samuel PALUSEK", "Iskender KHARKI"),
    ("2026-04-20", "Mykhailo LOVHA", "Hugo DESCHAMPS"),
    ("2026-04-20", "Yuto KIZUKURI", "Jakub ZELINKA"),
    ("2026-04-20", "Patryk DZIUBA", "Felipe ARADO"),
    ("2026-04-20", "Yang WANG", "Simeon MARTIN"),
    ("2026-04-20", "JANG Seongil", "Rafael DE LAS HERAS"),
    ("2026-04-20", "Hayate SUZUKI", "Jash MODI"),
    ("2026-04-20", "Adam KLAJBER", "Radim MORAVEK"),
    ("2026-04-20", "Emanuel OTALVARO", "Nishant LEBAKA"),
    ("2026-04-20", "Zhenlong LIU", "Milosz SAWCZAK"),
    ("2026-04-20", "Finn LUU", "Sohan GILLES"),
    ("2026-04-20", "John OYEBODE", "Peter HRIBAR"),
    ("2026-04-20", "Ryuusei KAWAKAMI", "Andrea PUPPO"),
    ("2026-04-20", "Maciej KOLODZIEJCZYK", "Snehit SURAVAJJULA"),
    ("2026-04-20", "Amirreza ABBASI", "Lilian BARDET"),
    ("2026-04-20", "Lubomir PISTEJ", "Hiromu KOBAYASHI"),
    ("2026-04-20", "Niagol STOYANOV", "Samuel PALUSEK"),
    ("2026-04-20", "Akash PAL", "Mykhailo LOVHA"),
    ("2026-04-20", "Yuto KIZUKURI", "Vincent PICARD"),
    ("2026-04-20", "Deni KOZUL", "Patryk DZIUBA"),
    ("2026-04-20", "Yang WANG", "Payas JAIN"),
    ("2026-04-20", "JANG Seongil", "Aditya SAREEN"),
    ("2026-04-20", "Andrej GACINA", "Hayate SUZUKI"),
    ("2026-04-20", "Adam KLAJBER", "Dean SHU"),
    ("2026-04-20", "KWON Hyuk", "Emanuel OTALVARO"),
    ("2026-04-20", "Joe SEYFRIED", "Zhenlong LIU"),
    ("2026-04-21", "John OYEBODE", "Finn LUU"),
    ("2026-04-21", "Ryuusei KAWAKAMI", "Maciej KOLODZIEJCZYK"),
    ("2026-04-21", "Lubomir PISTEJ", "Amirreza ABBASI"),
    ("2026-04-21", "Niagol STOYANOV", "Akash PAL"),
    ("2026-04-21", "Yuto KIZUKURI", "Deni KOZUL"),
    ("2026-04-21", "Yang WANG", "JANG Seongil"),
    ("2026-04-21", "Andrej GACINA", "Adam KLAJBER"),
    ("2026-04-21", "Joe SEYFRIED", "KWON Hyuk"),
    ("2026-04-21", "John OYEBODE", "Ryuusei KAWAKAMI"),
    ("2026-04-21", "Lubomir PISTEJ", "Niagol STOYANOV"),
    ("2026-04-21", "Yang WANG", "Yuto KIZUKURI"),
    ("2026-04-21", "Joe SEYFRIED", "Andrej GACINA"),
    ("2026-04-22", "John OYEBODE", "Lubomir PISTEJ"),
    ("2026-04-22", "Joe SEYFRIED", "Yang WANG"),
    ("2026-04-22", "Joe SEYFRIED", "John OYEBODE"),
]

ws_matches = [
    ("2026-04-20", "Claire PICARD", "Ana TOFANT"),
    ("2026-04-20", "Nithya MANI", "CHOI Haeeun"),
    ("2026-04-20", "CHOI Seoyeon", "Helga DARI"),
    ("2026-04-20", "Valentina RIOS", "Dominika WILTSCHKOVA"),
    ("2026-04-20", "KIM Seoyun", "Suhana SAINI"),
    ("2026-04-20", "Marina DONNER", "Ema LABOSOVA"),
    ("2026-04-20", "Isa COK", "CHOI Yeseo"),
    ("2026-04-20", "Taneesha KOTECHA", "Hanka KODET"),
    ("2026-04-20", "Natalia GRIGELOVA", "Ema CINCUROVA"),
    ("2026-04-20", "Nina DAROVCOVA", "Jana VASENDOVA"),
    ("2026-04-20", "NatalIA GAJEWSKA", "Fabiola DIAZ"),
    ("2026-04-20", "LEE Dahye", "Klara HRABICOVA"),
    ("2026-04-20", "LEE Seungmi", "Sarvinoz MIRKADIROVA"),
    ("2026-04-20", "Lizaveta TSIMASHKOVA", "Nikoleta PUCHOVANOVA"),
    ("2026-04-20", "LEE Daeun", "Vanda VANISOVA"),
    ("2026-04-20", "Barbora VARADY", "Nina NEMETHOVA"),
    ("2026-04-20", "Yangzi LIU", "Claire PICARD"),
    ("2026-04-20", "Nithya MANI", "Rachel MORET"),
    ("2026-04-20", "CHOI Seoyeon", "Sutirtha MUKHERJEE"),
    ("2026-04-20", "Xiaoxin YANG", "Valentina RIOS"),
    ("2026-04-20", "Dina MESHREF", "KIM Seoyun"),
    ("2026-04-20", "TSAI Yun-En", "Marina DONNER"),
    ("2026-04-20", "Asuka SASAO", "Isa COK"),
    ("2026-04-20", "HUANG Yu-Jie", "Taneesha KOTECHA"),
    ("2026-04-20", "Lea RAKOVAC", "Natalia GRIGELOVA"),
    ("2026-04-20", "Laura WATANABE", "Nina DAROVCOVA"),
    ("2026-04-20", "Hana ARAPOVIC", "NatalIA GAJEWSKA"),
    ("2026-04-20", "YOO Yerin", "LEE Dahye"),
    ("2026-04-20", "KIM Seongjin", "LEE Seungmi"),
    ("2026-04-20", "Lizaveta TSIMASHKOVA", "Tatiana KUKULKOVA"),
    ("2026-04-20", "Sachi AOKI", "LEE Daeun"),
    ("2026-04-20", "Barbora VARADY", "Kaho AKAE"),
    ("2026-04-21", "Yangzi LIU", "Nithya MANI"),
    ("2026-04-21", "CHOI Seoyeon", "Xiaoxin YANG"),
    ("2026-04-21", "Dina MESHREF", "TSAI Yun-En"),
    ("2026-04-21", "Asuka SASAO", "HUANG Yu-Jie"),
    ("2026-04-21", "Lea RAKOVAC", "Laura WATANABE"),
    ("2026-04-21", "Hana ARAPOVIC", "YOO Yerin"),
    ("2026-04-21", "KIM Seongjin", "Lizaveta TSIMASHKOVA"),
    ("2026-04-21", "Sachi AOKI", "Barbora VARADY"),
    ("2026-04-21", "Yangzi LIU", "CHOI Seoyeon"),
    ("2026-04-21", "Dina MESHREF", "Asuka SASAO"),
    ("2026-04-21", "Lea RAKOVAC", "Hana ARAPOVIC"),
    ("2026-04-21", "KIM Seongjin", "Sachi AOKI"),
    ("2026-04-22", "Yangzi LIU", "Dina MESHREF"),
    ("2026-04-22", "Lea RAKOVAC", "YOO Yerin"),
    ("2026-04-22", "Yangzi LIU", "YOO Yerin"),
]

md_matches = [
    ("2026-04-20", "Lubomir PISTEJ/Jakub ZELINKA", "Samuel PALUSEK/Adam KLAJBER"),
    ("2026-04-20", "Yang WANG/Alexander VALUCH", "Jakub MAKARA/Vit KADLEC"),
    ("2026-04-20", "Finn LUU/Aditya SAREEN", "Mykhailo LOVHA/Samuel ARPAS"),
    ("2026-04-20", "CHOI Hojun/BACK Donghoon", "Deni KOZUL/Peter HRIBAR"),
    ("2026-04-20", "Radim MORAVEK/Ondrej KVETON", "Damian FLORO/Jakub GOLDIR"),
    ("2026-04-20", "Hiromu KOBAYASHI/Hayate SUZUKI", "JANG Seongil/KWON Hyuk"),
    ("2026-04-20", "Joe SEYFRIED/Vincent PICARD", "Daniel CRUZ/Sebastian SANCHEZ"),
    ("2026-04-20", "Akash PAL/Payas JAIN", "Simeon MARTIN/Matteo MARTIN"),
    ("2026-04-21", "Lubomir PISTEJ/Jakub ZELINKA", "Yang WANG/Alexander VALUCH"),
    ("2026-04-21", "CHOI Hojun/BACK Donghoon", "Finn LUU/Aditya SAREEN"),
    ("2026-04-21", "Hiromu KOBAYASHI/Hayate SUZUKI", "Radim MORAVEK/Ondrej KVETON"),
    ("2026-04-21", "Joe SEYFRIED/Vincent PICARD", "Akash PAL/Payas JAIN"),
    ("2026-04-21", "Lubomir PISTEJ/Jakub ZELINKA", "CHOI Hojun/BACK Donghoon"),
    ("2026-04-21", "Hiromu KOBAYASHI/Hayate SUZUKI", "Joe SEYFRIED/Vincent PICARD"),
    ("2026-04-22", "Lubomir PISTEJ/Jakub ZELINKA", "Hiromu KOBAYASHI/Hayate SUZUKI"),
]

wd_matches = [
    ("2026-04-20", "Barbora VARADY/Tatiana KUKULKOVA", "Natalia GRIGELOVA/Monika MAROUSKOVA"),
    ("2026-04-20", "Jana VASENDOVA/Klara HRABICOVA", "Nina DAROVCOVA/Sara HABAROVA"),
    ("2026-04-20", "HUANG Yu-Jie/TSAI Yun-En", "Lizaveta TSIMASHKOVA/Ulyana MIASHCHANSKAYA"),
    ("2026-04-20", "LEE Daeun/KIM Seoyun", "Claire PICARD/Ana TOFANT"),
    ("2026-04-20", "LEE Seungmi/CHOI Seoyeon", "Isa COK/Rachel MORET"),
    ("2026-04-20", "KIM Seongjin/CHOI Haeeun", "Nithya MANI/Suhana SAINI"),
    ("2026-04-20", "Ema LABOSOVA/Dominika WILTSCHKOVA", "Nikoleta PUCHOVANOVA/Ema CINCUROVA"),
    ("2026-04-20", "Kaho AKAE/Asuka SASAO", "NatalIA GAJEWSKA/Zuzanna PAWELEC"),
    ("2026-04-21", "Barbora VARADY/Tatiana KUKULKOVA", "Jana VASENDOVA/Klara HRABICOVA"),
    ("2026-04-21", "LEE Daeun/KIM Seoyun", "HUANG Yu-Jie/TSAI Yun-En"),
    ("2026-04-21", "LEE Seungmi/CHOI Seoyeon", "KIM Seongjin/CHOI Haeeun"),
    ("2026-04-21", "Kaho AKAE/Asuka SASAO", "Ema LABOSOVA/Dominika WILTSCHKOVA"),
    ("2026-04-21", "LEE Daeun/KIM Seoyun", "Barbora VARADY/Tatiana KUKULKOVA"),
    ("2026-04-21", "Kaho AKAE/Asuka SASAO", "LEE Seungmi/CHOI Seoyeon"),
    ("2026-04-22", "LEE Daeun/KIM Seoyun", "Kaho AKAE/Asuka SASAO"),
]

xd_matches = [
    ("2026-04-20", "Akash PAL/Sutirtha MUKHERJEE", "Lubomir PISTEJ/Tatiana KUKULKOVA"),
    ("2026-04-20", "Nikon SHUTOV/NatalIA GRIGELOVA", "Damian FLORO/Ema LABOSOVA"),
    ("2026-04-20", "Samuel ARPAS/Barbora VARADY", "Jakub ZELINKA/Nikoleta PUCHOVANOVA"),
    ("2026-04-20", "JANG Seongil/LEE Daeun", "Alexander VALUCH/Monika MAROUSKOVA"),
    ("2026-04-20", "Felipe ARADO/Laura WATANABE", "Jash MODI/Suhana SAINI"),
    ("2026-04-20", "Mykhailo LOVHA/Emma MOLNAROVA", "Iskender KHARKI/Sarvinoz MIRKADIROVA"),
    ("2026-04-20", "BACK Donghoon/KIM Seoyun", "Radim MORAVEK/Jana VASENDOVA"),
    ("2026-04-20", "Payas JAIN/Taneesha KOTECHA", "Peter HRIBAR/Ana TOFANT"),
    ("2026-04-20", "Akash PAL/Sutirtha MUKHERJEE", "Nikon SHUTOV/NatalIA GRIGELOVA"),
    ("2026-04-20", "JANG Seongil/LEE Daeun", "Samuel ARPAS/Barbora VARADY"),
    ("2026-04-20", "Felipe ARADO/Laura WATANABE", "Mykhailo LOVHA/Emma MOLNAROVA"),
    ("2026-04-20", "BACK Donghoon/KIM Seoyun", "Payas JAIN/Taneesha KOTECHA"),
    ("2026-04-21", "Akash PAL/Sutirtha MUKHERJEE", "JANG Seongil/LEE Daeun"),
    ("2026-04-21", "Felipe ARADO/Laura WATANABE", "BACK Donghoon/KIM Seoyun"),
    ("2026-04-21", "Akash PAL/Sutirtha MUKHERJEE", "Felipe ARADO/Laura WATANABE"),
]


def append_to_scorelog(category, matches):
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
            record = {"日期": date, "类型": EVENT_TYPE, "胜者": winner, "负者": loser}
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


if __name__ == "__main__":
    print("WTT Feeder Senec 2026 - Data Import")
    total = 0
    total += append_to_scorelog("ms", ms_matches)
    total += append_to_scorelog("ws", ws_matches)
    total += append_to_scorelog("md", md_matches)
    total += append_to_scorelog("wd", wd_matches)
    total += append_to_scorelog("xd", xd_matches)
    print(f"Total: {total}")
