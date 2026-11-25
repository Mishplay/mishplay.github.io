# C · Player spotlight with photo  (`spotlight`)

```
 y=270  PREMIER LEAGUE                                        21 NOV 2026
 y=450  3  (numeral 400×1.12 /800)  GOALS (label 30, accent)      FULHAM [crest 96]   ← club lockup
        …negative space…
        ERLING (label, muted)
        HAALAND (surname 128/800, ≤2 lines)                         ░ photo ░
        HAT-TRICK  (label, ink)                                  cutout bleeds off right + bottom,
        10'   33'   61' (strong 42/800)                          face right of the text column
        ───────────────────────── hairline (text column only)
        Manchester City 5–1 Fulham (34/800)
        FULL TIME (label 22 muted)
        [logo] MishPlay   Data: ESPN                               (credit sits beside the wordmark)
```
- Photo: width 1120×scale, anchored so its bottom meets the canvas bottom (no visible edge), 72% of its width left of the right edge; scrim from 56% of the photo height to the bottom (0 → 100% of `#06080B`).
- Headline: "SCORED" / "2 GOALS" / "HAT-TRICK" derived from verified goals; "MOST GOALS IN THIS MATCH" only if true; "PLAYER OF THE MATCH" / "MY FAVOURITE PLAYER" only when the user picks it.
- No goals in the match → the numeral becomes the shirt number (dimmed) with a `SHIRT` label.
