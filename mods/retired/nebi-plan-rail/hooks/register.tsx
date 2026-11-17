// Nebi Plan Rail: Claude's plan as a live rail above the prompt. The model
// states the goal, what done looks like and its steps through one tool; the
// band shows where the work stands at a glance, /plan-rail opens the whole
// plan with timings, and a soft tick plays as each step finishes.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Plan, PlanStep, PlanStepState } from '../types'

const TOOL = 'mcp__nebi-plan-rail__plan'
// `/plan` is Claude Code's own plan-mode command and a built-in's name is refused.
const COMMAND = 'plan-rail'
const PANE = 'nebi-plan-rail'
const SOUND_KEY = 'sound'

const GOAL_MAX = 120
const DONE_MAX = 240
const TITLE_MAX = 40
const NOTE_MAX = 240
const STEPS_MAX = 20

const plan = atom({ plugin: 'nebi-plan-rail', key: 'plan' } as const, null)
const isBandHidden = atom({ plugin: 'nebi-plan-rail', key: 'isBandHidden' } as const, false)
const now = atom({ plugin: 'nebi-plan-rail', key: 'now' } as const, 0)
const isSoundOn = atom({ plugin: 'nebi-plan-rail', key: 'isSoundOn' } as const, true)

const DESCRIPTION =
  "Show Nebi your plan as a live rail above his prompt. Each call replaces the whole plan: send the goal, what done looks like, and every step with its state. Call it before starting work with 3 or more steps, then again whenever a step changes state."

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    goal: { type: 'string', description: 'What the work achieves, in one short line.' },
    done: { type: 'string', description: 'What done looks like: the check that proves it.' },
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: STEPS_MAX,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: TITLE_MAX, description: 'Short and concrete, 40 characters at most.' },
          state: { type: 'string', enum: ['todo', 'doing', 'done', 'blocked'] },
          note: { type: 'string', description: 'Optional: why it is blocked, or what it turned up.' },
        },
        required: ['title', 'state'],
      },
    },
  },
  required: ['goal', 'done', 'steps'],
}

const SECTION = {
  id: 'nebi-plan-rail:plan',
  scope: 'session',
  text:
    `# Plan rail\nNebi watches a live plan rail above his prompt. For work with 3 or more steps, call ${TOOL} before you start, ` +
    'with the goal, what done looks like, and the steps. Call it again with the whole plan whenever a step changes state ' +
    '(todo, doing, done, blocked); keep one step doing at a time. Keep titles short and concrete.',
} as const

// Plan text comes from the model, which reads untrusted files and pages.
// Keep only what a person can see before drawing it (Next Steps' clean()).
const ESCAPE_SEQUENCES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g
const TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/u
const UNSEEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}\p{Variation_Selector}ᅟᅠㅤﾠ]/gu
const COMBINING_RUN = /(\p{M}{3})\p{M}+/gu

const width = (text: string) => [...text].length

export function cut(text: string, max: number): string {
  const points = [...text]
  if (points.length <= max) return text
  return max <= 0 ? '' : `${points.slice(0, max - 1).join('')}…`
}

