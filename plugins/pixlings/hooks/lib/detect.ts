// Reading what Claude is doing: risky shell commands, test runs and their outcome, which tool is
// busy, and when a rate-limit window opens again.

import type { Icon } from './canvas.ts'

export type Risk = { level: 'danger' | 'spicy'; label: string }

const RISKS: readonly { pattern: RegExp; risk: Risk }[] = [
  { pattern: /\brm\s+(?:-[a-zA-Z]*\s+)*-[a-zA-Z]*(?:r[a-zA-Z]*f|f[a-zA-Z]*r)\b/, risk: { level: 'danger', label: 'rm -rf' } },
  { pattern: /\brm\s+(?:.*\s)?--recursive\b.*--force\b|\brm\s+(?:.*\s)?--force\b.*--recursive\b/, risk: { level: 'danger', label: 'rm -rf' } },
  { pattern: /\bRemove-Item\b(?=.*-Recurse)(?=.*-Force)/i, risk: { level: 'danger', label: 'Remove-Item -Recurse -Force' } },
  { pattern: /\bgit\s+push\b.*(?:\s--force(?!-with-lease)\b|\s-f\b)/, risk: { level: 'danger', label: 'force push' } },
  { pattern: /\bgit\s+push\b.*--force-with-lease\b/, risk: { level: 'spicy', label: 'force-with-lease push' } },
  { pattern: /\bgit\s+reset\s+(?:.*\s)?--hard\b/, risk: { level: 'danger', label: 'git reset --hard' } },
  { pattern: /\bgit\s+clean\s+(?:-[a-zA-Z]*f|.*--force)/, risk: { level: 'danger', label: 'git clean -f' } },
  { pattern: /\bgit\s+checkout\s+--\s+\./, risk: { level: 'danger', label: 'git checkout -- .' } },
  { pattern: /\bgit\s+branch\s+-D\b/, risk: { level: 'spicy', label: 'git branch -D' } },
  { pattern: /\bgit\s+stash\s+(?:drop|clear)\b/, risk: { level: 'spicy', label: 'git stash drop' } },
  { pattern: /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, risk: { level: 'danger', label: 'DROP TABLE' } },
  { pattern: /\bDELETE\s+FROM\s+\w+\s*(?:;|$)/i, risk: { level: 'danger', label: 'DELETE without WHERE' } },
  { pattern: /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/, risk: { level: 'spicy', label: 'curl | sh' } },
  { pattern: /\bchmod\s+(?:-R\s+)?777\b/, risk: { level: 'spicy', label: 'chmod 777' } },
  { pattern: /\b(?:mkfs(?:\.\w+)?|dd\s+if=)/, risk: { level: 'danger', label: 'disk write' } },
  { pattern: /\bsudo\b/, risk: { level: 'spicy', label: 'sudo' } },
  { pattern: /\b(?:terraform|tofu)\s+destroy\b/, risk: { level: 'danger', label: 'terraform destroy' } },
  { pattern: /\bkubectl\s+delete\b/, risk: { level: 'danger', label: 'kubectl delete' } },
  { pattern: /\bdocker\s+(?:system|volume|image)\s+prune\b/, risk: { level: 'spicy', label: 'docker prune' } },
  { pattern: /\bnpm\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b/, risk: { level: 'spicy', label: 'publish' } },
]

/** The most serious risk a shell command carries, or null. */
export const riskOf = (command: string): Risk | null => {
  let found: Risk | null = null
  for (const { pattern, risk } of RISKS) {
    if (pattern.test(command)) {
      if (risk.level === 'danger') return risk
      found ??= risk
    }
  }
  return found
}

const TEST_COMMAND =
  /(?:^|[\s;&|(])(?:pytest|py\.test|python3?\s+-m\s+(?:pytest|unittest)|jest|vitest|mocha|ava|playwright\s+test|cypress\s+run|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test(?::\S+)?|bun\s+test|deno\s+test|cargo\s+(?:test|nextest)|go\s+test|rspec|phpunit|pest|dotnet\s+test|mvn\s+(?:\S+\s+)*test|gradlew?\s+(?:\S+\s+)*test|mix\s+test|ctest|tox|nox|swift\s+test|zig\s+build\s+test|claude\s+plugin\s+test)(?=$|[\s;&|)])/

export const isTestCommand = (command: string): boolean => TEST_COMMAND.test(command)

export type TestOutcome = { status: 'pass' | 'fail'; passed: number | null; failed: number | null }

const num = (m: RegExpMatchArray | null, i = 1): number | null => (m ? Number(m[i]) : null)

/** Reads a test run's output: counts where the runner prints them, else the exit status. */
export const testOutcome = (output: string, isError: boolean): TestOutcome => {
  const text = output.slice(-20_000)
  // pytest: "3 failed, 41 passed in 1.2s"
  const pyFailed = num(text.match(/(\d+) failed/))
  const pyPassed = num(text.match(/(\d+) passed/))
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
