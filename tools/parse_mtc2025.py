#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析 2025 成都混团世界杯（ITTF Mixed Team World Cup Chengdu 2025）match cards，
生成五个分类（MS/WS/MD/WD/XD）的记录 JSON。

每场队际赛 (teamParentData.extended_info.matches[]) 各盘：
  - players 数 = 1: 单打（性别判定 MS/WS）
  - players 数 = 2: 双打（性别判定 MD/WD/XD）
胜者由 overallScores 判断。
"""
import json
from pathlib import Path

ROOT = Path(r"s:\wfls-tt-club\wfls-tt-club")
CARDS = json.loads((ROOT / "tools" / "mtc2025_matchcards.json").read_text(encoding="utf-8"))

# 规范球员映射: API名(姓 名) -> (规范名, 性别)
# 中文/韩文/港台: 姓 名 (保持) ; 日本/欧洲/其他: 名 姓 (反转)
PLAYERS = {
    # CHN
    "WANG Chuqin": ("WANG Chuqin", "M"), "SUN Yingsha": ("SUN Yingsha", "F"),
    "WANG Manyu": ("WANG Manyu", "F"), "LIN Shidong": ("LIN Shidong", "M"),
    "KUAI Man": ("KUAI Man", "F"), "WANG Yidi": ("WANG Yidi", "F"),
    "LIANG Jingkun": ("LIANG Jingkun", "M"), "XU Yingbin": ("XU Yingbin", "M"),
    # KOR
    "JANG Woojin": ("JANG Woojin", "M"), "SHIN Yubin": ("SHIN Yubin", "F"),
    "AN Jaehyun": ("AN Jaehyun", "M"), "OH Junsung": ("OH Junsung", "M"),
    "KIM Nayeong": ("KIM Nayeong", "F"), "PARK Ganghyeon": ("PARK Ganghyeon", "M"),
    "LEE Eunhye": ("LEE Eunhye", "F"), "CHOI Hyojoo": ("CHOI Hyojoo", "F"),
    # GER
    "QIU Dang": ("Dang QIU", "M"), "KAUFMANN Annett": ("Annett KAUFMANN", "F"),
    "FRANZISKA Patrick": ("Patrick FRANZISKA", "M"), "DUDA Benedikt": ("Benedikt DUDA", "M"),
    "WINTER Sabine": ("Sabine WINTER", "F"), "MITTELHAM Nina": ("Nina MITTELHAM", "F"),
    # SWE
    "KALLBERG Anton": ("Anton KALLBERG", "M"), "FALCK Mattias": ("Mattias FALCK", "M"),
    "KARLSSON Kristian": ("Kristian KARLSSON", "M"), "BERGSTROM Linda": ("Linda BERGSTROM", "F"),
    "BERGAND Filippa": ("Filippa BERGAND", "F"), "KALLBERG Christina": ("Christina KALLBERG", "F"),
    # JPN
    "HARIMOTO Tomokazu": ("Tomokazu HARIMOTO", "M"), "HARIMOTO Miwa": ("Miwa HARIMOTO", "F"),
    "MATSUSHIMA Sora": ("Sora MATSUSHIMA", "M"), "ODO Satsuki": ("Satsuki ODO", "F"),
    "HAYATA Hina": ("Hina HAYATA", "F"), "ITO Mima": ("Mima ITO", "F"),
    "SHINOZUKA Hiroto": ("Hiroto SHINOZUKA", "M"), "TOGAMI Shunsuke": ("Shunsuke TOGAMI", "M"),
    # FRA
    "LEBRUN Felix": ("Felix LEBRUN", "M"), "LEBRUN Alexis": ("Alexis LEBRUN", "M"),
    "GAUZY Simon": ("Simon GAUZY", "M"), "LUTZ Charlotte": ("Charlotte LUTZ", "F"),
    "PAVADE Prithika": ("Prithika PAVADE", "F"), "YUAN Jia Nan": ("Jia Nan YUAN", "F"),
    # CRO
    "PUCAR Tomislav": ("Tomislav PUCAR", "M"), "JEGER Mateja": ("Mateja JEGER", "F"),
    "RAKOVAC Lea": ("Lea RAKOVAC", "F"), "ARAPOVIC Hana": ("Hana ARAPOVIC", "F"),
    "BAN Ivor": ("Ivor BAN", "M"), "KOJIC Frane": ("Frane KOJIC", "M"),
    "MALOBABIC Ivana": ("Ivana MALOBABIC", "F"),
    # HKG
    "WONG Chun Ting": ("WONG Chun Ting", "M"), "DOO Hoi Kem": ("DOO Hoi Kem", "F"),
    "CHAN Baldwin": ("CHAN Baldwin", "M"), "NG Wing Lam": ("NG Wing Lam", "F"),
    "LAM Siu Hang": ("LAM Siu Hang", "M"), "ZHU Chengzhu": ("ZHU Chengzhu", "F"),
    # TPE (姓 名)
    "LIN Yun-Ju": ("LIN Yun-Ju", "M"), "CHENG I-Ching": ("CHENG I-Ching", "F"),
    "HUANG Yu-Chiao": ("HUANG Yu-Chiao", "F"), "LIN Yen-Chun": ("LIN Yen-Chun", "M"),
    "KUO Guan-Hong": ("KUO Guan-Hong", "M"), "LI Yu-Jhun": ("LI Yu-Jhun", "F"),
    "KAO Cheng-Jui": ("KAO Cheng-Jui", "M"), "TSAI Yun-En": ("TSAI Yun-En", "F"),
    # IND (名 姓)
    "THAKKAR Manav": ("Manav THAKKAR", "M"), "GHOSH Swastika": ("Swastika GHOSH", "F"),
    "GNANASEKARAN Sathiyan": ("Sathiyan GNANASEKARAN", "M"), "CHITALE Diya": ("Diya CHITALE", "F"),
    "BATRA Manika": ("Manika BATRA", "F"), "JAIN Payas": ("Payas JAIN", "M"),
    "PAL Akash": ("Akash PAL", "M"), "GHORPADE Yashaswini": ("Yashaswini GHORPADE", "F"),
    # USA (名 姓)
    "NARESH Sid": ("Sid NARESH", "M"), "MOYLAND Sally": ("Sally MOYLAND", "F"),
    "LIANG Jishan": ("Jishan LIANG", "M"), "REYES LAI Jessica": ("Jessica REYES LAI", "F"),
    "PIYADASA Tashiya": ("Tashiya PIYADASA", "F"), "SHETH Ved": ("Ved SHETH", "M"),
    "YU Mandy": ("Mandy YU", "F"), "ZHANG Xiangjing": ("Xiangjing ZHANG", "F"),
    # ROU (名 姓)
    "SZOCS Bernadette": ("Bernadette SZOCS", "F"), "IONESCU Ovidiu": ("Ovidiu IONESCU", "M"),
    "DIACONU Adina": ("Adina DIACONU", "F"), "IONESCU Eduard": ("Eduard IONESCU", "M"),
    "SAMARA Elizabeta": ("Elizabeta SAMARA", "F"), "MOVILEANU Darius": ("Darius MOVILEANU", "M"),
    "DRAGOMAN Andreea": ("Andreea DRAGOMAN", "F"),
    # BRA (名 姓)
    "ARADO Felipe": ("Felipe ARADO", "M"), "WATANABE Laura": ("Laura WATANABE", "F"),
    "ROMANSKI Lucas": ("Lucas ROMANSKI", "M"), "SHIRAY Karina": ("Karina SHIRAY", "F"),
    "STRASSBURGER Victoria": ("Victoria STRASSBURGER", "F"),
    # CHI (名 姓)
    "BURGOS Nicolas": ("Nicolas BURGOS", "M"), "VEGA Paulina": ("Paulina VEGA", "F"),
    "ORTEGA Daniela": ("Daniela ORTEGA", "F"), "GOMEZ Gustavo": ("Gustavo GOMEZ", "M"),
    # EGY (名 姓)
    "ABDELAZIZ Youssef": ("Youssef ABDELAZIZ", "M"), "ALHODABY Mariam": ("Mariam ALHODABY", "F"),
    "ALHODABY Marwa": ("Marwa ALHODABY", "F"), "GODA Hana": ("Hana GODA", "F"),
    "ASSAR Omar": ("Omar ASSAR", "M"), "ELBEIALI Mohamed": ("Mohamed ELBEIALI", "M"),
    "MOSTAFA Badr": ("Badr MOSTAFA", "M"), "BADAWY Farida": ("Farida BADAWY", "F"),
    # AUS (名 姓)
    "BAE Hwan": ("Hwan BAE", "M"), "PSIHOGIOS Constantina": ("Constantina PSIHOGIOS", "F"),
    "LIU Yangzi": ("Yangzi LIU", "F"), "LUM Nicholas": ("Nicholas LUM", "M"),
    "LUU Finn": ("Finn LUU", "M"), "WU Jiamuwa": ("Jiamuwa WU", "F"),
}


def norm(pname):
    """返回 (规范名, 性别)。若未知返回 (原, None)。"""
    if pname in PLAYERS:
        return PLAYERS[pname]
    # 兜底: 尝试库反转
    return (pname, None)


def detect_category(comps):
    """根据两个 competitor 的 players 数量和性别判定项目。"""
    counts = [len(c.get("players", [])) for c in comps]
    g = []
    for c in comps:
        gs = [norm(p.get("playerName"))[1] for p in c.get("players", [])]
        g.append(gs)
    # 单打
    if counts == [1, 1]:
        gg = g[0][0]
        return "MS" if gg == "M" else ("WS" if gg == "F" else None)
    # 双打
    if counts == [2, 2]:
        genders = set(g[0] + g[1])
        if genders == {"M"}:
            return "MD"
        if genders == {"F"}:
            return "WD"
        if genders == {"M", "F"}:
            return "XD"
    return None


def parse_date(s):
    """'12/07/2025 19:00:00' -> '2025-12-07'"""
    try:
        d, t = s.split(" ")
        mm, dd, yyyy = d.split("/")
        return f"{yyyy}-{mm}-{dd}"
    except Exception:
        return ""


def get_comps(mr):
    return mr.get("competitiors") or mr.get("Competitiors") or []


def get_players(comp):
    return comp.get("players") or comp.get("Players") or []


def get_pname(p):
    return p.get("playerName") or p.get("PlayerName")


def get_scores(comp):
    return comp.get("scores") or comp.get("Scores") or ""


def detect_category(comps):
    """根据两个 competitor 的 players 数量和性别判定项目。"""
    counts = [len(get_players(c)) for c in comps]
    g = []
    for c in comps:
        gs = [norm(get_pname(p))[1] for p in get_players(c)]
        g.append(gs)
    # 单打
    if counts == [1, 1]:
        gg = g[0][0]
        return "MS" if gg == "M" else ("WS" if gg == "F" else None)
    # 双打
    if counts == [2, 2]:
        genders = set(g[0] + g[1])
        if genders == {"M"}:
            return "MD"
        if genders == {"F"}:
            return "WD"
        if genders == {"M", "F"}:
            return "XD"
    return None


def main():
    results = {"MS": [], "WS": [], "MD": [], "WD": [], "XD": []}
    unknown_players = set()
    undetected = []
    total = 0
    for card in CARDS:
        date = parse_date((card.get("matchDateTime") or {}).get("startDateLocal", ""))
        team = card.get("teamParentData", {}).get("extended_info", {})
        for m in team.get("matches", []):
            mr = m.get("match_result", {})
            comps = get_comps(mr)
            if len(comps) != 2:
                undetected.append((date, mr.get("documentCode"), "comps!=2"))
                continue
            cat = detect_category(comps)
            if not cat:
                undetected.append((date, mr.get("documentCode"), "cat=None"))
                continue
            # 记录所有球员用于未知检查
            for c in comps:
                for p in get_players(c):
                    if norm(get_pname(p))[1] is None:
                        unknown_players.add(get_pname(p))
            # 判胜者: overallScores 形如 "3-0", "2-1"; H 在前
            ov = mr.get("overallScores") or mr.get("OverallScores") or mr.get("resultOverallScores") or ""
            h = comps[0]
            a = comps[1]
            hw, aw = None, None
            try:
                part = ov.split("-")
                if len(part) == 2:
                    hw, aw = int(part[0]), int(part[1])
            except Exception:
                pass
            # 兜底: 用 scores 逐局比较
            if hw is None or hw == aw:
                hs = [int(x) for x in get_scores(h).split(",") if x]
                as_ = [int(x) for x in get_scores(a).split(",") if x]
                hw = sum(1 for x, y in zip(hs, as_) if x > y)
                aw = sum(1 for x, y in zip(hs, as_) if y > x)
            win = h if hw > aw else a
            lose = a if hw > aw else h
            # 生成胜者/负者组合名
            def combo(comp):
                ps = [norm(get_pname(p))[0] for p in get_players(comp)]
                return "/".join(ps) if len(ps) > 1 else ps[0]
            rec = {"日期": date, "类型": "世界杯团体", "胜者": combo(win), "负者": combo(lose)}
            results[cat].append(rec)
            total += 1

    print("总盘数:", total)
    for k in ["MS", "WS", "MD", "WD", "XD"]:
        print(f"{k}: {len(results[k])} 条")
    print("\n未判定:", len(undetected))
    for u in undetected:
        print("  ", u)
    print("\n未知球员:", sorted(unknown_players))

    # 输出临时文件
    outdir = ROOT / "tools"
    for k in ["MS", "WS", "MD", "WD", "XD"]:
        (outdir / f"_mtc2025_{k}.json").write_text(
            json.dumps(results[k], ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
        )
    print("临时文件已写入 tools/_mtc2025_*.json")


if __name__ == "__main__":
    main()
