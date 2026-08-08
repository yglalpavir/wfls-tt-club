#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, os, sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
EVENT_TYPE = "支线赛"
EVENT_YEAR = "2026"

ms_matches = [
    ("2026-05-12", "Maharu YOSHIMURA", "Jan VALENTA"),
    ("2026-05-12", "Nikita ARTEMENKO", "Kenan KAHRAMAN"),
    ("2026-05-12", "Tom SCHWEIGER", "Edward LY"),
    ("2026-05-12", "Matteo MUTTI", "Akash PAL"),
    ("2026-05-12", "Ryoichi YOSHIYAMA", "Darius MOVILEANU"),
    ("2026-05-12", "Alan KURMANGALIYEV", "Gorkem OCAL"),
    ("2026-05-12", "Cedric MEISSNER", "Ibrahim GUNDUZ"),
    ("2026-05-12", "Ankur BHATTACHARJEE", "Amirreza ABBASI"),
    ("2026-05-12", "Kay STUMPER", "Kirill SKACHKOV"),
    ("2026-05-12", "Payas JAIN", "NAM Seongbeen"),
    ("2026-05-12", "Filip ZELJKO", "Dmitrii VINOGRADOV"),
    ("2026-05-12", "WOO Hyeonggyu", "CHO Daeseong"),
    ("2026-05-12", "Andrej GACINA", "Stepan BRHEL"),
    ("2026-05-12", "Evgeny TIKHONOV", "Ivor BAN"),
    ("2026-05-12", "Maksim GREBNEV", "Abdullah YIGENLER"),
    ("2026-05-12", "YIU Kwan To", "Kazuki HAMADA"),
    ("2026-05-13", "Maharu YOSHIMURA", "Nikita ARTEMENKO"),
    ("2026-05-13", "Matteo MUTTI", "Tom SCHWEIGER"),
    ("2026-05-13", "Ryoichi YOSHIYAMA", "Alan KURMANGALIYEV"),
    ("2026-05-13", "Ankur BHATTACHARJEE", "Cedric MEISSNER"),
    ("2026-05-13", "Payas JAIN", "Kay STUMPER"),
    ("2026-05-13", "WOO Hyeonggyu", "Filip ZELJKO"),
    ("2026-05-13", "Andrej GACINA", "Evgeny TIKHONOV"),
    ("2026-05-13", "YIU Kwan To", "Maksim GREBNEV"),
    ("2026-05-13", "Maharu YOSHIMURA", "Matteo MUTTI"),
    ("2026-05-13", "Ankur BHATTACHARJEE", "Ryoichi YOSHIYAMA"),
    ("2026-05-13", "Payas JAIN", "WOO Hyeonggyu"),
    ("2026-05-13", "Andrej GACINA", "YIU Kwan To"),
    ("2026-05-14", "Maharu YOSHIMURA", "Ankur BHATTACHARJEE"),
    ("2026-05-14", "Andrej GACINA", "Payas JAIN"),
    ("2026-05-14", "Maharu YOSHIMURA", "Andrej GACINA"),
]

ws_matches = [
    ("2026-05-12", "Elizabet ABRAAMIAN", "Franziska SCHREINER"),
    ("2026-05-12", "NG Wing Lam", "Valeriia SHCHERBATYKH"),
    ("2026-05-12", "Zauresh AKASHEVA", "Bianca MEI-ROSU"),
    ("2026-05-12", "Xiaoxin YANG", "Swastika GHOSH"),
    ("2026-05-12", "Natalia BAJOR", "Maftuna GULIMOVA"),
    ("2026-05-12", "Ece HARAC", "Arina SLAUTINA"),
    ("2026-05-12", "LEE Seungeun", "Ayhika MUKHERJEE"),
    ("2026-05-12", "PARK Gahyeon", "Kornelija RILISKYTE"),
    ("2026-05-12", "Sachi AOKI", "CHIEN Tung-Chuan"),
    ("2026-05-12", "PENG Yu-Han", "LEE Zion"),
    ("2026-05-12", "Xiaona SHAN", "Sutirtha MUKHERJEE"),
    ("2026-05-12", "Vlada VORONINA", "Mo ZHANG"),
    ("2026-05-12", "Maria PANFILOVA", "Lea RAKOVAC"),
    ("2026-05-12", "Taneesha KOTECHA", "Tania PLAIAN"),
    ("2026-05-12", "Sabina SURJAN", "LEE Hoi Man"),
    ("2026-05-12", "LI Yu-Jhun", "CHENG Hsien-Tzu"),
    ("2026-05-13", "Elizabet ABRAAMIAN", "NG Wing Lam"),
    ("2026-05-13", "Xiaoxin YANG", "Zauresh AKASHEVA"),
    ("2026-05-13", "Natalia BAJOR", "Ece HARAC"),
    ("2026-05-13", "PARK Gahyeon", "LEE Seungeun"),
    ("2026-05-13", "Sachi AOKI", "PENG Yu-Han"),
    ("2026-05-13", "Xiaona SHAN", "Vlada VORONINA"),
    ("2026-05-13", "Taneesha KOTECHA", "Maria PANFILOVA"),
    ("2026-05-13", "LI Yu-Jhun", "Sabina SURJAN"),
    ("2026-05-13", "Xiaoxin YANG", "Elizabet ABRAAMIAN"),
    ("2026-05-13", "PARK Gahyeon", "Natalia BAJOR"),
    ("2026-05-13", "Xiaona SHAN", "Sachi AOKI"),
    ("2026-05-13", "LI Yu-Jhun", "Taneesha KOTECHA"),
    ("2026-05-14", "PARK Gahyeon", "Xiaoxin YANG"),
    ("2026-05-14", "LI Yu-Jhun", "Xiaona SHAN"),
    ("2026-05-14", "LI Yu-Jhun", "PARK Gahyeon"),
]

