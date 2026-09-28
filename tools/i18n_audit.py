#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""i18n_audit.py — 英文模式残留中文静态审计（warn 模式）

扫描三类残留：
  1. HTML  : <body> 内没有 data-i18n* 覆盖的含中文文本节点 / 可翻译属性
             （placeholder / aria-label / title / alt / content）
  2. JS    : 字符串字面量里的中文（排除注释、console.*、i18n 字典 zh 块、
             数据字段 key 与已登记的中文数据键）
  3. DATA  : 内容条目缺少英文同级字段（title_en / excerpt_en / content_en 等）

用法：
    python tools/i18n_audit.py              # 全量报告，退出码 0（warn 模式）
    python tools/i18n_audit.py --html-only
    python tools/i18n_audit.py --js-only
    python tools/i18n_audit.py --data-only
    python tools/i18n_audit.py --strict     # 有残留即退出码 1（供 CI 使用）
    python tools/i18n_audit.py --json       # 机器可读

稳定后可把 --strict 并入 ci_validate.py 流程（当前默认 warn，不阻断 CI）。
"""

import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CJK = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')

# 标签内部整体跳过（脚本/样式/文档正文，不是站点 chrome 的翻译对象）
SKIP_TAGS = {'script', 'style', 'code', 'pre', 'noscript', 'textarea'}

# 需要检查的可翻译属性
TRANSLATABLE_ATTRS = ('placeholder', 'aria-label', 'title', 'alt', 'content')

# data-i18n* 属性族（本元素已被字典覆盖）
I18N_ATTR_PREFIX = 'data-i18n'

# ---------------------------------------------------------------- 豁免名单

# 站点数据里的中文「键」——引擎 join key / 字段名 / 事件类型值，AGENTS.md 明确
# 规定不得翻译。这些出现在 JS 里是查表用，不是可见文本。
DATA_KEY_ALLOW = {
    # score-log / 比赛记录字段名
    '胜者', '负者', '日期', '类型', '比分', '局分', '赛制', '备注', '积分', '姓名', '编号',
    '初始积分', '标签', '荣誉', '职务', 'uid', 'score', 'id',
    # 事件类型（显示层由 eventTypeLabel / wttEventTypeLabel 映射）
    '普通', '排位赛', '挑战赛', '校乒联赛', '十二强赛', '校乒赛团体', '校乒赛单打', '双打',
    '比赛结果加分',
    # 赛季 label（引擎 join key）
    '2026年春季学期', '2026年暑假', '2026年秋季学期',
    '2026-spring', '2026-summer', '2026-autumn',
    # 单双打标记
    '甲', '乙', '男', '女',
}

# 整行豁免：正则匹配到的字符串字面量直接跳过（例如 console 提示、调试信息）
JS_LINE_ALLOW_RE = [
    re.compile(r'^console\.'),
    re.compile(r'^\s*(var|let|const)?\s*\w+\s*[:=]\s*//'),      # 行尾注释残留
    re.compile(r'^\[(DEBUG|TODO|NOTE)\]'),
]

# JS 文件级豁免：训练/研究工作区，不属于站点可见文本
# 纯翻译词典文件：整份内容都是翻译源，不是残留
JS_DICT_FILES = {
    'js/common.js',
    'tt_game/js/i18n.js',
}

JS_FILE_SKIP = {
    # 训练权重与实验脚本，仅本地使用
    'tt_game/js/input-weights.js',
    'tt_game/js/learned-policy-nemesis.js',
    'tt_game/js/opponent-ladder.js',
    'tt_game/js/scene.js',
    'tt_game/js/physics.js',
    'tt_game/js/quality.js',
    'tt_game/js/rules.js',
    'tt_game/js/input.js',
}

# ---------------------------------------------------------------- 工具


def _is_regex_start(body, i):
    """判断 '/' 在此处是正则字面量还是除号（正则里同样可能出现 // 与 /*）。

    简化判据：向前看最近的非空白字符，出现在这些位置时 '/' 只能开启正则。
    """
    j = i - 1
    while j >= 0 and body[j] in ' \t\r\n':
        j -= 1
    if j < 0:
        return True
    return body[j] in '(,=:[!&|?{};+-*%~^<>'


def lex_js(src):
    """单趟扫描 JS，返回 (去注释后的代码, [(字面量, 起始下标)])。

    注释剥离与字面量提取必须在同一趟里做：两套正则各自扫描会在正则字面量
    （如 /\\/\\d\\/）和注释里的引号上产生分歧，把整段注释误判成字符串。
    这里用一个同时认识行注释、块注释、三种引号和正则字面量的状态机。
    """
    out = []
    lits = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ''
        if c == '/' and nxt == '/':
            j = src.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i))          # 保留列宽，行号不错位
            i = j
            continue
        if c == '/' and nxt == '*':
            j = src.find('*/', i)
            j = n if j < 0 else j + 2
            out.append(re.sub(r'[^\n]', ' ', src[i:j]))
            i = j
            continue
        if c == '/' and _is_regex_start(out, len(out)):
            j = i + 1
            in_class = False
            while j < n:
                ch = src[j]
                if ch == '\\':
                    j += 2
                    continue
                if ch == '[':
                    in_class = True
                elif ch == ']':
                    in_class = False
                elif ch == '/' and not in_class:
                    break
                elif ch == '\n':
                    break
                j += 1
            if j < n and src[j] == '/':
                j += 1
                while j < n and src[j].isalpha():   # 正则尾修饰符
                    j += 1
                out.append(src[i:j])
                i = j
                continue
            out.append(c)
            i += 1
            continue
        if c in '"\'' or c == '`':
            quote = c
            start = i
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == quote:
                    break
                if quote == '`' and src[j] == '$' and j + 1 < n and src[j + 1] == '{':
                    # 模板插值：递归跳过内部代码，保持列宽
                    depth = 0
                    j += 1
                    while j < n:
                        if src[j] == '{':
                            depth += 1
                        elif src[j] == '}':
                            depth -= 1
                            if depth == 0:
                                break
                        j += 1
                    j += 1
                    continue
                j += 1
            end = min(j + 1, n)
            lits.append((src[start:end], start))
            out.append(src[start:end])
            i = end
            continue
        out.append(c)
        i += 1
    return ''.join(out), lits


def cut_i18n_dict(body):
    """就地截掉 i18n 字典对象本身（zh + en 两块），只留下引导代码。

    字典是翻译源，不是残留。必须做括号配对，不能只按行或正则切，
    否则会误伤字典之后真正的代码。用引号/转义感知的状态机配对花括号。
    """
    m = re.search(r'\b(?:GAME_)?[iI]18[Nn]\w*\s*=\s*\{', body)
    if not m:
        return body
    start = m.end() - 1                      # 指向 '{'
    depth = 0
    i = start
    n = len(body)
    while i < n:
        c = body[i]
        if c in '"\'':
            q = c
            i += 1
            while i < n:
                if body[i] == '\\':
                    i += 2
                    continue
                if body[i] == q:
                    break
                i += 1
            i += 1
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return body[:m.start()] + body[i + 1:]
        i += 1
    return body


# ---------------------------------------------------------------- HTML


class _HtmlScan(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.stack = []          # [(tag, has_i18n_attr)]
        self.hits = []
        self.skip_depth = 0
        self.key_refs = []       # [(line, attr, key)] —— 供 key 存在性校验

    def _record_keys(self, attrs):
        for k, v in attrs:
            if k and k.startswith(I18N_ATTR_PREFIX) and v:
                self.key_refs.append((self.getpos()[0], k, v.strip()))

    def _covered(self):
        # data-i18n 走 innerHTML，会整棵子树一起替换——祖先被覆盖即整棵子树被覆盖
        return any(has for _, has in self.stack)

    def handle_starttag(self, tag, attrs):
        self._record_keys(attrs)
        attr_names = [k for k, _ in attrs if k]
        has_i18n = any(k.startswith(I18N_ATTR_PREFIX) for k in attr_names)
        self.stack.append((tag, has_i18n))
        if tag in SKIP_TAGS:
            self.skip_depth += 1
            return
        d = {k: v for k, v in attrs if k}
        for a in TRANSLATABLE_ATTRS:
            v = d.get(a)
            if not v or not CJK.search(v):
                continue
            if has_i18n or a.startswith(I18N_ATTR_PREFIX):
                continue
            # <html lang> 之外的 content：meta/og 才需要 i18n，value 等跳过
            if a == 'content' and tag not in ('meta', 'property'):
                continue
            if tag == 'property':
                continue
            self.hits.append({
                'file': self.path, 'line': self.getpos()[0], 'kind': 'attr:' + a,
                'text': re.sub(r'\s+', ' ', v)[:90],
            })

    def handle_startendtag(self, tag, attrs):
        # 自闭合标签不进栈
        d = {k: v for k, v in attrs if k}
        has_i18n = any(k.startswith(I18N_ATTR_PREFIX) for k in d)
        if tag in SKIP_TAGS:
            return
        for a in TRANSLATABLE_ATTRS:
            v = d.get(a)
            if v and CJK.search(v) and not has_i18n:
                if a == 'content' and tag not in ('meta',):
                    continue
                self.hits.append({
                    'file': self.path, 'line': self.getpos()[0], 'kind': 'attr:' + a,
                    'text': re.sub(r'\s+', ' ', v)[:90],
                })

    def handle_endtag(self, tag):
        while self.stack:
            t, _ = self.stack.pop()
            if t in SKIP_TAGS and self.skip_depth:
                self.skip_depth -= 1
            if t == tag:
                break

    def handle_data(self, data):
        if self.skip_depth or not data.strip():
            return
        if not CJK.search(data):
            return
        if self._covered():
            return
        txt = re.sub(r'\s+', ' ', data.strip())
        if not txt:
            return
        self.hits.append({
            'file': self.path, 'line': self.getpos()[0], 'kind': 'text',
            'text': txt[:90],
        })


def scan_html():
    """扫根目录 *.html 与 tt_game/*.html（子站用自己的 GAME_I18N 字典，key 前缀同为 g_*）。"""
    hits = []
    targets = []
    for name in sorted(os.listdir(ROOT)):
        if name.endswith('.html'):
            targets.append((name, os.path.join(ROOT, name)))
    game_dir = os.path.join(ROOT, 'tt_game')
    if os.path.isdir(game_dir):
        for name in sorted(os.listdir(game_dir)):
            if name.endswith('.html'):
                rel = 'tt_game/' + name
                targets.append((rel, os.path.join(game_dir, name)))
    for rel, p in targets:
        s = _HtmlScan(rel)
        try:
            s.feed(open(p, encoding='utf-8').read())
        except Exception as e:                                   # noqa: BLE001
            hits.append({'file': rel, 'line': 0, 'kind': 'parse-error', 'text': str(e)[:90]})
        hits.extend(s.hits)
        KEY_REFS.extend((rel, ln, attr, key) for ln, attr, key in s.key_refs)
    return hits


# ---------------------------------------------------------------- JS

STRING_RE = re.compile(r'"((?:\\.|[^"\\])*)"|\'((?:\\.|[^\'\\])*)\'|`((?:\\.|[^`\\])*)`', re.S)


def scan_js():
    hits = []
    map_keys = collect_map_keys()
    jsdirs = ['js', 'tt_game/js']
    for sub in jsdirs:
        d = os.path.join(ROOT, sub)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if not name.endswith('.js'):
                continue
            rel = sub + '/' + name
            if rel in JS_FILE_SKIP:
                continue
            path = os.path.join(d, name)
            raw = open(path, encoding='utf-8').read()
            body, lits = lex_js(raw)
            if rel in JS_DICT_FILES:
                # 字典文件：整份对象都是翻译源，只审计它之前的引导代码
                cut = cut_i18n_dict(body)
                keep = len(cut) - len(body)
                body = cut
                lits = [(t, p) for t, p in lits if p < keep]
            seen = set()
            for lit, pos in lits:
                if not CJK.search(lit):
                    continue
                val = re.sub(r'\s+', ' ', lit).strip()
                if not val or val in DATA_KEY_ALLOW or val in map_keys:
                    continue
                if any(rx.search(val) for rx in JS_LINE_ALLOW_RE):
                    continue
                # 纯数据键形态（中文标识符/短词，出现在 map 或 .x === 比较里）跳过
                if _is_data_key_usage(body, pos):
                    continue
                # 挂了 data-i18n* 的模板串：中文只是 zh 兜底
                if _is_i18n_markup(lit):
                    continue
                # console.* 开发者日志
                if _is_console_call(body, pos):
                    continue
                # currentLang 三元的语言分支（另一分支才是该语言要显示的）
                if _is_lang_branch(body, pos, val):
                    continue
                key = (rel, val)
                if key in seen:
                    continue
                seen.add(key)
                hits.append({
                    'file': rel, 'line': body.count('\n', 0, pos) + 1,
                    'kind': 'string', 'text': val[:90],
                })
    return hits


_KEY_CONTEXT_RE = re.compile(
    r'(?:^|\n)[^\n]{0,40}?'
    r'(?:KEY_MAP|_MAP\s*=|\[\s*[\'"]|===\s*[\'"]|==\s*[\'"]|:\s*[\'"][\u4e00-\u9fff])'
)


def _is_data_key_usage(body, pos):
    """字符串紧邻 map 定义 / 相等比较 → 数据键而非可见文本。"""
    window = body[max(0, pos - 160):pos]
    tail = body[pos:pos + 40]
    if re.search(r'(?:KEY_MAP|MAP)\s*\[[^\]]*$', window) or re.search(r'===\s*$', window) or re.search(r'==\s*$', window):
        return True
    if re.match(r'[\'"]\s*\]\s*[:=]', tail):
        return True
    if re.search(r'^\s*[\'"]\s*:\s*[\'"]\s*,?\s*$', tail):
        return True
    return False


def _enclosing_statement(body, pos):
    """取 pos 所在的「语句」：向前回溯到最近的分号/花括号/段落边界。"""
    start = max(0, pos - 400)
    seg = body[start:pos]
    cut = max(seg.rfind(';'), seg.rfind('{'), seg.rfind('}'), seg.rfind('\n\n'))
    return seg[cut + 1:] if cut >= 0 else seg


def _is_console_call(body, pos):
    """console.* 里的中文是开发者日志，不是用户可见文本。"""
    return 'console.' in _enclosing_statement(body, pos)


_MARKUP_I18N_RE = re.compile(r'data-i18n[\w-]*\s*=')


def _is_i18n_markup(value):
    """模板串里已挂 data-i18n*，里面的中文只是 zh 兜底，会被字典覆盖。"""
    return bool(_MARKUP_I18N_RE.search(value))


_LANG_MARK_RE = re.compile(r'currentLang|i18n\s*\[|\bGAME_I18N\b|\bgameT\s*\(|dcT\s*\(|wcT\s*\(|t\s*\(\s*[\'"]')


def _is_lang_branch(body, pos, value):
    """currentLang 三元的语言分支：另一种语言走的是另一个分支，不是残留。

    例：`currentLang === 'en' ? 'Last updated' : '上次更新：'` —— 英文模式
    只渲染英文分支，中文分支不是英文残留。
    """
    stmt = _enclosing_statement(body, pos)
    if not _LANG_MARK_RE.search(stmt):
        return False
    # 该字面量必须在三元里：语句里同时有 en 分支标记
    return bool(re.search(r"currentLang\s*===|['\"]en['\"]\s*\?|['\"]zh['\"]", stmt))


def collect_map_keys():
    """从 common.js / wtt_common.js 的 *_KEY_MAP 常量里抽出中文数据键。

    自动跟随代码演进，避免手工维护 allowlist 漏项。
    """
    keys = set()
    for rel in ('js/common.js', 'js/wtt_common.js'):
        p = os.path.join(ROOT, rel)
        if not os.path.isfile(p):
            continue
        src = open(p, encoding='utf-8').read()
        for m in re.finditer(r'(?:const|var|let)\s+\w*(?:KEY_MAP|_MAP|_CATEGORIES|_TYPES|CATEGORIES)\w*\s*=\s*\{', src):
            i = m.end() - 1
            depth = 0
            j = i
            while j < len(src):
                if src[j] == '{':
                    depth += 1
                elif src[j] == '}':
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            block = src[i:j + 1]
            for km in re.finditer(r"['\"]([^'\"]*)['\"]\s*:\s*['\"]([^'\"]*)['\"]", block):
                if CJK.search(km.group(1)):
                    keys.add(km.group(1))
    return keys


# ---------------------------------------------------------------- 字典 key 存在性

# HTML 里 data-i18n* 引用到的 key 必须在 zh / en 两块里都存在。
# 缺 key 时 setLanguage() 静默跳过（`if (_i18n[key] != null)`），页面在英文模式
# 下继续显示中文——不报错、不留痕，只能靠静态比对发现。
KEY_REFS = []


def _dict_block(src, name=r'(?:GAME_)?[iI]18[Nn]\w*'):
    """截出 i18n 字典对象的源码（含 zh/en 两块），失败返回 ''。"""
    m = re.search(r'\b' + name + r'\w*\s*=\s*\{', src)
    if not m:
        return ''
    depth, i, n = 0, m.end() - 1, len(src)
    while i < n:
        c = src[i]
        if c in '"\'':
            q = c
            i += 1
            while i < n:
                if src[i] == '\\':
                    i += 2
                    continue
                if src[i] == q:
                    break
                i += 1
            i += 1
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return src[m.end() - 1:i + 1]
        i += 1
    return ''


def _strip_comments(src):
    """去掉 JS 注释（保留列宽）。字典提取必须先做这步：
    tt_game/js/i18n.js 顶部的文档注释里就写着 `window.GAME_I18N = { zh: {...} }`，
    不剥离会匹配到注释而不是真字典。"""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in '"\'':
            q = c
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == q:
                    break
                j += 1
            out.append(src[i:min(j + 1, n)])
            i = j + 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i)
            j = n if j < 0 else j + 2
            out.append(re.sub(r'[^\n]', ' ', src[i:j]))
            i = j
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def _blank_literals(block):
    """把字符串字面量挖空，只留代码骨架。

    否则 `"Points: {n}"` 这类值里的冒号会被误当成 key。
    """
    _, lits = lex_js(block)
    if not lits:
        return block
    out, prev = [], 0
    for lit, pos in lits:
        out.append(block[prev:pos])
        out.append(' ' * len(lit))          # 保留列宽
        prev = pos + len(lit)
    out.append(block[prev:])
    return ''.join(out)


def load_dict_keys():
    """返回 (zh_keys, en_keys, game_zh, game_en)。

    字典是「一行塞多个 key」的压缩写法（`a: "…", b: "…", c: "…"`），
    必须按分隔符逐个切，不能只匹配行首。
    """
    def keys_of(block):
        # 站点字典是 JS 字面量 `key: "…"`；tt_game 字典是 JSON 风格 `"key": "…"`。
        # 前者要在挖空字面量之后匹配（否则值里的冒号会被误当 key）；
        # 后者的 key 本身就带引号、会被一并挖空，所以要在原文里匹配
        #（`"Warning: {n}"` 这种值不会命中，因为冒号在引号内部）。
        blanked = _blank_literals(block)
        ks = set(re.findall(r'([A-Za-z_$][\w$]*)\s*:', blanked))
        ks |= set(re.findall(r'"([A-Za-z_$][\w$]*)"\s*:', block))
        # zh: / en: 是语言块的结构标记，不是条目 key
        return ks - {'zh', 'en'}

    def split_zh_en(block):
        # 先挖空字面量，避免值里的 "en: {" 之类文本把两块切错
        skeleton = _blank_literals(block)
        m = re.search(r'(?:^|[\s,{])en\s*:\s*\{', skeleton)
        if not m:
            return block, ''
        return block[:m.start()], block[m.start():]

    src = _strip_comments(open(os.path.join(ROOT, 'js', 'common.js'), encoding='utf-8').read())
    site_zh, site_en = split_zh_en(_dict_block(src))

    game_zh = game_en = set()
    g = os.path.join(ROOT, 'tt_game', 'js', 'i18n.js')
    if os.path.isfile(g):
        gsrc = _strip_comments(open(g, encoding='utf-8').read())
        gzh, gen = split_zh_en(_dict_block(gsrc))
        game_zh, game_en = keys_of(gzh), keys_of(gen)
    return keys_of(site_zh), keys_of(site_en), game_zh, game_en


def scan_missing_keys():
    site_zh, site_en, game_zh, game_en = load_dict_keys()
    out = []
    for f, ln, attr, key in KEY_REFS:
        pool = game_zh if f.startswith('tt_game/') else site_zh
        pool_en = game_en if f.startswith('tt_game/') else site_en
        if key not in pool:
            out.append({'file': f, 'line': ln, 'kind': 'key:missing-zh', 'text': f'{attr}="{key}"'})
        elif key not in pool_en:
            out.append({'file': f, 'line': ln, 'kind': 'key:missing-en', 'text': f'{attr}="{key}"'})
    return out


def scan_dict_parity():
    """zh / en 两块 key 集合不对称 —— 加了中文忘了加英文（或反之）。"""
    site_zh, site_en, game_zh, game_en = load_dict_keys()
    out = []
    for label, zh, en in (('common.js', site_zh, site_en), ('tt_game/i18n.js', game_zh, game_en)):
        if not zh and not en:
            continue
        for k in sorted(zh - en):
            out.append({'file': label, 'line': 0, 'kind': 'key:no-en', 'text': k})
        for k in sorted(en - zh):
            out.append({'file': label, 'line': 0, 'kind': 'key:no-zh', 'text': k})
    return out


# ---------------------------------------------------------------- DATA

EN_FIELD_RULES = {
    'data/news': ['title_en', 'excerpt_en', 'content_en'],
    'data/qa': ['title_en', 'excerpt_en', 'content_en'],
    'data/competitions': ['title_en', 'excerpt_en', 'content_en'],
}


def scan_data():
    hits = []
    for sub, fields in EN_FIELD_RULES.items():
        d = os.path.join(ROOT, sub)
        if not os.path.isdir(d):
            continue
        for entry in sorted(os.listdir(d)):
            f = os.path.join(d, entry, entry + '.json')
            if not os.path.isfile(f):
                continue
            try:
                j = json.load(open(f, encoding='utf-8'))
            except Exception as e:                               # noqa: BLE001
                hits.append({'file': sub + '/' + entry, 'line': 0, 'kind': 'parse-error', 'text': str(e)[:90]})
                continue
            if not isinstance(j, dict):
                continue
            missing = [k for k in fields if not j.get(k)]
            if missing:
                hits.append({
                    'file': f'{sub}/{entry}/{entry}.json', 'line': 0, 'kind': 'data:missing_en',
                    'text': ', '.join(missing),
                })
    # changelog.json：数组，每项 title + changes[]
    f = os.path.join(ROOT, 'data', 'changelog.json')
    if os.path.isfile(f):
        for it in json.load(open(f, encoding='utf-8')):
            if not isinstance(it, dict):
                continue
            missing = [k for k in ('title_en', 'changes_en') if not it.get(k)]
            if missing:
                hits.append({'file': 'data/changelog.json', 'line': 0, 'kind': 'data:missing_en',
                             'text': f'v{it.get("version", "?")}: {", ".join(missing)}'})

    # about.json：{lastUpdated, history/philosophy/activities: {title, content}}
    f = os.path.join(ROOT, 'data', 'about.json')
    if os.path.isfile(f):
        j = json.load(open(f, encoding='utf-8'))
        for sec, body in j.items():
            if not isinstance(body, dict) or 'content' not in body:
                continue
            missing = [k for k in ('title_en', 'content_en') if not body.get(k)]
            if missing:
                hits.append({'file': 'data/about.json', 'line': 0, 'kind': 'data:missing_en',
                             'text': f'{sec}: {", ".join(missing)}'})

    # draws.json：title_en / roundLabels_en + 卡片 *_en
    f = os.path.join(ROOT, 'data', 'draws.json')
    if os.path.isfile(f):
        for d in json.load(open(f, encoding='utf-8')):
            if not isinstance(d, dict):
                continue
            label = d.get('id') or d.get('title') or '?'
            missing = [k for k in ('title_en',) if not d.get(k)]
            # roundLabels 是可选字段：源数据没有就不该要求译文
            # （没有时渲染层回退 dv_round_* 字典）
            if d.get('roundLabels') and not d.get('roundLabels_en'):
                missing.append('roundLabels_en')
            if missing:
                hits.append({'file': 'data/draws.json', 'line': 0, 'kind': 'data:missing_en',
                             'text': f'{label}: {", ".join(missing)}'})

    # umpire-quiz.json：meta_en + 每题 prompt_en / options[].label_en / explanation_en
    f = os.path.join(ROOT, 'data', 'umpire-quiz.json')
    if os.path.isfile(f):
        j = json.load(open(f, encoding='utf-8'))
        if not j.get('meta_en'):
            hits.append({'file': 'data/umpire-quiz.json', 'line': 0, 'kind': 'data:missing_en', 'text': 'meta_en'})
        for q in j.get('questions') or []:
            if not isinstance(q, dict):
                continue
            missing = [k for k in ('prompt_en', 'explanation_en') if not q.get(k)]
            if any(not o.get('label_en') for o in q.get('options') or [] if isinstance(o, dict)):
                missing.append('options[].label_en')
            if missing:
                hits.append({'file': 'data/umpire-quiz.json', 'line': 0, 'kind': 'data:missing_en',
                             'text': f'{q.get("id", "?")}: {", ".join(missing)}'})

    # players.json
    f = os.path.join(ROOT, 'data', 'players.json')
    if os.path.isfile(f):
        for p in json.load(open(f, encoding='utf-8')).get('players', []):
            if not isinstance(p, dict):
                continue
            miss = []
            if p.get('description') and not p.get('description_en'):
                miss.append('description_en')
            if p.get('role') and not p.get('role_en'):
                miss.append('role_en')
            if miss:
                hits.append({'file': 'data/players.json', 'line': 0, 'kind': 'data:missing_en',
                             'text': f'{p.get("uid", p.get("name", "?"))}: {", ".join(miss)}'})
    return hits


# ---------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description='英文模式残留中文静态审计')
    ap.add_argument('--html-only', action='store_true')
    ap.add_argument('--js-only', action='store_true')
    ap.add_argument('--data-only', action='store_true')
    ap.add_argument('--keys-only', action='store_true', help='只查 data-i18n* 引用的 key 是否存在、zh/en 是否对称')
    ap.add_argument('--strict', action='store_true', help='有残留即退出码 1')
    ap.add_argument('--json', action='store_true', dest='as_json')
    ap.add_argument('--quiet', action='store_true', help='只输出汇总计数')
    args = ap.parse_args()

    only = args.html_only or args.js_only or args.data_only or args.keys_only
    results = {}
    if not only or args.html_only:
        results['html'] = scan_html()
    if not only or args.js_only:
        results['js'] = scan_js()
    if not only or args.data_only:
        results['data'] = scan_data()
    if not only or args.keys_only:
        # 依赖 scan_html 收集到的 data-i18n* 引用
        if 'html' not in results:
            results['html'] = scan_html()
        results['keys'] = scan_missing_keys() + scan_dict_parity()

    total = sum(len(v) for v in results.values())

    if args.as_json:
        print(json.dumps({'total': total, 'results': results}, ensure_ascii=False, indent=2))
        return 1 if (args.strict and total) else 0

    if not args.quiet:
        for cat, hits in results.items():
            by_file = {}
            for h in hits:
                by_file.setdefault(h['file'], []).append(h)
            print(f'\n===== {cat.upper()} ({len(hits)}) =====')
            for f, hs in sorted(by_file.items(), key=lambda kv: -len(kv[1])):
                print(f'\n--- {f}  ({len(hs)})')
                for h in hs:
                    print(f"    L{h['line']:<5} [{h['kind']}] {h['text']}")

    print('\n===== 汇总 =====')
    for cat, hits in results.items():
        print(f'  {cat:5s} {len(hits)}')
    print(f'  {"TOTAL":5s} {total}')

    if args.strict and total:
        print('\n[FAIL] --strict：存在英文模式残留中文')
        return 1
    print('\n[warn 模式] 以上为残留清单，不阻断 CI')
    return 0


if __name__ == '__main__':
    sys.exit(main())
