#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
欧洲 Top 16 男子单打（Europe Top 16 Cup, MS）数据录入
覆盖 2014-2025，类型「洲杯赛」，日期统一落在每年 2 月 20-23 日。
球员姓名遵循 wtt_data/player-name-format.md（欧洲球员：名 姓，姓全大写）。
新增 2014-2017 年度文件并登记到 manifest.json，2018-2025 追加到已有年度文件。
"""

import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WTT_DIR = os.path.join(ROOT_DIR, "wtt_data")
MS_DIR = os.path.join(WTT_DIR, "ms")

EVENT_TYPE = "洲杯赛"

# 原始 CSV 名 -> 项目标准名（player-name-format.md）
NAME_MAP = {
    "Marcos Freitas": "Marcos FREITAS",
    "Michael Maze": "Michael MAZE",
    "Adrien Mattenet": "Adrien MATTENET",
    "Dimitrij Ovtcharov": "Dimitrij OVTCHAROV",
    "Alexander Shibaev": "Alexander SHIBAEV",
    "Tiago Apolonia": "Tiago APOLONIA",
    "Panagiotis Gionis": "Panagiotis GIONIS",
    "Timo Boll": "Timo BOLL",
    "Simon Gauzy": "Simon GAUZY",
    "Robert Gardos": "Robert GARDOS",
    "Joao Monteiro": "Joao MONTEIRO",
    "Kristian Karlsson": "Kristian KARLSSON",
    "Stefan Fegerl": "Stefan FEGERL",
    "Vladimir Samsonov": "Vladimir SAMSONOV",
    "Bastian Steger": "Bastian STEGER",
    "Kou Lei": "Lei KOU",
    "Andrej Gacina": "Andrej GACINA",
    "Jonathan Groth": "Jonathan GROTH",
    "Mattias Falck": "Mattias FALCK",
    "Emmanuel Lebesson": "Emmanuel LEBESSON",
    "Ruwen Filus": "Ruwen FILUS",
    "Lionel Weber": "Lionel WEBER",
    "Daniel Habesohn": "Daniel HABESOHN",
    "Ovidiu Ionescu": "Ovidiu IONESCU",
    "Liam Pitchford": "Liam PITCHFORD",
    "Darko Jorgic": "Darko JORGIC",
    "Tomislav Pucar": "Tomislav PUCAR",
    "Wang Yang": "Yang WANG",
    "Patrick Franziska": "Patrick FRANZISKA",
    "Truls Moregardh": "Truls MOREGARD",
    "Barish Moullet": "Barish MOULLET",
    "Kirill Skachkov": "Kirill SKACHKOV",
    "Dang Qiu": "Dang QIU",
    "Elias Hardmeier": "Elias HARDMEIER",
    "Joao Geraldo": "Joao GERALDO",
    "Alexis Lebrun": "Alexis LEBRUN",
    "Felix Lebrun": "Felix LEBRUN",
    "Anton Källberg": "Anton KALLBERG",
    "Anders Lind": "Anders LIND",
    "Alvaro Robles": "Alvaro ROBLES",
    "Yaroslav Zhmudenko": "Yaroslav ZHMUDENKO",
    "Loic Stoll": "Loic STOLL",
    "Benedikt Duda": "Benedikt DUDA",
    "Eduard Ionescu": "Eduard IONESCU",
}

# 每场比赛：赢家(原始名), 负者(原始名), 日期
# 轮次对应日期：R16 -> 02-20, QF -> 02-21, SF -> 02-22, F -> 02-23
MATCHES = {
    2014: [
        ("Marcos Freitas", "Michael Maze", "2014-02-23"),
        ("Marcos Freitas", "Adrien Mattenet", "2014-02-22"),
        ("Michael Maze", "Dimitrij Ovtcharov", "2014-02-22"),
        ("Marcos Freitas", "Alexander Shibaev", "2014-02-21"),
        ("Adrien Mattenet", "Tiago Apolonia", "2014-02-21"),
        ("Michael Maze", "Panagiotis Gionis", "2014-02-21"),
        ("Dimitrij Ovtcharov", "Timo Boll", "2014-02-21"),
    ],
    2015: [
        ("Dimitrij Ovtcharov", "Marcos Freitas", "2015-02-23"),
        ("Dimitrij Ovtcharov", "Panagiotis Gionis", "2015-02-22"),
        ("Marcos Freitas", "Simon Gauzy", "2015-02-22"),
        ("Dimitrij Ovtcharov", "Adrien Mattenet", "2015-02-21"),
        ("Panagiotis Gionis", "Tiago Apolonia", "2015-02-21"),
        ("Simon Gauzy", "Robert Gardos", "2015-02-21"),
        ("Marcos Freitas", "Joao Monteiro", "2015-02-21"),
    ],
    2016: [
        ("Dimitrij Ovtcharov", "Joao Monteiro", "2016-02-23"),
        ("Dimitrij Ovtcharov", "Kristian Karlsson", "2016-02-22"),
        ("Joao Monteiro", "Alexander Shibaev", "2016-02-22"),
        ("Dimitrij Ovtcharov", "Tiago Apolonia", "2016-02-21"),
        ("Kristian Karlsson", "Stefan Fegerl", "2016-02-21"),
        ("Joao Monteiro", "Vladimir Samsonov", "2016-02-21"),
        ("Alexander Shibaev", "Bastian Steger", "2016-02-21"),
    ],
    2017: [
        ("Dimitrij Ovtcharov", "Alexander Shibaev", "2017-02-23"),
        ("Dimitrij Ovtcharov", "Kou Lei", "2017-02-22"),
        ("Alexander Shibaev", "Simon Gauzy", "2017-02-22"),
        ("Dimitrij Ovtcharov", "Stefan Fegerl", "2017-02-21"),
        ("Kou Lei", "Andrej Gacina", "2017-02-21"),
        ("Alexander Shibaev", "Tiago Apolonia", "2017-02-21"),
        ("Simon Gauzy", "Timo Boll", "2017-02-21"),
    ],
    2018: [
        ("Timo Boll", "Dimitrij Ovtcharov", "2018-02-23"),
        ("Timo Boll", "Vladimir Samsonov", "2018-02-22"),
        ("Dimitrij Ovtcharov", "Jonathan Groth", "2018-02-22"),
        ("Timo Boll", "Bastian Steger", "2018-02-21"),
        ("Vladimir Samsonov", "Mattias Falck", "2018-02-21"),
        ("Dimitrij Ovtcharov", "Panagiotis Gionis", "2018-02-21"),
        ("Jonathan Groth", "Alexander Shibaev", "2018-02-21"),
        ("Timo Boll", "Stefan Fegerl", "2018-02-20"),
        ("Bastian Steger", "Emmanuel Lebesson", "2018-02-20"),
        ("Vladimir Samsonov", "Kristian Karlsson", "2018-02-20"),
        ("Mattias Falck", "Ruwen Filus", "2018-02-20"),
        ("Dimitrij Ovtcharov", "Lionel Weber", "2018-02-20"),
        ("Panagiotis Gionis", "Kou Lei", "2018-02-20"),
        ("Jonathan Groth", "Tiago Apolonia", "2018-02-20"),
        ("Alexander Shibaev", "Simon Gauzy", "2018-02-20"),
    ],
    2019: [
        ("Dimitrij Ovtcharov", "Vladimir Samsonov", "2019-02-23"),
        ("Dimitrij Ovtcharov", "Timo Boll", "2019-02-22"),
        ("Vladimir Samsonov", "Daniel Habesohn", "2019-02-22"),
        ("Dimitrij Ovtcharov", "Jonathan Groth", "2019-02-21"),
        ("Timo Boll", "Kristian Karlsson", "2019-02-21"),
        ("Vladimir Samsonov", "Panagiotis Gionis", "2019-02-21"),
        ("Daniel Habesohn", "Simon Gauzy", "2019-02-21"),
        ("Dimitrij Ovtcharov", "Kou Lei", "2019-02-20"),
        ("Jonathan Groth", "Lionel Weber", "2019-02-20"),
        ("Timo Boll", "Tiago Apolonia", "2019-02-20"),
        ("Kristian Karlsson", "Emmanuel Lebesson", "2019-02-20"),
        ("Vladimir Samsonov", "Ovidiu Ionescu", "2019-02-20"),
        ("Panagiotis Gionis", "Mattias Falck", "2019-02-20"),
        ("Daniel Habesohn", "Marcos Freitas", "2019-02-20"),
        ("Simon Gauzy", "Liam Pitchford", "2019-02-20"),
    ],
    2020: [
        ("Timo Boll", "Darko Jorgic", "2020-02-23"),
        ("Timo Boll", "Robert Gardos", "2020-02-22"),
        ("Darko Jorgic", "Tomislav Pucar", "2020-02-22"),
        ("Timo Boll", "Liam Pitchford", "2020-02-21"),
        ("Robert Gardos", "Mattias Falck", "2020-02-21"),
        ("Darko Jorgic", "Wang Yang", "2020-02-21"),
        ("Tomislav Pucar", "Marcos Freitas", "2020-02-21"),
        ("Timo Boll", "Kristian Karlsson", "2020-02-20"),
        ("Liam Pitchford", "Lionel Weber", "2020-02-20"),
        ("Robert Gardos", "Jonathan Groth", "2020-02-20"),
        ("Mattias Falck", "Emmanuel Lebesson", "2020-02-20"),
        ("Darko Jorgic", "Vladimir Samsonov", "2020-02-20"),
        ("Wang Yang", "Simon Gauzy", "2020-02-20"),
        ("Tomislav Pucar", "Dimitrij Ovtcharov", "2020-02-20"),
        ("Marcos Freitas", "Daniel Habesohn", "2020-02-20"),
    ],
    2021: [
        ("Patrick Franziska", "Marcos Freitas", "2021-02-23"),
        ("Patrick Franziska", "Mattias Falck", "2021-02-22"),
        ("Marcos Freitas", "Emmanuel Lebesson", "2021-02-22"),
        ("Patrick Franziska", "Ruwen Filus", "2021-02-21"),
        ("Mattias Falck", "Darko Jorgic", "2021-02-21"),
        ("Marcos Freitas", "Simon Gauzy", "2021-02-21"),
        ("Emmanuel Lebesson", "Liam Pitchford", "2021-02-21"),
        ("Patrick Franziska", "Daniel Habesohn", "2021-02-20"),
        ("Ruwen Filus", "Kristian Karlsson", "2021-02-20"),
        ("Mattias Falck", "Wang Yang", "2021-02-20"),
        ("Darko Jorgic", "Andrej Gacina", "2021-02-20"),
        ("Marcos Freitas", "Jonathan Groth", "2021-02-20"),
        ("Simon Gauzy", "Panagiotis Gionis", "2021-02-20"),
        ("Emmanuel Lebesson", "Robert Gardos", "2021-02-20"),
        ("Liam Pitchford", "Tomislav Pucar", "2021-02-20"),
    ],
    2022: [
        ("Darko Jorgic", "Truls Moregardh", "2022-02-23"),
        ("Truls Moregardh", "Timo Boll", "2022-02-22"),
        ("Darko Jorgic", "Patrick Franziska", "2022-02-22"),
        ("Timo Boll", "Wang Yang", "2022-02-21"),
        ("Truls Moregardh", "Kristian Karlsson", "2022-02-21"),
        ("Darko Jorgic", "Daniel Habesohn", "2022-02-21"),
        ("Patrick Franziska", "Panagiotis Gionis", "2022-02-21"),
        ("Timo Boll", "Barish Moullet", "2022-02-20"),
        ("Wang Yang", "Andrej Gacina", "2022-02-20"),
        ("Kristian Karlsson", "Kirill Skachkov", "2022-02-20"),
        ("Truls Moregardh", "Emmanuel Lebesson", "2022-02-20"),
        ("Darko Jorgic", "Jonathan Groth", "2022-02-20"),
        ("Daniel Habesohn", "Simon Gauzy", "2022-02-20"),
        ("Panagiotis Gionis", "Robert Gardos", "2022-02-20"),
        ("Patrick Franziska", "Tomislav Pucar", "2022-02-20"),
    ],
    2023: [
        ("Darko Jorgic", "Dang Qiu", "2023-02-23"),
        ("Dang Qiu", "Liam Pitchford", "2023-02-22"),
        ("Darko Jorgic", "Dimitrij Ovtcharov", "2023-02-22"),
        ("Liam Pitchford", "Truls Moregardh", "2023-02-21"),
        ("Dang Qiu", "Kristian Karlsson", "2023-02-21"),
        ("Dimitrij Ovtcharov", "Andrej Gacina", "2023-02-21"),
        ("Darko Jorgic", "Simon Gauzy", "2023-02-21"),
        ("Truls Moregardh", "Wang Yang", "2023-02-20"),
        ("Liam Pitchford", "Tomislav Pucar", "2023-02-20"),
        ("Kristian Karlsson", "Emmanuel Lebesson", "2023-02-20"),
        ("Dang Qiu", "Marcos Freitas", "2023-02-20"),
        ("Dimitrij Ovtcharov", "Robert Gardos", "2023-02-20"),
        ("Andrej Gacina", "Elias Hardmeier", "2023-02-20"),
        ("Simon Gauzy", "Joao Geraldo", "2023-02-20"),
        ("Darko Jorgic", "Jonathan Groth", "2023-02-20"),
    ],
    2024: [
        ("Darko Jorgic", "Truls Moregardh", "2024-02-23"),
        ("Darko Jorgic", "Marcos Freitas", "2024-02-22"),
        ("Truls Moregardh", "Alexis Lebrun", "2024-02-22"),
        ("Darko Jorgic", "Anton Källberg", "2024-02-21"),
        ("Alexis Lebrun", "Felix Lebrun", "2024-02-21"),
        ("Truls Moregardh", "Dimitrij Ovtcharov", "2024-02-21"),
        ("Marcos Freitas", "Dang Qiu", "2024-02-21"),
        ("Darko Jorgic", "Joao Geraldo", "2024-02-20"),
        ("Alexis Lebrun", "Anders Lind", "2024-02-20"),
        ("Felix Lebrun", "Liam Pitchford", "2024-02-20"),
        ("Truls Moregardh", "Tomislav Pucar", "2024-02-20"),
        ("Dimitrij Ovtcharov", "Alvaro Robles", "2024-02-20"),
        ("Anton Källberg", "Yaroslav Zhmudenko", "2024-02-20"),
        ("Marcos Freitas", "Loic Stoll", "2024-02-20"),
        ("Dang Qiu", "Jonathan Groth", "2024-02-20"),
    ],
    2025: [
        ("Alexis Lebrun", "Darko Jorgic", "2025-02-23"),
        ("Alexis Lebrun", "Patrick Franziska", "2025-02-22"),
        ("Darko Jorgic", "Truls Moregardh", "2025-02-22"),
        ("Patrick Franziska", "Felix Lebrun", "2025-02-21"),
        ("Alexis Lebrun", "Dang Qiu", "2025-02-21"),
        ("Darko Jorgic", "Jonathan Groth", "2025-02-21"),
        ("Truls Moregardh", "Marcos Freitas", "2025-02-21"),
        ("Felix Lebrun", "Benedikt Duda", "2025-02-20"),
        ("Patrick Franziska", "Dimitrij Ovtcharov", "2025-02-20"),
        ("Dang Qiu", "Anton Källberg", "2025-02-20"),
        ("Alexis Lebrun", "Daniel Habesohn", "2025-02-20"),
        ("Darko Jorgic", "Eduard Ionescu", "2025-02-20"),
        ("Jonathan Groth", "Anders Lind", "2025-02-20"),
        ("Marcos Freitas", "Andrej Gacina", "2025-02-20"),
        ("Truls Moregardh", "Alvaro Robles", "2025-02-20"),
    ],
}


def scorelog_path(year):
    return os.path.join(MS_DIR, f"score-log-{year}-wtt.json")


def main():
    print("=" * 60)
    print("Europe Top 16 Cup (MS) 2014-2025 数据录入")
    print("=" * 60)
    total_added = 0
    total_skipped = 0
    new_files = []
    for year in sorted(MATCHES):
        fp = scorelog_path(year)
        existed = os.path.exists(fp)
        if existed:
            with open(fp, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
        else:
            data = []

        existing = set()
        for r in data:
            if r.get("类型") == EVENT_TYPE:
                existing.add((r.get("日期"), r.get("胜者"), r.get("负者")))

        n_added = 0
        n_skipped = 0
        for w_raw, l_raw, date in MATCHES[year]:
            w = NAME_MAP[w_raw]
            l = NAME_MAP[l_raw]
            key = (date, w, l)
            if key in existing:
                n_skipped += 1
                print(f"    SKIP existing: {w} | {l}")
                continue
            data.append({"日期": date, "类型": EVENT_TYPE, "胜者": w, "负者": l})
            existing.add(key)
            n_added += 1

        with open(fp, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")

        if not existed:
            new_files.append(f"score-log-{year}-wtt.json")
        total_added += n_added
        total_skipped += n_skipped
        print(f"  {year}: {n_added} added, {n_skipped} skipped (total: {len(data)})")

    # 登记新增年度文件到 manifest.json
    if new_files:
        mfp = os.path.join(MS_DIR, "manifest.json")
        with open(mfp, "r", encoding="utf-8-sig") as f:
            manifest = json.load(f)
        files = manifest.get("scoreFiles", [])
        for nf in new_files:
            if nf not in files:
                files.append(nf)
        files.sort()
        manifest["scoreFiles"] = files
        with open(mfp, "w", encoding="utf-8", newline="\n") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"  manifest.json: added {len(new_files)} new file(s)")

    print(f"  TOTAL: {total_added} added, {total_skipped} skipped")


if __name__ == "__main__":
    main()