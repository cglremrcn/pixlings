// The README's hero: the band as a terminal draws it, through one short session. Every frame of
// the creature, the vitals row and the walk comes from the plugin's own code; the bubble lines
// are templates from hooks/lib/lines.ts. tools/make_hero.py paints the terminal around them.
// Usage: node tools/hero.ts <frames-dir>

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CANVAS_W, renderFrame, SPRITE_X, TRANSPARENT } from '../plugins/pixlings/hooks/lib/canvas.ts'
import type { Icon, Mood } from '../plugins/pixlings/hooks/lib/canvas.ts'
import { roamRange, walk, newWalker, isWalking } from '../plugins/pixlings/hooks/lib/roam.ts'
import { SPECIES } from '../plugins/pixlings/hooks/lib/sprites.ts'
import { freshCache, observe, vitals } from '../plugins/pixlings/hooks/lib/vitals.ts'

const FRAME_MS = 100
const COLUMNS = 100
const duck = SPECIES.find(s => s.id === 'duck')!

type Beat = {
  from: number
  mood: Mood
  bubble: string | null
  transcript: string[]
  icon?: Icon
  isWorking: boolean
  walks?: boolean
}

// One session, in beats: tests fail, Claude fixes them, apologises, and the cache starts cooling.
const BEATS: Beat[] = [
  { from: 0, mood: 'working', bubble: null, icon: 'test', isWorking: true, transcript: ['● Bash(npm test)', '  ⎿  Running…'] },
  {
    from: 1800,
    mood: 'sad',
    bubble: 'Have you tried explaining it to a duck?',
    isWorking: true,
    transcript: ['● Bash(npm test)', '  ⎿  Tests: 2 failed, 41 passed, 43 total'],
  },
  {
    from: 4400,
    mood: 'celebrate',
    bubble: 'BUG SQUASHED! 2 → 0!',
    isWorking: true,
    transcript: ['● Bash(npm test)', '  ⎿  Tests: 43 passed, 43 total'],
  },
  {
    from: 7000,
    mood: 'unimpressed',
    bubble: '"You\'re absolutely right." That\'s 37 now.',
    isWorking: true,
    transcript: ["● You're absolutely right! The fixture was stale, not the parser."],
  },
  {
    from: 9800,
    mood: 'attention',
    bubble: 'Psst: the prompt cache expires in 1m.',
    isWorking: false,
    transcript: ["● You're absolutely right! The fixture was stale, not the parser."],
  },
  {
    from: 12_600,
    mood: 'idle',
    bubble: null,
    isWorking: false,
    walks: true,
    transcript: ["● You're absolutely right! The fixture was stale, not the parser."],
  },
]
const END = 16_000

const T0 = Date.parse('2026-10-03T12:00:00Z')
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

const main = (): void => {
  const out = process.argv[2] ?? 'preview/hero'
  mkdirSync(out, { recursive: true })
  const range = roamRange(COLUMNS)
  // The cache: a long conversation, mostly served from cache; its last request was sent so the
  // countdown reads 1:00 when the turn ends at 9.8 s.
  let cache = freshCache('5m', true)
  cache = observe(cache, { input_tokens: 900, output_tokens: 600, cache_read_input_tokens: 0, cache_creation_input_tokens: 61_000 }, T0 - 600_000).cache
  for (let i = 0; i < 9; i++) {
    cache = observe(cache, { input_tokens: 700, output_tokens: 500, cache_read_input_tokens: 62_000 + i * 1500, cache_creation_input_tokens: 1500 }, T0 - 590_000 + i * 20_000).cache
  }
  const lastSent = T0 + 9800 - 240_000
  cache = observe(cache, { input_tokens: 600, output_tokens: 700, cache_read_input_tokens: 76_000, cache_creation_input_tokens: 1200 }, lastSent).cache

  let walker = newWalker(range, 0)
  const random = seeded(11)
  const frames: unknown[] = []
  for (let t = 0, i = 0; t < END; t += FRAME_MS, i++) {
    const beat = [...BEATS].reverse().find(b => t >= b.from)!
    const since = t - beat.from
    walker = walk(walker, range, beat.walks ? 'wander' : beat.isWorking ? 'home' : 'stay', t, random)
    if (beat.walks && i === Math.round(12_700 / FRAME_MS)) walker = { ...walker, restUntil: t }
    const isStepping = beat.walks === true && isWalking(walker)
    const frame = renderFrame({
      species: duck,
      isShiny: false,
      mood: isStepping ? 'walk' : beat.mood,
      t: isStepping ? t : since,
      hat: 'sprout',
      icon: beat.icon,
      width: CANVAS_W + range,
      x: SPRITE_X + walker.x,
      isFlipped: isStepping && walker.isFlipped,
    })
    const bin = Buffer.alloc(8 + frame.w * frame.h * 4)
    bin.writeUInt32LE(frame.w, 0)
    bin.writeUInt32LE(frame.h, 4)
    for (let p = 0; p < frame.px.length; p++) bin.writeInt32LE(frame.px[p] ?? TRANSPARENT, 8 + p * 4)
    const name = `${String(i).padStart(3, '0')}.bin`
    writeFileSync(join(out, name), bin)
    const row = vitals({
      cache,
      now: T0 + t,
      isWorking: beat.isWorking,
      contextPercent: 38,
      limits: [{ kind: 'five_hour', percentUsed: 22 }],
    })
    frames.push({ canvas: name, bubble: beat.bubble, vitals: row, transcript: beat.transcript })
  }
  writeFileSync(
    join(out, 'scene.json'),
    JSON.stringify({ ms: FRAME_MS, columns: COLUMNS, name: 'Quackers', level: 7, species: 'Duck', stars: '★', xp: [61, 150], color: 0xb8c2cc, frames }),
  )
  console.log(`${frames.length} frames, range ${range}`)
}

main()
