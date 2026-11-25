// Rasterises the Mish icon SVG into the PNGs iOS/Android/PWA installers need (iOS ignores SVG icons).
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'

const svg = readFileSync('public/mish-icon.svg')
mkdirSync('public/icons', { recursive: true })

for (const size of [192, 512]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(`public/icons/icon-${size}.png`)
}
await sharp(svg, { density: 384 }).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png')

// Maskable: full-bleed dark background with the artwork inside the 80% safe zone.
const bg = { create: { width: 512, height: 512, channels: 4, background: '#0F172A' } }
const art = await sharp(svg, { density: 384 }).resize(400, 400).png().toBuffer()
await sharp(bg).composite([{ input: art, gravity: 'center' }]).png().toFile('public/icons/maskable-512.png')
console.log('icons written')
