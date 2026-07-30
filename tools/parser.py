import json
import os
import re
from tqdm import tqdm


INPUT_DIR = "tleague_data"
OUTPUT = "tleague_matches.json"



def clean_name(name):

    name = name.strip()

    # 去掉一些乱码
    name = name.replace(
        "??",
        ""
    )

    return name



def extract_basic(text):

    data={}


    # 日期

    m=re.search(
        r"(20\d\d)年(\d+)月(\d+)日",
        text
    )

    if m:

        data["date"]=(
            f"{m.group(1)}-"
            f"{int(m.group(2)):02d}-"
            f"{int(m.group(3)):02d}"
        )


    # 场馆

    if data.get("date"):

        after=text.split(
            data["date"].replace("-","年",1)
        )


    return data



def extract_teams(lines):

    """
    找球队

    规则:
    日期后面两个非数字字符串
    """

    ignore=[
        "WIN",
        "MEN",
        "WOMEN"
    ]


    teams=[]


    for line in lines:

        if (
            len(line)>2
            and line not in ignore
            and not re.search(
                r"\d",
                line
            )
        ):

            if (
                "ポート" in line
                or "彩たま" in line
                or "東京" in line
                or "アスティーダ" in line
                or "リベッツ" in line
            ):
                teams.append(line)


    return list(dict.fromkeys(teams))[:2]



def parse_games(text):

    games=[]


    pattern=re.compile(
        r"第(\d)マッチ"
        r"(.*?)(?=第\dマッチ|ベンチ入り選手)",
        re.S
    )


    matches=pattern.findall(text)


    for number,block in matches:


        lines=[
            x.strip()
            for x in block.split("\n")
            if x.strip()
        ]


        # 删除游戏描述
        lines=[
            x for x in lines
            if x!="WIN"
        ]


        scores=re.findall(
            r"\d+\s*-\s*\d+",
            block
        )


        players=[]


        for line in lines:

            if (
                len(line)<=10
                and not re.search(
                    r"\d",
                    line
                )
                and "-" not in line
            ):
                players.append(
                    clean_name(line)
                )


        # 去重
        players=list(
            dict.fromkeys(players)
        )


        game={

            "number":int(number),

            "sets":scores,

            "players":players,

        }


        games.append(game)


    return games



def parse_file(path):

    with open(
        path,
        encoding="utf8"
    ) as f:

        raw=json.load(f)


    text=raw["raw_text"]


    lines=[
        x.strip()
        for x in text.split("\n")
        if x.strip()
    ]


    result={

        "match_id":
            raw["id"],

        "date":
            None,

        "teams":
            extract_teams(lines),

        "games":
            parse_games(text)

    }


    m=re.search(
        r"(20\d\d)年(\d+)月(\d+)日",
        text
    )


    if m:
        result["date"]=(
            f"{m.group(1)}-"
            f"{int(m.group(2)):02d}-"
            f"{int(m.group(3)):02d}"
        )


    return result




def main():

    results=[]


    files=[
        f for f in os.listdir(INPUT_DIR)
        if f.endswith(".json")
    ]


    for f in tqdm(files):

        try:

            results.append(
                parse_file(
                    os.path.join(
                        INPUT_DIR,
                        f
                    )
                )
            )

        except Exception as e:

            print(
                f,
                e
            )


    with open(
        OUTPUT,
        "w",
        encoding="utf8"
    ) as f:

        json.dump(
            results,
            f,
            ensure_ascii=False,
            indent=2
        )



if __name__=="__main__":
    main()