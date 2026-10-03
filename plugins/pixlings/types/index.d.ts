/** What the band shows about the pixling; rewritten when it changes. */
export type PixlingsView = {
  name: string
  speciesId: string
  isShiny: boolean
  level: number
  xpInto: number
  xpNeed: number
  hat: string | null
  face: string | null
}

/** The speech bubble; `id` changes with every new line. */
export type PixlingsBubble = { text: string; id: number } | null

/** The rate-limit nap: when it ends and whether Claude is continued then. */
export type PixlingsNap = { until: number | null; isAuto: boolean; kind: string } | null

/** The minimal band's face, which follows the mood. */
export type PixlingsMood = string

/** One piece of the vitals row: its text and how it should be colored. */
export type PixlingsVital = { text: string; tone: 'good' | 'warn' | 'bad' | 'cold' | 'dim' }

/** The prompt cache as the pixling has seen it this session (lib/vitals.ts Cache). */
export type PixlingsCache = {
  lastAt: number | null
  ttl: '5m' | '1h'
  isTtlKnown: boolean
  context: number
  read: number
  written: number
  uncached: number
  coldStarts: number
  rewritten: number
} | null

declare module 'claude-code' {
  interface PluginState {
    pixlings: {
      view: PixlingsView | null
      bubble: PixlingsBubble
      nap: PixlingsNap
      hatchAt: number | null
      mood: PixlingsMood
      vitals: PixlingsVital[]
      cache: PixlingsCache
    }
  }
}
