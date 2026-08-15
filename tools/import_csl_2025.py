#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import 2025 乒超联赛 (China Super League) results from CSV into ms / md score logs.

- Doubles games (game_no 1)        -> wtt_data/md/score-log-2025-wtt.json
- Singles games (game_no 2..5)     -> wtt_data/ms/score-log-2025-wtt.json
- Dates evenly distributed across four ranges, random order (seed 42):
    2025-06-09..2025-06-11, 2025-07-25..2025-07-28,
    2025-08-29..2025-09-01, 2025-12-26..2025-12-28
"""
import csv
import json
import os
import random

CSV_PATH = r'L:\deepseek harness default\csl-2025-games.csv'
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wtt_data')
SEED = 42
TYPE = '乒超联赛'

DATE_RANGES = [
    ('2025-06-09', '2025-06-11'),
    ('2025-07-25', '2025-07-28'),
    ('2025-08-29', '2025-09-01'),
    ('2025-12-26', '2025-12-28'),
]

SPECIAL_NAMES = {
    'Lin Yun-ju': 'LIN Yun-Ju',
    'Wong Chun-ting': 'WONG Chun Ting',
    'Baldwin Chan': 'CHAN Baldwin',
    'Izaac Quek': 'QUEK Izaac',
    'Sora Matsushima': 'Sora MATSUSHIMA',
}


def standardize_name(name):
    name = name.strip()
    if name in SPECIAL_NAMES:
        return SPECIAL_NAMES[name]
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
            a, b = r['score'].split('-')
            if int(a) > int(b):
                win, los = r['players_a'], r['players_b']
            else:
                win, los = r['players_b'], r['players_a']
            if r['game_no'] == '1':
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


def make_dates():
    import datetime
    dates = []
    for start, end in DATE_RANGES:
        y, m, dd = map(int, start.split('-'))
        ye, me, de = map(int, end.split('-'))
        d = datetime.date(y, m, dd)
        last = datetime.date(ye, me, de)
        while d <= last:
            dates.append(d.isoformat())
            d += datetime.timedelta(days=1)
    return dates


def build_records(pairs, dates):
    random.seed(SEED)
    random.shuffle(pairs)
    return [
        {'日期': dates[i % len(dates)], '类型': TYPE, '胜者': w, '负者': l}
        for i, (w, l) in enumerate(pairs)
    ]


def update_log(subdir, new_records):
    fp = os.path.join(BASE, subdir, 'score-log-2025-wtt.json')
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
    dates = make_dates()
    ms_added = update_log('ms', build_records(singles, dates))
    md_added = update_log('md', build_records(doubles, dates))
    print('ms added: %d (csv singles: %d)' % (len(ms_added), len(singles)))
    print('md added: %d (csv doubles: %d)' % (len(md_added), len(doubles)))
    print('dates used: %d (%s .. %s)' % (len(dates), dates[0], dates[-1]))
    from collections import Counter
    print('ms per-day:', dict(sorted(Counter(r['日期'] for r in ms_added).items())))
    print('md per-day:', dict(sorted(Counter(r['日期'] for r in md_added).items())))


if __name__ == '__main__':
    main()