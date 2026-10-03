// The pixling's own voice. Each letter of a line becomes a tiny sung syllable at the species'
// pitch, the way Animal Crossing's villagers talk: no words, but the length, rhythm and lilt of
// the line. Synthesized here from harmonics shaped by vowel formants, so it needs no voice
// installed and sounds the same on every OS.

import type { Voice } from './sprites.ts'

export const VOICE_RATE = 22050

/** The first two formants of each vowel, in Hz: what makes an "ah" an "ah". */
const VOWEL: Readonly<Record<string, readonly [number, number]>> = {
  a: [800, 1250],
  e: [520, 1850],
  i: [330, 2300],
  o: [520, 900],
  u: [360, 820],
}

/** A letter sounds like the vowel of its English name: "bee" → i, "eff" → e, "kay" → e. */
const LETTER_VOWEL: Readonly<Record<string, string>> = {
  a: 'a', b: 'i', c: 'i', d: 'i', e: 'e', f: 'e', g: 'i', h: 'e', i: 'a', j: 'e', k: 'e', l: 'e', m: 'e',
  n: 'e', o: 'o', p: 'i', q: 'u', r: 'a', s: 'e', t: 'i', u: 'u', v: 'i', w: 'u', x: 'e', y: 'a', z: 'i',
}

const PLOSIVE = new Set(['b', 'c', 'd', 'g', 'k', 'p', 'q', 't'])
const FRICATIVE = new Set(['f', 'h', 's', 'x', 'z', 'j', 'v'])

type Timbre = { f0: number; letterMs: number; vibrato: number; harmonics: number; isOddOnly: boolean }

const TIMBRE: Readonly<Record<Voice, Timbre>> = {
  high: { f0: 620, letterMs: 52, vibrato: 0, harmonics: 7, isOddOnly: false },
  mid: { f0: 430, letterMs: 58, vibrato: 0, harmonics: 9, isOddOnly: false },
  low: { f0: 240, letterMs: 68, vibrato: 0, harmonics: 12, isOddOnly: false },
  wobble: { f0: 380, letterMs: 64, vibrato: 0.07, harmonics: 8, isOddOnly: false },
  buzz: { f0: 330, letterMs: 55, vibrato: 0, harmonics: 11, isOddOnly: true },
}

const MAX_MS = 2400
const GAP_MS = 38
const PAUSE_MS = 120

type Unit = { kind: 'letter'; letter: string; stress: number } | { kind: 'gap'; ms: number }

/** Turkish and other accented letters fold to their base: ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u. */
const fold = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const unitsOf = (text: string): Unit[] => {
  const units: Unit[] = []
  for (const ch of fold(text)) {
    if (ch >= 'a' && ch <= 'z') units.push({ kind: 'letter', letter: ch, stress: 1 })
    else if (ch >= '0' && ch <= '9') units.push({ kind: 'letter', letter: 'i', stress: 1 })
    else if (/[.,;:!?…\n]/.test(ch)) units.push({ kind: 'gap', ms: PAUSE_MS })
    else if (ch === ' ' && units.at(-1)?.kind !== 'gap') units.push({ kind: 'gap', ms: GAP_MS })
  }
  return units
}

/** A deterministic noise source, so the same line always sounds the same. */
const lcg = (seed: number) => {
  let s = seed >>> 0 || 1
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x80000000 - 1
  }
}

const hashOf = (text: string): number => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** How strongly a formant at `center` lets a harmonic at `freq` through. */
const resonance = (freq: number, center: number, width: number): number => 1 / (1 + ((freq - center) / width) ** 2)

