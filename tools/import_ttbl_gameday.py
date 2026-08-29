"""Fetch TTBL (Tischtennis Bundesliga) gameday match data from ttbl.de.

Data is extracted from the __NEXT_DATA__ JSON payload embedded in each
Next.js page, which contains the complete structured match information
(lineups, per-game matchups with set scores, statistics, venue, etc.).

Usage:
    python import_ttbl_gameday.py --season 2026-2027 --gameday 1
    python import_ttbl_gameday.py --season 2026-2027 --gameday 1 --with-events

Output:
    tools/ttbl_data/ttbl_<season>_gameday<N>.json
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

BASE_URL = "https://www.ttbl.de"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; wfls-tt-club-data-import/1.0)"
}
NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S
)
TOOL_DIR = Path(__file__).resolve().parent
DEFAULT_OUT_DIR = TOOL_DIR / "ttbl_data"

LINEUP_KEYS = [
    ("homePlayerOne", "homePlayerTwo", "homePlayerThree",
     "homeSubstitutePlayerOne", "homeSubstitutePlayerTwo", "homeSubstitutePlayerThree"),
    ("guestPlayerOne", "guestPlayerTwo", "guestPlayerThree",
     "guestSubstitutePlayerOne", "guestSubstitutePlayerTwo", "guestSubstitutePlayerThree"),
]
SET_FIELDS = [(f"set{i}HomeScore", f"set{i}AwayScore") for i in range(1, 6)]


def fetch_next_data(url: str) -> dict:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.content.decode("utf-8")
    m = NEXT_DATA_RE.search(html)
    if not m:
        raise RuntimeError(f"__NEXT_DATA__ not found in {url}")
    return json.loads(m.group(1))["props"]["pageProps"]


def clean_player(p):
    if not p or not p.get("id"):
        return None
    first = (p.get("firstName") or "").strip()
    last = (p.get("lastName") or "").strip()
    return {
        "id": p.get("id"),
        "name": f"{first} {last}".strip(),
        "imageUrl": p.get("imageUrl"),
    }


def clean_team(t):
    if not t:
        return None
    return {
        "id": t.get("id"),
        "seasonTeamId": t.get("seasonTeamId"),
        "name": t.get("name"),
        "logoPngUrl": t.get("logoPngUrl"),
    }


def clean_double(d):
    if not d:
        return None
    return {
        "id": d.get("id"),
        "players": [
            clean_player(d.get("leaguePlayerOne")),
            clean_player(d.get("leaguePlayerTwo")),
        ],
    }


def clean_game(g: dict, include_events: bool) -> dict:
    sets = []
    for home_key, away_key in SET_FIELDS:
        h, a = g.get(home_key), g.get(away_key)
        if h is None and a is None:
            break
        sets.append([h, a])

    game = {
        "index": g.get("index"),
        "state": g.get("gameState"),
        "winner": g.get("winnerSide"),
        "type": "double" if g.get("homeDouble") or g.get("awayDouble") else "singles",
        "homePlayer": clean_player(g.get("homePlayer")),
        "awayPlayer": clean_player(g.get("awayPlayer")),
        "homeDouble": clean_double(g.get("homeDouble")),
        "awayDouble": clean_double(g.get("awayDouble")),
        "setsHome": g.get("homeSets"),
        "setsAway": g.get("awaySets"),
        "sets": sets,
        "timeoutsUsed": {"home": g.get("homeTimeoutUsed"), "away": g.get("awayTimeoutUsed")},
        "cards": g.get("cards"),
        "stats": {
            "pointsOnServe": [g.get("homePointsOnServe"), g.get("awayPointsOnServe")],
            "pointsOnReturn": [g.get("homePointsOnReturn"), g.get("awayPointsOnReturn")],
            "pointsInARow": [g.get("homePointsInARow"), g.get("awayPointsInARow")],
            "luckyPoints": [g.get("homeLuckyPoints"), g.get("awayLuckyPoints")],
            "highestLead": [g.get("homeHighestLead"), g.get("awayHighestLead")],
            "matchPoints": [g.get("homeMatchPoints"), g.get("awayMatchPoints")],
        },
    }
    if include_events:
        game["scoringUpdates"] = g.get("scoringUpdates")
    return game


def clean_match(sm: dict, season: str, gameday, include_events: bool, league: str = "bundesliga") -> dict:
    ts = sm.get("timeStamp")
    kickoff_utc = (
        datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None
    )
    venue = sm.get("venue") or {}

    lineups = {"home": [], "away": []}
    for side, keys in zip(("home", "away"), LINEUP_KEYS):
        for key in keys:
            player = clean_player(sm.get(key))
            if player:
                lineups[side].append(player)

    games_raw = sm.get("games") or []
    games = [clean_game(g, include_events) for g in games_raw]
    games.sort(key=lambda g: g["index"] or 0)

    return {
        "id": sm.get("id"),
        "url": f"{BASE_URL}/{league}/gameday/{season}/{gameday}/{sm.get('id')}",
        "state": sm.get("matchState"),
        "kickoffUtc": kickoff_utc,
        "spectators": sm.get("spectators"),
        "venue": {
            "name": venue.get("name"),
            "address": venue.get("adress"),
            "zipCode": venue.get("zipCode"),
            "place": venue.get("place"),
            "imageUrl": venue.get("imageUrl"),
        },
        "livestreamUrl": sm.get("livestreamUrl"),
        "ticketshopUrl": sm.get("ticketshopUrl"),
        "homeTeam": clean_team(sm.get("homeTeam")),
        "awayTeam": clean_team(sm.get("awayTeam")),
        "score": {
            "games": [sm.get("homeGames"), sm.get("awayGames")],
            "sets": [sm.get("homeSets"), sm.get("awaySets")],
        },
        "lineups": lineups,
        "games": games,
    }


def fetch_gameday(season: str, gameday: int, include_events: bool, league: str = "bundesliga") -> dict:
    schedule_url = f"{BASE_URL}/{league}/gameschedule/{season}/{gameday}/all"
    print(f"[1/2] Fetching gameday overview: {schedule_url}")
    page_props = fetch_next_data(schedule_url)
    matches = page_props.get("matches") or []
    if not matches:
        raise RuntimeError(f"No matches found for {season} gameday {gameday}")
    # Pokal rounds return matches from several rounds in one page; resolve each
    # match to its own gameday index so the correct /gameday/{index}/{id} URL is hit.
    gd_by_id = {g["id"]: g.get("index") for g in (page_props.get("gamedays") or [])}
    match_ids = [(m["id"], gd_by_id.get(m.get("gamedayId"), gameday)) for m in matches]
    gd_meta = page_props.get("selectedGameday") or page_props.get("gameday") or {}
    print(f"      Found {len(match_ids)} matches")

    results = []
    total = len(match_ids)
    for i, (mid, m_gd) in enumerate(match_ids, 1):
        url = f"{BASE_URL}/{league}/gameday/{season}/{m_gd}/{mid}"
        print(f"[2/2] Fetching match {i}/{total}: {mid} (gameday {m_gd})")
        sm = fetch_next_data(url).get("selectedMatch")
        if not sm:
            raise RuntimeError(f"selectedMatch missing for {url}")
        results.append(clean_match(sm, season, m_gd, include_events, league))
        if i < total:
            time.sleep(0.5)

    league_label = gd_meta.get("league") or league.capitalize()
    return {
        "source": "ttbl.de",
        "league": league_label,
        "season": season,
        "gameday": gd_meta.get("index", gameday),
        "gamedayName": gd_meta.get("name"),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "matchCount": len(results),
        "matches": results,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", required=True, help="e.g. 2026-2027")
    parser.add_argument("--gameday", required=True, type=int, help="e.g. 1")
    parser.add_argument("--league", default="bundesliga", choices=["bundesliga", "pokal"],
                        help="competition: bundesliga (default) or pokal (German Cup)")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    parser.add_argument(
        "--with-events",
        action="store_true",
        help="include raw point-by-point scoring events (large)",
    )
    args = parser.parse_args()

    data = fetch_gameday(args.season, args.gameday, args.with_events, args.league)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = f"ttbl_{args.league}_" if args.league != "bundesliga" else "ttbl_"
    out_file = out_dir / f"{prefix}{args.season}_gameday{args.gameday}.json"
    out_file.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Saved {out_file} ({out_file.stat().st_size:,} bytes)")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
