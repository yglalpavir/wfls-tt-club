#!/usr/bin/env python3
"""
ITTF World Tour 数据爬取 + Wikipedia 名称修正
通过 PowerShell 进行 HTTP 请求。
"""

import re, json, subprocess, time, logging
from pathlib import Path

START_YEAR, END_YEAR = 2008, 2020
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "ittf_data"
ITTF_USER, ITTF_PASS = "Yglalpavir@gmail.com", "Suki0910@"

CATEGORIES = {"MS":"男子单打","WS":"女子单打","MD":"男子双打","WD":"女子双打","XD":"混合双打"}

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("ittf")

# ============================================================
# PowerShell HTTP
# ============================================================

def ps_get(url, cookie=None, timeout=30):
    """PowerShell GET, returns text or None."""
    h = '"User-Agent"="Mozilla/5.0 (Windows NT 10.0; Win64; x64)"'
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
    log.info("登录 ITTF...")
    page = ps_get("https://results.ittf.link/index.php?option=com_users&view=login")
    if not page: return None
    m = re.search(r'name="([a-f0-9]{32})"[^>]*value="1"', page)
    if not m: return None
    csrf = m.group(1)

    # 用 application/x-www-form-urlencoded
    body = f"username={ITTF_USER}&password={ITTF_PASS}&task=user.login&{csrf}=1"
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
        log.info(f"✅ 登录成功 ({len(cookie.split(';'))} cookies)")
        return cookie
    log.error("登录失败")
    return None


# ============================================================
# ITTF 数据获取
# ============================================================

def fetch_events(cookie):
    """获取 ITTF World Tour 赛事。"""
    events = []
    offset = 0
    while True:
        url = (f"https://results.ittf.link/index.php?option=com_fabrik&view=list"
               f"&listid=27&Itemid=268&format=json&limit27=100&limitstart27={offset}")
        raw = ps_get(url, cookie)
        if not raw: break
        try: data = json.loads(raw)
        except: break
        rows = data[0] if isinstance(data,list) and data and isinstance(data[0],list) else (data.get("data",[]) if isinstance(data,dict) else [])
        if not rows: break
        for r in rows:
            eid = r.get("__pk_val") or r.get("vw_tournaments___id_raw","")
            ename = (r.get("vw_tournaments___tournament_raw","") or r.get("tour_name","")).strip()
            dt = (r.get("vw_tournaments___tour_end_raw","") or r.get("tour_end","")).strip()[:10]
            if not eid or not ename or not dt: continue
            tid = r.get("vw_tournaments___tournament_id_raw") or eid
            try: events.append({"event_id":int(eid),"tournament_id":int(tid),"event_name":ename,"event_date":dt})
            except: pass
        if len(rows)<100: break
        offset+=100; time.sleep(0.5)

    # 筛选 World Tour
    wt = [e for e in events if any(k.lower() in e["event_name"].lower()
          for k in ["world tour","pro tour","worldtour","protour"])]
    wt = [e for e in wt if START_YEAR<=int(e["event_date"][:4])<=END_YEAR]
    wt.sort(key=lambda e:e["event_date"])
    log.info(f"共 {len(events)} 个赛事, 筛选 {len(wt)} 个 World Tour")
    return wt


def fetch_matches(cookie, event, cats):
    """获取赛事比赛数据。"""
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
        rows = data[0] if isinstance(data,list) and data and isinstance(data[0],list) else (data.get("data",[]) if isinstance(data,dict) else [])
        if not rows: break
        for r in rows:
            cat = (r.get("vw_matches___event_raw","") or "").strip()
            if cat not in cats: continue
            pa = (r.get("vw_matches___name_a_raw","") or "").strip()
            px = (r.get("vw_matches___name_x_raw","") or "").strip()
            if not pa or not px: continue
            ba = (r.get("vw_matches___name_b_raw","") or "").strip()
            by_ = (r.get("vw_matches___name_y_raw","") or "").strip()

            if cat in ("MD","WD","XD") and ba and by_:
                n1, n2 = f"{pa}/{ba}", f"{px}/{by_}"
            else:
                n1, n2 = pa, px

            res = (r.get("vw_matches___res_raw","") or "").strip()
            res = re.sub(r'\s*-\s*',':',res)
            if not re.match(r'^\d+:\d+$',res): continue
            a,b = int(res.split(':')[0]), int(res.split(':')[1])
            if a==b: continue
            w,l = (n1,n2) if a>b else (n2,n1)

            games = (r.get("vw_matches___games_raw","") or "").strip()
            score = res
            if games:
                score = " ".join(re.findall(r'(\d+:\d+)', games.replace('-',':')))

            matches.append({
                "日期":event["event_date"],"类型":"世界巡回赛",
                "赛事":event["event_name"],
                "胜者":w,"负者":l,"比分":score,"数据来源":"ITTF"
            })
        if len(rows)<100: break
        offset+=100; time.sleep(0.5)
    return matches


