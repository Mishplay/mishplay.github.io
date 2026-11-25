# Mish Football — Source Discovery Report

Tested 2026-11-22 from a shell with an `Origin:` header set to a non-localhost origin (to approximate a deployed PWA). Raw responses are in `research/samples/`, and TheSportsDB fixtures are in `tests/fixtures/`.

## 1. Capability matrix (what was actually observed)

| Source | Auth | Browser CORS | Coverage | Live | Standings | Lineups + formation | Events | Match stats | Licence |
|---|---|---|---|---|---|---|---|---|---|
| **ESPN site API** (unofficial) | none | `*` for curl; **real Chrome ✅, headless/automated browsers ❌ (403 from Akamai, no CORS header)** | ~220 leagues (core catalogue); EPL, La Liga, ISL confirmed | ✅ status + clock, ~6 s edge cache | ✅ (`apis/v2/.../standings`) | ✅ `rosters[].formation` + per-player `formationPlace`, jersey, position, starter flag | ✅ `keyEvents` (goals, cards, subs, with participants) | ✅ ~28 team stats (possession, shots, corners, fouls…) | ❌ none published, undocumented; ESPN ToS restricts use. **Legal grey area** |
| **TheSportsDB** (free key `123`) | public key | `*` ✅ | Many leagues, but **free responses truncated** | ❌ (v2 livescore is paid) | 5 rows only | ❌ `null` on test event | ⚠️ timeline returned 5 items for a match | ❌ `null` | CC-BY style; free for non-commercial; 30 req/min, hit CF error 1015 |
| **OpenLigaDB** | none | `*` ✅ | German leagues (+ cups, many seasons; 849 league-seasons) | ⚠️ community-updated, `matchIsFinished` + `lastUpdate` | ✅ `getbltable` | ❌ | ✅ goals (minute, scorer, running score) | ❌ | Open DB (ODbL-style, attribution) |
| **openfootball** (GitHub raw) | none | `*` ✅ | EPL, La Liga, Serie A, Bundesliga, UCL, internationals, 2025-26 and 2026-27 | ❌ (static JSON, refreshed by commits, 5 min cache) | ❌ (derivable from results) | ❌ | ⚠️ goals only in some files | ❌ | **CC0** ✅ |
| **StatsBomb Open Data** | none | `*` ✅ | 80 competition-seasons, **historical only** (e.g. WC 2022) | ❌ | ❌ | ✅ lineups with positions | ✅ full event stream | ✅ derivable | Free for non-commercial with attribution; must credit StatsBomb |
| **football-data.org** | **key required** (403 without) | ❌ preflight allows **only `http://localhost`** | Top leagues on free tier | ✅ (delayed) | ✅ | ❌ | ⚠️ | ❌ | Free tier non-commercial |
| **API-Football** | **key required** (403) | not testable without key | Broad | ✅ | ✅ | ✅ (paid tiers for some) | ✅ | ✅ | Free tier 100 req/day; a key shipped in the browser is exposed |
| fixturedownload.com | none | **no CORS header** ❌ | Fixtures/results JSON | ❌ | ❌ | ❌ | ❌ | ❌ | Unclear |
| football-data.co.uk CSV | none | 302 redirect, no CORS evidence ❌ | Historical results CSV | ❌ | ❌ | ❌ | ❌ | ❌ | Free for personal use |
| open-matchday | — | — | **Not located or tested** — I won't claim anything about it | | | | | | |
| Official federation / club sites | — | — | **Excluded**: scraping is not covered by their terms | | | | | | |

## 2. Ranked sources per data category

| Category | 1st | 2nd | 3rd |
|---|---|---|---|
| Fixtures, results (current) | ESPN | openfootball (CC0 fallback) | TheSportsDB |
| Live score + minute | ESPN | OpenLigaDB (Germany only) | none free |
| Standings | ESPN | OpenLigaDB (Bundesliga) | openfootball-derived |
| Competition catalogue | ESPN core | OpenLigaDB / openfootball | TheSportsDB (5/query) |
| Team crests | ESPN (`a.espncdn.com`) | TheSportsDB badges | OpenLigaDB (Wikimedia) |
| Player photos | TheSportsDB cutouts | ESPN (sparse: only some players have `headshot`) | initials fallback |
| **Lineups + formation** | **ESPN** | StatsBomb (historical) | none |
| Events (goals/cards/subs) | ESPN `keyEvents` | OpenLigaDB goals, TheSportsDB timeline | |
| Match statistics | ESPN boxscore | StatsBomb (historical) | |
| Historical results | openfootball | StatsBomb | OpenLigaDB |

