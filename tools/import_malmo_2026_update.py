#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Grand Smash Malmo 2026 - 数据修正与补充脚本
1) corrections: 修正主赛 R64/R32 已导入记录的日期（真实日期 08-10~08-12），并补充完整姓名
2) additions:   追加此前未录入的新比赛（新的 R64 单打 + MD/WD/XD R16 等）
重复的比赛不会重复添加。
"""

import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WTT_DIR = os.path.join(ROOT_DIR, "wtt_data")

EVENT_TYPE = "大满贯"
EVENT_YEAR = "2026"
OLD_DATE = "2026-08-11"

# ============================================================
# corrections: (旧胜者, 旧负者, 新胜者, 新负者, 真实日期)
# ============================================================
corrections = {
    "ms": [
        ("Dimitrij OVTCHAROV", "Truls MOREGARD", "Dimitrij OVTCHAROV", "Truls MOREGARD", "2026-08-11"),
        ("Cedric NUYTINCK", "Nicholas LUM", "Cedric NUYTINCK", "Nicholas LUM", "2026-08-10"),
        ("Darko JORGIC", "Deni KOZUL", "Darko JORGIC", "Deni KOZUL", "2026-08-11"),
        ("Csaba ANDRAS", "Dang QIU", "Csaba ANDRAS", "Dang QIU", "2026-08-11"),
        ("Omar ASSAR", "CHEN Junsong", "Omar ASSAR", "CHEN Junsong", "2026-08-10"),
        ("Jonathan GROTH", "Mattias KARLSSON", "Jonathan GROTH", "Mattias KARLSSON", "2026-08-10"),
        ("LIN Yun-Ju", "Lubomir JANCARIK", "LIN Yun-Ju", "Lubomir JANCARIK", "2026-08-11"),
        ("PARK Ganghyeon", "Flavien COTON", "PARK Ganghyeon", "Flavien COTON", "2026-08-10"),
        ("Joao GERALDO", "Finn LUU", "Joao GERALDO", "Finn LUU", "2026-08-11"),
        ("Thibault PORET", "Patrick FRANZISKA", "Thibault PORET", "Patrick FRANZISKA", "2026-08-11"),
        ("Anders LIND", "Maciej KUBIK", "Anders LIND", "Maciej KUBIK", "2026-08-11"),
        ("KUO Guan-Hong", "Benedikt DUDA", "KUO Guan-Hong", "Benedikt DUDA", "2026-08-11"),
        ("Maharu YOSHIMURA", "Kirill GERASSIMENKO", "Maharu YOSHIMURA", "Kirill GERASSIMENKO", "2026-08-10"),
        ("Hugo CALDERANO", "William BERGENBLOCK", "Hugo CALDERANO", "William BERGENBLOCK", "2026-08-11"),
        ("LIN Shidong", "CHEN Yuanyu", "LIN Shidong", "CHEN Yuanyu", "2026-08-10"),
        ("XIANG Peng", "LIM Jonghoon", "XIANG Peng", "LIM Jonghoon", "2026-08-11"),
        ("Shunsuke TOGAMI", "WONG Chun Ting", "Shunsuke TOGAMI", "WONG Chun Ting", "2026-08-10"),
        ("Yukiya UDA", "Simon GAUZY", "Yukiya UDA", "Simon GAUZY", "2026-08-10"),
        ("JANG Woojin", "Adrien RASSENFOSSE", "JANG Woojin", "Adrien RASSENFOSSE", "2026-08-11"),
        ("Tomislav PUCAR", "Alvaro ROBLES", "Tomislav PUCAR", "Alvaro ROBLES", "2026-08-10"),
        ("Elias RANEFUR", "Iulian CHIRITA", "Elias RANEFUR", "Iulian CHIRITA", "2026-08-10"),
        ("WEN Ruibo", "Lilian BARDET", "WEN Ruibo", "Lilian BARDET", "2026-08-10"),
        ("Anton KALLBERG", "Vladimir SIDORENKO", "Anton KALLBERG", "Vladimir SIDORENKO", "2026-08-11"),
        ("ZHOU Qihao", "AN Jaehyun", "ZHOU Qihao", "AN Jaehyun", "2026-08-10"),
        ("FENG Yi-Hsin", "Manush SHAH", "FENG Yi-Hsin", "Manush SHAH", "2026-08-11"),
    ],
    "ws": [
        ("WANG Manyu", "Dina MESHREF", "WANG Manyu", "Dina MESHREF", "2026-08-11"),
        ("CHIEN Tung-Chuan", "Fu YU", "CHIEN Tung-Chuan", "Fu YU", "2026-08-10"),
        ("LI Yu-Jhun", "YOO Yerin", "LI Yu-Jhun", "YOO Yerin", "2026-08-10"),
        ("QIN Yuxuan", "Mima ITO", "QIN Yuxuan", "Mima ITO", "2026-08-10"),
        ("Honoka HASHIMOTO", "YEH Yi-Tian", "Honoka HASHIMOTO", "YEH Yi-Tian", "2026-08-10"),
        ("PENG Yu-Han", "Prithika PAVADE", "PENG Yu-Han", "Prithika PAVADE", "2026-08-11"),
        ("Sabine WINTER", "Bruna TAKAHASHI", "Sabine WINTER", "Bruna TAKAHASHI", "2026-08-10"),
        ("Sofia POLCANOVA", "LEE Eunhye", "Sofia POLCANOVA", "LEE Eunhye", "2026-08-11"),
        ("Nina MITTELHAM", "Bernadette SZOCS", "Nina MITTELHAM", "Bernadette SZOCS", "2026-08-11"),
        ("SHIN Yubin", "Nomin BAASAN", "SHIN Yubin", "Nomin BAASAN", "2026-08-11"),
        ("Giorgia PICCOLIN", "Charlotte LUTZ", "Giorgia PICCOLIN", "Charlotte LUTZ", "2026-08-10"),
        ("SU Tsz Tung", "Maria XIAO", "SU Tsz Tung", "Maria XIAO", "2026-08-11"),
        ("Hina HAYATA", "Jia Nan YUAN", "Hina HAYATA", "Jia Nan YUAN", "2026-08-11"),
        ("Diya CHITALE", "Sreeja AKULA", "Diya CHITALE", "Sreeja AKULA", "2026-08-11"),
        ("Satsuki ODO", "Filippa BERGAND", "Satsuki ODO", "Filippa BERGAND", "2026-08-11"),
        ("SHI Xunyao", "Mo ZHANG", "SHI Xunyao", "Mo ZHANG", "2026-08-10"),
        ("CHENG I-Ching", "Yangzi LIU", "CHENG I-Ching", "Yangzi LIU", "2026-08-11"),
        ("Miyuu KIHARA", "DOO Hoi Kem", "Miyuu KIHARA", "DOO Hoi Kem", "2026-08-10"),
        ("Elizabeta SAMARA", "Andreea DRAGOMAN", "Elizabeta SAMARA", "Andreea DRAGOMAN", "2026-08-10"),
        ("Christina KALLBERG", "Margaryta PESOTSKA", "Christina KALLBERG", "Margaryta PESOTSKA", "2026-08-11"),
        ("CHEN Yi", "Minhyung JEE", "CHEN Yi", "Minhyung JEE", "2026-08-10"),
        ("Ying HAN", "Natalia BAJOR", "Ying HAN", "Natalia BAJOR", "2026-08-10"),
        ("ZENG Jian", "Xiaoxin YANG", "ZENG Jian", "Xiaoxin YANG", "2026-08-11"),
        ("KIM Nayeong", "Amy WANG", "KIM Nayeong", "Amy WANG", "2026-08-10"),
    ],
    "md": [
        ("Kristian KARLSSON/Anton KALLBERG", "Darko JORGIC/Deni KOZUL", "Kristian KARLSSON/Anton KALLBERG", "Darko JORGIC/Deni KOZUL", "2026-08-11"),
        ("Daniel BERZOSA/Juan PEREZ", "RANEFUR/KARLSSON", "Daniel BERZOSA/Juan PEREZ", "Elias RANEFUR/Mattias KARLSSON", "2026-08-11"),
        ("NARESH/NARESH", "Noa DAHLSTROM/Bosman BOTHA", "Sid NARESH/Nandan NARESH", "Noa DAHLSTROM/Bosman BOTHA", "2026-08-10"),
        ("Maciej KUBIK/Milosz REDZIMSKI", "Jakub ZELINKA/Lubomir PISTEJ", "Maciej KUBIK/Milosz REDZIMSKI", "Jakub ZELINKA/Lubomir PISTEJ", "2026-08-10"),
        ("Youssef ABDELAZIZ/Mohamed ELBEIALI", "Andrej GACINA/Ivor BAN", "Youssef ABDELAZIZ/Mohamed ELBEIALI", "Andrej GACINA/Ivor BAN", "2026-08-10"),
        ("Ovidiu IONESCU/Darius MOVILEANU", "Tom JARVIS/Connor GREEN", "Eduard IONESCU/Darius MOVILEANU", "Tom JARVIS/Connor GREEN", "2026-08-10"),
    ],
    "wd": [
        ("Nomin BAASAN/Agnes SVENSSON", "BENJEGARD/NILSSON", "Nomin BAASAN/Agnes SVENSSON", "Siri BENJEGARD/Alice NILSSON", "2026-08-11"),
        ("Adriana DIAZ/Honoka HASHIMOTO", "LAI/SHAN", "Adriana DIAZ/Honoka HASHIMOTO", "LAI Chloe/Xiaona SHAN", "2026-08-11"),
        ("Tatiana KUKULKOVA/Syndrela DAS", "Daniela ORTEGA/Paulina VEGA", "Tatiana KUKULKOVA/Syndrela DAS", "Daniela ORTEGA/Paulina VEGA", "2026-08-11"),
        ("Dina MESHREF/Hana GODA", "Nina MITTELHAM/Yangzi LIU", "Dina MESHREF/Hana GODA", "Nina MITTELHAM/Yangzi LIU", "2026-08-10"),
        ("CHIEN Tung-Chuan/LI Yu-Jhun", "Christina KALLBERG/Filippa BERGAND", "CHIEN Tung-Chuan/LI Yu-Jhun", "Christina KALLBERG/Filippa BERGAND", "2026-08-10"),
        ("Elizabeta SAMARA/Bernadette SZOCS", "Prithika PAVADE/Charlotte LUTZ", "Elizabeta SAMARA/Bernadette SZOCS", "Prithika PAVADE/Charlotte LUTZ", "2026-08-10"),
        ("LOY Ming Ying/SER Lin Qian", "Orawan PARANANG/Natalia BAJOR", "LOY Ming Ying/SER Lin Qian", "Orawan PARANANG/Natalia BAJOR", "2026-08-10"),
    ],
    "xd": [
        ("Kristian KARLSSON/Nina MITTELHAM", "Omar ASSAR/Hana GODA", "Mattias KARLSSON/Nina MITTELHAM", "Omar ASSAR/Hana GODA", "2026-08-11"),
        ("Ovidiu IONESCU/Bernadette SZOCS", "Elias RANEFUR/Filippa BERGAND", "Eduard IONESCU/Bernadette SZOCS", "Elias RANEFUR/Filippa BERGAND", "2026-08-11"),
        ("Gustavo GOMEZ/Daniela ORTEGA", "LY/ZHANG", "Gustavo GOMEZ/Daniela ORTEGA", "Edward LY/Mo ZHANG", "2026-08-11"),
        ("Alexis LEBRUN/Satsuki ODO", "Ivor BAN/Hana ARAPOVIC", "Alexis LEBRUN/Satsuki ODO", "Ivor BAN/Hana ARAPOVIC", "2026-08-11"),
        ("Anders LIND/Anna HURSEY", "Kristian KARLSSON/Christina KALLBERG", "Anders LIND/Anna HURSEY", "Kristian KARLSSON/Christina KALLBERG", "2026-08-10"),
        ("Patrick FRANZISKA/Adriana DIAZ", "Connor GREEN/Tin-Tin HO", "Patrick FRANZISKA/Adriana DIAZ", "Connor GREEN/Tin-Tin HO", "2026-08-10"),
        ("LIANG/MOYLAND", "Guilherme TEODORO/Paulina VEGA", "Jishan LIANG/Sally MOYLAND", "Guilherme TEODORO/Paulina VEGA", "2026-08-10"),
        ("Lubomir PISTEJ/Tatiana KUKULKOVA", "Youssef ABDELAZIZ/Mariam ALHODABY", "Lubomir PISTEJ/Tatiana KUKULKOVA", "Youssef ABDELAZIZ/Mariam ALHODABY", "2026-08-10"),
    ],
}

# ============================================================
# additions: (真实日期, 胜者, 负者)
# ============================================================
additions = {
    "ms": [
        ("2026-08-12", "Felix LEBRUN", "Eduard IONESCU"),
        ("2026-08-12", "Kanak JHA", "FANG Bo"),
        ("2026-08-11", "Alexis LEBRUN", "QUEK Izaac"),
        ("2026-08-12", "Kristian KARLSSON", "Hiroto SHINOZUKA"),
        ("2026-08-12", "Tomokazu HARIMOTO", "Manav THAKKAR"),
        ("2026-08-12", "Sora MATSUSHIMA", "Sathiyan GNANASEKARAN"),
        ("2026-08-12", "OH Junsung", "Milosz REDZIMSKI"),
    ],
    "ws": [
        ("2026-08-12", "WANG Yidi", "Siri BENJEGARD"),
        ("2026-08-11", "Miyu NAGASAKI", "Elizabet ABRAAMIAN"),
        ("2026-08-11", "JOO Cheonhui", "Adriana DIAZ"),
        ("2026-08-12", "Lily ZHANG", "Manika BATRA"),
        ("2026-08-12", "KUAI Man", "Elena ZAHARIA"),
        ("2026-08-12", "CHEN Xingtong", "Hana GODA"),
        ("2026-08-12", "Annett KAUFMANN", "ZHU Yuling"),
        ("2026-08-12", "Miwa HARIMOTO", "Anna HURSEY"),
    ],
    "md": [
        ("2026-08-11", "Guilherme TEODORO/Leonardo IIZUKA", "KUO Guan-Hong/FENG Yi-Hsin"),
        ("2026-08-12", "LIN Shidong/WEN Ruibo", "Kristian KARLSSON/Anton KALLBERG"),
        ("2026-08-12", "Alexis LEBRUN/Felix LEBRUN", "Youssef ABDELAZIZ/Mohamed ELBEIALI"),
        ("2026-08-12", "Manav THAKKAR/Manush SHAH", "Daniel BERZOSA/Juan PEREZ"),
        ("2026-08-12", "Martin ALLEGRO/Adrien RASSENFOSSE", "Sid NARESH/Nandan NARESH"),
        ("2026-08-12", "Shunsuke TOGAMI/Hiroto SHINOZUKA", "Esteban DORR/Florian BOURRASSAUD"),
        ("2026-08-12", "OH Junsung/LIM Jonghoon", "Eduard IONESCU/Darius MOVILEANU"),
        ("2026-08-12", "Benedikt DUDA/Dang QIU", "Maciej KUBIK/Milosz REDZIMSKI"),
        ("2026-08-12", "WONG Chun Ting/CHAN Baldwin", "Guilherme TEODORO/Leonardo IIZUKA"),
    ],
    "wd": [
        ("2026-08-11", "Annett KAUFMANN/Sabine WINTER", "Izabela LUPULESKU/Sabina SURJAN"),
        ("2026-08-12", "Miwa HARIMOTO/Hina HAYATA", "Adriana DIAZ/Honoka HASHIMOTO"),
        ("2026-08-12", "WANG Yidi/CHEN Yi", "CHIEN Tung-Chuan/LI Yu-Jhun"),
        ("2026-08-12", "Miyu NAGASAKI/KIM Nayeong", "LOY Ming Ying/SER Lin Qian"),
        ("2026-08-12", "Elizabeta SAMARA/Bernadette SZOCS", "Maria XIAO/Anna HURSEY"),
        ("2026-08-12", "Annett KAUFMANN/Sabine WINTER", "Diya CHITALE/Yashaswini GHORPADE"),
        ("2026-08-12", "SHIN Yubin/JOO Cheonhui", "Dina MESHREF/Hana GODA"),
        ("2026-08-12", "DOO Hoi Kem/NG Wing Lam", "Nomin BAASAN/Agnes SVENSSON"),
        ("2026-08-12", "WANG Manyu/KUAI Man", "Tatiana KUKULKOVA/Syndrela DAS"),
    ],
    "xd": [
        ("2026-08-12", "LIM Jonghoon/SHIN Yubin", "Anders LIND/Anna HURSEY"),
        ("2026-08-12", "LIN Yun-Ju/CHENG I-Ching", "Jishan LIANG/Sally MOYLAND"),
        ("2026-08-12", "LIN Shidong/KUAI Man", "Eduard IONESCU/Bernadette SZOCS"),
        ("2026-08-12", "Alexis LEBRUN/Satsuki ODO", "Manush SHAH/Diya CHITALE"),
        ("2026-08-12", "Dang QIU/Sabine WINTER", "Patrick FRANZISKA/Adriana DIAZ"),
        ("2026-08-12", "WONG Chun Ting/DOO Hoi Kem", "Lubomir PISTEJ/Tatiana KUKULKOVA"),
        ("2026-08-12", "Alvaro ROBLES/Maria XIAO", "Mattias KARLSSON/Nina MITTELHAM"),
        ("2026-08-12", "Gustavo GOMEZ/Daniela ORTEGA", "Hugo CALDERANO/Bruna TAKAHASHI"),
    ],
}


def scorelog_path(category):
    if category == "ws":
        return os.path.join(WTT_DIR, category, f"score-log-{EVENT_YEAR}-ws.json")
    return os.path.join(WTT_DIR, category, f"score-log-{EVENT_YEAR}-wtt.json")


def apply_corrections(category, data):
    n_updated = 0
    n_missing = 0
    for ow, ol, nw, nl, ndate in corrections.get(category, []):
        idx = None
        for i, r in enumerate(data):
            if r.get("类型") == EVENT_TYPE and r.get("日期") == OLD_DATE and r.get("胜者") == ow and r.get("负者") == ol:
                idx = i
                break
        if idx is None:
            # 尝试已用新名字的情况（仅更新日期）
            for i, r in enumerate(data):
                if r.get("类型") == EVENT_TYPE and r.get("胜者") == nw and r.get("负者") == nl:
                    idx = i
                    break
        if idx is None:
            n_missing += 1
            print(f"    MISS correction: {ow} | {ol}")
            continue
        r = data[idx]
        r["日期"] = ndate
        r["胜者"] = nw
        r["负者"] = nl
        n_updated += 1
    print(f"  {category.upper()} corrections: {n_updated} updated, {n_missing} missing")
    return n_updated


# 本站(Malmo)比赛日期范围，添加去重仅针对本站内比赛
MALMO_DATES = {"2026-08-10", "2026-08-11", "2026-08-12"}


def apply_additions(category, data):
    existing = set()
    for r in data:
        if r.get("类型") == EVENT_TYPE and r.get("日期") in MALMO_DATES:
            existing.add((r.get("胜者"), r.get("负者")))
    n_added = 0
    n_skipped = 0
    for ndate, w, l in additions.get(category, []):
        if (w, l) in existing:
            n_skipped += 1
            print(f"    SKIP existing matchup: {w} | {l}")
            continue
        data.append({"日期": ndate, "类型": EVENT_TYPE, "胜者": w, "负者": l})
        existing.add((w, l))
        n_added += 1
    print(f"  {category.upper()} additions: {n_added} added, {n_skipped} skipped(existing)")
    return n_added


def write_scorelog(category, data):
    fp = scorelog_path(category)
    with open(fp, "w", encoding="utf-8", newline="\n") as f:
        if category == "xd":
            f.write("[\n")
            for i, r in enumerate(data):
                line = json.dumps(r, ensure_ascii=False)
                if i < len(data) - 1:
                    line += ","
                f.write(line + "\n")
            f.write("]")
        else:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")


def main():
    print("=" * 60)
    print("WTT Grand Smash Malmo 2026 - Corrections & Additions")
    print("=" * 60)
    for category in ["ms", "ws", "md", "wd", "xd"]:
        fp = scorelog_path(category)
        with open(fp, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        apply_corrections(category, data)
        apply_additions(category, data)
        write_scorelog(category, data)
        print(f"  -> {category.upper()} total: {len(data)}")


if __name__ == "__main__":
    main()