#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, os, sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
EVENT_TYPE = "支线赛"
EVENT_YEAR = "2026"

ms_matches = [
    ("2026-05-17", "Joao GERALDO", "Kay STUMPER"),
    ("2026-05-17", "Gustavo GOMEZ", "Darius MOVILEANU"),
    ("2026-05-17", "Edward LY", "Denis DORCESCU"),
    ("2026-05-17", "Marcos FREITAS", "Filip ZELJKO"),
    ("2026-05-17", "Ovidiu IONESCU", "Ricardo WALTHER"),
    ("2026-05-17", "Rogelio CASTRO", "Miguel PANTOJA"),
    ("2026-05-17", "Leonardo IIZUKA", "Eusebio VOS"),
    ("2026-05-17", "Wim VERDONSCHOT", "Alexis KOURAICHI"),
    ("2026-05-17", "Vincent PICARD", "CHANG Yu-An"),
    ("2026-05-17", "HUNG Jing-Kai", "LIN Yen-Chun"),
    ("2026-05-17", "Yuto KIZUKURI", "Guilherme TEODORO"),
    ("2026-05-17", "Andre BERTELSMEIER", "Rafael DE LAS HERAS"),
    ("2026-05-17", "Mattias KARLSSON", "Maxime ANTOINE MICHARD"),
    ("2026-05-17", "Tiago APOLONIA", "HSU Hsien-Chia"),
    ("2026-05-17", "Samuel WALKER", "Clement LAINE"),
    ("2026-05-17", "Ryoichi YOSHIYAMA", "Hugo DESCHAMPS"),
    ("2026-05-18", "Joao GERALDO", "Gustavo GOMEZ"),
    ("2026-05-18", "Marcos FREITAS", "Edward LY"),
    ("2026-05-18", "Rogelio CASTRO", "Ovidiu IONESCU"),
    ("2026-05-18", "Wim VERDONSCHOT", "Leonardo IIZUKA"),
    ("2026-05-18", "HUNG Jing-Kai", "Vincent PICARD"),
    ("2026-05-18", "Yuto KIZUKURI", "Andre BERTELSMEIER"),
    ("2026-05-18", "Tiago APOLONIA", "Mattias KARLSSON"),
    ("2026-05-18", "Samuel WALKER", "Ryoichi YOSHIYAMA"),
    ("2026-05-18", "Joao GERALDO", "Marcos FREITAS"),
    ("2026-05-18", "Wim VERDONSCHOT", "Rogelio CASTRO"),
    ("2026-05-18", "Yuto KIZUKURI", "HUNG Jing-Kai"),
    ("2026-05-18", "Tiago APOLONIA", "Samuel WALKER"),
    ("2026-05-19", "Joao GERALDO", "Wim VERDONSCHOT"),
    ("2026-05-19", "Yuto KIZUKURI", "Tiago APOLONIA"),
    ("2026-05-19", "Yuto KIZUKURI", "Joao GERALDO"),
]

ws_matches = [
    ("2026-05-17", "Kaho AKAE", "Katarzyna WEGRZYN"),
    ("2026-05-17", "Cocona MURAMATSU", "Nomin BAASAN"),
    ("2026-05-17", "Veronika MATIUNINA", "Filippa BERGAND"),
    ("2026-05-17", "CHIEN Tung-Chuan", "Giulia TAKAHASHI"),
    ("2026-05-17", "Mo ZHANG", "Julia LEAL"),
    ("2026-05-17", "Hanka KODET", "Rachel MORET"),
    ("2026-05-17", "Asuka SASAO", "Alexia NODIN"),
    ("2026-05-17", "PENG Yu-Han", "CHENG Hsien-Tzu"),
    ("2026-05-17", "Giorgia PICCOLIN", "Taneesha KOTECHA"),
    ("2026-05-17", "Tin-Tin HO", "Clemence CHEVALLIER"),
    ("2026-05-17", "Sachi AOKI", "Nathaly PAREDES"),
    ("2026-05-17", "LI Yu-Jhun", "Lucia CORDERO"),
    ("2026-05-17", "Jieni SHAO", "Elvira RAD"),
    ("2026-05-17", "Anastasiya DYMYTRENKO", "Claire PICARD"),
    ("2026-05-17", "CHEN Min-Hsin", "Audrey ZARIF"),
    ("2026-05-17", "Natalia BAJOR", "Nina GUO ZHENG"),
    ("2026-05-17", "Cocona MURAMATSU", "Kaho AKAE"),
    ("2026-05-17", "CHIEN Tung-Chuan", "Veronika MATIUNINA"),
    ("2026-05-17", "Mo ZHANG", "Hanka KODET"),
    ("2026-05-17", "Asuka SASAO", "PENG Yu-Han"),
    ("2026-05-17", "Tin-Tin HO", "Giorgia PICCOLIN"),
    ("2026-05-17", "LI Yu-Jhun", "Sachi AOKI"),
    ("2026-05-17", "Jieni SHAO", "Anastasiya DYMYTRENKO"),
    ("2026-05-17", "Natalia BAJOR", "CHEN Min-Hsin"),
    ("2026-05-17", "Cocona MURAMATSU", "CHIEN Tung-Chuan"),
    ("2026-05-17", "Mo ZHANG", "Asuka SASAO"),
    ("2026-05-17", "Tin-Tin HO", "LI Yu-Jhun"),
    ("2026-05-17", "Jieni SHAO", "Natalia BAJOR"),
    ("2026-05-17", "Asuka SASAO", "Cocona MURAMATSU"),
    ("2026-05-17", "LI Yu-Jhun", "Tin-Tin HO"),
    ("2026-05-17", "Natalia BAJOR", "Jieni SHAO"),
    ("2026-05-17", "Asuka SASAO", "LI Yu-Jhun"),
    ("2026-05-17", "Natalia BAJOR", "Asuka SASAO"),
]