md_matches = [
    ("2026-05-12", "Stepan BRHEL/Jakub KAUCKY", "Ankur BHATTACHARJEE/Payas JAIN"),
    ("2026-05-12", "WOO Hyeonggyu/CHOI Jiwook", "CHO Daeseong/NAM Seongbeen"),
    ("2026-05-12", "Ryoichi YOSHIYAMA/Kazuki HAMADA", "Sarvarbek GULOMOV/Shahbozbek GULOMIDDINOV"),
    ("2026-05-12", "Evgeny TIKHONOV/Dmitrii VINOGRADOV", "Jan VALENTA/Ondrej KVETON"),
    ("2026-05-12", "Maksim GREBNEV/Nikita ARTEMENKO", "Andrej GACINA/Ivor BAN"),
    ("2026-05-12", "Mudit DANI/Akash PAL", "Zokhid KENJAEV/Shokhrukh ISKANDAROV"),
    ("2026-05-12", "Kenan KAHRAMAN/Gorkem OCAL", "Daniele PINTO/Matteo MUTTI"),
    ("2026-05-12", "Ibrahim GUNDUZ/Abdullah YIGENLER", "Ramon VILA/Rafael CABRERA"),
    ("2026-05-13", "WOO Hyeonggyu/CHOI Jiwook", "Stepan BRHEL/Jakub KAUCKY"),
    ("2026-05-13", "Ryoichi YOSHIYAMA/Kazuki HAMADA", "Evgeny TIKHONOV/Dmitrii VINOGRADOV"),
    ("2026-05-13", "Maksim GREBNEV/Nikita ARTEMENKO", "Mudit DANI/Akash PAL"),
    ("2026-05-13", "Ibrahim GUNDUZ/Abdullah YIGENLER", "Kenan KAHRAMAN/Gorkem OCAL"),
    ("2026-05-13", "Ryoichi YOSHIYAMA/Kazuki HAMADA", "WOO Hyeonggyu/CHOI Jiwook"),
    ("2026-05-13", "Maksim GREBNEV/Nikita ARTEMENKO", "Ibrahim GUNDUZ/Abdullah YIGENLER"),
    ("2026-05-14", "Ryoichi YOSHIYAMA/Kazuki HAMADA", "Maksim GREBNEV/Nikita ARTEMENKO"),
]

wd_matches = [
    ("2026-05-12", "Sachi AOKI/Cocona MURAMATSU", "Esmerlyn CASTRO/Eva BRITO"),
    ("2026-05-12", "NG Wing Lam/LEE Hoi Man", "LEE Zion/KIM Eunseo"),
    ("2026-05-12", "Vlada VORONINA/Valeriia SHCHERBATYKH", "Andrea TEGLAS/Bianca MEI-ROSU"),
    ("2026-05-12", "Franziska SCHREINER/Sophia KLEE", "Zauresh AKASHEVA/Zhanerke KOSHKUMBAYEVA"),
    ("2026-05-12", "Sutirtha MUKHERJEE/Ayhika MUKHERJEE", "Swastika GHOSH/Taneesha KOTECHA"),
    ("2026-05-12", "Natalia BAJOR/Lea RAKOVAC", "Maria YOVKOVA/Kalina HRISTOVA"),
    ("2026-05-12", "Syndrela DAS/Kotona OKADA", "Elizabet ABRAAMIAN/Maria PANFILOVA"),
    ("2026-05-13", "CHIEN Tung-Chuan/LI Yu-Jhun", "Sachi AOKI/Cocona MURAMATSU"),
    ("2026-05-13", "NG Wing Lam/LEE Hoi Man", "Vlada VORONINA/Valeriia SHCHERBATYKH"),
    ("2026-05-13", "Sutirtha MUKHERJEE/Ayhika MUKHERJEE", "Franziska SCHREINER/Sophia KLEE"),
    ("2026-05-13", "Syndrela DAS/Kotona OKADA", "Natalia BAJOR/Lea RAKOVAC"),
    ("2026-05-13", "CHIEN Tung-Chuan/LI Yu-Jhun", "NG Wing Lam/LEE Hoi Man"),
    ("2026-05-13", "Sutirtha MUKHERJEE/Ayhika MUKHERJEE", "Syndrela DAS/Kotona OKADA"),
    ("2026-05-14", "Sutirtha MUKHERJEE/Ayhika MUKHERJEE", "CHIEN Tung-Chuan/LI Yu-Jhun"),
]

