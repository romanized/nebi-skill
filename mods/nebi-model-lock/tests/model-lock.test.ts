import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { describeLock, lockLabel, parseLock, roleOf } from '../hooks/parse'

const CASES: [string, Record<string, string>][] = [
  ['use sonnet for scouts', { scout: 'sonnet' }],
  ['sonnet scouts', { scout: 'sonnet' }],
  ['fable checker', { checker: 'fable' }],
  ['all agents on haiku', { all: 'haiku' }],
  ['use opus sub-agents', { all: 'opus' }],
  ['scouts on haiku and a fable checker', { scout: 'haiku', checker: 'fable' }],
  ['Opus 5.5 builders, Sonnet 5 scouts', { builder: 'opus', scout: 'sonnet' }],
  ['reviewers: fable', { checker: 'fable' }],
  ['put the fleet on sonnet please', { all: 'sonnet' }],
  ['use haiku for the workers and opus for everyone else', { builder: 'haiku', all: 'opus' }],
  ['Use Sonnet for scouts. Then build the landing page.', { scout: 'sonnet' }],
  ['spin up two haiku sub agents', { all: 'haiku' }],
  ['use sonnet 5 for scouts and opus 5.5 for the checker', { scout: 'sonnet', checker: 'opus' }],
  ['fable checker, then later: fable scouts, no wait, haiku scouts', { checker: 'fable', scout: 'haiku' }],
  ['switch the scouts to haiku', { scout: 'haiku' }],
  ['move scouts to haiku', { scout: 'haiku' }],
  ['scout model: haiku', { scout: 'haiku' }],
  ['set scouts to haiku', { scout: 'haiku' }],
  ["it's fine, set scouts to haiku", { scout: 'haiku' }],
  // Talk about models, not an instruction: comparisons, prices, quotes, questions.
  ['sonnet scouts are cheaper than opus scouts', {}],
  ['haiku agents cost less, right?', {}],
  ["the test case 'sonnet scouts' fails", {}],
  ['the test case `sonnet scouts` fails', {}],
  ['compare opus agents vs sonnet agents', {}],
  ['compare opus agents vs. sonnet agents', {}],
  ['why did the haiku scouts miss it?', {}],
  ['are haiku scouts enough, or should I use sonnet?', {}],
  // Not a lock: no agent word, a poem, or a negation.
  ['write the sonnet poem', {}],
  ['a haiku about cats', {}],
  ['use opus', {}],
  ['use haiku', {}],
  ["don't use opus for scouts", {}],
  ['write a sonnet for my agents', {}],
  ['the opus is long, read it slowly', {}],
]

const SPAWN = {
  tool_use_id: 'tu1',
  prompt: 'do the thing',
  description: 'map the repo',
  subagentType: 'nebi-scout',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
}

const MODES = { plugin: 'nebi-model-lock', component: 'SessionMode', props: { modes: ['plan'] } } as const

const HINT = {
  plugin: 'nebi-model-lock',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts', tail: 'beacon' },
} as const

const say = (text: string) => ({ text, origin: { kind: 'composer' }, wait: false }) as any

// The engine beneath the plugin: records spawns, toasts and commands, draws the
// footer's labels joined as the engine joins them (or a hint's tail).
function engine(on: On, env: Record<string, string> = {}) {
  const spawned: (string | undefined)[] = []
  const toasts: string[] = []
  const commands: string[] = []
  mock.env(on, env)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('agent.spawn', (_, e) => {
    spawned.push(e.model)
    return { model: e.model ?? 'agent-default', agentId: `a${spawned.length}` }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const props = e.props as { modes?: readonly string[]; tail?: string }
    const text = e.component === 'SessionMode' ? (props.modes ?? []).join(' & ') : String(props.tail ?? '')

    return $.ui.resolve(e).Text({ children: [text] })
  })

  return { spawned, toasts, commands }
}

