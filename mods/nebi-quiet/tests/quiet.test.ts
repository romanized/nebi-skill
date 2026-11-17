import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { trimHint } from '../hooks/quiet'

const PLUGIN = 'nebi-quiet'
const HOME = '/Users/nebi'
const CWD = `${HOME}/proj`
const SURFACES = ['terminal', 'desktop'] as const
// The terminal keeps the engine's result gutter in front of the line.
const line = (surface: string, text: string) => (surface === 'terminal' ? `  ⎿  ${text}` : text)

const PATCH = [{ oldStart: 1, oldLines: 3, newStart: 1, newLines: 4, lines: [' a', '-b', '-c', '+B', '+C', '+D', ' e'] }]
const WRITE = { type: 'create', filePath: `${CWD}/mods/x.ts`, content: 'one\ntwo\nthree\n', structuredPatch: [], originalFile: null }
const EDIT = { filePath: `${CWD}/statusline.mjs`, oldString: 'b', newString: 'B', originalFile: 'a\nb', structuredPatch: PATCH, userModified: false, replaceAll: false }

const result = (tool: string, output: unknown, isErrored = false) => ({
  plugin: PLUGIN,
  component: 'ToolResult',
  requestId: 'tu1',
  props: { tool_use_id: 'tu1', tool, output, isErrored },
}) as const

const row = (tool: string, more: Record<string, unknown> = {}) => ({
  plugin: PLUGIN,
  component: 'ToolUse',
  requestId: 'tu1',
  props: { tool_use_id: 'tu1', tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false, ...more },
}) as const

const hint = (text: string, tail?: string) => ({
  plugin: PLUGIN,
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: text, ...(tail === undefined ? {} : { tail }) },
}) as const

const PILL = {
  plugin: PLUGIN,
  component: 'ToolProgress',
  requestId: 'tu1',
  props: { tool_use_id: 'tu1', kind: 'background_hint', hint: '(ctrl+b to run in background)' },
} as const

// The engine beneath the plugin: draws `engine` and keeps the props it was handed.
function engine(on: On, env: Record<string, string> = {}) {
  const seen: Record<string, unknown>[] = []
  mock.env(on, { HOME, ...env })
  on('session.cwd', () => ({ value: CWD }))
  on('ui.render', ($, e) => {
    seen.push(e.props as Record<string, unknown>)

    return $.ui.resolve(e).Text({ children: ['engine'] })
  })

  return { seen, last: () => seen[seen.length - 1] }
}

// Draws one component and says what came out: the plugin's text, or that the engine drew.
async function draw($: any, surface: string, target: Record<string, unknown>) {
  const ui = await $.ui.mount({ ...target, surface })
  const texts = (await ui.findAll({ type: 'Text' })).map((found: { text?: string }) => found.text ?? '')
  const drawn = await ui.drawn()
  await ui.unmount()

  return { texts, drawn, isEngine: texts.includes('engine') }
}

