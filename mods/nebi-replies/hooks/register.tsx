// Nebi Replies: the single owner of AssistantMessage.
//
// (a) A block whose last line is a ✅ or ⏳ status line (the Stop hook's
// STATUS_RE) draws its body as the engine does, then that line as a badge:
// black text on green DONE or blue WORKING, then its words. ❓ passes through
// untouched: nebi-beacon's band owns need-you.
// (b) Working notes: a main-loop step that went on to call tools marks its
// narration in `turn.step`: a short one-line block (under 240 characters, no
// `?`) that opens like "Let me", "I'll", "Next," or "Okay," and carries no
// heads-up, deviation, problem word, number with a unit, file path or status
// glyph (parts.ts `isNarration`). Status notes, "Heads up: … doing it as
// asked." and deviation notes always draw. AssistantMessage carries no step
// id, so a block is matched by its text; a text that ended a step without
// tools is a final reply and always draws. userConfig `notes`: hide (default)
// or show. A rewrite changes the drawing only; ctrl+o keeps the stored message.
//
// Fallback with no mod: the plain status line the output style asks for.
// NEBI_MODS_OFF (`all`, or a comma list naming nebi-replies) makes every hook pass.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { classifyStep, isNamedOff, isNarration, noteKey, splitStatus } from './parts'
import type { StepNotes } from './parts'

const notes = atom({ plugin: 'nebi-replies', key: 'notes' } as const, [])
const finals = atom({ plugin: 'nebi-replies', key: 'finals' } as const, [])

// The newest keys kept of each list; a session never needs more on screen.
const KEEP = 400
const LOOK = {
  done: { badge: ' DONE ', back: '#7ee2a8' },
  working: { badge: ' WORKING ', back: '#8ecbff' },
} as const

// Read once per load.
let off: Promise<boolean> | undefined
const isOff = ($: EngineInterface) => (off ??= $.env.get('NEBI_MODS_OFF').then(isNamedOff, () => false))

const keep = (list: readonly string[]) => [...new Set(list)].slice(-KEEP)

async function remember($: EngineInterface, found: StepNotes): Promise<void> {
  if (found.finals.length > 0) await update($, finals, list => keep([...list, ...found.finals]))
  const shown = await read($, finals)
  await update($, notes, list => keep([...list, ...found.notes]).filter(key => !shown.includes(key)))
}

export const register: Register = (on, options) => {
  const hidesNotes = options.notes !== 'show'

  on('turn.step', async function* ($, e, next) {
    if (!hidesNotes || e.agentId !== undefined || (await isOff($))) return yield* next(e)

    const stream = next(e)
    const blocks = new Map<number, string>()
    let isMarked = false
    for await (const chunk of stream) {
      if (chunk.kind === 'text') blocks.set(chunk.index, (blocks.get(chunk.index) ?? '') + chunk.text)
      // The step goes on to call a tool: hide its notes now, not once a long tool input has streamed.
      if (chunk.kind === 'tool' && !isMarked) {
        isMarked = true
        await remember($, classifyStep({ toolUses: [chunk], stopReason: 'tool_use' }, [...blocks.values()]))
      }
      yield chunk
    }
    const result = await stream.result
    const texts = blocks.size > 0 ? [...blocks.values()] : [result.answer]
    const found = classifyStep(result, texts)
    if (found.notes.length + found.finals.length > 0) await remember($, found)

    return result
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (await isOff($)) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    if (hidesNotes) {
      const key = noteKey(e.props.text)
      if (isNarration(key) && (await read($, notes)).includes(key) && !(await read($, finals)).includes(key)) {
        return <Box display="none" />
      }
    }

    const status = splitStatus(e.props.text)
    if (status === null) return next(e)

    const look = LOOK[status.kind]
    const badge = (
      <Box flexDirection="row" gap={1} marginTop={status.body === '' ? 0 : 1} paddingLeft={e.surface === 'terminal' ? 2 : 0}>
        <Box flexShrink={0}>
          <Text color="black" backgroundColor={look.back} bold>
            {look.badge}
          </Text>
        </Box>
        {status.words === '' ? null : (
          <Box flexShrink={1}>
            <Text>{status.words}</Text>
          </Box>
        )}
      </Box>
    )
    if (status.body === '') return badge

    // onScreen and the rest ride on as received; only the text loses its status line.
    const body = await next({ ...e, props: { ...e.props, text: status.body } })

    return (
      <Box flexDirection="column">
        {body}
        {badge}
      </Box>
    )
  })
}
