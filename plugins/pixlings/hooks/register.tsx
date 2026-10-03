import { atom, read, update } from 'claude-code'
import type { Elements, Register, Timer } from 'claude-code'

import type { PixlingsBubble, PixlingsCache, PixlingsNap, PixlingsVital, PixlingsView } from '../types'
import { award, BADGES, countDay, earnedBadges, localDate, recapLine, touchDay } from './lib/badges.ts'
import { baseMood, holdFor, moodNow, PRIORITY, react, speak } from './lib/brain.ts'
import type { Bubble, Held } from './lib/brain.ts'
import { CARD_BG, CARD_SCALE, renderCard, shareText } from './lib/card.ts'
import { CANVAS_W, HATCH_MS, renderFrame, renderHatch, renderSilhouette, samePixels, SPRITE_X } from './lib/canvas.ts'
import type { Face, Hat, Icon, Mood, Pixels } from './lib/canvas.ts'
import { blockingWindow, clockTime, formatDuration, iconFor, isTestCommand, riskOf, testOutcome } from './lib/detect.ts'
import type { LimitWindow, Risk } from './lib/detect.ts'
import { say } from './lib/lines.ts'
import type { LineKey, Slots } from './lib/lines.ts'
import {
  assetPath,
  linuxPlayer,
  linuxSpeaker,
  notificationArgv,
  openArgv,
  platformOfUname,
  speakable,
  windowsPlayer,
  wavPipeArgv,
  windowsSpeech,
  writeBytesArgv,
} from './lib/platform.ts'
import type { Platform, Player } from './lib/platform.ts'
import { encodePng } from './lib/png.ts'
import { bump, daysTogether, gain, gearOf, hatchPixling, levelOf, revive, UNLOCKS, xpBar } from './lib/progress.ts'
import type { Day, Pixling, Stats, XpEvent } from './lib/progress.ts'
import { base64, rasterOf, toSvg } from './lib/raster.ts'
import { isWalking, newWalker, roamRange, walk } from './lib/roam.ts'
import type { RoamMode, Walker } from './lib/roam.ts'
import { RARITY_COLOR, RARITY_STARS, SPECIES, speciesById } from './lib/sprites.ts'
import type { Species } from './lib/sprites.ts'
import { addTics, isEyeRoll, ticsIn, topTics } from './lib/tics.ts'
import type { Tic } from './lib/tics.ts'
import { freshCache, hitPercent, observe, remainingMs, tokens, vitals } from './lib/vitals.ts'
import { animalese, durationMs, wavOf } from './lib/voice.ts'
import type { Cache, RequestUsage, Ttl } from './lib/vitals.ts'

/** The elements the band and the card share across surfaces. */
type Kit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

const view = atom({ plugin: 'pixlings', key: 'view' } as const, null as PixlingsView | null)
const bubbleAtom = atom({ plugin: 'pixlings', key: 'bubble' } as const, null as PixlingsBubble)
const napAtom = atom({ plugin: 'pixlings', key: 'nap' } as const, null as PixlingsNap)
const hatchAtom = atom({ plugin: 'pixlings', key: 'hatchAt' } as const, null as number | null)
const moodAtom = atom({ plugin: 'pixlings', key: 'mood' } as const, 'idle')
const vitalsAtom = atom({ plugin: 'pixlings', key: 'vitals' } as const, [] as PixlingsVital[])
const cacheAtom = atom({ plugin: 'pixlings', key: 'cache' } as const, null as PixlingsCache)

const STORE_KEY = 'pixling'
const SEEN_KEY = 'lastSeen'
const TTL_KEY = 'cacheTtl'
/** The cache warning comes this long before it expires, and only over a context worth saving. */
const COOLING_WARN_MS = 60_000
const MIN_WARN_CONTEXT = 20_000
const RASTER_KEY = 'pixling'
const FRAME_MS = 100
const DOZE_AFTER_MS = 15 * 60_000
const LONG_TURN_MS = 45_000
const NAP_RETRY_MS = 20 * 60_000
const NAP_GRACE_MS = 20_000
const CONTINUE_PROMPT =
  'The usage limit has reset. Please continue the task you were working on where you left off.'

const FACES: Readonly<Record<Mood, string>> = {
  idle: '(•ᴗ•)',
  working: '(•_•)…',
  happy: '(^ᴗ^)',
  celebrate: '\\(^ᴗ^)/',
  sad: '(╥﹏╥)',
  alarmed: '(°ロ°)!',
  attention: '(•o•)!',
  sleep: '(-ᴗ-)zz',
  love: '(♡ᴗ♡)',
  dizzy: '(@_@)',
  walk: '(•ᴗ•)♪',
  unimpressed: '(¬_¬)',
}

const TONE_COLOR: Readonly<Record<PixlingsVital['tone'], string | undefined>> = {
  good: '#6fdc8c',
  warn: '#ffc53d',
  bad: '#ff5f5f',
  cold: '#7fd3ff',
  dim: undefined,
}

const isTtl = (value: unknown): value is Ttl => value === '5m' || value === '1h'

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

type Reaction = {
  mood?: Mood
  priority: number
  holdMs?: number
  line?: LineKey
  slots?: Slots
  sound?: string
  /** Plays under the "important" sound setting too, and wins over a held mood. */
  isImportant?: boolean
  notify?: string
}

type GitOperation = {
  commit?: { sha: string; branch?: string }
  push?: { branch: string }
  pr?: { number: number; action: string }
}

/**
 * The side effects the pixling needs, bound once per load in `session.start`. Mods spell `$`
 * only at its call sites, so the logic below talks to the engine through these closures.
 */
type Io = {
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => Timer
  setView: (value: PixlingsView) => Promise<void>
  setBubble: (value: PixlingsBubble) => Promise<void>
  setNap: (value: PixlingsNap) => Promise<void>
  setHatchAt: (value: number | null) => Promise<void>
  setMood: (value: Mood) => Promise<void>
  save: (value: Pixling) => Promise<void>
  run: (argv: string[], timeoutMs: number) => Promise<string>
  playAsset: (asset: string) => Promise<void>
  toast: (text: string, timeoutMs: number) => void
  invalidate: () => void
  blit: (requestId: string, cells: string) => Promise<boolean>
  usage: () => Promise<readonly LimitWindow[]>
  submit: (text: string) => Promise<void>
  setVitals: (value: PixlingsVital[]) => Promise<void>
  setCache: (value: Cache) => Promise<void>
  saveTtl: (ttl: Ttl) => Promise<void>
  /** The prompt box's draft: a person typing is about to reply anyway. */
  draft: () => Promise<string>
  /** macOS's own voice, through the engine. */
  speak: (text: string) => Promise<void>
  pipe: (argv: string[], stdin: string, timeoutMs: number) => Promise<void>
}

