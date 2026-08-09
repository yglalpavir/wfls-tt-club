#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, os, sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
EVENT_TYPE = "冠军赛"
EVENT_YEAR = "2026"

ms_matches = [
    ("2026-08-04", "Sora MATSUSHIMA", "ZHOU Qihao"),
    ("2026-08-04", "Anders LIND", "KUO Guan-Hong"),
    ("2026-08-06", "CHEN Yuanyu", "Simon GAUZY"),
    ("2026-08-06", "JANG Woojin", "Anton KALLBERG"),
    ("2026-08-05", "Tomokazu HARIMOTO", "Nicholas LUM"),
    ("2026-08-06", "XIANG Peng", "Vladimir SIDORENKO"),
    ("2026-08-05", "Darko JORGIC", "Manav THAKKAR"),
    ("2026-08-05", "Alexis LEBRUN", "Manush SHAH"),
    ("2026-08-05", "Dang QIU", "AN Jaehyun"),
    ("2026-08-05", "Kanak JHA", "Tomislav PUCAR"),
    ("2026-08-04", "OH Junsung", "Omar ASSAR"),
    ("2026-08-05", "LIM Jonghoon", "LIN Yun-Ju"),
    ("2026-08-04", "Joao GERALDO", "WEN Ruibo"),
    ("2026-08-04", "Hiroto SHINOZUKA", "Yukiya UDA"),
    ("2026-08-04", "Benedikt DUDA", "Shunsuke TOGAMI"),
    ("2026-08-04", "Felix LEBRUN", "Flavien COTON"),
    ("2026-08-06", "Sora MATSUSHIMA", "Anders LIND"),
    ("2026-08-07", "JANG Woojin", "CHEN Yuanyu"),
    ("2026-08-07", "Tomokazu HARIMOTO", "XIANG Peng"),
    ("2026-08-07", "Alexis LEBRUN", "Darko JORGIC"),
    ("2026-08-07", "Dang QIU", "Kanak JHA"),
    ("2026-08-07", "OH Junsung", "LIM Jonghoon"),
    ("2026-08-06", "Hiroto SHINOZUKA", "Joao GERALDO"),
    ("2026-08-06", "Felix LEBRUN", "Benedikt DUDA"),
    ("2026-08-08", "Sora MATSUSHIMA", "JANG Woojin"),
    ("2026-08-08", "Tomokazu HARIMOTO", "Alexis LEBRUN"),
    ("2026-08-08", "OH Junsung", "Dang QIU"),
    ("2026-08-08", "Hiroto SHINOZUKA", "Felix LEBRUN"),
    ("2026-08-09", "Tomokazu HARIMOTO", "Sora MATSUSHIMA"),
    ("2026-08-09", "OH Junsung", "Hiroto SHINOZUKA"),
    ("2026-08-09", "Tomokazu HARIMOTO", "OH Junsung"),
]

ws_matches = [
    ("2026-08-05", "Miwa HARIMOTO", "Honoka HASHIMOTO"),
    ("2026-08-05", "CHEN Yi", "LEE Eunhye"),
    ("2026-08-04", "Sreeja AKULA", "Sofia POLCANOVA"),
    ("2026-08-04", "SHIN Yubin", "Amy WANG"),
    ("2026-08-05", "WANG Yidi", "Mima ITO"),
    ("2026-08-05", "CHENG I-Ching", "Elizabeta SAMARA"),
    ("2026-08-04", "Margaryta PESOTSKA", "Jia Nan YUAN"),
    ("2026-08-04", "ZHU Yuling", "JOO Cheonhui"),
    ("2026-08-06", "Satsuki ODO", "Anna HURSEY"),
    ("2026-08-06", "Lily ZHANG", "Natalia BAJOR"),
    ("2026-08-04", "Prithika PAVADE", "ZENG Jian"),
    ("2026-08-04", "CHEN Xingtong", "KIM Nayeong"),
    ("2026-08-05", "Hina HAYATA", "DOO Hoi Kem"),
    ("2026-08-06", "YEH Yi-Tian", "Yangzi LIU"),
    ("2026-08-05", "Bernadette SZOCS", "Hana GODA"),
    ("2026-08-05", "KUAI Man", "Manika BATRA"),
    ("2026-08-06", "Miwa HARIMOTO", "CHEN Yi"),
    ("2026-08-07", "SHIN Yubin", "Sreeja AKULA"),
    ("2026-08-07", "WANG Yidi", "CHENG I-Ching"),
    ("2026-08-07", "ZHU Yuling", "Margaryta PESOTSKA"),
    ("2026-08-07", "Satsuki ODO", "Lily ZHANG"),
    ("2026-08-06", "CHEN Xingtong", "Prithika PAVADE"),
    ("2026-08-07", "Hina HAYATA", "YEH Yi-Tian"),
    ("2026-08-07", "KUAI Man", "Bernadette SZOCS"),
    ("2026-08-08", "Miwa HARIMOTO", "SHIN Yubin"),
    ("2026-08-08", "WANG Yidi", "ZHU Yuling"),
    ("2026-08-08", "CHEN Xingtong", "Satsuki ODO"),
    ("2026-08-08", "KUAI Man", "Hina HAYATA"),
    ("2026-08-09", "Miwa HARIMOTO", "WANG Yidi"),
    ("2026-08-09", "CHEN Xingtong", "KUAI Man"),
    ("2026-08-09", "Miwa HARIMOTO", "CHEN Xingtong"),
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
    print("WTT Champions Yokohama 2026")
    total = 0
    for cat, data in [("ms", ms_matches), ("ws", ws_matches)]:
        total += append_to_scorelog(cat, data)
    print(f"Total: {total}")
