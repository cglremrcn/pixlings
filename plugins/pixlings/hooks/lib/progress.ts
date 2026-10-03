// The pixling's life: hatching rolls, names, experience, levels and what each level unlocks.

import type { Face, Hat } from './canvas.ts'
import { RARITY_ORDER, RARITY_WEIGHT, SPECIES } from './sprites.ts'
import type { Rarity, Species } from './sprites.ts'

export type Stats = {
  turns: number
  testsPassed: number
  testsFailed: number
  bugsSquashed: number
  commits: number
  pushes: number
  prs: number
  risky: number
  sessions: number
  pets: number
  naps: number
  permissions: number
}

export type Pixling = {
  v: 1
  species: string
  isShiny: boolean
  name: string
  hatchedAt: number
  xp: number
  /** The hat and face gear chosen with `/pixling wear`; null picks the best unlocked. */
  hat: Hat | 'none' | null
  face: Face | 'none' | null
  stats: Stats
  /** Every species this person has hatched, for the dex. */
  dex: string[]
}

export const emptyStats = (): Stats => ({
  turns: 0,
  testsPassed: 0,
  testsFailed: 0,
  bugsSquashed: 0,
  commits: 0,
  pushes: 0,
  prs: 0,
  risky: 0,
  sessions: 0,
  pets: 0,
  naps: 0,
  permissions: 0,
})

export const SHINY_ODDS = 64

const NAMES = [
  'Mochi', 'Pixel', 'Byte', 'Nibble', 'Biscuit', 'Pip', 'Sprocket', 'Tofu', 'Noodle', 'Waffles',
  'Bean', 'Kiwi', 'Miso', 'Pickle', 'Gizmo', 'Dumpling', 'Boba', 'Chip', 'Cookie', 'Fig',
  'Juniper', 'Lumen', 'Nova', 'Orbit', 'Pebble', 'Quill', 'Rune', 'Tango', 'Echo', 'Ziggy',
  'Null', 'Sudo', 'Lambda', 'Kernel', 'Cache', 'Async', 'Regex', 'Grep', 'Bit', 'Loop',
  'Hex', 'Tux', 'Ping', 'Pong', 'Turbo', 'Wasabi', 'Yuzu', 'Mango', 'Olive', 'Clover',
] as const

/** Picks a rarity by weight, then a species of it, then the 1-in-64 shiny roll. */
export const roll = (random: () => number): { species: Species; isShiny: boolean; name: string } => {
  const total = RARITY_ORDER.reduce((sum, r) => sum + RARITY_WEIGHT[r], 0)
  let x = random() * total
  let rarity: Rarity = 'common'
  for (const r of RARITY_ORDER) {
    x -= RARITY_WEIGHT[r]
    if (x < 0) {
      rarity = r
      break
    }
  }
  const pool = SPECIES.filter(s => s.rarity === rarity)
  const species = pool[Math.floor(random() * pool.length)] ?? SPECIES[0]!
  const isShiny = random() < 1 / SHINY_ODDS
  const name = NAMES[Math.floor(random() * NAMES.length)] ?? 'Pip'
  return { species, isShiny, name }
}

export const hatchPixling = (random: () => number, now: number, dex: readonly string[] = []): Pixling => {
  const { species, isShiny, name } = roll(random)
  return {
    v: 1,
    species: species.id,
    isShiny,
    name,
    hatchedAt: now,
    xp: 0,
    hat: null,
    face: null,
    stats: emptyStats(),
    dex: [...new Set([...dex, species.id])],
  }
}

// Experience ------------------------------------------------------------------------------------

export const XP = {
  turn: 4,
  testPass: 8,
  bugSquashed: 25,
  commit: 12,
  push: 15,
  prCreated: 30,
  prMerged: 50,
  pet: 1,
  session: 5,
  nap: 10,
} as const

export type XpEvent = keyof typeof XP

/** Total experience needed to reach `level` (level 1 needs none). */
export const xpForLevel = (level: number): number =>
  level <= 1 ? 0 : Math.round(30 * Math.pow(level - 1, 1.8))

export const MAX_LEVEL = 99

export const levelOf = (xp: number): { level: number; into: number; need: number } => {
  let level = 1
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++
  const floor = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { level, into: xp - floor, need: next - floor }
}

// Unlocks --------------------------------------------------------------------------------------

export type Unlock = { level: number; hat?: Hat; face?: Face; label: string }

export const UNLOCKS: readonly Unlock[] = [
  { level: 2, hat: 'sprout', label: 'a sprout' },
  { level: 4, hat: 'shroom', label: 'a mushroom cap' },
  { level: 6, face: 'shades', label: 'sunglasses' },
  { level: 9, hat: 'party', label: 'a party hat' },
  { level: 12, hat: 'crown', label: 'a crown' },
  { level: 18, hat: 'halo', label: 'a halo' },
  { level: 25, hat: 'wizard', label: 'a wizard hat' },
]

export const unlockedAt = (level: number): Unlock[] => UNLOCKS.filter(u => u.level <= level)

export const gearOf = (p: Pixling): { hat: Hat | null; face: Face | null } => {
  const { level } = levelOf(p.xp)
  const open = unlockedAt(level)
  const hats = open.flatMap(u => (u.hat ? [u.hat] : []))
  const faces = open.flatMap(u => (u.face ? [u.face] : []))
  const hat = p.hat === 'none' ? null : p.hat && hats.includes(p.hat) ? p.hat : (hats[hats.length - 1] ?? null)
  const face = p.face === 'none' ? null : p.face && faces.includes(p.face) ? p.face : (faces[faces.length - 1] ?? null)
  return { hat, face }
}

/** Adds experience; returns the new pixling and the levels crossed, with what they unlocked. */
export const gain = (
  p: Pixling,
  event: XpEvent,
): { pixling: Pixling; levelUp: { level: number; unlocks: Unlock[] } | null } => {
  const before = levelOf(p.xp).level
  const pixling = { ...p, xp: p.xp + XP[event] }
  const after = levelOf(pixling.xp).level
  if (after <= before) return { pixling, levelUp: null }
  return {
    pixling,
    levelUp: { level: after, unlocks: UNLOCKS.filter(u => u.level > before && u.level <= after) },
  }
}

export const bump = (p: Pixling, stat: keyof Stats, by = 1): Pixling => ({
  ...p,
  stats: { ...p.stats, [stat]: p.stats[stat] + by },
})

/** Reads a stored value back into a pixling, or null when it is not one. */
export const revive = (value: unknown): Pixling | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<Pixling>
  if (v.v !== 1 || typeof v.species !== 'string' || typeof v.name !== 'string') return null
  if (!SPECIES.some(s => s.id === v.species)) return null
  return {
    v: 1,
    species: v.species,
    isShiny: v.isShiny === true,
    name: v.name.slice(0, 24),
    hatchedAt: typeof v.hatchedAt === 'number' ? v.hatchedAt : Date.now(),
    xp: typeof v.xp === 'number' && v.xp >= 0 ? v.xp : 0,
    hat: v.hat ?? null,
    face: v.face ?? null,
    stats: { ...emptyStats(), ...(v.stats ?? {}) },
    dex: Array.isArray(v.dex) ? v.dex.filter((d): d is string => typeof d === 'string') : [v.species],
  }
}

export const xpBar = (into: number, need: number, width: number): string => {
  const filled = need <= 0 ? width : Math.min(width, Math.round((into / need) * width))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const daysTogether = (p: Pixling, now: number): number =>
  Math.max(1, Math.floor((now - p.hatchedAt) / 86_400_000) + 1)
