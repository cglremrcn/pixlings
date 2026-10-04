// The model's verbal tics, counted from the text it shows. The pixling has heard them all.

export type Tic =
  | 'absolutelyRight'
  | 'greatQuestion'
  | 'apology'
  | 'perfect'
  | 'issue'
  | 'loadBearing'
  | 'productionReady'
  | 'comprehensive'
  | 'robust'
  | 'delve'

type Pattern = { readonly tic: Tic; readonly re: RegExp; readonly label: string }

const PATTERNS: readonly Pattern[] = [
  { tic: 'absolutelyRight', re: /\byou(?:['’]| a)re (?:absolutely|totally|completely|exactly) (?:right|correct)\b/gi, label: '"You\'re absolutely right"' },
  // Praise standing on its own ("Great question!", "That's a good catch."), not "a good point to add".
  {
    tic: 'greatQuestion',
    re: /(?<=^|[.!?]\s+|\b(?:that['’]?s|that is|what|such) an? )(?:great|excellent|good) (?:question|catch|point)(?=\s*(?:[!.,;:—–]|-\s|$))/gim,
    label: '"Great question"',
  },
  {
    tic: 'apology',
    re: /\b(?:apologi[sz]e|apologies|sorry) for (?:the|any|my) (?:confusion|oversight|mistake|error)s?\b/gi,
    label: '"Apologies for the confusion"',
  },
  { tic: 'perfect', re: /(?:^|\n)\s*(?:Perfect|Excellent)[!.]/g, label: '"Perfect!"' },
  { tic: 'issue', re: /\bI (?:see|found|spotted) the (?:issue|problem)\b/gi, label: '"I see the issue"' },
  { tic: 'loadBearing', re: /\bload[- ]bearing\b/gi, label: '"load-bearing"' },
  { tic: 'productionReady', re: /\bproduction[- ]ready\b/gi, label: '"production-ready"' },
  { tic: 'comprehensive', re: /\bcomprehensive\b/gi, label: '"comprehensive"' },
  { tic: 'robust', re: /\brobust\b/gi, label: '"robust"' },
  { tic: 'delve', re: /\bdelv(?:e|es|ing)\b/gi, label: '"delve"' },
]

export const TIC_LABEL: Readonly<Record<Tic, string>> = Object.fromEntries(
  PATTERNS.map(p => [p.tic, p.label]),
) as Record<Tic, string>

export type TicCounts = Partial<Record<Tic, number>>

/** Which tics a response used, and how often; code spans and blocks don't count. */
export const ticsIn = (text: string): TicCounts => {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
  const found: TicCounts = {}
  for (const { tic, re } of PATTERNS) {
    const n = prose.match(re)?.length ?? 0
    if (n > 0) found[tic] = n
  }
  return found
}

export const addTics = (into: TicCounts, more: TicCounts): TicCounts => {
  const out: TicCounts = { ...into }
  for (const [tic, n] of Object.entries(more) as [Tic, number][]) out[tic] = (out[tic] ?? 0) + n
  return out
}

export const totalTics = (counts: TicCounts): number =>
  Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)

/** The tics most said, most first. */
export const topTics = (counts: TicCounts, limit = 3): { tic: Tic; label: string; n: number }[] =>
  (Object.entries(counts) as [Tic, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tic, n]) => ({ tic, label: TIC_LABEL[tic], n }))

/** The tic worth an eye roll: the sycophantic ones, not the merely overused words. */
export type EyeRoll = 'absolutelyRight' | 'greatQuestion' | 'apology' | 'perfect'

export const isEyeRoll = (tic: Tic): tic is EyeRoll =>
  tic === 'absolutelyRight' || tic === 'greatQuestion' || tic === 'apology' || tic === 'perfect'
