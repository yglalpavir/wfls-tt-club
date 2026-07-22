#!/usr/bin/env python3
"""
WTT 比赛数据爬取 (2021-2026)
爬取 WS/MD/WD/XD 数据，格式与已有 MS 数据一致。
通过 PowerShell 进行 HTTP 请求。
"""

import re, json, subprocess, time, logging
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "wtt_data"
START_YEAR, END_YEAR = 2021, 2026

# 只爬取缺少数据的类别
TARGET_CATS = {"WS": "女子单打", "MD": "男子双打", "WD": "女子双打", "XD": "混合双打"}

# 赛事类型映射 (英文关键词 → 中文名)
EVENT_TYPE_MAP = [
    (r"Grand\s*Smash", "大满贯"),
    (r"Champions\b(?!hip)", "冠军赛"),
    (r"Star\s*Contender", "球星挑战赛"),
    (r"Contender(?!.*Star)", "常规挑战赛"),
    (r"Finals|Cup\s*Finals", "总决赛"),
    (r"Feeder", "支线赛"),
    (r"Youth", ""),  # 跳过青年赛事
]

# 已知东亚姓氏
ASIAN = {
    "WANG","ZHANG","LI","LIU","CHEN","YANG","HUANG","ZHAO","WU","ZHOU","XU",
    "SUN","MA","ZHU","HU","GUO","HE","GAO","LIN","LUO","LIANG","SONG","ZHENG",
    "XIE","HAN","TANG","FENG","YU","DONG","XIAO","CHENG","CAO","YUAN","DENG",
    "FU","SHEN","ZENG","PENG","LV","SU","JIANG","CAI","JIA","DING","WEI","XUE",
    "YE","YAN","PAN","DU","DAI","XIA","ZHONG","TIAN","REN","FAN","FANG","SHI",
    "YAO","TAN","LIAO","ZOU","XIONG","JIN","LU","HAO","KONG","BAI","CUI","KANG",
    "MAO","QIU","QIN","GU","HOU","SHAO","MENG","LONG","WAN","DUAN","LEI","QIAN",
    "YIN","YI","CHANG","QIAO","LAI","GONG","WEN","NG","CHAN","CHEUNG","CHIU",
    "CHOW","CHU","FONG","HO","HUI","KWAN","LAM","LAU","LEE","LEUNG","POON",
    "TAM","TANG","TSANG","YIP","YUEN","CHUANG","HSU","TSAI","KIM","PARK","CHOI",
    "JUNG","KANG","CHO","YOON","JANG","LIM","OH","SHIN","SEO","KWON","HWANG",
    "AHN","JEON","HONG","YOO","JOO","RYU","NAM","BAEK","MOON","CHA","HEO",
    "JEONG","KO","SATO","SUZUKI","TAKAHASHI","TANAKA","ITO","YAMAMOTO",
    "NAKAMURA","KOBAYASHI","KATO","YOSHIDA","YAMADA","SASAKI","YAMAGUCHI",
    "MATSUMOTO","INOUE","KIMURA","HAYASHI","SHIMIZU","SAITO","MORI","IKEDA",
    "HASHIMOTO","ABE","OGURA","ISHIKAWA","MAEDA","FUJITA","OKADA","GOTO",
    "HASEGAWA","MURAKAMI","KONDO","ISHII","UCHIDA","SAKAMOTO","OTA",
    "HARIMOTO","MATSUSHIMA","NIWA","MIZUTANI","HIRANO","FUKUHARA",
    "KISHIKAWA","MATSUDAIRA","OSHIMA","MORIZONO","YOSHIMURA","UEDA","TSUBOI",
    "NGUYEN","TRAN","PHAM","HOANG","HUYNH","PHAN","VU","VO","DANG","BUI","DO",
    "NGO","DUONG","LY","WATANABE","WONG","JOO","JIN","SHIN","JANG","SEOK",
    "LIAO","CHIANG","YANG","HUNG","KUO","TSENG","CHIEN","CHUANG","CHENG",
    "CHOU","HSUEH","LAN","PENG","TAI","TENG","WU","LIAW",
}

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("wtt")


