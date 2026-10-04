// Opt-in quips: now and then the pixling asks Claude Haiku for one line in its own voice. This
// module holds the request and the policy; the call itself is the engine's `$.model.complete`.
// What the model is told is the pixling's name, species and persona and a short summary of what
// happened ("3 tests failed"): never code, never the person's prompt, never a file's contents.

import { oneLine } from './persona.ts'

export type QuipKind = 'testFail' | 'named' | 'error' | 'bigDiff'

/** Counts only: a summary is built from numbers, never from text the session saw. */
export type QuipFacts = { failed?: number | null; lines?: number; files?: number }

export const QUIP_GAP_MS = 60_000
export const QUIP_MAX_TOKENS = 120
export const QUIP_TIMEOUT_MS = 8_000
export const QUIP_MAX_CHARS = 60

const SYSTEM = [
  'You voice a tiny pixel creature that lives above a developer\'s terminal prompt.',
  `Answer with exactly one line of ${QUIP_MAX_CHARS} characters or fewer, in the creature's personality.`,
  'No quotation marks, no emoji, no hashtags, no preamble: only the line itself.',
].join(' ')

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`

const count = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null

/** What happened, in a few words, from counts alone. */
export const quipEvent = (kind: QuipKind, facts: QuipFacts = {}): string => {
  switch (kind) {
    case 'testFail': {
      const failed = count(facts.failed)
      return failed ? `${plural(failed, 'test')} just failed` : 'the tests just failed'
    }
    case 'named':
      return 'the developer just said your name'
    case 'error':
      return 'Claude just ran into an error'
    case 'bigDiff': {
      const lines = count(facts.lines)
      const files = count(facts.files)
      return lines
        ? `Claude just changed ${plural(lines, 'line')}${files ? ` across ${plural(files, 'file')}` : ''}`
        : 'Claude just made a big change'
    }
  }
}

export type QuipPolicy = {
  mode: string
  isQuiet: boolean
  isAway: boolean
  /** A quip is already on its way. */
  isBusy: boolean
  lastAt: number | null
  now: number
}

/** Haiku is asked only when quips are on, someone is watching, and the last ask is a minute old. */
export const mayQuip = (p: QuipPolicy): boolean =>
  p.mode === 'haiku' && !p.isQuiet && !p.isAway && !p.isBusy && (p.lastAt === null || p.now - p.lastAt >= QUIP_GAP_MS)

export type Who = { name: string; species: string; persona: string }

export type QuipRequest = {
  model: string
  system: string
  prompt: string
  maxTokens: number
  timeoutMs: number
}

export const quipRequest = (who: Who, kind: QuipKind, facts: QuipFacts = {}): QuipRequest => ({
  model: 'haiku',
  system: SYSTEM,
  prompt: [
    `You are ${oneLine(who.name, 24)}, a pixel ${oneLine(who.species, 24)}.`,
    `Your personality: ${oneLine(who.persona, 160)}`,
    `What just happened: ${quipEvent(kind, facts)}.`,
    'Your one-line reaction:',
  ].join('\n'),
  maxTokens: QUIP_MAX_TOKENS,
  timeoutMs: QUIP_TIMEOUT_MS,
})

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/** The shape of `$.model.complete`'s result this module reads. */
export type QuipReply = { isAnswered: true; text: string; usage: Usage } | { isAnswered: false; usage?: Usage }

/** Every token the call was billed for, input and output alike. */
export const tokensOf = (usage: Usage | undefined): number =>
  usage
    ? usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    : 0

/**
 * The line to show and what it cost, or null when there is nothing fit to say: no answer, an
 * empty one. Wrapping quotes go, the first line stays, and a long line is cut at a word.
 */
export const quipOf = (reply: QuipReply): { text: string; tokens: number } | null => {
  if (!reply.isAnswered) return null
  const first = reply.text.split(/\r?\n/).find(l => l.trim() !== '') ?? ''
  let line = oneLine(first, 400).replace(/^["'`“”‘’*_\s]+|["'`“”‘’*_\s]+$/g, '')
  if (line.length > QUIP_MAX_CHARS) {
    const cut = line.slice(0, QUIP_MAX_CHARS - 1)
    const space = cut.lastIndexOf(' ')
    line = `${(space > QUIP_MAX_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
  }
  return line ? { text: line, tokens: tokensOf(reply.usage) } : null
}
