import requests
from bs4 import BeautifulSoup
import json
import os
import time
from tqdm import tqdm


BASE_URL = "https://tleague.jp/schedule/detail.php?id={}"

START_ID = 1
END_ID = 2000   # 根据需要扩大

SAVE_DIR = "tleague_data"

HEADERS = {
    "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}


os.makedirs(SAVE_DIR, exist_ok=True)


def get_page(match_id):

    url = BASE_URL.format(match_id)

    try:
        r = requests.get(
            url,
            headers=HEADERS,
            timeout=10
        )

        if r.status_code != 200:
            return None

        if "試合結果" not in r.text:
            return None

        return r.text

    except Exception:
        return None



def parse_match(html, match_id):

    soup = BeautifulSoup(
        html,
        "lxml"
    )


    title = soup.title.text.strip() if soup.title else ""


    text = soup.get_text(
        "\n",
        strip=True
    )


    data = {
        "id": match_id,
        "title": title,
        "url": BASE_URL.format(match_id),
        "raw_text": text
    }


    return data



def crawl():

    results = []


    for match_id in tqdm(
        range(START_ID, END_ID+1)
    ):

        html = get_page(match_id)


        if html is None:
            continue


        print(
            "FOUND",
            match_id
        )


        data = parse_match(
            html,
            match_id
        )


        results.append(data)


        # 保存单场
        with open(
            f"{SAVE_DIR}/{match_id}.json",
            "w",
            encoding="utf-8"
        ) as f:

            json.dump(
                data,
                f,
                ensure_ascii=False,
                indent=2
            )


        time.sleep(0.3)



    with open(
        "tleague_all.json",
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            results,
            f,
            ensure_ascii=False,
            indent=2
        )


if __name__ == "__main__":
    crawl()
