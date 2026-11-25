# E · No-photo fallback  (`spotlight`, `photo == null`)

Same template as C with the photo layer omitted. The composition is deliberately typographic rather than a placeholder:
- Giant numeral (goal count, or shirt number if no goals) at 400×1.25, left on the margin.
- Club lockup (crest + name) top-right; if the crest is also missing, a quiet ring with initials of identical footprint.
- First name over a large surname, headline, minutes, the one-line score. Nothing is drawn that looks like a missing image: no silhouette, no grey box.
- Trigger: the provider supplied no photo, the URL 404s (ESPN returns a tiny 404 page), the host blocks CORS, or the image can't be decoded.
