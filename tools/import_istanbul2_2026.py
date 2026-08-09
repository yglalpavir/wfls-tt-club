#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, os, sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
EVENT_TYPE = "支线赛"
EVENT_YEAR = "2026"

ms_matches = [
    ("2026-07-03", "Ryoichi YOSHIYAMA", "Connor GREEN"),
    ("2026-07-03", "Rafael DE LAS HERAS", "Andrea PUPPO"),
    ("2026-07-03", "Kazuki YOSHIYAMA", "Diego LILLO"),
    ("2026-07-03", "Kay STUMPER", "Payas JAIN"),
    ("2026-07-03", "Harmeet DESAI", "Lev VOLIN"),
    ("2026-07-03", "Nikita ARTEMENKO", "Ali ALKHADRAWI"),
    ("2026-07-03", "Cedric MEISSNER", "Denis IVONIN"),
    ("2026-07-03", "Rogelio CASTRO", "Maksim GREBNEV"),
    ("2026-07-03", "HUNG Jing-Kai", "Vincent PICARD"),
    ("2026-07-03", "Evgeny TIKHONOV", "Andrei ISTRATE"),
    ("2026-07-03", "Remi BETELU", "LIN Yen-Chun"),
    ("2026-07-03", "Ankur BHATTACHARJEE", "Mudit DANI"),
    ("2026-07-03", "Ivor BAN", "Daniel BERZOSA"),
    ("2026-07-03", "Joao MONTEIRO", "Khalid ALSHAREIF"),
    ("2026-07-03", "Abdullah YIGENLER", "Zhiar MOHAMMED"),
    ("2026-07-03", "Jules ROLLAND", "Filip ZELJKO"),
    ("2026-07-04", "Ryoichi YOSHIYAMA", "Rafael DE LAS HERAS"),
    ("2026-07-04", "Kazuki YOSHIYAMA", "Kay STUMPER"),
    ("2026-07-04", "Nikita ARTEMENKO", "Harmeet DESAI"),
    ("2026-07-04", "Cedric MEISSNER", "Rogelio CASTRO"),
    ("2026-07-04", "HUNG Jing-Kai", "Evgeny TIKHONOV"),
    ("2026-07-04", "Ankur BHATTACHARJEE", "Remi BETELU"),
    ("2026-07-04", "Joao MONTEIRO", "Ivor BAN"),
    ("2026-07-04", "Jules ROLLAND", "Abdullah YIGENLER"),
    ("2026-07-04", "Ryoichi YOSHIYAMA", "Kazuki YOSHIYAMA"),
    ("2026-07-04", "Nikita ARTEMENKO", "Cedric MEISSNER"),
    ("2026-07-04", "HUNG Jing-Kai", "Ankur BHATTACHARJEE"),
    ("2026-07-04", "Jules ROLLAND", "Joao MONTEIRO"),
    ("2026-07-05", "Nikita ARTEMENKO", "Ryoichi YOSHIYAMA"),
    ("2026-07-05", "Jules ROLLAND", "HUNG Jing-Kai"),
    ("2026-07-05", "Nikita ARTEMENKO", "Jules ROLLAND"),
]

