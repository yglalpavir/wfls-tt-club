#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析成都混合团体世界杯数据，生成五个分类（MS/WS/MD/WD/XD）的记录 JSON。

用法:
    python tools/parse_mixedteams.py 2024
    python tools/parse_mixedteams.py 2024 --write

输入（需放在 tools/ 目录）:
    mixedteams{YEAR}results.txt      比赛结果（赛事官网转录）
    mixedteams{YEAR}playerlist.txt   球员名单（赛事官网转录）

输出:
    打印解析统计 + 歧义/未解析清单
    --write 时写入 tools/_mixedteams{YEAR}_{cat}.json（供核对后写回正式数据）

规则（成都混团世界杯赛制）:
    每场队际赛盘序固定:
        第1盘: XD 混双
        第2盘: WS 女单
        第3盘: MS 男单
        第4/5盘: MD 或 WD（男双/女双，顺序不定，先到8局总分者胜）
    单打盘给全名（如 "WANG Manyu"）；双打盘只给姓氏（如 "WANG/SUN"）。
"""
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
TOOLS = BASE / "tools"
YEAR = "2024"

# ---------------------------------------------------------------------------
# 2024 成都混团参赛球员数据库: team -> {key: (fullname, gender)}
# gender: M 男 / F 女
# key 用于姓氏匹配（含合并形式，如 REYESLAI=REYES LAI、DESTOPPELEIRE=DE STOPPELEIRE）
# ---------------------------------------------------------------------------
TEAM_PLAYERS = {
    "CHN": [
        ("WANG Chuqin", "M"), ("SUN Yingsha", "F"), ("WANG Manyu", "F"),
        ("LIN Shidong", "M"), ("KUAI Man", "F"), ("WANG Yidi", "F"),
        ("LIANG Jingkun", "M"), ("LIN Gaoyuan", "M"),
    ],
    "KOR": [
        ("JANG Woojin", "M"), ("SHIN Yubin", "F"), ("AN Jaehyun", "M"),
        ("OH Junsung", "M"), ("KIM Nayeong", "F"), ("CHO Daeseong", "M"),
        ("SUH Hyo Won", "F"), ("JEON Jihee", "F"),
    ],
    "ROU": [
        ("Bernadette SZOCS", "F"), ("Eduard IONESCU", "M"), ("Elizabeta SAMARA", "F"),
        ("Andreea DRAGOMAN", "F"), ("Darius MOVILEANU", "M"), ("Adina DIACONU", "F"),
        ("Ovidiu IONESCU", "M"), ("Andrei ISTRATE", "M"),
    ],
    "FRA": [
        ("Thibault PORET", "M"), ("Jules ROLLAND", "M"), ("Camille LUTZ", "F"),
        ("Audrey ZARIF", "F"), ("Esteban DORR", "M"), ("Clea DE STOPPELEIRE", "F"),
    ],
    "SGP": [
        ("ZENG Jian", "F"), ("QUEK Izaac", "M"), ("SER Lin Qian", "F"),
        ("PANG Koen", "M"), ("CHEW Clarence", "M"), ("ZHOU Jingyi", "F"),
    ],
    "AUS": [
        ("Nicholas LUM", "M"), ("Finn LUU", "M"), ("Constantina PSIHOGIOS", "F"),
        ("Hwan BAE", "M"), ("Jian Fang LAY", "F"), ("Melissa TAPPER", "F"),
    ],
    "HKG": [
        ("DOO Hoi Kem", "F"), ("WONG Chun Ting", "M"), ("CHAN Baldwin", "M"),
        ("NG Wing Lam", "F"), ("LAM Siu Hang", "M"), ("YIU Kwan To", "M"),
        ("WONG Hoi Tung", "F"), ("LEE Hoi Man", "F"),
    ],
    "JPN": [
        ("Yuta TANAKA", "M"), ("Kaho AKAE", "F"), ("Ryoichi YOSHIYAMA", "M"),
        ("Asuka SASAO", "F"), ("Ryuusei KAWAKAMI", "M"), ("Rin MENDE", "F"),
        ("Keishi HAGIHARA", "M"), ("Sakura MORI", "F"),
    ],
    "SWE": [
        ("Kristian KARLSSON", "M"), ("Linda BERGSTROM", "F"), ("Christina KALLBERG", "F"),
        ("Filippa BERGAND", "F"), ("Isak ALFREDSSON", "M"), ("Anders ERIKSSON", "M"),
    ],
    "IND": [
        ("Manav THAKKAR", "M"), ("Manush SHAH", "M"), ("Yashaswini GHORPADE", "F"),
        ("Snehit SURAVAJJULA", "M"), ("Sayali WANI", "F"), ("Poymantee BAISYA", "F"),
        ("Pritha VARTIKAR", "F"), ("Jeet CHANDRA", "M"),
    ],
    "TPE": [
        ("LI Yu-Jhun", "M"), ("KUO Guan-Hong", "M"), ("HUNG Jing-Kai", "M"),
        ("HUANG Yu-Chiao", "F"), ("HUANG Yan-Cheng", "M"), ("CHENG Hsien-Tzu", "F"),
        ("LI Yan Jun", "M"), ("WANG Yi-Ju", "F"),
    ],
    "POL": [
        ("Milosz REDZIMSKI", "M"), ("Natalia BAJOR", "F"), ("Katarzyna WEGRZYN", "F"),
        ("Mateusz ZALEWSKI", "M"), ("Natalia BOGDANOWICZ", "F"), ("Marcel BLASZCZYK", "M"),
    ],
    "USA": [
        ("Sally MOYLAND", "F"), ("Jessica REYES LAI", "F"), ("Sid NARESH", "M"),
        ("Nandan NARESH", "M"), ("Jishan LIANG", "M"), ("Xiangjing ZHANG", "M"),
        ("Kayla GOODWIN", "F"), ("Tiffany KE", "F"),
    ],
    "CAN": [
        ("Eugene WANG", "M"), ("Edward LY", "M"), ("Natalie CHAN", "F"),
        ("Ivy LIAO", "F"), ("Jeremy HAZIN", "M"), ("Jessie XU", "F"),
    ],
    "EGY": [
        ("Marwa ALHODABY", "F"), ("Badr MOSTAFA", "M"), ("Hend FATHY", "F"),
        ("Alaa YEHIA", "F"), ("Mohamed AZZAM", "M"), ("Marwan GAMAL", "M"),
    ],
    "GER": [
        ("Yuan WAN", "F"), ("Kay STUMPER", "M"), ("Cedric MEISSNER", "M"),
        ("Franziska SCHREINER", "F"), ("Fanbo MENG", "M"), ("Sophia KLEE", "F"),
    ],
}


def surname_keys(fullname):
    """为一个球员全名生成可能的姓氏匹配 key 集合。

    例: "Jessica REYES LAI" -> {"REYES", "LAI", "REYESLAI"}
        "Clea DE STOPPELEIRE" -> {"DE", "STOPPELEIRE", "DESTOPPELEIRE"}
        "NG Wing Lam" -> {"NG", "LAM", "NGLAM"}
    """
    parts = fullname.split()
    keys = {p.upper() for p in parts}
    # 合并相邻词（去空格）以匹配转录里的拼接形式
    for i in range(len(parts) - 1):
        keys.add((parts[i] + parts[i + 1]).upper())
    return keys


# team -> {key_upper: [(fullname, gender), ...]}
def build_lookup():
    lookup = {}
    for team, players in TEAM_PLAYERS.items():
        d = {}
        for name, gender in players:
            for k in surname_keys(name):
                d.setdefault(k, []).append((name, gender))
        lookup[team] = d
    return lookup


def word_key(name):
    """全名匹配 key：忽略词语顺序的全大写排序元组。

    例: "Bernadette SZOCS" 与 "SZOCS Bernadette" 生成相同 key，
        从而兼容结果文件中"姓 名"与数据库"名 姓"的差异。
    """
    return tuple(sorted(w.upper() for w in name.split()))


LOOKUP = build_lookup()

# 全局活跃球员集合：所有场次中单打解析出的全名，用于双打同名消歧
ACTIVE_PLAYERS = set()

# 手工覆盖表：通用消歧无法可靠判定时（同名/同姓多候选且无单打线索），
# 依据实际比赛查证结果指定明确人选。
# 键: (teamA, teamB, 盘索引, side)  side=0 胜者侧, 1 负者侧
# 值: (球员1全名, 球员2全名)
DOUBLES_OVERRIDES = {
    # 2024-12-03 CHN vs USA 盘0(混双): 中国队 林高远/王艺迪
    ("CHN", "USA", 0, 0): ("WANG Yidi", "LIN Gaoyuan"),
    # 2024-12-03 CHN vs USA 盘0(混双): 美国队 Nandan Naresh/Kayla Goodwin
    ("CHN", "USA", 0, 1): ("Nandan NARESH", "Kayla GOODWIN"),
    # 2024-12-04 JPN vs USA 盘0(混双): 美国队 Nandan Naresh/Sally Moyland
    ("JPN", "USA", 0, 1): ("Nandan NARESH", "Sally MOYLAND"),
    # 2024-12-01 IND vs USA 盘0(混双): 印度 Snehit Suravajjula/Poymantee Baisya
    ("IND", "USA", 0, 0): ("Snehit SURAVAJJULA", "Poymantee BAISYA"),
    # 2024-12-01 IND vs USA 盘0(混双): 美国队 Nandan Naresh/Tiffany Ke
    ("IND", "USA", 0, 1): ("Nandan NARESH", "Tiffany KE"),
    # 2024-12-01 TPE vs SGP 盘0(混双): 中华台北 黎彦君/黄禹乔
    ("TPE", "SGP", 0, 0): ("LI Yan Jun", "HUANG Yu-Chiao"),
    # 2024-12-07 FRA vs USA 盘4(男双): 美国队 Sid Naresh/Nandan Naresh
    ("FRA", "USA", 4, 1): ("Sid NARESH", "Nandan NARESH"),
}

# team -> {word_key: [(fullname, gender), ...]}  全名 key（忽略顺序）
NAME_LOOKUP = {}
for _team, _players in TEAM_PLAYERS.items():
    _d = {}
    for _name, _g in _players:
        _d.setdefault(word_key(_name), []).append((_name, _g))
    NAME_LOOKUP[_team] = _d


def resolve_single(team, token, appeared):
    """解析单打全名（如 "SZOCS Bernadette" 或 "WANG Manyu"）。
    返回 (fullname, gender) 或 None。"""
    if not token:
        return None
    cands = NAME_LOOKUP[team].get(word_key(token), [])
    if len(cands) == 1:
        return cands[0]
    if len(cands) > 1:
        for c in cands:
            if c[0] in appeared:
                return c
        return cands[0]
    # 全名未匹配，退回到姓氏匹配
    cands2 = LOOKUP[team].get(token.upper(), [])
    if len(cands2) == 1:
        return cands2[0]
    if len(cands2) > 1:
        for c in cands2:
            if c[0] in appeared:
                return c
        return cands2[0]
    return None


def resolve_doubles(team, tokens, need_gender, appeared):
    """解析双打姓氏对。need_gender: {'M','F'} 各取一（XD）；或 'MM'/'FF'（MD/WD）。
    返回 (list_of_possible_pairs, genders_str, ok) 其中 pairs 元素为 (n1,g1,n2,g2)。"""
    t1, t2 = tokens[0].upper(), tokens[1].upper()
    c1 = LOOKUP[team].get(t1, [])
    c2 = LOOKUP[team].get(t2, [])
    if not c1 or not c2:
        return [], "", False
    pairs = []
    genders = set()
    for n1, g1 in c1:
        for n2, g2 in c2:
            if n1 == n2:
                continue
            if need_gender == "XD":
                if {g1, g2} == {"M", "F"}:
                    pairs.append((n1, g1, n2, g2))
                    genders.add(g1 + g2)
            elif need_gender == "MM":
                if g1 == "M" and g2 == "M":
                    pairs.append((n1, g1, n2, g2))
                    genders.add("MM")
            elif need_gender == "FF":
                if g1 == "F" and g2 == "F":
                    pairs.append((n1, g1, n2, g2))
                    genders.add("FF")
    if len(pairs) == 1:
        return pairs, genders, True
    # 多候选（如 ROU IONESCU、USA NARESH、CHN WANG/LIN）：
    # 优先选"已出场者"最多的配对。
    # 本场单打 appeared 权重高（2），全局活跃 ACTIVE_PLAYERS 权重低（1）。
    if not pairs:
        return pairs, genders, False
    def _hit(p):
        def w(n):
            return 2 if n in appeared else (1 if n in ACTIVE_PLAYERS else 0)
        return w(p[0]) + w(p[2])
    best = max(pairs, key=_hit)
    best_hits = _hit(best)
    if best_hits > 0:
        top = [p for p in pairs if _hit(p) == best_hits]
        if len(top) == 1:
            return top, genders, True
    return pairs, genders, len(pairs) == 1


MONTH = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
         "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}


def parse_year(text):
    """从 'Match 1 | 8 Dec, 19:00' 提取日期字符串 YYYY-MM-DD。"""
    m = re.search(r"\|\s*(\d{1,2})\s+(\w{3})", text)
    if not m:
        return None
    day = int(m.group(1))
    mon = MONTH.get(m.group(2))
    if not mon:
        return None
    return f"{YEAR}-{mon:02d}-{day:02d}"


def parse_results(path):
    """解析结果文件，返回 [(match_date, teamA, teamB, rubbers)]。
    rubbers: [{'win': [...], 'lose': [...], 'score': (w,l)}]"""
    lines = path.read_text(encoding="utf-8").splitlines()
    matches = []
    i = 0
    n = len(lines)

    def is_score_line(s):
        return re.match(r"^\s*\d+\s*-\s*\d+\s*$", s) is not None

    def is_sets_line(s):
        # "11-9,17-19,11-4" 或 "11-6,0-0,0-0"
        return re.match(r"^\d+-\d+(,\d+-\d+)*\s*$", s) is not None

    while i < n:
        line = lines[i].strip()
        # 定位 Match 行
        if not re.match(r"^Match \d+ \|", line):
            i += 1
            continue
        date = parse_year(line)
        i += 1
        # 跳过空行，读队名+比分
        while i < n and not lines[i].strip():
            i += 1
        if i >= n:
            break
        team_score = lines[i].strip()   # "CHN  8-1"（可能带尾随空格）
        i += 1
        while i < n and not lines[i].strip():
            i += 1
        if i >= n:
            break
        team_name = lines[i].strip()    # "KOR"
        i += 1
        # 读取队名（两行式，第一行含比分）
        m = re.match(r"^([A-Z]{3})\s+(\d+)\s*-\s*(\d+)\s*$", team_score)
        if not m:
            # 尝试 "CHN  8-1  " 末尾空格已被 strip；若失败则跳过该场
            print(f"[WARN] 无法解析队名比分行: {team_score!r} @ {date}")
            continue
        teamA, scoreA, scoreB = m.group(1), int(m.group(2)), int(m.group(3))
        teamB = team_name
        # 跳过 Table / Match Centre / View Results
        while i < n:
            s = lines[i].strip()
            if s.startswith("Table ") or s in ("Match Centre", "View Results"):
                i += 1
            elif not s:
                i += 1
            else:
                break
        # 解析 rubber 块
        rubbers = []
        cur = {"win": [], "lose": [], "phase": "win"}
        while i < n:
            raw = lines[i]
            s = raw.strip()
            # 遇到下一场 Match 或 赛段头 则结束本场
            if re.match(r"^Match \d+ \|", s) or s.startswith("Stage ") or s.startswith("Mixed Teams"):
                break
            if not s:
                i += 1
                continue
            if is_score_line(s):
                msc = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", s)
                cur["score"] = (int(msc.group(1)), int(msc.group(2)))
                cur["phase"] = "lose"
                i += 1
                continue
            if is_sets_line(s):
                # 本 rubber 结束
                if cur["win"] and cur["lose"]:
                    rubbers.append(cur)
                cur = {"win": [], "lose": [], "phase": "win"}
                i += 1
                continue
            # 球员名行
            if cur["phase"] == "win":
                cur["win"].append(s)
            else:
                cur["lose"].append(s)
            i += 1
        # 最后一块（若无 sets 结束行）
        if cur["win"] and cur["lose"] and "score" in cur:
            rubbers.append(cur)
        matches.append((date, teamA, teamB, scoreA, scoreB, rubbers))
    return matches


def classify_rubbers(rubbers, teamA, teamB, date=None):
    """按盘序和性别给每个 rubber 归类，返回 (project, winner, loser, issues)。

    两遍解析：
      第一遍：解析所有单打全名，收集双方"已出场球员"集合 appeared。
      第二遍：用 appeared 消歧双打（同队同名如 ROU IONESCU、USA NARESH）。
    project: MS/WS/MD/WD/XD; winner/loser: 全名或 'P1/P2'
    """
    issues = []

    # ---- 第一遍：收集单打出场球员 ----
    appeared = set()
    singles = []  # (idx, win_name, lose_name)
    for idx, rb in enumerate(rubbers):
        win_toks, lose_toks = rb["win"], rb["lose"]
        if len(win_toks) == 1 and len(lose_toks) == 1:
            w = resolve_single(teamA, win_toks[0], appeared)
            l = resolve_single(teamB, lose_toks[0], appeared)
            if w and l:
                appeared.add(w[0])
                appeared.add(l[0])
                singles.append((idx, w, l))
            else:
                issues.append(
                    f"单打未解析: {teamA} {'/'.join(win_toks)} vs {teamB} {'/'.join(lose_toks)} "
                    f"(场: {teamA} vs {teamB}, 盘{idx+1})")

    # ---- 第二遍：正式解析所有 rubber ----
    out = []
    # 将已解析单打先排序输出（按 idx）
    singles_map = {idx: (w, l) for idx, w, l in singles}

    for idx, rb in enumerate(rubbers):
        win_toks, lose_toks = rb["win"], rb["lose"]
        if len(win_toks) == 1 and len(lose_toks) == 1:
            # 单打：已在第一遍解析
            if idx in singles_map:
                w, l = singles_map[idx]
                if idx == 0:
                    proj = "XD"
                elif idx == 1:
                    proj = "WS"
                elif idx == 2:
                    proj = "MS"
                else:
                    proj = "MS" if w[1] == "M" else "WS"
                out.append((proj, w[0], l[0]))
            continue

        # 双打：win 2 个 / lose 2 个
        if len(win_toks) == 2 and len(lose_toks) == 2:
            if idx == 0:
                need = "XD"
            else:
                need = "MM"  # 先假设 MD，再按结果修正
            # 手工覆盖优先
            def _apply_override(team, toks, side):
                ov = DOUBLES_OVERRIDES.get((teamA, teamB, idx, side))
                if not ov:
                    return None
                n1, n2 = ov
                g1 = dict((p[0], p[1]) for p in TEAM_PLAYERS[team])[n1]
                g2 = dict((p[0], p[1]) for p in TEAM_PLAYERS[team])[n2]
                return [(n1, g1, n2, g2)], g1 + g2, True

            ovw = _apply_override(teamA, win_toks, 0)
            ovl = _apply_override(teamB, lose_toks, 1)
            if ovw:
                wp, wg, wok = ovw
            if ovl:
                lp, lg, lok = ovl
            if not ovw:
                wp, wg, wok = resolve_doubles(teamA, win_toks, need, appeared)
            if not ovl:
                lp, lg, lok = resolve_doubles(teamB, lose_toks, need, appeared)
            # 第4/5盘：若按 MD 无法同时解析，则回退尝试 WD
            if (not (wok and lok)) and idx >= 1:
                wp2, wg2, wok2 = resolve_doubles(teamA, win_toks, "FF", appeared)
                lp2, lg2, lok2 = resolve_doubles(teamB, lose_toks, "FF", appeared)
                if wok2 and lok2:
                    wp, lp, wg, lg, wok, lok = wp2, lp2, wg2, lg2, True, True
            if not wok or not lok:
                issues.append(
                    f"双打未解析: {teamA} {'/'.join(win_toks)} vs {teamB} {'/'.join(lose_toks)} "
                    f"(场: {teamA} vs {teamB}, 盘{idx+1})")
                continue
            w = wp[0]
            l = lp[0]
            wgenders = w[1] + w[3]
            lgenders = l[1] + l[3]
            if idx == 0:
                proj = "XD"
            else:
                if wgenders == "FF" and lgenders == "FF":
                    proj = "WD"
                elif wgenders == "MM" and lgenders == "MM":
                    proj = "MD"
                else:
                    proj = "XD" if ("M" in wgenders and "F" in wgenders and
                                    "M" in lgenders and "F" in lgenders) else "MD"
            out.append((proj, w[0] + "/" + w[2], l[0] + "/" + l[2]))
        else:
            issues.append(
                f"双打名行数异常: win={win_toks} lose={lose_toks} (场: {teamA} vs {teamB})")
    return out, issues


def main():
    global YEAR
    write = False
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--write" in sys.argv:
        write = True
    YEAR = args[0] if args else "2024"

    results_path = TOOLS / f"mixedteams{YEAR}results.txt"
    if not results_path.exists():
        print(f"找不到结果文件: {results_path}")
        sys.exit(1)

    matches = parse_results(results_path)
    print(f"共解析 {len(matches)} 场队际赛")

    # 第一遍：收集全局活跃球员（所有场次单打全名），用于双打同名消歧
    for date, teamA, teamB, scoreA, scoreB, rubbers in matches:
        for rb in rubbers:
            wt, lt = rb["win"], rb["lose"]
            if len(wt) == 1 and len(lt) == 1:
                for team, toks in ((teamA, wt), (teamB, lt)):
                    r = resolve_single(team, toks[0], set())
                    if r:
                        ACTIVE_PLAYERS.add(r[0])

    cats = {"MS": [], "WS": [], "MD": [], "WD": [], "XD": []}
    all_issues = []
    for date, teamA, teamB, scoreA, scoreB, rubbers in matches:
        # 校验总局数
        total_w = sum(rb.get("score", (0, 0))[0] for rb in rubbers)
        total_l = sum(rb.get("score", (0, 0))[1] for rb in rubbers)
        flag = ""
        if total_w != scoreA or total_l != scoreB:
            flag = f"  [比分不符! 盘计 {total_w}-{total_l}]"
        print(f"\n{date}  {teamA} {scoreA}-{scoreB} {teamB}{flag}")
        classified, issues = classify_rubbers(rubbers, teamA, teamB, date)
        all_issues.extend(issues)
        for proj, w, l in classified:
            cats[proj].append({"日期": date, "类型": "世界杯团体", "胜者": w, "负者": l})
            print(f"    [{proj}] {w}  vs  {l}")

    print("\n" + "=" * 60)
    for cat in ["MS", "WS", "MD", "WD", "XD"]:
        print(f"{cat}: {len(cats[cat])} 条")
    print(f"总计: {sum(len(v) for v in cats.values())} 条")
    if all_issues:
        print("\n!!! 未解析/异常清单 !!!")
        for it in all_issues:
            print("  -", it)
    else:
        print("\n无未解析项")

    if write:
        for cat, recs in cats.items():
            out = TOOLS / f"_mixedteams{YEAR}_{cat}.json"
            out.write_text(
                json.dumps(recs, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8")
            print(f"已写入 {out.name}")


if __name__ == "__main__":
    main()
