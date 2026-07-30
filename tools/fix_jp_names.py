"""修复日本球员名格式：名在前，姓在后（姓全大写）
如 "HARIMOTO Tomokazu" → "Tomokazu HARIMOTO"
   "JUN Mizutani" → "Jun MIZUTANI"
"""
import json, re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
WTT = BASE / "wtt_data"

# 已知日本姓氏（全大写）→ 标准大写形式
JP_SURNAMES = {
    "SATO", "SUZUKI", "TAKAHASHI", "TANAKA", "ITO", "WATANABE",
    "YAMAMOTO", "NAKAMURA", "KOBAYASHI", "KATO", "YOSHIDA", "YAMADA",
    "SASAKI", "YAMAGUCHI", "MATSUMOTO", "INOUE", "KIMURA", "HAYASHI",
    "SHIMIZU", "SAITO", "MORI", "IKEDA", "HASHIMOTO", "ABE", "OGURA",
    "ISHIKAWA", "MAEDA", "FUJITA", "OKADA", "GOTO", "HASEGAWA",
    "MURAKAMI", "KONDO", "ISHII", "UCHIDA", "SAKAMOTO", "OTA",
    "HARIMOTO", "MATSUSHIMA", "NIWA", "MIZUTANI", "HIRANO", "FUKUHARA",
    "KISHIKAWA", "MATSUDAIRA", "OSHIMA", "MORIZONO", "YOSHIMURA", "UEDA",
    "CHIBA", "SHINOZUKA", "TOGAMI", "YOKOI", "SHIBATA", "HAYATA",
    "KIHARA", "MURAMATSU", "ODO", "NAGASAKI", "AKAE", "ASO", "AOKI",
    "MOTO", "FUJII", "UDA", "YOSHIYAMA", "SAKAI", "YOKOTANI", "YOSHIDA",
    "DOI", "MIYAGAWA", "OYA", "KURAMOCHI", "TAKEYA", "HONDA",
    # T联赛新增
    "ONO", "TSUBOI", "ARINOBU", "KAMI", "NAKANO", "ONODERA",
    "ISHIYAMA", "MAWATARI", "MACHI", "TAZOE", "SANBE", "EIDA",
    "YOKOYA", "MATSUYAMA", "RYUZAKI", "UEZU", "TANIGAKI", "MATSUSHITA",
    "OKANO", "NODA", "HAMADA", "TANIMOTO", "OIKAWA",
}

# 已知日本名字（首字母大写）
JP_GIVEN = {
    "Tomokazu", "Sora", "Shunsuke", "Hiroto", "Kazuhiro", "Maharu",
    "Koki", "Jun", "Mima", "Miu", "Hitomi", "Kasumi", "Seiya",
    "Kenta", "Kenji", "Masataka", "Yuto", "Cazuo", "Kaii", "Masaki",
    "Sayaka", "Ai", "Shiho", "Misaki", "Miyu", "Hiroko",
    "Satsuki", "Sakura", "Saki", "Sachi", "Miyu", "Miwa", "Hina",
    "Miyuu", "Bruna", "Ryoichi", "Yuta", "Yukiya", "Ryo",
    "Yuhi", "Asuka", "Jo", "Hayate", "Sho", "Yuya", "Aoi",
    "Reina", "Satoshi", "Kaho", "Cocona", "Honoka", "Mao",
    "Kasumi", "Miyu", "Rika", "Misuzu", "Saki",
    "Shiho", "Miyu", "Hikaru",
    # T联赛新增
    "Daito", "Yuma", "Taimu", "Takaya", "Kohaku",
    "Shohei", "Hiromu", "Keishi", "Soma",
    "Shin", "Motoki", "Hibiki", "Kohei", "Akira",
    "Yuki", "Toin", "Koji", "Taisei", "Takumi",
}

# 修复单个名字
def fix_jp_name(name):
    if not name or "/" in name:
        # 双打组合名，分别修复每个球员
        if name and "/" in name:
            parts = name.split("/")
            return "/".join(fix_jp_name(p.strip()) for p in parts)
        return name

    parts = name.strip().split()
    if len(parts) < 2:
        return name

    first, *rest = parts
    rest_str = " ".join(rest)

    # 情况1: "SURNAME Givenname" 或 "SURNAME Givenname" (姓在前，姓全大写)
    # 如 "HARIMOTO Tomokazu" → "Tomokazu HARIMOTO"
    if first in JP_SURNAMES and rest_str in JP_GIVEN:
        return f"{rest_str} {first}"

    # 情况2: "GIVENNAME Surname" 或 "GIVEN Surname" (名在前且全大写，姓不是全大写)
    # 如 "JUN Mizutani" → "Jun MIZUTANI"
    first_upper = first.upper()
    rest_upper = rest_str.upper()
    if first_upper in JP_GIVEN and rest_upper in JP_SURNAMES and rest_str != rest_upper:
        # 名字首字母大写，姓氏全大写
        proper_given = first[0].upper() + first[1:].lower()
        return f"{proper_given} {rest_upper}"

    # 情况3: "Surname Givenname" (姓在前但非全大写)
    # 如 "SEIYA Kishikawa" → "Seiya KISHIKAWA"  (名全大写、姓非全大写)
    # 这其实是名字在前（全大写），姓氏在后（非全大写）
    if first_upper in JP_GIVEN and rest_upper in JP_SURNAMES:
        return f"{first[0].upper() + first[1:].lower()} {rest_upper}"
    
    # 情况4: "Surname Givenname" (姓在前，姓非全大写)
    # 如 "Mizutani Jun" → "Jun MIZUTANI"
    # 这在 report 中似乎没有，但以防万一
    if rest_str in JP_GIVEN and first.upper() in JP_SURNAMES and first != first.upper():
        return f"{rest_str} {first.upper()}"

    return name