ws_matches = [
    ("2026-07-03", "Jieni SHAO", "Ozge YILMAZ"),
    ("2026-07-03", "Vlada VORONINA", "Anais SALPIN"),
    ("2026-07-03", "Adina DIACONU", "MOON Chowon"),
    ("2026-07-03", "LEE Seungeun", "Hana ARAPOVIC"),
    ("2026-07-03", "Sachi AOKI", "Taneesha KOTECHA"),
    ("2026-07-03", "Debora VIVARELLI", "Suhana SAINI"),
    ("2026-07-03", "TSAI Yun-En", "Agathe AVEZOU"),
    ("2026-07-03", "Nithya MANI", "Shuohan MEN"),
    ("2026-07-03", "Franziska SCHREINER", "Sibel ALTINKAYA"),
    ("2026-07-03", "Sayali WANI", "Kotona OKADA"),
    ("2026-07-03", "Maria PANFILOVA", "Alaa YEHIA"),
    ("2026-07-03", "Veronika MATIUNINA", "Elise PUJOL"),
    ("2026-07-03", "Swastika GHOSH", "Pauline CHASSELIN"),
    ("2026-07-03", "Arina SLAUTINA", "Ana TOFANT"),
    ("2026-07-03", "Valeriia SHCHERBATYKH", "Kornelija RILISKYTE"),
    ("2026-07-03", "Ece HARAC", "HUANG Yu-Jie"),
    ("2026-07-04", "Jieni SHAO", "Vlada VORONINA"),
    ("2026-07-04", "LEE Seungeun", "Adina DIACONU"),
    ("2026-07-04", "Sachi AOKI", "Debora VIVARELLI"),
    ("2026-07-04", "TSAI Yun-En", "Nithya MANI"),
    ("2026-07-04", "Sayali WANI", "Franziska SCHREINER"),
    ("2026-07-04", "Maria PANFILOVA", "Veronika MATIUNINA"),
    ("2026-07-04", "Arina SLAUTINA", "Swastika GHOSH"),
    ("2026-07-04", "Ece HARAC", "Valeriia SHCHERBATYKH"),
    ("2026-07-04", "LEE Seungeun", "Jieni SHAO"),
    ("2026-07-04", "Sachi AOKI", "TSAI Yun-En"),
    ("2026-07-04", "Sayali WANI", "Maria PANFILOVA"),
    ("2026-07-04", "Arina SLAUTINA", "Ece HARAC"),
    ("2026-07-05", "LEE Seungeun", "Sachi AOKI"),
    ("2026-07-05", "Arina SLAUTINA", "Sayali WANI"),
    ("2026-07-05", "LEE Seungeun", "Arina SLAUTINA"),
]

md_matches = [
    ("2026-07-03", "Ankur BHATTACHARJEE/Payas JAIN", "Omar TAHER/Zhiar MOHAMMED"),
    ("2026-07-03", "Mael VAN DESSEL/Tom SCHOLTES", "Shahbozbek GULOMIDDINOV/Ruzimukhammad RAKHMONOV"),
    ("2026-07-03", "Jules ROLLAND/VINCENT PICARD", "Ali ALKHADRAWI/Abdulaziz BU SHULAYBI"),
    ("2026-07-03", "Ryoichi YOSHIYAMA/Kazuki YOSHIYAMA", "Gene WANTZ/Loris STEPHANY"),
    ("2026-07-03", "Connor GREEN/Rogelio CASTRO", "Zaid ABO YAMAN/Zeyad ALDMAISY"),
    ("2026-07-03", "Lev KATSMAN/Maksim GREBNEV", "SaadEddine HABACH/Mohamed HABACH"),
    ("2026-07-03", "Evgeny TIKHONOV/Dmitrii VINOGRADOV", "Denis IVONIN/Lev VOLIN"),
    ("2026-07-03", "Mudit DANI/Harmeet DESAI", "Salem ALSUWAILEM/Turki ALMUTAIRI"),
    ("2026-07-04", "Ankur BHATTACHARJEE/Payas JAIN", "Mael VAN DESSEL/Tom SCHOLTES"),
    ("2026-07-04", "Ryoichi YOSHIYAMA/Kazuki YOSHIYAMA", "Jules ROLLAND/VINCENT PICARD"),
    ("2026-07-04", "Lev KATSMAN/Maksim GREBNEV", "Connor GREEN/Rogelio CASTRO"),
    ("2026-07-04", "Evgeny TIKHONOV/Dmitrii VINOGRADOV", "Mudit DANI/Harmeet DESAI"),
    ("2026-07-04", "Ryoichi YOSHIYAMA/Kazuki YOSHIYAMA", "Ankur BHATTACHARJEE/Payas JAIN"),
    ("2026-07-04", "Evgeny TIKHONOV/Dmitrii VINOGRADOV", "Lev KATSMAN/Maksim GREBNEV"),
    ("2026-07-05", "Evgeny TIKHONOV/Dmitrii VINOGRADOV", "Ryoichi YOSHIYAMA/Kazuki YOSHIYAMA"),
]

