import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { currentAccount } from '../hooks/route'
import { ACCOUNT_HOME, ACCOUNT_VECTORS, ROUTE_VECTORS } from './route-vectors'
import type { RouteVector } from './route-vectors'

const PLUGIN = 'nebi-browser'
const HOME = '/Users/nebi'
const B_DIR = `${HOME}/.claude-max2`
const ROUTER = `${HOME}/.claude/nebi/browser-open`
const DEFAULTS = `${HOME}/.claude/nebi/browsers.json`
const SHOP = `${HOME}/Documents/GitHub/cnlsneakers`
const SHOP_SUB = `${SHOP}/growth/b-tiktok`
const SKILL = `${HOME}/Documents/GitHub/nebi-skill`

const MAIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RS_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MAIN = { label: 'Main Chrome', chromeProfile: 'Default', deviceId: MAIN_ID }
const RS = { label: 'RapidSneakers Chrome', chromeProfile: 'Profile 3', deviceId: RS_ID }

const USE_CODEX_BROWSER = 'Use the codex-browser skill instead'
const ASK_NEBI = 'Stop and ask Nebi to open that Chrome'
const ASK_SWITCH = ' If Nebi wants another browser, ask him in one plain sentence: his reply lets you switch.'

type World = {
  cwd: string
  env: Record<string, string>
  files: Record<string, string>
  repos: string[]
}

const shop = (env: Record<string, string> = { HOME, CLAUDE_CONFIG_DIR: B_DIR }): World => ({
  cwd: SHOP_SUB,
  env,
  files: {
    [`${SHOP}/.claude/browser.json`]: JSON.stringify({ version: 1, ...RS, claudeAccount: 'b' }),
    [DEFAULTS]: JSON.stringify({ version: 1, accounts: { a: MAIN, b: RS } }),
    [ROUTER]: '#!/usr/bin/env node',
  },
  repos: [SHOP],
})

const skill = (env: Record<string, string> = { HOME }): World => ({
  cwd: SKILL,
  env,
  files: { [DEFAULTS]: JSON.stringify({ version: 1, accounts: { a: MAIN, b: RS } }), [ROUTER]: '#!/usr/bin/env node' },
  repos: [SKILL],
})

