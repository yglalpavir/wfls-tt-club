#!/usr/bin/env python3
"""修复 MD 文件编码并追加所有 2025 新比赛数据"""
import json, re, os

BASE = r's:\wfls-tt-club\wfls-tt-club\wtt_data'

def salvage_md():
    md_path = os.path.join(BASE, 'md', 'score-log-2025-wtt.json')
    with open(md_path, 'rb') as f:
        raw = f.read()
    if raw[:3] == b'\xef\xbb\xbf':
        raw = raw[3:]
    text = raw.decode('latin1')
    pattern = r'\{\s*"[^"]+":\s*"(\d{4}-\d{2}-\d{2})",\s*"[^"]+":\s*"([^"]*)",\s*"[^"]+":\s*"([^"]+)",\s*"[^"]+":\s*"([^"]+)"\s*\}'
    matches = re.findall(pattern, text)
    result = [{"日期": d, "类型": t, "胜者": w.strip(), "负者": l.strip()} for d, t, w, l in matches]
    print(f"从损坏的 MD 文件中提取了 {len(result)} 条记录")
    return result

def read_json(filename):
    path = os.path.join(BASE, filename)
    with open(path, 'r', encoding='utf-8-sig') as f:
        content = f.read()
    content = re.sub(r',(\s*[\]}])', r'\1', content)
    return json.loads(content)

def save_json(filename, data):
    path = os.path.join(BASE, filename)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"{filename}: {len(data)} records")

# Import the data generators - we'll define them inline for simplicity
# ... (data is too large to inline here)
# Instead, use a separate data file approach

# Let's just use the extraction approach + append via PowerShell
# since WD/XD already have correct format

print("Step 1: Salvage MD...")
md = salvage_md()
print(f"Step 2: Read WD and XD for verification...")
wd = read_json('wd/score-log-2025-wtt.json')
xd = read_json('xd/score-log-2025-wtt.json')
print(f"WD: {len(wd)}, XD: {len(xd)}, MD: {len(md)}")
print("Base data loaded. Now need to append new tournament data.")
