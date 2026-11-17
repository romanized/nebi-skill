import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { STATUS_RE, isNarration } from '../hooks/parts'

const PLUGIN = 'nebi-replies'
const ON_SCREEN = { first: 0, last: 2, of: 3 }
// claude-home/hooks/verify-before-stop.mjs:30, copied as written there.
const STOP_HOOK_RE = /^[\s>*_`]*(✅|⏳|❓)/u

type Step = { texts: string[]; tools: string[] }

// The engine beneath: it draws a reply block as its text and answers each model
// step from `steps`, streaming text in pieces, then the tool calls, then the stop.
function engine(on: On, env: Record<string, string> = {}) {
  const seen = { props: [] as unknown[] }
  const steps: Step[] = []
  mock.env(on, env)
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if (e.component !== 'AssistantMessage') return Box({ children: [] })
    seen.props.push(e.props)

    return Text({ children: e.props.text })
  })
  on('turn.step', async function* (_, e) {
    const step = steps.shift() ?? { texts: [], tools: [] }
    let index = 0
    for (const text of step.texts) {
      yield { kind: 'text' as const, index, text: text.slice(0, 6) }
      yield { kind: 'text' as const, index, text: text.slice(6) }
      index += 1
    }
    for (const [i, name] of step.tools.entries()) {
      yield { kind: 'tool' as const, index, id: `toolu_${i}`, name }
      yield { kind: 'input' as const, index, json: '{}' }
      index += 1
    }
    const stopReason = step.tools.length > 0 ? ('tool_use' as const) : ('end_turn' as const)
    yield { kind: 'stop' as const, stopReason, usage: null }

    return { turnId: e.turnId, index: e.index, answer: step.texts.join(''), toolUses: step.tools.map(name => ({ name, input: {} })), stopReason, usage: null }
  })

  return { seen, steps }
}

// One model step through every plugin, read to its end.
async function runStep($: any, index: number, agentId?: string) {
  const stream = $.turn.step({ turnId: 'turn-1', index, model: 'claude-opus-5-5', messageCount: 2 + index, ...(agentId === undefined ? {} : { agentId }) })
  for await (const _ of stream) {
    // drained
  }
  return stream.result
}

const block = (text: string, isFirstOfReply = false) => ({ text, isFirstOfReply, onScreen: ON_SCREEN })
const isHidden = async (ui: any) => {
  const tree = await ui.drawn()

  return tree.type === 'Box' && tree.props?.display === 'none'
}

describe('nebi-replies', () => {
  test('the status regex is the Stop hook one', () => {
    expect(STATUS_RE.source).toBe(STOP_HOOK_RE.source)
    expect(STATUS_RE.flags).toBe(STOP_HOOK_RE.flags)
  })

  test('only narration counts as a note that may hide', () => {
    for (const text of [
      'Let me read the file.',
      "Let's check the build.",
      'Now let me look at the tests.',
      'Now I’ll wire the hook.',
      "I'll check the config next.",
      'I will look at the hook.',
      'Next, the docs.',
      'First, the types.',
      'Okay, checking the hook now.',
      'OK, reading it.',
      'Alright, on to the tests.',
    ]) expect(isNarration(text), text).toBe(true)
    for (const text of [
      'Heads up: this deletes dist/ — doing it as asked.',
      "Let me do this. Heads up: it can't be undone.",
      'Tests pass; moving to the docs.',
      'Checking the build.',
      'I did it differently: the hook writes the file, not the mod.',
      "I'll use Bash instead of the Edit tool.",
      'Let me note a deviation from the plan.',
      'Let me rerun it: the first run failed.',
      'Let me look at the error.',
      'Let me retry, the call was blocked.',
      "I couldn't reach the API, so I'll try the CLI.",
      'Let me wait 30 s for the build.',
      'Let me check the 12 MB bundle.',
      'Let me read hooks/parts.ts.',
      'Let me read register.tsx.',
      'Let me check ~/.claude.',
      'Let me check ⚠ the warnings.',
      'Let me check the docs?',
    ]) expect(isNarration(text), text).toBe(false)
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const mount = ($: any, text: string, isFirstOfReply = false) =>
      $.ui.mount({ plugin: PLUGIN, surface, component: 'AssistantMessage', props: block(text, isFirstOfReply) })

    test(`a ✅ line becomes a green DONE badge under the body, onScreen carried, on ${surface}`, async ($, on) => {
      const { seen } = engine(on)
      const ui = await mount($, 'Wrote the mod and its tests.\n\n✅ Done — nebi-replies is ready to enable', true)
      expect(seen.props).toEqual([{ text: 'Wrote the mod and its tests.', isFirstOfReply: true, onScreen: ON_SCREEN }])
      expect(await ui.find({ type: 'Text', text: 'Wrote the mod and its tests.' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: ' DONE ' })).toMatchObject({ props: { color: 'black', backgroundColor: '#7ee2a8', bold: true } })
      expect(await ui.find({ type: 'Text', text: 'nebi-replies is ready to enable' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /✅/ })).toBeUndefined()
      await ui.unmount()
    })

    test(`a ⏳ line becomes a blue WORKING badge, and a block that is only the line is only the badge, on ${surface}`, async ($, on) => {
      const { seen } = engine(on)
      const ui = await mount($, '**⏳ Working — the build runs in the background**')
      expect(seen.props).toEqual([])
      expect(await ui.find({ type: 'Text', text: ' WORKING ' })).toMatchObject({ props: { color: 'black', backgroundColor: '#8ecbff' } })
      expect(await ui.find({ type: 'Text', text: 'the build runs in the background' })).toBeDefined()
      await ui.unmount()
    })

    test(`❓, no status line, and a ✅ line with text after it pass through untouched, on ${surface}`, async ($, on) => {
      const { seen } = engine(on)
      for (const text of [
        'Two names are free.\n\n❓ Need you — pick nebi.si or nebi-skill.si',
        'Here is what the file does.',
        '✅ tests pass\n✅ lint clean\nNext I wire the hook.',
      ]) {
        seen.props.length = 0
        const ui = await mount($, text)
        expect(seen.props).toEqual([block(text)])
        expect(await ui.drawn()).toMatchObject({ type: 'Text' })
        expect(await ui.find({ type: 'Text', text })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: / DONE | WORKING / })).toBeUndefined()
        await ui.unmount()
      }
    })

    test(`badge words are cleaned of escape sequences, on ${surface}`, async ($, on) => {
      engine(on)
      const ui = await mount($, 'Body.\n✅ Done — shipped \u001b[2Jthe\u0007 mod')
      expect(await ui.find({ type: 'Text', text: 'shipped the mod' })).toBeDefined()
      await ui.unmount()
    })

    test(`a mid-turn narration note hides once its step calls a tool; the final reply never hides, on ${surface}`, async ($, on) => {
      const { steps } = engine(on)
      const note = await mount($, 'Let me read the file.', true)
      const final = await mount($, 'Let me check the build.')
      expect(await isHidden(note)).toBe(false)

      // Hidden as soon as the tool call starts, before the step has finished streaming.
      steps.push({ texts: ['Let me read the file.'], tools: ['Read'] })
      const stream = $.turn.step({ turnId: 'turn-1', index: 0, model: 'claude-opus-5-5', messageCount: 2 })
      let hiddenAtTool: boolean | undefined
      for await (const chunk of stream) if (chunk.kind === 'tool') hiddenAtTool = await isHidden(note)
      await stream.result
      expect(hiddenAtTool).toBe(true)
      expect(await isHidden(note)).toBe(true)

      // A note with the same text as the final reply: the final reply wins, both draw.
      steps.push({ texts: ['Let me check the build.'], tools: ['Bash'] })
      await runStep($, 1)
      expect(await isHidden(final)).toBe(true)
      steps.push({ texts: ['Let me check the build.'], tools: [] })
      await runStep($, 2)
      expect(await isHidden(final)).toBe(false)
      steps.push({ texts: ['Let me check the build.'], tools: ['Bash'] })
      await runStep($, 3)
      expect(await isHidden(final)).toBe(false)

      // A final reply that opens like narration still draws.
      steps.push({ texts: ['Let me know if you want the docs too.'], tools: [] })
      await runStep($, 4)
      const closing = await mount($, 'Let me know if you want the docs too.')
      expect(await isHidden(closing)).toBe(false)
      await closing.unmount()

      // Notes that stay: a question, two lines, a status glyph, 240 characters or more.
      const kept = ['Let me check: also the docs?', 'Let me read both files.\nThen the tests.', '⏳ Working — tests run', `Let me read ${'x'.repeat(240)}`]
      steps.push({ texts: kept, tools: ['Read'] })
      await runStep($, 5)
      for (const text of kept) {
        const ui = await mount($, text)
        expect(await isHidden(ui)).toBe(false)
        await ui.unmount()
      }

      // A sub-agent's steps never hide anything in the main transcript.
      steps.push({ texts: ['Let me scan the repo.'], tools: ['Grep'] })
      await runStep($, 0, 'agent-1')
      const scanning = await mount($, 'Let me scan the repo.')
      expect(await isHidden(scanning)).toBe(false)
      await Promise.all([note.unmount(), final.unmount(), scanning.unmount()])
    })

    test(`notes the doctrine needs stay mid-turn: a heads-up, a status note, a deviation, on ${surface}`, async ($, on) => {
      const { steps, seen } = engine(on)
      const kept = [
        'Heads up: this deletes dist/ — doing it as asked.',
        'Tests pass; moving to the docs.',
        "I'll do this differently: the hook writes the file, not the mod.",
        'Let me rerun it: the first run failed.',
      ]
      steps.push({ texts: [...kept, 'Let me read the file.'], tools: ['Bash'] })
      await runStep($, 0)
      for (const text of kept) {
        seen.props.length = 0
        const ui = await mount($, text)
        expect(await isHidden(ui), text).toBe(false)
        expect(seen.props).toEqual([block(text)])
        await ui.unmount()
      }
      const narration = await mount($, 'Let me read the file.')
      expect(await isHidden(narration)).toBe(true)
      await narration.unmount()
    })

    test(`notes: show keeps mid-turn notes, on ${surface}`, { options: { notes: 'show' } }, async ($, on) => {
      const { steps, seen } = engine(on)
      steps.push({ texts: ['Let me read the file.'], tools: ['Read'] })
      await runStep($, 0)
      const ui = await mount($, 'Let me read the file.')
      expect(await isHidden(ui)).toBe(false)
      expect(seen.props).toEqual([block('Let me read the file.')])
      await ui.unmount()
    })

    for (const value of ['all', 'nebi-quiet, nebi-replies']) test(`NEBI_MODS_OFF=${value} passes everything, on ${surface}`, async ($, on) => {
      const { steps, seen } = engine(on, { NEBI_MODS_OFF: value })
      steps.push({ texts: ['Let me read the file.'], tools: ['Read'] })
      await runStep($, 0)
      const note = await mount($, 'Let me read the file.')
      expect(await isHidden(note)).toBe(false)
      const done = 'Body.\n\n✅ Done — X'
      const ui = await mount($, done)
      expect(seen.props).toEqual([block('Let me read the file.'), block(done)])
      expect(await ui.find({ type: 'Text', text: ' DONE ' })).toBeUndefined()
      await Promise.all([note.unmount(), ui.unmount()])
    })

    test(`NEBI_MODS_OFF naming another mod leaves this one on, on ${surface}`, async ($, on) => {
      engine(on, { NEBI_MODS_OFF: 'nebi-quiet' })
      const ui = await mount($, 'Body.\n\n✅ Done — X')
      expect(await ui.find({ type: 'Text', text: ' DONE ' })).toBeDefined()
      await ui.unmount()
    })
  }
})
