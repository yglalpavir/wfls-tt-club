#!/usr/bin/env python3
"""
Wikipedia 乒乓球世锦赛 & 奥运会 比赛数据爬取工具 (2008-2020)
通过 PowerShell 获取 Wikipedia RAW wikitext，解析 Bracket 模板提取比赛对阵。
"""

import re
import json
import subprocess
import time
import logging
from pathlib import Path

START_YEAR = 2008
END_YEAR = 2020
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "ittf_data"

CATEGORIES = {
    "MS": "男子单打", "WS": "女子单打",
    "MD": "男子双打", "WD": "女子双打",
    "XD": "混合双打",
}

CATEGORY_WIKI_SUFFIX = {
    "MS": "Men%27s_singles", "WS": "Women%27s_singles",
    "MD": "Men%27s_doubles", "WD": "Women%27s_doubles",
    "XD": "Mixed_doubles",
}

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("wiki")


def fetch_raw(url):
    """Get Wikipedia raw wikitext via PowerShell."""
    ps = (
        'try{$h=@{"User-Agent"="Mozilla/5.0"};'
        '$r=Invoke-WebRequest -Uri "' + url + '" -TimeoutSec 30 -UseBasicParsing -Headers $h;'
        '[Console]::OutputEncoding=[Text.Encoding]::UTF8;'
        'Write-Output $r.Content}catch{exit 1}'
    )
    try:
        r = subprocess.run(["powershell","-NoProfile","-Command",ps],
                          capture_output=True, text=True, timeout=45,
                          encoding="utf-8", errors="replace")
        if r.returncode == 0 and r.stdout and len(r.stdout) > 100:
            return r.stdout
        return None
    except:
        return None


def get_page_urls():
    urls = []
    for year in range(START_YEAR, END_YEAR + 1):
        if year % 2 == 0:
            continue
        for cat, suffix in CATEGORY_WIKI_SUFFIX.items():
            title = f"{year}_World_Table_Tennis_Championships_%E2%80%93_{suffix}"
            url = f"https://en.wikipedia.org/w/index.php?title={title}&action=raw"
            urls.append((url, cat, "世锦赛", year))
    for year in [2008, 2012, 2016, 2020]:
        for cat, suffix in CATEGORY_WIKI_SUFFIX.items():
            title = f"Table_tennis_at_the_{year}_Summer_Olympics_%E2%80%93_{suffix}"
            url = f"https://en.wikipedia.org/w/index.php?title={title}&action=raw"
            urls.append((url, cat, "奥运会", year))
    return urls


