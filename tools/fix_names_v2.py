"""改进名称格式化：东亚名字姓在前大写，西方名字姓（最后一个词）大写"""
import json, re
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "ittf_data"

# 常见东亚姓氏（用于判断是否为东亚名字）
EAST_ASIAN_SURNAMES = {
    # Chinese
    "WANG","ZHANG","LI","LIU","CHEN","YANG","HUANG","ZHAO","WU","ZHOU",
    "XU","SUN","MA","ZHU","HU","GUO","HE","GAO","LIN","LUO","LIANG",
    "SONG","ZHENG","XIE","HAN","TANG","FENG","YU","DONG","XIAO","CHENG",
    "CAO","YUAN","DENG","XU","FU","SHEN","ZENG","PENG","LV","SU",
    "JIANG","CAI","JIA","DING","WEI","XUE","YE","YAN","PAN","DU",
    "DAI","XIA","ZHONG","WANG","TIAN","REN","JIANG","FAN","FANG","SHI",
    "YAO","TAN","LIAO","ZOU","XIONG","JIN","LU","HAO","KONG","BAI",
    "CUI","KANG","MAO","QIU","QIN","JIANG","SHI","GU","HOU","SHAO",
    "MENG","LONG","WAN","DUAN","LEI","QIAN","TANG","YIN","LI","YI",
    "CHANG","WU","QIAO","HE","LAI","GONG","WEN","HUNG","NG","CHAN",
    "CHEUNG","CHENG","CHIU","CHOW","CHU","FONG","HO","HUI","KWAN",
    "LAM","LAU","LEE","LEUNG","NG","POON","TAM","TANG","TSANG","WONG",
    "YIP","YUEN","YAN","YAU","CHUANG","HSU","TSAI","CHANG","HO",
    # Korean
    "KIM","LEE","PARK","CHOI","JUNG","KANG","CHO","YOON","JANG","LIM",
    "HAN","OH","SHIN","SEO","KWON","HWANG","AHN","SONG","JEON","HONG",
    "YOO","JOO","RYU","NAM","BAEK","MOON","CHA","HEO","JEONG","KO",
    # Japanese
    "SATO","SUZUKI","TAKAHASHI","TANAKA","WATANABE","ITO","YAMAMOTO",
    "NAKAMURA","KOBAYASHI","KATO","YOSHIDA","YAMADA","SASAKI","YAMAGUCHI",
    "MATSUMOTO","INOUE","KIMURA","HAYASHI","SHIMIZU","SAITO","MORI",
    "IKEDA","HASHIMOTO","ABE","MORITA","OGURA","ISHIKAWA","MAEDA",
    "FUJITA","OKADA","GOTO","HASEGAWA","MURAKAMI","KONDO","ISHII",
    "UCHIDA","SAKAMOTO","OTA","HARIMOTO","MATSUSHIMA","NIWA","MIZUTANI",
    "HIRANO","FUKUHARA","KISHIKAWA","MATSUDAIRA","OSHIMA","MORIZONO",
    "YOSHIMURA","UEDA","TSUBOI","MATUDARIA",
    # Others (Vietnamese etc)
    "NGUYEN","TRAN","LE","PHAM","HOANG","HUYNH","PHAN","VU","VO",
    "DANG","BUI","DO","HO","NGO","DUONG","LY",
}

def is_east_asian(name_parts):
    """判断是否为东亚名字。"""
    if len(name_parts) != 2:
        return False
    # 检查第一部分是否像东亚姓氏
    p0 = name_parts[0].upper()
    if p0 in EAST_ASIAN_SURNAMES:
        return True
    # 第一部分很短且是大写
    if len(name_parts[0]) <= 3 and name_parts[0].isupper():
        return True
    return False

def format_name(name):
    """改进的名称格式化。
    东亚名字: WANG Hao (姓在前大写)
    西方名字: Timo BOLL (姓在后大写)
    """
    if "/" in name:
        return " / ".join(format_name(p.strip()) for p in name.split("/"))

    parts = name.strip().split()
    if len(parts) < 2:
        return name.strip()

    if is_east_asian(parts):
        # Surname first: WANG Hao
        return f"{parts[0].upper()} {' '.join(parts[1:])}"
    else:
        # Surname last: Timo BOLL
        *given, surname = parts
        return f"{' '.join(given)} {surname.upper()}"

def main():
    for cat_dir in sorted(DATA_DIR.glob("*")):
        if not cat_dir.is_dir() or cat_dir.name.startswith("_"): continue
        sf = cat_dir / "score-log.json"
        if not sf.exists(): continue

        records = json.loads(sf.read_text(encoding="utf-8"))
        fixed = 0
        for r in records:
            ow, ol = r["胜者"], r["负者"]
            nw = format_name(ow)
            nl = format_name(ol)
            if nw != ow or nl != ol:
                r["胜者"], r["负者"] = nw, nl
                fixed += 1

        sf.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {cat_dir.name}: 再修正 {fixed}/{len(records)} 条")

        # 打印样例
        if records:
            east = [r for r in records if r["胜者"].split()[0].isupper() and len(r["胜者"].split())==2]
            west = [r for r in records if not r["胜者"].split()[0].isupper() or len(r["胜者"].split())>2]
            if east:
                print(f"    东亚样例: {east[0]['胜者']} vs {east[0]['负者']}")
            if west:
                print(f"    西方样例: {west[0]['胜者']} vs {west[0]['负者']}")

if __name__ == "__main__":
    main()
