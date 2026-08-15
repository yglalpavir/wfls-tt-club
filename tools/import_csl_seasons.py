#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import historical 乒超联赛 results from CSV files into ms / md score logs.

- Doubles (players joined by '/') -> md
- Singles                          -> ms
- Per-year date ranges (evenly distributed, random order, seed 42):
    2018-19 -> 2019: 02-16..02-19
    2020          : 12-27..12-29
    2021          : 10-10..10-12
    2022/2023/2024: 06-09..06-11, 07-25..07-28, 08-29..09-01, 12-26..12-28
"""
import csv
import json
import os
import random
import re

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wtt_data')
SEED = 42
TYPE = '乒超联赛'

SEASONS = [
    ('L:/deepseek harness default/csl-2018-19-games.csv', 2019,
     [('2019-02-16', '2019-02-19')]),
    ('L:/deepseek harness default/csl-2020-games.csv', 2020,
     [('2020-12-27', '2020-12-29')]),
    ('L:/deepseek harness default/csl-2021-games.csv', 2021,
     [('2021-10-10', '2021-10-12')]),
    ('L:/deepseek harness default/csl-2022-games.csv', 2022,
     [('2022-06-09', '2022-06-11'), ('2022-07-25', '2022-07-28'),
      ('2022-08-29', '2022-09-01'), ('2022-12-26', '2022-12-28')]),
    ('L:/deepseek harness default/csl-2023-games.csv', 2023,
     [('2023-06-09', '2023-06-11'), ('2023-07-25', '2023-07-28'),
      ('2023-08-29', '2023-09-01'), ('2023-12-26', '2023-12-28')]),
    ('L:/deepseek harness default/csl-2024-games.csv', 2024,
     [('2024-06-09', '2024-06-11'), ('2024-07-25', '2024-07-28'),
      ('2024-08-29', '2024-09-01'), ('2024-12-26', '2024-12-28')]),
]

NAME_FIXES = {
    'Fan Zhendon g': 'Fan Zhendong',
    'Niang Xiankun': 'Ning Xiankun',
    'Sora Matushima': 'Sora MATSUSHIMA',
}

SPECIAL_NAMES = {
    'Lin Yun-ju': 'LIN Yun-Ju',
    'Wong Chun-ting': 'WONG Chun Ting',
    'Truls Moregardh': 'Truls MOREGARD',
    'Sora Matushima': 'Sora MATSUSHIMA',
    'Hayato Miki': 'Hayato MIKI',
    'Bora Vang': 'Bora VANG',
    'An Jae-hyun': 'AN Jaehyun',
}


def standardize_name(name):
    name = name.strip()
    if name in SPECIAL_NAMES:
        return SPECIAL_NAMES[name]
    name = NAME_FIXES.get(name, name)
    words = name.split()
    if not words:
        return name
    surname = words[0].upper()
    given = [w[:1].upper() + w[1:].lower() for w in words[1:]]
    return ' '.join([surname] + given)


def make_dates(ranges):
    import datetime
    dates = []
    for start, end in ranges:
        y, m, dd = map(int, start.split('-'))
        ye, me, de = map(int, end.split('-'))
        d = datetime.date(y, m, dd)
        last = datetime.date(ye, me, de)
        while d <= last:
            dates.append(d.isoformat())
            d += datetime.timedelta(days=1)
    return dates


def parse_csv(path):
    singles, doubles = [], []
    with open(path, 'r', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            a, b = r['score'].split('-')
            if int(a) > int(b):
                win, los = r['players_a'], r['players_b']
            else:
                win, los = r['players_b'], r['players_a']
            if '/' in win or '/' in los:
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
    used = {}  # date -> set of (winner, loser)
    records = []
    for i, (w, l) in enumerate(pairs):
        for offset in range(len(dates)):
            d = dates[(i + offset) % len(dates)]
            if (w, l) not in used.setdefault(d, set()):
                used[d].add((w, l))
                records.append({'日期': d, '类型': TYPE, '胜者': w, '负者': l})
                break
    return records


def update_log(subdir, year, new_records):
    fp = os.path.join(BASE, subdir, 'score-log-%d-wtt.json' % year)
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
    for path, year, ranges in SEASONS:
        singles, doubles = parse_csv(path)
        dates = make_dates(ranges)
        ms = update_log('ms', year, build_records(singles, dates))
        md = update_log('md', year, build_records(doubles, dates))
        print('%d | ms:%d (csv %d) | md:%d (csv %d) | dates:%d %s..%s' % (
            year, len(ms), len(singles), len(md), len(doubles),
            len(dates), dates[0], dates[-1]))


if __name__ == '__main__':
    main()