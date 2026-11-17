import { describe, expect, mock, test } from 'claude-code/testing'

import { currentAccount } from '../hooks/route'
import { ACCOUNT_HOME, ACCOUNT_VECTORS, ROUTE_VECTORS } from './route-vectors'
import type { VectorRoute } from './route-vectors'

const BAND = {
  plugin: 'nebi-beacon',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

const HOME = '/Users/test'
const CWD = '/work/cnlsneakers'
const FILE = `${HOME}/.claude/nebi/beacons/sess-1.json`
const NEED_BACK = '#ffd23f'
const STOP_BACK = '#ff7070'

type Scripted = { answer: string; stopReason: string | null; tools: string[]; fail?: boolean }
// What each model step streams, by loop, turn and index; set just before the step runs.
const scripted = new Map<string, Scripted>()
const stepKey = (agentId: string | undefined, turnId: string, index: number) => `${agentId ?? ''}:${turnId}:${index}`

type World = {
  writes: { path: string; text: string }[]
  runs: (readonly string[])[]
  pushes: string[]
  banned: string[]
  last: () => Record<string, unknown>
}

// The engine beneath the plugin: a session in a git repo at /work/cnlsneakers
// whose file system, tools and environment the test answers.
function world(on: any, env: Record<string, string> = {}, files: Record<string, string> = {}): World {
  const w: World = { writes: [], runs: [], pushes: [], banned: [], last: () => ({}) }
  w.last = () => JSON.parse(w.writes[w.writes.length - 1]?.text ?? '{}')
  const known = new Set([`${CWD}/.git`, ...Object.keys(files)])
  mock.env(on, { HOME, ...env })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.cwd', () => ({ value: CWD }))
  on('fs.exists', (_: any, e: any) => ({ value: known.has(e.path) }))
  on('fs.read', (_: any, e: any) => {
    if (!(e.path in files)) throw new Error(`ENOENT ${e.path}`)
    return { value: files[e.path] }
  })
  on('fs.write', (_: any, e: any) => {
    w.writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('process.run', (_: any, e: any) => {
    w.runs.push(e.argv)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // Banned by CONTRACT.md: none of these may ever be called.
  for (const noun of ['model.fork', 'audio.speak', 'audio.play', 'ui.status', 'prompt.fill']) {
    on(noun, () => {
      w.banned.push(noun)
      return { value: undefined }
    })
  }
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_: any, e: any) => ({ text: e.text, origin: e.origin }))
  on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
  on('tool.call', (_: any, e: any) => {
    if (e.tool === 'PushNotification') w.pushes.push(e.message)
    return { result: 'ok' } as any
  })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('turn.step', async function* (_: any, e: any) {
    const s = scripted.get(stepKey(e.agentId, e.turnId, e.index)) ?? { answer: '', stopReason: 'end_turn', tools: [] }
    if (s.fail === true) throw new Error('API Error: 529 overloaded_error')
    if (s.answer !== '') {
      yield { kind: 'text', index: 0, text: s.answer.slice(0, 5) }
      yield { kind: 'text', index: 0, text: s.answer.slice(5) }
    }
    for (const [i, name] of s.tools.entries()) yield { kind: 'tool', index: i + 1, id: `toolu_${i}`, name }
    // No response arrived (stopReason null): nothing streams, not even a stop.
    if (s.stopReason !== null) yield { kind: 'stop', stopReason: s.stopReason, usage: null }

    return { turnId: e.turnId, index: e.index, answer: s.answer, toolUses: s.tools.map(name => ({ name, input: {} })), stopReason: s.stopReason, usage: null }
  } as any)
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return Box({ children: [] })
  })

  return w
}

type StepOptions = { stop?: string | null; tools?: string[]; agentId?: string; index?: number; fail?: boolean }

// One model step read to its end: it streams `answer` and stops for `stop`
// (end_turn by default, tool_use with tools, null for no response: the
// engine's no-request step), or with `fail` the request throws (an API error).
async function step($: any, turnId: string, answer: string, { stop, tools = [], agentId, index = 0, fail }: StepOptions = {}) {
  const stopReason = stop !== undefined ? stop : tools.length > 0 ? 'tool_use' : 'end_turn'
  scripted.set(stepKey(agentId, turnId, index), { answer, stopReason, tools, fail })
  const stream = $.turn.step({ turnId, index, model: 'claude-opus-5-5', messageCount: 2 + index, ...(agentId === undefined ? {} : { agentId }) })
  for await (const _ of stream) {
    // drained
  }

  return stream.result
}

// The engine above every plugin when Nebi presses Esc: a step naming the
// model 'esc' is cut after its first chunk, which aborts the step's signal
// for the hooks beneath. Self-contained, as an inline plugin must be.
const ESC = {
  name: 'esc',
  tier: 'prepend' as const,
  register(on: any) {
    on('turn.step', async function* (_: any, e: any, next: any) {
      if (e.model !== 'esc') return yield* next(e)
      const stream = next(e)
      const first = await stream.next()
      if (first.done !== true) yield first.value
      await stream.return(undefined)

      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
    })
  },
}

// Nebi presses Esc while a step streams (the test loads ESC): the signal aborts.
async function interruptedStep($: any, turnId: string, index = 0) {
  scripted.set(stepKey(undefined, turnId, index), { answer: 'Looking at the files now', stopReason: 'end_turn', tools: [] })
  const stream = $.turn.step({ turnId, index, model: 'esc', messageCount: 2 + index })
  for await (const _ of stream) {
    // drained
  }
}

// A stream closed before its end with no abort: no interrupt, no response.
async function abandonedStep($: any, turnId: string, index = 0) {
  scripted.set(stepKey(undefined, turnId, index), { answer: 'Looking at the files now', stopReason: 'end_turn', tools: [] })
  const stream = $.turn.step({ turnId, index, model: 'claude-opus-5-5', messageCount: 2 + index })
  await stream.next()
  await stream.return(undefined)
}

// A step whose request throws: true when the throw reached the caller.
async function failedStep($: any, turnId: string, index = 0) {
  try {
    await step($, turnId, '', { index, fail: true })
  } catch {
    return true
  }

  return false
}

// One turn: the prompt that starts it (with its origin) and the reply it ends on.
async function turn($: any, id: string, origin: string, answer: string, extra: Record<string, unknown> = {}) {
  await $.prompt.submit({ text: `prompt ${id}`, origin: { kind: origin, ...extra }, wait: false } as any)
  await $.turn.start({ text: `prompt ${id}`, turnId: id } as any)
  await step($, id, answer)
}

const rowText = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join(' | ')

const chrome = (tool: string, input: Record<string, unknown> = {}) => ({ tool: `mcp__claude-in-chrome__${tool}`, ...input }) as any

// The file's `browser` for a route, as the Stop hook's fallback writes it (verify-before-stop.mjs).
const fileBrowser = (route: VectorRoute | null) =>
  route?.deviceId ? { deviceId: route.deviceId, label: route.label ?? route.deviceId.slice(0, 8) } : null

describe('nebi-beacon', () => {
  test(`the account follows route.mjs currentAccount (${ACCOUNT_VECTORS.length} cases)`, () => {
    for (const [dir, account] of ACCOUNT_VECTORS) expect(currentAccount(dir, ACCOUNT_HOME), String(dir)).toBe(account)
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`every route.mjs vector gives the file the same account and browser (${ROUTE_VECTORS.length} cases), on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      // A world each vector rewrites: env, a file tree with its repos, the session's folder.
      const world = { cwd: '/', env: {} as Record<string, string>, files: {} as Record<string, string>, repos: [] as string[] }
      const writes: { path: string; text: string }[] = []
      on('env.get', (_: any, e: any) => ({ value: world.env[e.name] }))
      on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
      on('session.id', () => ({ value: 'sess-1' }))
      on('session.cwd', () => ({ value: world.cwd }))
      on('fs.exists', (_: any, e: any) => ({ value: e.path in world.files || world.repos.some(repo => e.path === `${repo}/.git`) }))
      on('fs.read', (_: any, e: any) => {
        const text = world.files[e.path]
        return text === undefined ? { deny: 'ENOENT' } : { value: text }
      })
      on('fs.write', (_: any, e: any) => {
        writes.push({ path: e.path, text: e.text })
        return { value: undefined }
      })
      on('ui.log', () => ({ value: undefined }))

      for (const v of ROUTE_VECTORS) {
        Object.assign(world, {
          cwd: v.cwd,
          env: { HOME: v.home, ...(v.configDir === undefined ? {} : { CLAUDE_CONFIG_DIR: v.configDir }) },
          files: { ...v.files, ...Object.fromEntries((v.gitFiles ?? []).map(dir => [`${dir}/.git`, 'gitdir: /elsewhere'])) },
          repos: v.gitDirs,
        })
        const before = writes.length
        await $.session.start({ surface, isInteractive: true, cwd: v.cwd } as any)
        expect(writes.length, v.name).toBe(before + 1)
        expect(writes.at(-1)?.path, v.name).toBe(`${v.home}/.claude/nebi/beacons/sess-1.json`)
        const file = JSON.parse(writes.at(-1)?.text ?? '{}')
        // No route still names the account, as the hook does (route ? route.account : currentAccount()).
        const account = v.expected === null ? currentAccount(v.configDir, v.home) : v.expected.account
        expect({ account: file.account, browser: file.browser }, v.name).toEqual({ account, browser: fileBrowser(v.expected) })
      }
    })

    test(`a Chrome call in any loop sets browserActiveAt, written at once only after a quiet spell, on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      await $.prompt.submit({ text: 'go', origin: { kind: 'composer' }, wait: false } as any)
      await $.turn.start({ text: 'go', turnId: 't1' } as any)
      await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
      expect(w.last().browserActiveAt).toBeUndefined()

      // The first Chrome call is written at once; it is no state change, so updatedAt stays.
      await clock.advance(5_000)
      const first = w.writes.length
      await $.tool.call(chrome('navigate', { url: 'https://admin.shopify.com', tabId: 1 }))
      expect(w.writes.length).toBe(first + 1)
      expect(w.last()).toMatchObject({ kind: 'working', browserActiveAt: 1_005_000, updatedAt: 1_000_000 })

      // Another 10 s later waits for the heartbeat.
      await clock.advance(10_000)
      const quiet = w.writes.length
      await $.tool.call(chrome('computer', { action: 'screenshot' }))
      expect(w.writes.length).toBe(quiet)
      await clock.advance(16_000)
      expect(w.writes.length).toBe(quiet + 1)
      expect(w.last().browserActiveAt).toBe(1_015_000)

      // A sub-agent's call counts too; after a quiet minute it is written at once.
      await clock.advance(60_000)
      const sub = w.writes.length
      await $.tool.call(chrome('read_page', { tabId: 1, agentId: 'a1' }))
      expect(w.writes.length).toBe(sub + 1)
      expect(w.last()).toMatchObject({ kind: 'working', browserActiveAt: 1_091_000 })

      // A /clear starts a new session: its file has no browser use until the next call.
      await $.session.end({ reason: 'clear', sessionId: 'sess-1' } as any)
      await $.prompt.submit({ text: 'next', origin: { kind: 'composer' }, wait: false } as any)
      await $.turn.start({ text: 'next', turnId: 't2' } as any)
      expect(w.last()).toMatchObject({ kind: 'working', text: 'next' })
      expect(w.last().browserActiveAt).toBeUndefined()
      expect(w.pushes).toEqual([])
    })

    test(`a ❓ status line opens an ask: one row, no buttons, one push, on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await turn($, 't1', 'composer', 'Two names fit.\n\n❓ **Need you** — pick the \x1b[31m.si\x1b[0m name')
      const badge = await ui.find({ type: 'Text', text: /NEED\sYOU/ })
      expect(badge?.props.color).toBe('black')
      expect(badge?.props.backgroundColor).toBe(NEED_BACK)
      expect(await ui.find({ type: 'Text', text: 'pick the .si name' })).toBeDefined()
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
      expect(w.pushes).toEqual(['cnlsneakers needs you: pick the .si name'])
      expect(w.banned).toEqual([])
      await ui.unmount()
    })

    test(`the ask survives a background turn that ends ✅ and clears on a composer prompt on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await turn($, 't1', 'composer', '❓ Need you — approve the theme push')
      await turn($, 't2', 'task-notification', '✅ Done — the scout finished')
      expect(await ui.find({ type: 'Text', text: 'approve the theme push' })).toBeDefined()
      expect(w.last()).toMatchObject({ kind: 'need', ask: { what: 'approve the theme push' } })

      // A peer's message does not answer it either.
      await turn($, 't3', 'peer', '⏳ Working — rs-boss asked for a check')
      expect(await ui.find({ type: 'Text', text: 'approve the theme push' })).toBeDefined()
      expect(w.pushes).toHaveLength(1)

      await $.prompt.submit({ text: 'yes, push it', origin: { kind: 'composer' }, wait: false } as any)
      expect(await ui.find({ type: 'Text', text: /NEED\sYOU/ })).toBeUndefined()
      expect(w.last().ask).toBeUndefined()
      await ui.unmount()
    })

    test(`a prompt from his phone clears the ask on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await turn($, 't1', 'composer', '❓ Need you — which account?')
      await $.prompt.submit({ text: 'b', origin: { kind: 'bridge' }, wait: false } as any)
      expect(await ui.find({ type: 'Text', text: /NEED\sYOU/ })).toBeUndefined()
      await ui.unmount()
    })

    test(`the row names a background or peer start and the wait on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await turn($, 't1', 'task-notification', '❓ Need you — log in to TikTok Seller Center')
      expect(await ui.find({ type: 'Text', text: 'log in to TikTok Seller Center · after background task' })).toBeDefined()

      await clock.advance(12 * 60_000)
      expect(await ui.find({ type: 'Text', text: 'log in to TikTok Seller Center · 12m · after background task' })).toBeDefined()

      await $.prompt.submit({ text: 'done', origin: { kind: 'composer' }, wait: false } as any)
      const peer = 'Another Claude session sent a message:\n<cross-session-message from="uds:/tmp/x.sock" from-name="cnlsneakers-c7">hi</cross-session-message>'
      await $.prompt.submit({ text: peer, origin: { kind: 'peer' }, wait: false } as any)
      await $.turn.start({ text: peer, turnId: 't2' } as any)
      await step($, 't2', '❓ Need you — ok to rename the handle?')
      expect(await ui.find({ type: 'Text', text: 'ok to rename the handle? · from cnlsneakers-c7' })).toBeDefined()
      await ui.unmount()
    })

    test(`no row while working, on ✅, ⏳, aborted or a missing status on ${surface}`, { plugins: [ESC] }, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)
      const isBare = async () => (await ui.findAll({ type: 'Text' })).length === 0

      expect(await isBare()).toBe(true)
      await $.prompt.submit({ text: 'go', origin: { kind: 'composer' }, wait: false } as any)
      await $.turn.start({ text: 'go', turnId: 't1' } as any)
      expect(await isBare()).toBe(true)
      await step($, 't1', '✅ Done — shipped')
      expect(await isBare()).toBe(true)
      await turn($, 't2', 'composer', '⏳ Working — the build runs in the background')
      expect(await isBare()).toBe(true)
      await turn($, 't3', 'composer', 'A reply with no status line.')
      expect(await isBare()).toBe(true)
      await $.turn.start({ text: 'again', turnId: 't4' } as any)
      await interruptedStep($, 't4')
      expect(await isBare()).toBe(true)

      // An open ask hides while a turn runs, by the engine's word or the beacon's own.
      await turn($, 't5', 'composer', '❓ Need you — pick a hero')
      await ui.redraw({ ...BAND.props, isWorking: true } as any)
      expect(await isBare()).toBe(true)
      await ui.redraw({ ...BAND.props } as any)
      await $.prompt.submit({ text: 'scout done', origin: { kind: 'task-notification' }, wait: false } as any)
      await $.turn.start({ text: 'scout done', turnId: 't6' } as any)
      expect(await isBare()).toBe(true)
      await step($, 't6', '✅ Done — noted')
      expect(await rowText(ui)).toMatch(/pick a hero/)

      // A survey holds the band.
      await ui.redraw({ ...BAND.props, hasSurvey: true } as any)
      expect(await isBare()).toBe(true)
      await ui.unmount()
    })

    test(`a turn that died on an API error draws a red STOPPED row on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await $.turn.start({ text: 'go', turnId: 't1' } as any)
      expect(await failedStep($, 't1')).toBe(true)
      const badge = await ui.find({ type: 'Text', text: /STOPPED/ })
      expect(badge?.props.backgroundColor).toBe(STOP_BACK)
      expect(badge?.props.color).toBe('black')
      expect(await ui.find({ type: 'Text', text: 'an API error ended the turn' })).toBeDefined()
      expect(w.last().kind).toBe('error')
      expect(w.pushes).toEqual([])

      await $.turn.start({ text: 'retry', turnId: 't2' } as any)
      expect(await ui.find({ type: 'Text', text: /STOPPED/ })).toBeUndefined()

      // A refusal ends the turn the same way, in its own words.
      await step($, 't2', '', { stop: 'refusal' })
      expect(await ui.find({ type: 'Text', text: 'the model refused' })).toBeDefined()
      expect(w.last()).toMatchObject({ kind: 'error', text: 'the model refused' })
      await ui.unmount()
    })

    test(`the row stacks under what other mods drew on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => {
        const { Box, Text } = $.ui.resolve(e)
        return Box({ children: [Text({ children: ['held: rm -rf dist'] })] })
      })
      world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await turn($, 't1', 'composer', '❓ Need you — pick a hero')
      expect(await rowText(ui)).toMatch(/held: rm -rf dist \| .NEED.YOU. \| pick a hero/)
      await ui.unmount()
    })

    test(`one push per ask, none when the model pushed that turn on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      // The model pushed in the asking turn: the beacon stays quiet.
      await $.prompt.submit({ text: 'go', origin: { kind: 'composer' }, wait: false } as any)
      await $.turn.start({ text: 'go', turnId: 't1' } as any)
      await $.tool.call({ tool: 'PushNotification', message: 'Claude needs you', status: 'proactive' } as any)
      await step($, 't1', '❓ Need you — pick a hero')
      expect(w.pushes).toEqual(['Claude needs you'])

      // A later ❓ while the ask is still open is the same ask: no push.
      await turn($, 't2', 'task-notification', '❓ Need you — still need the hero pick')
      expect(w.pushes).toHaveLength(1)

      // After his answer, a new ask pushes once.
      await turn($, 't3', 'composer', '❓ Need you — blue or green?')
      expect(w.pushes).toEqual(['Claude needs you', 'cnlsneakers needs you: blue or green?'])
      // A sub-agent's turn and push change nothing.
      await $.tool.call({ tool: 'PushNotification', message: 'scout', status: 'proactive', agentId: 'a1' } as any)
      await step($, 'x', '❓ Need you — scout', { agentId: 'a1' })
      expect(w.pushes).toEqual(['Claude needs you', 'cnlsneakers needs you: blue or green?', 'scout'])
      expect(w.banned).toEqual([])
    })

    test(`a pending AskUserQuestion is an ask in the file, with no row and one push, on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      let seen: Record<string, unknown> = {}
      let rowWhilePending = 'not drawn'
      // Answers before world()'s catch-all, so it registers first.
      on('tool.call', { tool: 'AskUserQuestion' }, async () => {
        seen = w.last()
        rowWhilePending = await rowText(ui)
        await clock.sleep(1_000)
        return { result: 'blue' } as any
      })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await $.prompt.submit({ text: 'go', origin: { kind: 'composer' }, wait: false } as any)
      await $.turn.start({ text: 'go', turnId: 't1' } as any)
      const call = $.tool.call({
        tool: 'AskUserQuestion',
        questions: [{ question: 'Which hero colour?', header: 'Hero', options: [], multiSelect: false }],
      } as any)
      await clock.settle()
      expect(seen).toMatchObject({ kind: 'need', ask: { what: 'Which hero colour?' }, askedAt: 1_000_000 })
      expect(rowWhilePending).toBe('')
      await clock.advance(1_000)
      await call
      expect(w.last().kind).toBe('working')
      expect(w.last().ask).toBeUndefined()
      expect(w.pushes).toEqual(['cnlsneakers needs you: Which hero colour?'])

      // The same turn then ends ❓: already pushed in it, so no second push.
      await step($, 't1', '❓ Need you — confirm blue', { index: 1 })
      expect(w.pushes).toHaveLength(1)
      await ui.unmount()
    })

    test(`the beacon file is v2 and goes on session.end on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      const browser = { version: 1, label: 'RapidSneakers Chrome', chromeProfile: 'Profile 3', deviceId: 'bbbbbbbb', claudeAccount: 'b' }
      const w = world(on, { CLAUDE_CONFIG_DIR: `${HOME}/.claude-max2` }, { [`${CWD}/.claude/browser.json`]: JSON.stringify(browser) })
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      expect(w.writes[0]?.path).toBe(FILE)
      expect(w.last()).toMatchObject({ version: 2, writer: 'mod', kind: 'idle' })

      await $.prompt.submit({ text: 'run the \x1b[1mad plan\x1b[0m', origin: { kind: 'composer' }, wait: false } as any)
      await $.turn.start({ text: 'run the \x1b[1mad plan\x1b[0m', turnId: 't1' } as any)
      expect(w.last()).toEqual({
        version: 2,
        writer: 'mod',
        sessionId: 'sess-1',
        project: 'cnlsneakers',
        cwd: CWD,
        account: 'b',
        browser: { deviceId: 'bbbbbbbb', label: 'RapidSneakers Chrome' },
        kind: 'working',
        text: 'run the ad plan',
        origin: 'composer',
        startedAt: 1_000_000,
        updatedAt: 1_000_000,
        heartbeatAt: 1_000_000,
      })

      await clock.advance(2_000)
      await step($, 't1', '❓ Need you — install the Google app')
      expect(w.last()).toMatchObject({ kind: 'need', text: 'install the Google app', ask: { what: 'install the Google app' }, askedAt: 1_002_000, updatedAt: 1_002_000 })

      // The heartbeat, every 30 s from the session's start, keeps the file
      // fresh with nothing changing.
      const count = w.writes.length
      await clock.advance(30_000)
      expect(w.writes.length).toBe(count + 1)
      expect(w.last().heartbeatAt).toBe(1_030_000)
      expect(w.last().updatedAt).toBe(1_002_000)

      // A /clear removes the file and stops the heartbeat; the next turn starts both again.
      await $.session.end({ reason: 'clear', sessionId: 'sess-1' } as any)
      expect(w.runs).toEqual([['rm', '-f', FILE]])
      const afterClear = w.writes.length
      await clock.advance(60_000)
      expect(w.writes.length).toBe(afterClear)
      await $.prompt.submit({ text: 'next', origin: { kind: 'composer' }, wait: false } as any)
      await $.turn.start({ text: 'next', turnId: 't2' } as any)
      expect(w.last()).toMatchObject({ kind: 'working', text: 'next' })
      expect(w.last().ask).toBeUndefined()
      const resumed = w.writes.length
      await clock.advance(30_000)
      expect(w.writes.length).toBe(resumed + 1)

      await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-1' } as any)
      expect(w.runs).toEqual([['rm', '-f', FILE], ['rm', '-f', FILE]])
    })

    test(`account a uses its default browser from browsers.json on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      const defaults = { version: 1, accounts: { a: { label: 'Main Chrome', chromeProfile: 'Default', deviceId: 'aaaaaaaa' } } }
      const w = world(on, {}, { [`${HOME}/.claude/nebi/browsers.json`]: JSON.stringify(defaults) })
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      expect(w.last()).toMatchObject({ account: 'a', browser: { deviceId: 'aaaaaaaa', label: 'Main Chrome' } })
    })

    test(`a step that calls tools leaves the turn working, with no push, on ${surface}`, { plugins: [ESC] }, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await $.prompt.submit({ text: 'go', origin: { kind: 'composer' }, wait: false } as any)
      await $.turn.start({ text: 'go', turnId: 't1' } as any)
      await step($, 't1', '❓ Need you — not the end, a tool runs next', { tools: ['Bash'] })
      await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
      expect(w.last()).toMatchObject({ kind: 'working', text: 'go' })
      expect(w.pushes).toEqual([])
      expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)

      // Esc while the step streams: interrupted, no row, no push.
      await interruptedStep($, 't1', 1)
      expect(w.last()).toMatchObject({ kind: 'stopped', text: 'interrupted' })
      expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
      expect(w.pushes).toEqual([])
      await ui.unmount()
    })

    test(`a Stop hook that blocked: the next step of the same turn reads working again on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      await turn($, 't1', 'composer', '✅ Done — edited hello.py')
      expect(w.last().kind).toBe('done')
      const before = w.writes.length
      await step($, 't1', '✅ Done — edited hello.py, checked with node --test', { index: 1 })
      expect(w.writes.slice(before).map(write => JSON.parse(write.text).kind)).toEqual(['working', 'done'])
    })

    // The live 2026-10-03 sequence: the model's end_turn step, then the
    // engine's step with no request (stopReason null, no answer, no tools).
    test(`a no-request step after a ❓ step leaves the NEED YOU row on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await turn($, 't1', 'composer', 'Want a test too?\n\n❓ Need you — add a test for hello.py?')
      await clock.advance(1_000)
      await step($, 't1', '', { stop: null, index: 1 })
      const badge = await ui.find({ type: 'Text', text: /NEED\sYOU/ })
      expect(badge?.props.backgroundColor).toBe(NEED_BACK)
      expect(await ui.find({ type: 'Text', text: 'add a test for hello.py?' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /STOPPED|API error/ })).toBeUndefined()
      expect(w.last()).toMatchObject({ kind: 'need', text: 'add a test for hello.py?', ask: { what: 'add a test for hello.py?' }, updatedAt: 1_000_000 })
      expect(w.pushes).toEqual(['cnlsneakers needs you: add a test for hello.py?'])
      await ui.unmount()
    })

    test(`a no-request step after a ✅ step leaves no row and kind done on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await turn($, 't1', 'composer', '✅ Done — edited hello.py')
      await clock.advance(1_000)
      await step($, 't1', '', { stop: null, index: 1 })
      expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
      expect(w.last()).toMatchObject({ kind: 'done', text: 'edited hello.py', updatedAt: 1_000_000 })
      expect(w.pushes).toEqual([])
      await ui.unmount()
    })

    // No inline plugin above: a close from the caller aborts nothing.
    test(`a stream closed with no abort changes nothing after ❓ or ✅ on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await turn($, 't1', 'composer', '❓ Need you — pick a hero')
      await clock.advance(1_000)
      await abandonedStep($, 't1', 1)
      expect(await ui.find({ type: 'Text', text: /NEED\sYOU/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'pick a hero' })).toBeDefined()
      expect(w.last()).toMatchObject({ kind: 'need', text: 'pick a hero', updatedAt: 1_000_000 })

      await turn($, 't2', 'composer', '✅ Done — picked')
      await clock.advance(1_000)
      await abandonedStep($, 't2', 1)
      expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
      expect(w.last()).toMatchObject({ kind: 'done', text: 'picked', updatedAt: 1_001_000 })
      expect(w.pushes).toEqual(['cnlsneakers needs you: pick a hero'])
      await ui.unmount()
    })

    test(`after a settled step: an aborted stream reads interrupted, a throw reads STOPPED, on ${surface}`, { plugins: [ESC] }, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      // Esc after a ❓: the turn ends interrupted; the open ask still draws.
      await turn($, 't1', 'composer', '❓ Need you — pick a hero')
      await clock.advance(1_000)
      await interruptedStep($, 't1', 1)
      expect(await ui.find({ type: 'Text', text: /NEED\sYOU/ })).toBeDefined()
      expect(w.last()).toMatchObject({ kind: 'need', ask: { what: 'pick a hero' }, updatedAt: 1_001_000 })

      // Esc after a ✅: interrupted, no row.
      await turn($, 't2', 'composer', '✅ Done — picked')
      await interruptedStep($, 't2', 1)
      expect(w.last()).toMatchObject({ kind: 'stopped', text: 'interrupted' })
      expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)

      // A continuation whose request throws: STOPPED.
      await turn($, 't3', 'composer', '✅ Done — edited hello.py')
      expect(await failedStep($, 't3', 1)).toBe(true)
      const badge = await ui.find({ type: 'Text', text: /STOPPED/ })
      expect(badge?.props.backgroundColor).toBe(STOP_BACK)
      expect(await ui.find({ type: 'Text', text: 'an API error ended the turn' })).toBeDefined()
      expect(w.last()).toMatchObject({ kind: 'error', text: 'an API error ended the turn' })
      expect(w.pushes).toEqual(['cnlsneakers needs you: pick a hero'])
      await ui.unmount()
    })

    test(`it leaves turn.complete to nebi-receipt on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      const w = world(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)
      await $.prompt.submit({ text: 'go', origin: { kind: 'composer' }, wait: false } as any)
      await $.turn.start({ text: 'go', turnId: 't1' } as any)
      const writes = w.writes.length

      const answer = '❓ Need you — pick a hero'
      const result = await $.turn.complete({ reason: 'answer', answer, durationMs: 1_000, isAborted: false, turnId: 't1' } as any)
      expect(result).toEqual({ text: answer })
      expect(w.writes).toHaveLength(writes)
      expect(w.pushes).toEqual([])
      expect(await ui.find({ type: 'Text', text: /NEED\sYOU/ })).toBeUndefined()
      await ui.unmount()
    })

    test(`NEBI_VERIFY=1 draws the row but sends no push and writes no beacon file on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      const w = world(on, { NEBI_VERIFY: '1' })
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)

      await turn($, 't1', 'composer', 'Want a test too?\n\n❓ **Need you** — add a test for hello.py in demo? Yes or no')
      expect(await ui.find({ type: 'Text', text: /NEED\sYOU/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'add a test for hello.py in demo? Yes or no' })).toBeDefined()

      // A pending AskUserQuestion is an ask too: still no push.
      await turn($, 't2', 'composer', '⏳ Working — asking')
      await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Which name?', header: 'Name', options: [], multiSelect: false }] } as any)

      // A Chrome call writes nothing either.
      await $.tool.call(chrome('navigate', { url: 'https://example.com' }))

      // The heartbeat still moves the row's clock; nothing reaches the folder.
      await turn($, 't3', 'composer', '❓ Need you — pick a name')
      await clock.advance(12 * 60_000)
      expect(await ui.find({ type: 'Text', text: 'pick a name · 12m' })).toBeDefined()
      await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-1' } as any)
      expect(w.pushes).toEqual([])
      expect(w.writes).toEqual([])
      expect(w.runs).toEqual([])
      expect(w.banned).toEqual([])
      await ui.unmount()
    })

    for (const value of ['0', '']) {
      test(`NEBI_VERIFY=${JSON.stringify(value)} leaves pushes and the file on, on ${surface}`, async ($, on) => {
        mock.clock(on, { now: 1_000_000 })
        const w = world(on, { NEBI_VERIFY: value })
        await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
        await turn($, 't1', 'composer', '❓ Need you — pick a hero')
        expect(w.pushes).toEqual(['cnlsneakers needs you: pick a hero'])
        expect(w.last()).toMatchObject({ kind: 'need' })
      })
    }

    for (const value of ['nebi-beacon', 'nebi-quiet, nebi-beacon', 'all']) {
      test(`NEBI_MODS_OFF=${value} makes it pass through on ${surface}`, async ($, on) => {
        const clock = mock.clock(on, { now: 1_000_000 })
        const w = world(on, { NEBI_MODS_OFF: value })
        await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
        const ui = await $.ui.mount({ ...BAND, surface } as any)

        await turn($, 't1', 'composer', '❓ Need you — pick a hero')
        await $.tool.call(chrome('navigate', { url: 'https://example.com', agentId: 'a1' }))
        await $.turn.start({ text: 'go', turnId: 't2' } as any)
        await step($, 't2', '', { stop: null })
        await clock.advance(60_000)
        await $.session.end({ reason: 'clear', sessionId: 'sess-1' } as any)
        expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
        expect(w.writes).toEqual([])
        expect(w.runs).toEqual([])
        expect(w.pushes).toEqual([])
        await ui.unmount()
      })
    }

    test(`another mod off-list leaves it on, on ${surface}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      world(on, { NEBI_MODS_OFF: 'nebi-quiet' })
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const ui = await $.ui.mount({ ...BAND, surface } as any)
      await turn($, 't1', 'composer', '❓ Need you — pick a hero')
      expect(await ui.find({ type: 'Text', text: /NEED\sYOU/ })).toBeDefined()
      await ui.unmount()
    })
  }
})
