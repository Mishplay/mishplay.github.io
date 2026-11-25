# MishPlay

Installable football PWA. Frontend only: no backend, no database server, no accounts. Runs in the browser, caches in IndexedDB, works offline from its last saved data.

## Run

```bash
npm install
npm run dev          # http://localhost:5173  (also on your LAN, but phones need HTTPS to install, see below)
npm test             # unit tests (identity, normalisation, merge, pitch layout) on real recorded API responses
npm run build && npm run preview   # production build on http://localhost:4173
npm run e2e          # Playwright: mobile + desktop, 9 viewport sizes (360x800 … 1366x768 + landscape), PWA/service-worker suite
LAN_URL=http://<laptop-ip>:4173 npm run e2e   # also asserts the insecure-address notice
LIVE=1 npm run e2e   # adds a real-network smoke test (see "ESPN and headless browsers")
npm run icons        # regenerate PNG icons from public/mish-icon.svg
```

Environment variables: **none required.** No API key is used or shipped.

## Data sources (see `research/SOURCE_REPORT.md`)

| Source | Used for | Notes |
|---|---|---|
| ESPN public site API (unofficial) | live scores, minute, fixtures, standings, lineups + formation, events, stats, crests, squads | undocumented, no licence; personal/non-commercial use; attribution shown; can be switched off in Settings |
| OpenLigaDB | Bundesliga fixtures/results/goals (second primary source, merged with ESPN) | community DB |
| openfootball (CC0) | schedule-only **fallback**, used only when no live source answers; the UI says so | kickoff times have no timezone, so only the date is trusted |
| TheSportsDB (free key `123`) | optional player-photo lookup helper (not wired into screens yet) | free tier is truncated and rate limited |

Merge rules live in `src/services/football/identity.ts`. A lower-priority source never overwrites a higher one, score disagreements are recorded on the match, and every record keeps its provenance.

**Not supported on free sources:** live data for competitions ESPN doesn't cover; season statistics for players; lineups before the source publishes them (the UI says "not available yet" and never shows a predicted lineup).

## ESPN and headless browsers

ESPN's CDN returns `403` (no CORS header) to automated/headless browsers, so **Playwright cannot call live ESPN** and the e2e suite mocks it with recorded real responses. A normal Chrome browser, including the installed PWA, works (verified in desktop Chrome). Real phone browsers have not been tested.

## Install as an app (PWA)

Chrome only offers **Install** when the page is a secure context (`https://` or `localhost`) and a service worker is running.
Opening `http://<laptop-ip>:4173` from a phone is **not** secure, so the browser says "This app cannot be installed" (the app now shows a notice explaining this). Pick one:

**Android, over USB (no public URL):**
1. Phone: enable Developer options, then USB debugging, and plug it into the laptop.
2. Laptop: `npm run build && npm run preview` (leave it running), then `adb reverse tcp:4173 tcp:4173`.
3. Phone Chrome: open `http://localhost:4173` (on the phone this *is* localhost, so it counts as secure).
4. Chrome menu, then **Install app** (or the in-app Install button).
   The app is served from your laptop, so it only loads while `adb reverse` and the preview server are running. For a permanent install, deploy (below).

**Android, over Wi-Fi (no cable):** on the phone open `chrome://flags/#unsafe-treat-insecure-origin-as-secure`, add `http://<laptop-ip>:4173`, enable it, relaunch Chrome, open that address, and install. Dev-only; the flag is browser-wide.

**Anywhere, properly:** deploy to an HTTPS host (Cloudflare Pages below), open the https URL on the phone, and install. iOS: Safari, Share, Add to Home Screen.

## Offline-first and updates