md_matches = [
    ("2026-05-17", "Hugo DESCHAMPS/Alexis KOURAICHI", "Guilherme TEODORO/Leonardo IIZUKA"),
    ("2026-05-17", "Ramon VILA/Rafael CABRERA", "Clement LAINE/Tiago ABIODUN"),
    ("2026-05-17", "Nathan LAM/Denis DORCESCU", "HUNG Jing-Kai/LIN Yen-Chun"),
    ("2026-05-17", "Anton LIMONOV/Nazar TRETIAK", "Dinis YE/Carlos GONCALVES"),
    ("2026-05-17", "Albert VILARDELL/Ladimir MAYOROV", "Mael VAN DESSEL/Martin FROSETH"),
    ("2026-05-17", "Wim VERDONSCHOT/Andre BERTELSMEIER", "Romain BRARD/Maxime ANTOINE MICHARD"),
    ("2026-05-17", "Gene WANTZ/Tom SCHOLTES", "Yoan REBETEZ/Chaitanya VEPA"),
    ("2026-05-17", "Tiago APOLONIA/Marcos FREITAS", "Oishik GHOSH/Bodhisatwa CHAUDHURY"),
    ("2026-05-18", "Hugo DESCHAMPS/Alexis KOURAICHI", "Ramon VILA/Rafael CABRERA"),
    ("2026-05-18", "Anton LIMONOV/Nazar TRETIAK", "Nathan LAM/Denis DORCESCU"),
    ("2026-05-18", "Albert VILARDELL/Ladimir MAYOROV", "Wim VERDONSCHOT/Andre BERTELSMEIER"),
    ("2026-05-18", "Tiago APOLONIA/Marcos FREITAS", "Gene WANTZ/Tom SCHOLTES"),
    ("2026-05-18", "Hugo DESCHAMPS/Alexis KOURAICHI", "Anton LIMONOV/Nazar TRETIAK"),
    ("2026-05-18", "Tiago APOLONIA/Marcos FREITAS", "Albert VILARDELL/Ladimir MAYOROV"),
    ("2026-05-19", "Tiago APOLONIA/Marcos FREITAS", "Hugo DESCHAMPS/Alexis KOURAICHI"),
]

wd_matches = [
    ("2026-05-17", "CHIEN Tung-Chuan/LI Yu-Jhun", "Cocona MURAMATSU/Sachi AOKI"),
    ("2026-05-17", "Lucia CORDERO/Nathaly PAREDES", "Jeanne ROBBES/Clemence CHEVALLIER"),
    ("2026-05-17", "Victoria STRASSBURGER/Valentina RIOS", "Eva BRITO/Esmerlyn CASTRO"),
    ("2026-05-17", "Rachel MORET/Tin-Tin HO", "Beatriz PINTO/Mariana SANTA"),
    ("2026-05-17", "Elvira RAD/Eugenia SASTRE", "Matilde PINTO/Ines MATOS"),
    ("2026-05-17", "PENG Yu-Han/CHENG Hsien-Tzu", "Natalia BAJOR/Katarzyna WEGRZYN"),
    ("2026-05-17", "Veronika MATIUNINA/Anastasiya DYMYTRENKO", "Alexia NODIN/Elinor DAVIDOV"),
    ("2026-05-17", "Asuka SASAO/Kaho AKAE", "Jieni SHAO/Julia LEAL"),
    ("2026-05-18", "CHIEN Tung-Chuan/LI Yu-Jhun", "Lucia CORDERO/Nathaly PAREDES"),
    ("2026-05-18", "Rachel MORET/Tin-Tin HO", "Victoria STRASSBURGER/Valentina RIOS"),
    ("2026-05-18", "Elvira RAD/Eugenia SASTRE", "PENG Yu-Han/CHENG Hsien-Tzu"),
    ("2026-05-18", "Asuka SASAO/Kaho AKAE", "Veronika MATIUNINA/Anastasiya DYMYTRENKO"),
    ("2026-05-18", "CHIEN Tung-Chuan/LI Yu-Jhun", "Rachel MORET/Tin-Tin HO"),
    ("2026-05-18", "Asuka SASAO/Kaho AKAE", "Elvira RAD/Eugenia SASTRE"),
    ("2026-05-19", "Asuka SASAO/Kaho AKAE", "CHIEN Tung-Chuan/LI Yu-Jhun"),
]

