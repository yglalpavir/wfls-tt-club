"""最终名称修正 - 一步到位格式化"""
import json, re
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "ittf_data"
RAW_DIR = DATA_DIR / "_raw"

# 已知东亚姓氏
ASIAN = {
    "WANG","ZHANG","LI","LIU","CHEN","YANG","HUANG","ZHAO","WU","ZHOU","XU",
    "SUN","MA","ZHU","HU","GUO","HE","GAO","LIN","LUO","LIANG","SONG","ZHENG",
    "XIE","HAN","TANG","FENG","YU","DONG","XIAO","CHENG","CAO","YUAN","DENG",
    "FU","SHEN","ZENG","PENG","LV","SU","JIANG","CAI","JIA","DING","WEI","XUE",
    "YE","YAN","PAN","DU","DAI","XIA","ZHONG","TIAN","REN","FAN","FANG","SHI",
    "YAO","TAN","LIAO","ZOU","XIONG","JIN","LU","HAO","KONG","BAI","CUI","KANG",
    "MAO","QIU","QIN","GU","HOU","SHAO","MENG","LONG","WAN","DUAN","LEI","QIAN",
    "YIN","YI","CHANG","QIAO","LAI","GONG","WEN","NG","CHAN","CHEUNG",
    "CHENG","CHIU","CHOW","CHU","FONG","HO","HUI","KWAN","LAM","LAU","LEE",
    "LEUNG","POON","TAM","TANG","TSANG","YIP","YUEN","CHUANG","HSU","TSAI",
    "KIM","PARK","CHOI","JUNG","KANG","CHO","YOON","JANG","LIM","OH","SHIN",
    "SEO","KWON","HWANG","AHN","JEON","HONG","YOO","JOO","RYU","NAM","BAEK",
    "MOON","CHA","HEO","JEONG","KO","SATO","SUZUKI","TAKAHASHI","TANAKA",
    "ITO","YAMAMOTO","NAKAMURA","KOBAYASHI","KATO","YOSHIDA","YAMADA","SASAKI",
    "YAMAGUCHI","MATSUMOTO","INOUE","KIMURA","HAYASHI","SHIMIZU","SAITO","MORI",
    "IKEDA","HASHIMOTO","ABE","OGURA","ISHIKAWA","MAEDA","FUJITA","OKADA",
    "GOTO","HASEGAWA","MURAKAMI","KONDO","ISHII","UCHIDA","SAKAMOTO","OTA",
    "HARIMOTO","MATSUSHIMA","NIWA","MIZUTANI","HIRANO","FUKUHARA","KISHIKAWA",
    "MATSUDAIRA","OSHIMA","MORIZONO","YOSHIMURA","UEDA","TSUBOI",
    "NGUYEN","TRAN","PHAM","HOANG","HUYNH","PHAN","VU","VO","DANG","BUI","DO",
    "NGO","DUONG","LY","WATANABE","WONG",
    # Korean extended
    "JOO","JIN","SHIN","JANG","SEOK",
}

def is_asian_surname(word):
    return word.upper() in ASIAN

def extract_map():
    """从 raw wikitext 提取名称映射短名→全名。"""
    nmap = {}
    for wf in sorted(RAW_DIR.glob("*.wiki")):
        wt = wf.read_text(encoding="utf-8")
        for m in re.finditer(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', wt):
            full = m.group(1).strip()
            short = (m.group(2) or full).strip()
            full = re.sub(r'\([^)]*\)','',full).strip()
            full = full.split("(")[0].strip()
            if len(short)>=3 and len(full)>=4 and short.lower()!=full.lower():
                if short not in nmap or len(full)>len(nmap[short]):
                    nmap[short] = full
    return nmap

def format_full_name(full_name):
    """格式化全名：检测姓氏位置并大写。
    返回 (formatted, is_asian)
    """
    parts = full_name.strip().split()
    if len(parts) < 2:
        return full_name.strip(), False

    # 检测: 如果第一个词是东亚姓氏 → 姓在前
    if is_asian_surname(parts[0]):
        return f"{parts[0].upper()} {' '.join(parts[1:])}", True

    # 如果最后一个词是东亚姓氏 → 姓在后
    if is_asian_surname(parts[-1]):
        return f"{' '.join(parts[:-1])} {parts[-1].upper()}", True

    # 西方名字: 最后一个词是姓氏
    *given, surname = parts
    return f"{' '.join(given)} {surname.upper()}", False

def format_name(short_name, nmap):
    """根据短名查找全名并格式化。支持双打名（/分隔）。"""
    if "/" in short_name:
        return " / ".join(format_name(p.strip(), nmap) for p in short_name.split("/"))

    full = nmap.get(short_name, short_name)
    formatted, _ = format_full_name(full)
    return formatted

def main():
    nmap = extract_map()
    print(f"名称映射: {len(nmap)} 条\n")

    for cat_dir in sorted(DATA_DIR.glob("*")):
        if not cat_dir.is_dir() or cat_dir.name.startswith("_"): continue
        sf = cat_dir / "score-log.json"
        if not sf.exists(): continue

        records = json.loads(sf.read_text(encoding="utf-8"))
        fixed = 0
        for r in records:
            if r.get("数据来源") != "Wikipedia": continue
            ow, ol = r["胜者"], r["负者"]
            nw = format_name(ow, nmap)
            nl = format_name(ol, nmap)
            if nw != ow or nl != ol:
                r["胜者"], r["负者"] = nw, nl
                fixed += 1

        sf.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {cat_dir.name}: {fixed}/{len(records)} 修正")

        if records:
            r = records[len(records)//2]
            print(f"    样例: {r['胜者']} vs {r['负者']}")

if __name__ == "__main__":
    main()
