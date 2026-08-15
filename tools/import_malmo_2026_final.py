#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WTT Grand Smash Malmo 2026 - MS/WS QF 补录 + XD Final + MD/WD SF
日期 2026-08-14（用户标注：这些也是8/14的）
去重仅针对本站(Malmo)已有记录，重复比赛不重复添加。
"""

import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WTT_DIR = os.path.join(ROOT_DIR, "wtt_data")

EVENT_TYPE = "大满贯"
EVENT_YEAR = "2026"
DATE = "2026-08-14"
MALMO_DATES = {"2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", DATE}

additions = {
    "ms": [
        ("Tomokazu HARIMOTO", "Shunsuke TOGAMI"),
        ("Felix LEBRUN", "Thibault PORET"),
        ("Hugo CALDERANO", "Anders LIND"),
        ("Sora MATSUSHIMA", "ZHOU Qihao"),
    ],
    "ws": [
        ("CHEN Yi", "Annett KAUFMANN"),
        ("WANG Manyu", "QIN Yuxuan"),
        ("KUAI Man", "Nina MITTELHAM"),
        ("PENG Yu-Han", "Miyu NAGASAKI"),
    ],
    "md": [
        ("WONG Chun Ting/CHAN Baldwin", "Shunsuke TOGAMI/Hiroto SHINOZUKA"),
        ("Alexis LEBRUN/Felix LEBRUN", "Martin ALLEGRO/Adrien RASSENFOSSE"),
    ],
    "wd": [
        ("Miwa HARIMOTO/Hina HAYATA", "Miyu NAGASAKI/KIM Nayeong"),
        ("DOO Hoi Kem/NG Wing Lam", "SHIN Yubin/JOO Cheonhui"),
    ],
    "xd": [
        ("LIN Shidong/KUAI Man", "WONG Chun Ting/DOO Hoi Kem"),
    ],
}


def scorelog_path(category):
    if category == "ws":
        return os.path.join(WTT_DIR, category, f"score-log-{EVENT_YEAR}-ws.json")
    return os.path.join(WTT_DIR, category, f"score-log-{EVENT_YEAR}-wtt.json")


def main():
    print("=" * 60)
    print(f"WTT Grand Smash Malmo 2026 - QF补录 + SF + XD Final [{DATE}]")
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