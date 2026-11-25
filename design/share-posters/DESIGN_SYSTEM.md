# MishPlay share posters — design system

Source of truth in code: `src/features/share/tokens.ts` (values) and `src/features/share/draw.ts` (layout). This document explains them.

## Provenance: the Stitch exploration

- **Stitch project:** "MishPlay Football Poster Generator" — https://stitch.google.com/projects/2331954927003783230
- **Brief given:** the art direction in the task (editorial, near-black, one typeface, one accent, 8px scale, 96px margins, hairlines, no glows) and five posters A–E in 9:16 and 4:5.
- **Pass 1 (rejected in part):** Stitch produced app-like screens with format toggles, "SAFE TOP" labels and *invented data* (xG, possession, attendance, stadium, rating). All of that was rejected and is not used.
- **Pass 2 (approved direction):** after a revision prompt it produced chrome-free posters. What was adopted from them: near-black field (`#06080B`), tracked small-caps meta row (competition left, date right), a status line, 2px hairlines, stacked team rows with name left and a huge score right (trailing team dimmed), scorers as a calm paragraph under their team, a giant goal count with a green `GOALS` label and a first-name-over-surname stack, a team-colour field for the fan poster with a centred crest, and a typography-led no-photo variant with a giant shirt number. Typeface: Hanken Grotesk (Stitch's choice); we use it with two weights only.
- **Reference captures:** `stitch-reference/` (screenshots of Stitch's approved posters; reference only, never used as output).
- **Limitation (documented, not hidden):** Stitch's "Export" only offers hand-offs to AI Studio / Figma / MCP / Netlify / Lovable / Bolt (not SVG/CSS), and its "View Code" panel is a cross-origin iframe whose HTML could not be downloaded or read programmatically in this environment (the Download action did not produce a file). So the posters were **re-created in code from Stitch's approved rendered designs plus the tokens above**; nothing was screenshot-pasted. Stitch's generated player photo (an AI likeness) is not used anywhere; the app only ever uses provider-supplied images.

## Tokens (px at 1080 wide)

| Token | Value |
|---|---|
| Background | `#06080B` |
| Ink / muted / dim | `#F5F6F8` / `#8A94A6` / ink @ 55% |
| Hairline | ink @ 16%, 2px |
| Accent | `#00E676` (MishPlay green) — **at most one accent element per poster**. Fan poster uses the club's own colour for its single rule. Live status uses `#FF4D5E`. |
| Spacing scale | 8 · 16 · 24 · 32 · 48 · 64 · 96 · 128 |
| Margins | 96 left/right (one left edge for everything) |
| Safe area | Story: top 270 / bottom 300. Post 4:5: 120 / 120. Text never leaves it. |
| Typeface | Hanken Grotesk, weights **500** (text) and **800** (display) only; bundled locally (offline) |
| Type scale | label 26 (caps, +5px tracking) · small 34 · body/strong 42 · team name 72 · surname 128 · numeral 400 |
| Display tracking | −2% (−3% on numerals) |

## Rules

1. **Hierarchy:** the score (or goal count) is the focal point; everything else is at most 1/3 its visual weight.
2. **One alignment edge:** all text sits on x=96 or x=984, or is centred (fan poster only). Numerals are aligned by their *ink* edge, not their advance box.
3. **Spacing** only from the scale; vertical position comes from a layout cursor, not hand-placed coordinates.
4. **Emphasis by opacity, not colour:** the trailing team is 55% ink. No extra badges, borders or pills.
5. **Images:** crests contained in a square footprint (never stretched); player photo is a cutout bleeding off the right/bottom canvas edges, face kept clear of text, one scrim starting below the chin, modest upscaling only (provider photos are ~600px).
6. **Honesty:** no value is invented. Missing scorer data → a quiet note; missing minutes → `×N` or nothing; no photo → typography-led layout; live → red dot + "Score at HH:MM"; stale → "LAST SCORE · n min ago · not live". "Player of the match" only if the *user* picks that wording.
7. **Contrast:** ink on near-black ≥ 15:1; muted text (`#8A94A6` on `#06080B`) ≈ 6.5:1.
8. **Adapt, don't stretch:** Story and 4:5 share tokens but not coordinates: sizes scale by `f = contentHeight/1350` and a few compositions change (e.g. the Fan poster's crest and spacing, scorer paragraphs capped at 2 lines on 4:5).

## Templates (see `templates/`)

| Id | Poster | Spec |
|---|---|---|
| `result` | A · Match result | `templates/A-result.md` |
| `scorers` | B · Result with scorers | `templates/B-result-with-scorers.md` |
| `spotlight` (photo) | C · Player spotlight | `templates/C-player-spotlight.md` |
| `fan` | D · Fan celebration | `templates/D-fan-celebration.md` |
| `spotlight` (no photo) | E · No-photo fallback | `templates/E-no-photo.md` |
