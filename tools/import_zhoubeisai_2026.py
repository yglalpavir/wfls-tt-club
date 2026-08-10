#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, os

WTT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wtt_data', 'ms')

matches = [
    ('2026-02-07', 'WANG Chuqin', 'Akash PAL'),
    ('2026-02-07', 'WANG Chuqin', 'FENG Yixin'),
    ('2026-02-07', 'WANG Chuqin', 'Mohammed ABDULWAHHAB'),
    ('2026-02-07', 'Akash PAL', 'FENG Yixin'),
    ('2026-02-07', 'Akash PAL', 'Mohammed ABDULWAHHAB'),
    ('2026-02-07', 'FENG Yixin', 'Mohammed ABDULWAHHAB'),
    ('2026-02-07', 'LIN Shidong', 'GUO Guanhong'),
    ('2026-02-07', 'LIN Shidong', 'Snehit SURAVAJJULA'),
    ('2026-02-07', 'LIN Shidong', 'Abdulaziz BU SHULAYBI'),
    ('2026-02-07', 'GUO Guanhong', 'Snehit SURAVAJJULA'),
    ('2026-02-07', 'GUO Guanhong', 'Abdulaziz BU SHULAYBI'),
    ('2026-02-07', 'Snehit SURAVAJJULA', 'Abdulaziz BU SHULAYBI'),
    ('2026-02-07', 'HUANG Youzheng', 'Tomokazu HARIMOTO'),
    ('2026-02-07', 'HUANG Youzheng', 'LIAO Zhen Ting'),
    ('2026-02-07', 'HUANG Youzheng', 'Aidos KENZHIKULOV'),
    ('2026-02-07', 'Tomokazu HARIMOTO', 'LIAO Zhen Ting'),
    ('2026-02-07', 'Tomokazu HARIMOTO', 'Aidos KENZHIKULOV'),
    ('2026-02-07', 'LIAO Zhen Ting', 'Aidos KENZHIKULOV'),
    ('2026-02-07', 'XIANG Peng', 'ZHANG You-An'),
    ('2026-02-07', 'XIANG Peng', 'Kirill GERASSIMENKO'),
    ('2026-02-07', 'XIANG Peng', 'Ali ALKHADRAWI'),
    ('2026-02-07', 'ZHANG You-An', 'Kirill GERASSIMENKO'),
    ('2026-02-07', 'ZHANG You-An', 'Ali ALKHADRAWI'),
    ('2026-02-07', 'Kirill GERASSIMENKO', 'Ali ALKHADRAWI'),
    ('2026-02-07', 'Masaki OMODA', 'GUO Yong'),
    ('2026-02-07', 'Masaki OMODA', 'GUAN Wenhao'),
    ('2026-02-07', 'Masaki OMODA', 'JANG Woojin'),
    ('2026-02-07', 'GUO Yong', 'GUAN Wenhao'),
    ('2026-02-07', 'GUO Yong', 'JANG Woojin'),
    ('2026-02-07', 'GUAN Wenhao', 'JANG Woojin'),
    ('2026-02-07', 'Shinoaki UDA', 'Alan KURMANGALIYEV'),
    ('2026-02-07', 'Shinoaki UDA', 'CHEN Yuanyu'),
    ('2026-02-07', 'Shinoaki UDA', 'Ankur BHATTACHARJEE'),
    ('2026-02-07', 'Alan KURMANGALIYEV', 'CHEN Yuanyu'),
    ('2026-02-07', 'Alan KURMANGALIYEV', 'Ankur BHATTACHARJEE'),
    ('2026-02-07', 'CHEN Yuanyu', 'Ankur BHATTACHARJEE'),
    ('2026-02-07', 'ZHOU Qihao', 'Yuta TANAKA'),
    ('2026-02-07', 'ZHOU Qihao', 'FENG Yaoen'),
    ('2026-02-07', 'ZHOU Qihao', 'HE Junjie'),
    ('2026-02-07', 'Yuta TANAKA', 'FENG Yaoen'),
    ('2026-02-07', 'Yuta TANAKA', 'HE Junjie'),
    ('2026-02-07', 'FENG Yaoen', 'HE Junjie'),
    ('2026-02-07', 'Yukiya UDA', 'LIN Zhaoheng'),
    ('2026-02-07', 'Yukiya UDA', 'CHEN Junsong'),
    ('2026-02-07', 'Yukiya UDA', 'HUANG Qishen'),
    ('2026-02-07', 'LIN Zhaoheng', 'CHEN Junsong'),
    ('2026-02-07', 'LIN Zhaoheng', 'HUANG Qishen'),
    ('2026-02-07', 'CHEN Junsong', 'HUANG Qishen'),
]

fn = 'score-log-2026-wtt.json'
fp = os.path.join(WTT, fn)
with open(fp, 'r', encoding='utf-8-sig') as f:
    existing = json.load(f)
keys = set((r['日期'], r['类型'], r['胜者'], r['负者']) for r in existing)
new = []
for d, w, l in matches:
    k = (d, '洲杯赛', w, l)
    if k not in keys:
        new.append({'日期': d, '类型': '洲杯赛', '胜者': w, '负者': l})
        keys.add(k)
allr = existing + new
with open(fp, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(allr, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('Added %d matches (total: %d)' % (len(new), len(allr)))
