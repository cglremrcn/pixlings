// The bridge from Claude Code's retired /buddy. Its companion was left in the global config file
// (`~/.claude.json`, or `$CLAUDE_CONFIG_DIR/.claude.json`) under `companion`: a name, a free-text
// personality and when it hatched. That file holds much else of the person's; only those three
// fields are ever kept from it. The file's text is parsed here and dropped, never printed,
// stored or sent, and a parse error is not passed on (an engine's message can quote the text).

import { POWERSHELL, PS_FLAGS } from './platform.ts'
import type { Platform } from './platform.ts'
import { oneLine } from './persona.ts'
import type { Pixling } from './progress.ts'
import { SPECIES } from './sprites.ts'
import type { Species } from './sprites.ts'

export type Companion = { name: string; personality: string | null; hatchedAt: number | null }

/** The file name, and the variable that moves the folder it lives in. */
export const CONFIG_FILE = '.claude.json'

/** Where the companion is looked for: the config folder when one is set, else the home folder. */
export const configPath = (home: string, configDir: string | undefined, isWindows: boolean): string => {
  const sep = isWindows ? '\\' : '/'
  const folder = configDir && configDir.trim() !== '' ? configDir : home
  return `${folder.replace(/[\\/]+$/, '')}${sep}${CONFIG_FILE}`
}

/**
 * Epoch milliseconds from epoch milliseconds, epoch seconds or an ISO date; null when it is none
 * of those. A number under 1e11 is seconds: 1e11 ms is 1973, 1e11 s is the year 5138.
 */
export const epochMs = (value: unknown): number | null => {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())
        ? Number(value)
        : typeof value === 'string'
          ? Date.parse(value)
          : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n < 1e11 ? n * 1000 : n)
}

/** A name the pixling can wear: what `/pixling name` allows, at most 20 characters. */
export const cleanName = (name: string): string =>
  name
    .replace(/[^\p{L}\p{N} _'-]/gu, '')
    .slice(0, 20)
    .trim()

/**
 * The companion in a config file's text, or null when there is none to adopt. Everything but
 * its name, personality and hatch time is left behind with the parsed text.
 */
export const companionOf = (text: string): Companion | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return null
  }
  if (!isRecord(parsed) || !isRecord(parsed['companion'])) return null
  const c = parsed['companion']
  const name = typeof c['name'] === 'string' ? cleanName(c['name']) : ''
  if (!name) return null
  const personality = typeof c['personality'] === 'string' ? oneLine(c['personality']) : ''
  return { name, personality: personality || null, hatchedAt: epochMs(c['hatchedAt']) }
}

/**
 * A process that prints the file named by `PIXLING_IN`, for when the engine's own read is
 * refused. PowerShell is told to write UTF-8 without a byte-order mark: its default is the
 * console's code page, which would mangle a name like "Çiçek".
 */
export const readFileArgv = (platform: Platform, path: string): { argv: string[]; env: Record<string, string> } =>
  platform === 'windows'
    ? {
        argv: [
          POWERSHELL,
          ...PS_FLAGS,
          '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; [Console]::Out.Write((Get-Content -Raw -Encoding UTF8 -LiteralPath $env:PIXLING_IN))',
        ],
        env: { PIXLING_IN: path },
      }
    : { argv: ['cat', '--', path], env: {} }

/**
 * The pixling taking the companion in: its name, its personality (a template's stays when the
 * Buddy had none) and its hatch time for the days together. Level, stats, badges, streak, tics
 * and dex are untouched; a chosen species is worn and joins the dex. Adopting again changes
 * nothing more.
 */
export const adopt = (p: Pixling, c: Companion, species?: Species): Pixling => ({
  ...p,
  name: c.name,
  persona: c.personality ?? p.persona,
  adoptedFrom: { name: c.name, hatchedAt: c.hatchedAt },
  ...(species ? { species: species.id, dex: p.dex.includes(species.id) ? p.dex : [...p.dex, species.id] } : {}),
})

/** A species named by id or by name, any case; null when there is no such species. */
export const speciesNamed = (word: string): Species | null => {
  const w = word.trim().toLowerCase()
  return SPECIES.find(s => s.id === w || s.name.toLowerCase() === w) ?? null
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