# ============================================================
# 名称修正
# ============================================================

def format_name(name):
    """格式化球员名称为 LASTNAME Firstname 格式。"""
    if "/" in name:
        return " / ".join(format_name(p.strip()) for p in name.split("/"))
    parts = name.strip().split()
    if len(parts) >= 2:
        return f"{parts[0].upper()} {' '.join(parts[1:])}"
    return name.strip()

def fix_wiki_names():
    """修正 Wikipedia 数据中的球员名称。"""
    log.info("\n修正 Wikipedia 名称...")
    raw_dir = DATA_DIR / "_raw"
    if not raw_dir.exists():
        log.warning("无 _raw 目录")
        return

    name_map = {}
    for wf in raw_dir.glob("*.wiki"):
        wt = wf.read_text(encoding="utf-8")
        for m in re.finditer(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', wt):
            full = m.group(1).strip()
            short = (m.group(2) or full).strip()
            full = re.sub(r'\([^)]*\)','',full).strip().split("(")[0].strip()
            if len(short)>=3 and len(full)>=3 and short.lower()!=full.lower():
                name_map[short] = full

    log.info(f"{len(name_map)} 条名称映射")

    for cat in sorted(DATA_DIR.glob("*")):
        if not cat.is_dir() or cat.name.startswith("_"): continue
        sf = cat / "score-log.json"
        if not sf.exists(): continue
        records = json.loads(sf.read_text(encoding="utf-8"))
        fixed = 0
        for r in records:
            if r.get("数据来源")!="Wikipedia": continue
            ow,ol = r["胜者"],r["负者"]
            nw = format_name(name_map.get(ow, ow))
            nl = format_name(name_map.get(ol, ol))
            if nw!=ow or nl!=ol:
                r["胜者"],r["负者"] = nw,nl
                fixed += 1
        sf.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding="utf-8")
        log.info(f"  {cat.name}: {fixed}/{len(records)}")

# ============================================================
# 保存
# ============================================================

def save(category_records):
    for cat, recs in category_records.items():
        if not recs: continue
        d = DATA_DIR / cat.lower(); d.mkdir(parents=True,exist_ok=True)
        sf = d / "score-log.json"
        exist = json.loads(sf.read_text(encoding="utf-8")) if sf.exists() else []
        seen = {(r.get("日期",""),r.get("胜者",""),r.get("负者","")) for r in exist}
        new = 0
        for r in recs:
            k = (r["日期"],r["胜者"],r["负者"])
            if k not in seen:
                seen.add(k); exist.append(r); new+=1
        sf.write_text(json.dumps(exist,ensure_ascii=False,indent=2),encoding="utf-8")
        log.info(f"  {cat}: +{new} → {len(exist)} 条")

# ============================================================
# 主流程
# ============================================================

def main():
    log.info("="*50)
    log.info("ITTF World Tour 爬取 + Wikipedia 名称修正")
    log.info("="*50)

    # ITTF
    cookie = ittf_login()
    if cookie:
        events = fetch_events(cookie)
        if events:
            log.info(f"\n爬取 {len(events)} 个 World Tour 赛事...")
            all_recs = {c:[] for c in CATEGORIES}
            for i,ev in enumerate(events,1):
                if i%20==0: log.info(f"  {i}/{len(events)}")
                for cat in CATEGORIES:
                    all_recs[cat].extend(fetch_matches(cookie,ev,{cat}))
                time.sleep(0.3)
            total = sum(len(v) for v in all_recs.values())
            log.info(f"\n📊 ITTF共 {total} 场比赛")
            if total>0:
                save(all_recs)

    # Wikipedia 名称修正
    fix_wiki_names()

    # 汇总
    log.info(f"\n{'='*50}")
    log.info("📊 最终汇总:")
    for cat in CATEGORIES:
        sf = DATA_DIR / cat.lower() / "score-log.json"
        n = len(json.loads(sf.read_text(encoding="utf-8"))) if sf.exists() else 0
        log.info(f"  {cat}: {n} 条")
    log.info("\n🎉 完成!")

if __name__=="__main__":
    main()
