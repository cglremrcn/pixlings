import { describe, expect, test } from 'claude-code/testing'

import {
  applyKnownTtl,
  decodeTtl,
  encodeTtl,
  freshCache,
  guardDecision,
  modelLabel,
  observe,
  remainingMs,
  turnQuota,
  vitals,
} from '../hooks/lib/vitals.ts'
import type { Cache, VitalsInput } from '../hooks/lib/vitals.ts'

const T0 = Date.parse('2026-10-04T12:00:00Z')
const MIN = 60_000
const DAY = 24 * 60 * MIN

/** A request over a 60k-token prompt: `read` of it from the cache, the rest written. */
const usage = (read: number, prompt = 60_000) => ({
  input_tokens: 0,
  output_tokens: 500,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: prompt - read,
})

/** The counts in the API's own order, as the audit's probe sent them. */
const raw = (input: number, read: number, write: number) => ({
  input_tokens: input,
  output_tokens: 300,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

const quiet = (cache: Cache, now: number): VitalsInput => ({
  cache,
  now,
  isWorking: false,
  contextPercent: null,
  limits: [],
})

describe('a learned hour is earned, and lost again', () => {
  test('a warm shared prefix after a pause does not prove the hour', () => {
    // A real five-minute cache; after six minutes another session's warm tools and system prompt
    // still serve two thirds of the prompt.
    let c = observe(freshCache('5m', false), raw(50, 0, 30_000), T0).cache
    const partial = observe(c, raw(50, 25_000, 12_000), T0 + 6 * MIN)
    expect(partial.news).toBeNull()
    expect(partial.cache.ttl).toBe('5m')
    expect(partial.cache.isTtlKnown).toBe(false)
    c = partial.cache
    const miss = observe(c, raw(50, 0, 40_000), T0 + 16 * MIN)
    expect(miss.news).toEqual({ kind: 'cold', gapMs: 10 * MIN, rewritten: 40_000 })
    expect(miss.cache.coldStarts).toBe(1)
    expect(miss.cache.ttl).toBe('5m')
    expect(vitals(quiet(miss.cache, T0 + 24 * MIN))[0]).toEqual({ text: '❄ cache cold', tone: 'cold' })
  })

  test('a wrong hour is relearned by a full miss inside 55 minutes, and the news says so', () => {
    const first = observe(freshCache('1h', true), usage(0), T0).cache
    const miss = observe(first, usage(0), T0 + 10 * MIN)
    expect(miss.news).toEqual({ kind: 'cold', gapMs: 10 * MIN, rewritten: 60_000, relearned: '5m' })
    expect(miss.cache.ttl).toBe('5m')
    expect(miss.cache.isTtlKnown).toBe(true)
    expect(miss.cache.coldStarts).toBe(1)
    // Once five minutes is known, later misses are plain cold starts.
    const again = observe(miss.cache, usage(0), T0 + 30 * MIN)
    expect(again.news).toEqual({ kind: 'cold', gapMs: 20 * MIN, rewritten: 60_000 })
    expect(again.cache.coldStarts).toBe(2)
  })

  test('a miss that is not full, or comes near the end of the hour, keeps the hour', () => {
    const first = observe(freshCache('1h', true), usage(0), T0).cache
    const late = observe(first, usage(0), T0 + 56 * MIN)
    expect(late.news).toBeNull()
    expect(late.cache.ttl).toBe('1h')
    const halfRead = observe(first, usage(9_000), T0 + 10 * MIN)
    expect(halfRead.news).toBeNull()
    expect(halfRead.cache.ttl).toBe('1h')
  })

  test('two near-full hits after pauses learn the hour; one does not', () => {
    const first = observe(freshCache(), usage(0), T0).cache
    const once = observe(first, usage(58_000), T0 + 7 * MIN)
    expect(once.news).toBeNull()
    expect(once.cache.ttl).toBe('5m')
    expect(once.cache.longHits).toBe(1)
    const twice = observe(once.cache, usage(58_000), T0 + 14 * MIN)
    expect(twice.news).toEqual({ kind: 'learned', ttl: '1h' })
    expect(twice.cache.ttl).toBe('1h')
    expect(twice.cache.isTtlKnown).toBe(true)
    expect(remainingMs(twice.cache, T0 + 15 * MIN)).toBe(59 * MIN)
  })

  test('the streak breaks on a pause without a near-full hit and survives requests close together', () => {
    let c = observe(freshCache(), usage(0), T0).cache
    c = observe(c, usage(58_000), T0 + 7 * MIN).cache
    const partial = observe(c, usage(40_000), T0 + 14 * MIN)
    expect(partial.news).toBeNull()
    expect(partial.cache.longHits).toBe(0)
    c = observe(partial.cache, usage(58_000), T0 + 21 * MIN).cache
    const close = observe(c, usage(60_000), T0 + 22 * MIN)
    expect(close.news).toBeNull()
    expect(close.cache.longHits).toBe(1)
    expect(observe(close.cache, usage(58_000), T0 + 29 * MIN).news).toEqual({ kind: 'learned', ttl: '1h' })
  })

  test('a pinned TTL is never relearned, either way', () => {
    const hour = observe(freshCache('1h', true), usage(0), T0, true).cache
    const miss = observe(hour, usage(0), T0 + 10 * MIN, true)
    expect(miss.news).toBeNull()
    expect(miss.cache.ttl).toBe('1h')
    let five = observe(freshCache('5m', true), usage(0), T0, true).cache
    five = observe(five, usage(58_000), T0 + 7 * MIN, true).cache
    const hit = observe(five, usage(58_000), T0 + 14 * MIN, true)
    expect(hit.news).toBeNull()
    expect(hit.cache.ttl).toBe('5m')
  })

  test('a cache kept by 0.2, without a streak, still learns', () => {
    const { longHits: _streak, isTtlFromSwitch: _switch, ...old } = freshCache()
    let c: Cache = observe(old, usage(0), T0).cache
    c = observe(c, usage(58_000), T0 + 7 * MIN).cache
    expect(observe(c, usage(58_000), T0 + 14 * MIN).news).toEqual({ kind: 'learned', ttl: '1h' })
  })
})

describe('the TTL a model switch names', () => {
  test('it is known, and the miss the switch causes does not overrule it', () => {
    let c = observe(freshCache(), usage(0), T0).cache
    c = observe(c, usage(58_000), T0 + 7 * MIN).cache
    const known = applyKnownTtl(c, '1h')
    expect(known.ttl).toBe('1h')
    expect(known.isTtlKnown).toBe(true)
    expect(known.isTtlFromSwitch).toBe(true)
    expect(known.longHits).toBe(0)
    const miss = observe(known, usage(0), T0 + 14 * MIN)
    expect(miss.news).toBeNull()
    expect(miss.cache.ttl).toBe('1h')
    let five = observe(applyKnownTtl(freshCache(), '5m'), usage(0), T0).cache
    five = observe(five, usage(58_000), T0 + 7 * MIN).cache
    const hit = observe(five, usage(58_000), T0 + 14 * MIN)
    expect(hit.news).toBeNull()
    expect(hit.cache.ttl).toBe('5m')
  })
})

describe('the stored TTL', () => {
  test('a learned TTL is trusted for 14 days, a switch one for 30', () => {
    const learned = encodeTtl('1h', T0, 'learned')
    expect(learned).toEqual({ ttl: '1h', learnedAt: T0, source: 'learned' })
    expect(decodeTtl(learned, T0)).toEqual(learned)
    expect(decodeTtl(learned, T0 + 14 * DAY - 1)).toEqual(learned)
    expect(decodeTtl(learned, T0 + 14 * DAY)).toBeNull()
    const switched = encodeTtl('5m', T0, 'switch')
    expect(decodeTtl(switched, T0 + 20 * DAY)).toEqual(switched)
    expect(decodeTtl(switched, T0 + 30 * DAY - 1)).toEqual(switched)
    expect(decodeTtl(switched, T0 + 30 * DAY)).toBeNull()
    expect(decodeTtl(JSON.parse(JSON.stringify(learned)), T0 + DAY)).toEqual(learned)
  })

  test('the bare string 0.2 stored is learned on an unknown day, so already expired', () => {
    expect(decodeTtl('1h', T0)).toBeNull()
    expect(decodeTtl('5m', T0)).toBeNull()
  })

  test('anything unreadable, or dated in the future, is not trusted', () => {
    for (const bad of [null, undefined, 42, 'auto', {}, [], { ttl: '2h', learnedAt: T0, source: 'learned' }]) {
      expect(decodeTtl(bad, T0)).toBeNull()
    }
    expect(decodeTtl({ ttl: '1h', learnedAt: Number.NaN, source: 'learned' }, T0)).toBeNull()
    expect(decodeTtl({ ttl: '1h', learnedAt: String(T0), source: 'learned' }, T0)).toBeNull()
    expect(decodeTtl({ ttl: '1h', learnedAt: T0, source: 'guess' }, T0)).toBeNull()
    expect(decodeTtl(encodeTtl('1h', T0 + 1, 'switch'), T0)).toBeNull()
  })
})

describe('the model-switch guard', () => {
  const warm = { isWarm: true, estimatedUsd: 1.8, remainingMs: 4 * MIN + 12_000, thresholdUsd: 0.5 }

  test('a warm cache worth more than the line is put to the person', () => {
    expect(guardDecision(warm)).toEqual({
      shouldAsk: true,
      reason: 'Switching models now re-writes ~$1.80 of warm cache, 4:12 before it cools.',
    })
    expect(guardDecision({ ...warm, estimatedUsd: 0.5 }).shouldAsk).toBe(true)
    // The engine knows the TTL; a countdown that already ran out does not overrule it.
    expect(guardDecision({ ...warm, remainingMs: -MIN })).toEqual({
      shouldAsk: true,
      reason: 'Switching models now re-writes ~$1.80 of warm cache.',
    })
    expect(guardDecision({ ...warm, remainingMs: null }).reason).toBe(
      'Switching models now re-writes ~$1.80 of warm cache.',
    )
  })

  test('a cold cache, a cheap one or an unknown cost passes', () => {
    expect(guardDecision({ ...warm, isWarm: false })).toEqual({
      shouldAsk: false,
      reason: 'The cache is already cold; switching costs nothing extra.',
    })
    expect(guardDecision({ ...warm, estimatedUsd: 0.12 })).toEqual({
      shouldAsk: false,
      reason: 'Re-caching costs ~$0.12, under the $0.50 line.',
    })
    expect(guardDecision({ ...warm, estimatedUsd: Number.NaN }).shouldAsk).toBe(false)
  })
})

describe('what a turn took from the rate limits', () => {
  test('each window rises by the points used; a window that fell was reset', () => {
    const before = [
      { kind: 'five_hour', percentUsed: 90 },
      { kind: 'seven_day', percentUsed: 40 },
    ]
    const after = [
      { kind: 'five_hour', percentUsed: 93.2 },
      { kind: 'seven_day', percentUsed: 40.2 },
      { kind: 'spend_limit', percentUsed: 12 },
    ]
    expect(turnQuota(before, after)).toEqual([
      { kind: 'five_hour', points: 3.2 },
      { kind: 'seven_day', points: 0.2 },
    ])
    expect(turnQuota([{ kind: 'five_hour', percentUsed: 97 }], [{ kind: 'five_hour', percentUsed: 4 }])).toEqual([
      { kind: 'five_hour', points: 4 },
    ])
  })

  test('no readings, no deltas', () => {
    expect(turnQuota([], [])).toEqual([])
    expect(turnQuota([], [{ kind: 'five_hour', percentUsed: 5 }])).toEqual([])
    expect(turnQuota([{ kind: 'five_hour', percentUsed: 5 }], [])).toEqual([])
  })
})

describe('the model and turn pieces', () => {
  const base = (): VitalsInput => {
    let cache = observe(freshCache(), usage(0), T0).cache
    cache = observe(cache, usage(57_000), T0 + MIN).cache
    return {
      cache,
      now: T0 + MIN + 4 * MIN + 30_000,
      isWorking: false,
      contextPercent: 41.4,
      limits: [{ kind: 'five_hour', percentUsed: 93 }],
    }
  }

  test('without the new inputs the row is as it was', () => {
    const row = ['⏳ cache ~0:30', '48% cached', 'ctx 41%', '5h 93%']
    expect(vitals(base()).map(v => v.text)).toEqual(row)
    expect(vitals({ ...base(), turnDelta: [], model: '', effort: '' }).map(v => v.text)).toEqual(row)
    expect(vitals({ ...base(), turnDelta: [{ kind: 'five_hour', points: 0 }] }).map(v => v.text)).toEqual(row)
  })

  test('the largest rise and the model close the row', () => {
    const row = vitals({
      ...base(),
      model: 'claude-opus-5-5',
      effort: 'high',
      turnDelta: [
        { kind: 'five_hour', points: 3.2 },
        { kind: 'seven_day', points: 0.2 },
      ],
    })
    expect(row.slice(-2)).toEqual([
      { text: 'turn +3%', tone: 'dim' },
      { text: 'opus 5.5 · high', tone: 'dim' },
    ])
    const piece = (points: number) =>
      vitals({ ...base(), turnDelta: [{ kind: 'five_hour', points }] }).at(-1)
    expect(piece(0.4)).toEqual({ text: 'turn +0.4%', tone: 'dim' })
    expect(piece(6)).toEqual({ text: 'turn +6%', tone: 'warn' })
    expect(piece(12)).toEqual({ text: 'turn +12%', tone: 'bad' })
    expect(vitals({ ...base(), model: 'claude-sonnet-4-5' }).at(-1)?.text).toBe('sonnet 4.5')
    expect(vitals({ ...base(), effort: 'max' }).at(-1)?.text).toBe('max')
    expect(vitals({ ...base(), model: 'claude-opus-5-5', effort: 32_000 }).at(-1)?.text).toBe('opus 5.5 · 32k')
  })

  test('model ids read as family and version', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('opus 5.5')
    expect(modelLabel('claude-opus-5-5[1m]')).toBe('opus 5.5')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
    expect(modelLabel('claude-3-5-sonnet-20241022')).toBe('sonnet 3.5')
    expect(modelLabel('us.anthropic.claude-opus-4-1-20250805-v1:0')).toBe('opus 4.1')
    expect(modelLabel('claude-opus-4-1@20250805')).toBe('opus 4.1')
    expect(modelLabel('claude-fable-5')).toBe('fable 5')
    expect(modelLabel('gpt-6-sol')).toBe('gpt-6-sol')
  })
})
