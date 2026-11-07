# -*- coding: utf-8 -*-
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
js = open(r'S:\wfls-tt-club\wfls-tt-club\js\common.js', encoding='utf-8').read()
m = re.search(r'const WTT_EVENT_TYPE_KEY_MAP = \{ (.*?);', js, re.S)
keys = re.findall(r"'([^']+)':\s*'wtt_ev_", m.group(1))
# 从验证脚本输出的残留列表（copy 自 EN residue 探针，原为乱码，重新在浏览器侧比对）
residue = ['乒超联赛','大满贯','ittf白金赛','ittf公开赛','世界杯','世乒赛团体','世乒赛','球星挑战赛','亚运会','总决赛','冠军赛','奥运会','巴黎奥运会']
missing = [k for k in residue if k not in keys]
print('missing:', missing)
# 写入结果文件避免控制台编码问题
open(r'S:\wfls-tt-club\wfls-tt-club\.playwright-mcp\map_check_result.txt', 'w', encoding='utf-8').write(
    'WTT map keys: %d\nmissing: %s\n' % (len(keys), missing))