def clean_name(raw):
    """Clean wiki player name: {{flagicon|CHN}} '''[[Wang Hao|Wang H]]''' -> Wang Hao"""
    name = re.sub(r'\{\{flagicon\|[^}]+\}\}', '', raw)
    is_win = "'''" in name
    name = name.replace("'''", "")
    links = re.findall(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', name)
    if links:
        display = links[0][1] if links[0][1] else links[0][0]
        return display.strip(), is_win
    return name.strip(), is_win


def parse_brackets(wikitext):
    """Extract all bracket matches from wikitext."""
    # Find bracket templates
    tmpl_match = re.search(r'\{\{(?:\d+TeamBracket|8TeamBracket|4TeamBracket)', wikitext)
    if not tmpl_match:
        return []

    start = tmpl_match.start()
    # Find all bracket instances
    brackets = []
    for m in re.finditer(r'\{\{(?:\d+TeamBracket|8TeamBracket|4TeamBracket)', wikitext):
        depth = 1
        i = m.end()
        while i < len(wikitext) and depth > 0:
            if wikitext[i:i+2] == '}}':
                depth -= 1
                i += 2
            elif wikitext[i:i+2] == '{{':
                depth += 1
                i += 2
            else:
                i += 1
        brackets.append(wikitext[m.start():i])

    all_matches = []
    for bracket_text in brackets:
        # Parse params
        params = {}
        for line in bracket_text.split('\n'):
            line = line.strip()
            if line.startswith('| '):
                line = line[1:].strip()
                if '=' in line:
                    key, _, value = line.partition('=')
                    params[key.strip()] = value.strip()

        # Find all round prefixes
        rounds = set()
        for k in params:
            m = re.match(r'(RD\d+)-seed\d+', k)
            if m:
                rounds.add(m.group(1))

        for rd in sorted(rounds):
            nums = set()
            for k in params:
                m = re.match(rf'{rd}-seed(\d+)', k)
                if m:
                    nums.add(int(m.group(1)))

            for num in sorted(nums):
                if num % 2 == 0:
                    continue
                n2 = num + 1

                t1_key = f"{rd}-team{num:02d}"
                t2_key = f"{rd}-team{n2:02d}"
                if t1_key not in params or t2_key not in params:
                    continue

                p1, w1 = clean_name(params[t1_key])
                p2, w2 = clean_name(params[t2_key])
                if not p1 or not p2 or w1 == w2:
                    continue

                s1, s2 = [], []
                for s in range(1, 9):
                    k1 = f"{rd}-score{num:02d}-{s}"
                    k2 = f"{rd}-score{n2:02d}-{s}"
                    if k1 in params and k2 in params:
                        v1 = params[k1].replace("'''","")
                        v2 = params[k2].replace("'''","")
                        if v1.isdigit() and v2.isdigit():
                            s1.append(int(v1))
                            s2.append(int(v2))

                all_matches.append({
                    'player1': p1, 'player2': p2,
                    'winner_is_1': w1,
                    'scores1': s1, 'scores2': s2,
                })

    return all_matches


def to_records(bracket_matches, event_name, year):
    records = []
    for bm in bracket_matches:
        if bm['winner_is_1']:
            w, l = bm['player1'], bm['player2']
            ws, ls = bm['scores1'], bm['scores2']
        else:
            w, l = bm['player2'], bm['player1']
            ws, ls = bm['scores2'], bm['scores1']

        n = min(len(ws), len(ls))
        if n < 3:
            continue

        ss = " ".join(f"{ws[i]}:{ls[i]}" for i in range(n))
        d = f"{year}-05-15" if event_name == "世锦赛" else f"{year}-08-10"

        records.append({
            "日期": d, "类型": event_name,
            "胜者": w, "负者": l,
            "比分": ss, "数据来源": "Wikipedia",
        })
    return records


def main():
    logger.info("=" * 50)
    logger.info("Wikipedia 乒乓球数据爬取 (2008-2020)")
    logger.info("=" * 50)

    all_pages = get_page_urls()
    logger.info(f"共 {len(all_pages)} 个页面\n")

    all_data = {cat: [] for cat in CATEGORIES}
    total = 0

    for url, cat, event_name, year in all_pages:
        logger.info(f"📄 {event_name} {year} - {CATEGORIES[cat]}")
        wt = fetch_raw(url)
        if not wt:
            logger.warning("  ❌ 获取失败")
            continue

        bm = parse_brackets(wt)
        recs = to_records(bm, event_name, year)
        all_data[cat].extend(recs)
        total += len(recs)
        logger.info(f"  ✅ {len(recs)} 场比赛")
        time.sleep(1.5)

    logger.info(f"\n📊 总计: {total} 场比赛\n")

    if total == 0:
        logger.error("❌ 未获取到数据")
        return

    # Save
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for cat, cn in CATEGORIES.items():
        m = all_data[cat]
        if not m:
            continue
        seen = set()
        uniq = []
        for r in m:
            k = (r["日期"], r["胜者"], r["负者"])
            if k not in seen:
                seen.add(k)
                uniq.append(r)

        d = OUTPUT_DIR / cat.lower()
        d.mkdir(parents=True, exist_ok=True)
        with open(d / "score-log.json", "w", encoding="utf-8") as f:
            json.dump(uniq, f, ensure_ascii=False, indent=2)

        seasons = [{
            "id": f"{y}-{cat.lower()}", "label": f"{y}-{cat}",
            "startDate": f"{y}-01-01", "endDate": f"{y}-12-31",
            "visible": True,
            "snapshotDates": [f"{y}-{mo:02d}-01" for mo in range(1, 13)],
        } for y in range(START_YEAR, END_YEAR + 1)]
        with open(d / "seasons.json", "w", encoding="utf-8") as f:
            json.dump(seasons, f, ensure_ascii=False, indent=2)

        with open(d / "event-coefficient.json", "w", encoding="utf-8") as f:
            json.dump({"世锦赛": 0.5, "奥运会": 0.5}, f, ensure_ascii=False, indent=2)

        with open(d / "settings.json", "w", encoding="utf-8") as f:
            json.dump({"_说明": f"{cn}({cat}) Wikipedia数据。",
                        "scoreMode": "flat1300", "baseScore": 1300},
                      f, ensure_ascii=False, indent=2)

        with open(d / "initial-scores.json", "w", encoding="utf-8") as f:
            json.dump({}, f, ensure_ascii=False, indent=2)

        logger.info(f"✅ {cat}: 保存 {len(uniq)} 条 → {d}")

    logger.info("\n🎉 完成!")


if __name__ == "__main__":
    main()
