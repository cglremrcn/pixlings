import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { SPECIES } from '../hooks/lib/sprites.ts'

const BAND = {
  plugin: 'pixlings',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 110,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
  viewport: { columns: 110, rows: 40 },
} as const

type Ran = { argv: readonly string[] }

/** Answers what the pixling asks of the engine beneath it, and records host processes. */
const host = (on: On, stored?: unknown) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
  mock.store(on, stored === undefined ? {} : { pixling: stored })
  mock.env(on, { OS: 'Windows_NT' })
  const ran: Ran[] = []
  on('process.run', ($, e) => {
    ran.push({ argv: e.argv })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.blit', () => ({ value: {} }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  return { clock, ran }
}

const DUCK = {
  v: 1,
  species: 'duck',
  isShiny: false,
  name: 'Quackers',
  hatchedAt: Date.parse('2026-09-01T00:00:00Z'),
  xp: 120,
  hat: null,
  face: null,
  stats: {},
  dex: ['duck'],
}

const sounds = (ran: Ran[]): string[] =>
  ran.flatMap(r => {
    const m = r.argv.join(' ').match(/sounds\\([\w-]+)\.wav/)
    return m ? [m[1] ?? ''] : []
  })

describe('the band', () => {
  test('a first session hatches an egg, plays the hatch and shows a pixling', async ($, on) => {
    const { clock, ran } = host(on)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(6000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Raster' })).toBeDefined()
    const name = await ui.find({ type: 'Text', text: / Lv 1 · / })
    expect(name).toBeDefined()
    expect(sounds(ran).some(s => s.startsWith('hatch-'))).toBe(true)
    await ui.unmount()
  })

  test('a stored pixling comes back with its name and level on terminal and desktop', async ($, on) => {
    host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: 'Quackers' })).toBeDefined()
      expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('failing tests make it sad and play the fail sound; fixing them squashes the bug', async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    let output = '==== 2 failed, 10 passed in 0.5s ===='
    let isError = true
    on('tool.call', ($, e) =>
      isError
        ? { isError: true as const, result: { stdout: output, stderr: '', interrupted: false }, text: output }
        : { result: { stdout: output, stderr: '', interrupted: false }, text: output },
    )
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await $.tool.call({ tool: 'Bash', tool_use_id: 't1', command: 'pytest -q' } as never)
    await clock.advance(10)
    expect(sounds(ran)).toContain('fail')
    const sad = await ui.find({ type: 'Text', text: /fail|red|no\.|down|machine|beta|duck|Quack/i })
    expect(sad).toBeDefined()

    output = '==== 12 passed in 0.5s ===='
    isError = false
    await clock.advance(10_000)
    await $.tool.call({ tool: 'Bash', tool_use_id: 't2', command: 'pytest -q' } as never)
    await clock.advance(10)
    expect(sounds(ran)).toContain('squash')
    expect(await ui.find({ type: 'Text', text: /SQUASHED|red to green|Fixed it|defeated/ })).toBeDefined()
    await ui.unmount()
  })

  test('a risky command alarms before it runs', async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.tool.call({ tool: 'Bash', tool_use_id: 't3', command: 'git push --force origin main' } as never)
    await clock.advance(10)
    expect(sounds(ran)).toContain('alarm')
    expect(await ui.find({ type: 'Text', text: /force push/ })).toBeDefined()
    await ui.unmount()
  })

  test('a permission prompt calls you with a sound and a desktop notification', async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    on('classic.Notification', () => ({}))
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
    await clock.advance(10)
    expect(sounds(ran)).toContain('attention')
    expect(ran.some(r => r.argv.join(' ').includes('ToastNotificationManager'))).toBe(true)
  })

  test('a rate limit puts it to sleep and the reset wakes Claude', async ($, on) => {
    const { clock, ran } = host(on, DUCK)
    const resetsAt = Date.parse('2026-10-03T12:05:00Z')
    const submitted: string[] = []
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { window: 200_000 },
        rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(resetsAt).toISOString() }],
      },
    }) as never)
    on('classic.StopFailure', () => ({}))
    on('prompt.submit', ($, e) => {
      submitted.push(e.text)
      return { value: { text: e.text } } as never
    })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await $.classic.StopFailure({ error: 'rate_limit' })
    await clock.advance(10)
    expect(sounds(ran)).toContain('sleep')
    expect(await ui.find({ type: 'Text', text: /back at/ })).toBeDefined()
    expect(submitted).toEqual([])

    await clock.set(resetsAt + 30_000)
    await clock.settle()
    expect(sounds(ran)).toContain('wake')
    expect(submitted.length).toBe(1)
    expect(submitted[0]).toMatch(/continue/)
    await ui.unmount()
  })

  test('/pixling pet and /pixling name change the pixling', async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(10_000)
    const pet = await $.command.run({ command: 'pixling', args: 'pet' } as never)
    expect(pet.text).toContain('You pet Quackers')
    const renamed = await $.command.run({ command: 'pixling', args: 'name Sir Quacks' } as never)
    expect(renamed.text).toContain('Sir Quacks')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Sir Quacks' })).toBeDefined()
    await ui.unmount()
  })

  test('a fresh session is awake, not dozing', { options: { band: 'minimal' } }, async ($, on) => {
    const { clock } = host(on, DUCK)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(5000)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /zz/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /\(•ᴗ•\)/ })).toBeDefined()
    await ui.unmount()
  })

  test('every species can be the stored pixling', async ($, on) => {
    host(on, null)
    for (const s of SPECIES) {
      expect(s.verbs.length).toBeGreaterThan(0)
      expect(s.past.length).toBeGreaterThan(0)
    }
  })
})