xd_matches = [
    ("2026-05-12", "Evgeny TIKHONOV/Maria PANFILOVA", "Payas JAIN/Syndrela DAS"),
    ("2026-05-12", "CHOI Jiwook/KIM Eunseo", "Sarvarbek GULOMOV/Maftuna GULIMOVA"),
    ("2026-05-12", "Anastasios RINIOTIS/Elisavet TERPOU", "Ankur BHATTACHARJEE/Swastika GHOSH"),
    ("2026-05-12", "Alan KURMANGALIYEV/Zauresh AKASHEVA", "Edward LY/Mo ZHANG"),
    ("2026-05-12", "Tom SCHWEIGER/Franziska SCHREINER", "Cedric MEISSNER/LEE Hoi Man"),
    ("2026-05-12", "Nikita ARTEMENKO/Valeriia SHCHERBATYKH", "Abdullah YIGENLER/Ece HARAC"),
    ("2026-05-12", "Maksim GREBNEV/Vlada VORONINA", "Ramon VILA/Eva BRITO"),
    ("2026-05-12", "YIU Kwan To/NG Wing Lam", "Dmitrii VINOGRADOV/Arina SLAUTINA"),
    ("2026-05-13", "CHOI Jiwook/KIM Eunseo", "Evgeny TIKHONOV/Maria PANFILOVA"),
    ("2026-05-13", "Alan KURMANGALIYEV/Zauresh AKASHEVA", "Anastasios RINIOTIS/Elisavet TERPOU"),
    ("2026-05-13", "Nikita ARTEMENKO/Valeriia SHCHERBATYKH", "Tom SCHWEIGER/Franziska SCHREINER"),
    ("2026-05-13", "YIU Kwan To/NG Wing Lam", "Maksim GREBNEV/Vlada VORONINA"),
    ("2026-05-13", "CHOI Jiwook/KIM Eunseo", "Alan KURMANGALIYEV/Zauresh AKASHEVA"),
    ("2026-05-13", "YIU Kwan To/NG Wing Lam", "Nikita ARTEMENKO/Valeriia SHCHERBATYKH"),
    ("2026-05-14", "YIU Kwan To/NG Wing Lam", "CHOI Jiwook/KIM Eunseo"),
]


def append_to_scorelog(category, matches):
    if category == "ws":
        filename = f"score-log-{EVENT_YEAR}-ws.json"
    else:
        filename = f"score-log-{EVENT_YEAR}-wtt.json"
    filepath = os.path.join(WTT_DIR, category, filename)
    with open(filepath, "r", encoding="utf-8-sig") as f:
        existing = json.load(f)
    existing_keys = set((r["日期"], r["类型"], r["胜者"], r["负者"]) for r in existing)
    new_records = []
    for date, winner, loser in matches:
        key = (date, EVENT_TYPE, winner, loser)
        if key not in existing_keys:
            new_records.append({"日期": date, "类型": EVENT_TYPE, "胜者": winner, "负者": loser})
            existing_keys.add(key)
    all_records = existing + new_records
    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        if category == "xd":
            f.write("[\n")
            for i, rec in enumerate(all_records):
                line = json.dumps(rec, ensure_ascii=False)
                if i < len(all_records) - 1:
                    line += ","
                f.write(line + "\n")
            f.write("]")
        else:
            json.dump(all_records, f, ensure_ascii=False, indent=2)
            f.write("\n")
    print(f"  {category.upper()}: {len(new_records)} new (total: {len(all_records)})")
    return len(new_records)


if __name__ == "__main__":
    print("WTT Feeder Istanbul 2026")
    total = 0
    for cat, data in [("ms", ms_matches), ("ws", ws_matches), ("md", md_matches), ("wd", wd_matches), ("xd", xd_matches)]:
        total += append_to_scorelog(cat, data)
    print(f"Total: {total}")
