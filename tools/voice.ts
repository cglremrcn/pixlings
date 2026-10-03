// Speaks sample lines in every voice with the plugin's own synthesizer, for a listen.
// Usage: node tools/voice.ts <out-dir>

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { animalese, durationMs, wavOf } from '../plugins/pixlings/hooks/lib/voice.ts'
import type { Voice } from '../plugins/pixlings/hooks/lib/sprites.ts'

const LINES = [
  "Hi! I'm Mochi. I live here now.",
  'All green! Framing this one.',
  'Cache cools in 60s. Reply soon, save tokens.',
  "You're absolutely right number 37?",
]
const VOICES: Voice[] = ['high', 'mid', 'low', 'wobble', 'buzz']

const out = process.argv[2] ?? 'preview/voice'
mkdirSync(out, { recursive: true })
for (const voice of VOICES) {
  LINES.forEach((line, i) => {
    const started = performance.now()
    const pcm = animalese(line, voice)
    const ms = (performance.now() - started).toFixed(1)
    let peak = 0
    let bad = 0
    for (const v of pcm) {
      if (!Number.isFinite(v)) bad++
      peak = Math.max(peak, Math.abs(v))
    }
    writeFileSync(join(out, `${voice}-${i}.wav`), wavOf(pcm))
    console.log(`${voice}-${i}: ${durationMs(pcm)} ms audio, synth ${ms} ms, peak ${peak.toFixed(2)}, bad ${bad}`)
  })
}