# ============================================================
# HTTP via PowerShell
# ============================================================

def ps_get(url, cookie=None, timeout=30):
    h = '"User-Agent"="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0"'
    if cookie:
        cookie = cookie.replace('"','""')
        h += f'; "Cookie"="{cookie}"'
    cmd = (f'try{{$r=Invoke-WebRequest -Uri "{url}" -TimeoutSec {timeout} '
           f'-UseBasicParsing -Headers @{{{h}}};'
           f'[Console]::OutputEncoding=[Text.Encoding]::UTF8;'
           f'Write-Output $r.Content}}catch{{Write-Output "ERR"}}')
    r = subprocess.run(["powershell","-NoProfile","-Command",cmd],
                       capture_output=True,text=True,timeout=timeout+15,
                       encoding="utf-8",errors="replace")
    s = r.stdout.strip()
    return s if s and not s.startswith("ERR") and len(s)>50 else None


# ============================================================
# ITTF 登录
# ============================================================

def ittf_login():
    """登录 ITTF。需要手动设置凭据。"""
    from os import environ
    user = environ.get("ITTF_USERNAME", "Yglalpavir@gmail.com")
    pwd = environ.get("ITTF_PASSWORD", "Suki0910@")

    log.info("正在登录 ITTF...")
    page = ps_get("https://results.ittf.link/index.php?option=com_users&view=login")
    if not page:
        log.error("无法访问登录页(可能仍被限速)")
        return None

    m = re.search(r'name="([a-f0-9]{32})"[^>]*value="1"', page)
    if not m:
        log.error("未找到CSRF token")
        return None

    csrf = m.group(1)
    body = f"username={user}&password={pwd}&task=user.login&{csrf}=1"

    cmd = (f'try{{$r=Invoke-WebRequest -Uri '
           f'"https://results.ittf.link/index.php?option=com_users&view=login" '
           f'-Method POST -Body "{body}" -ContentType "application/x-www-form-urlencoded" '
           f'-TimeoutSec 30 -UseBasicParsing '
           f'-Headers @{{"User-Agent"="Mozilla/5.0"}} '
           f'-SessionVariable s;'
           f'$c=$s.Cookies.GetCookies("https://results.ittf.link/")|%{{"$($_.Name)=$($_.Value)"}};'
           f'Write-Output ($c -join "; ")}}catch{{Write-Output "ERR"}}')
    r = subprocess.run(["powershell","-NoProfile","-Command",cmd],
                       capture_output=True,text=True,timeout=45,
                       encoding="utf-8",errors="replace")
    cookie = r.stdout.strip()
    if cookie and len(cookie)>20 and not cookie.startswith("ERR"):
        n = len(cookie.split(";"))
        log.info(f"✅ 登录成功 ({n} cookies)")
        return cookie
    log.error(f"登录失败")
    return None


# ============================================================
# 名称格式化
# ============================================================

def format_name(name):
    """格式化球员名称。"""
    if "/" in name:
        return " / ".join(format_name(p.strip()) for p in name.split("/"))
    parts = name.strip().split()
    if len(parts) < 2:
        return name.strip()
    if parts[0].upper() in ASIAN:
        return f"{parts[0].upper()} {' '.join(parts[1:])}"
    elif parts[-1].upper() in ASIAN:
        return f"{' '.join(parts[:-1])} {parts[-1].upper()}"
    *given, surname = parts
    return f"{' '.join(given)} {surname.upper()}"


def classify_event(event_name):
    """将赛事名分类为中文类型。"""
    for pattern, label in EVENT_TYPE_MAP:
        if re.search(pattern, event_name, re.IGNORECASE):
            return label
    return "其他赛事"


# ============================================================
# 数据获取
# ============================================================

