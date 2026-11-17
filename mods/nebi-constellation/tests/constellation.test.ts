import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BROWSER_ACTIVE_MS, HOLD_STALE_MS, HOOK_STALE_MS, MOD_STALE_MS, cells, clashLabel, parseBeacon, parseHold, toastText, waitingLabel } from '../hooks/peers'
import { HOME as VECTOR_HOME, ROUTE_VECTORS } from './route-vectors'

const PLUGIN = 'nebi-constellation'
const HOME = '/Users/n'
const DIR = `${HOME}/.claude/nebi/beacons`
const OWN = '0000aaaa-own-session'
const BOSS = 'b0551111-rs-boss'
const SITE = '5173e222-rs-website'
const K24 = 'k24c3333-k24-content'
const IDLE = '1d1e4444-idle'
const T0 = 1_790_930_000_000
const MIN = 60_000
const RS = { deviceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', label: 'RapidSneakers Chrome' }
const MAIN = { deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', label: 'Main Chrome' }
const DEFAULTS = `${HOME}/.claude/nebi/browsers.json`

const chrome = (tool: string, input: Record<string, unknown> = {}) => ({ tool: `mcp__claude-in-chrome__${tool}`, ...input }) as any

type Beacon = Record<string, unknown>

// A v1 beacon as nebi-beacon 0.1 wrote it.
const v1 = (id: string, cwd: string, kind: string, at: number, extra: Beacon = {}): Beacon => ({
  version: 1,
  sessionId: id,
  project: cwd.split('/').pop(),
  cwd,
  kind,
  text: `${kind} text`,
  startedAt: at - MIN,
  updatedAt: at,
  heartbeatAt: at,
  ...extra,
})

// A v2 beacon (CONTRACT), written by the mod unless `writer` says hook.
const v2 = (id: string, cwd: string, kind: string, at: number, extra: Beacon = {}): Beacon => ({
  ...v1(id, cwd, kind, at),
  version: 2,
  writer: 'mod',
  account: 'a',
  browser: MAIN,
  origin: 'composer',
  ...extra,
})

const hold = (id: string, cwd: string, at: number, what: string): Beacon => ({
  version: 1,
  sessionId: id,
  project: cwd.split('/').pop(),
  cwd,
  account: 'b',
  what,
  heldAt: at,
})

// The world beneath the mod: a beacon folder, project folders, the clock, a
// toast and status spy, and the SessionMode labels as the engine receives them.
// `defaults` ships browsers.json: account a on Main Chrome, b on RapidSneakers.
function engine(on: On, { cwd = '/Users/n/nebi-skill', env = {} as Record<string, string>, defaults = false } = {}) {
  const clock = mock.clock(on, { now: T0 })
  mock.env(on, { HOME, ...env })
  const files: Record<string, string> = {}
  if (defaults) files[DEFAULTS] = JSON.stringify({ version: 1, accounts: { a: { ...MAIN, chromeProfile: 'Default' }, b: { ...RS, chromeProfile: 'Profile 3' } } })
  const dirs = new Set<string>()
  const seen = { toasts: [] as string[], statuses: [] as unknown[], commands: [] as string[], lists: 0, modes: [] as readonly string[] }

  const put = (name: string, data: Beacon | string) => {
    files[`${DIR}/${name}`] = typeof data === 'string' ? data : JSON.stringify(data)
  }
  const drop = (name: string) => delete files[`${DIR}/${name}`]
  // A project folder: its git root and, when given, its browser.json.
  const project = (root: string, browser?: typeof RS) => {
    dirs.add(`${root}/.git`)
    if (browser) files[`${root}/.claude/browser.json`] = JSON.stringify({ version: 1, chromeProfile: 'Profile 3', claudeAccount: 'b', ...browser })
  }

  on('fs.list', (_, e) => {
    seen.lists++
    if (e.path !== DIR) return { deny: 'ENOENT: no such directory' }
    const names = Object.keys(files).filter(p => p.startsWith(`${DIR}/`))
    return { value: names.map(p => ({ name: p.slice(DIR.length + 1), kind: 'file' as const, size: files[p]!.length, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.exists', (_, e) => ({ value: dirs.has(e.path) || e.path in files }))
  on('session.start', (_, e) => ({ cwd: e.cwd }) as any)
  on('session.id', () => ({ value: OWN }))
  on('session.cwd', () => ({ value: cwd }))
  on('command.register', (_, e) => {
    seen.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_, e) => {
    seen.statuses.push(e.text)
    return { value: undefined }
  })
  on('tool.call', () => ({ result: 'ok' }) as any)
  on('ui.render', ($, e) => {
    if (e.component === 'SessionMode') seen.modes = e.props.modes
    return $.ui.resolve(e).Box({ children: [] })
  })

  return { clock, seen, put, drop, project }
}

// The route vectors' world, which each vector rewrites: env, files, repos and
// the session's folder; the footer's labels as the engine receives them.
function vectorEngine(on: On) {
  const clock = mock.clock(on, { now: T0 })
  const world = { cwd: '/', env: {} as Record<string, string>, files: {} as Record<string, string>, repos: [] as string[] }
  const seen = { modes: [] as readonly string[] }
  const dir = `${VECTOR_HOME}/.claude/nebi/beacons`
  on('env.get', (_, e) => ({ value: world.env[e.name] }))
  on('fs.list', (_, e) => {
    if (e.path !== dir) return { deny: 'ENOENT: no such directory' }
    const names = Object.keys(world.files).filter(p => p.startsWith(`${dir}/`))
    return { value: names.map(p => ({ name: p.slice(dir.length + 1), kind: 'file' as const, size: world.files[p]!.length, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    const text = world.files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.exists', (_, e) => ({ value: e.path in world.files || world.repos.some(repo => e.path === `${repo}/.git`) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }) as any)
  on('session.id', () => ({ value: OWN }))
  on('session.cwd', () => ({ value: world.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', () => ({ result: 'ok' }) as any)
  on('ui.render', ($, e) => {
    if (e.component === 'SessionMode') seen.modes = e.props.modes
    return $.ui.resolve(e).Box({ children: [] })
  })

  return { clock, world, seen, dir }
}

// The footer's mode labels on a surface, with the engine's own `focus` first.
async function labels($: any, seen: { modes: readonly string[] }, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'SessionMode', props: { modes: ['focus'] } })
  const modes = [...seen.modes]
  await ui.unmount()

  return modes
}

describe('nebi-constellation', () => {
  test('v1 and v2 beacons parse, escapes are stripped, mislabeled and garbled files are dropped', () => {
    const one = parseBeacon(JSON.stringify(v1(BOSS, '/Users/n/rs-boss', 'need', T0, { ask: { what: '\x1b[31mpick\x1b[0m the\u0007 hero' } })), BOSS, T0)
    expect(one).toEqual({ id: BOSS, project: 'rs-boss', cwd: '/Users/n/rs-boss', account: null, browser: null, activeAt: null, kind: 'need', what: 'pick the hero', since: T0 })

    const two = parseBeacon(JSON.stringify(v2(SITE, '/Users/n/cnlsneakers', 'need', T0, { account: 'b', browser: RS, askedAt: T0 - 12 * MIN, ask: { what: 'ship it?' } })), SITE, T0)
    expect(two).toMatchObject({ project: 'cnlsneakers', account: 'b', browser: RS, activeAt: null, kind: 'need', what: 'ship it?', since: T0 - 12 * MIN })

    // browserActiveAt counts from a v2 beacon only.
    expect(parseBeacon(JSON.stringify(v2(SITE, '/x', 'working', T0, { browserActiveAt: T0 - MIN })), SITE, T0)?.activeAt).toBe(T0 - MIN)
    expect(parseBeacon(JSON.stringify(v1(SITE, '/x', 'working', T0, { browser: MAIN, browserActiveAt: T0 - MIN })), SITE, T0)?.activeAt).toBeNull()
    expect(parseBeacon(JSON.stringify(v2(SITE, '/x', 'working', T0, { browserActiveAt: 'soon' })), SITE, T0)?.activeAt).toBeNull()

    expect(parseBeacon(JSON.stringify(v1(BOSS, '/x', 'working', T0)), 'someone-else', T0)).toBeNull()
    expect(parseBeacon('{"version": 2, "sessionId": ', BOSS, T0)).toBeNull()
    expect(parseBeacon(JSON.stringify(v1(BOSS, '/x', 'dancing', T0)), BOSS, T0)).toBeNull()
    expect(parseBeacon(JSON.stringify({ ...v2(BOSS, '/x', 'done', T0), writer: undefined }), BOSS, T0)).toBeNull()
    expect(parseBeacon(JSON.stringify({ ...v2(BOSS, '/x', 'done', T0), version: 3 }), BOSS, T0)).toBeNull()
  })

  test('staleness: a mod file past 90 s, a hook file past 12 h, a hold past 15 min', () => {
    const mod = (age: number) => parseBeacon(JSON.stringify(v2(K24, '/x', 'done', T0 - age)), K24, T0)
    expect(MOD_STALE_MS).toBe(90_000)
    expect(mod(89_000)).not.toBeNull()
    expect(mod(91_000)).toBeNull()
    expect(parseBeacon(JSON.stringify(v1(K24, '/x', 'done', T0 - 91_000)), K24, T0)).toBeNull()

    // A hook writes no heartbeat; its updatedAt counts, for 12 hours.
    const hook = (age: number) =>
      parseBeacon(JSON.stringify({ ...v2(K24, '/x', 'done', T0 - age), writer: 'hook', heartbeatAt: undefined }), K24, T0)
    expect(HOOK_STALE_MS).toBe(12 * 60 * MIN)
    expect(hook(11 * 60 * MIN)).toMatchObject({ kind: 'done' })
    expect(hook(13 * 60 * MIN)).toBeNull()

    const held = (age: number) => parseHold(JSON.stringify(hold(BOSS, '/Users/n/rs-boss', T0 - age, 'rm -rf dist')), BOSS, T0)
    expect(HOLD_STALE_MS).toBe(15 * MIN)
    expect(held(14 * MIN)).toMatchObject({ kind: 'need', what: 'rm -rf dist', account: 'b', since: T0 - 14 * MIN })
    expect(held(16 * MIN)).toBeNull()
  })

  test('labels fit 20 cells and the toast names the oldest ask', () => {
    const need = (id: string, project: string, since: number) =>
      ({ id, project, cwd: '', account: null, browser: null, activeAt: null, kind: 'need', what: `${project} asks`, since }) as const
    expect(waitingLabel([need(SITE, 'rs-website', T0 - 12 * MIN), need(BOSS, 'rs-boss', T0 - MIN)], T0)).toBe('❓ rs-website 12m +1')
    // ❓ takes two cells, so the spec's `❓ cnlsneakers 12m +1` (21) loses a letter.
    expect(waitingLabel([need(SITE, 'cnlsneakers', T0 - 12 * MIN), need(BOSS, 'rs-boss', T0 - MIN)], T0)).toBe('❓ cnlsneake… 12m +1')
    const long = waitingLabel([need(SITE, 'ecommerce-workspace-and-more', T0 - 3 * MIN)], T0)!
    expect(cells(long)).toBeLessThanOrEqual(20)
    expect(long).toMatch(/^❓ ecommerce.*… 3m$/)

    const on = (id: string, browser: typeof RS | null, activeAt: number | null) =>
      ({ id, project: id, cwd: '', account: null, browser, activeAt, kind: 'working', what: '', since: T0 }) as const
    expect(BROWSER_ACTIVE_MS).toBe(10 * MIN)
    expect(clashLabel(RS, T0 - MIN, [on(SITE, RS, T0 - 2 * MIN), on(K24, MAIN, T0), on(BOSS, null, T0)], T0)).toBe('⚠ 2 on RapidSneakers')
    expect(cells('⚠ 2 on RapidSneakers')).toBe(20)
    expect(clashLabel(RS, T0, [on(SITE, RS, T0), on(K24, RS, T0 - 10 * MIN)], T0)).toBe('⚠ 3 on RapidSneakers')
    expect(clashLabel(RS, T0, [on(SITE, RS, null)], T0), 'peer idle').toBeNull()
    expect(clashLabel(RS, null, [on(SITE, RS, T0)], T0), 'this one idle').toBeNull()
    expect(clashLabel(RS, T0 - 10 * MIN - 1, [on(SITE, RS, T0)], T0), 'this one stale').toBeNull()
    expect(clashLabel(RS, T0, [on(SITE, RS, T0 - 10 * MIN - 1)], T0), 'peer stale').toBeNull()
    expect(clashLabel(RS, T0, [on(K24, MAIN, T0)], T0), 'another Chrome').toBeNull()
    expect(clashLabel(null, T0, [on(SITE, RS, T0)], T0), 'no route').toBeNull()

    expect(toastText([need(BOSS, 'rs-boss', T0 - MIN), need(SITE, 'cnlsneakers', T0 - 5 * MIN)])).toBe('⌁ cnlsneakers needs you: cnlsneakers asks · +1 more')
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`one toast per flip into need, batched, never for itself, on ${surface}`, async ($, on) => {
      const { clock, seen, put, drop } = engine(on)
      // At start: its own file, a stale one, junk, a mislabeled one and two live peers.
      put(`${OWN}.json`, v2(OWN, '/Users/n/nebi-skill', 'working', T0))
      put('dead0000-stale.json', v1('dead0000-stale', '/Users/n/stale', 'need', T0 - 2 * MIN))
      put('junk.json', '{"version": 2, "sessionId": ')
      put('notes.txt', 'not a beacon')
      put('11112222-label.json', v2('someone-else', '/Users/n/mislabeled', 'working', T0))
      put(`${SITE}.json`, v1(SITE, '/Users/n/rs-website', 'working', T0))
      put(`${K24}.json`, v2(K24, '/Users/n/k24-content', 'done', T0 - 60 * MIN, { writer: 'hook', heartbeatAt: undefined }))
      await $.session.start({ surface, isInteractive: true, cwd: '/Users/n/nebi-skill' } as any)
      await clock.settle()
      expect(seen.commands).toEqual(['sessions'])
      expect(seen.toasts).toEqual([])

      // It flips itself into need and so does one peer: one toast, the peer's, cleaned.
      put(`${OWN}.json`, v2(OWN, '/Users/n/nebi-skill', 'need', T0, { ask: { what: 'my own ask' } }))
      put(`${OWN}.hold.json`, hold(OWN, '/Users/n/nebi-skill', T0, 'rm -rf mine'))
      put(`${SITE}.json`, v2(SITE, '/Users/n/rs-website', 'need', T0 + 5_000, { ask: { what: '\x1b[1mpick\x1b[0m the blue hero' } }))
      await clock.advance(10_000)
      expect(seen.toasts).toEqual(['⌁ rs-website needs you: pick the blue hero'])

      // Still in need on the next read: no second toast.
      put(`${SITE}.json`, v2(SITE, '/Users/n/rs-website', 'need', clock.now(), { ask: { what: 'pick the blue hero' } }))
      await clock.advance(10_000)
      expect(seen.toasts).toHaveLength(1)

      // Two flips between reads, one of them a Red Button hold: one toast for both.
      put(`${SITE}.json`, v2(SITE, '/Users/n/rs-website', 'need', clock.now()))
      put(`${BOSS}.hold.json`, hold(BOSS, '/Users/n/rs-boss', clock.now() - 3 * MIN, 'git push --force'))
      put(`${K24}.json`, v2(K24, '/Users/n/k24-content', 'need', clock.now(), { writer: 'hook', heartbeatAt: undefined, ask: { what: 'publish?' } }))
      await clock.advance(10_000)
      expect(seen.toasts).toEqual(['⌁ rs-website needs you: pick the blue hero', '⌁ rs-boss needs you: git push --force · +1 more'])

      // The hold is gone and the peer answered: no toast; a fresh flip toasts again.
      drop(`${BOSS}.hold.json`)
      await clock.advance(10_000)
      put(`${BOSS}.json`, v2(BOSS, '/Users/n/rs-boss', 'need', clock.now(), { ask: { what: 'again' } }))
      await clock.advance(10_000)
      expect(seen.toasts.at(-1)).toBe('⌁ rs-boss needs you: again')
      expect(seen.toasts).toHaveLength(3)
      expect(seen.statuses).toEqual([])
    })

    test(`toast off gives no toasts on ${surface}`, { options: { toast: false } }, async ($, on) => {
      const { clock, seen, put } = engine(on)
      put(`${SITE}.json`, v2(SITE, '/Users/n/rs-website', 'working', T0))
      await $.session.start({ surface, isInteractive: true, cwd: '/Users/n/nebi-skill' } as any)
      await clock.settle()
      put(`${SITE}.json`, v2(SITE, '/Users/n/rs-website', 'need', T0, { ask: { what: 'pick' } }))
      await clock.advance(10_000)
      expect(seen.toasts).toEqual([])
    })

    test(`two sessions on Main Chrome stay quiet until both used it in the last 10 minutes, on ${surface}`, async ($, on) => {
      const { clock, seen, put, drop, project } = engine(on, { defaults: true })
      // This session's route is account a's default; the peer's project file names Main Chrome too.
      project('/Users/n/nebi-skill')
      project('/Users/n/ecommerce-workspace', MAIN)
      put(`${K24}.json`, v2(K24, '/Users/n/ecommerce-workspace', 'working', T0))
      await $.session.start({ surface, isInteractive: true, cwd: '/Users/n/nebi-skill' } as any)
      await clock.settle()
      expect(await labels($, seen, surface), 'two idle sessions').toEqual(['focus'])

      // Only this one used Chrome: still quiet.
      await $.tool.call(chrome('navigate', { url: 'https://admin.shopify.com' }))
      await clock.advance(10_000)
      expect(await labels($, seen, surface), 'one active, one idle').toEqual(['focus'])

      // The peer used it two minutes ago: both active, the label shows, appended.
      put(`${K24}.json`, v2(K24, '/Users/n/ecommerce-workspace', 'working', clock.now(), { browserActiveAt: clock.now() - 2 * MIN }))
      await clock.advance(10_000)
      expect(await labels($, seen, surface)).toEqual(['focus', '⚠ 2 on Main'])

      // Ten quiet minutes on this side: its own use is stale, quiet again,
      // though the peer keeps using Chrome.
      await clock.advance(9 * MIN)
      put(`${K24}.json`, v2(K24, '/Users/n/ecommerce-workspace', 'working', clock.now(), { browserActiveAt: clock.now() }))
      await clock.advance(70_000)
      expect(await labels($, seen, surface), 'this one stale').toEqual(['focus'])

      // A sub-agent's Chrome call makes this session active again.
      await $.tool.call(chrome('read_page', { tabId: 1, agentId: 'a1' }))
      await clock.advance(10_000)
      expect(await labels($, seen, surface)).toEqual(['focus', '⚠ 2 on Main'])

      // The peer ends: no label.
      drop(`${K24}.json`)
      await clock.advance(10_000)
      expect(await labels($, seen, surface)).toEqual(['focus'])
    })

    test(`stale, unknown or other-Chrome activity never counts toward a clash, on ${surface}`, async ($, on) => {
      const { clock, seen, put, drop, project } = engine(on, { defaults: true })
      project('/Users/n/nebi-skill')
      await $.session.start({ surface, isInteractive: true, cwd: '/Users/n/nebi-skill' } as any)
      await $.tool.call(chrome('tabs_context_mcp'))
      const at = clock.now()

      // A peer whose last Chrome call is 11 minutes old.
      put(`${K24}.json`, v2(K24, '/Users/n/k24-content', 'working', at, { browserActiveAt: at - 11 * MIN }))
      await clock.advance(10_000)
      expect(await labels($, seen, surface), 'stale peer').toEqual(['focus'])
      drop(`${K24}.json`)

      // A v1 beacon, even one that carries the field, and a hook file without it.
      put(`${SITE}.json`, v1(SITE, '/Users/n/rs-website', 'working', clock.now(), { browser: MAIN, browserActiveAt: clock.now() }))
      put(`${BOSS}.json`, v2(BOSS, '/Users/n/rs-boss', 'done', clock.now(), { writer: 'hook', heartbeatAt: undefined }))
      // A live, active peer on the other Chrome.
      put(`${IDLE}.json`, v2(IDLE, '/Users/n/cnlsneakers', 'working', clock.now(), { account: 'b', browser: RS, browserActiveAt: clock.now() }))
      await clock.advance(10_000)
      expect(await labels($, seen, surface), 'v1, hook, other Chrome').toEqual(['focus'])

      // The same hook file once it names recent use does count.
      put(`${BOSS}.json`, v2(BOSS, '/Users/n/rs-boss', 'done', clock.now(), { writer: 'hook', heartbeatAt: undefined, browserActiveAt: clock.now() - 9 * MIN }))
      await clock.advance(10_000)
      expect(await labels($, seen, surface)).toEqual(['focus', '⚠ 2 on Main'])
    })

    test(`its own Chrome follows every route.mjs vector (${ROUTE_VECTORS.length} cases), on ${surface}`, async ($, on) => {
      const { clock, world, seen, dir } = vectorEngine(on)
      for (const v of ROUTE_VECTORS) {
        // Two live peers that used Chrome a minute ago, one on each known device.
        const at = clock.now()
        const peer = (id: string, browser: typeof RS) => JSON.stringify(v2(id, `/w/peers/${id}`, 'working', at, { browser, browserActiveAt: at - MIN }))
        Object.assign(world, {
          cwd: v.cwd,
          env: { HOME: v.home, ...(v.configDir === undefined ? {} : { CLAUDE_CONFIG_DIR: v.configDir }) },
          files: {
            ...v.files,
            ...Object.fromEntries((v.gitFiles ?? []).map(gitDir => [`${gitDir}/.git`, 'gitdir: /elsewhere'])),
            [`${dir}/${K24}.json`]: peer(K24, MAIN),
            [`${dir}/${SITE}.json`]: peer(SITE, RS),
          },
          repos: v.gitDirs,
        })
        await $.session.start({ surface, isInteractive: true, cwd: v.cwd } as any)
        await $.tool.call(chrome('tabs_context_mcp'))
        await clock.advance(10_000)
        const id = v.expected?.deviceId
        const expected = id === MAIN.deviceId ? ['focus', '⚠ 2 on Main'] : id === RS.deviceId ? ['focus', '⚠ 2 on RapidSneakers'] : ['focus']
        expect(await labels($, seen, surface), v.name).toEqual(expected)
      }
    })

    test(`the waiting label draws off the terminal only on ${surface}`, async ($, on) => {
      const { clock, seen, put, project } = engine(on, { cwd: '/Users/n/cnlsneakers' })
      project('/Users/n/cnlsneakers', RS)
      put(`${SITE}.json`, v2(SITE, '/Users/n/cnlsneakers', 'need', T0, { account: 'b', browser: RS, browserActiveAt: T0 - MIN, askedAt: T0 - 12 * MIN, ask: { what: 'pick' } }))
      put(`${BOSS}.hold.json`, hold(BOSS, '/Users/n/rs-boss', T0 - MIN, 'git push --force'))
      await $.session.start({ surface, isInteractive: true, cwd: '/Users/n/cnlsneakers' } as any)
      // Both cnlsneakers sessions used RapidSneakers Chrome just now: a clash.
      await $.tool.call(chrome('navigate', { url: 'https://admin.shopify.com' }))
      await clock.advance(10_000)

      // The desktop has no status line: it names who waits. The terminal's
      // status line does that, so there only the clash label shows.
      const expected = surface === 'terminal' ? '⚠ 2 on RapidSneakers' : '❓ cnlsneake… 12m +1'
      expect(await labels($, seen, surface)).toEqual(['focus', expected])
    })

    test(`/sessions lists project, account, browser, state and wait, longest wait first, on ${surface}`, async ($, on) => {
      const { clock, put, project } = engine(on)
      project('/Users/n/k24-content', MAIN)
      put(`${IDLE}.json`, v1(IDLE, '/Users/n/scratch', 'idle', T0 - 30 * MIN, { heartbeatAt: T0 }))
      put(`${K24}.json`, v1(K24, '/Users/n/k24-content', 'working', T0 - 2 * MIN, { heartbeatAt: T0 }))
      put(`${SITE}.json`, v2(SITE, '/Users/n/cnlsneakers', 'need', T0, { account: 'b', browser: RS, askedAt: T0 - 5 * MIN, ask: { what: 'pick the \x1b[32mgreen\x1b[0m hero' } }))
      put(`${BOSS}.hold.json`, hold(BOSS, '/Users/n/rs-boss', T0 - 14 * MIN, 'rm -rf dist'))
      put(`${OWN}.json`, v2(OWN, '/Users/n/nebi-skill', 'need', T0))
      await $.session.start({ surface, isInteractive: true, cwd: '/Users/n/nebi-skill' } as any)
      await clock.settle()

      const result = await $.command.run({ command: 'sessions', args: '' } as any)
      expect(result.text?.split('\n')).toEqual([
        'rs-boss · b · - · needs you: rm -rf dist · 14m',
        'cnlsneakers · b · RapidSneakers Chrome · needs you: pick the green hero · 5m',
        'k24-content · - · Main Chrome · working · 2m',
        'scratch · - · - · idle · 30m',
      ])
    })

    for (const off of ['all', 'nebi-quiet, nebi-constellation']) {
      test(`NEBI_MODS_OFF=${off} registers nothing visible on ${surface}`, async ($, on) => {
        const { clock, seen, put, project } = engine(on, { cwd: '/Users/n/cnlsneakers', env: { NEBI_MODS_OFF: off } })
        project('/Users/n/cnlsneakers', RS)
        put(`${SITE}.json`, v2(SITE, '/Users/n/cnlsneakers', 'working', T0))
        await $.session.start({ surface, isInteractive: true, cwd: '/Users/n/cnlsneakers' } as any)
        await clock.settle()
        put(`${SITE}.json`, v2(SITE, '/Users/n/cnlsneakers', 'need', T0))
        await clock.advance(20_000)
        expect(seen.commands).toEqual([])
        expect(seen.lists).toBe(0)
        expect(seen.toasts).toEqual([])
        expect(await labels($, seen, surface)).toEqual(['focus'])
      })
    }
  }
})
