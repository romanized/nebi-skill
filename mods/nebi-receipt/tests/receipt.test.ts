import { describe, expect, mock, test } from 'claude-code/testing'

import { checkLabel, isCheck } from '../hooks/parts'

const CWD = '/work/nebi-skill'
const HOME = '/Users/test'
const DONE = '✅ Done — shipped'

// [command, is it a check] — the receipt's own heuristic (parts.ts, ported from
// the old nebi-beacon's isCheck), plus the two cases where it reads differently
// from that port: `node --test` counts, and a `cd tests` part does not.
const CHECKS: readonly [string, boolean][] = [
  ['cd tests && ls', false],
  ['npm test', true],
  ['cd mods && npx vitest run', true],
  ['claude plugin test nebi-beacon', true],
  ['claude plugin validate mods/nebi-receipt', true],
  ['npx -y -p typescript tsc -p mods/nebi-receipt', true],
  ['pnpm lint', true],
  ['cargo test --all', true],
  ['go test ./...', true],
  ['pytest -q', true],
  ['npm run build', true],
  ['node --test tests/*.test.mjs', true],
  ['node --experimental-strip-types --test tests/hooks.test.mjs', true],
  ['cat tests/hero.test.ts', false],
  ['ls -la tests/', false],
  ['git status', false],
  ['node scripts/check-pack.mjs', false],
  ['npm install vitest-dom', false],
  // Checks the first port missed (F12)
  ['node scripts/verify.mjs', true],
  ['node deploy.mjs --verify', true],
  ['ruff check .', true],
  ['mypy src/', true],
  ['git commit --no-verify -m x', false],
  ['cat scripts/verify.mjs', false],
  ['ruff format .', false],
  ['cat mypy.ini', false],
]

// [command, the label the receipt shows]
const LABELS: readonly [string, string][] = [
  ['cd mods && npx vitest run 2>&1 | tail -5', 'npx vitest run'],
  ['CI=1 npm test', 'npm test'],
  ['node --test tests/*.test.mjs > /tmp/out.txt', 'node --test tests/*.test.mjs'],
  ['npm run build && npm test', 'npm run build && npm test'],
  ['npx -y -p typescript tsc -p /Users/test/Documents/GitHub/nebi-skill/mods/x', 'npx -y -p typescript tsc -p /Users/test…'],
]

// A Bash command the test lets finish later: `started` resolves once the
// engine runs it, `release` lets it return.
type Gate = { started: Promise<void>; release: () => void; onStart: () => void; released: Promise<void> }

type World = {
  // Commands that exit non-zero.
  failing: Set<string>
  gates: Map<string, Gate>
  // What the engine answers a call on this file in place of running it.
  answers: Map<string, object>
}

// The engine beneath the plugin: a session at /work/nebi-skill whose tools the
// test answers. A Bash command fails when listed in `failing`.
function world(on: any, env: Record<string, string> = {}): World {
  const w: World = { failing: new Set(), gates: new Map(), answers: new Map() }
  mock.env(on, { HOME, ...env })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: CWD }))
  on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('tool.call', async (_: any, e: any) => {
    if (e.tool !== 'Bash') return w.answers.get(e.file_path) ?? { result: { ok: true } }
    const gate = w.gates.get(e.command)
    if (gate !== undefined) {
      gate.onStart()
      await gate.released
    }
    if (w.failing.has(e.command)) return { isError: true, result: 'Exit code 1', text: 'Exit code 1\nnpm ERR! Test failed.' }
    if (e.run_in_background === true) return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-1' } }

    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })

  return w
}

function gate(w: World, command: string): Gate {
  let onStart = () => {}
  let release = () => {}
  const started = new Promise<void>(resolve => (onStart = resolve))
  const released = new Promise<void>(resolve => (release = resolve))
  const made = { started, released, onStart, release }
  w.gates.set(command, made)

  return made
}

