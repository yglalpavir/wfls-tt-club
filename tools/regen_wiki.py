"""
从 raw wikitext 重新解析 Wikipedia 数据，使用正确名称格式。
同时复用原始 Olympic 数据。
"""
import json, re, subprocess, time, logging
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "ittf_data"
RAW_DIR = DATA_DIR / "_raw"

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("regen")

ASIAN_SURNAMES = {
    "WANG","ZHANG","LI","LIU","CHEN","YANG","HUANG","ZHAO","WU","ZHOU","XU","SUN",
    "MA","ZHU","HU","GUO","HE","GAO","LIN","LUO","LIANG","SONG","ZHENG","XIE","HAN",
    "TANG","FENG","YU","DONG","XIAO","CHENG","CAO","YUAN","DENG","FU","SHEN","ZENG",
    "PENG","LV","SU","JIANG","CAI","JIA","DING","WEI","XUE","YE","YAN","PAN","DU",
    "DAI","XIA","ZHONG","TIAN","REN","FAN","FANG","SHI","YAO","TAN","LIAO","ZOU",
    "XIONG","JIN","LU","HAO","KONG","BAI","CUI","KANG","MAO","QIU","QIN","GU","HOU",
    "SHAO","MENG","LONG","WAN","DUAN","LEI","QIAN","YIN","YI","CHANG","QIAO","LAI",
    "GONG","WEN","NG","CHAN","CHEUNG","CHIU","CHOW","CHU","FONG","HO","HUI","KWAN",
    "LAM","LAU","LEE","LEUNG","POON","TAM","TANG","TSANG","YIP","YUEN","CHUANG",
    "HSU","TSAI","KIM","PARK","CHOI","JUNG","KANG","CHO","YOON","JANG","LIM","OH",
    "SHIN","SEO","KWON","HWANG","AHN","JEON","HONG","YOO","JOO","RYU","NAM","BAEK",
    "MOON","CHA","HEO","JEONG","KO","SATO","SUZUKI","TAKAHASHI","TANAKA","ITO",
    "YAMAMOTO","NAKAMURA","KOBAYASHI","KATO","YOSHIDA","YAMADA","SASAKI",
    "YAMAGUCHI","MATSUMOTO","INOUE","KIMURA","HAYASHI","SHIMIZU","SAITO","MORI",
    "IKEDA","HASHIMOTO","ABE","OGURA","ISHIKAWA","MAEDA","FUJITA","OKADA","GOTO",
    "HASEGAWA","MURAKAMI","KONDO","ISHII","UCHIDA","SAKAMOTO","OTA","HARIMOTO",
    "MATSUSHIMA","NIWA","MIZUTANI","HIRANO","FUKUHARA","KISHIKAWA","MATSUDAIRA",
    "OSHIMA","MORIZONO","YOSHIMURA","UEDA","TSUBOI","NGUYEN","TRAN","PHAM",
    "HOANG","HUYNH","PHAN","VU","VO","DANG","BUI","DO","NGO","DUONG","LY",
    "WATANABE","WONG","JOO","JIN","SHIN","JANG","SEOK",
}