/** The line spoken in the pixling's voice, as mono samples in -1..1. */
export const animalese = (text: string, voice: Voice): Float32Array => {
  const t = TIMBRE[voice]
  let units = unitsOf(text)
  while (units.at(-1)?.kind === 'gap') units = units.slice(0, -1)
  const letters = units.filter(u => u.kind === 'letter').length
  if (letters === 0) return new Float32Array(0)

  // Long lines speak faster, and past a point only their start is spoken.
  const letterMs = Math.max(34, Math.min(t.letterMs, (MAX_MS * 0.8) / letters))
  const isQuestion = /\?\s*$/.test(text)
  const isExcited = /!\s*$/.test(text)
  const noise = lcg(hashOf(text))
  const jitter = lcg(hashOf(text) ^ 0x9e3779b9)

  const out = new Float32Array(Math.ceil((MAX_MS / 1000) * VOICE_RATE) + VOICE_RATE)
  let at = 0
  let spoken = 0
  for (const u of units) {
    if (u.kind === 'gap') {
      at += Math.round((u.ms / 1000) * VOICE_RATE)
      continue
    }
    const n = Math.round((letterMs / 1000) * VOICE_RATE)
    if (at + n > (MAX_MS / 1000) * VOICE_RATE) break
    spoken += 1
    const progress = spoken / letters
    // Pitch: the voice's own, a little random per syllable, drifting down over the line, up at
    // the end of a question, higher when excited.
    let f0 = t.f0 * (1 + jitter() * 0.07) * (1 - 0.08 * progress)
    if (isQuestion && letters - spoken < 4) f0 *= 1 + (4 - (letters - spoken)) * 0.07
    if (isExcited) f0 *= 1.08
    const [f1, f2] = VOWEL[LETTER_VOWEL[u.letter] ?? 'a'] ?? [700, 1200]

    // The consonant: a click for p/t/k, a hiss for s/f/h, before the vowel.
    const consonant = PLOSIVE.has(u.letter) ? 0.006 : FRICATIVE.has(u.letter) ? 0.018 : 0
    const cn = Math.round(consonant * VOICE_RATE)
    let prev = 0
    for (let i = 0; i < cn && at + i < out.length; i++) {
      const white = noise()
      const high = white - prev // a crude high-pass: hiss, not rumble
      prev = white
      const env = PLOSIVE.has(u.letter) ? 1 - i / cn : Math.sin((Math.PI * i) / cn)
      out[at + i] = (out[at + i] ?? 0) + high * env * 0.22
    }

    // The vowel: harmonics of f0 weighted by the two formants, a quick chirp down in pitch.
    let phase = 0
    for (let i = 0; i < n; i++) {
      const x = i / n
      const glide = 1.05 - 0.09 * x
      const wobble = t.vibrato ? 1 + t.vibrato * Math.sin((2 * Math.PI * 7 * i) / VOICE_RATE) : 1
      const f = f0 * glide * wobble
      phase += f / VOICE_RATE
      let sample = 0
      for (let k = 1; k <= t.harmonics; k++) {
        if (t.isOddOnly && k % 2 === 0) continue
        const fk = f * k
        if (fk > VOICE_RATE / 2.2) break
        const gain = (resonance(fk, f1, 110) + 0.6 * resonance(fk, f2, 170) + 0.02) / k ** 0.95
        sample += gain * Math.sin(2 * Math.PI * phase * k)
      }
      const env = Math.min(1, x / 0.08) * (1 - x) ** 1.4
      const idx = at + cn + i
      if (idx < out.length) out[idx] = (out[idx] ?? 0) + sample * env * (isExcited ? 1.1 : 1)
    }
    // Syllables overlap a little, the way quick speech runs together.
    at += cn + Math.round(n * 0.86)
  }

  const end = Math.min(out.length, at + Math.round(0.08 * VOICE_RATE))
  const pcm = out.subarray(0, end)
  let peak = 0
  for (const v of pcm) peak = Math.max(peak, Math.abs(v))
  if (peak > 0) for (let i = 0; i < pcm.length; i++) pcm[i] = ((pcm[i] ?? 0) / peak) * 0.5
  return pcm
}

/** Mono 16-bit PCM in a WAV file's bytes. */
export const wavOf = (samples: Float32Array, rate = VOICE_RATE): Uint8Array => {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true))
  return bytes
}

/** How long the line takes to say, in milliseconds. */
export const durationMs = (samples: Float32Array): number => Math.round((samples.length / VOICE_RATE) * 1000)
