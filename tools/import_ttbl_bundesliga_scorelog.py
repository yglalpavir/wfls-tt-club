#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TTBL (Tischtennis Bundesliga) 德甲联赛 -> WTT score-log 数据录入脚本

读取 tools/ttbl_data/ttbl_<season>_gameday<N>.json（由 import_ttbl_gameday.py 抓取），
把已完赛（Finished）的单打场次追加进 wtt_data/ms/score-log-<year>-wtt.json，
双打场次追加进 wtt_data/md/score-log-<year>-wtt.json，类型统一为「德甲联赛」。

姓名规范化遵循 wtt_data/player-name-format.md：
- 欧洲/美洲/日籍等 -> 名 姓（姓全大写）：Patrick FRANZISKA / Shunsuke TOGAMI
- 中文（含台湾）-> 姓 名：FENG Yi-Hsin / LIAO Cheng-Ting
- 双打按字母排序组合：A/B
"""

import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WTT_DIR = os.path.join(ROOT_DIR, "wtt_data")
TTBL_DIR = os.path.join(BASE_DIR, "ttbl_data")

EVENT_TYPE = "德甲联赛"

# TTBL 原始姓名（名 姓）-> 规范 score-log 姓名
NAME_MAP = {
    "Adrien Rassenfosse": "Adrien RASSENFOSSE",
    "Albert Vilardell": "Albert VILARDELL",
    "Adrian Gossow": "Adrian GOSSOW",
    "Anders Lind": "Anders LIND",
    "Anton Limonov": "Anton LIMONOV",
    "Borgar Haug": "Borgar HAUG",
    "Damian Floro": "Damian FLORO",
    "Jonathan Gaiser": "Jonathan GAISER",
    "Karl Walter": "Karl WALTER",
    "Matej Haspel": "Matej HASPEL",
    "Michael Engelhardt": "Michael ENGELHARDT",
    "Noah Hersel": "Noah HERSEL",
    "Rogelio Castro": "Rogelio CASTRO",
    "Timotius Köchling": "Timotius KÖCHLING",
    "Tobias Hippler": "Tobias HIPPLER",
    "Yoan Velichkov": "Yoan VELICHKOV",
    "Alvaro Robles": "Alvaro ROBLES",
    "Andre Bertelsmeier": "Andre BERTELSMEIER",
    "Andrei Istrate": "Andrei ISTRATE",
    "Anton Källberg": "Anton KALLBERG",
    "Bastian Steger": "Bastian STEGER",
    "Benedikt Duda": "Benedikt DUDA",
    "Benno Oehme": "Benno OEHME",
    "Cedric Meissner": "Cedric MEISSNER",
    "Cheng-Ting Liao": "LIAO Cheng-Ting",
    "Csaba Andras": "Csaba ANDRAS",
    "Dang Qiu": "Dang QIU",
    "Danilo Faso": "Danilo FASO",
    "Daniel Habesohn": "Daniel HABESOHN",
    "Darius Movileanu": "Darius MOVILEANU",
    "Dimitrij Ovtcharov": "Dimitrij OVTCHAROV",
    "Eduard Ionescu": "Eduard IONESCU",
    "Fanbo Meng": "Fanbo MENG",
    "Filip Zeljko": "Filip ZELJKO",
    "Florian Bluhm": "Florian BLUHM",
    "Hugo Calderano": "Hugo CALDERANO",
    "Irvin Bertrand": "Irvin BERTRAND",
    "Iulian Chirita": "Iulian CHIRITA",
    "Ivo Quett": "Ivo QUETT",
    "Ivor Ban": "Ivor BAN",
    "Joao Geraldo": "Joao GERALDO",
    "Jonathan Groth": "Jonathan GROTH",
    "Juan Perez": "Juan PEREZ",
    "Kanak Jha": "Kanak JHA",
    "Kay Stumper": "Kay STUMPER",
    "Kirill Gerassimenko": "Kirill GERASSIMENKO",
    "Kristian Karlsson": "Kristian KARLSSON",
    "Maciej Kubik": "Maciej KUBIK",
    "Marcelo Aguirre": "Marcelo AGUIRRE",
    "Marcos Freitas": "Marcos FREITAS",
    "Martin Allegro": "Martin ALLEGRO",
    "Mattias Karlsson": "Mattias KARLSSON",
    "Ovidiu Ionescu": "Ovidiu IONESCU",
    "Patrick Franziska": "Patrick FRANZISKA",
    "Ricardo Walther": "Ricardo WALTHER",
    "Romain Ruiz": "Romain RUIZ",
    "Ruwen Filus": "Ruwen FILUS",
    "Samuel Walker": "Samuel WALKER",
    "Shunsuke Togami": "Shunsuke TOGAMI",
    "Steffen Mengel": "Steffen MENGEL",
    "Tiago Abiodun": "Tiago ABIODUN",
    "Tiago Apolonia": "Tiago APOLONIA",
    "Tom Jarvis": "Tom JARVIS",
    "Wim Verdonschot": "Wim VERDONSCHOT",
    "Yi-En Yeh": "YEH Yi-En",
    "Yi-Hsin Feng": "FENG Yi-Hsin",
    "Yongyin Li": "Yongyin LI",
    "Zhendong Fan": "FAN Zhendong",
}


def normalize_name(raw):
    if raw in NAME_MAP:
        return NAME_MAP[raw]
    # 兜底：名 姓 -> 名 姓大写（欧洲/日籍默认顺序）
    parts = raw.split()
    if len(parts) == 2:
        return f"{parts[0]} {parts[1].upper()}"
    raise ValueError(f"无法规范姓名: {raw!r}")


def doubles_name(players):
    names = sorted(normalize_name(p["name"]) for p in players)
    return "/".join(names)


def collect_records(ttbl_json_path):
    with open(ttbl_json_path, encoding="utf-8-sig") as f:
        data = json.load(f)
    ms = []
    md = []
    for match in data["matches"]:
        date = match["kickoffUtc"][:10] if match.get("kickoffUtc") else None
        if not date:
            raise ValueError(f"缺少日期: {match['id']}")
        for gm in match["games"]:
            if gm["state"] != "Finished":
                continue
            winner = gm["winner"]
            if gm["type"] == "singles":
                home = normalize_name(gm["homePlayer"]["name"])
                away = normalize_name(gm["awayPlayer"]["name"])
                if winner == "Home":
                    w, l = home, away
                else:
                    w, l = away, home
                ms.append((date, w, l))
            elif gm["type"] == "double":
                home = doubles_name(gm["homeDouble"]["players"])
                away = doubles_name(gm["awayDouble"]["players"])
                if winner == "Home":
                    w, l = home, away
                else:
                    w, l = away, home
                md.append((date, w, l))
            else:
                raise ValueError(f"未知比赛类型: {gm['type']}")
    return ms, md


def append_to_scorelog(category, matches, event_type, year):
    filename = f"score-log-{year}-wtt.json"
    filepath = os.path.join(WTT_DIR, category, filename)

    with open(filepath, "r", encoding="utf-8-sig") as f:
        existing = json.load(f)

    existing_keys = set()
    for r in existing:
        existing_keys.add((r["日期"], r["类型"], r["胜者"], r["负者"]))

    new_records = []
    for date, winner, loser in matches:
        key = (date, event_type, winner, loser)
        if key not in existing_keys:
            new_records.append({
                "日期": date,
                "类型": event_type,
                "胜者": winner,
                "负者": loser,
            })
            existing_keys.add(key)

    all_records = existing + new_records
    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"  {category.upper()}: +{len(new_records)} 条（总 {len(all_records)}）")
    return len(new_records)


def verify_dedup(category, year):
    filename = f"score-log-{year}-wtt.json"
    filepath = os.path.join(WTT_DIR, category, filename)
    with open(filepath, encoding="utf-8-sig") as f:
        data = json.load(f)
    seen = set()
    dupes = 0
    for r in data:
        key = (r["日期"], r["类型"], r["胜者"], r["负者"])
        if key in seen:
            dupes += 1
        seen.add(key)
    return dupes


def main():
    import argparse
    parser = argparse.ArgumentParser(description="TTBL（德甲/德国杯）-> WTT score-log 录入")
    parser.add_argument("--season", default="2026-2027")
    parser.add_argument("--year", default="2026", help="目标 score-log 年份")
    parser.add_argument("--league", default="bundesliga", choices=["bundesliga", "pokal"],
                        help="数据来源：bundesliga（德甲联赛，默认）或 pokal（德国杯）")
    parser.add_argument("--event-type", default=None,
                        help="写入的赛事类型；默认 bundesliga=德甲联赛，pokal=德国杯")
    parser.add_argument("--gameday", nargs="+", type=int, required=True,
                        help="一个或多个轮次，如 --gameday 1 2")
    args = parser.parse_args()

    gamedays = []
    for g in args.gameday:
        if g < 0:
            raise ValueError("轮次必须为正整数")
        gamedays.append(g)
    gamedays = sorted(set(gamedays))

    event_type = args.event_type or ("德国杯" if args.league == "pokal" else EVENT_TYPE)
    file_prefix = f"ttbl_{args.league}_" if args.league != "bundesliga" else "ttbl_"
    title = "德国杯" if args.league == "pokal" else "德甲联赛"

    print("=" * 60)
    print(f"TTBL {title} -> WTT score-log 录入（{args.season} 轮次 {gamedays}，类型「{event_type}」）")
    print("=" * 60)

    grand_total = 0
    for gameday in gamedays:
        ttbl_json = os.path.join(TTBL_DIR, f"{file_prefix}{args.season}_gameday{gameday}.json")
        if not os.path.exists(ttbl_json):
            sys.exit(f"缺少 TTBL 数据文件: {ttbl_json}（请先用 import_ttbl_gameday.py 抓取）")

        ms, md = collect_records(ttbl_json)
        print(f"\n  --- 第 {gameday} 轮 ---  单打 {len(ms)} 条，双打 {len(md)} 条")
        grand_total += append_to_scorelog("ms", ms, event_type, args.year)
        grand_total += append_to_scorelog("md", md, event_type, args.year)

    print(f"\n  新增合计: {grand_total}")

    print("\n  去重校验：")
    for cat in ("ms", "md"):
        dupes = verify_dedup(cat, args.year)
        status = f"{dupes} 条重复" if dupes else "无重复"
        print(f"    {cat.upper()}: {status}")


if __name__ == "__main__":
    main()
