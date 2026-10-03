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

declare module 'claude-code' {
  interface PluginState {
    pixlings: {
      view: PixlingsView | null
      bubble: PixlingsBubble
      nap: PixlingsNap
      hatchAt: number | null
      mood: PixlingsMood
    }
  }
}
