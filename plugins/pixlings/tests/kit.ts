// The test kit's `test`, with room to run. A test that starts a whole session takes a second or two
// alone and several while the machine is busy (other suites, a game), so the kit's 5 s default
// turned load into red. A test that names its own `timeoutMs` keeps it.

import { test as kitTest } from 'claude-code/testing'
import type { TestRest } from 'claude-code/testing'

const ROOM_MS = 20_000

export const test = (name: string, ...rest: TestRest): void => {
  if (rest.length === 1) kitTest(name, { timeoutMs: ROOM_MS }, rest[0])
  else kitTest(name, { timeoutMs: ROOM_MS, ...rest[0] }, rest[1])
}