def clean_wiki_name(raw):
    """从 wikitext 中提取并格式化球员名。"""
    is_win = "'''" in raw
    name = re.sub(r'\{\{flagicon\|[^}]+\}\}','',raw)
    name = name.replace("'''","")

    links = re.findall(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', name)
    if links:
        full = links[0][0].strip()
        # 清理 (year) 等括号内容
        full = re.sub(r'\([^)]*\)','',full).strip()
        full = full.split("(")[0].strip()

        parts = full.split()
        if len(parts) >= 2:
            # 检测姓氏位置
            if parts[0].upper() in ASIAN_SURNAMES:
                formatted = f"{parts[0].upper()} {' '.join(parts[1:])}"
            elif parts[-1].upper() in ASIAN_SURNAMES:
                formatted = f"{' '.join(parts[:-1])} {parts[-1].upper()}"
            else:
                # 西方名字：最后一个词大写
                *given, surname = parts
                formatted = f"{' '.join(given)} {surname.upper()}"
            return formatted, is_win
        return full, is_win

    name = name.strip()
    return name, is_win


def parse_brackets(wikitext):
    """解析 Bracket 模板提取比赛对阵。"""
    matches = []
    for tmpl_match in re.finditer(r'\{\{(?:\d+TeamBracket|8TeamBracket|4TeamBracket)', wikitext):
        depth = 1; i = tmpl_match.end()
        while i < len(wikitext) and depth > 0:
            if wikitext[i:i+2] == '}}': depth -= 1; i += 2
            elif wikitext[i:i+2] == '{{': depth += 1; i += 2
            else: i += 1
        bracket = wikitext[tmpl_match.start():i]

        params = {}
        for line in bracket.split('\n'):
            line = line.strip()
            if line.startswith('| ') and '=' in line:
                line = line[1:].strip()
                k, _, v = line.partition('=')
                params[k.strip()] = v.strip()

        rounds = set()
        for k in params:
            m = re.match(r'(RD\d+)-seed\d+', k)
            if m: rounds.add(m.group(1))

        for rd in sorted(rounds):
            nums = set()
            for k in params:
                m = re.match(rf'{rd}-seed(\d+)', k)
                if m: nums.add(int(m.group(1)))

            for num in sorted(nums):
                if num % 2 == 0: continue
                n2 = num + 1
                t1 = params.get(f"{rd}-team{num:02d}","")
                t2 = params.get(f"{rd}-team{n2:02d}","")
                if not t1 or not t2: continue

                p1, w1 = clean_wiki_name(t1)
                p2, w2 = clean_wiki_name(t2)
                if not p1 or not p2 or w1 == w2: continue

                s1, s2 = [], []
                for s in range(1,9):
                    k1 = f"{rd}-score{num:02d}-{s}"
                    k2 = f"{rd}-score{n2:02d}-{s}"
                    if k1 in params and k2 in params:
                        v1 = params[k1].replace("'''","")
                        v2 = params[k2].replace("'''","")
                        if v1.isdigit() and v2.isdigit():
                            s1.append(int(v1)); s2.append(int(v2))

                matches.append({'p1':p1,'p2':p2,'w1':w1,'s1':s1,'s2':s2})
    return matches


def to_records(bm, event_name, year):
    records = []
    for m in bm:
        w,l = (m['p1'],m['p2']) if m['w1'] else (m['p2'],m['p1'])
        ws,ls = (m['s1'],m['s2']) if m['w1'] else (m['s2'],m['s1'])
        n = min(len(ws),len(ls))
        if n < 3: continue
        ss = " ".join(f"{ws[i]}:{ls[i]}" for i in range(n))
        d = f"{year}-05-15" if event_name=="世锦赛" else f"{year}-08-10"
        records.append({"日期":d,"类型":event_name,"胜者":w,"负者":l,"比分":ss,"数据来源":"Wikipedia"})
    return records


def main():
    log.info("从 raw wikitext 重新生成 Wikipedia 数据 (正确名称格式)")

    # 读取现有的 Olympic 记录（不需要修正）
    olympic_records = {c:[] for c in ["MS","WS","MD","WD","XD"]}
    for cat_dir in sorted(DATA_DIR.glob("*")):
        if not cat_dir.is_dir() or cat_dir.name.startswith("_"): continue
        sf = cat_dir / "score-log.json"
        if sf.exists():
            records = json.loads(sf.read_text(encoding="utf-8"))
            cat = cat_dir.name.upper()
            olympic_records[cat] = [r for r in records if r.get("类型")=="奥运会"]

    # 重新生成世锦赛数据
    new_records = {c:[] for c in ["MS","WS","MD","WD","XD"]}
    for wf in sorted(RAW_DIR.glob("*.wiki")):
        fname = wf.stem  # e.g., "世锦赛_2009_MS"
        parts = fname.split("_")
        event_name = parts[0]
        year = int(parts[1])
        cat = parts[2]

        wt = wf.read_text(encoding="utf-8")
        bm = parse_brackets(wt)
        recs = to_records(bm, event_name, year)
        new_records[cat].extend(recs)
        log.info(f"  {fname}: {len(recs)} 场")

    # 合并 Olympic
    for cat in new_records:
        new_records[cat].extend(olympic_records.get(cat, []))

    # 保存
    for cat, recs in new_records.items():
        seen = set()
        uniq = []
        for r in recs:
            k = (r["日期"],r["胜者"],r["负者"])
            if k not in seen:
                seen.add(k); uniq.append(r)

        cat_dir = DATA_DIR / cat.lower()
        cat_dir.mkdir(parents=True, exist_ok=True)
        sf = cat_dir / "score-log.json"
        sf.write_text(json.dumps(uniq, ensure_ascii=False, indent=2), encoding="utf-8")
        log.info(f"\n✅ {cat}: {len(uniq)} 条")

        # 样例
        if uniq:
            east = [r for r in uniq if any(w in ASIAN_SURNAMES for w in r["胜者"].split()[:1])]
            west = [r for r in uniq if not any(w in ASIAN_SURNAMES for w in r["胜者"].split()[:1])]
            if east:
                r = east[len(east)//2]
                log.info(f"  东亚样例: {r['胜者']} vs {r['负者']}")
            if west:
                r = west[len(west)//2]
                log.info(f"  西方样例: {r['胜者']} vs {r['负者']}")

    log.info("\n🎉 完成!")

if __name__ == "__main__":
    main()