def fetch_events(cookie):
    """获取 2021-2026 的赛事列表。"""
    events = []
    offset = 0
    log.info("获取赛事列表...")
    while True:
        url = (f"https://results.ittf.link/index.php?option=com_fabrik&view=list"
               f"&listid=27&Itemid=268&format=json&limit27=100&limitstart27={offset}")
        raw = ps_get(url, cookie)
        if not raw: break
        try: data = json.loads(raw)
        except: break
        rows = (data[0] if isinstance(data,list) and data and isinstance(data[0],list)
                else (data.get("data",[]) if isinstance(data,dict) else []))
        if not rows: break

        for r in rows:
            eid = r.get("__pk_val") or r.get("vw_tournaments___id_raw","")
            ename = (r.get("vw_tournaments___tournament_raw","") or r.get("tour_name","")).strip()
            dt = (r.get("vw_tournaments___tour_end_raw","") or r.get("tour_end","")).strip()[:10]
            if not eid or not ename or not dt: continue
            try:
                year = int(dt[:4])
                if year < START_YEAR or year > END_YEAR: continue
            except: continue

            tid = r.get("vw_tournaments___tournament_id_raw") or eid
            classify = classify_event(ename)
            if not classify or classify == "支线赛": continue  # skip youth/feeder

            try: events.append({"event_id":int(eid),"tournament_id":int(tid),
                               "event_name":ename,"event_date":dt,"event_type":classify,"year":year})
            except: pass

        if len(rows) < 100: break
        offset += 100; time.sleep(0.3)

    events.sort(key=lambda e: e["event_date"])
    log.info(f"筛选出 {len(events)} 个赛事")
    return events


def fetch_matches(cookie, event, cats):
    """获取单个赛事的比赛。"""
    matches = []
    tid = event["tournament_id"]
    offset = 0

    while True:
        url = (f"https://results.ittf.link/index.php?option=com_fabrik&view=list"
               f"&listid=31&Itemid=250&resetfilters=1&format=json"
               f"&vw_matches___tournament_id_raw[value][]={tid}"
               f"&limit31=100&limitstart31={offset}")
        raw = ps_get(url, cookie)
        if not raw: break
        try: data = json.loads(raw)
        except: break
        rows = (data[0] if isinstance(data,list) and data and isinstance(data[0],list)
                else (data.get("data",[]) if isinstance(data,dict) else []))
        if not rows: break

        for r in rows:
            cat = (r.get("vw_matches___event_raw","") or "").strip()
            if cat not in cats: continue

            pa = (r.get("vw_matches___name_a_raw","") or "").strip()
            px = (r.get("vw_matches___name_x_raw","") or "").strip()
            if not pa or not px: continue

            # 双打搭档
            ba = (r.get("vw_matches___name_b_raw","") or "").strip()
            by_ = (r.get("vw_matches___name_y_raw","") or "").strip()

            if cat in ("MD","WD","XD") and ba and by_:
                n1 = f"{format_name(pa)} / {format_name(ba)}"
                n2 = f"{format_name(px)} / {format_name(by_)}"
            else:
                n1 = format_name(pa)
                n2 = format_name(px)

            # 比分
            res = (r.get("vw_matches___res_raw","") or "").strip()
            res = re.sub(r'\s*-\s*',':',res)
            if not re.match(r'^\d+:\d+$',res): continue

            a,b = int(res.split(':')[0]), int(res.split(':')[1])
            if a==b: continue
            w,l = (n1,n2) if a>b else (n2,n1)

            matches.append({
                "日期": event["event_date"],
                "类型": event["event_type"],
                "胜者": w,
                "负者": l,
            })

        if len(rows) < 100: break
        offset += 100; time.sleep(0.3)

    return matches


# ============================================================
# 保存 (匹配 MS 格式)
# ============================================================