const edit = (file_path: string, extra: object = {}) => ({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b', ...extra }) as any
const write = (file_path: string, extra: object = {}) => ({ tool: 'Write', file_path, content: 'x', ...extra }) as any
const bash = (command: string, extra: object = {}) => ({ tool: 'Bash', command, ...extra }) as any
const read = (file_path: string) => ({ tool: 'Read', file_path }) as any
const answered = (turnId: string, extra: object = {}) =>
  ({ reason: 'answer', answer: DONE, durationMs: 1_000, isAborted: false, turnId, ...extra }) as any

describe('nebi-receipt', () => {
  test(`isCheck reads standalone check words per command part and counts node --test (${CHECKS.length} cases)`, () => {
    for (const [command, expected] of CHECKS) expect(isCheck(command), command).toBe(expected)
  })

  test('a check reads as its own part of the command', () => {
    for (const [command, expected] of LABELS) expect(checkLabel(command), command).toBe(expected)
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const start = ($: any) => $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

    test(`edits and a passing check give one line with a tick, on ${surface}`, async ($, on) => {
      world(on)
      await start($)
      await $.turn.start({ text: 'fix the status line', turnId: 't1' } as any)
      await $.tool.call(write(`${CWD}/claude-home/nebi/statusline.mjs`))
      await $.tool.call(edit(`${CWD}/claude-home/output-styles/nebi.md`))
      await $.tool.call(edit(`${CWD}/claude-home/nebi/statusline.mjs`))
      await $.tool.call(bash('cd tests && node --test hooks.test.mjs 2>&1 | tail -3'))

      expect(await $.turn.complete(answered('t1'))).toMatchObject({ text: 'changed statusline.mjs, nebi.md · checked node --test hooks.test.mjs ✓' })
    })

    test(`an edit with no check after it says so, on ${surface}`, async ($, on) => {
      world(on)
      await start($)
      await $.turn.start({ text: 'tweak the hero', turnId: 't1' } as any)
      await $.tool.call(edit(`${CWD}/src/hero.tsx`))
      await $.tool.call(bash('cat tests/hero.test.ts'))

      expect(await $.turn.complete(answered('t1'))).toMatchObject({ text: 'changed hero.tsx · no check since the last edit' })
    })

    test(`a failing check says which, and only the latest check counts, on ${surface}`, async ($, on) => {
      const w = world(on)
      w.failing.add('npm test')
      await start($)
      await $.turn.start({ text: 'fix the cart', turnId: 't1' } as any)
      await $.tool.call(edit(`${CWD}/src/cart.ts`))
      await $.tool.call(bash('npm run build'))
      await $.tool.call(bash('npm test'))
      expect(await $.turn.complete(answered('t1'))).toMatchObject({ text: 'changed cart.ts · check failed: npm test' })

      // Failed, then passed: the later check stands.
      await $.turn.start({ text: 'again', turnId: 't2' } as any)
      await $.tool.call(edit(`${CWD}/src/cart.ts`))
      await $.tool.call(bash('npm test'))
      await $.tool.call(bash('npx vitest run'))
      expect(await $.turn.complete(answered('t2'))).toMatchObject({ text: 'changed cart.ts · checked npx vitest run ✓' })
    })

    test(`a check before the last edit does not count, on ${surface}`, async ($, on) => {
      const w = world(on)
      await start($)
      await $.turn.start({ text: 'fix and test', turnId: 't1' } as any)
      await $.tool.call(edit(`${CWD}/src/a.ts`))
      await $.tool.call(bash('npm test'))
      await $.tool.call(edit(`${CWD}/src/b.ts`))
      expect(await $.turn.complete(answered('t1'))).toMatchObject({ text: 'changed a.ts, b.ts · no check since the last edit' })

      // A check already running when an edit lands proves nothing either.
      const slow = gate(w, 'npm test -- --slow')
      await $.turn.start({ text: 'race', turnId: 't2' } as any)
      const running = $.tool.call(bash('npm test -- --slow'))
      await slow.started
      await $.tool.call(edit(`${CWD}/src/c.ts`, { agentId: 'builder-1' }))
      slow.release()
      await running
      expect(await $.turn.complete(answered('t2'))).toMatchObject({ text: 'changed c.ts · no check since the last edit' })
    })

    test(`a read-only turn gets no line, nor do denied or errored edits, on ${surface}`, async ($, on) => {
      const w = world(on)
      w.answers.set(`${CWD}/src/denied.ts`, { deny: 'Not allowed.' })
      w.answers.set(`${CWD}/src/locked.ts`, { isError: true, result: 'EACCES', text: 'EACCES' })
      await start($)
      await $.turn.start({ text: 'what does this do?', turnId: 't1' } as any)
      await $.tool.call(read(`${CWD}/README.md`))
      await $.tool.call(bash('npm test'))
      await $.tool.call(write(`${CWD}/src/denied.ts`))
      await $.tool.call(write(`${CWD}/src/locked.ts`))

      expect(await $.turn.complete(answered('t1'))).toEqual({ text: DONE })
    })

    test(`an aborted turn gets no line and the next turn starts clean, on ${surface}`, async ($, on) => {
      world(on)
      await start($)
      await $.turn.start({ text: 'refactor', turnId: 't1' } as any)
      await $.tool.call(edit(`${CWD}/src/a.ts`))
      expect(await $.turn.complete(answered('t1', { reason: 'aborted', isAborted: true, answer: '' }))).toEqual({ text: '' })

      await $.turn.start({ text: 'never mind', turnId: 't2' } as any)
      expect(await $.turn.complete(answered('t2'))).toEqual({ text: DONE })
    })

    test(`sub-agent edits and checks count in the main turn; the sub-agent's own turn gets no line, on ${surface}`, async ($, on) => {
      world(on)
      await start($)
      await $.turn.start({ text: 'build it with a builder', turnId: 't1' } as any)
      await $.tool.call(edit(`${CWD}/mods/nebi-receipt/hooks/parts.ts`, { agentId: 'builder-1' }))
      await $.tool.call(bash('claude plugin test mods/nebi-receipt', { agentId: 'builder-1' }))
      expect(await $.turn.complete(answered('t1', { agentId: 'builder-1', answer: 'built' }))).toEqual({ text: 'built' })

      expect(await $.turn.complete(answered('t1'))).toMatchObject({ text: 'changed parts.ts · checked claude plugin test mods/nebi-receipt ✓' })
    })

    test(`more than three files show +N; shared names show their paths; escapes are stripped, on ${surface}`, async ($, on) => {
      world(on)
      await start($)
      await $.turn.start({ text: 'big change', turnId: 't1' } as any)
      for (const name of ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']) await $.tool.call(edit(`${CWD}/src/${name}`))
      await $.tool.call(bash('npm test'))
      expect(await $.turn.complete(answered('t1'))).toMatchObject({ text: 'changed a.ts, b.ts, c.ts +2 · checked npm test ✓' })

      await $.turn.start({ text: 'two index files', turnId: 't2' } as any)
      await $.tool.call(edit(`${CWD}/src/index.ts`))
      await $.tool.call(edit(`${HOME}/.claude/index.ts`))
      await $.tool.call({ tool: 'NotebookEdit', notebook_path: `${CWD}/nb/\x1b[31mred\x1b[0m.ipynb`, new_source: 'x' } as any)
      expect(await $.turn.complete(answered('t2'))).toMatchObject({ text: 'changed src/index.ts, ~/.claude/index.ts, red.ipynb · no check since the last edit' })
    })

    test(`a check still running in the background is not a pass, on ${surface}`, async ($, on) => {
      world(on)
      await start($)
      await $.turn.start({ text: 'run the suite', turnId: 't1' } as any)
      await $.tool.call(edit(`${CWD}/src/a.ts`))
      await $.tool.call(bash('npm test', { run_in_background: true }))

      expect(await $.turn.complete(answered('t1'))).toMatchObject({ text: 'changed a.ts · check not finished: npm test' })
    })

    for (const value of ['all', 'nebi-beacon, nebi-receipt'])
      test(`NEBI_MODS_OFF=${value} leaves every turn untouched, on ${surface}`, async ($, on) => {
        world(on, { NEBI_MODS_OFF: value })
        await start($)
        await $.turn.start({ text: 'edit', turnId: 't1' } as any)
        await $.tool.call(edit(`${CWD}/src/a.ts`))
        await $.tool.call(bash('npm test'))

        expect(await $.turn.complete(answered('t1'))).toEqual({ text: DONE })
      })

    test(`NEBI_MODS_OFF naming another mod keeps the receipt, on ${surface}`, async ($, on) => {
      world(on, { NEBI_MODS_OFF: 'nebi-beacon' })
      await start($)
      await $.turn.start({ text: 'edit', turnId: 't1' } as any)
      await $.tool.call(edit(`${CWD}/src/a.ts`))

      expect(await $.turn.complete(answered('t1'))).toMatchObject({ text: 'changed a.ts · no check since the last edit' })
    })
  }
})