/** The engine beneath the plugin: env, a file tree, the session, Chrome and the footer. */
function engine(on: On, world: World) {
  const seen = { ran: [] as string[], sets: [] as [string, string | undefined][], listing: [MAIN_ID, RS_ID] }
  on('env.get', (_, e) => ({ value: world.env[e.name] }))
  on('env.set', (_, e) => {
    seen.sets.push([e.name, e.value])
    if (e.value === undefined) delete world.env[e.name]
    else world.env[e.name] = e.value
    return { value: undefined }
  })
  on('fs.exists', (_, e) => ({ value: e.path in world.files || world.repos.some(repo => e.path === `${repo}/.git`) }))
  on('fs.read', (_, e) => {
    const text = world.files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: world.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as any)
  on('tool.call', (_, e) => {
    const name = String(e.tool).replace(/^mcp__claude-in-chrome__/, '')
    seen.ran.push(name)
    if (name === 'list_connected_browsers') {
      const text = JSON.stringify(seen.listing.map((deviceId, i) => ({ deviceId, name: `Browser ${i + 1}` })))
      return { result: text, text } as any
    }
    return { result: 'ok', text: 'ok' } as any
  })
  on('ui.render', { component: 'SessionMode' }, ($, e) => $.ui.resolve(e).Text({ children: e.props.modes.join(' & ') }))

  return seen
}

const chrome = (tool: string, input: Record<string, unknown> = {}) => ({ tool: `mcp__claude-in-chrome__${tool}`, ...input }) as any
const say = (text: string, kind = 'composer', turnId?: string) => ({ text, origin: { kind }, wait: false, ...(turnId ? { turnId } : {}) }) as any
const isRan = (out: unknown) => expect(out).toMatchObject({ result: 'ok' })

/** A route vector as the engine beneath the plugin sees it. */
const vectorWorld = (v: RouteVector): World => ({
  cwd: v.cwd,
  env: { HOME: v.home, ...(v.configDir === undefined ? {} : { CLAUDE_CONFIG_DIR: v.configDir }) },
  files: { ...v.files, ...Object.fromEntries((v.gitFiles ?? []).map(dir => [`${dir}/.git`, 'gitdir: /elsewhere'])) },
  repos: v.gitDirs,
})

describe('nebi-browser', () => {
  test(`the account follows route.mjs currentAccount (${ACCOUNT_VECTORS.length} cases)`, () => {
    for (const [dir, account] of ACCOUNT_VECTORS) expect(currentAccount(dir, ACCOUNT_HOME), String(dir)).toBe(account)
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const start = ($: any, world: World) => $.session.start({ surface, isInteractive: true, cwd: world.cwd })
    const footer = async ($: any) => {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'SessionMode', props: { modes: ['focus'] } })
      const text = (await ui.find({ type: 'Text' }))?.text
      await ui.unmount()
      return text
    }

    test(`the project file at the git root is found from a subfolder; a wrong device is denied by label and full id, the right one passes, on ${surface}`, async ($, on) => {
      const world = shop()
      const seen = engine(on, world)
      await start($, world)

      expect(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID }))).toEqual({
        deny: `This project uses RapidSneakers Chrome (${RS_ID}). Call select_browser with deviceId ${RS_ID} instead.${ASK_SWITCH}`,
      })
      isRan(await $.tool.call(chrome('select_browser', { deviceId: RS_ID.toUpperCase() })))
      isRan(await $.tool.call(chrome('tabs_context_mcp')))
      isRan(await $.tool.call(chrome('navigate', { url: 'https://admin.shopify.com', tabId: 1 })))
      expect(seen.ran).toEqual(['select_browser', 'tabs_context_mcp', 'navigate'])
    })

    test(`with no project file the account default holds: a with CLAUDE_CONFIG_DIR unset, b under .claude-max2, on ${surface}`, async ($, on) => {
      const world = skill()
      engine(on, world)
      await start($, world)
      expect(await $.tool.call(chrome('select_browser', { deviceId: RS_ID }))).toEqual({
        deny: `This project uses Main Chrome (${MAIN_ID}). Call select_browser with deviceId ${MAIN_ID} instead.${ASK_SWITCH}`,
      })
      isRan(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID })))

      world.env.CLAUDE_CONFIG_DIR = `${B_DIR}/`
      await start($, world)
      expect(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID }))).toMatchObject({ deny: expect.stringContaining(`RapidSneakers Chrome (${RS_ID})`) })
      isRan(await $.tool.call(chrome('select_browser', { deviceId: RS_ID })))
    })

    test(`no route: every call passes and no label is drawn, on ${surface}`, async ($, on) => {
      const world: World = { cwd: '/tmp/scratch', env: { HOME }, files: {}, repos: [] }
      engine(on, world)
      await start($, world)
      isRan(await $.tool.call(chrome('select_browser', { deviceId: 'ffffffff-0000-0000-0000-000000000000' })))
      isRan(await $.tool.call(chrome('switch_browser')))
      isRan(await $.tool.call(chrome('navigate', { url: 'https://example.com' })))
      expect(await footer($)).toBe('focus')

      // An unknown account has no default either.
      const other = skill({ HOME, CLAUDE_CONFIG_DIR: '/opt/claude-elsewhere' })
      Object.assign(world, other)
      await start($, world)
      isRan(await $.tool.call(chrome('switch_browser')))
    })

    test(`switch_browser is denied and pointed to select_browser unless this turn's own prompt asks to pair, on ${surface}`, async ($, on) => {
      const world = shop()
      engine(on, world)
      await start($, world)
      const denied = { deny: `switch_browser pops a pairing request in every Chrome. Call select_browser with deviceId ${RS_ID} (RapidSneakers Chrome) instead.` }
      expect(await $.tool.call(chrome('switch_browser'))).toEqual(denied)

      // Nebi asks: it passes this turn, and so does picking another device.
      await $.prompt.submit(say('pair the rapidsneakers browser'))
      isRan(await $.tool.call(chrome('switch_browser')))
      isRan(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID })))

      // His next prompt does not ask: denied again.
      await $.prompt.submit(say('now check the open orders'))
      expect(await $.tool.call(chrome('switch_browser'))).toEqual(denied)

      // A notification or a peer turn never counts, whatever it says.
      await $.prompt.submit(say('name both browsers'))
      await $.prompt.submit(say('pair the browser', 'task-notification'))
      expect(await $.tool.call(chrome('switch_browser'))).toEqual(denied)
      await $.prompt.submit(say('switch the browser now', 'peer'))
      expect(await $.tool.call(chrome('switch_browser'))).toEqual(denied)

      // A prompt from his phone counts; one he types into the running turn adds to it.
      await $.prompt.submit(say('rename the chrome connection', 'bridge'))
      isRan(await $.tool.call(chrome('switch_browser')))
      await $.prompt.submit(say('carry on', 'peer', 'turn-1'))
      isRan(await $.tool.call(chrome('switch_browser')))
    })

    test(`plain words that point at another browser let the pick through; after a refused pick his next own reply does, on ${surface}`, async ($, on) => {
      const world = shop()
      engine(on, world)
      await start($, world)

      // His words point at another browser: the pick passes this turn.
      for (const text of ['nope wrong browser', 'do the beslist signup in the karpet24 browser', 'use my main chrome', 'use browser 2']) {
        await $.prompt.submit(say(text))
        isRan(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID })))
      }

      // Words that only mention a browser do not.
      for (const text of ['check the orders in the browser', 'open it in your chrome', 'take a screenshot of the browser']) {
        await start($, world)
        await $.prompt.submit(say(text))
        expect(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID }))).toMatchObject({ deny: expect.stringContaining(ASK_SWITCH.trim()) })
      }

      // A peer or a notification never answers for him, whatever it says.
      await $.prompt.submit(say('use the main chrome', 'peer'))
      await $.prompt.submit(say('switch to the main chrome', 'task-notification'))
      expect(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID }))).toMatchObject({ deny: expect.stringContaining(RS_ID) })

      // His reply, whatever its words, opens it for that turn; the turn after is strict again.
      await $.prompt.submit(say('yes'))
      isRan(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID })))
      isRan(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID })))
      await $.prompt.submit(say('now check the open orders'))
      expect(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID }))).toMatchObject({ deny: expect.stringContaining(RS_ID) })
      expect(await $.tool.call(chrome('switch_browser'))).toMatchObject({ deny: expect.stringContaining('pairing request') })
    })

    test(`an offline project browser: the listing carries a stop line and denies say ask Nebi, on ${surface}`, async ($, on) => {
      const world = shop()
      const seen = engine(on, world)
      await start($, world)

      seen.listing = [MAIN_ID]
      const listed = await $.tool.call(chrome('list_connected_browsers'))
      expect(listed).toMatchObject({ context: [expect.stringContaining(ASK_NEBI)] })
      expect(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID }))).toEqual({
        deny: `This project uses RapidSneakers Chrome (${RS_ID}), and it is not connected. Stop and ask Nebi to open that Chrome; do not pick another browser.`,
      })
      expect(await $.tool.call(chrome('switch_browser'))).toMatchObject({ deny: expect.stringContaining(ASK_NEBI) })

      // It comes back: the listing is untouched and the plain deny returns.
      seen.listing = [RS_ID]
      const back = await $.tool.call(chrome('list_connected_browsers'))
      expect((back as any).context).toBeUndefined()
      expect(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID }))).toMatchObject({ deny: expect.stringContaining('Call select_browser') })
    })

    test(`on the wrong account the first page action is denied with the restart line until Nebi answers; listing passes, on ${surface}`, async ($, on) => {
      const world = shop({ HOME })
      const seen = engine(on, world)
      await start($, world)

      isRan(await $.tool.call(chrome('tabs_context_mcp')))
      expect(await $.tool.call(chrome('list_connected_browsers'))).toMatchObject({ result: expect.any(String) })
      const first = await $.tool.call(chrome('navigate', { url: 'https://admin.shopify.com' }))
      expect(first).toEqual({
        deny: "This project's Chrome is paired with Claude account b, but this session is on account a, so Claude in Chrome cannot act here. Use the codex-browser skill instead: it drives the same Chrome from any account.",
      })
      // Retries and sub-agents stay stopped until his next own prompt.
      expect(await $.tool.call(chrome('computer', { action: 'screenshot' }))).toMatchObject({ deny: expect.stringContaining(USE_CODEX_BROWSER) })
      expect(await $.tool.call({ ...chrome('find', { query: 'orders' }), agentId: 'scout-1' })).toMatchObject({ deny: expect.stringContaining(USE_CODEX_BROWSER) })
      await $.prompt.submit(say('a peer says hi', 'peer'))
      expect(await $.tool.call(chrome('navigate', { url: 'https://admin.shopify.com' }))).toMatchObject({ deny: expect.stringContaining(USE_CODEX_BROWSER) })

      await $.prompt.submit(say('fine, carry on in this one'))
      isRan(await $.tool.call(chrome('navigate', { url: 'https://admin.shopify.com' })))
      expect(seen.ran).toEqual(['tabs_context_mcp', 'list_connected_browsers', 'navigate'])
    })

    test(`sub-agents get the same rules, on ${surface}`, async ($, on) => {
      const world = shop()
      engine(on, world)
      await start($, world)
      const agent = { agentId: 'browser-scout' }
      expect(await $.tool.call({ ...chrome('select_browser', { deviceId: MAIN_ID }), ...agent })).toMatchObject({ deny: expect.stringContaining(RS_ID) })
      expect(await $.tool.call({ ...chrome('switch_browser'), ...agent })).toMatchObject({ deny: expect.stringContaining('select_browser') })
      isRan(await $.tool.call({ ...chrome('tabs_context_mcp'), ...agent }))
      isRan(await $.tool.call({ ...chrome('select_browser', { deviceId: RS_ID }), ...agent }))
    })

    test(`the footer label: account and browser off the terminal, a warning on any surface when the account is wrong, on ${surface}`, async ($, on) => {
      const world = shop()
      engine(on, world)
      await start($, world)
      expect(await footer($)).toBe(surface === 'terminal' ? 'focus' : 'focus & B · RapidSneakers')

      world.env = { HOME }
      await start($, world)
      expect(await footer($)).toBe('focus & ⚠ wrong account')

      // A long name still fits in 20 cells.
      world.env = { HOME, CLAUDE_CONFIG_DIR: B_DIR }
      world.files[`${SHOP}/.claude/browser.json`] = JSON.stringify({ version: 1, ...RS, label: 'RapidSneakers Wholesale Chrome', claudeAccount: 'b' })
      await start($, world)
      const label = (await footer($))?.replace('focus & ', '')
      if (surface === 'terminal') expect(label).toBe('focus')
      else expect(label).toBe('B · RapidSneakers W…')
      expect([...(label ?? '')].length).toBeLessThanOrEqual(20)
    })

    test(`BROWSER is set to the router only when unset and the router is there, on ${surface}`, async ($, on) => {
      const world = shop()
      const seen = engine(on, world)
      await start($, world)
      expect(seen.sets).toEqual([['BROWSER', ROUTER]])

      world.env.BROWSER = '/usr/local/bin/my-opener'
      await start($, world)
      expect(seen.sets).toHaveLength(1)
      expect(world.env.BROWSER).toBe('/usr/local/bin/my-opener')

      delete world.env.BROWSER
      delete world.files[ROUTER]
      await start($, world)
      expect(seen.sets).toHaveLength(1)
    })

    test(`NEBI_MODS_OFF turns it into a pass-through, on ${surface}`, async ($, on) => {
      const world = shop()
      const seen = engine(on, world)
      for (const value of ['all', 'nebi-beacon, nebi-browser']) {
        world.env = { HOME, NEBI_MODS_OFF: value }
        await start($, world)
        expect(seen.sets).toEqual([])
        isRan(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID })))
        isRan(await $.tool.call(chrome('switch_browser')))
        isRan(await $.tool.call(chrome('navigate', { url: 'https://admin.shopify.com' })))
        expect(await footer($)).toBe('focus')
      }
    })

    test(`every route.mjs vector resolves the same in the mod (${ROUTE_VECTORS.length} cases), on ${surface}`, async ($, on) => {
      const world: World = { cwd: '/', env: {}, files: {}, repos: [] }
      engine(on, world)
      // The route the mod stores, caught on its way to the kit's store.
      let stored: unknown = 'never stored'
      on('state.set', (_, e, next) => {
        if (e.plugin === PLUGIN && e.key === 'route') stored = (e as { value?: unknown }).value
        return next(e)
      })
      for (const v of ROUTE_VECTORS) {
        Object.assign(world, vectorWorld(v))
        stored = 'never stored'
        await start($, world)
        expect(stored, v.name).toEqual(v.expected)
      }
    })

    test(`a garbled project file falls back to the account default, with no throw, on ${surface}`, async ($, on) => {
      const world = shop({ HOME })
      engine(on, world)
      for (const text of ['{"version": 1, "label": ', '[]', JSON.stringify({ version: 1, label: 7 })]) {
        world.files[`${SHOP}/.claude/browser.json`] = text
        await start($, world)
        expect(await $.tool.call(chrome('select_browser', { deviceId: RS_ID }))).toEqual({
          deny: `This project uses Main Chrome (${MAIN_ID}). Call select_browser with deviceId ${MAIN_ID} instead.${ASK_SWITCH}`,
        })
        isRan(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID })))
        expect(await footer($)).toBe(surface === 'terminal' ? 'focus' : 'focus & A · Main')
      }
    })

    test(`outside a repo a .claude/browser.json in the working folder is not read, on ${surface}`, async ($, on) => {
      const world: World = {
        cwd: '/tmp/scratch',
        env: { HOME },
        files: { '/tmp/scratch/.claude/browser.json': JSON.stringify({ version: 1, ...RS, claudeAccount: 'b' }), [DEFAULTS]: JSON.stringify({ version: 1, accounts: { a: MAIN, b: RS } }) },
        repos: [],
      }
      engine(on, world)
      await start($, world)
      // No wrong-account stop: the stray file is ignored and account a's default holds.
      isRan(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID })))
      expect(await $.tool.call(chrome('select_browser', { deviceId: RS_ID }))).toMatchObject({ deny: expect.stringContaining(`Main Chrome (${MAIN_ID})`) })
    })

    test(`a route with no deviceId keeps only the account guard, on ${surface}`, async ($, on) => {
      const world = shop({ HOME })
      engine(on, world)
      world.files[`${SHOP}/.claude/browser.json`] = JSON.stringify({ label: 'Shop Chrome', claudeAccount: 'b' })
      await start($, world)
      const listed = await $.tool.call(chrome('list_connected_browsers'))
      expect(listed).toMatchObject({ result: expect.any(String) })
      expect((listed as any).context).toBeUndefined()
      expect(await $.tool.call(chrome('navigate', { url: 'https://admin.shopify.com' }))).toMatchObject({ deny: expect.stringContaining(USE_CODEX_BROWSER) })

      world.files[`${SHOP}/.claude/browser.json`] = JSON.stringify({ label: 'Shop Chrome' })
      await start($, world)
      isRan(await $.tool.call(chrome('select_browser', { deviceId: MAIN_ID })))
      isRan(await $.tool.call(chrome('switch_browser')))
    })
  }
})
