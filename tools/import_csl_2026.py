#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import 2026 乒超联赛 (China Super League) results from CSV into ms / md score logs.

- Singles games (game_no 2/3/5) -> wtt_data/ms/score-log-2026-wtt.json
- Doubles games (game_no 1/4)   -> wtt_data/md/score-log-2026-wtt.json
- Removes any existing 乒超联赛 records, then appends fresh data.
- Dates evenly distributed across 2026-07-23 .. 2026-08-01 (10 days), random order (seed 42).
"""
import csv
import json
import os
import random
import sys

CSV_PATH = r'L:\deepseek harness default\csl-2026-games.csv'
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wtt_data')
SEED = 42
START_DATE = '2026-07-23'
END_DATE = '2026-08-01'
TYPE = '乒超联赛'

NAME_FIXES = {
    'Li Tiangyang': 'Li Tianyang',
    'Chen Xuany i': 'Chen Xuanyi',
}


def standardize_name(name):
    name = NAME_FIXES.get(name.strip(), name.strip())
    words = name.split()
    if not words:
        return name
    surname = words[0].upper()
    given = [w[:1].upper() + w[1:].lower() for w in words[1:]]
    return ' '.join([surname] + given)


def parse_csv():
    singles, doubles = [], []
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            ga, gb = int(r['side_a_games']), int(r['side_b_games'])
            if r['side_a_result'] == 'W':
                win, los = r['side_a_players'], r['side_b_players']
            else:
                win, los = r['side_b_players'], r['side_a_players']
            if int(r['game_no']) in (1, 4):
                p1, p2 = win.split('/')
                w1, w2 = standardize_name(p1), standardize_name(p2)
                if w2 < w1:
                    w1, w2 = w2, w1
                win = w1 + '/' + w2
                p1, p2 = los.split('/')
                l1, l2 = standardize_name(p1), standardize_name(p2)
                if l2 < l1:
                    l1, l2 = l2, l1
                los = l1 + '/' + l2
                doubles.append((win, los))
            else:
                singles.append((standardize_name(win), standardize_name(los)))
    return singles, doubles


def build_records(pairs, dates):
    random.seed(SEED)
    random.shuffle(pairs)
    return [
        {'日期': dates[i % len(dates)], '类型': TYPE, '胜者': w, '负者': l}
        for i, (w, l) in enumerate(pairs)
    ]


def update_log(subdir, new_records):
    fp = os.path.join(BASE, subdir, 'score-log-2026-wtt.json')
    with open(fp, 'r', encoding='utf-8-sig') as f:
        existing = json.load(f)
    existing = [r for r in existing if r.get('类型') != TYPE]
    keys = set((r['日期'], r['类型'], r['胜者'], r['负者']) for r in existing)
    added = []
    for r in new_records:
        k = (r['日期'], r['类型'], r['胜者'], r['负者'])
        if k not in keys:
            added.append(r)
            keys.add(k)
    allr = existing + added
    with open(fp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(allr, f, ensure_ascii=False, indent=2)
        f.write('\n')
    return added


def main():
    singles, doubles = parse_csv()
    dates = []
    d = START_DATE
    while d <= END_DATE:
        dates.append(d)
        y, m, dd = map(int, d.split('-'))
        import datetime
        d = (datetime.date(y, m, dd) + datetime.timedelta(days=1)).isoformat()

    ms_added = update_log('ms', build_records(singles, dates))
    md_added = update_log('md', build_records(doubles, dates))

    print('ms added: %d (total singles from csv: %d)' % (len(ms_added), len(singles)))
    print('md added: %d (total doubles from csv: %d)' % (len(md_added), len(doubles)))
    for label, recs in (('ms', ms_added), ('md', md_added)):
        from collections import Counter
        print('%s per-day:' % label, dict(sorted(Counter(r['日期'] for r in recs).items())))


if __name__ == '__main__':
    main()