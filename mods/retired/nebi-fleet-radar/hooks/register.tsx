// Nebi Fleet Radar: /fleet opens a pane of swimlanes, one per model loop
// (main and every sub-agent): who it is, what it runs on, its state, how long
// it has worked and what it has spent, then a lane of time buckets colored by
// what it was doing. The lanes are one Raster, slid along once a second by
// $.ui.blit while anything runs. The footer says how much of the 5-hour
// quota is used and how much the fleet added since its first spawn.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, Timer } from 'claude-code'

import type { RadarActivity, RadarLoop, RadarQuota, RadarStatus } from '../types'
import {
  ACTIVITY_COLOR,
  activityOf,
  buildGrid,
  hex,
  layoutFor,
  pack,
  runs,
  shortModel,
  windowMs,
  type Layout,
} from './grid'

const PANE = 'nebi-fleet-radar'
const TITLE = 'Fleet Radar'
const MAIN = 'main'
const MAX_LOOPS = 30
const MAX_SPANS = 400
const KEEP_MS = 60 * 60_000

const loops = atom({ plugin: 'nebi-fleet-radar', key: 'loops' } as const, [])
const quota = atom({ plugin: 'nebi-fleet-radar', key: 'quota' } as const, { percent: null, base: null, resetsAt: null })
const now = atom({ plugin: 'nebi-fleet-radar', key: 'now' } as const, 0)
const windowMin = atom({ plugin: 'nebi-fleet-radar', key: 'windowMin' } as const, 0)
const autoOpened = atom({ plugin: 'nebi-fleet-radar', key: 'autoOpened' } as const, false)

const LEGEND: readonly RadarActivity[] = ['read', 'edit', 'bash', 'web', 'spawn', 'error']

const clean = (text: string) =>
  text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const isRunning = (loop: RadarLoop) => loop.status === 'running'
const spent = (u: ModelUsage) =>
  u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
const closeLive = (live: RadarLoop['live'], t: number): RadarLoop['live'] => live.map(([s, e]) => [s, e ?? t])

function blank(id: string, t: number): RadarLoop {
  return id === MAIN
    ? { id, name: 'main', type: 'main', model: '', status: 'idle', live: [], tokens: 0, spans: [] }
    : // A loop seen before its spawn was (spawned before this mod loaded).
      { id, name: `agent ${id.slice(0, 6)}`, type: '', model: '?', status: 'running', live: [[t, null]], tokens: 0, spans: [] }
}

// Main first, then sub-agents in spawn order; past MAX_LOOPS the oldest finished go.
function ordered(list: readonly RadarLoop[]): RadarLoop[] {
  const main = list.filter(loop => loop.id === MAIN)
  let rest = list.filter(loop => loop.id !== MAIN)
  while (main.length + rest.length > MAX_LOOPS) {
    const gone = rest.findIndex(loop => !isRunning(loop))
    rest = rest.filter((_, i) => i !== (gone < 0 ? 0 : gone))
  }

  return [...main, ...rest]
}

function withLoop(list: readonly RadarLoop[], id: string, t: number, change: (loop: RadarLoop) => RadarLoop): RadarLoop[] {
  const at = list.findIndex(loop => loop.id === id)
  const next = at < 0 ? [...list, change(blank(id, t))] : list.map((loop, i) => (i === at ? change(loop) : loop))

  return ordered(next)
}

function statusFromList(status: string): RadarStatus | null {
  if (status === 'running') return 'running'
  if (status === 'completed') return 'done'
  if (status === 'failed') return 'failed'
  if (status === 'killed' || status === 'stopped' || status === 'cancelled') return 'killed'

  return null
}

// Module state: the ticker, and what the last drawing measured. A reload drops
// both; the next event restarts the ticker and the next drawing re-measures.
let ticker: Timer | null = null
let isFullscreen: boolean | undefined
let mounted: { layout: Layout; viewAgent?: string } | null = null

async function readQuota($: EngineInterface): Promise<Pick<RadarQuota, 'percent' | 'resetsAt'> | null> {
  const usage = await $.session.usage().catch(() => null)
  const five = usage?.rateLimits.find(limit => limit.kind === 'five_hour')

  return five ? { percent: five.percentUsed, resetsAt: five.resetsAt ?? null } : null
}

async function refreshQuota($: EngineInterface) {
  const reading = await readQuota($)
  if (!reading) return
  const hasFleet = (await read($, loops)).some(loop => loop.id !== MAIN)
  const before = await read($, quota)
  const base = before.base ?? (hasFleet ? reading.percent : null)
  if (before.percent !== reading.percent || before.base !== base || before.resetsAt !== reading.resetsAt) {
    await update($, quota, () => ({ ...reading, base }))
  }
}

