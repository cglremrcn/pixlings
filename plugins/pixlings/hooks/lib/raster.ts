// Pixels → terminal cells. Each cell carries two vertical pixels: `▀` painted with the top pixel
// as foreground and the bottom one as background. Transparent pixels use the terminal's own
// background, so the creature floats on any theme.

import { TRANSPARENT } from './canvas.ts'
import type { Pixels } from './canvas.ts'

const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const FULL = 0x2588 // █
const SPACE = 0x20
const DEFAULT_COLOR = 0x01000000

export type Cell = readonly [codePoint: number, fg: number, bg: number]

export const rowsFor = (p: Pixels): number => Math.ceil(p.h / 2)

export const toCells = (p: Pixels): Cell[] => {
  const cells: Cell[] = []
  for (let row = 0; row < rowsFor(p); row++) {
    for (let x = 0; x < p.w; x++) {
      const top = p.px[row * 2 * p.w + x] ?? TRANSPARENT
      const bottom = row * 2 + 1 < p.h ? (p.px[(row * 2 + 1) * p.w + x] ?? TRANSPARENT) : TRANSPARENT
      if (top === TRANSPARENT && bottom === TRANSPARENT) cells.push([SPACE, DEFAULT_COLOR, DEFAULT_COLOR])
      else if (bottom === TRANSPARENT) cells.push([UPPER, top, DEFAULT_COLOR])
      else if (top === TRANSPARENT) cells.push([LOWER, bottom, DEFAULT_COLOR])
      else if (top === bottom) cells.push([FULL, top, DEFAULT_COLOR])
      else cells.push([UPPER, top, bottom])
    }
  }
  return cells
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const base64 = (bytes: Uint8Array): string => {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8)
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + '='
  }
  return out
}

/** RasterProps.cells: little-endian u32 triplets, base64. */
export const encodeCells = (cells: readonly Cell[]): string => {
  const words = new Uint32Array(cells.length * 3)
  cells.forEach(([cp, fg, bg], i) => {
    words[i * 3] = cp
    words[i * 3 + 1] = fg
    words[i * 3 + 2] = bg
  })
  // Uint32Array is little-endian on every platform Claude Code runs on; write explicitly anyway.
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((w, i) => view.setUint32(i * 4, w, true))
  return base64(bytes)
}

export const rasterOf = (p: Pixels): { columns: number; rows: number; cells: string } => ({
  columns: p.w,
  rows: rowsFor(p),
  cells: encodeCells(toCells(p)),
})

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

/** An SVG of the pixels for surfaces without Raster (desktop, VS Code, mobile). */
export const toSvg = (p: Pixels, scale = 6): string => {
  const rects: string[] = []
  for (let y = 0; y < p.h; y++) {
    let x = 0
    while (x < p.w) {
      const color = p.px[y * p.w + x] ?? TRANSPARENT
      let run = 1
      while (x + run < p.w && p.px[y * p.w + x + run] === color) run++
      if (color !== TRANSPARENT) {
        rects.push(`<rect x="${x * scale}" y="${y * scale}" width="${run * scale}" height="${scale}" fill="${hex(color)}"/>`)
      }
      x += run
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w * scale}" height="${p.h * scale}" viewBox="0 0 ${p.w * scale} ${p.h * scale}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}
