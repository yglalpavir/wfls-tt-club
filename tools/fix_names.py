#!/usr/bin/env python3
"""修复 Wikipedia 数据中的球员名称，并重新下载缺失的 raw wikitext。"""
import re, json, subprocess, time, logging
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "ittf_data"
RAW_DIR = DATA_DIR / "_raw"

CATEGORY_SUFFIX = {
    "MS":"Men%27s_singles","WS":"Women%27s_singles",
    "MD":"Men%27s_doubles","WD":"Women%27s_doubles",
    "XD":"Mixed_doubles"
}

logging.basicConfig(level=logging.INFO,format="[%(asctime)s] %(message)s",datefmt="%H:%M:%S")
log = logging.getLogger("fix")

def ps_fetch(url):
    cmd = (f'try{{$r=Invoke-WebRequest -Uri "{url}" -TimeoutSec 30 -UseBasicParsing '
           f'-Headers @{{"User-Agent"="Mozilla/5.0"}};'
           f'[Console]::OutputEncoding=[Text.Encoding]::UTF8;'
           f'Write-Output $r.Content}}catch{{exit 1}}')
    r = subprocess.run(["powershell","-NoProfile","-Command",cmd],
                       capture_output=True,text=True,timeout=45,
                       encoding="utf-8",errors="replace")
    return r.stdout if r.returncode==0 and r.stdout and len(r.stdout)>100 else None


def download_raw_pages():
    """下载 Wikipedia 原始 wikitext。"""
    RAW_DIR.mkdir(parents=True,exist_ok=True)
    wttc_years = [y for y in range(2008,2021) if y%2==1]
    total = len(wttc_years)*len(CATEGORY_SUFFIX)
    i = 0
    for year in wttc_years:
        for cat,suffix in CATEGORY_SUFFIX.items():
            i += 1
            fname = f"世锦赛_{year}_{cat}.wiki"
            fpath = RAW_DIR / fname
            if fpath.exists():
                log.info(f"[{i}/{total}] 跳过 {fname}")
                continue
            title = f"{year}_World_Table_Tennis_Championships_%E2%80%93_{suffix}"
            url = f"https://en.wikipedia.org/w/index.php?title={title}&action=raw"
            log.info(f"[{i}/{total}] 下载 {fname}...")
            wt = ps_fetch(url)
            if wt:
                fpath.write_text(wt, encoding="utf-8")
                log.info(f"  ✅ {len(wt)} 字符")
            else:
                log.warning(f"  ❌ 失败")
            time.sleep(1.5)


def extract_name_map():
    """从 raw wikitext 提取名称映射。"""
    name_map = {}
    for wf in sorted(RAW_DIR.glob("*.wiki")):
        wt = wf.read_text(encoding="utf-8")
        for m in re.finditer(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', wt):
            full = m.group(1).strip()
            short = (m.group(2) or full).strip()
            # 清理
            full = re.sub(r'\([^)]*\)','',full).strip()
            full = full.split("(")[0].strip()
            # 只保留有意义的映射
            if len(short)>=3 and len(full)>=4 and short.lower()!=full.lower():
                if short not in name_map or len(full)>len(name_map[short]):
                    name_map[short] = full
    log.info(f"提取 {len(name_map)} 条名称映射")
    return name_map


def format_name(name):
    """格式化: Wang Hao -> WANG Hao; Timo Boll -> Timo BOLL"""
    if "/" in name:
        return " / ".join(format_name(p.strip()) for p in name.split("/"))
    parts = name.strip().split()
    if len(parts) >= 2:
        # 首部分转大写作为姓
        return f"{parts[0].upper()} {' '.join(parts[1:])}"
    return name.strip()


def fix_names():
    """修正 score-log.json 中的名称。"""
    name_map = extract_name_map()

    for cat_dir in sorted(DATA_DIR.glob("*")):
        if not cat_dir.is_dir() or cat_dir.name.startswith("_"): continue
        sf = cat_dir / "score-log.json"
        if not sf.exists(): continue

        records = json.loads(sf.read_text(encoding="utf-8"))
        fixed = 0
        for r in records:
            if r.get("数据来源") != "Wikipedia": continue
            ow, ol = r["胜者"], r["负者"]

            # 使用名称映射替换
            nw = name_map.get(ow, ow)
            nl = name_map.get(ol, ol)

            # 处理后格式化
            nw = format_name(nw)
            nl = format_name(nl)

            if nw != ow or nl != ol:
                r["胜者"], r["负者"] = nw, nl
                fixed += 1

        sf.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding="utf-8")
        log.info(f"  {cat_dir.name}: 修正 {fixed}/{len(records)} 条")


def main():
    log.info("="*50)
    log.info("Wikipedia 名称修正工具")
    log.info("="*50)

    # Step 1: 下载 raw wikitext（如果还没有）
    download_raw_pages()

    # Step 2: 修正名称
    fix_names()

    # Step 3: 统计
    log.info(f"\n📊 修正后汇总:")
    for cat_dir in sorted(DATA_DIR.glob("*")):
        if not cat_dir.is_dir() or cat_dir.name.startswith("_"): continue
        sf = cat_dir / "score-log.json"
        if sf.exists():
            records = json.loads(sf.read_text(encoding="utf-8"))
            log.info(f"  {cat_dir.name}: {len(records)} 条")
            if records:
                log.info(f"    样例: {records[0]['胜者']} vs {records[0]['负者']}")

    log.info("\n🎉 完成!")


if __name__ == "__main__":
    main()