## 3. Honest assessment of what free can do

- **Fully free and CORS-open, no key:** current fixtures/results, live status and clock, standings, events, team stats and **confirmed lineups with formation**. All of this depends on **ESPN**.
- **Without ESPN** the app is still useful but weaker. openfootball and OpenLigaDB give fixtures and results (with live-ish updates for Germany). TheSportsDB free is too truncated to carry the app. **Lineups, formation and stats would be unavailable** for current matches, and the pitch would show an empty state.
- **ESPN's risk:** the endpoints are public and unauthenticated, but undocumented and unlicensed. They can change or be blocked without notice, and ESPN's terms limit commercial use. I recommend:
  - a personal, non-commercial app only
  - an on-screen "Data: ESPN" attribution
  - a feature flag so ESPN can be turned off
  - openfootball, OpenLigaDB and TheSportsDB as the permanent, legally clean base
- **Player pages:** ESPN gives sparse photos and TheSportsDB gives cutouts, but TheSportsDB's free squad call returned only 10 players. Player pages will show only what exists, with initials otherwise.
- **football-data.org and API-Football:** not usable from a deployed browser origin without a secret/proxy. They are optional adapters behind a minimal serverless proxy and are not part of the first build.

## 4. Recommended combination

1. **ESPN** (primary, flagged): fixtures, live, standings, lineups, events, stats, crests.
2. **openfootball** (CC0): offline-friendly fixture baseline and fallback if ESPN fails.
3. **OpenLigaDB**: Bundesliga fixtures/standings/goals as a second live-ish source and a cross-check.
4. **TheSportsDB (key 123)**: player cutouts and team metadata only, behind a strict global limiter (30 req/min).
5. **StatsBomb Open Data**: optional "classic matches" archive. This is later scope.

## 5. Unified model (summary)

`Competition{id, name, country, sources[]}`, `Team{id, name, crest, sources[]}`, `Match{id, competitionId, home/away teamIds, kickoffUtc, status: scheduled|live|ht|finished|postponed|cancelled|unknown, score, minute?, sources[]}`, `Lineup{matchId, team, formation, players[{name, jersey, position, slot?, starter, photo?}], official: boolean}`, `MatchEvent{type, minute, player, assist?, team}`, `TeamStats`.

Every field carries `{source, fetchedAt}` provenance. Identity resolution is by normalised team name plus kickoff date, with a name-alias table. Priority per field is as in section 2. A lower-priority source never overwrites a higher one, and disagreements are logged as conflicts.

## 6. Adapter architecture

`providers/{espn,openfootball,openligadb,tsdb}.ts` each implement `FootballProvider` (`competitions()`, `matches(comp, date)`, `matchDetail(id)`, `standings(comp)`, …), then `normalizers/` → `merge/` (identity + priority + conflict) → `cache/` (IndexedDB, TTL, stale-while-revalidate) → hooks → UI. A global per-host rate limiter, request dedupe, backoff and `AbortController` sit in the shared fetch layer.

## 7. Corrections after testing in a real browser

- The first version of this report called ESPN "CORS open" based on `curl` with an `Origin` header. That was wrong for automated browsers: Playwright's headless Chromium gets a 403 without CORS headers from ESPN's CDN, while a normal desktop Chrome gets full data (scoreboard, summary, standings). Real phone browsers are untested.
- openfootball's schedule is not interchangeable with ESPN's (different dates, home/away order, long club names), so it is a schedule-only fallback and is never merged beside live data.
- Request bursts matter: the app loads lower competition decks lazily and paces ESPN requests.

## 8. Caveats on this report

- Endpoint tests were single requests. Rate limits beyond TheSportsDB's were not stressed.
- ESPN `formationPlace` maps players to formation slots. Pitch coordinates will be derived from slot + formation using standard geometry, labelled as layout-from-provider-slots rather than exact on-pitch positions.
- Not tested: open-matchday, API-Football with a key, football-data.org with a key.
