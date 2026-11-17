import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__nebi-plan-rail__plan'
const MINUTE = 60_000

const band = (surface: 'terminal' | 'desktop', bodyColumns: number, isWorking = true) =>
  ({
    plugin: 'nebi-plan-rail',
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns },
  }) as any

const pane = (surface: 'terminal' | 'desktop') =>
  ({
    plugin: 'nebi-plan-rail',
    surface,
    component: 'Pane',
    requestId: 'nebi-plan-rail',
    props: { title: 'Plan', isFocused: false, bodyColumns: 90, placement: 'dock' },
  }) as any

const STEPS = [
  { title: 'Read the brief', state: 'done' },
  { title: 'Sketch the layout', state: 'done' },
  { title: 'Write hero copy', state: 'doing', note: 'two headlines to pick from' },
  { title: 'Build the page', state: 'todo' },
  { title: 'Deploy', state: 'blocked', note: 'no Vercel token' },
]

const compose = (tools: string[]) =>
  ({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools, outputStyle: null, traits: [] }) as const

const run = (args: string) =>
  ({ command: 'plan-rail', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } }) as any

const call = (steps: readonly object[], extra: object = {}) =>
  ({ tool: TOOL, goal: 'Ship the pricing page', done: 'Live at /pricing, Lighthouse 95+', steps, ...extra }) as any

// Every string the drawing shows, in order.
function shown(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(shown).join('')
  if (typeof node !== 'object' || node === null) return ''
  return shown((node as { children?: unknown }).children)
}