describe('nebi-quiet', () => {
  test('a Write draws one line with the path and line count and no content', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      const out = await draw($, surface, result('Write', WRITE))
      expect(out.texts).toEqual([line(surface, 'wrote 3 lines · mods/x.ts')])
      expect(out.texts.join(' ')).not.toContain('three')
    }
  })

  test('an Edit draws its counts from the patch; MultiEdit and NotebookEdit get one line too', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      expect((await draw($, surface, result('Edit', EDIT))).texts).toEqual([line(surface, 'edited statusline.mjs +3 −2')])
      expect((await draw($, surface, result('MultiEdit', { ...EDIT, filePath: `${HOME}/notes/a.md` }))).texts).toEqual([line(surface, 'edited ~/notes/a.md +3 −2')])
      const cell = { new_source: 'x', cell_type: 'code', language: 'python', edit_mode: 'replace', notebook_path: `${CWD}/nb.ipynb`, original_file: '', updated_file: '' }
      expect((await draw($, surface, result('NotebookEdit', cell))).texts).toEqual([line(surface, 'edited a cell · nb.ipynb')])
    }
  })

  test('errored, staged and unreadable writes keep the engine row, untouched', async ($, on) => {
    const world = engine(on)
    for (const surface of SURFACES) {
      const errored = result('Write', 'File has not been read yet.', true)
      expect((await draw($, surface, errored)).isEngine).toBe(true)
      expect(world.last()).toEqual(errored.props)
      expect((await draw($, surface, result('Edit', { ...EDIT, staged: true }))).isEngine).toBe(true)
      expect((await draw($, surface, result('Write', 'Interrupted by user'))).isEngine).toBe(true)
    }
  })

  test('edits: full keeps the engine rows', { options: { edits: 'full' } }, async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      expect((await draw($, surface, result('Write', WRITE))).isEngine).toBe(true)
      expect((await draw($, surface, result('Edit', EDIT))).isEngine).toBe(true)
    }
  })

  test('Read and Bash rows and results are untouched', async ($, on) => {
    const world = engine(on)
    for (const surface of SURFACES) {
      const read = result('Read', { type: 'text', file: { filePath: `${CWD}/a.ts`, content: 'x' } })
      expect((await draw($, surface, read)).isEngine).toBe(true)
      expect(world.last()).toEqual(read.props)
      expect((await draw($, surface, result('Bash', { stdout: 'ok', stderr: '' }))).isEngine).toBe(true)
      expect((await draw($, surface, row('Bash', { isRunning: true }))).isEngine).toBe(true)
      expect((await draw($, surface, row('Write', { output: WRITE }))).isEngine).toBe(true)
    }
  })

  test('a running Workflow is one line; finished, errored and interrupted stay the engine row', async ($, on) => {
    engine(on)
    const script = "export const meta = { name: 'nebi-sweep', description: 'x', phases: [] }\nawait agent('go')"
    for (const surface of SURFACES) {
      const running = await draw($, surface, row('Workflow', { input: { script }, isRunning: true }))
      expect(running.texts).toEqual(['workflow · nebi-sweep · running'])
      expect((await draw($, surface, row('Workflow', { input: { name: 'audit' }, isRunning: true }))).texts).toEqual(['workflow · audit · running'])
      expect((await draw($, surface, row('Workflow', { isRunning: true }))).texts).toEqual(['workflow · running'])
      const done = { status: 'async_launched', taskId: 't1', workflowName: 'nebi-sweep' }
      expect((await draw($, surface, row('Workflow', { input: { script }, output: done }))).isEngine).toBe(true)
      expect((await draw($, surface, row('Workflow', { input: { script }, isRunning: true, isErrored: true }))).isEngine).toBe(true)
      expect((await draw($, surface, row('Workflow', { input: { script }, isRunning: true, isInterrupted: true }))).isEngine).toBe(true)
    }
  })

  test('the model PushNotification row draws nothing unless it errored or was interrupted', async ($, on) => {
    engine(on)
    const sent = { message: 'Need you', pushSent: false, disabledReason: 'user_present' }
    for (const surface of SURFACES) {
      const quiet = await draw($, surface, row('PushNotification', { input: { message: 'Need you' }, output: sent }))
      expect(quiet.texts).toEqual([])
      expect(quiet.drawn).toMatchObject({ type: 'Box' })
      expect((await draw($, surface, result('PushNotification', sent))).texts).toEqual([])
      expect((await draw($, surface, row('PushNotification', { isErrored: true }))).isEngine).toBe(true)
      expect((await draw($, surface, row('PushNotification', { isInterrupted: true }))).isEngine).toBe(true)
      expect((await draw($, surface, result('PushNotification', 'no transport', true))).isEngine).toBe(true)
    }
  })

  test('the ctrl+b pill gets an empty hint', async ($, on) => {
    const world = engine(on)
    await draw($, 'terminal', PILL)
    expect(world.last()).toEqual({ ...PILL.props, hint: '' })
  })

  test('the footer loses only its shortcut hints and never carries a tail', async ($, on) => {
    const world = engine(on)
    for (const surface of SURFACES) {
      // What 2.1.288 hands the hook in bypass mode, captured live (idle, typing, working).
      await draw($, surface, hint('(shift+tab to cycle) · ← for agents', 'beacon'))
      expect(world.last()).toEqual({ isDraft: false, isWorking: false, hint: '← for agents' })
      await draw($, surface, hint('(shift+tab to cycle)'))
      expect(world.last()).toEqual({ isDraft: false, isWorking: false, hint: '' })
      await draw($, surface, hint('? for shortcuts · (shift+tab to cycle) · 1 shell'))
      expect(world.last()?.hint).toBe('1 shell')
      // Neither present: the props go down exactly as they came, tail included.
      const kept = hint('1 shell · ← for agents', 'beacon')
      await draw($, surface, kept)
      expect(world.last()).toEqual(kept.props)
    }
  })

  test('footer: engine passes the hint through', { options: { footer: 'engine' } }, async ($, on) => {
    const world = engine(on)
    for (const surface of SURFACES) {
      const given = hint('(shift+tab to cycle) · ← for agents')
      await draw($, surface, given)
      expect(world.last()).toEqual(given.props)
    }
  })

  test('trimHint leaves no dangling separators and ignores hints without noise', () => {
    expect(trimHint('(shift+tab to cycle) · ← for agents')).toBe('← for agents')
    expect(trimHint('← for agents · (shift+tab to cycle)')).toBe('← for agents')
    expect(trimHint('a · (shift+tab to cycle) · ? for shortcuts · b')).toBe('a · b')
    expect(trimHint('? for shortcuts')).toBe('')
    expect(trimHint('1 shell · ← for agents')).toBeNull()
    expect(trimHint('esc to interrupt')).toBeNull()
  })

  test('escape sequences in a path are stripped before drawing', async ($, on) => {
    engine(on)
    const out = await draw($, 'terminal', result('Write', { ...WRITE, filePath: `${CWD}/a\x1b[31mred\x1b[0m.ts` }))
    expect(out.texts).toEqual([line('terminal', 'wrote 3 lines · ared.ts')])
  })
})

describe('nebi-quiet kill switch', () => {
  for (const value of ['all', 'nebi-wispr, nebi-quiet']) {
    test(`NEBI_MODS_OFF=${value} makes every hook pass`, async ($, on) => {
      const world = engine(on, { NEBI_MODS_OFF: value })
      for (const surface of SURFACES) {
        expect((await draw($, surface, result('Write', WRITE))).isEngine).toBe(true)
        expect((await draw($, surface, row('PushNotification'))).isEngine).toBe(true)
        expect((await draw($, surface, row('Workflow', { isRunning: true }))).isEngine).toBe(true)
        const given = hint('(shift+tab to cycle) · ← for agents', 'x')
        await draw($, surface, given)
        expect(world.last()).toEqual(given.props)
      }
      await draw($, 'terminal', PILL)
      expect(world.last()).toEqual(PILL.props)
    })
  }

  test('NEBI_MODS_OFF naming another mod leaves nebi-quiet on', async ($, on) => {
    engine(on, { NEBI_MODS_OFF: 'nebi-wispr' })
    expect((await draw($, 'terminal', result('Write', WRITE))).texts).toEqual([line('terminal', 'wrote 3 lines · mods/x.ts')])
  })
})
