#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Grand Smash Malmo 2026 - R16/QF 数据录入
MS/WS Round of 16 + MD/WD/XD Quarterfinal，日期 2026-08-13
去重仅针对本站(Malmo)已有记录，重复比赛不重复添加。
"""

import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WTT_DIR = os.path.join(ROOT_DIR, "wtt_data")

EVENT_TYPE = "大满贯"
EVENT_YEAR = "2026"
DATE = "2026-08-13"
MALMO_DATES = {"2026-08-10", "2026-08-11", "2026-08-12", DATE}

additions = {
    "ms": [
        ("Dimitrij OVTCHAROV", "OH Junsung"),
        ("Darko JORGIC", "Cedric NUYTINCK"),
        ("Omar ASSAR", "Csaba ANDRAS"),
        ("Jonathan GROTH", "LIN Yun-Ju"),
        ("Felix LEBRUN", "PARK Ganghyeon"),
        ("Thibault PORET", "Joao GERALDO"),
        ("Anders LIND", "KUO Guan-Hong"),
        ("Hugo CALDERANO", "Maharu YOSHIMURA"),
        ("LIN Shidong", "Kanak JHA"),
        ("Alexis LEBRUN", "XIANG Peng"),
        ("Shunsuke TOGAMI", "Kristian KARLSSON"),
        ("Tomokazu HARIMOTO", "Yukiya UDA"),
        ("Tomislav PUCAR", "JANG Woojin"),
        ("Elias RANEFUR", "WEN Ruibo"),
        ("ZHOU Qihao", "Anton KALLBERG"),
        ("Sora MATSUSHIMA", "FENG Yi-Hsin"),
    ],
    "ws": [
        ("WANG Manyu", "CHIEN Tung-Chuan"),
        ("QIN Yuxuan", "LI Yu-Jhun"),
        ("PENG Yu-Han", "Honoka HASHIMOTO"),
        ("Miyu NAGASAKI", "Sabine WINTER"),
        ("KUAI Man", "Sofia POLCANOVA"),
        ("Nina MITTELHAM", "JOO Cheonhui"),
        ("SHIN Yubin", "Giorgia PICCOLIN"),
        ("Hina HAYATA", "SU Tsz Tung"),
        ("WANG Yidi", "Diya CHITALE"),
        ("Satsuki ODO", "Lily ZHANG"),
        ("SHI Xunyao", "CHENG I-Ching"),
        ("Miyuu KIHARA", "CHEN Xingtong"),
        ("Annett KAUFMANN", "Elizabeta SAMARA"),
        ("CHEN Yi", "Christina KALLBERG"),
        ("Ying HAN", "ZENG Jian"),
        ("Miwa HARIMOTO", "KIM Nayeong"),
    ],
    "md": [
        ("Alexis LEBRUN/Felix LEBRUN", "LIN Shidong/WEN Ruibo"),
        ("Martin ALLEGRO/Adrien RASSENFOSSE", "Manav THAKKAR/Manush SHAH"),
        ("Shunsuke TOGAMI/Hiroto SHINOZUKA", "OH Junsung/LIM Jonghoon"),
        ("WONG Chun Ting/CHAN Baldwin", "Benedikt DUDA/Dang QIU"),
    ],
    "wd": [
        ("Miwa HARIMOTO/Hina HAYATA", "WANG Yidi/CHEN Yi"),
        ("Miyu NAGASAKI/KIM Nayeong", "Elizabeta SAMARA/Bernadette SZOCS"),
        ("SHIN Yubin/JOO Cheonhui", "Annett KAUFMANN/Sabine WINTER"),
        ("DOO Hoi Kem/NG Wing Lam", "WANG Manyu/KUAI Man"),
    ],
    "xd": [
        ("LIN Yun-Ju/CHENG I-Ching", "LIM Jonghoon/SHIN Yubin"),
        ("LIN Shidong/KUAI Man", "Alexis LEBRUN/Satsuki ODO"),
        ("WONG Chun Ting/DOO Hoi Kem", "Dang QIU/Sabine WINTER"),
        ("Alvaro ROBLES/Maria XIAO", "Gustavo GOMEZ/Daniela ORTEGA"),
    ],
}


def scorelog_path(category):
    if category == "ws":
        return os.path.join(WTT_DIR, category, f"score-log-{EVENT_YEAR}-ws.json")
    return os.path.join(WTT_DIR, category, f"score-log-{EVENT_YEAR}-wtt.json")


def main():
    print("=" * 60)
    print(f"WTT Grand Smash Malmo 2026 - R16/QF [{DATE}]")
    print("=" * 60)
    for category in ["ms", "ws", "md", "wd", "xd"]:
        fp = scorelog_path(category)
        with open(fp, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        existing = set()
        for r in data:
            if r.get("类型") == EVENT_TYPE and r.get("日期") in MALMO_DATES:
                existing.add((r.get("胜者"), r.get("负者")))
        n_added = 0
        n_skipped = 0
        for w, l in additions.get(category, []):
            if (w, l) in existing:
                n_skipped += 1
                print(f"    SKIP existing: {w} | {l}")
                continue
            data.append({"日期": DATE, "类型": EVENT_TYPE, "胜者": w, "负者": l})
            existing.add((w, l))
            n_added += 1
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
        print(f"  {category.upper()}: {n_added} added, {n_skipped} skipped (total: {len(data)})")


if __name__ == "__main__":
    main()