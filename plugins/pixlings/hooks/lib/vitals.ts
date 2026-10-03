// The prompt cache, watched from outside. Every model request reads the conversation's prefix
// from the cache and restarts its timer; once the timer runs out, the next request pays to write
// the whole context again. The engine reports each request's token counts but not the cache's
// lifetime, so the lifetime is learned: a cache hit after a gap longer than five minutes proves
// the hour-long TTL, a miss after one proves the five-minute one.

import type { LimitWindow } from './detect.ts'

export type Ttl = '5m' | '1h'

export const TTL_MS: Readonly<Record<Ttl, number>> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

/** Slack on the five-minute boundary: a request a few seconds late may still have hit. */
const BOUNDARY_SLACK_MS = 30_000
/** Prompts smaller than this are under the API's cacheable minimum; they prove nothing. */
const MIN_PROMPT = 4096

/** One request's counts, in the API's spelling (TurnUsage). */
export type RequestUsage = {
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_read_input_tokens: number
  readonly cache_creation_input_tokens: number
}

export type Cache = {
  /** When the last main-thread request was sent: the cache's timer restarted then. */
  readonly lastAt: number | null
  readonly ttl: Ttl
  /** Learned from a request, or set by the person; an assumed TTL can still be learned. */
  readonly isTtlKnown: boolean
  /** Tokens the next request re-sends. */
  readonly context: number
  readonly read: number
  readonly written: number
  readonly uncached: number
  /** Requests that found the cache gone after a pause, and what re-caching them cost. */
  readonly coldStarts: number
  readonly rewritten: number
}

export const freshCache = (ttl: Ttl = '5m', isTtlKnown = false): Cache => ({
  lastAt: null,
  ttl,
  isTtlKnown,
  context: 0,
  read: 0,
  written: 0,
  uncached: 0,
  coldStarts: 0,
  rewritten: 0,
})

export type CacheNews =
  | { kind: 'cold'; gapMs: number; rewritten: number }
  | { kind: 'learned'; ttl: Ttl }
  | null

/**
 * A main-thread request was sent at `sentAt` and answered with `usage`. Returns the cache after
 * it and what it revealed: a cold start after a pause, or the TTL proven for the first time.
 */
export const observe = (
  c: Cache,
  usage: RequestUsage,
  sentAt: number,
  isTtlPinned = false,
): { cache: Cache; news: CacheNews } => {
  const read = usage.cache_read_input_tokens
  const write = usage.cache_creation_input_tokens
  const prompt = usage.input_tokens + read + write
  const next: Cache = {
    ...c,
    lastAt: sentAt,
    context: prompt + usage.output_tokens,
    read: c.read + read,
    written: c.written + write,
    uncached: c.uncached + usage.input_tokens,
  }
  const gap = c.lastAt === null ? null : sentAt - c.lastAt
  if (gap === null || prompt < MIN_PROMPT) return { cache: next, news: null }

  const isHit = read >= prompt * 0.5
  const isMiss = read < prompt * 0.2 && write >= prompt * 0.5
  const isPastShort = gap > TTL_MS['5m'] + BOUNDARY_SLACK_MS

  if (!isTtlPinned && isHit && isPastShort && c.ttl !== '1h') {
    return { cache: { ...next, ttl: '1h', isTtlKnown: true }, news: { kind: 'learned', ttl: '1h' } }
  }
  if (isMiss && gap >= TTL_MS[c.ttl] - BOUNDARY_SLACK_MS) {
    // A miss after the timer ran out is the cache going cold; on an assumed TTL it also proves it.
    const cold = { ...next, coldStarts: c.coldStarts + 1, rewritten: c.rewritten + write }
    const learned = !isTtlPinned && !c.isTtlKnown && isPastShort && gap < TTL_MS['1h']
    return {
      cache: learned ? { ...cold, ttl: '5m', isTtlKnown: true } : cold,
      news: { kind: 'cold', gapMs: gap, rewritten: write },
    }
  }
  return { cache: next, news: null }
}

/** Milliseconds until the cache expires; null before the first request. */
export const remainingMs = (c: Cache, now: number): number | null =>
  c.lastAt === null ? null : c.lastAt + TTL_MS[c.ttl] - now

/** The share of input tokens the cache served this session, 0..100; null before any. */
export const hitPercent = (c: Cache): number | null => {
  const total = c.read + c.written + c.uncached
  return total === 0 ? null : Math.round((c.read / total) * 100)
}

/** "4:07", "59:30"; never negative. */
export const countdown = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "84k", "1.2M", "950". */
export const tokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

export type Tone = 'good' | 'warn' | 'bad' | 'cold' | 'dim'

export type Vital = { readonly text: string; readonly tone: Tone }

const LIMIT_LABEL: Readonly<Record<string, string>> = {
  five_hour: '5h',
  seven_day: 'wk',
  spend_limit: '$',
}

/** How close a cache is to going cold, as a tone: the last minute is red. */
export const cacheTone = (left: number, ttl: Ttl): Tone => {
  if (left <= 60_000) return 'bad'
  if (left <= TTL_MS[ttl] * 0.3) return 'warn'
  return 'good'
}

export type VitalsInput = {
  readonly cache: Cache
  readonly now: number
  readonly isWorking: boolean
  readonly contextPercent: number | null
  readonly limits: readonly LimitWindow[]
}

/**
 * The vitals row: the cache's countdown, how much of the input it served, the context window's
 * fill and the rate-limit windows. Each a short piece with a tone for its color.
 */
export const vitals = (v: VitalsInput): Vital[] => {
  const out: Vital[] = []
  const left = remainingMs(v.cache, v.now)
  if (v.isWorking && left !== null) out.push({ text: '⚡ cache live', tone: 'good' })
  else if (left !== null && left > 0) {
    const pin = v.cache.isTtlKnown ? '' : '~'
    out.push({ text: `⏳ cache ${pin}${countdown(left)}`, tone: cacheTone(left, v.cache.ttl) })
  } else if (left !== null) out.push({ text: '❄ cache cold', tone: 'cold' })

  const hit = hitPercent(v.cache)
  if (hit !== null) out.push({ text: `${hit}% cached`, tone: hit >= 80 ? 'dim' : hit >= 50 ? 'warn' : 'bad' })

  if (v.contextPercent !== null) {
    const pct = Math.round(v.contextPercent)
    out.push({ text: `ctx ${pct}%`, tone: pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : 'dim' })
  }

  for (const w of v.limits) {
    const label = LIMIT_LABEL[w.kind] ?? w.kind
    const pct = Math.round(w.percentUsed)
    const tone: Tone = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'dim'
    out.push({ text: `${label} ${pct}%`, tone })
  }
  return out
}
