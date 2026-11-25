// Turning the canvas into a real PNG file and getting it out of the app. All local: nothing is uploaded anywhere.
export async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob || blob.type !== 'image/png') throw new Error("Couldn't create the image")
  return blob
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const fileName = (parts: string[], format: string) => `mishplay-${parts.map(slug).filter(Boolean).join('-')}-${format}.png`

/** True only if this browser can really share an image FILE (Web Share Level 2). Not true for desktop Firefox, most desktop Chrome on Linux, etc. */
export function canShareFiles(): boolean {
  try { return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.png', { type: 'image/png' })] }) } catch { return false }
}

export type ShareResult = 'shared' | 'cancelled' | 'failed'
export async function shareImage(blob: Blob, name: string, text: string): Promise<ShareResult> {
  const file = new File([blob], name, { type: 'image/png' })
  try { await navigator.share({ files: [file], title: 'MishPlay', text }); return 'shared' }
  catch (e) { return (e as Error).name === 'AbortError' ? 'cancelled' : 'failed' }
}

export function downloadImage(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)   // temporary URL is released once the browser has taken the file
}
