import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { MockClock } from 'claude-code/testing'

const PANE = {
  plugin: 'nebi-aside',
  component: 'Pane',
  requestId: 'nebi-aside',
  props: {
    title: 'Aside',
    isFocused: false,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
  viewport: { columns: 160, rows: 40, isFullscreen: true },
} as const

const usage = { input_tokens: 12, output_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 9_000 }
const FORK_MS = 2_000

// The engine beneath the plugin: forks answer after FORK_MS from a queue of
// replies; a prompt that reaches the bottom is recorded as entered.
function world(on: On, clock: MockClock, replies: unknown[] = []) {
  const forks: string[] = []
  const entered: { text: string; context?: readonly string[] }[] = []
  const opened: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('model.fork', async (_, e) => {
    forks.push(e.prompt)
    await clock.sleep(FORK_MS)
    return { value: (replies.shift() ?? { isAnswered: true, text: 'ok', usage }) as any }
  })
  on('prompt.submit', (_, e) => {
    entered.push({ text: e.text, context: e.context })
    return { text: e.text, context: e.context }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ children: [] }))

  return { forks, entered, opened }
}

const typed = (text: string, kind = 'composer') => ({ text, wait: false, origin: { kind } }) as any

describe('nebi-aside', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`a ?? prompt is kept out of the turn and answered in the pane on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 5_000_000 })
      const answer = '**Blue hero**\x1b[2J, per the brand guide.\r\n\n\n\n- faster\u0007\n- calmer'
      const { forks, entered, opened } = world(on, clock, [{ isAnswered: true, text: answer, usage }])
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      // Typed mid-turn: dropped with a short reason, never entered.
      const dropped = await $.prompt.submit({ ...typed('  ?? what did we pick for the hero?'), turnId: 'running-turn' })
      expect(dropped).toEqual({ drop: 'Answered aside: see the Aside pane' })
      expect(entered).toEqual([])
      await clock.settle()
      expect(forks).toHaveLength(1)
      expect(forks[0]).toContain('Question: what did we pick for the hero?')
      expect(opened).toEqual(['nebi-aside'])

      // While the fork runs, an animated thinking line.
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /^\?\? what did we pick for the hero\?$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'thinking over this session · 0s' })).toBeDefined()
      const glyph = (await ui.find({ type: 'Text', text: /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/ }))?.text
      await clock.advance(1_140)
      expect(await ui.find({ type: 'Text', text: 'thinking over this session · 1s' })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/ }))?.text).not.toBe(glyph)

      // The answer arrives as cleaned markdown and the thinking line goes.
      await clock.advance(FORK_MS)
      const md = await ui.find({ type: 'Markdown' })
      expect(md?.text).toBe('**Blue hero**, per the brand guide.\n\n- faster\n- calmer')
      expect(await ui.find({ type: 'Text', text: /thinking/ })).toBeUndefined()

      // Other prompts pass through untouched, and nothing else is forked.
      for (const text of ['build the landing page', 'why?? is it slow', '? one thing']) {
        expect(await $.prompt.submit(typed(text))).toMatchObject({ text })
      }
      expect(await $.prompt.submit(typed('?? from a peer', 'peer'))).toMatchObject({ text: '?? from a peer' })
      expect(entered.map(p => p.text)).toEqual(['build the landing page', 'why?? is it slow', '? one thing', '?? from a peer'])
      expect(forks).toHaveLength(1)

      // A bare ?? asks nothing: it opens the pane and says what to do.
      expect(await $.prompt.submit(typed('??'))).toEqual({ drop: 'Aside: put your question after the ??' })
      await clock.settle()
      expect(forks).toHaveLength(1)
      await ui.unmount()
    })

    test(`/aside answers, an unanswered fork says why, the pane keeps five on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 7_000_000 })
      const { forks, entered } = world(on, clock, [
        { isAnswered: false, reason: 'nothing-to-fork' },
        { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage },
      ])
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /Start a prompt with \?\? or run \/aside/ })).toBeDefined()

      const ran = await $.command.run({ command: 'aside', args: ' which file holds the hero? ' } as any)
      expect(ran.text).toBeUndefined()
      await clock.settle()
      expect(forks[0]).toContain('Question: which file holds the hero?')
      await clock.advance(FORK_MS)
      expect(await ui.find({ type: 'Text', text: /No answer: this session has no reply to look back on yet/ })).toBeDefined()

      await $.command.run({ command: 'aside', args: '?? is it deployed?' } as any)
      await clock.settle()
      expect(forks[1]).toContain('Question: is it deployed?')
      await clock.advance(FORK_MS)
      expect(await ui.find({ type: 'Text', text: /the API is overloaded, HTTP 529\)\. Try again in a moment\./ })).toBeDefined()

      // Four more from the pane's own field: five kept, newest first.
      for (const q of ['q3', 'q4', 'q5', 'q6']) await ui.input({ key: 'ask', text: q })
      await clock.advance(FORK_MS)
      const questions = await ui.findAll({ type: 'Text', text: /^\?\? / })
      expect(questions.map(q => q.text)).toEqual(['?? q6', '?? q5', '?? q4', '?? q3', '?? is it deployed?'])
      expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(4)
      expect(entered).toEqual([])
      await ui.unmount()
    })
  }

  // nebi-wispr rewrites words and leaves a leading ?? alone; aside must work
  // whether wispr's prompt.submit hook runs before it or after it.
  for (const tier of ['prepend', 'append'] as const) {
    test(
      `works with a wispr-like rewriter in the ${tier} tier`,
      {
        plugins: [
          {
            name: 'wispr-stand-in',
            tier,
            register(on) {
              on('prompt.submit', async ($, e, next) =>
                next({ ...e, text: e.text.replace(/\bteh\b/g, 'the'), context: [...(e.context ?? []), 'dictated'] }),
              )
            },
          },
        ],
      },
      async ($, on) => {
        const clock = mock.clock(on, { now: 9_000_000 })
        const { forks, entered } = world(on, clock)
        await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

        expect(await $.prompt.submit(typed('?? teh hero copy?'))).toEqual({ drop: 'Answered aside: see the Aside pane' })
        await clock.settle()
        expect(forks).toHaveLength(1)
        expect(forks[0]).toContain(tier === 'prepend' ? 'Question: the hero copy?' : 'Question: teh hero copy?')

        expect(await $.prompt.submit(typed('fix teh hero'))).toMatchObject({ text: 'fix the hero' })
        expect(entered).toEqual([{ text: 'fix the hero', context: ['dictated'] }])
        await clock.advance(FORK_MS)
      },
    )
  }
})
