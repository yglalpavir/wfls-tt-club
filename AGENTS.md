# AGENTS.md — WFLS Table Tennis Club Website

Pure static site (HTML/CSS/JS, no build step, no test framework). Deployed on GitHub Pages.

## Critical commands

After editing any content in `data/{news,competitions,qa}/`:

```bash
python tools/sync_content.py          # Regenerate index.json + search.json + version history
python tools/sync_content.py --check  # Dry-run validation only
```

Validate data integrity (score-log references, season coverage, JSON parse):

```bash
python tools/ci_validate.py
```

No npm/lint/typecheck commands exist — there are no build tools or test suites.

## Content system (news / competitions / QA)

- **One folder per entry**: `data/{type}/{id}/{id}.json` is the single source of truth
- `index.json` and `search.json` are **generated** — never edit manually (`sync_content.py --check` diffs them against regenerated output and fails CI on mismatch)
- Version snapshots (`{id}.v{n}.json`) and history manifests (`{id}.history.json`) are auto-maintained by `sync_content.py` — and they are **fetched at runtime by detail pages** (version-history UI), so they must stay tracked and deployed
- Setting `"visible": false` hides an entry without deleting it
- Tag values are whitelisted (see README for exact lists)
- Date format: `YYYY-MM-DD` (used for sort order)

## Data flow

- `data/players.json` → single source for all player data (uid, initialScore, tags, honors, role)
- `data/score-log.json` → match records + bonus adjustments, consumed by `js/score-engine.js`
- `data/event-coefficient.json` → event type coefficients; reserved keys `赛制系数` and `默认赛制` are objects, not numbers — filter by `typeof v === 'number'` when iterating
- `data/seasons.json` → season definitions; **CI fails if current date exceeds last endDate** (must create new season)
- `data/decay-config.json` → half-life and no-decay types

## Architecture gotchas

- **No build step**: all JS loads via `<script>` tags; modules are global scope, not ES modules
- **Shared page chrome**: navbar / footer / QR modal are injected from `js/shared-partials.js` (`<script src="js/shared-partials.js" data-partial="nav|footer|qr-modal">`) — edit the template there, NOT per page. Active-link highlighting is applied at runtime by `highlightNavByPath()`; `wtt_hub.html` (custom chrome) is the only page exempt
- **Dual pipelines**: club ranking (js/score-engine.js) and WTT ranking (js/wtt_common.js) are ~40% cloned code that has drifted — changes to scoring logic may need both
- **Global mutable state**: ~15 shared global variables (`scoreLogData`, `initialScoresData`, etc.) across 5+ scripts; WTT pages should use `wttWithDataContext()` (try/finally-safe swap in `js/wtt_common.js`) — never hand-roll save/swap/restore
- **innerHTML everywhere**: `escapeHtml` in `js/common.js` escapes `& < > " '` — inline `onclick` handlers built from player names are gone (event delegation + `data-*` attributes). Keep it that way; don't reintroduce interpolated inline handlers
- **Content loading**: pages use `fetch()` to load JSON at runtime; `robots.txt` must NOT block `/data/` or SEO gets empty shells
- **Season expiration**: if `seasons.json` last endDate passes, new matches silently extend the old season (no crash, but wrong data scope). Check with `ci_validate.py`
- **Same-day duplicate match records are legit**: identical `(日期, 类型, 胜者, 负者)` rows in `score-log.json` are real multiple games (README has the convention) — do NOT dedupe, and `ci_validate.py` intentionally has no duplicate detector

## i18n

- Translation dictionary: `js/common.js` → `i18n` object with `zh` and `en` keys
- Language preference stored in localStorage (`wfls-lang.v1`)
- Some ranking/chart labels are still hardcoded Chinese — verify after edits

## File structure quick reference

| Path | Purpose |
|------|---------|
| `data/players.json` | Player profiles (single source of truth) |
| `data/score-log.json` | Match records + bonus adjustments |
| `data/seasons.json` | Season definitions (must cover current date) |
| `data/event-coefficient.json` | Event type coefficients |
| `data/decay-config.json` | Time decay config |
| `data/draws.json` | Tournament bracket data |
| `js/score-engine.js` | Club ranking calculation core |
| `js/wtt_common.js` | WTT data loading + ranking |
| `js/common.js` | i18n, global state, shared UI |
| `tools/sync_content.py` | Content index generator (run after any content edit) |
| `tools/ci_validate.py` | Data integrity validator |

## Common mistakes to avoid

1. Editing `index.json` or `search.json` directly — they get overwritten by `sync_content.py` (and `--check` now fails CI on drift)
2. Adding a news/competition/QA entry without running `sync_content.py`
3. Forgetting that `event-coefficient.json` has reserved object keys (`赛制系数`, `默认赛制`) mixed with numeric coefficient keys
4. Not checking season coverage after adding new matches — run `ci_validate.py`
5. Building inline `onclick` handlers from data — use event delegation + `data-*` attributes
6. Changing scoring logic in only one pipeline (club vs WTT) — they're separate implementations; reuse `LOSER_POINT_MULTIPLIER` / `DECAY_HALF_LIFE_DAYS` instead of hardcoding coefficients
7. Editing nav/footer markup in individual HTML pages — it lives in `js/shared-partials.js`
8. Deduplicating same-day repeated match records — they are intentional (multiple games per day)
