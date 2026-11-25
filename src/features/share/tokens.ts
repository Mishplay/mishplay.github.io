/**
 * MishPlay share-poster design tokens (px at the 1080-wide canvas). Direction chosen from the Stitch exploration
 * ("MishPlay Football Poster Generator"): editorial, near-black, one typeface, one accent, strict left edge, hairline structure.
 * See design/share-posters/DESIGN_SYSTEM.md. Nothing in the renderer uses a number that isn't derived from here.
 */
export const COLOR = {
  bg: '#06080B',
  ink: '#F5F6F8',
  muted: '#8A94A6',
  hair: 'rgba(245,246,248,0.16)',
  accent: '#00E676',        // MishPlay green: the match poster's headline, numerals and kit art; a single accent on the spotlight
  live: '#FF4D5E',
} as const

/** 8px spacing scale. */
export const SPACE = { s1: 8, s2: 16, s3: 24, s4: 32, s6: 48, s8: 64, s12: 96, s16: 128 } as const
export const MARGIN = 96            // outer left/right margin = the single left edge everything aligns to
export const HAIR = 2               // divider thickness

/** Two weights only. */
export const WEIGHT = { text: 500, display: 800 } as const

/** The whole type scale. Labels are tracked caps; display type is tight. */
export const TYPE = {
  label: { size: 26, weight: WEIGHT.text, track: 5 },     // caps meta rows, status
  small: { size: 34, weight: WEIGHT.text },               // credits, notes
  body: { size: 42, weight: WEIGHT.text },                // scorer paragraphs
  strong: { size: 42, weight: WEIGHT.display },           // minutes, result line
  name: { size: 72, weight: WEIGHT.display },             // team names
  surname: { size: 128, weight: WEIGHT.display },         // player surname
  numeral: { size: 400, weight: WEIGHT.display },         // scores / goal count / shirt number
} as const

export const FONT_FAMILY = '"Hanken Grotesk", -apple-system, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

/** Score numerals only (bundled Bebas Neue, OFL; digits and dash are in its latin subset). */
export const SCORE_FONT = `"Bebas Neue", ${FONT_FAMILY}`

export type FormatId = 'story' | 'post'
/** safeTop/safeBottom: Instagram overlays (story header + reply bar) and feed crop. All text and key content stays inside. */
export const FORMATS: Record<FormatId, { w: number; h: number; label: string; short: string; safeTop: number; safeBottom: number }> = {
  story: { w: 1080, h: 1920, label: 'Story 9:16', short: 'Story', safeTop: 270, safeBottom: 300 },
  post: { w: 1080, h: 1350, label: 'Portrait post 4:5', short: 'Post 4:5', safeTop: 120, safeBottom: 120 },
}
