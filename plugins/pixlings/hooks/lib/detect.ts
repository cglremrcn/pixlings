// Reading what Claude is doing: risky shell commands, test runs and their outcome, which tool is
// busy, and when a rate-limit window opens again.

import type { Icon } from './canvas.ts'

export type Risk = { level: 'danger' | 'spicy'; label: string }

// The shell line ------------------------------------------------------------------------------
// A small tokenizer: quotes become plain words, heredoc bodies are kept apart, and $(…), `…` and
// <(…) are read as commands of their own. Risks and test runs are judged by the program at
// command position, never by text that only mentions one. It reads each character once.

type Simple = { words: string[]; bodies: string[] }
type Pipeline = Simple[]

const MAX_DEPTH = 8

const closeParen = (src: string, open: number): number => {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src.charAt(i)
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i + 1
  }
  return src.length
}

const closeTick = (src: string, from: number): number => {
  let i = from
  while (i < src.length && src.charAt(i) !== '`') i += src.charAt(i) === '\\' ? 2 : 1
  return Math.min(i, src.length)
}

/** Reads `src` from `start` into pipelines; in a $(…) it stops after the closing paren. */
const scan = (src: string, start: number, depth: number, inSub: boolean, out: Pipeline[]): number => {
  let pipe: Pipeline = []
  let seg: Simple = { words: [], bodies: [] }
  let word = ''
  let inWord = false
  let next: 'arg' | 'skip' | 'body' = 'arg'
  let parens = 0
  const pending: { delim: string; strip: boolean; seg: Simple }[] = []

  const endWord = (): void => {
    if (inWord) {
      if (next === 'arg') seg.words.push(word)
      else if (next === 'body') seg.bodies.push(word)
      next = 'arg'
    }
    word = ''
    inWord = false
  }
  const endSeg = (): void => {
    endWord()
    next = 'arg'
    if (seg.words.length > 0 || seg.bodies.length > 0) pipe.push(seg)
    seg = { words: [], bodies: [] }
  }
  const endPipe = (): void => {
    endSeg()
    if (pipe.length > 0) out.push(pipe)
    pipe = []
  }
  const sub = (from: number): number =>
    depth < MAX_DEPTH ? scan(src, from, depth + 1, true, out) : closeParen(src, from - 1)
  const backtick = (from: number): number => {
    const end = closeTick(src, from)
    if (depth < MAX_DEPTH) scan(src.slice(from, end), 0, depth + 1, false, out)
    return end + 1
  }

  const doubleQuoted = (from: number): number => {
    let k = from
    while (k < src.length) {
      const d = src.charAt(k)
      if (d === '"') break
      if (d === '\\') {
        const e = src.charAt(k + 1)
        if (e === '\n') k += 2
        else if (e !== '' && '$`"\\'.includes(e)) {
          word += e
          k += 2
        } else {
          word += d
          k++
        }
      } else if (d === '$' && src.charAt(k + 1) === '(') {
        k = src.charAt(k + 2) === '(' ? closeParen(src, k + 1) : sub(k + 2)
      } else if (d === '`') {
        k = backtick(k + 1)
      } else {
        word += d
        k++
      }
    }
    inWord = true
    return k + 1
  }

  const delimiter = (from: number, strip: boolean): number => {
    let k = from
    while (src.charAt(k) === ' ' || src.charAt(k) === '\t') k++
    let delim = ''
    for (; k < src.length; k++) {
      const d = src.charAt(k)
      if (' \t\r\n;&|<>()'.includes(d)) break
      if (d !== "'" && d !== '"' && d !== '\\') delim += d
    }
    if (delim) pending.push({ delim, strip, seg })
    return k
  }

  const heredocs = (from: number): number => {
    let k = from
    for (const doc of pending) {
      const lines: string[] = []
      while (k < src.length) {
        const nl = src.indexOf('\n', k)
        const end = nl < 0 ? src.length : nl
        const line = src.slice(k, end)
        const bare = (doc.strip ? line.replace(/^\t+/, '') : line).replace(/\r$/, '')
        if (bare === doc.delim) {
          k = end + 1
          break
        }
        if (inSub && bare.startsWith(doc.delim + ')')) {
          k += line.indexOf(doc.delim) + doc.delim.length
          break
        }
        lines.push(line)
        k = end + 1
      }
      doc.seg.bodies.push(lines.join('\n'))
    }
    pending.length = 0
    return Math.min(k, src.length)
  }

  const plain = /[^\s\\'"`$#;&|()<>]+/y
  let i = start
  while (i < src.length) {
    plain.lastIndex = i
    if (plain.test(src)) {
      word += src.slice(i, plain.lastIndex)
      inWord = true
      i = plain.lastIndex
      continue
    }
    const c = src.charAt(i)
    const n = src.charAt(i + 1)
    if (c === '\\') {
      if (n === '\r' && src.charAt(i + 2) === '\n') i++
      else if (n !== '\n') {
        word += n
        inWord = true
      }
      i += 2
    } else if (c === "'") {
      const close = src.indexOf("'", i + 1)
      const end = close < 0 ? src.length : close
      word += src.slice(i + 1, end)
      inWord = true
      i = end + 1
    } else if (c === '"') {
      i = doubleQuoted(i + 1)
    } else if (c === '`') {
      // PowerShell continues a line with a trailing backtick.
      if (n === '\n') i += 2
      else if (n === '\r' && src.charAt(i + 2) === '\n') i += 3
      else {
        i = backtick(i + 1)
        inWord = true
      }
    } else if (c === '$' && n === '(') {
      i = src.charAt(i + 2) === '(' ? closeParen(src, i + 1) : sub(i + 2)
      inWord = true
    } else if (c === '$' && n === '{') {
      const close = src.indexOf('}', i + 2)
      const end = close < 0 ? src.length : close + 1
      word += src.slice(i, end)
      inWord = true
      i = end
    } else if (c === '#' && !inWord) {
      const nl = src.indexOf('\n', i)
      i = nl < 0 ? src.length : nl
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
      i++
    } else if (c === '\n') {
      endWord()
      i = pending.length > 0 ? heredocs(i + 1) : i + 1
      // A line that ends in a pipe goes on below.
      if (seg.words.length > 0 || pipe.length === 0) endPipe()
    } else if (c === ';') {
      endPipe()
      i++
    } else if (c === '&' && n === '>') {
      endWord()
      i += src.charAt(i + 2) === '>' ? 3 : 2
      next = 'skip'
    } else if (c === '&') {
      endPipe()
      i += n === '&' ? 2 : 1
    } else if (c === '|') {
      if (n === '|') endPipe()
      else endSeg()
      i += n === '|' || n === '&' ? 2 : 1
    } else if (c === '(') {
      endPipe()
      parens++
      i++
    } else if (c === ')') {
      endPipe()
      i++
      if (inSub && parens === 0) return i
      parens = Math.max(0, parens - 1)
    } else if ((c === '<' || c === '>') && n === '(') {
      i = sub(i + 2)
      inWord = true
    } else if (c === '<' || c === '>') {
      if (inWord && /^\d+$/.test(word)) {
        word = ''
        inWord = false
      } else endWord()
      if (c === '<' && n === '<' && src.charAt(i + 2) === '<') {
        i += 3
        next = 'body'
      } else if (c === '<' && n === '<') {
        const strip = src.charAt(i + 2) === '-'
        i = delimiter(i + (strip ? 3 : 2), strip)
      } else {
        i++
        if (src.charAt(i) === c) i++
        const d = src.charAt(i)
        if (d === '&' || d === '|' || (c === '<' && d === '>')) i++
        next = 'skip'
      }
    } else {
      word += c
      inWord = true
      i++
    }
  }
  endPipe()
  return i
}

type Command = { program: string; argv: string[]; bodies: string[]; sudo: boolean; script: boolean }

const ASSIGNMENT = /^[A-Za-z_]\w*\+?=/
const KEYWORDS = new Set(['!', '{', '}', 'if', 'then', 'elif', 'else', 'while', 'until', 'do'])
// Programs that run the rest of their line, with their short options that take a value.
const WRAPPERS: ReadonlyMap<string, string> = new Map([
  ['sudo', 'ugpChDrtUT'],
  ['doas', 'uC'],
  ['env', 'uCS'],
  ['time', 'fo'],
  ['nohup', ''],
  ['exec', 'a'],
  ['command', ''],
  ['builtin', ''],
  ['nice', 'n'],
  ['ionice', 'cnp'],
  ['timeout', 'sk'],
  ['xargs', 'IPLnsdEa'],
  ['stdbuf', 'ioe'],
  ['cross-env', ''],
  ['dotenv', 'ecv'],
  ['xvfb-run', 'nsfep'],
])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd'])

const programOf = (word: string): string => {
  const name = word.slice(Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\')) + 1).toLowerCase()
  return name.includes('.') ? name.replace(/\.(?:exe|cmd|bat|ps1)$/, '') : name
}

/** Drops assignments, keywords and wrappers like sudo, env and xargs off the front. */
const unwrap = (words: readonly string[]): { program: string; argv: string[]; sudo: boolean } => {
  let i = 0
  let sudo = false
  let program = ''
  while (i < words.length) {
    const word = words[i] ?? ''
    if ((word.includes('=') && ASSIGNMENT.test(word)) || KEYWORDS.has(word)) {
      i++
      continue
    }
    program = programOf(word)
    const valued = WRAPPERS.get(program)
    if (valued === undefined) break
    if (program === 'command' && /^-[vV]/.test(words[i + 1] ?? '')) break
    if (program === 'sudo' || program === 'doas') sudo = true
    const wrapper = program
    program = ''
    i++
    while (i < words.length) {
      const opt = words[i] ?? ''
      if (!opt.startsWith('-') || opt === '-') break
      i++
      if (opt === '--') break
      if (opt.length === 2 && valued.includes(opt.charAt(1))) i++
    }
    if (wrapper === 'timeout') i++
  }
  return { program, argv: words.slice(i), sudo }
}

/** The script a command hands to another shell: `bash -c "…"`, `eval …`, `ssh host …`. */
const scriptOf = (program: string, argv: readonly string[]): string | null => {
  if (program === 'eval') return argv.slice(1).join(' ')
  if (program === 'ssh') {
    let j = 1
    while ((argv[j] ?? '').startsWith('-')) {
      const opt = argv[j] ?? ''
      j += opt.length === 2 && 'bcDEeFIiJLlmOoPpQRSWw'.includes(opt.charAt(1)) ? 2 : 1
    }
    return argv.slice(j + 1).join(' ') || null
  }
  // `docker exec web sh -c …`: the shell sits near the front.
  for (let k = 0; k < Math.min(argv.length, 16); k++) {
    if (!SHELLS.has(k === 0 ? program : programOf(argv[k] ?? ''))) continue
    for (let j = k + 1; j < Math.min(argv.length, k + 5); j++) {
      const flag = argv[j] ?? ''
      if (/^(?:-[a-z]*c|-command|\/[ck])$/i.test(flag)) return argv[j + 1] ?? null
      if (!/^[-/]/.test(flag)) break
    }
  }
  return null
}

/** The command `find … -exec` runs. */
const execOf = (program: string, argv: readonly string[]): string[] | null => {
  if (program !== 'find') return null
  const at = argv.findIndex(a => /^-(?:exec|execdir|ok|okdir)$/.test(a))
  if (at < 0) return null
  const end = argv.findIndex((a, i) => i > at && (a === ';' || a === '+'))
  return argv.slice(at + 1, end < 0 ? argv.length : end)
}

const pipelinesOf = (src: string, depth = 0): Command[][] => {
  const raw: Pipeline[] = []
  scan(src, 0, depth, false, raw)
  const out: Command[][] = []
  for (const pipe of raw) {
    const commands: Command[] = []
    for (const seg of pipe) {
      const { program, argv, sudo } = unwrap(seg.words)
      const script = depth < MAX_DEPTH ? scriptOf(program, argv) : null
      commands.push({ program, argv, bodies: seg.bodies, sudo, script: script !== null })
      const exec = execOf(program, argv)
      if (exec) out.push([{ ...unwrap(exec), bodies: [], script: false }])
      if (script) out.push(...pipelinesOf(script, depth + 1))
    }
    out.push(commands)
  }
  return out
}

// One tool call asks about the same line several times (icon, risk, test run): parse it once.
let last: { src: string; pipelines: Command[][] } = { src: '', pipelines: [] }
const parsed = (src: string): Command[][] => {
  if (last.src !== src) last = { src, pipelines: pipelinesOf(src) }
  return last.pipelines
}

/** Each simple command in a shell line as [program, ...args], wrappers like sudo and env dropped. */
export const commandsOf = (command: string): string[][] =>
  parsed(command).flatMap(p => p.map(c => [...c.argv])).filter(argv => argv.length > 0)

// Risks ---------------------------------------------------------------------------------------

const danger = (label: string): Risk => ({ level: 'danger', label })
const spicy = (label: string): Risk => ({ level: 'spicy', label })

const RM_RF = danger('rm -rf')
const REMOVE_ITEM = danger('Remove-Item -Recurse -Force')
const RMDIR = danger('rmdir /s /q')
const FORCE_PUSH = danger('force push')
const LEASE_PUSH = spicy('force-with-lease push')
const RESET_HARD = danger('git reset --hard')
const CLEAN = danger('git clean -f')
const CHECKOUT_DOT = danger('git checkout -- .')
const RESTORE_DOT = danger('git restore .')
const BRANCH_D = spicy('git branch -D')
const STASH_DROP = spicy('git stash drop')
const DROP_TABLE = danger('DROP TABLE')
const DELETE_ALL = danger('DELETE without WHERE')
const CURL_SH = spicy('curl | sh')
const CHMOD = spicy('chmod 777')
const DISK = danger('disk write')
const SUDO = spicy('sudo')
const TERRAFORM = danger('terraform destroy')
const KUBECTL = danger('kubectl delete')
const DOCKER_PRUNE = spicy('docker prune')
const PUBLISH = spicy('publish')

// When a line carries several, the first danger in this order wins, else the first spicy one.
const RANKED: readonly Risk[] = [
  RM_RF, REMOVE_ITEM, RMDIR, FORCE_PUSH, LEASE_PUSH, RESET_HARD, CLEAN, CHECKOUT_DOT, RESTORE_DOT,
  BRANCH_D, STASH_DROP, DROP_TABLE, DELETE_ALL, CURL_SH, CHMOD, DISK, SUDO, TERRAFORM, KUBECTL,
  DOCKER_PRUNE, PUBLISH,
]

const SQL_CLIENTS = new Set([
  'psql', 'mysql', 'mariadb', 'sqlite3', 'sqlcmd', 'duckdb', 'clickhouse-client', 'mongosh',
  'pgcli', 'mycli', 'litecli', 'usql', 'invoke-sqlcmd', 'snowsql', 'cockroach',
])
// Programs whose arguments are text: SQL there is a search, a message or a note, unless the
// text is piped into a database client.
const TEXT_PROGRAMS = new Set([
  'echo', 'printf', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'git', 'gh', 'cat', 'tee', 'sed',
  'awk', 'head', 'tail', 'less', 'more', 'find', 'ls', 'wc', 'sort', 'jq', 'man', 'write-output',
  'write-host', 'select-string',
])

const RISKY = new Set([
  'rm', 'remove-item', 'ri', 'del', 'erase', 'rd', 'rmdir', 'git', 'chmod', 'dd', 'terraform', 'tofu',
  'kubectl', 'docker', 'npm', 'cargo', 'twine',
])

const isCluster = (arg: string, flag: string): boolean => /^-[a-zA-Z]+$/.test(arg) && arg.includes(flag)

const rmIsForced = (args: readonly string[]): boolean => {
  let recursive = false
  let force = false
  for (const arg of args) {
    if (arg === '--') break
    const flags = arg.toLowerCase()
    if (flags === '--recursive' || (/^-[a-z]{3,}$/.test(flags) && 'recurse'.startsWith(flags.slice(1)))) {
      recursive = true
    } else if (flags === '--force' || (/^-[a-z]{3,}$/.test(flags) && 'force'.startsWith(flags.slice(1)))) {
      force = true
    } else if (/^-[^-]/.test(flags)) {
      if (flags.includes('r')) recursive = true
      if (flags.includes('f')) force = true
    }
  }
  return recursive && force
}

/** A PowerShell switch, which may be shortened to any unambiguous prefix. */
const psSwitch = (args: readonly string[], name: string, min: number): boolean =>
  args.some(arg => {
    const word = arg.toLowerCase().replace(/:.*$/, '')
    return word.length > min && word.startsWith('-') && name.startsWith(word.slice(1))
  })

/** Where git's subcommand sits among its arguments, past options like `-C dir` and `-c key=value`. */
const gitVerbAt = (args: readonly string[]): number => {
  let i = 0
  while ((args[i] ?? '').startsWith('-')) i += /^(?:-C|-c|--git-dir|--work-tree|--namespace)$/.test(args[i] ?? '') ? 2 : 1
  return i
}

const gitRisks = (args: readonly string[], found: Set<Risk>): void => {
  const i = gitVerbAt(args)
  const rest = args.slice(i + 1)
  const has = (long: string, short: string): boolean =>
    rest.some(a => a === long || (short !== '' && isCluster(a, short)))
  switch (args[i]) {
    case 'push':
      if (has('--force', 'f') || rest.some(a => a.length > 1 && a.startsWith('+'))) found.add(FORCE_PUSH)
      else if (rest.some(a => a.startsWith('--force-with-lease') || a === '--force-if-includes')) found.add(LEASE_PUSH)
      break
    case 'reset':
      if (rest.includes('--hard')) found.add(RESET_HARD)
      break
    case 'clean':
      if (has('--force', 'f') && !has('--dry-run', 'n')) found.add(CLEAN)
      break
    case 'checkout':
      if (rest.includes('.')) found.add(CHECKOUT_DOT)
      break
    case 'restore':
      if (rest.includes('.') && (!has('--staged', 'S') || has('--worktree', 'W'))) found.add(RESTORE_DOT)
      break
    case 'branch':
      if (has('', 'D')) found.add(BRANCH_D)
      break
    case 'stash':
      if (rest[0] === 'drop' || rest[0] === 'clear') found.add(STASH_DROP)
      break
  }
}

const sqlRisks = (text: string, found: Set<Risk>): void => {
  if (!/\b(?:DROP|TRUNCATE|DELETE)\s/i.test(text)) return
  if (/\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i.test(text)) found.add(DROP_TABLE)
  for (const statement of text.split(';')) {
    for (const part of statement.split(/(?=\bDELETE\s+FROM\s)/i)) {
      if (/^DELETE\s+FROM\s+\S/i.test(part) && !/\bWHERE\b/i.test(part)) found.add(DELETE_ALL)
    }
  }
}

const commandRisks = (command: Command, fed: boolean, found: Set<Risk>): void => {
  if (command.sudo) found.add(SUDO)
  const { program } = command
  const args = RISKY.has(program) ? command.argv.slice(1) : []
  if (args.length > 0) switch (program) {
    case 'rm':
      if (rmIsForced(args)) found.add(RM_RF)
      break
    case 'remove-item':
    case 'ri':
    case 'del':
    case 'erase':
    case 'rd':
    case 'rmdir':
      if (psSwitch(args, 'recurse', 1) && psSwitch(args, 'force', 2)) found.add(REMOVE_ITEM)
      else if ((program === 'rd' || program === 'rmdir') && args.some(a => /^\/s$/i.test(a)) && args.some(a => /^\/q$/i.test(a))) {
        found.add(RMDIR)
      }
      break
    case 'git':
      gitRisks(args, found)
      break
    case 'chmod':
      if (args.includes('777') || args.includes('0777')) found.add(CHMOD)
      break
    case 'dd':
      if (args.some(a => /^of=\/dev\/(?!null$|zero$|std(?:out|err)$|fd\/)/.test(a))) found.add(DISK)
      break
    case 'terraform':
    case 'tofu':
      if (args.find(a => !a.startsWith('-')) === 'destroy') found.add(TERRAFORM)
      break
    case 'kubectl':
      if (args.includes('delete')) found.add(KUBECTL)
      break
    case 'docker':
      if (/^(?:system|volume|image)$/.test(args[0] ?? '') && args[1] === 'prune') found.add(DOCKER_PRUNE)
      break
    case 'npm':
    case 'cargo':
      if (args[0] === 'publish') found.add(PUBLISH)
      break
    case 'twine':
      if (args[0] === 'upload') found.add(PUBLISH)
      break
  }
  if (program.startsWith('mkfs') && /^mkfs(?:\.\w+)?$/.test(program)) found.add(DISK)
  if (!command.script && (fed || !TEXT_PROGRAMS.has(program))) {
    sqlRisks(command.argv.join(' '), found)
    for (const body of command.bodies) sqlRisks(body, found)
  }
}

/** The most serious risk a shell command carries, or null. */
export const riskOf = (command: string): Risk | null => {
  const found = new Set<Risk>()
  for (const pipeline of parsed(command)) {
    const fed = pipeline.some(c => SQL_CLIENTS.has(c.program))
    let fetched = false
    for (const c of pipeline) {
      commandRisks(c, fed, found)
      if (fetched && (c.program === 'sh' || c.program === 'bash' || c.program === 'zsh')) found.add(CURL_SH)
      if (c.program === 'curl' || c.program === 'wget') fetched = true
    }
  }
  return RANKED.find(r => r.level === 'danger' && found.has(r)) ?? RANKED.find(r => found.has(r)) ?? null
}

// Test runs -----------------------------------------------------------------------------------

const RUNNERS = new Set(['pytest', 'py.test', 'jest', 'vitest', 'mocha', 'ava', 'rspec', 'phpunit', 'pest', 'ctest', 'tox', 'nox'])
const CONTAINERS = new Set(['docker', 'podman', 'docker-compose', 'kubectl'])
// Programs that may run tests through a subcommand or another program.
const LAUNCHERS = new Set([
  'npx', 'bunx', 'pnpx', 'npm', 'pnpm', 'yarn', 'bun', 'uv', 'poetry', 'pipenv', 'hatch', 'pdm', 'rye',
  'bundle', 'deno', 'go', 'dotnet', 'mix', 'swift', 'playwright', 'cargo', 'cypress', 'zig', 'mvn',
  'mvnw', 'gradle', 'gradlew', 'claude', ...CONTAINERS,
])
const NONE: ReadonlySet<string> = new Set()
const NPX_VALUED = new Set(['-p', '--package'])
const PM_VALUED = new Set(['--prefix', '-C', '--dir', '--filter', '-F', '-w', '--workspace', '--cwd'])
const RUN_VALUED = new Set(['--with', '--python', '-p', '--extra', '--group', '--package', '--env-file', '--directory', '--project', '--from', '-e', '--env'])

const withoutOptions = (args: readonly string[], valued: ReadonlySet<string> = NONE): string[] => {
  let i = 0
  while ((args[i] ?? '').startsWith('-')) {
    const opt = args[i] ?? ''
    i += valued.has(opt) ? 2 : 1
    if (opt === '--') break
  }
  return args.slice(i)
}

/** Whether argv invokes a test runner (not installs, looks up or mentions one). */
const runsTests = (argv: readonly string[], depth = 0, program = programOf(argv[0] ?? '')): boolean => {
  if (RUNNERS.has(program)) return true
  const isPython = program.startsWith('py') && /^(?:python[\d.]*|py)$/.test(program)
  if (depth > 3 || !(isPython || LAUNCHERS.has(program))) return false
  const args = argv.slice(1)
  const [first = '', second = ''] = args
  if (isPython) return args.some((a, i) => a === '-m' && /^(?:pytest|unittest)$/.test(args[i + 1] ?? ''))
  switch (program) {
    case 'npx':
    case 'bunx':
    case 'pnpx':
      return runsTests(withoutOptions(args, NPX_VALUED), depth + 1)
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun': {
      const rest = withoutOptions(args, PM_VALUED)
      const [verb = '', script = ''] = rest
      if (/^test(?::\S+)?$/.test(verb)) return true
      if (verb === 'run' || verb === 'run-script') return /^test(?::\S+)?$/.test(script)
      if (verb === 'exec' || verb === 'dlx' || verb === 'x') return runsTests(withoutOptions(rest.slice(1), NPX_VALUED), depth + 1)
      return RUNNERS.has(programOf(verb))
    }
    case 'uv':
    case 'poetry':
    case 'pipenv':
    case 'hatch':
    case 'pdm':
    case 'rye':
    case 'bundle':
      return (first === 'run' || first === 'exec') && runsTests(withoutOptions(args.slice(1), RUN_VALUED), depth + 1)
    case 'deno':
    case 'go':
    case 'dotnet':
    case 'mix':
    case 'swift':
    case 'playwright':
      return first === 'test'
    case 'cargo':
      return /^(?:test|nextest)$/.test(args.find(a => !a.startsWith('+')) ?? '')
    case 'cypress':
      return first === 'run'
    case 'zig':
      return first === 'build' && second === 'test'
    case 'mvn':
    case 'mvnw':
    case 'gradle':
    case 'gradlew':
      return args.includes('test')
    case 'claude':
      return first === 'plugin' && second === 'test'
  }
  if (CONTAINERS.has(program)) {
    const head = args.slice(0, 32)
    return head.some((a, i) => !CONTAINERS.has(programOf(a)) && runsTests(head.slice(i), depth + 1))
  }
  return false
}

export const isTestCommand = (command: string): boolean =>
  parsed(command).some(pipeline => pipeline.some(c => runsTests(c.argv, 0, c.program)))

/** Whether the line runs `git commit`, not merely mentions it as `echo "git commit"` does. */
export const runsGitCommit = (command: string): boolean =>
  parsed(command).some(pipeline =>
    pipeline.some(c => {
      const args = c.argv.slice(1)
      return c.program === 'git' && args[gitVerbAt(args)] === 'commit'
    }),
  )

export type TestOutcome = { status: 'pass' | 'fail'; passed: number | null; failed: number | null }

const num = (m: RegExpMatchArray | null, i = 1): number | null => (m ? Number(m[i]) : null)

/** Reads a test run's output: counts where the runner prints them, else the exit status. */
export const testOutcome = (output: string, isError: boolean): TestOutcome => {
  const text = output.slice(-20_000)
  // pytest: "3 failed, 41 passed in 1.2s", but not "1 failed to import"
  const pyFailed = num(text.match(/(?<!\d)(\d+) failed(?=\s*(?:[,;|()=]|in\s|$))/m))
  const pyPassed = num(text.match(/(?<!\d)(\d+) passed(?=\s*(?:[,;|()=]|in\s|$))/m))
  // jest/vitest: "Tests:  1 failed, 12 passed" / "Tests  2 failed | 10 passed"
  const jsFailed = num(text.match(/Tests?:?\s+(\d+) failed/))
  const jsPassed = num(text.match(/Tests?:?\s+(?:\d+ failed[,|\s]+)?(\d+) passed/))
  // cargo: "test result: FAILED. 10 passed; 2 failed"
  const cargo = text.match(/test result: \w+\. (\d+) passed; (\d+) failed/)
  // bun / claude plugin test: " 12 pass\n 0 fail"
  const bunPass = num(text.match(/^\s*(\d+) pass\s*$/m))
  const bunFail = num(text.match(/^\s*(\d+) fail\s*$/m))

  const failed = cargo ? Number(cargo[2]) : (jsFailed ?? pyFailed ?? bunFail)
  const passed = cargo ? Number(cargo[1]) : (jsPassed ?? pyPassed ?? bunPass)
  const goFailed = /^(?:FAIL|--- FAIL)/m.test(text)

  const hasFailed = isError || goFailed || (failed !== null && failed > 0)
  return { status: hasFailed ? 'fail' : 'pass', passed, failed: hasFailed ? (failed ?? null) : 0 }
}

/** The little icon over the pixling's head while a tool runs. */
export const iconFor = (tool: string, command = ''): Icon | null => {
  switch (tool) {
    case 'Read':
    case 'Grep':
    case 'Glob':
    case 'NotebookRead':
      return 'read'
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'edit'
    case 'Bash':
    case 'PowerShell':
      return isTestCommand(command) ? 'test' : 'bash'
    case 'WebFetch':
    case 'WebSearch':
      return 'web'
    case 'Agent':
    case 'Task':
      return 'agent'
    default:
      return tool.startsWith('mcp__') ? 'web' : null
  }
}

export type LimitWindow = { kind: string; percentUsed: number; resetsAt?: string }

/** The rate-limit window that is exhausted (or the fullest one), and when it opens again. */
export const blockingWindow = (
  windows: readonly LimitWindow[],
  now: number,
): { kind: string; resetsAt: number | null } | null => {
  const sorted = [...windows].sort((a, b) => b.percentUsed - a.percentUsed)
  const full = sorted.find(w => w.percentUsed >= 100) ?? null
  if (!full) return null
  const at = full.resetsAt ? Date.parse(full.resetsAt) : NaN
  return { kind: full.kind, resetsAt: Number.isFinite(at) && at > now ? at : null }
}

export const formatDuration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

export const clockTime = (at: number): string => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** File name of a tool's target, for lines like "reading auth.ts". */
export const fileOf = (input: Record<string, unknown>): string | null => {
  const path = input['file_path'] ?? input['path'] ?? input['notebook_path']
  if (typeof path !== 'string' || path === '') return null
  return path.split(/[\\/]/).pop() ?? null
}
