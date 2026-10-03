import { describe, expect, test } from 'claude-code/testing'

import { wavPipeArgv } from '../hooks/lib/platform.ts'
import { animalese, durationMs, VOICE_RATE, wavOf } from '../hooks/lib/voice.ts'

/**
 * The fundamental pitch of a stretch of samples, by autocorrelation: the period at which the
 * wave best repeats itself (zero crossings would follow the loudest harmonic instead).
 */
const pitchOf = (pcm: Float32Array, from: number, to: number): number => {
  let bestLag = 0
  let best = -Infinity
  for (let lag = Math.floor(VOICE_RATE / 1000); lag <= Math.floor(VOICE_RATE / 150); lag++) {
    let sum = 0
    for (let i = from; i + lag < to; i++) sum += (pcm[i] ?? 0) * (pcm[i + lag] ?? 0)
    const score = sum / (to - from - lag)
    if (score > best * 1.02) {
      best = score
      bestLag = lag
    }
  }
  return VOICE_RATE / bestLag
}

describe('the voice', () => {
  test('a line becomes a short, clean, repeatable sound', () => {
    const a = animalese('All green! Framing this one.', 'high')
    const b = animalese('All green! Framing this one.', 'high')
    expect([...a]).toEqual([...b])
    expect(durationMs(a)).toBeGreaterThan(800)
    expect(durationMs(a)).toBeLessThan(2600)
    expect(a.every(v => Number.isFinite(v) && Math.abs(v) <= 0.5001)).toBe(true)
    expect(animalese('🔥 ... !!', 'mid').length).toBe(0)
  })

  test('long lines are capped; Turkish letters are spoken', () => {
    const long = animalese('a'.repeat(400), 'low')
    expect(durationMs(long)).toBeLessThan(2600)
    expect(animalese('şğüöçı', 'mid').length).toBeGreaterThan(0)
  })

  test('each species voice sits at its own pitch', () => {
    const text = 'aaaa aaaa'
    const high = animalese(text, 'high')
    const low = animalese(text, 'low')
    const mid = Math.floor(0.03 * VOICE_RATE)
    expect(pitchOf(high, mid, mid + 600)).toBeGreaterThan(pitchOf(low, mid, mid + 600) * 1.6)
    expect([...animalese(text, 'buzz')]).not.toEqual([...animalese(text, 'mid')])
  })

  test('a WAV header describes 16-bit mono PCM of the samples', () => {
    const pcm = animalese('Hi!', 'wobble')
    const wav = wavOf(pcm)
    const view = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.slice(8, 16))).toBe('WAVEfmt ')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(VOICE_RATE)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(pcm.length * 2)
    expect(wav.length).toBe(44 + pcm.length * 2)
  })

  test('the voice plays from standard input on every OS that has a player', () => {
    expect(wavPipeArgv('windows')?.at(-1)).toContain('System.IO.MemoryStream')
    expect(wavPipeArgv('windows')?.at(-1)).toContain('[Console]::In.ReadToEnd()')
    expect(wavPipeArgv('mac')?.at(-1)).toContain('afplay')
    expect(wavPipeArgv('linux', '/usr/bin/aplay\n')?.at(-1)).toContain('"/usr/bin/aplay" -q')
    expect(wavPipeArgv('linux', '')).toBeNull()
    expect(wavPipeArgv('unknown')).toBeNull()
  })
})