// What $.agent.list() says now: statuses, and names for loops seen before their spawn.
async function syncAgents($: EngineInterface, t: number) {
  const agents = await $.agent.list().catch(() => [])
  const apply = (list: RadarLoop[]): RadarLoop[] => {
    let next = list
    for (const agent of agents) {
      const status = statusFromList(agent.status)
      const known = next.find(loop => loop.id === agent.id)
      if (!known && status !== 'running') continue
      const loop = known ?? blank(agent.id, t)
      const isNamed = loop.type === '' && agent.type !== ''
      // The list only ends a run here: a loop comes back to life by calling a tool.
      const ends = status !== null && status !== 'running' && isRunning(loop)
      if (known && !isNamed && !ends) continue
      next = withLoop(next, agent.id, t, () => ({
        ...loop,
        ...(isNamed ? { name: clean(agent.description).slice(0, 60) || loop.name, type: agent.type } : {}),
        ...(ends && status ? { status, live: closeLive(loop.live, t) } : {}),
      }))
    }

    return next
  }
  const before = await read($, loops)
  if (apply(before) !== before) await update($, loops, apply)
}

async function tick($: EngineInterface) {
  const t = await $.clock.now()
  await syncAgents($, t)
  await refreshQuota($)
  await update($, now, () => t)

  const list = await read($, loops)
  if (mounted) {
    const { layout, viewAgent } = mounted
    const grid = buildGrid(list, layout, t, windowMs(await read($, windowMin), list, t), viewAgent)
    const blit = await $.ui
      .blit({ requestId: PANE, key: 'lanes', cells: pack(grid), columns: layout.columns, rows: layout.rows })
      .catch(() => ({ deny: 'blit failed' }))
    if (blit.deny !== undefined) mounted = null
  }

  if (!list.some(isRunning)) {
    ticker?.cancel()
    ticker = null
  }
}

function ensureTicker($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(1000, () => void tick($).catch(() => undefined))
}

async function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: TITLE })
}

