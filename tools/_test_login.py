"""快速测试ITTF登录"""
import requests, re
from bs4 import BeautifulSoup

USERNAME = "Yglalpavir@gmail.com"
PASSWORD = "Suki0910@"

session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36'
})

print("1. 获取登录页面...")
r = session.get("https://results.ittf.link/index.php?option=com_users&view=login", timeout=30)
print(f"   状态码: {r.status_code}")

soup = BeautifulSoup(r.text, "html.parser")
csrf = soup.find("input", attrs={"type": "hidden", "value": "1", "name": re.compile(r"^[a-f0-9]{32}$")})

if csrf:
    print(f"   CSRF token: 找到 ({csrf.get('name')})")
else:
    print("   CSRF token: 未找到!")
    if "captcha" in r.text.lower():
        print("   页面包含CAPTCHA!")
    # 打印可能相关的部分
    forms = soup.find_all("form")
    print(f"   找到 {len(forms)} 个表单")
    for f in forms:
        action = f.get("action", "")
        print(f"   表单 action={action[:80]}")
    print("\n--- 关键部分 ---")
    text = r.text
    idx = text.find("task")
    if idx > 0:
        print(text[max(0, idx-50):idx+200])
    exit(1)

print("\n2. 提交登录...")
payload = {
    "username": USERNAME,
    "password": PASSWORD,
    "task": "user.login",
    csrf["name"]: "1",
}
r = session.post(
    "https://results.ittf.link/index.php?option=com_users&view=login",
    data=payload,
    timeout=30,
)
print(f"   状态码: {r.status_code}")
print(f"   Cookies数: {len(session.cookies)}")

if "logout" in r.text.lower() or len(session.cookies) > 1:
    print("\n   ✅ 登录成功!")
    cookie = "; ".join(f"{c.name}={c.value}" for c in session.cookies)
    print(f"   Cookie: {cookie[:200]}")

    # 验证cookie
    print("\n3. 验证Cookie...")
    r2 = session.get(
        "https://results.ittf.link/index.php?option=com_fabrik&format=json"
        "&task=plugin.cron.cronRun&listid=27&limit27=1",
        timeout=30,
    )
    print(f"   状态码: {r2.status_code}")
    if r2.status_code == 200:
        print("   ✅ Cookie有效!")
    else:
        print(f"   ❌ Cookie无效: {r2.text[:200]}")
else:
    print("\n   ❌ 登录失败")
    if "Invalid" in r.text.lower():
        print("   用户名或密码错误")
    elif "activate" in r.text.lower() or "activation" in r.text.lower():
        print("   账户未激活，请先点击邮箱中的激活链接!")
    elif "captcha" in r.text.lower():
        print("   需要CAPTCHA验证!")
    else:
        # 查找错误消息
        soup2 = BeautifulSoup(r.text, "html.parser")
        for cls in ["alert", "error", "message", "system-message"]:
            elems = soup2.find_all(class_=re.compile(cls))
            for e in elems:
                txt = e.get_text(strip=True)
                if len(txt) > 5:
                    print(f"   消息: {txt}")

    print(f"\n   响应前500字符:")
    print(r.text[:500])
