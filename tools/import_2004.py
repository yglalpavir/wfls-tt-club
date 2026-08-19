#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导入 2004 年 ITTF 赛事数据（MS/WS/MD/WD）。

覆盖 19 站：
- 15 站 Pro Tour 公开赛（ittf公开赛）：Brazilian、Chile、China Open Wuxi、Croatia、
  Danish、Egypt、German Leipzig、Greece Athens、Japan Kobe、Korean、Polish、
  Singapore、St. Petersburg、US Open Chicago、Volkswagen China Open Changchun
- Pro Tour Grand Finals Beijing 2004（总决赛，3 天）
- Men's and Women's World Cup Hangzhou 2004（世界杯，5 天）
- Olympic Games Athens 2004（奥运会，10 天）
- World Team Table Tennis Championships Doha 2004（世乒赛团体，7 天，MT/WT 映射为 ms/ws）

姓名规范化规则（遵循 wtt_data/player-name-format.md）：同 2003 导入。
数据已知问题（按要求忽略数量差，畸形行跳过）：
- 部分双打行缺一名球员/搭档（Egypt、St. Petersburg、Brazil、US Open、Wuxi、German、Greece），跳过
- 世界杯 2004 决赛行缺失（源数据截断至半决赛），按现有数据导入
- PARK Kyungae (I) 与 (II) 为不同球员，保留后缀区分