export const register: Register = (on, options) => {
  const soundMode = String(options['sound'] ?? 'all')
  const bandMode = String(options['band'] ?? 'full')
  const chatter = String(options['chatter'] ?? 'normal')
  const wantsNotifications = options['notifications'] !== false
  const wantsAutoContinue = options['autoContinue'] !== false
  const wantsVitals = options['vitals'] !== false
  const wantsCacheWarning = options['cacheWarning'] !== false
  const ttlSetting = String(options['cacheTtl'] ?? 'auto')
  const wantsRoam = options['roam'] !== false
  const voiceMode = String(options['voice'] ?? 'animalese')

  // The engine's clock is the one timers run on; Date.now() is synced to it every second so
  // reading the time stays synchronous (a frame is drawn ten times a second).
  let clockOffset = 0
  let ticks = 0
  const now = (): number => Date.now() + clockOffset
  const syncClock = async (port: Io): Promise<void> => {
    clockOffset = (await port.now()) - Date.now()
  }

  // Everything below lives as long as this load of the module; a hot reload starts it over,
  // while the pixling itself is in $.store and the band's values in $.state.
  let io: Io | null = null
  let pixling: Pixling | null = null
  let platform: Platform = 'unknown'
  let player: Player = { kind: 'none' }
  let soundRoot = ''
  let held: Held | null = null
  let bubble: Bubble | null = null
  let bubbleId = 0
  let base: Mood = 'idle'
  let baseSince = 0
  let isWorking = false
  let icon: { icon: Icon; until: number } | null = null
  let lastActivity = 0
  let hatchAt: number | null = null
  let nap: PixlingsNap = null
  let napTimer: Timer | null = null
  let napRetries = 0
  let bandId: string | null = null
  let bandRows = 0
  let lastFrame: Pixels | null = null
  let svgSeenAt = 0
  let lastInvalidate = 0
  let lastSoundAt = 0
  let lastTest: 'pass' | 'fail' | null = null
  let lastFailed: number | null = null
  let turnVerb: string | null = null
  let turnPast: string | null = null
  let lastLimitAt = 0
  let petsToday = 0
  let saidLateNight = ''
  let warnedWindows = new Set<string>()
  let lastMoodShown: Mood = 'idle'
  let saveTimer: Timer | null = null
  let cache: Cache = freshCache()
  let isTtlPinned = false
  let contextPercent: number | null = null
  let limits: readonly LimitWindow[] = []
  let warnedCacheAt: number | null = null
  let lastVitals = ''
  let walker: Walker | null = null
  let bandColumns = 0
  let speaker: ((text: string) => string[]) | null = null
  let lastSpokenAt = 0
  let voicePipe: string[] | null = null
  let voiceUntil = 0

  const species = (): Species => (pixling && speciesById(pixling.species)) || SPECIES[0]!

  // Persistence ---------------------------------------------------------------------------

  const persist = (): void => {
    if (!io || saveTimer) return
    const port = io
    saveTimer = port.after(400, () => {
      saveTimer = null
      void checkBadges()
      if (pixling) void port.save(pixling).catch(() => undefined)
    })
  }

  const publishView = async (): Promise<void> => {
    if (!io || !pixling) return
    const { level, into, need } = levelOf(pixling.xp)
    const { hat, face } = gearOf(pixling)
    await io.setView({
      name: pixling.name,
      speciesId: pixling.species,
      isShiny: pixling.isShiny,
      level,
      xpInto: into,
      xpNeed: need,
      hat,
      face,
    })
  }

  // Sound and notifications ---------------------------------------------------------------

  const play = (id: string, isImportant = false): void => {
    const port = io
    if (!port || soundMode === 'off' || (soundMode === 'important' && !isImportant)) return
    lastSoundAt = now()
    const asset = `sounds/${id}.wav`
    port.after(0, () => {
      const playing =
        player.kind === 'engine'
          ? port.playAsset(asset)
          : player.kind === 'argv'
            ? port.run(player.argv(assetPath(soundRoot, asset, platform)), 20_000)
            : Promise.resolve()
      // No player on this machine: the pixling stays silent rather than noisy.
      void Promise.resolve(playing).catch(() => undefined)
    })
  }

  const notify = (body: string): void => {
    const port = io
    if (!port || !wantsNotifications || !pixling) return
    const argv = notificationArgv(platform, `${pixling.name} · Claude Code`, body)
    if (!argv) return
    port.after(0, () => {
      void port.run(argv, 15_000).catch(() => undefined)
    })
  }

  /**
   * The line said in the pixling's own voice: synthesized for this line and played from memory.
   * Chatter never talks over a sound that means something, nor over itself.
   */
  const chirp = (text: string): void => {
    const port = io
    const argv = voicePipe
    if (!port || !argv || soundMode !== 'all') return
    const at = now()
    if (at - lastSoundAt < 1500 || at < voiceUntil) return
    const pcm = animalese(text, species().voice)
    if (pcm.length === 0) return
    voiceUntil = at + durationMs(pcm) + latency()
    const wav = base64(wavOf(pcm))
    port.after(0, () => {
      void port.pipe(argv, wav, 20_000).catch(() => undefined)
    })
  }

  /** Reads a line aloud with the system voice; false when there is no voice to read it. */
  const speakLine = (text: string, delayMs: number): boolean => {
    const port = io
    if (!port || soundMode === 'off') return true
    const at = now()
    if (at - lastSpokenAt < 4000) return true
    const line = speakable(text)
    const reader = speaker
    const speaking: (() => Promise<unknown>) | null =
      platform === 'mac'
        ? () => port.speak(line)
        : platform === 'windows' || platform === 'wsl'
          ? () => port.pipe(windowsSpeech(), line, 20_000)
          : reader
            ? () => port.run(reader(line), 20_000)
            : null
    if (!speaking || !line) return false
    lastSpokenAt = at
    port.after(delayMs, () => {
      void Promise.resolve()
        .then(speaking)
        .catch(() => undefined)
    })
    return true
  }

  const voice = (text: string, priority: number, hasSound: boolean): void => {
    if (voiceMode === 'off') return
    if (voiceMode === 'speech' && priority >= PRIORITY.done && speakLine(text, hasSound ? 800 : 0)) return
    if (!hasSound) chirp(text)
  }

  // Expression ----------------------------------------------------------------------------

  const currentMood = (at: number): { mood: Mood; since: number } => {
    const nextBase = baseMood({
      isSleeping: nap !== null,
      isWorking,
      isDozing: at - lastActivity > DOZE_AFTER_MS,
    })
    if (nextBase !== base) {
      base = nextBase
      baseSince = at
    }
    return moodNow(held, base, baseSince, at)
  }

  const syncMinimal = async (): Promise<void> => {
    if (!io || bandMode !== 'minimal') return
    const { mood } = currentMood(now())
    if (mood !== lastMoodShown) {
      lastMoodShown = mood
      await io.setMood(mood)
    }
  }

  const express = async (r: Reaction): Promise<void> => {
    const port = io
    if (!port || !pixling) return
    const at = now()
    if (r.mood) {
      const next = react(held, { mood: r.mood, priority: r.priority, holdMs: r.holdMs ?? 3000 }, at)
      if (next) held = next
      else if (!r.isImportant) return
    }
    if (r.line && (chatter !== 'quiet' || r.priority >= PRIORITY.testFail)) {
      const text = say(r.line, { name: pixling.name, ...r.slots }, pixling.species, Math.random)
      const spoken = speak(bubble, text, r.priority, holdFor(text), at)
      if (spoken) {
        bubble = spoken
        bubbleId += 1
        const id = bubbleId
        await port.setBubble({ text, id })
        voice(text, r.priority, r.sound !== undefined)
        port.after(spoken.until - at, () => {
          if (bubbleId === id) {
            bubble = null
            void port.setBubble(null)
          }
        })
      }
    }
    if (r.sound) play(r.sound, r.isImportant)
    if (r.notify) notify(r.notify)
    await syncMinimal()
  }

  const grant = async (event: XpEvent, stat?: keyof Stats): Promise<void> => {
    if (!io || !pixling) return
    const { pixling: next, levelUp } = gain(stat ? bump(pixling, stat) : pixling, event)
    pixling = next
    persist()
    await publishView()
    if (levelUp) {
      const unlock = levelUp.unlocks[levelUp.unlocks.length - 1]
      await express({
        mood: 'celebrate',
        priority: PRIORITY.celebrate,
        holdMs: 3500,
        line: unlock ? 'unlock' : 'levelUp',
        slots: { level: levelUp.level, item: unlock?.label },
        sound: 'levelup',
      })
      // A tall hat makes the band taller: redraw at the new size.
      io.invalidate()
    }
  }

  const count = (stat: keyof Stats): void => {
    if (pixling) {
      pixling = bump(pixling, stat)
      persist()
    }
  }

  const tally = (field: Exclude<keyof Day, 'date' | 'xp'>): void => {
    if (pixling) {
      pixling = countDay(pixling, field)
      persist()
    }
  }

  const isHatching = (at: number): boolean => hatchAt !== null && at - hatchAt < HATCH_MS + 2600

  const checkBadges = async (): Promise<void> => {
    const port = io
    if (!port || !pixling || isHatching(now())) return
    const { pixling: next, earned } = award(pixling, now())
    const [first] = earned
    if (!first) return
    pixling = next
    void port.save(next).catch(() => undefined)
    await express({
      mood: 'celebrate',
      priority: PRIORITY.celebrate,
      holdMs: 3500,
      line: 'badge',
      slots: { item: `${first.emoji} ${first.name}` },
      sound: 'badge',
    })
    const more = earned.length > 1 ? ` (+${earned.length - 1} more)` : ''
    port.toast(`🏅 Badge: ${first.emoji} ${first.name}, ${first.how.toLowerCase()}${more}. See /pixling badges`, 8000)
  }

  /** The pixling's first look at today: moves the streak, and hands back yesterday's work once. */
  const greetDay = (): Day | null => {
    if (!pixling) return null
    const day = touchDay(pixling, now())
    pixling = day.pixling
    if (day.isNewDay) persist()
    return day.recap
  }

  const touch = async (): Promise<void> => {
    const at = now()
    const away = at - lastActivity
    lastActivity = at
    if (away > DOZE_AFTER_MS && !nap) {
      await express({ mood: 'happy', priority: PRIORITY.ambient, line: 'welcomeBack', slots: { dur: formatDuration(away) } })
    }
  }

  // Frames --------------------------------------------------------------------------------

  const frameAt = (at: number): Pixels => {
    const s = species()
    const p = pixling
    const { hat, face } = p ? gearOf(p) : { hat: null, face: null }
    if (p && hatchAt !== null && at - hatchAt < HATCH_MS + 2600) {
      return renderHatch(
        { species: s, isShiny: p.isShiny, mood: 'celebrate', t: Math.max(0, at - hatchAt), hat, face },
        RARITY_COLOR[s.rarity],
      )
    }
    const { mood, since } = currentMood(at)
    const activeIcon = icon && at < icon.until ? icon.icon : null
    const range = rangeNow()
    const w = walker
    const isStepping = w !== null && isWalking(w) && (mood === 'idle' || mood === 'working')
    return renderFrame({
      species: s,
      isShiny: p?.isShiny ?? false,
      mood: isStepping ? 'walk' : mood,
      t: isStepping ? at : at - since,
      hat,
      face,
      icon: activeIcon,
      width: CANVAS_W + range,
      x: SPRITE_X + Math.min(w?.x ?? range, range),
      isFlipped: isStepping ? (w?.isFlipped ?? false) : false,
    })
  }

  /** Columns the pixling may walk: the band's width past the canvas and the speech bubble. */
  const rangeNow = (): number =>
    wantsRoam && bandMode === 'full' && !isHatching(now()) ? roamRange(bandColumns) : 0

  const roam = (at: number): void => {
    const range = rangeNow()
    if (!walker) walker = newWalker(range, at)
    const { mood } = currentMood(at)
    const isHeld = held !== null && at < held.until
    const mode: RoamMode = nap || mood === 'sleep' || isHeld ? 'stay' : isWorking ? 'home' : 'wander'
    walker = walk(walker, range, mode, at, Math.random)
  }

  // Vitals --------------------------------------------------------------------------------

  const refreshVitals = async (at: number): Promise<void> => {
    const port = io
    if (!port || !wantsVitals) return
    const pieces = vitals({ cache, now: at, isWorking, contextPercent, limits })
    const key = pieces.map(v => `${v.text}:${v.tone}`).join('|')
    if (key !== lastVitals) {
      lastVitals = key
      await port.setVitals(pieces)
    }
    await warnCooling(at)
  }

  /** A minute before the cache expires over a sizable context, the pixling taps the glass. */
  const warnCooling = async (at: number): Promise<void> => {
    const port = io
    const left = remainingMs(cache, at)
    if (!port || !wantsCacheWarning || isWorking || nap || left === null || left <= 0 || left > COOLING_WARN_MS) return
    if (cache.lastAt === warnedCacheAt || cache.context < MIN_WARN_CONTEXT) return
    warnedCacheAt = cache.lastAt
    const draft = await port.draft().catch(() => '')
    if (draft.trim() !== '') return
    await express({
      mood: 'attention',
      priority: PRIORITY.commit,
      holdMs: 5000,
      line: 'cacheCooling',
      slots: { dur: formatDuration(left) },
      sound: 'clock',
    })
  }

  /** What one main-thread request taught: the cache's state, and the model's verbal tics. */
  const afterStep = async (usage: RequestUsage | null, answer: string, sentAt: number): Promise<void> => {
    const port = io
    if (!port || !pixling) return
    if (usage) {
      const { cache: seen, news } = observe(cache, usage, sentAt, isTtlPinned)
      cache = seen
      await port.setCache(cache)
      if (news?.kind === 'learned') {
        await port.saveTtl(news.ttl).catch(() => undefined)
        await express({
          priority: PRIORITY.ambient,
          line: 'cacheLearned',
          slots: { item: news.ttl === '1h' ? 'an hour' : 'five minutes' },
        })
      } else if (news?.kind === 'cold') {
        count('coldStarts')
        await express({
          mood: 'sad',
          priority: PRIORITY.commit,
          holdMs: 2600,
          line: 'cacheCold',
          slots: { n: tokens(news.rewritten), dur: formatDuration(news.gapMs) },
          sound: 'freeze',
        })
      }
    }
    if (answer) await hearTics(answer)
  }

  const hearTics = async (text: string): Promise<void> => {
    if (!pixling) return
    const found = ticsIn(text)
    const kinds = Object.keys(found) as Tic[]
    if (kinds.length === 0) return
    pixling = { ...pixling, tics: addTics(pixling.tics, found) }
    persist()
    const roll = kinds.find(isEyeRoll)
    if (!roll) return
    await express({
      mood: 'unimpressed',
      priority: PRIORITY.commit,
      holdMs: 2600,
      line: roll,
      slots: { n: pixling.tics[roll] ?? 1 },
      sound: 'eyeroll',
    })
  }

  const tick = async (): Promise<void> => {
    const port = io
    if (!port || !pixling) return
    ticks += 1
    if (ticks % 10 === 0) await syncClock(port)
    const t = now()
    if (ticks % 10 === 1) await refreshVitals(t)
    if (bandMode === 'minimal') {
      await syncMinimal()
      return
    }
    roam(t)
    const frame = frameAt(t)
    if (samePixels(lastFrame, frame)) return
    const hasResized = lastFrame !== null && (lastFrame.h !== frame.h || lastFrame.w !== frame.w)
    lastFrame = frame
    if (hasResized) {
      port.invalidate()
      return
    }
    if (bandId && bandRows * 2 >= frame.h) {
      const isShown = await port.blit(bandId, rasterOf(frame).cells)
      if (!isShown) bandId = null
    }
    // Surfaces without Raster draw an SVG: redraw them a few times a second.
    if (t - svgSeenAt < 30_000 && t - lastInvalidate > 280) {
      lastInvalidate = t
      port.invalidate()
    }
  }

  // Hatching ------------------------------------------------------------------------------

  // PowerShell takes about half a second to start playing; start the animation with the sound.
  const latency = (): number => (platform === 'windows' || platform === 'wsl' ? 450 : 80)

  const hatch = async (dex: readonly string[] = []): Promise<void> => {
    const port = io
    if (!port) return
    pixling = touchDay(bump(hatchPixling(Math.random, now(), dex), 'sessions'), now()).pixling
    await port.save(pixling)
    const s = species()
    const tier = s.rarity === 'legendary' ? 3 : s.rarity === 'rare' || s.rarity === 'epic' ? 2 : 1
    play(`hatch-${tier}`, true)
    hatchAt = now() + latency()
    held = null
    await port.setHatchAt(hatchAt)
    await publishView()
    port.after(latency() + 4400, () => {
      void (async () => {
        await express({ mood: 'celebrate', priority: PRIORITY.hatch, holdMs: 3000, line: 'hatch' })
        const shiny = pixling?.isShiny ? ' ✦ SHINY!' : ''
        port.toast(`${RARITY_STARS[s.rarity]} ${s.rarity.toUpperCase()}: a ${s.name} hatched!${shiny}  Try /pixling`, 8000)
      })()
    })
  }

  // Rate-limit nap ------------------------------------------------------------------------

  const armWake = (at: number): void => {
    if (!io) return
    napTimer?.cancel()
    napTimer = io.after(Math.max(1000, at - now()), () => {
      void wake()
    })
  }

  const fallAsleep = async (): Promise<void> => {
    const port = io
    const at = now()
    if (!port || nap || at - lastLimitAt < 3000) return
    lastLimitAt = at
    let resetsAt: number | null = null
    let kind = 'five_hour'
    try {
      const window = blockingWindow(await port.usage(), at)
      resetsAt = window?.resetsAt ?? null
      kind = window?.kind ?? kind
    } catch {
      // Usage unreadable: nap on a retry timer instead.
    }
    const wakeAt = resetsAt !== null ? resetsAt + NAP_GRACE_MS : at + NAP_RETRY_MS * Math.min(4, 1 + napRetries)
    nap = { until: resetsAt, isAuto: wantsAutoContinue, kind }
    await port.setNap(nap)
    held = null
    await express({
      priority: PRIORITY.limit,
      line: resetsAt !== null ? 'limit' : 'limitUnknown',
      slots: { time: resetsAt !== null ? clockTime(resetsAt) : null },
      sound: 'sleep',
      isImportant: true,
      notify: resetsAt !== null ? `Usage limit hit. I'll wake Claude at ${clockTime(resetsAt)}.` : 'Usage limit hit.',
    })
    count('naps')
    await grant('nap')
    armWake(wakeAt)
  }

  const wake = async (): Promise<void> => {
    const port = io
    if (!port || !nap) return
    const shouldContinue = nap.isAuto
    nap = null
    napTimer = null
    napRetries += 1
    await port.setNap(null)
    await express({
      mood: 'attention',
      priority: PRIORITY.wake,
      holdMs: 4000,
      line: 'wake',
      sound: 'wake',
      isImportant: true,
      notify: shouldContinue ? 'Limit reset. Claude is back at work.' : 'Your usage limit has reset.',
    })
    if (shouldContinue) {
      // A session that cannot take a prompt now keeps the reminder in the bubble.
      await port.submit(CONTINUE_PROMPT).catch(() => undefined)
    }
  }

  const cancelNap = async (): Promise<void> => {
    if (!io || !nap) return
    napTimer?.cancel()
    napTimer = null
    nap = null
    napRetries = 0
    await io.setNap(null)
  }

  // Reactions to shell work ---------------------------------------------------------------

  const reactRisk = async (risk: Risk): Promise<void> => {
    count('risky')
    await express({
      mood: 'alarmed',
      priority: risk.level === 'danger' ? PRIORITY.alarm : PRIORITY.testFail,
      holdMs: 3500,
      line: risk.level,
      slots: { label: risk.label },
      sound: risk.level === 'danger' ? 'alarm' : 'spicy',
      isImportant: risk.level === 'danger',
    })
  }

  const afterTests = async (output: string, isError: boolean): Promise<void> => {
    const outcome = testOutcome(output, isError)
    if (outcome.status === 'fail') {
      lastFailed = outcome.failed
      count('testsFailed')
      await express({
        mood: 'sad',
        priority: PRIORITY.testFail,
        holdMs: 4200,
        line: 'testFail',
        slots: { failed: outcome.failed },
        sound: 'fail',
      })
    } else if (lastTest === 'fail') {
      count('bugsSquashed')
      tally('squashed')
      await express({
        mood: 'celebrate',
        priority: PRIORITY.celebrate,
        holdMs: 3500,
        line: 'bugSquashed',
        slots: { failed: lastFailed ?? 'all' },
        sound: 'squash',
      })
      await grant('bugSquashed', 'testsPassed')
    } else {
      await express({
        mood: 'happy',
        priority: PRIORITY.testPass,
        holdMs: 2600,
        line: 'testPass',
        slots: { passed: outcome.passed },
        sound: 'pass',
      })
      await grant('testPass', 'testsPassed')
    }
    if (outcome.status === 'pass') tally('tests')
    lastTest = outcome.status
  }

  const afterGit = async (command: string, git: GitOperation | undefined): Promise<void> => {
    if (git?.pr && (git.pr.action === 'created' || git.pr.action === 'merged')) {
      const isMerged = git.pr.action === 'merged'
      await express({
        mood: 'celebrate',
        priority: PRIORITY.celebrate,
        holdMs: 3500,
        line: isMerged ? 'prMerged' : 'prCreated',
        slots: { pr: git.pr.number },
        sound: isMerged ? 'squash' : 'levelup',
      })
      await grant(isMerged ? 'prMerged' : 'prCreated', 'prs')
    } else if (git?.push) {
      await express({ mood: 'happy', priority: PRIORITY.commit, line: 'push', slots: { branch: git.push.branch }, sound: 'push' })
      await grant('push', 'pushes')
    } else if (git?.commit || /\bgit\s+commit\b/.test(command)) {
      await express({ mood: 'happy', priority: PRIORITY.commit, line: 'commit', sound: 'commit' })
      tally('commits')
      await grant('commit', 'commits')
    }
  }

  // Session -------------------------------------------------------------------------------

  const choosePlayer = async (port: Io, root: string): Promise<void> => {
    soundRoot = root
    voicePipe = wavPipeArgv(platform)
    if (platform === 'mac') {
      player = { kind: 'engine' }
    } else if (platform === 'windows') {
      player = { kind: 'argv', argv: windowsPlayer }
    } else if (platform === 'wsl') {
      soundRoot = (await port.run(['wslpath', '-w', root], 5000)).trim()
      player = soundRoot ? { kind: 'argv', argv: windowsPlayer } : { kind: 'none' }
    } else if (platform === 'linux') {
      const found = await port.run(['sh', '-c', 'command -v paplay || command -v pw-play || command -v aplay'], 5000)
      player = linuxPlayer(found)
      voicePipe = wavPipeArgv(platform, found)
      if (voiceMode === 'speech') {
        speaker = linuxSpeaker(await port.run(['sh', '-c', 'command -v spd-say || command -v espeak-ng || command -v espeak'], 5000))
      }
    }
  }

  on('session.start', async ($, e, next) => {
    const port: Io = {
      now: () => $.clock.now(),
      after: (ms, fn) => $.clock.after(ms, fn),
      setView: async value => {
        await update($, view, () => value)
      },
      setBubble: async value => {
        await update($, bubbleAtom, () => value)
      },
      setNap: async value => {
        await update($, napAtom, () => value)
      },
      setHatchAt: async value => {
        await update($, hatchAtom, () => value)
      },
      setMood: async value => {
        await update($, moodAtom, () => value)
      },
      save: async value => {
        await $.store.set(STORE_KEY, value)
      },
      run: async (argv, timeoutMs) => (await $.process.run(argv, { timeoutMs })).stdout,
      playAsset: async asset => {
        await $.audio.play({ asset })
      },
      toast: (text, timeoutMs) => $.ui.toast(text, { timeoutMs }),
      invalidate: () => $.ui.invalidate('ui.render'),
      blit: async (requestId, cells) => (await $.ui.blit({ requestId, key: RASTER_KEY, cells })).deny === undefined,
      usage: async () => (await $.session.usage()).rateLimits,
      submit: async text => {
        await $.prompt.submit({ text })
      },
      setVitals: async value => {
        await update($, vitalsAtom, () => value)
      },
      setCache: async value => {
        await update($, cacheAtom, () => value)
      },
      saveTtl: async ttl => {
        await $.store.set(TTL_KEY, ttl)
      },
      draft: async () => (await $.prompt.read()).text,
      speak: async text => {
        await $.audio.speak(text)
      },
      pipe: async (argv, stdin, timeoutMs) => {
        await $.process.run(argv, { stdin, timeoutMs })
      },
    }
    io = port
    await syncClock(port)
    lastActivity = now()
    baseSince = now()

    const os = await $.env.get('OS')
    try {
      platform = os === 'Windows_NT' ? 'windows' : platformOfUname(await port.run(['uname', '-sr'], 5000))
      await choosePlayer(port, $.plugin.root)
    } catch {
      player = { kind: 'none' }
    }

    // The cache's lifetime: the person's setting, else what a past session learned, else 5m.
    const learned = await $.store.get(TTL_KEY)
    isTtlPinned = isTtl(ttlSetting)
    const ttl: Ttl = isTtl(ttlSetting) ? ttlSetting : isTtl(learned) ? learned : '5m'
    const isKnown = isTtlPinned || isTtl(learned)
    const cacheNow = await read($, cacheAtom)
    cache = cacheNow ? { ...cacheNow, ttl, isTtlKnown: isKnown || cacheNow.isTtlKnown } : freshCache(ttl, isKnown)

    const stored = revive(await $.store.get(STORE_KEY))
    const lastSeen = Number((await $.store.get(SEEN_KEY)) ?? 0)
    await $.store.set(SEEN_KEY, now())
    await $.command.register({
      name: 'pixling',
      description: 'Your pixling: card, pet, name, wear, dex, hatch',
      argumentHint: '[pet | name <name> | wear <item> | dex | hatch | help]',
    })
    $.clock.every(FRAME_MS, () => {
      void tick()
    })

    // A hot reload finds a nap or a hatch in progress in $.state.
    const napNow = await read($, napAtom)
    if (napNow) {
      nap = napNow
      armWake(napNow.until !== null ? napNow.until + NAP_GRACE_MS : now() + NAP_RETRY_MS)
    }
    const hatchNow = await read($, hatchAtom)
    if (hatchNow !== null && now() - hatchNow < HATCH_MS + 2600) hatchAt = hatchNow

    if (!stored) {
      await hatch()
    } else {
      pixling = bump(stored, 'sessions')
      const recap = greetDay()
      await publishView()
      await grant('session')
      const away = lastSeen > 0 ? now() - lastSeen : 0
      if (hatchAt === null) {
        if (recap) {
          await express({
            mood: 'happy',
            priority: PRIORITY.ambient,
            holdMs: 7000,
            line: 'recap',
            slots: { label: recapLine(recap, localDate(now())) },
          })
        } else {
          await express({
            mood: 'happy',
            priority: PRIORITY.ambient,
            holdMs: 2500,
            line: away > 8 * 3_600_000 ? 'welcomeBack' : 'hello',
            slots: { dur: formatDuration(away) },
          })
        }
        const streak = pixling.streak.days
        if (recap && streak >= 2) port.toast(`🔥 Day ${streak} in a row with ${pixling.name}. Keep it going!`, 7000)
      }
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (pixling) await $.store.set(STORE_KEY, pixling).catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && pixling) {
      await touch()
      if (nap) await cancelNap()
      const date = new Date(now())
      const night = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      if (date.getHours() >= 1 && date.getHours() < 5 && saidLateNight !== night) {
        saidLateNight = night
        await express({ mood: 'sleep', priority: PRIORITY.ambient, holdMs: 2500, line: 'lateNight', slots: { time: clockTime(now()) } })
      }
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const s = species()
    turnVerb = s.verbs[Math.floor(Math.random() * s.verbs.length)] ?? null
    turnPast = s.past[Math.floor(Math.random() * s.past.length)] ?? null
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const sentAt = now()
    const result = yield* next(e)
    if (e.agentId === undefined && pixling) {
      // The pixling watches; it never breaks a turn.
      await afterStep(result.usage, result.answer, sentAt).catch(() => undefined)
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    if (!pixling) return next(e)
    lastActivity = now()
    const input = e as unknown as Record<string, unknown>
    const command = typeof input['command'] === 'string' ? input['command'] : ''
    const nextIcon = iconFor(String(e.tool), command)
    if (nextIcon) icon = { icon: nextIcon, until: now() + 2500 }
    const risk = command ? riskOf(command) : null
    if (risk) await reactRisk(risk)

    const ran = await next(e)

    // The permission dialog, if there was one, has been answered by now.
    if (held?.mood === 'attention') held = null
    if (command && ran.deny === undefined) {
      const record = (ran.result ?? {}) as { stdout?: string; stderr?: string; gitOperation?: GitOperation }
      const output = ran.text ?? `${record.stdout ?? ''}\n${record.stderr ?? ''}`
      const isError = ran.isError === true
      if (isTestCommand(command)) await afterTests(output, isError)
      else if (!isError) await afterGit(command, record.gitOperation)
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || !pixling) return result
    isWorking = false
    icon = null
    switch (e.reason) {
      case 'answer': {
        greetDay()
        tally('turns')
        if (new Date(now()).getHours() < 5) count('nights')
        if (e.durationMs > LONG_TURN_MS) {
          await express({
            mood: 'happy',
            priority: PRIORITY.done,
            holdMs: 2500,
            line: 'doneLong',
            slots: { dur: formatDuration(e.durationMs) },
            sound: 'done',
            isImportant: true,
            notify: `Claude finished after ${formatDuration(e.durationMs)}.`,
          })
        } else {
          await express({
            mood: 'happy',
            priority: PRIORITY.done,
            holdMs: 1800,
            line: Math.random() < 0.35 ? 'done' : undefined,
            sound: 'done',
          })
        }
        await grant('turn', 'turns')
        break
      }
      case 'aborted':
        await express({ mood: 'idle', priority: PRIORITY.ambient, line: 'aborted' })
        break
      case 'refusal':
        await express({ mood: 'dizzy', priority: PRIORITY.error, holdMs: 2500, line: 'refusal', sound: 'error' })
        break
      case 'error': {
        const windows = await (io?.usage() ?? Promise.resolve([])).catch(() => [])
        if (blockingWindow(windows, now())) {
          await fallAsleep()
        } else if (!nap && now() - lastLimitAt > 3000) {
          await express({ mood: 'dizzy', priority: PRIORITY.error, holdMs: 3000, line: 'error', sound: 'error' })
        }
        break
      }
    }
    return result
  })

  on('classic.StopFailure', async ($, e, next) => {
    if (pixling) {
      if (e.error === 'rate_limit') {
        await fallAsleep()
      } else if (e.error === 'overloaded') {
        await express({ mood: 'dizzy', priority: PRIORITY.error, holdMs: 3000, line: 'overloaded', sound: 'error' })
      }
    }
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (pixling) {
      if (e.notification_type === 'permission_prompt') {
        count('permissions')
        await express({
          mood: 'attention',
          priority: PRIORITY.attention,
          holdMs: 60_000,
          line: 'permission',
          sound: 'attention',
          isImportant: true,
          notify: e.message || 'Claude needs your permission.',
        })
      } else if (e.notification_type === 'idle_prompt') {
        await express({ mood: 'idle', priority: PRIORITY.ambient, line: 'idle' })
      }
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    contextPercent = e.context.percent ?? contextPercent
    limits = e.rateLimits
    for (const w of e.rateLimits) {
      const key = `${w.kind}:${w.resetsAt ?? ''}`
      if (w.percentUsed >= 90 && w.percentUsed < 100 && !warnedWindows.has(key)) {
        warnedWindows = new Set([...warnedWindows, key])
        await express({
          mood: 'sleep',
          priority: PRIORITY.ambient,
          holdMs: 2500,
          line: 'tired',
          slots: { n: Math.round(w.percentUsed), window: w.kind.replace('_', '-') },
        })
      }
    }
    return next(e)
  })

  // Commands ------------------------------------------------------------------------------

  const WEARABLES = UNLOCKS.map(u => u.hat ?? u.face).join('|')
  const HELP = [
    "/pixling — your pixling's card",
    '/pixling share — save a trading card PNG to show it off',
    '/pixling badges — the badges, earned and still to earn',
    '/pixling pet — pet it',
    '/pixling name <name> — rename it',
    `/pixling wear <${WEARABLES}|none> — change its look`,
    '/pixling dex — the species you have hatched',
    '/pixling hatch — release it and hatch a new egg (progress resets)',
    'Sound, voice, the band, vitals, the cache warning and auto-continue are in /config.',
  ].join('\n')

  const slug = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'pixling'

  const badgeLine = (b: (typeof BADGES)[number], p: Pixling): string => {
    const [have, need] = b.progress(p)
    const isEarned = p.badges[b.id] !== undefined
    const state = isEarned ? 'earned' : `${xpBar(have, need, 10)} ${have}/${need}`
    return `${isEarned ? b.emoji : '🔒'} ${b.name.padEnd(19)} ${state.padEnd(18)} ${b.how}`
  }

  on('command.run', { command: 'pixling' }, async ($, e) => {
    if (!pixling) return { text: 'Your egg has not hatched yet.' }
    const [sub = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ').trim()
    switch (sub.toLowerCase()) {
      case '':
      case 'card':
        return { text: `${pixling.name} the ${species().name}, level ${levelOf(pixling.xp).level}. /pixling share saves its card.` }
      case 'badges': {
        const p = pixling
        return { text: [`Badges ${earnedBadges(p).length}/${BADGES.length}`, ...BADGES.map(b => badgeLine(b, p))].join('\n') }
      }
      case 'share': {
        const p = pixling
        const png = encodePng(renderCard(p, now()), CARD_SCALE, CARD_BG)
        const home = platform === 'windows' ? await $.env.get('USERPROFILE') : await $.env.get('HOME')
        if (!home) return { text: 'Could not find your home folder to save the card in.' }
        const sep = platform === 'windows' ? '\\' : '/'
        const path = `${home.replace(/[\\/]+$/, '')}${sep}pixling-${slug(p.name)}.png`
        try {
          const wrote = await $.process.run(writeBytesArgv(platform), {
            stdin: base64(png),
            env: { PIXLING_OUT: path },
            timeoutMs: 30_000,
          })
          if (wrote.exitCode !== 0) return { text: `Could not save the card: ${wrote.stderr.trim() || `exit ${wrote.exitCode}`}` }
        } catch (error) {
          return { text: `Could not save the card: ${error instanceof Error ? error.message : String(error)}` }
        }
        const opener = openArgv(platform, path)
        if (opener) void $.process.run(opener, { timeoutMs: 15_000 }).catch(() => undefined)
        const post = shareText(p)
        const copied = await $.ui.copy({ text: post }).catch(() => null)
        await express({ mood: 'celebrate', priority: PRIORITY.celebrate, holdMs: 3000, line: 'share', sound: 'shutter' })
        return {
          text: [
            `Saved ${p.name}'s card to ${path}${opener ? ' and opened it' : ''}.`,
            copied?.isCopied ? 'A post to go with it is on your clipboard:' : 'A post to go with it:',
            post,
          ].join('\n'),
        }
      }
      case 'pet': {
        petsToday += 1
        count('pets')
        await express({ mood: 'love', priority: PRIORITY.pet, holdMs: 2600, line: 'pet', sound: 'pet' })
        if (petsToday <= 20) await grant('pet')
        return { text: `You pet ${pixling.name}. ♥` }
      }
      case 'name': {
        const name = arg.replace(/[^\p{L}\p{N} _'-]/gu, '').slice(0, 20).trim()
        if (!name) return { text: 'Usage: /pixling name <new name>' }
        pixling = { ...pixling, name }
        persist()
        await publishView()
        await express({ mood: 'love', priority: PRIORITY.pet, line: 'rename', slots: { name } })
        return { text: `Your pixling is now called ${name}.` }
      }
      case 'wear': {
        const item = arg.toLowerCase()
        const level = levelOf(pixling.xp).level
        if (item === '') {
          // No item named: show the wardrobe, change nothing.
          const p = pixling
          const rows = UNLOCKS.map(u => {
            const name = u.hat ?? u.face ?? ''
            const isOn = gearOf(p).hat === name || gearOf(p).face === name
            return `${u.level <= level ? (isOn ? '● ' : '○ ') : '🔒 '}${name.padEnd(7)} ${u.label}${u.level <= level ? '' : ` (level ${u.level})`}`
          })
          return { text: [`${p.name}'s wardrobe (level ${level}). /pixling wear <item> or none:`, ...rows].join('\n') }
        }
        if (item === 'none') {
          pixling = { ...pixling, hat: 'none', face: 'none' }
        } else {
          const unlock = UNLOCKS.find(u => u.hat === item || u.face === item)
          if (!unlock) return { text: `Unknown item "${arg}". Wearables: ${WEARABLES}, none.` }
          if (unlock.level > level) return { text: `${unlock.label} unlocks at level ${unlock.level} (now ${level}).` }
          pixling = unlock.hat ? { ...pixling, hat: unlock.hat as Hat } : { ...pixling, face: unlock.face as Face }
        }
        persist()
        await publishView()
        $.ui.invalidate('ui.render')
        return { text: `${pixling.name} is wearing ${item || 'nothing'} now.` }
      }
      case 'dex':
        return { text: `Pixledex: ${pixling.dex.length}/${SPECIES.length} species hatched.` }
      case 'hatch': {
        const keep = `Keep ${pixling.name}`
        let answer = keep
        try {
          answer = await $.ui.ask(`Release ${pixling.name} and hatch a new egg? Level and stats start over; the dex is kept.`, [
            keep,
            'Hatch a new egg',
          ])
        } catch {
          return { text: 'Nothing changed.' }
        }
        if (answer === keep) return { text: `${pixling.name} stays. ♥` }
        await hatch(pixling.dex)
        return { text: 'A new egg is hatching...' }
      }
      default:
        return { text: HELP }
    }
  })

  // Drawing -------------------------------------------------------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    if (e.props.hasSurvey || bandMode === 'off' || !v || !pixling) return next(e)
    isWorking = e.props.isWorking
    const said = await read($, bubbleAtom)
    const napping = await read($, napAtom)
    const pieces = wantsVitals ? await read($, vitalsAtom) : []
    await read($, hatchAtom)
    bandColumns = e.props.bodyColumns
    const s = speciesById(v.speciesId) ?? SPECIES[0]!
    const color = hex(RARITY_COLOR[s.rarity])
    const at = now()
    const text =
      napping !== null
        ? napping.until !== null
          ? `Zzz... back at ${clockTime(napping.until)} (${formatDuration(napping.until - at)})${napping.isAuto ? ', then Claude carries on' : ''}`
          : 'Zzz... napping through the limit.'
        : (said?.text ?? null)

    if (bandMode === 'minimal') {
      const mood = (await read($, moodAtom)) as Mood
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="row">
          <Text color={color}>{`${FACES[mood] ?? FACES.idle} `}</Text>
          <Text bold>{v.name}</Text>
          <Text dimColor>{` · Lv ${v.level}`}</Text>
          {pieces[0] ? <Text color={TONE_COLOR[pieces[0].tone]} dimColor={pieces[0].tone === 'dim'}>{`  ${pieces[0].text}`}</Text> : null}
          {text ? <Text>{`  ${text}`}</Text> : null}
        </Box>
      )
    }

    const frame = frameAt(at)
    lastFrame = frame
    const stars = `${RARITY_STARS[s.rarity]}${v.isShiny ? ' ✦' : ''}`
    const width = Math.max(16, Math.min(56, e.props.bodyColumns - frame.w - 4))

    const info = (Box: Kit['Box'], Text: Kit['Text'], Button: Kit['Button']) => (
      <Box flexDirection="column" marginLeft={1} flexShrink={1} width={width}>
        {text ? (
          <Box borderStyle="round" borderColor={color} paddingX={1} width={width}>
            <Text wrap="wrap">{text}</Text>
          </Box>
        ) : null}
        <Box flexDirection="row">
          <Text bold color={color}>
            {v.name}
          </Text>
          <Text dimColor>{` Lv ${v.level} · ${s.name} ${stars}`}</Text>
        </Box>
        <Box flexDirection="row">
          <Text color={color}>{xpBar(v.xpInto, v.xpNeed, 12)}</Text>
          <Text dimColor>{` ${v.xpInto}/${v.xpNeed}  `}</Text>
          {napping?.isAuto ? (
            <Button key="cancel-nap" label="cancel auto-continue" plain onPress={() => void cancelNap()} />
          ) : null}
        </Box>
        {pieces.length > 0 ? (
          <Box flexDirection="row" flexWrap="wrap">
            {pieces.map((piece, i) => (
              <Text color={TONE_COLOR[piece.tone]} dimColor={piece.tone === 'dim'}>
                {`${i > 0 ? ' · ' : ''}${piece.text}`}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
    )

    if (e.surface === 'terminal') {
      const { Box, Text, Button, Raster } = $.ui.resolve(e)
      bandId = e.requestId ?? null
      const raster = rasterOf(frame)
      bandRows = raster.rows
      return (
        <Box flexDirection="row" alignItems="flex-end">
          <Raster key={RASTER_KEY} columns={raster.columns} rows={raster.rows} cells={raster.cells} />
          {info(Box, Text, Button)}
        </Box>
      )
    }
    svgSeenAt = at
    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" alignItems="flex-end">
        <Svg source={toSvg(frame, 4)} alt={`${v.name} the ${s.name}`} width={frame.w * 4} height={frame.h * 4} />
        {info(Box, Text, Button)}
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    if (!pixling || !turnVerb || e.surface !== 'terminal' || e.props.message !== null) return next(e)
    return next({ ...e, props: { ...e.props, word: turnVerb } })
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => {
    if (!pixling || !turnPast) return next(e)
    return next({ ...e, props: { ...e.props, word: turnPast } })
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'pixling' } }, async ($, e, next) => {
    const sub = e.props.args.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    const p = pixling
    if (!p || e.props.isErrored || !['', 'card', 'dex'].includes(sub)) return next(e)
    const s = species()
    const color = hex(RARITY_COLOR[s.rarity])

    if (sub === 'dex') {
      const cards = SPECIES.map(sp => {
        const isFound = p.dex.includes(sp.id)
        const frame = isFound ? renderFrame({ species: sp, isShiny: false, mood: 'idle', t: 0 }) : renderSilhouette(sp)
        return { sp, isFound, frame }
      })
      const perRow = Math.max(1, Math.floor((e.viewport?.columns ?? 100) / 24))
      const rows: (typeof cards)[] = []
      for (let i = 0; i < cards.length; i += perRow) rows.push(cards.slice(i, i + perRow))
      const title = `Pixledex  ${p.dex.length}/${SPECIES.length}`
      if (e.surface === 'terminal') {
        const { Box, Text, Raster } = $.ui.resolve(e)
        return (
          <Box flexDirection="column">
            <Text bold>{title}</Text>
            {rows.map((row, r) => (
              <Box flexDirection="row" gap={2}>
                {row.map(({ sp, isFound, frame }) => {
                  const raster = rasterOf(frame)
                  return (
                    <Box flexDirection="column" alignItems="center">
                      <Raster key={`dex-${r}-${sp.id}`} columns={raster.columns} rows={raster.rows} cells={raster.cells} />
                      <Text color={isFound ? hex(RARITY_COLOR[sp.rarity]) : undefined} dimColor={!isFound}>
                        {`${isFound ? sp.name : '???'} ${RARITY_STARS[sp.rarity]}`}
                      </Text>
                    </Box>
                  )
                })}
              </Box>
            ))}
          </Box>
        )
      }
      const { Box, Text, Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text bold>{title}</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={2}>
            {cards.map(({ sp, isFound, frame }) => (
              <Box flexDirection="column" alignItems="center">
                <Svg source={toSvg(frame, 3)} alt={isFound ? sp.name : 'Undiscovered'} width={frame.w * 3} height={frame.h * 3} />
                <Text dimColor={!isFound}>{isFound ? sp.name : '???'}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    const { level, into, need } = levelOf(p.xp)
    const { hat, face } = gearOf(p)
    const frame = renderFrame({ species: s, isShiny: p.isShiny, mood: 'happy', t: 0, hat, face })
    const st = p.stats
    const earned = earnedBadges(p)
    const heard = topTics(p.tics, 3)
    const hit = hitPercent(cache)
    const lines = [
      `Tests passed ${st.testsPassed}   Bugs squashed ${st.bugsSquashed}   Commits ${st.commits}   PRs ${st.prs}`,
      `Turns ${st.turns}   Pushes ${st.pushes}   Naps ${st.naps}   Pets ${st.pets}   Close calls ${st.risky}`,
      `${daysTogether(p, now())} day(s) together · 🔥 streak ${p.streak.days} (best ${p.streak.best}) · ${st.sessions} sessions · dex ${p.dex.length}/${SPECIES.length}`,
      `Badges ${earned.length}/${BADGES.length} ${earned.map(b => b.emoji).join(' ')}`,
      ...(heard.length > 0 ? [`Heard: ${heard.map(t => `${t.label} ×${t.n}`).join(' · ')}`] : []),
      `Prompt cache: ${hit === null ? 'no requests yet' : `${hit}% served from cache`} · lives ${cache.ttl === '1h' ? 'an hour' : '5 minutes'}${cache.isTtlKnown ? '' : ' (assumed)'} · ${cache.coldStarts} cold start(s) this session`,
      '/pixling share saves this as a trading card · /pixling badges',
    ]
    const header = (Box: Kit['Box'], Text: Kit['Text']) => (
      <Box flexDirection="column" marginLeft={2} flexShrink={1}>
        <Text bold color={color}>
          {p.name.toUpperCase()}
        </Text>
        <Text>{`${s.name} · ${RARITY_STARS[s.rarity]} ${s.rarity}${p.isShiny ? ' · ✦ shiny' : ''}`}</Text>
        <Box flexDirection="row">
          <Text color={color}>{xpBar(into, need, 16)}</Text>
          <Text dimColor>{` Lv ${level} · ${into}/${need} xp`}</Text>
        </Box>
        <Text dimColor wrap="wrap">
          {s.blurb}
        </Text>
      </Box>
    )
    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      const raster = rasterOf(frame)
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
          <Box flexDirection="row" alignItems="center">
            <Raster key="card" columns={raster.columns} rows={raster.rows} cells={raster.cells} />
            {header(Box, Text)}
          </Box>
          {lines.map(l => (
            <Text dimColor>{l}</Text>
          ))}
        </Box>
      )
    }
    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
        <Box flexDirection="row" alignItems="center">
          <Svg source={toSvg(frame, 5)} alt={`${p.name} the ${s.name}`} width={frame.w * 5} height={frame.h * 5} />
          {header(Box, Text)}
        </Box>
        {lines.map(l => (
          <Text dimColor>{l}</Text>
        ))}
      </Box>
    )
  })
}
