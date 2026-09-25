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

Regenerate the Assets manifest for the docs.html asset browser (auto-generated at deploy time; run manually for local dev, otherwise docs.html shows a load error):

```bash
python tools/gen_assets_manifest.py
```

No npm/lint/typecheck commands exist — there are no build tools or test suites.

## Content system (news / competitions / QA)

- **One folder per entry**: `data/{type}/{id}/{id}.json` is the single source of truth
- `index.json` and `search.json` are **generated** — never edit manually (`sync_content.py --check` diffs them against regenerated output and fails CI on mismatch)
- Version snapshots (`{id}.v{n}.json`) and history manifests (`{id}.history.json`) are auto-maintained by `sync_content.py` — and they are **fetched at runtime by detail pages** (version-history UI), so they must stay tracked and deployed
- Setting `"visible": false` hides an entry without deleting it
- Tag values are whitelisted (see README for exact lists)
- Date format: `YYYY-MM-DD` (used for sort order)
- **Inline media markers**: `{{media:N}}` / `{{media:mid}}` in `content` embed an item from that entry's `media` array at that spot; the `media` array stays the single source of attachment files and is validated by `sync_content.py` (dangling refs warn). Unreferenced media still renders in the bottom gallery — old entries need no migration. Marker rendering lives in `js/common.js` (`renderDetailBody` / `embedDetailMedia`); keep the JS regex and the Python `MEDIA_REF_RE` in sync

## Data flow

- `data/players.json` → single source for all player data (uid, initialScore, tags, honors, role)
- `data/score-log.json` → match records + bonus adjustments, consumed by `js/score-engine.js`
- **Doubles records (双打)**: `类型: "双打"` matches carry `胜者`/`负者` as `"甲/乙"` pair strings (WTT-site pattern, pair-as-entity). Pair names are normalized at load (`js/common.js` `normalizeDoublesPairName`, members sorted by pinyin — "A/B" ≡ "B/A") and all URLs/details must use the in-memory canonical form. Singles pipelines filter doubles records OUT (`isDoublesRecord`), the doubles ranking runs on doubles-only records with pair initial scores (`buildDoublesInitialScores` = average of the two members' singles points on the pair's first match day; doubles is in `noDecayTypes` — no decay). Any computation outside the loaded page's own口径 must swap engine globals via `withScoreContext()` (common.js) — engine caches key off the `scoreLogData` array reference. Python validators (`ci_validate.py` / `append_submission.py`) validate pairs member-by-member and compare self-play on the member set
- `data/event-coefficient.json` → event type coefficients; reserved keys `赛制系数` and `默认赛制` are objects, not numbers — filter by `typeof v === 'number'` when iterating
- `data/seasons.json` → season definitions; **CI fails if current date exceeds last endDate** (must create new season)
- `data/decay-config.json` → half-life and no-decay types
- `data/draws.json` → tournament brackets (v3), rendered by `js/draws-viewer.js`, edited via `draws-editor.html`
- `data/api/` → **read-only public data API (rankings / snapshots / players / matches), generated at deploy time** by `tools/recompute_rankings.js` inside the `deploy` workflow — gitignored, NOT committed (no merge conflicts with the deploy bot). Endpoints are documented by `data/api/index.html`, itself generated. Local runs of the script are safe but produce ignored files.
- **Visitor submission pipeline (3 channels)** → entrance button lives on `ranking.html` under the 积分计算规则 pill (same `qa-link-btn` style). ① Tencent Docs form (no account needed; the ONLY visitor-visible entry on `submit.html`): owner marks an 审核 column, exports CSV, `tools/import_submissions_csv.py` validates + appends locally (dedup state in gitignored `tools/.import-state.json`); ② GitHub Issues: `submit.html` builds a prefilled issue (label `提交`), a maintainer applies `审核通过`, `.github/workflows/submission-review.yml` parses it via `tools/append_submission.py` and opens a **PR** — never push bot commits directly to `main`; ③ QQ group fallback (copy JSON). The GitHub button and the whole manual-entry card are hidden behind `ENABLE_GITHUB_SUBMIT` / `ENABLE_MANUAL_ENTRY` flags at the top of `submit.html` — don't "fix" the missing UI, flip the flags. All channels share the same validity rules (via `append_submission.py`'s functions) and `ci_validate.py` stays the final gate. Score records may carry optional `比分` ("3-1") / `局分` (["11-9", ...], winner-perspective) fields; the engine ignores unknown fields. WTT score-logs (`wtt_data/*/score-log-*.json`) support the same optional fields — rendered by match-detail (both modes), the wtt_ranking score-detail modal and the wtt_player match table (score column auto-appears when any row carries them), and validated by `ci_validate.py` under the same rules (WTT records have no `赛制`, so the games-count-vs-format check is skipped for them).