wd_matches = [
    ("2026-07-03", "Shuohan MEN/Ana TOFANT", "Valeriia SHCHERBATYKH/Ekaterina ZIRONOVA"),
    ("2026-07-03", "Pauline CHASSELIN/Anais SALPIN", "Mariam EL HABECH/Yasmina EL HABECH"),
    ("2026-07-03", "TSAI Yun-En/HUANG Yu-Jie", "Clea DE STOPPELEIRE/Elise PUJOL"),
    ("2026-07-04", "Shuohan MEN/Ana TOFANT", "Vlada VORONINA/Maria PANFILOVA"),
    ("2026-07-04", "Pauline CHASSELIN/Anais SALPIN", "Sibel ALTINKAYA/Ece HARAC"),
    ("2026-07-04", "TSAI Yun-En/HUANG Yu-Jie", "Mariam EL HABECH/Yasmina EL HABECH"),
    ("2026-07-04", "Swastika GHOSH/Taneesha KOTECHA", "Clea DE STOPPELEIRE/Elise PUJOL"),
    ("2026-07-04", "Shuohan MEN/Ana TOFANT", "PaulINE CHASSELIN/Anais SALPIN"),
    ("2026-07-04", "Swastika GHOSH/Taneesha KOTECHA", "TSAI Yun-En/HUANG Yu-Jie"),
    ("2026-07-05", "Swastika GHOSH/Taneesha KOTECHA", "Shuohan MEN/Ana TOFANT"),
]

xd_matches = [
    ("2026-07-03", "Ivor BAN/Hana ARAPOVIC", "Rogelio CASTRO/Franziska SCHREINER"),
    ("2026-07-03", "Dmitrii VINOGRADOV/Arina SLAUTINA", "Payas JAIN/Nithya MANI"),
    ("2026-07-03", "Ankur BHATTACHARJEE/Swastika GHOSH", "SaadEddine HABACH/Mariam EL HABECH"),
    ("2026-07-03", "Daito ONO/Kotona OKADA", "Tugay YILMAZ/Ozge YILMAZ"),
    ("2026-07-03", "Evgeny TIKHONOV/Maria PANFILOVA", "Nikita ARTEMENKO/Valeriia SHCHERBATYKH"),
    ("2026-07-03", "Andrei ISTRATE/Adina DIACONU", "Abdullah YIGENLER/Ece HARAC"),
    ("2026-07-03", "Nazar TRETIAK/Veronika MATIUNINA", "Mudit DANI/Taneesha KOTECHA"),
    ("2026-07-03", "Maksim GREBNEV/Vlada VORONINA", "Harmeet DESAI/Sibel ALTINKAYA"),
    ("2026-07-04", "Dmitrii VINOGRADOV/Arina SLAUTINA", "Ivor BAN/Hana ARAPOVIC"),
    ("2026-07-04", "Ankur BHATTACHARJEE/Swastika GHOSH", "Daito ONO/Kotona OKADA"),
    ("2026-07-04", "Evgeny TIKHONOV/Maria PANFILOVA", "Andrei ISTRATE/Adina DIACONU"),
    ("2026-07-04", "Nazar TRETIAK/Veronika MATIUNINA", "Maksim GREBNEV/Vlada VORONINA"),
    ("2026-07-04", "Ankur BHATTACHARJEE/Swastika GHOSH", "Dmitrii VINOGRADOV/Arina SLAUTINA"),
    ("2026-07-04", "Evgeny TIKHONOV/Maria PANFILOVA", "Nazar TRETIAK/Veronika MATIUNINA"),
    ("2026-07-05", "Evgeny TIKHONOV/Maria PANFILOVA", "Ankur BHATTACHARJEE/Swastika GHOSH"),
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
    print("WTT Feeder Istanbul II 2026")
    total = 0
    for cat, data in [("ms", ms_matches), ("ws", ws_matches), ("md", md_matches), ("wd", wd_matches), ("xd", xd_matches)]:
        total += append_to_scorelog(cat, data)
    print(f"Total: {total}")