const percent = (n: number) => `${Math.round(n * 10) / 10}%`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'fleet',
      description: 'Open the Fleet Radar: live swimlanes for the main loop and every sub-agent',
      argumentHint: '[minutes | auto]',
      immediate: true,
    })
    const t = await $.clock.now()
    await update($, loops, list => withLoop(list, MAIN, t, loop => loop))

    return result
  })

  on('turn.start', async ($, e, next) => {
    const t = await $.clock.now()
    await update($, loops, list =>
      withLoop(list, MAIN, t, loop => ({ ...loop, status: 'running', live: [...closeLive(loop.live, t), [t, null]] })),
    )
    ensureTicker($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const id = e.agentId ?? MAIN
    const t = await $.clock.now()
    const status: RadarStatus =
      id === MAIN ? 'idle' : e.isAborted ? 'killed' : e.reason === 'answer' ? 'done' : 'failed'
    await update($, loops, list =>
      list.some(loop => loop.id === id)
        ? withLoop(list, id, t, loop => ({
            ...loop,
            status,
            live: closeLive(loop.live, t),
            tokens: loop.tokens + (e.usage ? spent(e.usage) : 0),
            model: e.usage?.model && !loop.type.startsWith('ocx-') ? shortModel(e.usage.model) : loop.model,
          }))
        : list,
    )
    await refreshQuota($)

    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const kind = activityOf(String(e.tool))
    const start = await $.clock.now()
    const isOpen = (s: { start: number; end: number | null; kind: RadarActivity }) =>
      s.start === start && s.end === null && s.kind === kind
    await update($, loops, list =>
      withLoop(list, id, start, loop => ({
        ...loop,
        // A sub-agent resumed after it finished is working again.
        ...(id !== MAIN && !isRunning(loop) ? { status: 'running' as const, live: [...loop.live, [start, null]] } : {}),
        spans: [...loop.spans.filter(s => (s.end ?? start) >= start - KEEP_MS), { kind, start, end: null }].slice(-MAX_SPANS),
      })),
    )
    ensureTicker($)

    let failed = true
    try {
      const result = await next(e)
      failed = result.deny !== undefined || result.isError === true

      return result
    } finally {
      const end = await $.clock.now()
      await update($, loops, list =>
        withLoop(list, id, end, loop => {
          const at = loop.spans.findIndex(isOpen)
          if (at < 0) return loop
          const spans = [...loop.spans]
          spans[at] = { kind: failed ? 'error' : kind, start, end }

          return { ...loop, spans }
        }),
      )
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const id = result.agentId
    if (result.deny !== undefined || !id) return result

    const t = await $.clock.now()
    const model = e.fork
      ? e.parentModel
      : e.subagentType === 'ocx-self'
        ? e.parentModel
        : e.subagentType.startsWith('ocx-')
          ? e.subagentType
          : result.model
    await update($, loops, list => {
      const withMain = e.parentAgentId
        ? list
        : withLoop(list, MAIN, t, loop => ({ ...loop, model: loop.model || shortModel(e.parentModel) }))

      return withLoop(withMain, id, t, loop => ({
        ...loop,
        name: clean(e.description || e.name || e.subagentType).slice(0, 60),
        type: e.subagentType,
        model: shortModel(model),
        status: 'running',
        live: [...closeLive(loop.live, t).filter(([s, end]) => end !== null && end > s), [t, null]],
      }))
    })
    await refreshQuota($)
    ensureTicker($)

    // A second sub-agent running at once: show the radar unasked, once, and
    // only where a pane docks beside the transcript.
    const running = (await read($, loops)).filter(loop => loop.id !== MAIN && isRunning(loop)).length
    if (running >= 2 && isFullscreen === true && !(await read($, autoOpened))) {
      await update($, autoOpened, () => true)
      void openPane($).catch(() => undefined)
    }

    return result
  })

  on('command.run', { command: 'fleet' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const minutes = Number.parseFloat(arg)
    if (arg === 'auto') await update($, windowMin, () => 0)
    else if (Number.isFinite(minutes) && minutes > 0) await update($, windowMin, () => Math.min(240, minutes))
    await refreshQuota($)
    const opened = await openPane($)
    const tracked = (await read($, loops)).filter(loop => loop.id !== MAIN).length
    const wait = opened.isPlaced ? '' : ` (${opened.reason})`

    return { text: `Fleet Radar open: ${tracked} sub-agent${tracked === 1 ? '' : 's'} tracked${wait}.` }
  })

  // The footer is drawn on every screen: the one place to learn whether a
  // pane would dock beside the transcript. It passes through untouched.
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    isFullscreen = e.viewport?.isFullscreen
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, loops)
    const q = await read($, quota)
    const minutes = await read($, windowMin)
    // The desktop has no Raster to blit: it redraws on the ticker's `now`.
    if (e.surface !== 'terminal') await read($, now)
    const t = await $.clock.now()

    const layout = layoutFor(e.props.bodyColumns, list.length)
    const spanMs = windowMs(minutes, list, t)
    const viewAgent = e.props.view.agentId
    const grid = buildGrid(list, layout, t, spanMs, viewAgent)

    const agents = list.filter(loop => loop.id !== MAIN)
    const count = (status: RadarStatus) => agents.filter(loop => loop.status === status).length
    const summary = [
      `${count('running')} running`,
      `${count('done')} done`,
      count('failed') + count('killed') > 0 ? `${count('failed') + count('killed')} stopped` : '',
      minutes > 0 ? `${minutes}m window` : '',
    ]
      .filter(Boolean)
      .join(' · ')

    const isHot = q.percent !== null && q.percent >= 80
    const quotaText = q.percent === null ? '5h quota: no reading yet' : `5h ${percent(q.percent)}`
    const fleetText = q.percent !== null && q.base !== null ? `fleet +${percent(Math.max(0, q.percent - q.base))}` : ''
    const resetsMs = q.resetsAt ? Date.parse(q.resetsAt) - t : Number.NaN
    const resets =
      resetsMs > 0 && resetsMs <= 5 * 3_600_000
        ? `resets in ${Math.floor(resetsMs / 3_600_000)}h${String(Math.floor((resetsMs % 3_600_000) / 60_000)).padStart(2, '0')}`
        : ''

    const { Box, Text } = $.ui.resolve(e)
    const header = (
      <Box key="header" flexDirection="row" justifyContent="space-between" gap={2}>
        <Text wrap="truncate">{summary}</Text>
        <Box flexDirection="row" gap={1} flexShrink={0}>
          {LEGEND.map(kind => (
            <Box key={`legend-${kind}`} flexDirection="row">
              <Text color={hex(ACTIVITY_COLOR[kind])}>■</Text>
              <Text> {kind}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
    const footer = (
      <Box key="quota" flexDirection="row" gap={1}>
        <Text
          color={isHot ? 'black' : undefined}
          backgroundColor={isHot ? (q.percent !== null && q.percent >= 95 ? 'red' : 'yellow') : undefined}
          bold={isHot}
        >
          {isHot ? ` ${quotaText} ` : quotaText}
        </Text>
        {fleetText ? <Text>· {fleetText}</Text> : null}
        {resets ? <Text dimColor>· {resets}</Text> : null}
      </Box>
    )
    const empty =
      agents.length === 0 ? <Text dimColor>No sub-agents yet. Each spawn gets a lane here as it starts.</Text> : null

    if (e.surface === 'terminal') {
      mounted = { layout, viewAgent }
      const { Raster } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          {header}
          <Raster key="lanes" columns={layout.columns} rows={layout.rows} cells={pack(grid)} />
          {empty}
          {footer}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {header}
        {grid.map((row, y) => (
          <Box key={`row-${y}`} flexDirection="row">
            {runs(row).map(run => (
              <Text color={hex(run.fg)} backgroundColor={hex(run.bg)}>
                {run.text}
              </Text>
            ))}
          </Box>
        ))}
        {empty}
        {footer}
      </Box>
    )
  })
}