## Architecture gotchas

- **No build step**: all JS loads via `<script>` tags; modules are global scope, not ES modules
- **Shared page chrome**: navbar / footer / QR modal are injected from `js/shared-partials.js` (`<script src="js/shared-partials.js" data-partial="nav|footer|qr-modal">`) — edit the template there, NOT per page. Active-link highlighting is applied at runtime by `highlightNavByPath()`; `wtt_hub.html` (custom chrome) is the only page exempt
- **Dual pipelines**: club ranking (js/score-engine.js) and WTT ranking (js/wtt_common.js) are ~40% cloned code that has drifted — changes to scoring logic may need both
- **Global mutable state**: ~15 shared global variables (`scoreLogData`, `initialScoresData`, etc.) across 5+ scripts; WTT pages should use `wttWithDataContext()` (try/finally-safe swap in `js/wtt_common.js`) — never hand-roll save/swap/restore
- **innerHTML everywhere**: `escapeHtml` in `js/common.js` escapes `& < > " '` — inline `onclick` handlers built from player names are gone (event delegation + `data-*` attributes). Keep it that way; don't reintroduce interpolated inline handlers
- **Content loading**: pages use `fetch()` to load JSON at runtime; `robots.txt` must NOT block `/data/` or SEO gets empty shells
- **Season expiration**: if `seasons.json` last endDate passes, new matches silently extend the old season (no crash, but wrong data scope). Check with `ci_validate.py`
- **Same-day duplicate match records are legit**: identical `(日期, 类型, 胜者, 负者)` rows in `score-log.json` are real multiple games (README has the convention) — do NOT dedupe, and `ci_validate.py` intentionally has no duplicate detector
- **Draws shared core**: bracket data model / layout geometry / validation / templates / serialization all live in `js/draws-core.js`, shared by the spectator viewer (`js/draws-viewer.js`, used by `detail.html`) and the visual editor (`js/draws-editor.js` + `draws-editor.html`, entry in `admin.html`). Change geometry or the v3 schema THERE, not in either consumer. `detail.html` must load `draws-core.js` before `draws-viewer.js`
- **Draws v2 backward compat**: the viewer normalizes v2 data in memory (`dcNormalizeDraw`) — don't assume `draws.json` cards always have `type` or structured player objects; `winner` values 0/1/2 and card id uniqueness are enforced by `ci_validate.py`

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
| `data/umpire-quiz.json` | Umpire-training easter-egg quiz (questions → videos in `Assets/videos/umpire/`) |
| `data/draws.json` | Tournament bracket data (v3: cards + connections + structured players) |
| `data/api/` | Generated read-only data API (deploy-time only, gitignored) |
| `js/score-engine.js` | Club ranking calculation core |
| `js/wtt_common.js` | WTT data loading + ranking |
| `js/common.js` | i18n, global state, shared UI |
| `js/draws-core.js` | Draws shared core (v3 model, layout, validation, templates, serialization) |
| `js/draws-viewer.js` | Bracket spectator renderer (detail.html) |
| `js/draws-editor.js` | Bracket visual editor logic (draws-editor.html) |
| `tools/sync_content.py` | Content index generator (run after any content edit) |
| `tools/ci_validate.py` | Data integrity validator |
| `tools/recompute_rankings.js` | Generates `data/api/` (runs the real score engine headless in a Node vm) |
| `tools/gen_assets_manifest.py` | Scans `Assets/` into `Assets/manifest.json` (deploy-time generated, gitignored — same pattern as `data/api/`; run manually for local dev) |
| `docs.html` | 网站文档/Docs: read-only file-manager view over `Assets/` (breadcrumb nav, grid/list, type filter, search; previews image/svg/video/audio/pdf/text/code/markdown via modal) — data comes from `Assets/manifest.json`; entry lives in the navbar **More…** dropdown (`nav_docs`), page uses shared chrome + `common.js` i18n (`docs_*` keys) |
| `js/docs-browser.js` | docs.html logic: manifest-tree path validation (hash routes are never used to build URLs directly), event delegation, hash routing `#/dir` / `#/dir/file`, lazy marked.js load for Markdown preview; UI strings resolve via `t()` from `common.js` i18n with zh fallback, re-rendered by `docsBrowserReapplyI18n()` on language switch |
| `tools/migrate_draws_v3.py` | One-shot draws.json v2 → v3 migration (finished; kept locally only, gitignored) |
| `js/season-review.js` | Season review page logic (club + WTT dual mode, switched by `window.SR_WTT_MODE`) |
| `match.html` / `wtt_match.html` | Match-detail page for a single score-log record (WTT wrapper sets `window.MD_WTT_MODE`) |
| `js/match-detail.js` | Match-detail logic: 比分/局分, pre/post-match points, points breakdown, predicted win rate, H2H (club + WTT dual mode) |
| `docs/` | `tech/` long-lived technical docs · `reports/` one-off prediction/audit reports · `posters/` poster HTML sources |
| `submit.html` | Visitor match-record submission page (builds a prefilled GitHub issue) |
| `Assets/manifest.json` | **Generated at deploy time** by `tools/gen_assets_manifest.py` inside the `deploy` workflow — gitignored, NOT committed. docs.html fetches it; if missing (local dev), the page shows a hint to run the script |
| `tt_game/` | 3D table-tennis game easter egg (Three.js; UI reskinned with the site's design system). Homepage hero-ball links straight here (plain `<a href>` in `index.html`; the tt_game/umpire-training rotation script and its `wfls-egg-last` localStorage key were removed 2026-09-19 — umpire-training as a homepage egg is deferred, not deleted). `tt_game/js/` is an active training workspace (weight `.bak`s, logs) — game runtime files are the ones referenced by `tt_game/index.html` script tags. Selectable models live in `js/input.js` `MODEL_NAMES` + hardcoded buttons/options in `index.html`（极端对手/极端·满档 unselectable since 2026-09-19, but `opponent-ladder.js` levels stay — `tools/train-input3.js` curriculum depends on them）; 「地狱AI克星」 is trained by `tools/train-nemesis.js` (GA, fitness = dual-orientation unbiased point-rate vs hell, ANSI live CLI panel) writing `js/learned-policy-nemesis.js`. The hell-AI guardrail口径 (moveSpeed 2.8/moveErr 0.03/moveZ 2.6) is intentionally duplicated in THREE places — `policy.js strongVec`, `train-nemesis.js HELL_GUARD`, `train-nemesis-worker.js hellOpponent` — keep them in sync or training/实机 drift apart |
| `.github/ISSUE_TEMPLATE/match-record.yml` | Issue form for submissions (auto-labels `提交`) |
| `.github/workflows/submission-review.yml` | Turns `审核通过`-labeled submission issues into PRs |
| `tools/append_submission.py` | Parses/validates issue-submitted records, appends to `score-log.json` |
| `tools/import_submissions_csv.py` | Imports Tencent Docs CSV exports into `score-log.json` (same validation rules) |

Tracked tree is deploy-facing only: `.zcode/` / `.opencode/` (AI session plans), `.vscode/`, `.poster-preview/`, one-off `tools/` scripts and raw research data are all gitignored and exist only on local disks — never commit them.

## Common mistakes to avoid

1. Editing `index.json` or `search.json` directly — they get overwritten by `sync_content.py` (and `--check` now fails CI on drift)
2. Adding a news/competition/QA entry without running `sync_content.py`
3. Forgetting that `event-coefficient.json` has reserved object keys (`赛制系数`, `默认赛制`) mixed with numeric coefficient keys
4. Not checking season coverage after adding new matches — run `ci_validate.py`
5. Building inline `onclick` handlers from data — use event delegation + `data-*` attributes
6. Changing scoring logic in only one pipeline (club vs WTT) — they're separate implementations; reuse `LOSER_POINT_MULTIPLIER` / `DECAY_HALF_LIFE_DAYS` instead of hardcoding coefficients. Decayed match points are **per-side**: always use `calcMatchPointsDual()` — never derive the loser's decayed deduction from the winner's freeze weight (their 球员×类型 batches differ)
7. Editing nav/footer markup in individual HTML pages — it lives in `js/shared-partials.js`
8. Deduplicating same-day repeated match records — they are intentional (multiple games per day)
9. Committing `data/api/` — it is generated at deploy time by the `deploy` workflow and gitignored; committing it recreates merge conflicts with deployments
10. Letting the submission bot push to `main` directly, or editing `submit.html` / `append_submission.py` validation without keeping it in sync with `ci_validate.py` — the three must agree on what a valid record is; PRs are the only ingest path (the retired `recompute.yml` bot-commit workflow is the cautionary tale)
11. Hand-building match-detail URLs from raw score-log names — links must go through `buildMatchDetailUrl()` with the in-memory (alias-normalized; WTT doubles pairs alphabetically re-sorted) names, tuple + same-day occurrence `n`; raw-file pair order won't match the normalized log. Get `n` from `computeMatchOccurrenceMap(localLog)` (common.js, keyed by record object, same ordering as `mdCompute`) — every list page (ranking / player-page / data-viz / wtt_*) must pass it, or same-day duplicate matchups all open the first game
12. Mixing 口径 when computing with club doubles data present: singles timelines must run on the non-doubles log and doubles timelines on doubles-only records (bonus records are singles-only), each wrapped in `withScoreContext()` — running the engine directly on the raw full log turns pairs into phantom ranking rows; also never build pair display/links from the raw `"A/B"` string without `splitPairNames()` (order in the file is not canonical)
