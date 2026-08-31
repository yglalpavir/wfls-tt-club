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
- `index.json` and `search.json` are **generated** — never edit manually
- Version snapshots (`{id}.v{n}.json`) and history manifests (`{id}.history.json`) are auto-maintained by `sync_content.py`
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
- **Dual pipelines**: club ranking (js/score-engine.js) and WTT ranking (js/wtt_common.js) are ~40% cloned code that has drifted — changes to scoring logic may need both
- **Global mutable state**: ~15 shared global variables (`scoreLogData`, `initialScoresData`, etc.) across 5+ scripts; WTT pages use manual save/swap/restore for data context
- **innerHTML everywhere**: `escapeHtml` in `js/common.js` does NOT escape quotes — inline `onclick` handlers with player names are an XSS vector (mitigated with data-* attributes in recent fixes)
- **Content loading**: pages use `fetch()` to load JSON at runtime; `robots.txt` must NOT block `/data/` or SEO gets empty shells
- **Season expiration**: if `seasons.json` last endDate passes, new matches silently extend the old season (no crash, but wrong data scope). Check with `ci_validate.py`

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

1. Editing `index.json` or `search.json` directly — they get overwritten by `sync_content.py`
2. Adding a news/competition/QA entry without running `sync_content.py`
3. Forgetting that `event-coefficient.json` has reserved object keys (`赛制系数`, `默认赛制`) mixed with numeric coefficient keys
4. Not checking season coverage after adding new matches — run `ci_validate.py`
5. Using `innerHTML` with unescaped player names containing quotes
6. Changing scoring logic in only one pipeline (club vs WTT) — they're separate implementations