用法：python tools/import_2004.py
"""
import json
import os
import re
from datetime import date, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WTT_DIR = os.path.join(os.path.dirname(BASE_DIR), "wtt_data")
RAW_DIR = os.path.join(os.path.dirname(BASE_DIR), "docs", "result_ittf_link", "2004")

EVENTS = {
    "Brazilian Open Rio de Janeiro 2004":      ("ittf公开赛", "2004-06-24", "pro4"),
    "Chile Open Santiago 2004":                ("ittf公开赛", "2004-06-16", "pro5"),
    "China Open Wuxi 2004":                    ("ittf公开赛", "2004-09-09", "pro4"),
    "Croatia Open Croatia 2004":               ("ittf公开赛", "2004-01-22", "pro4"),
    "Danish Open Aarhus 2004":                 ("ittf公开赛", "2004-10-21", "pro4"),
    "Egypt Open Cairo 2004":                   ("ittf公开赛", "2004-05-04", "pro4"),
    "German Open Leipzig 2004":                ("ittf公开赛", "2004-11-11", "pro4"),
    "Greece Open Athens 2004":                 ("ittf公开赛", "2004-01-29", "pro4"),
    "Japan Open Kobe 2004":                    ("ittf公开赛", "2004-09-23", "pro4"),
    "Korean Open Pyeong Chang 2004":           ("ittf公开赛", "2004-05-20", "pro4"),
    "Polish Open Warsaw 2004":                 ("ittf公开赛", "2004-10-14", "pro4"),
    "Singapore Open 2004":                     ("ittf公开赛", "2004-05-27", "pro4"),
    "St. Petersburg Open 2004":                ("ittf公开赛", "2004-11-25", "pro4"),
    "US Open Chicago 2004":                    ("ittf公开赛", "2004-06-30", "pro4"),
    "Volkswagen China Open Changchun 2004":    ("ittf公开赛", "2004-09-16", "pro4"),
    "Pro Tour Grand Finals Beijing 2004":      ("总决赛",     "2004-12-10", "grandfinals3"),
    "Men's and Women's World Cup Hangzhou 2004": ("世界杯",   "2004-10-27", "wcup"),
    "Olympic Games Athens 2004":               ("奥运会",     "2004-08-14", "olympic"),
    "World Team Table Tennis Championships Doha 2004": ("世乒赛团体", "2004-03-01", "wttct"),
}

# 赛程模板：round/stage -> 距开赛天数偏移
TEMPLATES = {
    "pro4": {"Qualification": 0, "R64": 1, "R32": 1, "R16": 2,
             "QuarterFinal": 2, "SemiFinal": 3, "Final": 3},
    "pro5": {"Qualification": 0, "R64": 1, "R32": 1, "R16": 2,
             "QuarterFinal": 2, "SemiFinal": 3, "Final": 4},
    "grandfinals3": {"R16": 0, "QuarterFinal": 1, "SemiFinal": 2, "Final": 2},
    "wcup": {"Qualification": 0, "QuarterFinal": 2, "SemiFinal": 3, "Final": 4},
    "olympic": {"Qualification": 0, "R128": 0, "R64": 1, "R32": 2, "R16": 3,
                "QuarterFinal": 4, "SemiFinal": 5, "Position Draw": 5},
    "wttct": {"Qualification": 0, "Main Draw": 6},
}

# 奥运会决赛日按项目区分：WD 08-20(6) MD 08-21(7) WS 08-22(8) MS 08-23(9)
OLYMPIC_FINAL_OFFSET = {"MS": 9, "WS": 8, "MD": 7, "WD": 6}

CN_SURNAMES = set("""AO BAI BAO BI BIAN BO BU CAI CAO CEN CHAI CHAN CHANG CHAO CHE CHEN CHENG CHI CHONG CHOU CHU CHUA CHUAN CHUI CHUN CUI CUN DAI DAN DANG DAO DE DENG DI DIAO DING DONG DOU DU DUAN DUANMU DUN E FAN FANG FEI FENG FO FU GAN GAO GE GENG GONG GOU GU GUAN GUANG GUI GUO HA HAI HAN HANG HAO HE HEI HENG HONG HOU HU HUA HUAI HUAN HUANG HUI HUO JI JIA JIAN JIANG JIAO JIE JIN JING JIU JU KANG KE KONG KOU KUANG KUI KUO LAI LAN LANG LAO LE LEI LENG LI LIAN LIANG LIAO LIE LIN LING LIU LONG LOU LU LUAN LUO LV MA MAI MAN MAO MEI MENG MI MIAO MIN MING MO MU NAN NIE NIU OU PAN PANG PAO PEI PENG PI PIAO PING PO PU QI QIA QIAN QIANG QIAO QIE QIN QING QIU QU QUAN QUE RAN RAO REN RONG RU RUAN RUI SA SAI SAN SANG SE SEN SENG SHA SHAN SHANG SHAO SHE SHEN SHENG SHI SHOU SHU SHUAI SHUI SHUN SI SONG SU SUI SUN SUO TA TAI TAN TANG TAO TENG TI TIAN TIE TING TONG TU TUAN TUN TUO WA WAI WAN WANG WEI WEN WENG WO WU XI XIA XIAN XIANG XIAO XIE XIN XING XIONG XIU XU XUAN XUE XUN YA YAN YANG YAO YE YI YIN YING YONG YOU YU YUAN YUE YUN ZA ZAI ZAN ZANG ZAO ZE ZENG ZHA ZHAN ZHANG ZHAO ZHE ZHEN ZHENG ZHI ZHONG ZHOU ZHU ZHUANG ZHUO ZI ZONG ZOU ZU ZUO""".split())

KEEP_CN_COUNTRY = {"CHN", "HKG", "TPE", "MAC", "KOR", "PRK", "SGP"}

OVERRIDES = {
    "SCHOPP Jie": "SCHOPP Jie",      # 德国华裔，既有 DB 用原文
    "LANG Kristin": "Kristin LANG",  # 德国球员（LANG 非中文姓）
    "NI Xia Lian": "Xia Lian NI",    # 卢森堡华裔，既有 DB 用欧洲格式
    "LI Qian": "Qian LI",            # 波兰华裔，既有 DB 用欧洲格式
}


def strip_suffix(name):
    return re.sub(r" \((?:II|\d{4}|YOB=\d{4})\)$", "", name)


def auto_std(raw, code):
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
    if stage == "Final" or (tmpl == "olympic" and round_ == "Final"):
        offset = OLYMPIC_FINAL_OFFSET.get(sub, 8)
    elif stage == "Qualification":
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
    """解析单个原始文件，返回 records dict: ms/ws/md/wd -> [(date,type,w,l), ...]"""
    records = {"ms": [], "ws": [], "md": [], "wd": []}
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
        if cols and cols[-1] in ("MS", "WS", "MD", "WD", "MT", "WT") and len(cols) < 8 and i + 1 < len(raw_lines):
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
            if raw in NAME_MAP:
                return NAME_MAP[raw]
            missing.append(f"{event} | {raw} 无标准名")
            return None

        if sub in ("MS", "WS", "MT", "WT"):
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
            if sub in ("MT", "WT"):
                key = "ms" if sub == "MT" else "ws"
            else:
                key = "ms" if sub == "MS" else "ws"
            records[key].append((d, etype, w, l))
        elif sub in ("MD", "WD"):
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
            w_pair = sorted(w_pair)
            l_pair = sorted(l_pair)
            records[sub.lower()].append((d, etype, "/".join(w_pair), "/".join(l_pair)))
    return records, missing


def append_to_scorelog(cat, records):
    if cat == "ws":
        filename = "score-log-2004-ws.json"
    else:
        filename = "score-log-2004-wtt.json"
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
    if filename not in files:
        files.insert(0, filename)
        data["scoreFiles"] = files
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"  manifest[{cat}] +{filename}")
    else:
        print(f"  manifest[{cat}] {filename} 已存在")


def main():
    totals = {"ms": 0, "ws": 0, "md": 0, "wd": 0}
    all_missing = []
    for fname in sorted(os.listdir(RAW_DIR)):
        if not fname.endswith(".txt"):
            continue
        print(f"== {fname}")
        records, missing = parse_event(fname)
        for cat in ("ms", "ws", "md", "wd"):
            n = append_to_scorelog(cat, records[cat])
            totals[cat] += n
        if missing:
            all_missing.extend(missing)
    print("\n=== 汇总 ===")
    print(f"  MS={totals['ms']}  WS={totals['ws']}  MD={totals['md']}  WD={totals['wd']}")
    if all_missing:
        print("  [missing]")
        for m in sorted(set(all_missing)):
            print("    ", m)
    else:
        print("  无缺失名字/无胜者不匹配")

    for cat in ("ms", "ws", "md", "wd"):
        fn = "score-log-2004-ws.json" if cat == "ws" else "score-log-2004-wtt.json"
        register_manifest(cat, fn)


if __name__ == "__main__":
    main()