def fix_file(filepath, label):
    if not filepath.exists():
        return
    raw = filepath.read_bytes()
    if not raw.strip():
        return
    data = json.loads(raw.decode("utf-8-sig"))
    changes = 0
    player_changes = set()
    for r in data:
        for key in ["胜者", "负者", "对象"]:
            if key in r and r[key]:
                old = r[key]
                fixed = fix_jp_name(old)
                if fixed != old:
                    r[key] = fixed
                    changes += 1
                    player_changes.add(old)
    if changes:
        filepath.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"  ✅ {label}: 修正 {changes} 处, 涉及 {len(player_changes)} 个球员名")
    else:
        print(f"  ✅ {label}: 无需修正")

def main():
    print("=" * 50)
    print("日本球员名格式修正")
    print("目标: 名在前，姓在后（姓全大写）")
    print("如: HARIMOTO Tomokazu → Tomokazu HARIMOTO")
    print("=" * 50)

    # 需要检查的文件
    checks = [
        (WTT / "ms" / "score-log-2008-ittf.json", "MS 2008"),
        (WTT / "ms" / "score-log-2009-ittf.json", "MS 2009"),
        (WTT / "ms" / "score-log-2021-wtt.json", "MS 2021"),
        (WTT / "ms" / "score-log-2022-wtt.json", "MS 2022"),
        (WTT / "ms" / "score-log-2023-wtt.json", "MS 2023"),
        (WTT / "ms" / "score-log-2024-wtt.json", "MS 2024"),
        (WTT / "ms" / "score-log-2025-wtt.json", "MS 2025"),
        (WTT / "ms" / "score-log-2026-wtt.json", "MS 2026"),
        (WTT / "ws" / "score-log-2008-ittf.json", "WS 2008"),
        (WTT / "ws" / "score-log-2009-ittf.json", "WS 2009"),
        (WTT / "ws" / "score-log-2022-ws.json", "WS 2022"),
        (WTT / "ws" / "score-log-2023-ws.json", "WS 2023"),
        (WTT / "ws" / "score-log-2024-ws.json", "WS 2024"),
        (WTT / "ws" / "score-log-2025-ws.json", "WS 2025"),
        (WTT / "ws" / "score-log-2026-ws.json", "WS 2026"),
        (WTT / "md" / "score-log-2024-wtt.json", "MD 2024"),
        (WTT / "md" / "score-log-2025-wtt.json", "MD 2025"),
        (WTT / "md" / "score-log-2026-wtt.json", "MD 2026"),
        (WTT / "wd" / "score-log-2024-wtt.json", "WD 2024"),
        (WTT / "wd" / "score-log-2025-wtt.json", "WD 2025"),
        (WTT / "wd" / "score-log-2026-wtt.json", "WD 2026"),
        (WTT / "xd" / "score-log-2024-wtt.json", "XD 2024"),
        (WTT / "xd" / "score-log-2025-wtt.json", "XD 2025"),
        (WTT / "xd" / "score-log-2026-wtt.json", "XD 2026"),
    ]

    total_changes = 0
    for fp, label in checks:
        fix_file(fp, label)
        # 简单统计（从 fix_file 内部无法直接获取 changes 计数，这里简单累加估算）

    # 另外检查 initial-scores.json 中是否也有日本球员名
    for cat in ["ms", "ws", "md", "wd", "xd"]:
        isf = WTT / cat / "initial-scores.json"
        if isf.exists():
            raw = isf.read_bytes()
            if raw.strip():
                try:
                    data = json.loads(raw.decode("utf-8-sig"))
                    if isinstance(data, dict) and "initialScores" in data:
                        changed = 0
                        new_scores = {}
                        for name, score in data["initialScores"].items():
                            fixed = fix_jp_name(name)
                            if fixed != name:
                                changed += 1
                            new_scores[fixed] = score
                        if changed:
                            data["initialScores"] = new_scores
                            isf.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                            print(f"  ✅ {cat}/initial-scores.json: 修正 {changed} 个球员名")
                except:
                    pass

    print("\n" + "=" * 50)
    print("修正完成！")

if __name__ == "__main__":
    main()
