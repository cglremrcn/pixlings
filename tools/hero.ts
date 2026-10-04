// The README's hero: the band as a terminal draws it, through one short session. Every frame of
// the creature, the vitals row and the walk comes from the plugin's own code; the bubble lines
// are templates from hooks/lib/lines.ts. tools/make_hero.py paints the terminal around them.
// Usage: node tools/hero.ts <frames-dir>

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CANVAS_W, MINI_LEAVE_MS, miniTint, renderFrame, SPRITE_X, squadWidth, TRANSPARENT } from '../plugins/pixlings/hooks/lib/canvas.ts'
import type { Icon, MiniView, Mood } from '../plugins/pixlings/hooks/lib/canvas.ts'
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

// One session, in beats: tests fail, Claude fixes them, sends two subagents, apologises, and the
// cache starts cooling.
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
    mood: 'working',
    bubble: 'Backup has arrived!',
    icon: 'agent',
    isWorking: true,
    transcript: ['● Explore(Find every caller of parse)', '● Plan(Split the parser in two)'],
  },
  {
    from: 9300,
    mood: 'happy',
    bubble: '2 helpers, 2 high fives.',
    isWorking: true,
    transcript: ['● Explore(Find every caller of parse)', '● Plan(Split the parser in two)'],
  },
  {
    from: 12_400,
    mood: 'unimpressed',
    bubble: '"You\'re absolutely right." That\'s 37 now.',
    isWorking: true,
    transcript: ["● You're absolutely right! The fixture was stale, not the parser."],
  },
  {
    from: 15_200,
    mood: 'attention',
    bubble: 'Psst: the prompt cache expires in 1m.',
    isWorking: false,
    transcript: ["● You're absolutely right! The fixture was stale, not the parser."],
  },
  {
    from: 18_000,
    mood: 'idle',
    bubble: null,
    isWorking: false,
    walks: true,
    transcript: ["● You're absolutely right! The fixture was stale, not the parser."],
  },
]
const END = 21_400

/** The subagents: each one's mini hops in when it starts and celebrates when it is done. */
const SQUAD = [
  { type: 'Explore', join: 7000, done: 9000, icons: ['read', 'web'] as Icon[] },
  { type: 'Plan', join: 7400, done: 9300, icons: ['read', 'bash'] as Icon[] },
]

/** The strip as the band draws it at `t` (hooks/register.tsx squadAt). */
const squadAt = (t: number): MiniView[] =>
  SQUAD.filter(a => t >= a.join && (t < a.done || t - a.done < MINI_LEAVE_MS)).map((a, i) => ({
    tint: miniTint(a.type),
    t: t - a.join,
    doneT: t >= a.done ? t - a.done : null,
    icon: t < a.done ? a.icons[Math.floor((t - a.join) / 1200) % a.icons.length] : null,
    seed: i * 37,
  }))

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
  // countdown reads 1:00 when the turn ends at 15.2 s.
  let cache = freshCache('5m', true)
  cache = observe(cache, { input_tokens: 900, output_tokens: 600, cache_read_input_tokens: 0, cache_creation_input_tokens: 61_000 }, T0 - 600_000).cache
  for (let i = 0; i < 9; i++) {
    cache = observe(cache, { input_tokens: 700, output_tokens: 500, cache_read_input_tokens: 62_000 + i * 1500, cache_creation_input_tokens: 1500 }, T0 - 590_000 + i * 20_000).cache
  }
  const lastSent = T0 + 15_200 - 240_000
  cache = observe(cache, { input_tokens: 600, output_tokens: 700, cache_read_input_tokens: 76_000, cache_creation_input_tokens: 1200 }, lastSent).cache

  let walker = newWalker(range, 0)
  const random = seeded(11)
  const frames: unknown[] = []
  for (let t = 0, i = 0; t < END; t += FRAME_MS, i++) {
    const beat = [...BEATS].reverse().find(b => t >= b.from)!
    const since = t - beat.from
    const squad = squadAt(t)
    // Like the band, the walk gives up the columns the squad stands on.
    const room = Math.max(0, range - squadWidth(squad.length))
    walker = walk(walker, room, beat.walks ? 'wander' : beat.isWorking ? 'home' : 'stay', t, random)
    if (beat.walks && i === Math.round(18_100 / FRAME_MS)) walker = { ...walker, restUntil: t }
    const isStepping = beat.walks === true && isWalking(walker)
    const frame = renderFrame({
      species: duck,
      isShiny: false,
      mood: isStepping ? 'walk' : beat.mood,
      t: isStepping ? t : since,
      hat: 'sprout',
      icon: beat.icon,
      width: CANVAS_W + room,
      x: SPRITE_X + walker.x,
      isFlipped: isStepping && walker.isFlipped,
      squad,
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
