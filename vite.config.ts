import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
// Shown in Settings. MISH_BUILD lets tests build two distinguishable versions; Cloudflare Pages supplies the commit SHA.
const APP_VERSION = process.env.MISH_BUILD ?? `${pkg.version}+${(process.env.CF_PAGES_COMMIT_SHA ?? Date.now().toString(36)).slice(0, 7)}`

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      // 'prompt': a new service worker installs and WAITS. It only takes over when the user taps "Update now".
      registerType: 'prompt',
      includeAssets: ['mish-icon.svg', 'mish-glyph.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'MishPlay',
        short_name: 'MishPlay',
        description: 'MishPlay: live scores, lineups and match centre for world football.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'any',
        categories: ['sports'],
        background_color: '#070A0F',
        theme_color: '#070A0F',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/mish-icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // NO skipWaiting / clientsClaim: an update must never take control of a running session by itself.
        // One self-contained sw.js: with a separate workbox-*.js a failed download of that file produced a worker that
        // "installed" with NO install handler (nothing cached). Inlined, a partial failure makes the install fail safely instead.
        inlineWorkboxRuntime: true,
        cleanupOutdatedCaches: true, // the previous version's precache is removed only once the new worker activates (user-approved)
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'], // whole app shell, icons and manifest are precached
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(a\.espncdn\.com|r2\.thesportsdb\.com|upload\.wikimedia\.org)\/.*/i,
            handler: 'CacheFirst',
            options: { // CORS (non-opaque) responses only: lets the share-image generator read pixels, also offline. 404s (missing photos) are never cached.
            cacheName: 'mish-images-v2', expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  // allow tunnel hostnames (Cloudflare quick tunnels) to reach `vite preview`
  preview: { allowedHosts: ['.trycloudflare.com'] },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
})