xd_matches = [
    ("2026-05-17", "Guilherme TEODORO/Giulia TAKAHASHI", "Ramon VILA/Eva BRITO"),
    ("2026-05-17", "Vincent PICARD/Claire PICARD", "Clement LAINE/Matilde PINTO"),
    ("2026-05-17", "Mattias KARLSSON/Natalia BAJOR", "Martin FROSETH/Alexia NODIN"),
    ("2026-05-17", "Joao GERALDO/Mariana SANTA", "Mael VAN DESSEL/Rachel MORET"),
    ("2026-05-17", "HSU Hsien-Chia/CHEN Min-Hsin", "Tiago ABIODUN/Julia LEAL"),
    ("2026-05-17", "Alexis KOURAICHI/Audrey ZARIF", "Edward LY/Mo ZHANG"),
    ("2026-05-17", "Samuel WALKER/Tin-Tin HO", "Andrii GREBENIUK/Anastasiya DYMYTRENKO"),
    ("2026-05-17", "Nazar TRETIAK/Veronika MATIUNINA", "Gustavo GOMEZ/Valentina RIOS"),
    ("2026-05-17", "Guilherme TEODORO/Giulia TAKAHASHI", "Vincent PICARD/Claire PICARD"),
    ("2026-05-17", "Mattias KARLSSON/Natalia BAJOR", "Joao GERALDO/Mariana SANTA"),
    ("2026-05-17", "HSU Hsien-Chia/CHEN Min-Hsin", "Alexis KOURAICHI/Audrey ZARIF"),
    ("2026-05-17", "Samuel WALKER/Tin-Tin HO", "Nazar TRETIAK/Veronika MATIUNINA"),
    ("2026-05-17", "Guilherme TEODORO/Giulia TAKAHASHI", "Mattias KARLSSON/Natalia BAJOR"),
    ("2026-05-17", "HSU Hsien-Chia/CHEN Min-Hsin", "Samuel WALKER/Tin-Tin HO"),
    ("2026-05-17", "HSU Hsien-Chia/CHEN Min-Hsin", "Guilherme TEODORO/Giulia TAKAHASHI"),
]


def normalize_name(name):
    """统一姓名内的混合大小写异常（如 NatalIA -> Natalia、PaulINE -> Pauline），
    防止同一球员因录入笔误被拆成多个档案。
    处理单位：按空格分词、连字符再分段；全大写姓氏（BAJOR）、正常首字母大写词
    （Natalia / Tung-Chuan / Tin-Tin / DE NUTTE 的 DE）原样通过。
    注意：不调整姓氏与名字的先后顺序；整词全大写的名字（如 CLEMENT LAINE）无法自动识别，需人工核对。"""
    def fix_part(p):
        if len(p) < 2 or p.isupper() or p.islower():
            return p
        if p[0].isupper() and p[1:].islower():
            return p
        fixed = p[0].upper() + p[1:].lower()
        print(f"  [normalize] {p} -> {fixed}")
        return fixed

    def fix_word(w):
        return "-".join(fix_part(part) for part in w.split("-"))

    return "/".join(" ".join(fix_word(w) for w in team.split())
                    for team in name.split("/"))


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
        winner = normalize_name(winner)
        loser = normalize_name(loser)
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
    print("WTT Feeder Lagos 2026")
    total = 0
    for cat, data in [("ms", ms_matches), ("ws", ws_matches), ("md", md_matches), ("wd", wd_matches), ("xd", xd_matches)]:
        total += append_to_scorelog(cat, data)
    print(f"Total: {total}")
