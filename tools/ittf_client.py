# -*- coding: utf-8 -*-
"""results.ittf.link 抓取客户端。

- 用 curl_cffi 浏览器 TLS 指纹模拟绕过 Cloudflare（纯 requests/Invoke-WebRequest 会被拦）
- 登录方式：
    1) 用户名/密码 —— 环境变量 ITTF_USER / ITTF_PASS，或 tools/.ittf_creds.json
    2) 已有会话 Cookie —— 环境变量 ITTF_COOKIE 或 --cookie 参数
- 抓取：赛事列表、单赛事匹配表（分页）
- 不写入任何凭据到日志

用法见 tools/scrape_ittf_2012.py 与 tools/probe_ittf.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import time

from bs4 import BeautifulSoup

from curl_cffi import requests as cr

BASE = "https://results.ittf.link"
PROFILES = ("chrome124", "chrome120", "safari18_0", "chrome110", "edge101")
CRDS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".ittf_creds.json")

DEFAULT_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

GATE_MARKER = "Click here to register"
LOGIN_DENIED_MARKERS = ("Login denied!", "account has either been blocked", "not activated it yet")
CF_MARKER = "One moment, please"


def _is_blocked_or_error(html):
    """页面是否要求登录、提示被禁、或提示账号未激活。"""
    if not html:
        return True
    hl = html.lower()
    return (GATE_MARKER in html
            or "com-users-login" in hl
            or any(m.lower() in hl for m in LOGIN_DENIED_MARKERS))


def _log(msg, verbose=True):
    if verbose:
        print(msg, flush=True)


def strip_chrome(html):
    """去掉 script/style，便于肉眼检查正文。"""
    t = re.sub(r"<script.*?</script>", " ", html or "", flags=re.S)
    t = re.sub(r"<style.*?</style>", " ", t, flags=re.S)
    return t


class IttfClient:
    def __init__(self, profile=None, verbose=True, pause=1.5):
        self.profile = profile or PROFILES[0]
        self.verbose = verbose
        self.pause = pause
        self.s = cr.Session()
        self.s.headers.update(DEFAULT_HEADERS)

    # ---------------- 基础请求 ----------------
    def _imp(self, offset=0):
        return PROFILES[(PROFILES.index(self.profile) + offset) % len(PROFILES)]

    def get(self, path, params=None, allow_redirects=True, tries=3,
            headers=None, wait=True, dump=None, timeout=120):
        url = path if path.startswith("http") else BASE + path
        last = None
        for k in range(tries):
            imp = self._imp(k)
            try:
                r = self.s.get(url, params=params, impersonate=imp,
                               headers={"Referer": BASE + "/", **(headers or {})},
                               allow_redirects=allow_redirects, timeout=timeout)
            except Exception as e:
                last = "%s: %s" % (type(e).__name__, e)
                time.sleep(2.0)
                continue
            txt = r.text or ""
            if CF_MARKER in txt:
                last = "cloudflare-challenge"
                time.sleep(3.0)
                continue
            last = None
            break
        if last:
            raise RuntimeError("GET %s 失败 (last=%s)" % (url, last))
        if dump:
            open(dump, "w", encoding="utf-8").write(txt)
        if wait and self.pause:
            time.sleep(self.pause)
        return r

    def post(self, path, data=None, params=None, tries=3,
             headers=None, allow_redirects=True):
        url = path if path.startswith("http") else BASE + path
        last = None
        for k in range(tries):
            imp = self._imp(k)
            try:
                r = self.s.post(url, data=data, params=params, impersonate=imp,
                                headers={"Referer": BASE + "/login", **(headers or {})},
                                allow_redirects=allow_redirects, timeout=120)
            except Exception as e:
                last = "%s: %s" % (type(e).__name__, e)
                time.sleep(2.0)
                continue
            last = None
            break
        if last:
            raise RuntimeError("POST %s 失败 (last=%s)" % (url, last))
        return r

    # ---------------- 登录 ----------------
    @staticmethod
    def csrf_from(html):
        m = re.search(r'csrf\.token"\s*:\s*"([0-9a-f]{32})"', html or "")
        if m:
            return m.group(1)
        m = re.search(r'<input[^>]+type="hidden"[^>]+name="([0-9a-f]{32})"[^>]+value="1"', html or "")
        return m.group(1) if m else None

    @staticmethod
    def form_action(html):
        m = re.search(r'<form[^>]+id="com-users-login__form"[^>]+action="([^"]+)"', html or "")
        return m.group(1) if m else "/index.php/login?task=user.login"

    def load_credentials(self):
        user = os.environ.get("ITTF_USER")
        pwd = os.environ.get("ITTF_PASS")
        if user and pwd:
            return user, pwd
        if os.path.exists(CRDS_FILE):
            with open(CRDS_FILE, encoding="utf-8") as f:
                d = json.load(f)
            return d.get("username"), d.get("password")
        return None, None

    def login(self, username=None, password=None, return_url="/index.php/events"):
        """用户名密码登录。成功后返回 True。"""
        username = username or (self.load_credentials()[0])
        password = password or (self.load_credentials()[1])
        if not (username and password):
            raise SystemExit(
                "未提供凭据。请设置环境变量 ITTF_USER / ITTF_PASS，\n"
                "或写入 tools/.ittf_creds.json（该文件已被 .gitignore 排除）。")
        r = self.get("/index.php/login")
        tok = self.csrf_from(r.text)
        action = self.form_action(r.text)
        if not tok:
            raise RuntimeError("未找到 CSRF token（登录页结构可能已变化）")
        ret_b64 = __import__("base64").b64encode((BASE + return_url).encode()).decode()
        _log("  -> 登录 POST %s (token=%s…)" % (action, tok[:8]), self.verbose)
        r = self.post(action, data={
            "username": username,
            "password": password,
            "remember": "yes",
            "return": ret_b64,
            tok: "1",
        })
        body = r.text or ""
        ok = not _is_blocked_or_error(body)
        _log("  <- status=%s final=%s len=%d logged_in=%s"
             % (r.status_code, r.url, len(body), ok), self.verbose)
        if not ok:
            _log("  !! 登录失败，页面提示：%s" % (
                next((m for m in LOGIN_DENIED_MARKERS if m.lower() in body.lower()),
                     GATE_MARKER if GATE_MARKER in body else "(未知)")),
                 self.verbose)
        return ok

    def login_with_cookie(self, cookie_str):
        """用已登录会话 Cookie 直接建立会话。"""
        for kv in [p.strip() for p in cookie_str.split(";") if p.strip()]:
            if "=" not in kv:
                continue
            k, v = kv.split("=", 1)
            self.s.cookies.set(k.strip(), v.strip(), domain="results.ittf.link")
        return self.is_logged_in()

    def is_logged_in(self, path="/index.php/events"):
        try:
            r = self.get(path)
        except Exception as e:
            _log("  is_logged_in 探测失败: %s" % e, self.verbose)
            return False
        return not _is_blocked_or_error(r.text)


def find_login_gated(r):
    """该响应是否是被重定向到登录页，或提示账号被禁/未激活。"""
    return _is_blocked_or_error(r.text)
