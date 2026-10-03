// The pixling's moment-to-moment mood: reactions with a priority and a hold time over a base
// mood that follows the session (working, idle, asleep).

import type { Mood } from './canvas.ts'

export type Reaction = { mood: Mood; priority: number; holdMs: number }

export type Held = { mood: Mood; since: number; until: number; priority: number }

export type Bubble = { text: string; since: number; until: number; priority: number }

export const PRIORITY = {
  ambient: 10,
  pet: 20,
  done: 30,
  commit: 45,
  testPass: 50,
  testFail: 55,
  error: 60,
  celebrate: 70,
  alarm: 80,
  attention: 90,
  limit: 92,
  wake: 95,
  hatch: 100,
} as const

/** A reaction replaces the held one unless that one still holds with a higher priority. */
export const react = (held: Held | null, r: Reaction, now: number): Held | null => {
  if (held && now < held.until && r.priority < held.priority) return null
  return { mood: r.mood, since: now, until: now + r.holdMs, priority: r.priority }
}

export const speak = (
  bubble: Bubble | null,
  text: string,
  priority: number,
  holdMs: number,
  now: number,
): Bubble | null => {
  if (bubble && now < bubble.until && priority < bubble.priority) return null
  return { text, since: now, until: now + holdMs, priority }
}

export type Session = { isSleeping: boolean; isWorking: boolean; isDozing: boolean }

export const baseMood = (s: Session): Mood => (s.isSleeping || s.isDozing ? 'sleep' : s.isWorking ? 'working' : 'idle')

/** The mood to draw now: a held reaction while it lasts, else the session's base mood. */
export const moodNow = (held: Held | null, base: Mood, baseSince: number, now: number): { mood: Mood; since: number } =>
  held && now < held.until ? { mood: held.mood, since: held.since } : { mood: base, since: baseSince }

/** Reading time for a bubble: long enough to read, never a wall. */
export const holdFor = (text: string): number => Math.min(9000, 3500 + text.length * 70)
