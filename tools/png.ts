// A minimal RGB PNG writer for previews and README media (Node only).

import { crc32, deflateSync } from 'node:zlib'

export type Rgb = { readonly w: number; readonly h: number; readonly data: Uint8Array }

export const rgb = (w: number, h: number, background: number): Rgb => {
  const data = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    data[i * 3] = (background >> 16) & 255
    data[i * 3 + 1] = (background >> 8) & 255
    data[i * 3 + 2] = background & 255
  }
  return { w, h, data }
}

export const fillRect = (img: Rgb, x: number, y: number, w: number, h: number, color: number): void => {
  for (let yy = Math.max(0, y); yy < Math.min(img.h, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(img.w, x + w); xx++) {
      const i = (yy * img.w + xx) * 3
      img.data[i] = (color >> 16) & 255
      img.data[i + 1] = (color >> 8) & 255
      img.data[i + 2] = color & 255
    }
  }
}

const chunk = (type: string, body: Uint8Array): Buffer => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(body)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed) >>> 0)
  return Buffer.concat([length, typed, crc])
}

export const encodePng = (img: Rgb): Buffer => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(img.w, 0)
  header.writeUInt32BE(img.h, 4)
  header[8] = 8
  header[9] = 2
  const raw = Buffer.alloc((img.w * 3 + 1) * img.h)
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 3 + 1)] = 0
    Buffer.from(img.data.buffer, img.data.byteOffset + y * img.w * 3, img.w * 3).copy(raw, y * (img.w * 3 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}