- **Offline launch:** after the first successful visit the whole app shell (HTML, JS, CSS, icons, manifest) is precached by one service worker (`sw.js`, Workbox runtime inlined). The installed app opens with no network and with the host (e.g. Cloudflare) down. Football data comes from IndexedDB and is labelled with its last-update time; a score saved as live is shown as "LAST SCORE" once offline or older than 3 minutes. **The very first visit needs internet** (nothing is cached yet).
- **App updates are user-controlled** (`registerType: 'prompt'`, no `skipWaiting`/`clientsClaim`). A new deploy downloads in the background; only a fully downloaded version is offered ("Update available" with Update now / Later). It never takes over by itself, "Later" lasts for the session, the update stays installable from Settings, and the prompt is never shown on match pages. A half-failed download fails safely and is retried when connectivity returns.
- **Football data refreshes separately** (polling and stale-while-revalidate); it never touches the app version.
- Favourites, preferences and cached football data live in localStorage/IndexedDB and are untouched by updates.
- `public/_headers` makes Cloudflare Pages always revalidate `sw.js`, `index.html` and the manifest, which update detection depends on.
- **Phone diagnostics:** open `/diag.html` for the device's real viewport numbers, or add `?diag` to any URL to show a live overflow reporter naming any element wider than the screen.

## Share posters (Instagram)

Match and player screens have a **Share** button that opens a poster editor: choose Result / Scorers / Fan (match) or Spotlight (player), Story 1080×1920 or Portrait 1080×1350, preview, then **Share** (native share sheet, only shown when the browser can share image files) or **Save image** (PNG). Posters are drawn locally on a canvas from real match data; nothing is uploaded; MishPlay never claims it can post to Instagram directly.

- Design system, tokens and per-template specs: `design/share-posters/` (derived from a Stitch exploration; see the limitation noted there). Code: `src/features/share/` (`tokens.ts`, `draw.ts`, `model.ts`, `images.ts`).
- **Layout:** 1080×1920 vertical (plus 1080×1350), Instagram-safe areas, match posters are a big status headline over [crest, numeral | numeral, crest] in MishPlay emerald with drawn halftone and brush art, scorers under each side (`+N more` instead of tiny text), penalty shoot-out score only when there was one, player spotlight with a framed portrait over its blurred copy, or a typography-led layout (crest, shirt number, name) when there is no usable photo.
- **Images, licence-gated** (`src/features/share/portrait.ts`, `research/images/LICENSING_APPROACH.md`): backgrounds are MishPlay's own drawn atmosphere by default, or an optional bundled CC0 stadium photo (blurred, credited). Player portraits come only from Wikimedia Commons, matched by the provider's exact player id via Wikidata P3681, and only if Commons says CC0 / public domain / CC BY (credited) or CC BY-SA (off until the user opts in; the poster then says "licensed CC BY-SA 4.0"). Missing/unclear/NC/ND licence = no photo. Provider (ESPN) photos are never used in posters. Club crests come from the provider and belong to their clubs (shown for identification; monogram fallback).
- Club crests are drawn in their original colours; score numerals use Bebas Neue (OFL).
- Typefaces (Hanken Grotesk, Bebas Neue) are bundled; posters are generated offline from cached data.
- Tests pin the browser clock to the recorded fixture date (`tests/e2e/mocks.ts`), so they don't depend on the day they run.

## Deploy (static hosting)

```bash
npm run build      # outputs dist/
```

- **Cloudflare Pages:** connect the repo, build command `npm run build`, output `dist`. `public/_redirects` handles SPA routing. Free, HTTPS by default.
- **Vercel:** import the repo, framework Vite. `vercel.json` handles SPA routing.
- **GitHub Pages:** works over HTTPS but needs a 404.html SPA fallback and a base path. Not configured.

Not deployed yet; that needs your go-ahead and an account.

## Structure

```
src/services/football/   types, http (dedupe, per-host rate limit, backoff, circuit breaker), identity (merge),
                         providers/ (espn, openligadb, openfootball, tsdb), cache/ (IndexedDB + SWR), repository
src/features/            home, leagues, matches (Match Centre, goal celebration), lineups (Pitch), teams, favourites
src/components/          design-system primitives (Crest, MatchCard, Deck, Tabs, BottomSheet, Timeline, StatBars, …)
src/styles/index.css     design tokens (dark primary, light optional)
```