export function clean(value: unknown, max: number): string {
  if (typeof value !== 'string' || TAG_CHARACTERS.test(value)) return ''
  const safe = value
    .replace(ESCAPE_SEQUENCES, '')
    .replace(/\s+/g, ' ')
    .replace(UNSEEN_CHARACTERS, '')
    .replace(COMBINING_RUN, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()

  return cut(safe, max)
}

export function clock(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`

  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

type StepInput = { title: string; state: PlanStepState; note: string }
type PlanInput = { goal: string; done: string; steps: StepInput[] }

const STATES: readonly string[] = ['todo', 'doing', 'done', 'blocked']

// The tool's input as the model sent it, cleaned; a string says what is wrong.
export function parseInput(input: Record<string, unknown>): PlanInput | string {
  const goal = clean(input.goal, GOAL_MAX)
  if (goal === '') return 'the goal is missing'
  const done = clean(input.done, DONE_MAX)
  if (done === '') return 'say what done looks like in `done`'

  let raw = input.steps
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return 'steps must be a list'
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) return 'list at least one step'

  const steps: StepInput[] = []
  for (const entry of raw.slice(0, STEPS_MAX)) {
    if (typeof entry !== 'object' || entry === null) continue
    const step = entry as Record<string, unknown>
    const title = clean(step.title, TITLE_MAX)
    if (title === '') continue
    const state = typeof step.state === 'string' && STATES.includes(step.state) ? (step.state as PlanStepState) : 'todo'
    steps.push({ title, state, note: clean(step.note, NOTE_MAX) })
  }

  return steps.length === 0 ? 'every step needs a title' : { goal, done, steps }
}

const doneCount = (steps: readonly { state: PlanStepState }[]) => steps.filter(step => step.state === 'done').length
const hasDoing = (p: Plan | null) => p !== null && p.steps.some(step => step.state === 'doing')
const sameTitle = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// The previous plan's step this one continues: the same title, else the step
// at the same place when its title is gone from the new plan (a rename).
function previousOf(before: readonly PlanStep[], steps: readonly StepInput[], index: number, taken: Set<number>) {
  const title = steps[index]?.title ?? ''
  let at = before.findIndex((old, i) => !taken.has(i) && sameTitle(old.title, title))
  const there = before[index]
  if (at === -1 && there !== undefined && !taken.has(index) && !steps.some(step => sameTitle(step.title, there.title))) {
    at = index
  }
  if (at === -1) return undefined
  taken.add(at)

  return before[at]
}

function timed(old: PlanStep | undefined, step: StepInput, lastUpdate: number | null, at: number): PlanStep {
  switch (step.state) {
    case 'todo':
      return { ...step, startedAt: null, endedAt: null }
    case 'doing':
      return { ...step, startedAt: old?.startedAt ?? at, endedAt: null }
    case 'blocked':
      return { ...step, startedAt: old?.startedAt ?? null, endedAt: null }
    case 'done':
      if (old === undefined) return { ...step, startedAt: null, endedAt: null }
      if (old.state === 'done') return { ...step, startedAt: old.startedAt, endedAt: old.endedAt }

      return { ...step, startedAt: old.startedAt ?? lastUpdate, endedAt: at }
  }
}

// Folds a tool call into the plan shown, keeping each step's timings, and
// counts the steps that just flipped to done.
export function merge(prev: Plan | null, input: PlanInput, at: number): { plan: Plan; flipped: number } {
  const kept = prev?.steps.filter(old => input.steps.some(step => sameTitle(step.title, old.title))).length ?? 0
  const isSame = prev !== null && (prev.goal === input.goal || kept * 2 >= prev.steps.length)
  const before = isSame ? prev.steps : []
  const taken = new Set<number>()
  let flipped = 0
  const steps = input.steps.map((step, index) => {
    const old = previousOf(before, input.steps, index, taken)
    if (old !== undefined && old.state !== 'done' && step.state === 'done') flipped += 1

    return timed(old, step, isSame ? prev.updatedAt : null, at)
  })
  const isFinished = steps.every(step => step.state === 'done')

  return {
    plan: {
      goal: input.goal,
      done: input.done,
      steps,
      startedAt: isSame ? prev.startedAt : at,
      updatedAt: at,
      finishedAt: isFinished ? ((isSame ? prev.finishedAt : null) ?? at) : null,
    },
    flipped,
  }
}

// ── The rail: one line sized to the band ────────────────────────────────────

export type Tone = 'goal' | 'gap' | 'rule' | 'fill' | PlanStepState | 'label' | 'focus' | 'stuck' | 'tail' | 'finished'
export type Piece = { text: string; tone: Tone }

const GLYPH: Record<PlanStepState, string> = { done: '●', doing: '◐', todo: '○', blocked: '✕' }

// The step the rail names: the one being done, else a blocked one, else the next.
function focusOf(steps: readonly PlanStep[]): number {
  for (const state of ['doing', 'blocked', 'todo'] as const) {
    const at = steps.findIndex(step => step.state === state)
    if (at !== -1) return at
  }

  return -1
}

// `others` caps the titles of the steps out of focus when every step is named.
type Fit = { labels: 'all' | 'focus'; rule: number; goal: number; focus: number; others: number }

function piecesFor(p: Plan, fit: Fit, tail: string): Piece[] {
  const focus = focusOf(p.steps)
  const pieces: Piece[] = []
  const goal = cut(p.goal, fit.goal)
  if (goal !== '') pieces.push({ text: goal, tone: 'goal' }, { text: '  ', tone: 'gap' })

  p.steps.forEach((step, index) => {
    if (index > 0) {
      const prevStep = p.steps[index - 1]
      const isLabeled = fit.labels === 'all' || index - 1 === focus
      const rule = `${isLabeled ? ' ' : ''}${'─'.repeat(fit.rule)}${fit.labels === 'all' ? ' ' : ''}`
      // The rail fills in as steps finish: a rule between two done steps is green.
      pieces.push({ text: rule, tone: prevStep?.state === 'done' && step.state === 'done' ? 'fill' : 'rule' })
    }
    pieces.push({ text: GLYPH[step.state], tone: step.state })
    if (fit.labels === 'all' || index === focus) {
      const label = cut(step.title, index === focus ? fit.focus : fit.others)
      const tone: Tone =
        step.state === 'blocked' ? 'stuck' : index === focus && step.state === 'doing' ? 'focus' : 'label'
      if (label !== '') pieces.push({ text: ` ${label}`, tone })
    }
  })
  pieces.push({ text: '  ', tone: 'gap' }, { text: tail, tone: p.finishedAt === null ? 'tail' : 'finished' })

  return pieces
}

const piecesWidth = (pieces: readonly Piece[]) => pieces.reduce((sum, piece) => sum + width(piece.text), 0)

// The richest rail that fits `columns`: every step named, then the others'
// titles shortened, then only the step in focus (the others as dots), then
// tighter rules, then a shorter goal and focus title.
export function railPieces(p: Plan, columns: number, elapsedMs: number): Piece[] {
  const room = Math.max(20, columns - 2)
  const count = `${doneCount(p.steps)}/${p.steps.length}`
  const tail = p.finishedAt === null ? `${count} · ${clock(elapsedMs)}` : `${count} done · ${clock(elapsedMs)}`
  const goalRoom = Math.max(12, Math.floor(room * 0.3))
  const tries: Fit[] = [
    ...[TITLE_MAX, 20, 14, 10].map(others => ({ labels: 'all' as const, rule: 2, goal: 0, focus: TITLE_MAX, others })),
    { labels: 'focus', rule: 2, goal: 0, focus: TITLE_MAX, others: 0 },
    { labels: 'focus', rule: 1, goal: 0, focus: TITLE_MAX, others: 0 },
  ]
  // The goal keeps at least its share; whatever the rail leaves over is the goal's too.
  const goalWant = Math.min(width(p.goal), goalRoom)
  for (const fit of tries) {
    const spare = room - piecesWidth(piecesFor(p, { ...fit, goal: 0 }, tail)) - 2
    if (spare >= goalWant) return piecesFor(p, { ...fit, goal: spare }, tail)
  }

  // Squeeze: what is left after the dots goes to the focus title, whole, then
  // to the goal; the title is cut only when even a bare goal leaves no room.
  const bare = piecesWidth(piecesFor(p, { labels: 'focus', rule: 1, goal: 0, focus: 0, others: 0 }, tail))
  const left = Math.max(0, room - bare)
  const focusStep = p.steps[focusOf(p.steps)]
  const focus = Math.min(focusStep === undefined ? 0 : width(focusStep.title) + 1, left)
  const goalLeft = left - focus - 2

  return piecesFor(p, { labels: 'focus', rule: 1, goal: goalLeft >= 6 ? goalLeft : 0, focus: Math.max(0, focus - 1), others: 0 }, tail)
}

// ── The pulse: the doing step's glyph, repainted in place ──────────────────

const DEFAULT_COLOR = 0x01000000
const PULSE = ['◐', '◓', '◑', '◒'] as const
const FRAME_MS = 125
const BLUE_DEEP = [0x09, 0x69, 0xda] as const
const BLUE_LIGHT = [0x54, 0xae, 0xff] as const
const COLOR: Record<PlanStepState, number> = { done: 0x2da44e, doing: 0x0969da, blocked: 0xcf222e, todo: 0x8c959f }

export function packCells(cells: readonly (readonly [string, number, number])[]): string {
  const bytes = new Uint8Array(cells.length * 12)
  const view = new DataView(bytes.buffer)
  cells.forEach(([glyph, fg, bg], i) => {
    view.setUint32(i * 12, glyph.codePointAt(0) ?? 0x20, true)
    view.setUint32(i * 12 + 4, fg, true)
    view.setUint32(i * 12 + 8, bg, true)
  })
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary)
}

// A slow breath between two blues, two seconds a cycle.
function breathe(frame: number): number {
  const t = (1 - Math.cos((frame / 16) * 2 * Math.PI)) / 2
  const mix = (i: 0 | 1 | 2) => Math.round(BLUE_DEEP[i] + (BLUE_LIGHT[i] - BLUE_DEEP[i]) * t)

  return (mix(0) << 16) | (mix(1) << 8) | mix(2)
}

const pulseCells = (frame: number) => packCells([[PULSE[Math.floor(frame / 2) % PULSE.length] ?? '◐', breathe(frame), DEFAULT_COLOR]])

// The pane's progress bar: one segment per step, colored by its state.
export function barCells(p: Plan, columns: number, frame: number): string {
  const n = p.steps.length
  const gap = columns >= n * 3 ? 1 : 0
  const usable = columns - gap * (n - 1)
  const cells: [string, number, number][] = []
  p.steps.forEach((step, i) => {
    const size = Math.floor(((i + 1) * usable) / n) - Math.floor((i * usable) / n)
    const fg = step.state === 'doing' ? breathe(frame) : COLOR[step.state]
    for (let k = 0; k < size; k++) cells.push([step.state === 'todo' ? '░' : '█', fg, DEFAULT_COLOR])
    if (gap && i < n - 1) cells.push([' ', DEFAULT_COLOR, DEFAULT_COLOR])
  })
  while (cells.length < columns) cells.push([' ', DEFAULT_COLOR, DEFAULT_COLOR])

  return packCells(cells.slice(0, columns))
}

// Module state for the animation alone: a hot reload drops the timer with it,
// and the next turn or plan call starts it again. The pulse runs only while a
// turn of the main loop runs: a turn that stops to ask leaves the doing step
// drawn still, so an idle session spends nothing on it.
let ticker: { cancel: () => void } | null = null
let isTurnRunning = false
let frame = 0
let shown: Plan | null = null
const bandSites = new Set<string>()
let paneBar: { columns: number } | null = null

function ensureTicker($: EngineInterface) {
  if (ticker !== null || !isTurnRunning || !hasDoing(shown)) return
  try {
    ticker = $.clock.every(FRAME_MS, () => void animate($))
  } catch (error) {
    $.ui.log(`plan pulse not started: ${String(error)}`)
  }
}

function stopTicker() {
  ticker?.cancel()
  ticker = null
}

async function animate($: EngineInterface) {
  const p = shown
  if (p === null || !hasDoing(p) || !isTurnRunning) {
    stopTicker()
    return
  }
  frame += 1
  for (const requestId of bandSites) {
    const blit = await $.ui.blit({ requestId, key: 'pulse', cells: pulseCells(frame) }).catch(() => ({ deny: 'gone' }))
    if (blit.deny !== undefined) bandSites.delete(requestId)
  }
  if (paneBar !== null) {
    const blit = await $.ui
      .blit({ requestId: PANE, key: 'bar', cells: barCells(p, paneBar.columns, frame) })
      .catch(() => ({ deny: 'gone' }))
    if (blit.deny !== undefined) paneBar = null
  }
  // The clock on the rail reads in minutes, so it redraws once a minute.
  const t = await $.clock.now()
  if (Math.floor(t / 60_000) !== Math.floor((await read($, now)) / 60_000)) await update($, now, () => t)
}

async function playTick($: EngineInterface) {
  if (!(await read($, isSoundOn))) return
  await $.audio.play({ asset: 'sounds/tick.wav' }, { gain: 0.35 }).catch(() => undefined)
}

async function setSound($: EngineInterface, isOn: boolean) {
  await update($, isSoundOn, () => isOn)
  await $.store.set(SOUND_KEY, isOn ? 'on' : 'off')
}

async function clearPlan($: EngineInterface) {
  shown = null
  await update($, plan, () => null)
  await update($, isBandHidden, () => false)
}

function isEmpty(node: RenderElement | null | undefined): boolean {
  if (!node) return true
  if (node.type !== 'Box') return false
  const loose = node as { children?: unknown; props?: { children?: unknown } }
  const children = loose.children ?? loose.props?.children

  return children == null || (Array.isArray(children) && children.length === 0)
}

function stepTime(step: PlanStep, at: number): string {
  if (step.startedAt === null) return ''
  return clock((step.endedAt ?? at) - step.startedAt)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.tool
      .register({ name: 'plan', description: DESCRIPTION, inputSchema: INPUT_SCHEMA })
      .catch(error => $.ui.log(`plan tool not registered: ${String(error)}`))
    await $.command
      .register({
        name: COMMAND,
        description: 'Open the plan pane, or: clear, sound on, sound off',
        argumentHint: '[clear | sound on | sound off]',
        immediate: true,
      })
      .catch(error => $.ui.log(`/${COMMAND} not registered: ${String(error)}`))
    const stored = await $.store.get(SOUND_KEY)
    await update($, isSoundOn, () => stored !== 'off')

    return result
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.includes(TOOL)) return composed

    return { sections: [...composed.sections.filter(section => section.id !== SECTION.id), SECTION] }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = parseInput(e as unknown as Record<string, unknown>)
    if (typeof input === 'string') return { deny: `Plan not shown: ${input}.` }
    const answer = { result: `Plan shown to Nebi: ${doneCount(input.steps)}/${input.steps.length} done.` }
    // A subagent's plan is its own business: answered, never drawn over the main one.
    if (e.agentId !== undefined) return answer

    isTurnRunning = true
    const at = await $.clock.now()
    const merged = merge(await read($, plan), input, at)
    shown = merged.plan
    await update($, plan, () => merged.plan)
    await update($, isBandHidden, () => false)
    await update($, now, () => at)
    if (merged.flipped > 0) void playTick($)
    ensureTicker($)

    return answer
  })

  // A finished plan stays up until the next turn starts, then steps aside;
  // an unfinished one starts pulsing again.
  on('turn.start', async ($, e, next) => {
    isTurnRunning = true
    const p = await read($, plan)
    if (p?.finishedAt != null && !(await read($, isBandHidden))) await update($, isBandHidden, () => true)
    shown = p
    ensureTicker($)

    return next(e)
  })

  // The main loop's turn is over: the pulse rests until the next one.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      isTurnRunning = false
      stopTicker()
    }

    return result
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const args = (e.args ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (args === 'clear') {
      await clearPlan($)
      return { text: 'Plan cleared.' }
    }
    if (args === 'sound on' || args === 'sound off') {
      await setSound($, args === 'sound on')
      return { text: `Plan sounds ${args === 'sound on' ? 'on' : 'off'}.` }
    }
    if (args !== '') return { text: `Usage: /${COMMAND} [clear | sound on | sound off]` }

    await $.ui.open({ id: PANE, title: 'Plan' })
    return { text: (await read($, plan)) === null ? 'No plan yet: the pane fills in when Claude sends one.' : 'Plan pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next): Promise<RenderElement> => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const p = await read($, plan)
    if (p === null || (await read($, isBandHidden))) return below

    shown = p
    const at = Math.max(await read($, now), p.updatedAt)
    const pieces = railPieces(p, e.props.bodyColumns, (p.finishedAt ?? at) - p.startedAt)
    // While idle the doing step is a still ◐; the Raster pulses only during a turn.
    const isPulsing = e.surface === 'terminal' && e.props.isWorking
    if (isPulsing) bandSites.add(e.requestId)
    else bandSites.delete(e.requestId)
    ensureTicker($)

    const { Box, Text } = $.ui.resolve(e)
    const Raster = isPulsing && e.surface === 'terminal' ? $.ui.resolve(e).Raster : null
    const look = (piece: Piece, key: string): RenderElement => {
      switch (piece.tone) {
        case 'goal':
          return <Text key={key} bold wrap="truncate-end">{piece.text}</Text>
        case 'done':
        case 'fill':
          return <Text key={key} color="green">{piece.text}</Text>
        case 'doing':
          return Raster !== null ? (
            <Raster key="pulse" columns={1} rows={1} cells={pulseCells(frame)} />
          ) : (
            <Text key={key} color="blue" bold>{piece.text}</Text>
          )
        case 'blocked':
        case 'stuck':
          return <Text key={key} color="red" bold>{piece.text}</Text>
        case 'focus':
          return <Text key={key} bold wrap="truncate-end">{piece.text}</Text>
        case 'finished':
          return <Text key={key} color="green" bold>{piece.text}</Text>
        default:
          return <Text key={key} dimColor wrap="truncate-end">{piece.text}</Text>
      }
    }
    const rail = (
      <Box flexDirection="row" paddingX={1}>
        {pieces.map((piece, i) => look(piece, `p${i}`))}
      </Box>
    )
    if (isEmpty(below)) return rail

    return (
      <Box flexDirection="column">
        {below}
        {rail}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, plan)
    const isOn = await read($, isSoundOn)
    const controls = (
      <Box flexDirection="row" gap={1} marginTop={1}>
        <Button key="sound" hotkey="s" label={`sound: ${isOn ? 'on' : 'off'}`} onPress={() => setSound($, !isOn)} />
        {p !== null && <Button key="clear" hotkey="c" label="clear plan" onPress={() => clearPlan($)} />}
      </Box>
    )
    if (p === null) {
      paneBar = null
      return (
        <Box flexDirection="column">
          <Text dimColor>No plan yet. Claude draws one here when work has 3 or more steps.</Text>
          {controls}
        </Box>
      )
    }

    shown = p
    const at = Math.max(await read($, now), p.updatedAt)
    const columns = Math.max(10, e.props.bodyColumns - 2)
    const count = `${doneCount(p.steps)}/${p.steps.length} · ${clock((p.finishedAt ?? at) - p.startedAt)}`
    const barColumns = Math.max(4, Math.min(60, columns - width(count) - 2))
    const titleWidth = Math.min(TITLE_MAX, Math.max(...p.steps.map(step => width(step.title))))
    const Raster = e.surface === 'terminal' ? $.ui.resolve(e).Raster : null
    paneBar = Raster !== null ? { columns: barColumns } : null
    ensureTicker($)

    const bar =
      Raster !== null ? (
        <Raster key="bar" columns={barColumns} rows={1} cells={barCells(p, barColumns, frame)} />
      ) : (
        <Text>
          {p.steps.map((step, i) => (
            <Text key={`b${i}`} color={step.state === 'done' ? 'green' : step.state === 'doing' ? 'blue' : step.state === 'blocked' ? 'red' : undefined} dimColor={step.state === 'todo'}>
              {(step.state === 'todo' ? '░' : '█').repeat(Math.max(1, Math.floor(barColumns / p.steps.length)))}
            </Text>
          ))}
        </Text>
      )

    return (
      <Box flexDirection="column">
        <Text bold wrap="wrap">{p.goal}</Text>
        <Text wrap="wrap">
          <Text dimColor>Done means: </Text>
          {p.done}
        </Text>
        <Box flexDirection="row" gap={2} marginTop={1}>
          {bar}
          <Text bold color={p.finishedAt === null ? undefined : 'green'}>{count}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {p.steps.map((step, i) => (
            <Box key={`s${i}`} flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Text color={step.state === 'done' ? 'green' : step.state === 'doing' ? 'blue' : step.state === 'blocked' ? 'red' : undefined} dimColor={step.state === 'todo'} bold={step.state !== 'todo'}>
                  {GLYPH[step.state]}
                </Text>
                <Text bold={step.state === 'doing'} dimColor={step.state === 'done' || step.state === 'todo'}>
                  {step.title.padEnd(titleWidth)}
                </Text>
                <Text color={step.state === 'blocked' ? 'red' : undefined} dimColor={step.state !== 'blocked'}>
                  {step.state.padEnd(7)}
                </Text>
                <Text dimColor>{stepTime(step, at)}</Text>
              </Box>
              {step.note !== '' && (
                <Box paddingLeft={2}>
                  <Text dimColor italic wrap="wrap">{step.note}</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
        {controls}
      </Box>
    )
  })
}
