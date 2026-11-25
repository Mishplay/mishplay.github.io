# B · Result with scorers  (`scorers`)

Header and footer identical to A. Each team block:
```
 ─────────────────────────────────────────────── hairline (between teams)
 [crest 96]  MANCHESTER CITY (56/800 caps)                          5   numeral 280/800
 Haaland 10' 33' 61'  ·  Foden 50'  ·  Doku 88'                       body 42/500, ink @ 86%
```
- Scorer text = **surname** + minutes (`Haaland 10' 33' 61'`); no minutes → `Haaland ×2`; own goal → `(OG)`.
- Items flow into at most 3 lines (Story) / 2 lines (4:5); overflow becomes `+N more`; any single entry wider than the line is ellipsised. Separator is a muted `·`.
- Trailing team dimmed (numeral, name, list at 70%).
- The block pair is centred in the space between header and footer.
- Incomplete data: a quiet one-line note ("Some goal details unavailable" / "Scorer details unavailable") — only when the scorer events don't add up to the score.
- 5–1 reference case: home paragraph = 2 items on 1 line + "Doku 88'"; the design keeps ≥ 48px between blocks.
