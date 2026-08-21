#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入 2015 年 ITTF 赛事数据（MS/WS/MD/WD/XD）。

覆盖 16 站：
- 6 站 Pro Tour Super Series → ittf白金赛（1.15）：
    Kuwait、Qatar、German Bremen、Japan Kobe、Korea Incheon、China Open Chengdu
- 5 站 Pro Tour Major Series → ittf常规赛（0.48）：
    Spanish Almeria、Czech Olomouc、Austrian Wels、Polish Warsaw、Swedish Stockholm
- Pro Tour Grand Finals Lisbon 2015（总决赛，4 天）
- Men's World Cup Halmstad 2015 / Women's World Cup Sendai 2015（世界杯，各 3 天）
- Team World Cup Dubai 2015（世界杯团体，4 天；MT/WT 单打 → ms/ws，团队双打 → md/wd）
- World Table Tennis Championships Suzhou 2015（世乒赛，8 天，含 XD）

姓名规范化规则（遵循 wtt_data/player-name-format.md）：同 2013/2014 导入。
U21MS/U21WS 按用户要求一并导入 ms/ws（与正式单打同模板、同事件类型）。
数据已知问题（按要求忽略数量差，畸形行跳过）：
- Team World Cup 个别未赛行（Result 0 - 0 且无胜者），自动跳过
- KIM Minhee (YOB=1991) (KOR)：保留后缀为 "KIM Minhee (1991)"
- CHOE Hyon Hwa (1992) (PRK)：DB 无同名球员，按默认规则剥离年份后缀
- 现有 2015 ms 已有 7 条洲杯赛记录（02-21~23），按 (日期,类型,胜者,负者) 去重追加