// The engine beneath the plugin: everything it asks of `$`, answered from memory.
function engine(on: On, beneath?: string) {
  const clock = mock.clock(on, { now: 10 * MINUTE })
  const store: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  const played: unknown[] = []
  const opened: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__nebi-plan-rail__${e.name}` } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('audio.play', (_, e) => {
    played.push(e.clip)
    return { value: undefined }
  })
  const blits: string[] = []
  on('ui.blit', (_, e) => {
    blits.push(e.key)
    return { value: {} }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  on('ui.render', ($, e) =>
    beneath === undefined ? $.ui.resolve(e).Box({ children: [] }) : $.ui.resolve(e).Text({ children: [beneath] }),
  )

  return { clock, played, opened, store, blits }
}

describe('nebi-plan-rail', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`the tool replaces the plan and the prompt asks for it on ${surface}`, async ($, on) => {
      engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      const composed = await $.prompt.compose(compose(['Read', TOOL]))
      const section = composed.sections.at(-1)
      expect(section?.id).toBe('nebi-plan-rail:plan')
      expect(section?.scope).toBe('session')
      expect(section?.text).toContain(TOOL)
      expect(section?.text.split(/\s+/).length).toBeLessThan(80)
      // Not offered the tool (a subagent with its own tools): no section.
      const bare = await $.prompt.compose(compose(['Read']))
      expect(bare.sections.map(s => s.id)).toEqual(['intro'])

      const first = await $.tool.call(call(STEPS))
      expect(first.result).toBe('Plan shown to Nebi: 2/5 done.')
      const replaced = await $.tool.call(call([{ title: 'Only step', state: 'doing' }], { goal: 'Something else' }))
      expect(replaced.result).toBe('Plan shown to Nebi: 0/1 done.')

      const ui = await $.ui.mount(band(surface, 120))
      const text = shown(await ui.drawn())
      expect(text).toContain('Something else')
      expect(text).toContain('Only step')
      expect(text).not.toContain('Ship the pricing page')

      // Missing done criteria is refused, and the plan shown stays.
      const refused = await $.tool.call(call(STEPS, { done: '  ' }))
      expect(refused.isError ?? refused.deny).toBeTruthy()
      expect(shown(await ui.drawn())).toContain('Something else')
      await ui.unmount()
    })

    test(`the band draws the rail at narrow and wide widths on ${surface}`, async ($, on) => {
      const { clock, blits } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      await $.tool.call(call(STEPS))
      const wide = await $.ui.mount(band(surface, 200))
      await clock.advance(6 * MINUTE)
      const wideText = shown(await wide.drawn())
      expect(wideText).toContain('Ship the pricing page')
      for (const title of ['Read the brief', 'Sketch the layout', 'Write hero copy', 'Build the page', 'Deploy']) {
        expect(wideText).toContain(title)
      }
      expect(wideText).toContain('2/5 · 6m')
      expect(wideText).toContain('●')
      expect(wideText).toContain('○')
      expect(wideText).toContain('✕')
      expect(await wide.find({ type: 'Text', text: /^✕$/ })).toMatchObject({ props: { color: 'red' } })
      if (surface === 'terminal') expect(await wide.find({ type: 'Raster', key: 'pulse' })).toBeDefined()
      else expect(await wide.find({ type: 'Text', text: /^◐$/ })).toMatchObject({ props: { color: 'blue' } })
      await wide.unmount()

      // The doing step pulses in place on the terminal, and only while a step is doing.
      const pulses = blits.filter(key => key === 'pulse').length
      if (surface === 'terminal') expect(pulses).toBeGreaterThan(0)
      else expect(pulses).toBe(0)

      const narrow = await $.ui.mount(band(surface, 50))
      const narrowText = shown(await narrow.drawn())
      expect(narrowText).toContain('Write hero copy')
      expect(narrowText).toContain('2/5 · 6m')
      expect(narrowText).not.toContain('Sketch the layout')
      expect([...narrowText].length).toBeLessThanOrEqual(48)
      await narrow.unmount()

      // Nothing doing: the timer stops.
      await $.tool.call(call(STEPS.map(step => (step.state === 'doing' ? { ...step, state: 'done' } : step))))
      await clock.advance(1_000)
      const settled = blits.length
      await clock.advance(5_000)
      expect(blits.length).toBe(settled)
    })

    test(`a step finishing records its time and ticks on ${surface}`, async ($, on) => {
      const { clock, played, store } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      await $.tool.call(call(STEPS))
      await clock.advance(4 * MINUTE)

      const doneNow = STEPS.map(step => (step.title === 'Write hero copy' ? { ...step, state: 'done' } : step))
      const answer = await $.tool.call(call(doneNow))
      expect(answer.result).toBe('Plan shown to Nebi: 3/5 done.')
      await clock.settle()
      expect(played).toEqual([{ asset: 'sounds/tick.wav' }])

      const ui = await $.ui.mount(pane(surface))
      expect(await ui.find({ type: 'Text', text: /^Ship the pricing page$/ })).toBeDefined()
      expect(shown(await ui.drawn())).toContain('Done means: Live at /pricing, Lighthouse 95+')
      expect(shown(await ui.drawn())).toMatch(/Write hero copy\s+done\s+4m/)
      expect(shown(await ui.drawn())).toContain('no Vercel token')
      expect(shown(await ui.drawn())).toContain('3/5 · 4m')
      if (surface === 'terminal') expect(await ui.find({ type: 'Raster', key: 'bar' })).toBeDefined()

      // The same plan sent again flips nothing: no second tick.
      await $.tool.call(call(doneNow))
      await clock.settle()
      expect(played.length).toBe(1)

      // Sound off is kept, and the next finished step is silent.
      const off = await $.command.run(run('sound off'))
      expect(off.text).toBe('Plan sounds off.')
      expect(store.sound).toBe('off')
      await $.tool.call(call(doneNow.map(step => (step.title === 'Build the page' ? { ...step, state: 'done' } : step))))
      await clock.settle()
      expect(played.length).toBe(1)
      expect(await ui.find({ type: 'Button', key: 'sound' })).toMatchObject({ props: { label: 'sound: off' } })

      // The pane's own button turns it back on.
      await ui.press({ key: 'sound' })
      expect(store.sound).toBe('on')
      await ui.unmount()
    })

    test(`/plan-rail opens the pane and clears the plan on ${surface}`, async ($, on) => {
      const { opened } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      const empty = await $.command.run(run(''))
      expect(empty.text).toContain('No plan yet')
      expect(opened).toEqual(['nebi-plan-rail'])

      await $.tool.call(call(STEPS))
      const ui = await $.ui.mount(pane(surface))
      expect(await ui.find({ type: 'Text', text: /^Ship the pricing page$/ })).toBeDefined()
      expect(shown(await ui.drawn())).toContain('Done means: ')
      expect(shown(await ui.drawn())).toContain('Live at /pricing, Lighthouse 95+')

      const rail = await $.ui.mount(band(surface, 120))
      expect(shown(await rail.drawn())).toContain('Ship the pricing page')
      const cleared = await $.command.run(run('clear'))
      expect(cleared.text).toBe('Plan cleared.')
      expect(shown(await rail.drawn())).not.toContain('Ship the pricing page')
      expect(shown(await ui.drawn())).toContain('No plan yet')
      await rail.unmount()
      await ui.unmount()
    })

    test(`a finished plan steps aside at the next turn on ${surface}`, async ($, on) => {
      engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      await $.tool.call(call(STEPS.map(step => ({ ...step, state: 'done' }))))

      const ui = await $.ui.mount(band(surface, 120))
      expect(shown(await ui.drawn())).toContain('5/5 done')
      await $.turn.start({ text: 'thanks', turnId: 't2' } as any)
      expect(shown(await ui.drawn())).not.toContain('5/5')

      // A new plan brings it back.
      await $.tool.call(call(STEPS, { goal: 'Ship the docs page' }))
      expect(shown(await ui.drawn())).toContain('Ship the docs page')
      await ui.unmount()
    })

    test(`the pulse rests while the session is idle on ${surface}`, async ($, on) => {
      const { clock, blits } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      await $.turn.start({ text: 'build the pricing page', turnId: 't1' } as any)
      await $.tool.call(call(STEPS))
      const live = await $.ui.mount(band(surface, 120))
      await clock.advance(1_000)
      if (surface === 'terminal') expect(blits.length).toBeGreaterThan(0)

      // The turn stops to ask with a step still doing: no more frames.
      await $.turn.complete({ reason: 'answer', answer: 'Which headline?', durationMs: 1_000, isAborted: false, turnId: 't1' } as any)
      const atRest = blits.length
      await clock.advance(10_000)
      expect(blits.length).toBe(atRest)
      await live.unmount()

      // Idle, the doing step is a still ◐ on every surface.
      const idle = await $.ui.mount(band(surface, 120, false))
      expect(await idle.find({ type: 'Raster' })).toBeUndefined()
      expect(await idle.find({ type: 'Text', text: /^◐$/ })).toMatchObject({ props: { color: 'blue' } })
      await idle.unmount()

      // A subagent finishing does not stop the main turn's pulse.
      await $.turn.start({ text: 'the first one', turnId: 't2' } as any)
      const working = await $.ui.mount(band(surface, 120))
      const restarted = blits.length
      await $.turn.complete({ reason: 'answer', answer: 'scouted', durationMs: 1_000, isAborted: false, turnId: 't3', agentId: 'a1' } as any)
      await clock.advance(1_000)
      if (surface === 'terminal') expect(blits.length).toBeGreaterThan(restarted)
      else expect(blits.length).toBe(restarted)
      await working.unmount()
    })

    test(`the rail stacks under the other mods' rows on ${surface}`, async ($, on) => {
      engine(on, 'beneath')
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      const ui = await $.ui.mount(band(surface, 120))
      expect(shown(await ui.drawn())).toBe('beneath')
      await $.tool.call(call(STEPS))
      expect(shown(await ui.drawn())).toMatch(/^beneath.*Ship the pricing page/)
      await ui.unmount()
    })

    test(`a subagent's plan leaves the main one alone on ${surface}`, async ($, on) => {
      engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      await $.tool.call(call(STEPS))

      const ran = await $.tool.call(call([{ title: 'Scout the repo', state: 'doing' }], { goal: 'Scout', agentId: 'agent-1' }))
      expect(ran.result).toBe('Plan shown to Nebi: 0/1 done.')

      const ui = await $.ui.mount(band(surface, 120))
      expect(shown(await ui.drawn())).toContain('Ship the pricing page')
      expect(shown(await ui.drawn())).not.toContain('Scout the repo')
      await ui.unmount()
    })
  }
})
