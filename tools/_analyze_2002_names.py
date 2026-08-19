#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分析 2002 原始球员名 -> 标准名，并与现有 DB 身份比对。"""
import json
import os
import re
import glob

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE_DIR)
RAW_DIR = os.path.join(ROOT, "docs", "result_ittf_link", "2002")
WTT_DIR = os.path.join(ROOT, "wtt_data")

CN_SURNAMES = set("""AO BAI BAO BI BIAN BO BU CAI CAO CEN CHAI CHAN CHANG CHAO CHE CHEN CHENG CHI CHONG CHOU CHU CHUA CHUAN CHUI CHUN CUI CUN DAI DAN DANG DAO DE DENG DI DIAO DING DONG DOU DU DUAN DUANMU DUN E FAN FANG FEI FENG FO FU GAN GAO GE GENG GONG GOU GU GUAN GUANG GUI GUO HA HAI HAN HANG HAO HE HEI HENG HONG HOU HU HUA HUAI HUAN HUANG HUI HUO JI JIA JIAN JIANG JIAO JIE JIN JING JIU JU KANG KE KONG KOU KUANG KUI KUO LAI LAN LANG LAO LE LEI LENG LI LIAN LIANG LIAO LIE LIN LING LIU LONG LOU LU LUAN LUO LV MA MAI MAN MAO MEI MENG MI MIAO MIN MING MO MU NAN NIE NIU OU PAN PANG PAO PEI PENG PI PIAO PING PO PU QI QIA QIAN QIANG QIAO QIE QIN QING QIU QU QUAN QUE RAN RAO REN RONG RU RUAN RUI SA SAI SAN SANG SE SEN SENG SHA SHAN SHANG SHAO SHE SHEN SHENG SHI SHOU SHU SHUAI SHUI SHUN SI SONG SU SUI SUN SUO TA TAI TAN TANG TAO TENG TI TIAN TIE TING TONG TU TUAN TUN TUO WA WAI WAN WANG WEI WEN WENG WO WU XI XIA XIAN XIANG XIAO XIE XIN XING XIONG XIU XU XUAN XUE XUN YA YAN YANG YAO YE YI YIN YING YONG YOU YU YUAN YUE YUN ZA ZAI ZAN ZANG ZAO ZE ZENG ZHA ZHAN ZHANG ZHAO ZHE ZHEN ZHENG ZHI ZHONG ZHOU ZHU ZHUANG ZHUO ZI ZONG ZOU ZU ZUO""".split())

KEEP_CN_COUNTRY = {"CHN", "HKG", "TPE", "MAC", "KOR", "PRK", "SGP"}

# 特定球员覆盖（保持与既有 DB 一致）
OVERRIDES = {
    "SCHOPP Jie": "SCHOPP Jie",
}


def strip_suffix(name):
    return re.sub(r" \((?:II|1982|1986|YOB=1981)\)$", "", name)


def auto_std(raw, code):
    raw = strip_suffix(raw)
    if raw in OVERRIDES:
        return OVERRIDES[raw]
    if code in KEEP_CN_COUNTRY:
        return raw
    if code == "JPN":
        return " ".join(reversed(raw.split()))
    parts = raw.split()
    if parts and parts[0] in CN_SURNAMES:
        return raw
    return " ".join(reversed(parts))


def identity(name):
    return " ".join(sorted(t for t in re.sub(r"[^A-Z0-9]", " ", name.upper()).split()))


def main():
    players = {}
    for f in sorted(glob.glob(os.path.join(RAW_DIR, "*.txt"))):
        with open(f, encoding="utf-8-sig") as fh:
            for l in fh:
                cols = [c.strip() for c in l.split("\t")]
                if len(cols) < 5 or not re.match(r"^\d{4}$", cols[0]):
                    continue
                for c in (cols[2], cols[4]):
                    m = re.match(r"^(.*?) \(([A-Z]{3})\)$", c)
                    if m:
                        players.setdefault(m.group(2), set()).add(m.group(1))

    # DB 身份注册表
    db_names = {}
    for f in glob.glob(os.path.join(WTT_DIR, "*", "score-log-*.json")):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        for r in d:
            for n in (r["胜者"], r["负者"]):
                db_names[identity(n)] = n

    conflicts = []
    rows = []
    for code in sorted(players):
        for raw in sorted(players[code]):
            std = auto_std(raw, code)
            rows.append((code, raw, std))
            idi = identity(std)
            existing = db_names.get(idi)
            if existing and existing != std:
                conflicts.append((code, raw, std, existing))
    print(f"total raw players: {len(rows)}")
    print("\n=== conflicts with DB ===")
    for c, raw, std, ex in sorted(conflicts):
        print(f"  {c}  {raw}  ->  {std}   (DB: {ex})")

    print("\n=== all mappings (by country) ===")
    for c, raw, std in rows:
        mark = "  <== DB=" + db_names[identity(std)] if identity(std) in db_names else ""
        print(f"  {c}  {raw}  ->  {std}{mark}")


if __name__ == "__main__":
    main()