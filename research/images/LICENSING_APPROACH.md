# Poster imagery: sources, licences, and the proposed policy

Tested 2026-11-25 with real requests (files in this folder).

## What was verified
| Source | Availability | Licence / terms | Verdict |
|---|---|---|---|
| ESPN headshots & crests (a.espncdn.com) | Available, CORS ok, ~600px photos; missing → 404 | No licence published; unofficial endpoint; images belong to ESPN/agencies/clubs | **Do not put in shareable posters by default** (licence unclear). Fine for in-app display only (existing risk). |
| TheSportsDB images | CORS-blocked | User-submitted, non-commercial terms, unclear rights | **Exclude** |
| Official league/club/player media | Not programmatically available | All rights reserved (press use) | **Exclude** |
| Wikimedia Commons via Wikidata **P3681** (ESPN FC player ID → person → P18) | Exact ID match (no name guessing). 16 of 40 players in a real lineup; stars covered, many squad players not | 14 × CC BY-SA 4.0, 1 × CC BY 4.0, 1 × CC0; many CC BY-SA files carry a "personality rights" restriction | **CC0 / CC BY: usable with credit (≈2 of 40 players). CC BY-SA: opt-in only** (poster becomes a CC BY-SA adaptation and must say so). |
| Commons atmosphere photos (CC0 / CC BY 4.0) | Plenty; best: "Champasak Stadium during at night" (CC0), ball-on-grass (CC0) | CC0: no conditions. CC BY: credit required | **Usable as bundled, credited backgrounds** |
| Unsplash / Pexels / Pixabay | Need API keys / manual picking | Permissive but individually verified, API terms | Not needed |
| Brand-generated atmosphere (floodlight glow, pitch stripes, grain) | Always | Ours | **Default fallback, zero licensing risk** |

## Policy (approved 2026-11-25, implemented in src/features/share/portrait.ts)
1. **Background:** brand-generated atmosphere by default; optional bundled CC0/CC BY stadium photo, softly blurred and graded, with the credit printed on the poster when required.
2. **Player portrait:** only if a Wikidata (P3681) match exists AND the file is CC0 / CC BY (credit printed). CC BY-SA portraits only when the user opts in, with "poster licensed CC BY-SA 4.0" printed. Otherwise the typography-led spotlight (crest, name, shirt number).
3. **Never** use provider (ESPN) or guessed-by-name photos in posters.
4. **Crests** are trademarks with no open licence: show them (factual identification) with a monogram fallback; this is a decision for the owner.
5. Credit record is generated per poster from Commons `extmetadata` (artist, licence, URL) and cached with the image; if licence metadata is missing or unclear the image is not used.
6. Technical: images fetched with CORS from upload.wikimedia.org; blur done by down/up-scaling (Safari canvas has no `filter`); everything local.
