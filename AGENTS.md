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

Refresh `sitemap.xml` / `feed.xml` after adding or removing a **public, indexable** page (they are committed, not deploy-generated, and CI diffs them):

```bash
python tools/generate_meta.py          # Regenerate both
python tools/generate_meta.py --check  # CI gate: exits 1 on drift
```

`lastmod` must depend only on things that change when you commit — the HEAD commit date, and the newest `date` in `data/{news,competitions,qa}/index.json`. It must **not** be seeded from `date.today()`: `sitemap.xml` is a committed file, so a `today` seed makes the gate fail every day that passes without a commit. Because `git_head_lastmod()` reads HEAD, regenerate *after* committing the change that moved it.

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

- `data/players.json` → single source for all player data (uid, initialScore, tags, honors, role). Optional `"visible": false` on a player = 档案暂不在前台展示（排名行与时间线 / 球员列表 / 个人页 / 首页成员卡 / 公开 API 全部过滤；算分口径不变，引擎仍收他的 initialScore 并照常重放他的记录）——**有战绩也照样隐藏**（`isRankingRowHidden()` 过滤排名行，名次编号按公开名单连续；`visible:false` 期间的比赛记录照录，公布时删键即还原）。过滤点在各渲染层（`isPlayerVisible`/`isPlayerHiddenName` in common.js、`isRankingRowHidden`/`isProfileActivePlayer` in score-engine.js、`getAllPlayers*`、`data-scale.js`、`recompute_rankings.js`）——新增球员列表或排名行渲染时记得带上这一层，细则见 `docs/tech/players-json.md` §3.13
- `data/score-log.json` → match records + bonus adjustments, consumed by `js/score-engine.js`
- **Doubles records (双打)**: `类型: "双打"` matches carry `胜者`/`负者` as `"甲/乙"` pair strings (WTT-site pattern, pair-as-entity). Pair names are normalized at load (`js/common.js` `normalizeDoublesPairName`, members sorted by pinyin — "A/B" ≡ "B/A") and all URLs/details must use the in-memory canonical form. Singles pipelines filter doubles records OUT (`isDoublesRecord`), the doubles ranking runs on doubles-only records with pair initial scores (`buildDoublesInitialScores` = average of the two members' singles points on the pair's first match day minus an imbalance discount of `0.25×` the members' score gap — i.e. 50% average + 50% weaker member, constant `DOUBLES_GAP_DISCOUNT`, rules in qa q4; doubles is in `noDecayTypes` — no decay). Any computation outside the loaded page's own口径 must swap engine globals via `withScoreContext()` (common.js) — engine caches key off the `scoreLogData` array reference. Python validators (`ci_validate.py` / `append_submission.py`) validate pairs member-by-member and compare self-play on the member set
- `data/event-coefficient.json` → event type coefficients; reserved keys `赛制系数` and `默认赛制` are objects, not numbers — filter by `typeof v === 'number'` when iterating
- `data/seasons.json` → season definitions; **CI fails if current date exceeds last endDate** (must create new season)
- `data/decay-config.json` → time-decay config: `t` (half-life in days), `minWeight` (weight floor — the decayed weight never drops below it), `noDecayTypes` (permanently preserved types). Club decay reads **only** this file (`loadDecayConfig()` overrides the JS fallback constants in `js/score-engine.js`); the `HALF_LIFE_DAYS = 180` in `js/common.js` is a stale WTT-page leftover (WTT sets `SCORE_TIME_DECAY_ENABLED = false`, so its whole decay path returns 1). Never hardcode a half-life or floor in JS — `tools/ci_validate.py` validates `t` / `minWeight`
- **Base-score band is decided "as of the match date"**: a match's base band comes from the score gap **as of the match date** — `buildRawPointsTable()` (js/score-engine.js) precomputes every record's raw points from a per-player “frozen part + decaying tail” state, and `calcRawPoints(..., record)` / `calcMatchPointsDual(..., record)` read it via the optional trailing `record` arg (omit the arg and the old snapshot-口径 lookup runs — WTT, doubles records and research scripts keep the old path). Consequence: a match's 「产生分」 is identical in every snapshot; snapshots differ only through the time weight. Doubles pair initial scores already use the match-day basis (`getScoreMapAsOf(首赛日)`). Rules text: qa q1 §6.1.2
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

Goal: **EN mode renders zero Chinese** anywhere on the site, including admin / draws-editor / 404 / umpire-training / tt_game.

- Translation dictionary: `js/common.js` → `i18n` object with `zh` and `en` keys. `tt_game/` is a separate sub-site with its own dictionary (`tt_game/js/i18n.js` → `window.GAME_I18N`, `gameT(key, data)`), but it shares the same `wfls-lang.v1` localStorage key.
- Language preference stored in localStorage (`wfls-lang.v1`); default is `zh`, EN is opt-in via the toggle. `setLanguage()` applies the stored language unconditionally on boot — pages **without** a `#langToggle` still get the stored language, only the button listener is conditional.

### Attribute channels (all walked by `setLanguage()`)

| Attribute | Target | Notes |
|---|---|---|
| `data-i18n` | `innerHTML` | Replaces the **whole subtree** — child elements need no attributes of their own |
| `data-i18n-title` | `title` | |
| `data-i18n-placeholder` | `placeholder` | |
| `data-i18n-aria` | `aria-label` | |
| `data-i18n-alt` | `alt` | |
| `data-i18n-content` | `content` | `<meta>` / `<title>` (SEO + document.title) |

`<title data-i18n="..._page_title">` works because `innerHTML` on a `<title>` element drives `document.title`.

### Dynamic pages MUST register a re-apply hook

`setLanguage()` ends with a list of guarded `if (typeof xxxReapplyI18n === 'function')` calls. Any page that **renders Chinese from JS** must define its hook (keep the last render args in a module-level variable and re-render), or the page keeps showing the old language until reload. Existing hooks: `wttReapplyI18n`, `dataVizReapplyI18n`, `dataVizMainReapplyI18n`, `rankingReapplyI18n`, `reapplyPlayerPage`, `reapplyPersonalStats`, `seasonReviewReapplyI18n`, `matchDetailReapplyI18n`, `docsBrowserReapplyI18n`, `adminReapplyI18n`, `drawsEditorReapplyI18n`, `umpireTrainingReapplyI18n`, `gameReapplyI18n`, `dataScaleReapplyI18n`. **When you add a page or a JS-rendered view, add its hook in the same change.**

### Display-layer dictionaries (never translate the data key)

`js/common.js` provides `eventTypeLabel()` / `wttEventTypeLabel()` / `seasonLabel()` / `playerTagLabel()` / `playerHonorLabel()` / `playerRole()` / `playerDescription()` / `fmtDate()` / `fmtDateFrom()`, all driven by `*_KEY_MAP` tables + dictionary keys (`ev_*`, `wtt_ev_*`, `season_*`, `ptag_*`, `phonor_*`, `date_*`). Data values stay Chinese — the engine, validators, colour maps and the submission pipeline all key off them. Only the **display** is translated; `i18nMapped()` falls back to the original value when a key is missing.

### Content data uses `_en` sibling fields

Prose content (news / qa / competitions / about / changelog / players `description`+`role` / draws / umpire-quiz) carries `_en` siblings rather than dictionary keys. `sync_content.py` carries them through `index.json`, `search.json` (so English search can hit English body text) and version snapshots; renderers prefer `_en` when `currentLang === 'en'` and fall back to the Chinese value when missing. `tools/i18n_audit.py --data-only` reports entries missing `_en`.

### Visitor-visible copy must read like a visitor, not a developer

Everything a visitor can see on screen is subject to this — body text, `title`, `aria-label`, `placeholder`, meta description, and `<noscript>` blocks. It must **never** contain:

- file paths, directory names or filenames (`tools/`, `data/`, `wtt_data/`, `Assets/`, `draws.json`, `*.py`)
- scripts, generators, build steps, deploy, CI, git, commits, the repo
- internal config identifiers written out in prose (`TENCENT_FORM_URL`, `ENABLE_*`)
- instructions addressed to an admin/maintainer ("管理员：…", "admin: …")
- raw exception text (`e.message`, stack traces, `HTTP <status>`) — catch it and show a curated message
- raw Chinese **data keys** used as labels (胜者 / 负者 / 对象 / 分数 / 日期 / 类型 / 局分 / 比分) — these are lookup keys only; run them through `eventTypeLabel()` / `playerTagLabel()` / `wttEventTypeLabel()` etc. before rendering

When a data source can't be fetched, **drop that tile/section silently** — never show a "run `python tools/…`" hint on a public page. Generation steps belong in `AGENTS.md` and in the generator's own docstring, not on screen. A missing-source hint is only acceptable on genuinely admin-only pages that also carry `noindex`.

Maintenance surfaces (`admin.html`, `draws-editor.html`, `tt_game/train.html`) are exempt from the copy rule — for their actual operators, naming the file to replace is useful — but they must carry `<meta name="robots" content="noindex, nofollow">` and stay out of nav / footer / sitemap. `tt_game/train.html` is additionally `Disallow`ed in `robots.txt` (the rest of `tt_game/` is the public easter egg).

**Two deliberate exceptions** to "noindex ⇒ out of nav/footer", both decided 2026-10-03 — don't "fix" them by adding a meta tag or moving the entry:

- `docs.html` sits in the navbar **More…** dropdown but is `noindex`. It has to stay that way: its whole content is the `Assets/` tree, and `robots.txt` `Disallow`s `/Assets/`. Making it indexable would put pages in search results that crawlers can't fetch.
- `umpire-training.html` sits in the footer but is `noindex` — it's a rules easter egg, deliberately not a search landing page.

### Auditing

```bash
python tools/i18n_audit.py            # warn-mode scan of HTML / JS / data residuals
python tools/i18n_audit.py --strict   # exit 1 on any residual (for CI once clean)
```

Warn mode by default — it cannot see language ternaries, so it over-reports. The authoritative check is a browser sweep in EN mode (see `docs/reports/plan-2026-09-28-i18n-en.md` for the page checklist).

## Posters (docs/posters/)

Poster HTML sources live in `docs/posters/` (canvas 1240×1754 = A4 @150dpi ratio, or 1754×1240 landscape). House style is the「大字版」skeleton of `event-poster-2026-shezhan-portrait.html`: serif giant Chinese title (Noto Serif SC — **do not** swap in ZCOOL QingKe HuangYou, the 社长 rejected it), black/white + cool blue-grey hairlines, no colour, at most two solid black blocks.

**Every poster change MUST end with a two-shot export** — designing is not done until the PNGs exist, same as content edits needing `sync_content.py`:

```bash
# serve the repo root (Chrome headless cannot open file://)
python -m http.server 8767 --bind 127.0.0.1

# A4 @300dpi (2480×3508) and @600dpi (4960×7016) → gitignored .poster-preview/
chrome --headless=old --disable-gpu --no-sandbox --hide-scrollbars ^
  --user-data-dir=%TEMP%/poster-export-a --force-device-scale-factor=2 ^
  --window-size=1240,1754 --virtual-time-budget=25000 ^
  --screenshot=.poster-preview/<name>-300dpi.png ^
  http://127.0.0.1:8767/docs/posters/<name>.html
# then repeat with --force-device-scale-factor=4 → <name>-600dpi.png
```

Gotchas that cost real time:
- Use a **fresh `--user-data-dir` per run** and **do not** pass `-WindowStyle Hidden` to `Start-Process` — Chrome silently writes no PNG.
- Use `--headless=old`, not `=new` (=new has intermittently produced no file here).
- `--virtual-time-budget=25000` is needed or Google Fonts (Noto Serif SC / Poppins) don't finish loading and you get fallback-font art.
- Re-verify the canvas actually fits after any copy change: `document.querySelector('.poster').scrollHeight <= clientHeight` in the browser, and eyeball the exported PNG. Copy edits silently overflow the fixed 1754px canvas and get clipped.
- `.poster-preview/` is gitignored — exports stay local, only the HTML source is committed.

## File structure quick reference

| Path | Purpose |
|------|---------|
| `data/players.json` | Player profiles (single source of truth) |
| `data/score-log.json` | Match records + bonus adjustments |
| `data/seasons.json` | Season definitions (must cover current date) |
| `data/event-coefficient.json` | Event type coefficients |
| `data/decay-config.json` | Time decay config (`t` half-life / `minWeight` floor / `noDecayTypes`) |
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
| `data_scale.html` | 数据规模/Data Scale: visitor-facing showcase of how much data the site holds (club records, club match network, pro tournament archive, content + media). Entry lives in the **footer** 「数据」 column only (deliberately not in the navbar); i18n keys `ds_*`, re-rendered by `dataScaleReapplyI18n()` |
| `js/data-scale.js` | data_scale.html logic: self-boots (no `main.js` dispatch, like `docs-browser.js`); computes cheap figures live via `fetch` and fills the rest from `data/dataset-stats.json`, resolving every tile as `live ?? pre` so a missing source silently drops that tile instead of erroring; Chart.js monthly bar chart recolours via a `MutationObserver` on `<html>`'s class (theme toggle). Also builds the **交手网络** card from `score-log.json`: edges = opponent pairs (doubles split into the four cross-pair match-ups), one Fruchterman–Reingold layout per connected component, node size ∝ √degree, edge width/opacity ∝ log(games), grade (`grade.enroll`) used **only** as a colour encoding (never as clustering — real mixing is below chance), members with no matches render in the dashed 尚未交手 band below the graph, hover/keyboard focus dims the canvas to one member's opponents; re-lays-out only when the container width moved ≥24px (`onNetResize`) |
| `tools/gen_dataset_stats.py` | Aggregates what the browser can't compute (wtt_data is 10 MB / 85 files) into `data/dataset-stats.json` — deploy-time generated, gitignored, same pattern as `data/api/`. **WTT doubles logs carry `"A/B"` pair strings, so per-discipline player counts must split the pair before deduping** and the cross-discipline total is a union, not a sum. ⚠️ `tools/*` is gitignored — a new deploy-time tool must be whitelisted with `!tools/<name>` in `.gitignore` or the deploy job fails on a fresh checkout |
| `data/dataset-stats.json` | **Generated at deploy time** by `tools/gen_dataset_stats.py` inside the `deploy` workflow — gitignored, NOT committed. data_scale.html fetches it; if missing (local dev) the WTT tiles simply don't render |
| `tools/migrate_draws_v3.py` | One-shot draws.json v2 → v3 migration (finished; kept locally only, gitignored) |
| `js/season-review.js` | Season review page logic (club + WTT dual mode, switched by `window.SR_WTT_MODE`) |
| `match.html` / `wtt_match.html` | Match-detail page for a single score-log record (WTT wrapper sets `window.MD_WTT_MODE`) |
| `js/match-detail.js` | Match-detail logic: 比分/局分, pre/post-match points, points breakdown, predicted win rate, H2H (club + WTT dual mode) |
| `docs/` | `tech/` long-lived technical docs · `reports/` one-off prediction/audit reports · `posters/` poster HTML sources |
| `submit.html` | Visitor match-record submission page (builds a prefilled GitHub issue) |
| `Assets/manifest.json` | **Generated at deploy time** by `tools/gen_assets_manifest.py` inside the `deploy` workflow — gitignored, NOT committed. docs.html fetches it; if missing (local dev), the page shows a hint to run the script |
| `tt_game/` | 3D table-tennis game easter egg (Three.js; UI reskinned with the site's design system). Homepage hero-ball links straight here (plain `<a href>` in `index.html`; the tt_game/umpire-training rotation script and its `wfls-egg-last` localStorage key were removed 2026-09-19 — umpire-training as a homepage egg is deferred, not deleted). `tt_game/js/` is an active training workspace (weight `.bak`s, logs) — game runtime files are the ones referenced by `tt_game/index.html` script tags. Selectable models live in `js/input.js` `MODEL_NAMES` + hardcoded buttons/options in `index.html`（极端对手/极端·满档 unselectable since 2026-09-19, but `opponent-ladder.js` levels stay — `tools/train-input3.js` curriculum depends on them）; 「地狱AI克星」 is trained by `tools/train-nemesis.js` (GA, fitness = dual-orientation unbiased point-rate vs hell, ANSI live CLI panel) writing `js/learned-policy-nemesis.js`. The hell-AI guardrail口径 (moveSpeed 2.8/moveErr 0.03/moveZ 2.6) is intentionally duplicated in THREE places — `policy.js strongVec`, `train-nemesis.js HELL_GUARD`, `train-nemesis-worker.js hellOpponent` — keep them in sync or training/实机 drift apart |
| `tt_game/tools/_finalize-12h.js` | Live-pipeline acceptance for a finished run: picks the top-`--topN` sim-ranked candidates, live-tests each, applies gates **A** (live weighted > baseline) / **B** (live vs `--top` tier ≥ baseline) / **C1** (worst \|sim−live\| ≤ baseline's + 3pp) / **C2** (≤ 45pp). Any failure leaves `js/input-weights.js` untouched (exit 2). `tools/logs/baseline-live.json` must be refreshed with `tools/_refresh-baseline.js` whenever the weights or `js/input-agent.js` change — a `--live-only` baseline leaves `worstDelta` null and C1 silently degrades to "\|Δ\| ≤ 3pp", which no candidate can ever satisfy once the sim saturates (guarded: a missing `worstDelta` now fails C1 outright and can't be waived by `--bake-anyway`). **Always rehearse this script with a throwaway run dir + `--dry-run` before trusting it with a 12h result** — two of round 5's three "dies at the last step" bugs (the `bake-input.js` argv offset and this one) were only visible in rehearsal |
| `tt_game/tools/{train-input3.js,_supervise.sh}` | The 12h trainer + its supervisor. **Schedule `--games` as a multiple of `--ckpt` (and `--step`)** — checkpoints and `index.json` are written only at round boundaries (`(g+1)%ckpt===0`), so a `--games 3200` / `--ckpt 250` run trains the last 199 episodes and persists nothing; `elapsedSec` then never advances, the supervisor reads "budget not spent", restarts, and spins forever (measured: 21 restarts, 07:36→21:20, `ep` frozen at 3000). Two guards now exist (a final checkpoint before a normal exit, and a "clean exit but `elapsedSec` didn't advance" no-progress guard), but a clean `code=0` is what makes this failure invisible in the logs — **judge a run's health by whether `index.json` content advanced, never by whether the process is alive or exited zero**. Curriculum boundaries are fractions of `--games` (`evalAtPhase`), so `--games` also decides how the budget splits across tiers — a too-large `--games` parks most of the run on an already-saturated tier. One round is `step` episodes + `--eval`×tiers games; the time budget counts **training time only** (eval is free), so measure a real round before setting `SUP_BOOT`/`SUP_STALL`, which must each exceed it or a healthy run gets declared hung |
| `tt_game/js/input-agent.js` | The **player-side** DQN (88-dim obs → 1904 actions = 34 mouseX × 14 mouseY × Ctrl × serve top/backspin) baked as `js/input-weights.js`. **`lateralPrior` is DEFAULT-ON since 2026-10-14**: `lateralBinOf(obs)` overrides only the `mxI` component of the argmax with the predicted intercept `x + vx·τ` (τ valid only when `(pz−z)·vz > 0`), leaving `my`/`ctrl`/serve-spin to the net. Roll back with `agent.setLateralPrior(false)` / `o.lateralPrior === false`, and use `tools/live-match.js --no-prior` to A/B it. Four landmine classes recorded in `tt_game/tools/phase5-findings.md`: (1) `encodeObs`'s τ sign — the old `vz < -0.05` condition fired only while the ball was **leaving** the paddle, so during every inbound frame τ = 0 and the predicted-intercept features (dims 21–24) carried no lookahead; (2) **never train this net with plain SGD** — hard targets diverge to qmax 1e86–1e93 on any pool > ~10 states; always `--optimizer adam --grad-clip 2`; (3) MSE-over-1904 can't express a ranking — BC must use the 2-unit pairwise update in `imitate()`, and `--bcmix 0` is a real off-switch only after the `Math.max(4, …)` floor was fixed; (4) paddle speed is NOT the bottleneck (`MOUSE_PACE=18` at 60 Hz closes any legal x in ~0.15 s) — a near-constant `tx` parks the paddle at centre, which is ~99 % `noreach` losses |
| `tt_game/js/hip-skill.js` | **HIP L1**: the player-side controller's *analytic* skill layer (no learned parameters). Same 15-field obs as the DQN, same `{tx,my,ctrl}` output, same physics (padControl/resolveHit) on both the sim and live sides, so live win rates are directly comparable. Knobs are in `HIP_SKILL.DEFAULTS`; override at runtime with `HIP_SKILL.setConfig(json)`. |
| `tt_game/js/hip-intent.js` · `tt_game/js/hip-choice.js` | **HIP L2** tactic layer: `hip-intent.js` = 336-class intent space (place 7 / depth 4 / stroke 6 / ctrl 2, 4 heads, 19 outputs); `hip-choice.js` = the K-class *safe* action set (every candidate verified live: fixed `my` in the proven band + landing offsets relative to the natural landing). Both expose `features(obs)` → `argmax` → `*ToControls`, and L1 vetoes anything illegal (`verifyIntent` = resolveHit + simulateFull). |
| `tt_game/js/hip-choice-weights.js` · `tt_game/js/hip-weights.js` | The baked L2 students: `hip-weights.js` = 336-class 4-head net (28→96→128→128→19), `hip-choice-weights.js` = K-way single-head net (28→96→128→128→11). Loaded lazily in the browser (`ensureHipWeights` / `ensureHipChoiceWeights`) and eagerly in `tools/live-match.js`. Regenerate with `tools/hip-train.js` / `tools/hip-choice-train.js` — never hand-edit. |
| `tt_game/js/tt-player.js` | The live inference pipeline for both player-side models (`ttmouse` = DQN, `hipmouse` = HIP). **The controller is resolved per side** (`modelOf(side)` → `controllerFor(side)`), so a DQN can face a HIP in watch mode; `setController()` overrides both sides (that is how the eval rig pins a controller). `isReady(side)` is per side too. Model name, side and controller are three different things — `decideServe()` once used the model name as the side and read the opponent's paddle. |
| `tt_game/tools/hip-eval.js` · `hip-train.js` · `hip-choice-teacher.js` · `hip-choice-train.js` | HIP training/eval chain: `hip-eval.js` = the live-only gate (`--controller dqn\|hip\|hip-intent\|hip-choice`, `--grid` sweeps, `--hip-cfg`, Wilson CI, loss breakdown, `stalled` games); `hip-choice-teacher.js` = K-way rollout teacher (soft labels); `hip-train.js` / `hip-choice-train.js` = softmax-CE distillation (Adam + grad-clip 2). **Never judge a candidate on sim numbers — the sim saturates; only `hip-eval`/live-match are real.** |
| `tt_game/docs/tech/hip-framework.md` | The HIP framework proposal (why the DQN/GA pipelines must be replaced, the 6 design principles, the layer diagram, the training recipe, and every measured result). Read this before touching any `hip-*` file. |
| `tt_game/js/hip-l3.js` · `tt_game/tools/hip-l3-collect.js` | **HIP L3** opponent-reachability model: `hip-l3.js` = 10-dim feature set + a tiny MLP head (sigmoid); `hip-l3-collect.js` = the sampler that runs the L1 controller in the sim against several opponent tiers and records `{f:[10], y}` (y = did the opponent actually return the ball). It needs the observation hook `js/input-sim.js#setObserver(fn)` (called right after `aiReceive`, so `ctx.oppX` is the opponent's position **before** it moved for that shot) and the `--err/--delay/--nospin` overrides for opponent difficulty. **Measured outcome: 0 negative samples — the current opponents have an "assist budget" ≈3.8× (aim error 0.055 m vs contact tolerance 0.209 m), so "placement" carries no learnable signal; that is why the L2 layer cannot beat the analytic L1.** |
| `tt_game/js/simcore.js` · `tt_game/js/policy.js` (opponent fields) | The opponent side carries two **opt-in, default-off** policy fields: `readDelay` (seconds before it may move laterally after reading the spin) and `readSpin` (predict the landing with a spin-blind model ⇒ a systematically wrong belief). They are implemented in `simcore.js#aiStep`; the `trap` tier (`js/policy.js#policyForModel('trap')` = hell + readDelay 0.07 + readSpin) exists only for training/eval — the live tiers are bit-for-bit unchanged. Note `unflattenPolicy` **drops unknown fields**, so extra fields must be `Object.assign`ed **after** unflattening. |
| `tt_game/tools/live-match.js` | The **only** acceptance judge — runs the real `js/` files in a Node `vm` with a virtual clock. Sim and live disagree by up to 25 pp and rank differently, so a sim win never counts. `--brain {centre,naive,chase,prior}` swaps `TT_PLAYER.agent.bestAction` for a script policy (weights still loaded for the shape self-check) — this is how the lateral bottleneck was proven in one command. Since 2026-10-14 the sim is **saturated** (default 96.9 % / hell 93.2 %) so sim may only RANK the `--topN` candidates that `tools/_finalize-12h.js` then live-tests |
| `tt_game/tools/bake-input.js` | Writes `js/input-weights.js`. **The visitor-facing `evalDefault`/`evalHell` in `INPUT_AI_META` must be LIVE numbers, never sim** (sim 0.6156/0.1822 was shipped while the real in-game rates were 0.354/0.117). argv is `process.argv.slice(2)`, so `argv[0]` is the src file and optional args start at `argv[1]` — an off-by-one here previously swapped the two evals, made the second `NaN`, and (via `_finalize-12h.js`'s `execFileSync`) resolved `src` to the script itself, throwing `SyntaxError` **right at the bake after 12h of training**. The bake is now refused unless both values are finite and in 0..1. PowerShell eats embedded quotes in JSON args — invoke it from node, not the shell |
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
12. Mixing 口径 when computing with club doubles data present: singles timelines must run on the non-doubles log (use the shared `computeSinglesClubTimeline()` in common.js — ranking.js / main.js `loadRankingDataForViz` / recompute_rankings.js all route through it) and doubles timelines on doubles-only records (bonus records are singles-only), each wrapped in `withScoreContext()` — running the engine directly on the raw full log turns pairs into phantom ranking rows. Player-list builders and KPI windows that scan the raw log (data-viz / personal-stats `getAllPlayers*`, season-review `windowMatches`) must skip doubles records via `isDoublesRecord(r)`; also never build pair display/links from the raw `"A/B"` string without `splitPairNames()` (order in the file is not canonical)
13. Putting developer-facing text in visitor-visible copy — file paths, `draws.json` / `assoc.json` / `manifest.json`, "run this script", "admin: fill in X", deploy/git/commit, or raw `e.message` in a toast. Page copy answers *what the visitor gets*, never *how the repo works*; see the i18n section's rule. The offenders that shipped once and got fixed: the docs page printing `python tools/gen_assets_manifest.py`, the loading progress bar appending `: {file}` (real filenames), `wtt_assoc` telling visitors a file was missing, and the season-expired banner telling visitors to create a season in `data/seasons.json`
