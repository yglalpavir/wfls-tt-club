"""调试 WTT Frontdoor 原始响应"""
import requests, time, json

url = 'https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking/SEN_SINGLES.json?q=' + str(int(time.time()*1000))
headers = {
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.worldtabletennis.com',
    'Origin': 'https://www.worldtabletennis.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

r = requests.get(url, headers=headers, timeout=30)
print(f"Status: {r.status_code}")
print(f"Content-Type: {r.headers.get('Content-Type', '?')}")
print(f"Content-Encoding: {r.headers.get('Content-Encoding', '?')}")
print(f"Body length: {len(r.content)}")
print(f"First 50 bytes (hex): {r.content[:50].hex()}")
print(f"First 50 bytes (raw): {r.content[:50]}")
print(f"First 300 chars repr: {repr(r.text[:300])}")
print(f"Encoding: {r.encoding}")
print(f"Apparent encoding: {r.apparent_encoding}")

# Try decode manually
raw = r.content
print(f"\nBytes 0-5: {[hex(b) for b in raw[:5]]}")

# Check for BOM
if raw[:3] == b'\xef\xbb\xbf':
    print("UTF-8 BOM detected!")
    text = raw[3:].decode('utf-8')
elif raw[:2] == b'\xff\xfe':
    print("UTF-16 LE BOM detected!")
    text = raw[2:].decode('utf-16-le')
elif raw[:2] == b'\xfe\xff':
    print("UTF-16 BE BOM detected!")
    text = raw[2:].decode('utf-16-be')
else:
    # Just try utf-8
    try:
        text = raw.decode('utf-8')
        print("Plain UTF-8 decode success")
    except:
        text = raw.decode('latin-1')
        print("Latin-1 decode used")

print(f"\nDecoded first 200 chars: {text[:200]}")

# Try to parse
try:
    data = json.loads(text)
    print(f"\nJSON success! Type: {type(data).__name__}")
    if isinstance(data, dict):
        print(f"Keys: {list(data.keys())}")
        for k, v in data.items():
            if isinstance(v, list):
                print(f"  {k}: list of {len(v)}")
                if v:
                    print(f"    first item keys: {list(v[0].keys()) if isinstance(v[0], dict) else type(v[0]).__name__}")
    elif isinstance(data, list):
        print(f"List of {len(data)} items")
        if data:
            print(f"First item: {json.dumps(data[0], indent=2)[:500]}")
except Exception as e:
    print(f"JSON error: {e}")
