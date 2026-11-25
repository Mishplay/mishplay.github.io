import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { AddressInfo } from 'node:net'

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }
/** up = normal · down = every request fails like a Cloudflare origin outage · assets-down = sw.js/index load but /assets and workbox fail (half-failed deploy / dropped download) */
export type Mode = 'up' | 'down' | 'assets-down'

/** Static host that behaves like Cloudflare Pages (SPA fallback, no-cache on sw/html, immutable assets) and can switch build or fail on demand. */
export async function startHost(initialRoot: string) {
  let root = initialRoot, mode: Mode = 'up'
  const log: string[] = []
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    res.on('finish', () => log.push(`${res.statusCode} ${path} [${mode}]`))
    if (mode === 'down') { res.writeHead(503, { 'content-type': 'text/html' }); return void res.end('<html><title>Error 1033</title><body>Cloudflare Tunnel error 1033</body></html>') }
    if (mode === 'assets-down' && (path.startsWith('/assets/') || path.includes('workbox-'))) { res.writeHead(503); return void res.end('unavailable') }
    let file = join(root, path)
    if (!existsSync(file) || statSync(file).isDirectory()) file = extname(path) ? '' : join(root, 'index.html')
    if (!file || !existsSync(file)) { res.writeHead(404); return void res.end('not found') }
    const immutable = path.startsWith('/assets/')
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
    res.end(readFileSync(file))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://localhost:${(server.address() as AddressInfo).port}`
  return { log, url, setRoot: (r: string) => { root = r }, setMode: (m: Mode) => { mode = m }, close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()) }) }
}