def save_by_year(category_records):
    """按年份保存到各 score-log-{year}-{cat}.json。"""
    for cat, recs in category_records.items():
        if not recs: continue
        cat_dir = DATA_DIR / cat.lower()
        cat_dir.mkdir(parents=True, exist_ok=True)

        # 按年份分组
        by_year = {}
        for r in recs:
            yr = r["日期"][:4]
            if yr not in by_year: by_year[yr] = []
            by_year[yr].append(r)

        for yr, year_recs in by_year.items():
            # 读取现有文件
            fname = f"score-log-{yr}-{cat.lower()}.json"
            fp = cat_dir / fname
            existing = []
            if fp.exists():
                existing = json.loads(fp.read_text(encoding="utf-8"))

            # 去重合并
            seen = {(r.get("日期",""),r.get("胜者",""),r.get("负者","")) for r in existing}
            new = 0
            for r in year_recs:
                k = (r["日期"],r["胜者"],r["负者"])
                if k not in seen:
                    seen.add(k); existing.append(r); new+=1

            existing.sort(key=lambda r: r["日期"])
            fp.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
            log.info(f"  {cat} {yr}: +{new} → {len(existing)} 条")

        # 更新 seasons.json 和 score-log.json
        update_seasons(cat)
        update_main_log(cat)


def update_seasons(cat):
    """更新赛季配置。"""
    cat_dir = DATA_DIR / cat.lower()
    sf = cat_dir / "seasons.json"
    seasons = []
    for y in range(START_YEAR, END_YEAR + 1):
        seasons.append({
            "id": f"{y}-{cat.lower()}",
            "label": f"{y}-{cat.upper()}",
            "startDate": f"{y}-01-01",
            "endDate": f"{y}-12-31",
            "visible": True,
            "snapshotDates": [f"{y}-{m:02d}-01" for m in range(1,13)],
        })
    sf.write_text(json.dumps(seasons, ensure_ascii=False, indent=2), encoding="utf-8")


def update_main_log(cat):
    """更新主 score-log.json (合并所有年份)。"""
    cat_dir = DATA_DIR / cat.lower()
    all_records = []
    for f in sorted(cat_dir.glob("score-log-20*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        all_records.extend(data)

    sf = cat_dir / "score-log.json"
    sf.write_text(json.dumps(all_records, ensure_ascii=False, indent=2), encoding="utf-8")


# ============================================================
# 主流程
# ============================================================

def main():
    log.info("="*50)
    log.info(f"WTT 数据爬取 {START_YEAR}-{END_YEAR}")
    log.info(f"目标: {', '.join(TARGET_CATS.keys())}")
    log.info("="*50)

    # 登录
    cookie = ittf_login()
    if not cookie:
        log.error("❌ 登录失败。ITTF可能仍被限速，请稍后再试。")
        return

    # 获取赛事
    events = fetch_events(cookie)
    if not events:
        log.error("❌ 未获取到赛事")
        return

    # 显示年份分布
    yr_counts = {}
    for e in events:
        yr_counts[e["year"]] = yr_counts.get(e["year"],0) + 1
    for y in range(START_YEAR, END_YEAR+1):
        log.info(f"  {y}: {yr_counts.get(y,0)} 赛事")

    # 爬取比赛
    all_records = {cat: [] for cat in TARGET_CATS}
    total_events = len(events)

    for i, event in enumerate(events, 1):
        if i % 50 == 0 or i == 1:
            log.info(f"  进度: {i}/{total_events} - {event['event_name'][:50]}")

        for cat in TARGET_CATS:
            ms = fetch_matches(cookie, event, {cat})
            all_records[cat].extend(ms)

        time.sleep(0.2)

    # 统计
    log.info("\n📊 爬取结果:")
    total = 0
    for cat in TARGET_CATS:
        n = len(all_records[cat])
        total += n
        log.info(f"  {cat}: {n} 条")
    log.info(f"  总计: {total} 条")

    if total > 0:
        save_by_year(all_records)
        log.info("\n🎉 完成!")
    else:
        log.warning("\n⚠️ 未获取到数据")


if __name__ == "__main__":
    main()