describe('nebi-model-lock', () => {
  test('the parser binds models to roles and ignores everything else', async () => {
    for (const [text, expected] of CASES) expect(parseLock(text), text).toEqual(expected)
    expect(roleOf('nebi-scout')).toBe('scout')
    expect(roleOf('Explore')).toBe('scout')
    expect(roleOf('nebi-checker')).toBe('checker')
    expect(roleOf('general-purpose')).toBe('builder')
    expect(roleOf('someplugin:nebi-scout')).toBe('scout')
    expect(describeLock({ scout: 'sonnet', checker: 'fable' })).toBe('scouts→sonnet · checker→fable')
  })

  test('the footer label is one short phrase of at most 20 cells', () => {
    expect(lockLabel({})).toBe('')
    expect(lockLabel({ scout: 'sonnet' })).toBe('🔒 sonnet scouts')
    expect(lockLabel({ checker: 'fable', scout: 'sonnet' })).toBe('🔒 sonnet scouts +1')
    expect(lockLabel({ all: 'haiku' })).toBe('🔒 haiku agents')
    // The longest phrase with a count is cut to fit; 🔒 counts two cells, as its two units.
    expect(lockLabel({ builder: 'sonnet', all: 'opus' })).toBe('🔒 sonnet builde… +1')
    for (const builder of ['opus', 'sonnet', 'haiku', 'fable'] as const) {
      expect(lockLabel({ scout: builder, checker: builder, builder, all: builder }).length).toBeLessThanOrEqual(20)
      expect(lockLabel({ builder, all: builder }).length).toBeLessThanOrEqual(20)
    }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`a named model holds every spawn of its role, without a toast, on ${surface}`, async ($, on) => {
      const { spawned, toasts } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      // Nothing locked yet: the spawn passes untouched.
      await $.agent.spawn({ ...SPAWN } as any)
      expect(spawned).toEqual([undefined])

      // A notification naming models is not the person speaking.
      await $.prompt.submit({ text: 'all agents on haiku', origin: { kind: 'task-notification' }, wait: false } as any)
      await $.agent.spawn({ ...SPAWN } as any)
      expect(spawned[1]).toBeUndefined()

      // The person names models: scouts and the checker are rewritten.
      await $.prompt.submit(say('scouts on sonnet and a fable checker, go'))
      await $.agent.spawn({ ...SPAWN } as any)
      await $.agent.spawn({ ...SPAWN, description: 'review the diff', subagentType: 'nebi-checker', model: 'haiku' } as any)
      expect(spawned.slice(2)).toEqual(['sonnet', 'fable'])

      // A spawn that already names the locked model is left alone.
      await $.agent.spawn({ ...SPAWN, model: 'sonnet' } as any)
      expect(spawned[4]).toBe('sonnet')

      // Builders are not locked yet; a later prompt adds them without touching scouts.
      await $.agent.spawn({ ...SPAWN, subagentType: 'general-purpose' } as any)
      expect(spawned[5]).toBeUndefined()
      await $.prompt.submit(say('use opus sub-agents for the rest'))
      await $.agent.spawn({ ...SPAWN, subagentType: 'general-purpose' } as any)
      await $.agent.spawn({ ...SPAWN } as any)
      expect(spawned.slice(6)).toEqual(['opus', 'sonnet'])

      // ocx- agents are pinned by their proxy and forks inherit: never touched.
      await $.agent.spawn({ ...SPAWN, subagentType: 'ocx-gpt-5-5', model: 'haiku' } as any)
      await $.agent.spawn({ ...SPAWN, subagentType: 'fork', fork: true } as any)
      expect(spawned.slice(8)).toEqual(['haiku', undefined])

      // /lock prints it as plain text, /lock off clears it, and spawns pass untouched again.
      expect((await $.command.run({ command: 'lock', args: '' } as any)).text).toBe('Model Lock: scouts→sonnet · checker→fable · agents→opus')
      expect((await $.command.run({ command: 'lock', args: 'off' } as any)).text).toMatch(/^Model Lock off/)
      await $.agent.spawn({ ...SPAWN } as any)
      expect(spawned[10]).toBeUndefined()
      expect((await $.command.run({ command: 'lock', args: '' } as any)).text).toMatch(/^Model Lock is off\./)

      // /lock with a phrase sets it directly.
      expect((await $.command.run({ command: 'lock', args: 'haiku scouts' } as any)).text).toBe('Model Lock: scouts→haiku')

      // Setting, holding and clearing never raised a toast.
      expect(toasts).toEqual([])
    })

    test(`the lock is one footer label while it holds, and no hint tail, on ${surface}`, async ($, on) => {
      engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      // No lock: the footer is the engine's.
      let footer = await $.ui.mount({ ...MODES, surface } as any)
      expect(await footer.find({ type: 'Text', text: /^plan$/ })).toBeDefined()
      await footer.unmount()

      // A lock appends one label after the others, once.
      await $.prompt.submit(say('sonnet scouts'))
      footer = await $.ui.mount({ ...MODES, surface } as any)
      expect(await footer.find({ type: 'Text', text: /^plan & 🔒 sonnet scouts$/ })).toBeDefined()
      await footer.unmount()

      // A second role adds a count, not a second label.
      await $.prompt.submit(say('and a fable checker'))
      footer = await $.ui.mount({ ...MODES, surface } as any)
      expect(await footer.find({ type: 'Text', text: /^plan & 🔒 sonnet scouts \+1$/ })).toBeDefined()
      await footer.unmount()

      // The hint line is not this mod's: its tail stays as another hook left it.
      const hint = await $.ui.mount({ ...HINT, surface } as any)
      expect(await hint.find({ type: 'Text', text: /^beacon$/ })).toBeDefined()
      await hint.unmount()

      // Cleared: the label goes.
      await $.command.run({ command: 'lock', args: 'off' } as any)
      footer = await $.ui.mount({ ...MODES, surface } as any)
      expect(await footer.find({ type: 'Text', text: /^plan$/ })).toBeDefined()
      await footer.unmount()
    })

    for (const value of ['nebi-model-lock', 'all', 'nebi-wispr, nebi-model-lock'] as const) {
      test(`NEBI_MODS_OFF=${value} leaves every spawn and the footer alone on ${surface}`, async ($, on) => {
        const { spawned, toasts, commands } = engine(on, { NEBI_MODS_OFF: value })
        await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
        expect(commands).toEqual([])

        await $.prompt.submit(say('sonnet scouts and a fable checker'))
        await $.agent.spawn({ ...SPAWN } as any)
        await $.agent.spawn({ ...SPAWN, subagentType: 'nebi-checker', model: 'haiku' } as any)
        expect(spawned).toEqual([undefined, 'haiku'])

        const footer = await $.ui.mount({ ...MODES, surface } as any)
        expect(await footer.find({ type: 'Text', text: /^plan$/ })).toBeDefined()
        await footer.unmount()
        expect(toasts).toEqual([])
      })
    }

    test(`a list naming another mod keeps the lock on ${surface}`, async ($, on) => {
      const { spawned } = engine(on, { NEBI_MODS_OFF: 'nebi-wispr' })
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      await $.prompt.submit(say('sonnet scouts'))
      await $.agent.spawn({ ...SPAWN } as any)
      expect(spawned).toEqual(['sonnet'])
    })
  }
})