用法：python tools/import_2015.py
"""
import json
import os
import re
from datetime import date, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
RAW_DIR = os.path.join(os.path.dirname(BASE_DIR), "docs", "result_ittf_link", "2015")

EVENTS = {
    "Team World Cup Dubai 2015":                   ("世界杯团体", "2015-01-08", "teamwc4"),
    "GAC Group World Tour Kuwait Open Kuwait City 2015": ("ittf白金赛", "2015-02-11", "pro5"),
    "GAC Group World Tour Qatar Open Doha 2015":   ("ittf白金赛", "2015-02-17", "pro6"),
    "GAC Group World Tour German Open Bremen 2015": ("ittf白金赛", "2015-03-18", "pro5"),
    "GAC Group World Tour Spanish Open Almeria 2015": ("ittf常规赛", "2015-03-25", "pro5"),
    "World Table Tennis Championships Suzhou 2015": ("世乒赛",     "2015-04-26", "wttc8"),
    "GAC Group World Tour Japan Open Kobe 2015":   ("ittf白金赛", "2015-06-24", "pro5"),
    "GAC Group World Tour Korea Open Incheon 2015": ("ittf白金赛", "2015-07-01", "pro5"),
    "GAC Group World Tour China Open Chengdu 2015": ("ittf白金赛", "2015-08-05", "pro5"),
    "GAC Group World Tour Czech Open Olomouc 2015": ("ittf常规赛", "2015-08-26", "pro5"),
    "GAC Group World Tour Austrian Open Wels 2015": ("ittf常规赛", "2015-09-02", "pro5"),
    "Men's World Cup Halmstad 2015":               ("世界杯",     "2015-10-16", "wc3"),
    "GAC Group World Tour Polish Open Warsaw 2015": ("ittf常规赛", "2015-10-21", "pro5"),
    "Women's World Cup Sendai 2015":               ("世界杯",     "2015-10-30", "wc3"),
    "GAC Group World Tour Swedish Open Stockholm 2015": ("ittf常规赛", "2015-11-11", "pro5"),
    "GAC Group World Tour Grand Finals Lisbon 2015": ("总决赛",   "2015-12-10", "grandfinals4"),
}

# 赛程模板：round/stage -> 距开赛天数偏移
TEMPLATES = {
    "pro5": {"Qualification": 0, "R64": 1, "R32": 1, "R16": 2,
             "QuarterFinal": 2, "SemiFinal": 3, "Final": 4},
    "pro6": {"Qualification": 0, "R64": 1, "R32": 2, "R16": 3,
             "QuarterFinal": 4, "SemiFinal": 5, "Final": 5},
    "grandfinals4": {"R32": 0, "R16": 1, "QuarterFinal": 2,
                     "SemiFinal": 3, "Final": 3},
    "wc3": {"Qualification": 0, "R16": 1, "QuarterFinal": 1,
            "SemiFinal": 2, "Position Draw": 2, "Final": 2},
    "teamwc4": {"Qualification": 0, "Main Draw": 3},
    "wttc8": {"Qualification": 0, "R128": 1, "R64": 2, "R32": 3, "R16": 4,
              "QuarterFinal": 5, "SemiFinal": 6, "Final": 7},
}

CN_SURNAMES = set("""AO BAI BAO BI BIAN BO BU CAI CAO CEN CHAI CHAN CHANG CHAO CHE CHEN CHENG CHI CHONG CHOU CHU CHUA CHUAN CHUI CHUN CUI CUN DAI DAN DANG DAO DE DENG DI DIAO DING DONG DOU DU DUAN DUANMU DUN E FAN FANG FEI FENG FO FU GAN GAO GE GENG GONG GOU GU GUAN GUANG GUI GUO HA HAI HAN HANG HAO HE HEI HENG HONG HOU HU HUA HUAI HUAN HUANG HUI HUO JI JIA JIAN JIANG JIAO JIE JIN JING JIU JU KANG KE KONG KOU KUANG KUI KUO LAI LAN LANG LAO LE LEI LENG LI LIAN LIANG LIAO LIE LIN LING LIU LONG LOU LU LUAN LUO LV MA MAI MAN MAO MEI MENG MI MIAO MIN MING MO MU NAN NIE NIU OU PAN PANG PAO PEI PENG PI PIAO PING PO PU QI QIA QIAN QIANG QIAO QIE QIN QING QIU QU QUAN QUE RAN RAO REN RONG RU RUAN RUI SA SAI SAN SANG SE SEN SENG SHA SHAN SHANG SHAO SHE SHEN SHENG SHI SHOU SHU SHUAI SHUI SHUN SI SONG SU SUI SUN SUO TA TAI TAN TANG TAO TENG TI TIAN TIE TING TONG TU TUAN TUN TUO WA WAI WAN WANG WEI WEN WENG WO WU XI XIA XIAN XIANG XIAO XIE XIN XING XIONG XIU XU XUAN XUE XUN YA YAN YANG YAO YE YI YIN YING YONG YOU YU YUAN YUE YUN ZA ZAI ZAN ZANG ZAO ZE ZENG ZHA ZHAN ZHANG ZHAO ZHE ZHEN ZHENG ZHI ZHONG ZHOU ZHU ZHUANG ZHUO ZI ZONG ZOU ZU ZUO""".split())

KEEP_CN_COUNTRY = {"CHN", "HKG", "TPE", "MAC", "KOR", "PRK", "SGP"}

OVERRIDES = {
    "SCHOPP Jie": "SCHOPP Jie",      # 德国华裔，既有 DB 用原文
    "LANG Kristin": "Kristin LANG",  # 德国球员（LANG 非中文姓）
    "NI Xia Lian": "Xia Lian NI",    # 卢森堡华裔，既有 DB 用欧洲格式
    "LI Qian": "Qian LI",            # 波兰华裔，既有 DB 用欧洲格式
    "XU Jie (1979)": "XU Jie (1979)",  # 威尔士球员，与波兰 XU Jie 为不同球员，保留后缀区分
    "KIM Minhee (YOB=1991)": "KIM Minhee (1991)",  # 与 2005 的 KIM Minhee (YOB=1985) 不同
    "CHEN Szu-YU": "CHEN Szu-Yu",    # 台湾球员，胜者格大写 U，统一为既有 DB 写法
}


def strip_suffix(name):
    return re.sub(r" \((?:II|\d{4}|YOB=\d{4})\)$", "", name)


def auto_std(raw, code):
    if raw in OVERRIDES:
        return OVERRIDES[raw]
    raw = strip_suffix(raw)
    if raw in OVERRIDES:
        return OVERRIDES[raw]
    if code in KEEP_CN_COUNTRY:
        return raw
    parts = raw.split()
    if not parts:
        return raw
    if code == "JPN":
        return " ".join([parts[-1]] + parts[:-1])
    if parts[0] in CN_SURNAMES:
        return raw
    return " ".join([parts[-1]] + parts[:-1])


def build_name_map():
    """从原始文件收集 (raw, country)，生成 raw -> std 映射。"""
    mapping = {}
    for fname in sorted(os.listdir(RAW_DIR)):
        if not fname.endswith(".txt"):
            continue
        with open(os.path.join(RAW_DIR, fname), encoding="utf-8-sig") as f:
            for line in f:
                cols = [c.strip() for c in line.split("\t")]
                if len(cols) < 5 or not re.match(r"^\d{4}$", cols[0]):
                    continue
                for c in (cols[2], cols[4]):
                    m = re.match(r"^(.*?) \(([A-Z]{3})\)$", c)
                    if m:
                        mapping[m.group(1)] = auto_std(m.group(1), m.group(2))
                if len(cols) >= 6:
                    for c in (cols[3], cols[5]):
                        m = re.match(r"^(.*?) \(([A-Z]{3})\)$", c)
                        if m:
                            mapping[m.group(1)] = auto_std(m.group(1), m.group(2))
    return mapping


NAME_MAP = build_name_map()


def match_date(event, stage, round_, sub):
    etype, start, tmpl = EVENTS[event]
    t = TEMPLATES[tmpl]
    if stage == "Qualification":
        offset = 0
    elif stage in t:
        offset = t[stage]
    else:
        offset = t.get(round_, 0)
    return (date.fromisoformat(start) + timedelta(days=offset)).isoformat()


def extract_name(raw):
    m = re.match(r"^(.*?) \(([A-Z]{3})\)$", raw)
    return m.group(1) if m else raw


def parse_event(fname):
    """解析单个原始文件，返回 records dict: ms/ws/md/wd/xd -> [(date,type,w,l), ...]"""
    records = {"ms": [], "ws": [], "md": [], "wd": [], "xd": []}
    missing = []
    with open(os.path.join(RAW_DIR, fname), encoding="utf-8-sig") as f:
        raw_lines = [l.rstrip("\n") for l in f]

    lines = []
    i = 0
    while i < len(raw_lines):
        l = raw_lines[i].strip()
        if not l:
            i += 1
            continue
        cols = [c.strip() for c in l.split("\t")]
        if cols and cols[-1] in ("MS", "WS", "MD", "WD", "XD", "U21MS", "U21WS", "MT", "WT") and len(cols) < 8 and i + 1 < len(raw_lines):
            nxt = raw_lines[i + 1].strip()
            if nxt:
                lines.append(l + "\t" + nxt)
                i += 2
                continue
        lines.append(l)
        i += 1

    for line in lines:
        cols = [c.strip() for c in line.split("\t")]
        if len(cols) < 10 or not re.match(r"^\d{4}$", cols[0]):
            continue
        event = cols[1]
        if event not in EVENTS:
            continue
        etype, _, _ = EVENTS[event]
        sub = cols[6]
        stage = cols[7]
        round_ = cols[8]
        d = match_date(event, stage, round_, sub)

        def lookup(raw):
            if not raw:
                return None
            if raw in OVERRIDES:
                return OVERRIDES[raw]
            if raw in NAME_MAP:
                return NAME_MAP[raw]
            stripped = strip_suffix(raw)
            if stripped in OVERRIDES:
                return OVERRIDES[stripped]
            if stripped in NAME_MAP:
                return NAME_MAP[stripped]
            missing.append(f"{event} | {raw} 无标准名")
            return None

        if sub in ("MS", "WS", "U21MS", "U21WS"):
            if len(cols) < 12:
                missing.append(f"{event} | 单打列数不足: {line[:80]}")
                continue
            pa = extract_name(cols[2])
            px = extract_name(cols[4])
            pw = extract_name(cols[11])
            na, nx, nw = lookup(pa), lookup(px), lookup(pw)
            if not (na and nx and nw):
                continue
            if nw == na:
                w, l = na, nx
            elif nw == nx:
                w, l = nx, na
            else:
                missing.append(f"{event} | 胜者不匹配: {pa} vs {px} -> {pw}")
                continue
            key = "ms" if sub in ("MS", "U21MS") else "ws"
            records[key].append((d, etype, w, l))
        elif sub in ("MT", "WT"):
            # 团体赛：单打 -> ms/ws；双打（有 Player B/Y）-> md/wd
            if len(cols) < 12:
                missing.append(f"{event} | 团体行列数不足: {line[:80]}")
                continue
            is_double = bool(cols[3] and cols[5])
            if is_double:
                na = lookup(extract_name(cols[2]))
                nb = lookup(extract_name(cols[3]))
                nx = lookup(extract_name(cols[4]))
                ny = lookup(extract_name(cols[5]))
                w1 = lookup(extract_name(cols[11]))
                w2 = lookup(extract_name(cols[12])) if len(cols) > 12 else None
                if not all((na, nb, nx, ny, w1)):
                    continue
                if len({na, nb, nx, ny}) < 4:
                    missing.append(f"{event} | 团队双打双方含重复球员（数据错误）: {line[:100]}")
                    continue
                if not w2:
                    if w1 in {na, nb}:
                        w_pair, l_pair = [na, nb], [nx, ny]
                    elif w1 in {nx, ny}:
                        w_pair, l_pair = [nx, ny], [na, nb]
                    else:
                        missing.append(f"{event} | 团队双打仅一个胜者且无法归属: {line[:100]}")
                        continue
                elif w1 == w2:
                    missing.append(f"{event} | 团队双打胜者为同一人（数据错误）: {line[:100]}")
                    continue
                else:
                    win_set = {w1, w2}
                    if win_set == {na, nb}:
                        w_pair = [na, nb]
                        l_pair = [nx, ny]
                    elif win_set == {nx, ny}:
                        w_pair = [nx, ny]
                        l_pair = [na, nb]
                    else:
                        missing.append(f"{event} | 团队双打胜者不匹配: "
                                       f"{cols[2]} {cols[3]} vs {cols[4]} {cols[5]} -> {cols[11]} {cols[12]}")
                        continue
                w_pair = sorted(w_pair)
                l_pair = sorted(l_pair)
                key = "md" if sub == "MT" else "wd"
                records[key].append((d, etype, "/".join(w_pair), "/".join(l_pair)))
            else:
                pa = extract_name(cols[2])
                px = extract_name(cols[4])
                pw = extract_name(cols[11])
                na, nx, nw = lookup(pa), lookup(px), lookup(pw)
                if not (na and nx and nw):
                    continue
                if nw == na:
                    w, l = na, nx
                elif nw == nx:
                    w, l = nx, na
                else:
                    missing.append(f"{event} | 胜者不匹配: {pa} vs {px} -> {pw}")
                    continue
                key = "ms" if sub == "MT" else "ws"
                records[key].append((d, etype, w, l))
        elif sub in ("MD", "WD", "XD"):
            if len(cols) < 12:
                missing.append(f"{event} | 双打列数不足: {line[:80]}")
                continue
            na = lookup(extract_name(cols[2]))
            nb = lookup(extract_name(cols[3]))
            nx = lookup(extract_name(cols[4]))
            ny = lookup(extract_name(cols[5]))
            w1 = lookup(extract_name(cols[11]))
            w2 = lookup(extract_name(cols[12])) if len(cols) > 12 else None
            if not all((na, nb, nx, ny, w1)):
                continue
            if len({na, nb, nx, ny}) < 4:
                missing.append(f"{event} | 双打双方含重复球员（数据错误）: {line[:100]}")
                continue
            if not w2:
                if w1 in {na, nb}:
                    w_pair, l_pair = [na, nb], [nx, ny]
                elif w1 in {nx, ny}:
                    w_pair, l_pair = [nx, ny], [na, nb]
                else:
                    missing.append(f"{event} | 双打仅一个胜者且无法归属: {line[:100]}")
                    continue
            elif w1 == w2:
                missing.append(f"{event} | 双打胜者为同一人（数据错误）: {line[:100]}")
                continue
            else:
                win_set = {w1, w2}
                if win_set == {na, nb}:
                    w_pair = [na, nb]
                    l_pair = [nx, ny]
                elif win_set == {nx, ny}:
                    w_pair = [nx, ny]
                    l_pair = [na, nb]
                else:
                    missing.append(f"{event} | 双打胜者不匹配: "
                                   f"{cols[2]} {cols[3]} vs {cols[4]} {cols[5]} -> {cols[11]} {cols[12]}")
                    continue
            key = sub.lower()
            if sub != "XD":
                w_pair = sorted(w_pair)
                l_pair = sorted(l_pair)
            records[key].append((d, etype, "/".join(w_pair), "/".join(l_pair)))
    return records, missing


def append_to_scorelog(cat, records):
    if cat == "ws":
        filename = "score-log-2015-ws.json"
    else:
        filename = "score-log-2015-wtt.json"
    filepath = os.path.join(WTT_DIR, cat, filename)
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8-sig") as f:
            existing = json.load(f)
    else:
        existing = []
    existing_keys = set((r["日期"], r["类型"], r["胜者"], r["负者"]) for r in existing)
    new_records = []
    for date_, etype, winner, loser in records:
        key = (date_, etype, winner, loser)
        if key not in existing_keys:
            new_records.append({"日期": date_, "类型": etype, "胜者": winner, "负者": loser})
            existing_keys.add(key)
    all_records = existing + new_records
    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  {cat.upper()}: {len(new_records)} new (total {len(all_records)})")
    return len(new_records)


def register_manifest(cat, filename):
    path = os.path.join(WTT_DIR, cat, "manifest.json")
    with open(path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    files = data.get("scoreFiles", [])
    moved = filename in files
    if moved:
        files.remove(filename)
    files.insert(0, filename)
    data["scoreFiles"] = files
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  manifest[{cat}] {filename} 已置于首位")


def main():
    totals = {"ms": 0, "ws": 0, "md": 0, "wd": 0, "xd": 0}
    all_missing = []
    for fname in sorted(os.listdir(RAW_DIR)):
        if not fname.endswith(".txt"):
            continue
        print(f"== {fname}")
        records, missing = parse_event(fname)
        for cat in ("ms", "ws", "md", "wd", "xd"):
            n = append_to_scorelog(cat, records[cat])
            totals[cat] += n
        if missing:
            all_missing.extend(missing)
    print("\n=== 汇总 ===")
    print(f"  MS={totals['ms']}  WS={totals['ws']}  MD={totals['md']}  WD={totals['wd']}  XD={totals['xd']}")
    if all_missing:
        print("  [missing]")
        for m in sorted(set(all_missing)):
            print("    ", m)
    else:
        print("  无缺失名字/无胜者不匹配")

    for cat in ("ms", "ws", "md", "wd", "xd"):
        fn = "score-log-2015-ws.json" if cat == "ws" else "score-log-2015-wtt.json"
        register_manifest(cat, fn)


if __name__ == "__main__":
    main()