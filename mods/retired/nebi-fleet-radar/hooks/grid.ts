// The Fleet Radar's picture: one row of cells per loop (its head, then its
// lane of time buckets) and an axis row, packed for a terminal Raster or cut
// into colored text runs where a surface has no Raster. No engine calls here.
import type { RadarActivity, RadarLoop, RadarStatus } from '../types'

export type Cell = { ch: number; fg: number; bg: number }

// The terminal's own color, and black for text on a badge.
export const DEFAULT = 0x01000000
const BLACK = 0x000000
const AXIS = 0x8a8a8a

export const ACTIVITY_COLOR: Record<RadarActivity, number> = {
  read: 0x3b82f6,
  edit: 0x22a35a,
  bash: 0xe0b000,
  web: 0xc026d3,
  spawn: 0x06b6d4,
  error: 0xe5383b,
}
export const IDLE_COLOR = 0x9ca3af

export const STATUS_LOOK: Record<RadarStatus, { label: string; color: number }> = {
  running: { label: 'RUN', color: 0x38bdf8 },
  done: { label: 'DONE', color: 0x4ade80 },
  failed: { label: 'FAIL', color: 0xf87171 },
  killed: { label: 'KILL', color: 0xfb923c },
  idle: { label: 'IDLE', color: 0xd4d4d4 },
}

// A bucket two kinds share goes to the louder one; an error always shows.
const PRIORITY: readonly RadarActivity[] = ['error', 'edit', 'bash', 'spawn', 'web', 'read']

const TOOL_KIND: Record<string, RadarActivity> = {
  Read: 'read',
  Glob: 'read',
  Grep: 'read',
  LS: 'read',
  LSP: 'read',
  NotebookRead: 'read',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'bash',
  BashOutput: 'bash',
  KillShell: 'bash',
  Monitor: 'bash',
  PowerShell: 'bash',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'spawn',
  Task: 'spawn',
  SendMessage: 'spawn',
  Workflow: 'spawn',
}

const GLYPH = {
  blank: 0x20,
  busy: 0x2586, // ▆
  busyPulse: 0x2588, // █
  idle: 0x2500, // ─
  idlePulse: 0x2501, // ━
  viewed: 0x25b8, // ▸
  ellipsis: 0x2026, // …
  question: 0x3f,
}

export function activityOf(tool: string): RadarActivity {
  // An MCP tool reaches a service outside the machine: count it as web.
  return TOOL_KIND[tool] ?? (tool.startsWith('mcp__') ? 'web' : 'read')
}

/** "claude-sonnet-5-20260901" → "sonnet"; "ocx-gpt-5-6-luna" → "gpt5.6". */
export function shortModel(model: string): string {
  const id = model.toLowerCase()
  for (const family of ['fable', 'opus', 'sonnet', 'haiku']) if (id.includes(family)) return family
  const gpt = /gpt[-_ ]?(\d+)(?:[.-](\d+))?/.exec(id)
  if (gpt) return `gpt${gpt[1]}${gpt[2] ? `.${gpt[2]}` : ''}`.slice(0, 6)
  if (id.includes('gpt')) return 'gpt'

  return id.replace(/^claude-/, '').slice(0, 6) || '?'
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`

  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}

export function tokens(n: number): string {
  if (n <= 0) return '-'
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`

  return `${(n / 1_000_000).toFixed(1)}M`
}

const WINDOWS_MIN = [2, 5, 10, 15, 30, 60]

/** The span the lanes cover: the minutes asked for, or the smallest that holds the fleet. */
export function windowMs(windowMin: number, loops: readonly RadarLoop[], now: number): number {
  if (windowMin > 0) return windowMin * 60_000
  const hour = now - 60 * 60_000
  const starts = loops.flatMap(loop => [...loop.live.map(([s]) => s), ...loop.spans.map(span => span.start)])
  const earliest = Math.min(now, ...starts.filter(t => t >= hour))
  const needed = (now - earliest) * 1.1
  const fit = WINDOWS_MIN.find(min => min * 60_000 >= needed) ?? 60

  return fit * 60_000
}

export type Layout = {
  columns: number
  rows: number
  head: number
  nameWidth: number
  isWide: boolean
}

// Wide head: ▸ name(18) model(6) badge(6) time(5) tokens(5), one space after each.
const WIDE_HEAD = 46
const NARROW_HEAD = 28

export function layoutFor(bodyColumns: number, loopCount: number): Layout {
  const columns = Math.max(36, Math.min(512, Math.floor(bodyColumns)))
  const isWide = columns - WIDE_HEAD >= 24
  const head = isWide ? WIDE_HEAD : NARROW_HEAD

  return { columns, rows: Math.min(256, loopCount + 1), head, nameWidth: isWide ? 18 : 12, isWide }
}

// A code point a Raster cell takes: printable ASCII and Latin letters; the rest reads as "?".
const safe = (cp: number) => ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xc0 && cp <= 0x17f) ? cp : GLYPH.question)

function fit(text: string, width: number): number[] {
  const points = [...text].map(ch => safe(ch.codePointAt(0) ?? GLYPH.question))
  if (points.length <= width) return points

  return [...points.slice(0, width - 1), GLYPH.ellipsis]
}

function write(row: Cell[], x: number, text: string, width: number, fg = DEFAULT, bg = DEFAULT, alignRight = false) {
  const points = fit(text, width)
  const at = alignRight ? x + width - points.length : x
  points.forEach((ch, i) => {
    if (row[at + i]) row[at + i] = { ch, fg, bg }
  })
}

function fill(width: number): Cell[] {
  return Array.from({ length: width }, () => ({ ch: GLYPH.blank, fg: DEFAULT, bg: DEFAULT }))
}

/** Milliseconds a loop has worked: its run, or the sum of main's turns. */
export function runTime(loop: RadarLoop, now: number): number {
  return loop.live.reduce((sum, [s, e]) => sum + Math.max(0, (e ?? now) - s), 0)
}

function lane(loop: RadarLoop, width: number, now: number, bucketMs: number): Cell[] {
  const kinds = PRIORITY.length
  const weight = new Float64Array(width * kinds)
  const alive = new Float64Array(width)
  // Bucket b covers (end - bucketMs, end], end = now - (width - 1 - b) * bucketMs.
  const bucketOf = (t: number) => width - 1 - Math.floor((now - t) / bucketMs)
  const spread = (s: number, e: number, add: (b: number, ms: number) => void) => {
    const first = Math.max(0, bucketOf(s))
    const last = Math.min(width - 1, bucketOf(e))
    for (let b = first; b <= last; b++) {
      const end = now - (width - 1 - b) * bucketMs
      add(b, Math.max(1, Math.min(e, end) - Math.max(s, end - bucketMs)))
    }
  }

  let inFlight: RadarActivity | null = null
  for (const span of loop.spans) {
    if (span.end === null) inFlight = span.kind
    const k = PRIORITY.indexOf(span.kind)
    spread(span.start, span.end ?? now, (b, ms) => (weight[b * kinds + k] = (weight[b * kinds + k] ?? 0) + ms))
  }
  for (const [s, e] of loop.live) spread(s, e ?? now, (b, ms) => (alive[b] = (alive[b] ?? 0) + ms))

  const isPulse = Math.floor(now / 1000) % 2 === 0
  const cells = fill(width)
  for (let b = 0; b < width; b++) {
    let best = -1
    for (let k = 0; k < kinds; k++) {
      const w = weight[b * kinds + k] ?? 0
      if (w > 0 && (best < 0 || k === 0 || w > (weight[b * kinds + best] ?? 0))) best = k
      if (best === 0) break
    }
    const kind = PRIORITY[best]
    if (kind) cells[b] = { ch: GLYPH.busy, fg: ACTIVITY_COLOR[kind], bg: DEFAULT }
    else if ((alive[b] ?? 0) > 0) cells[b] = { ch: GLYPH.idle, fg: IDLE_COLOR, bg: DEFAULT }
  }

  // The newest bucket of a working loop breathes once a second.
  if (loop.status === 'running' && width > 0) {
    const last = cells[width - 1]
    if (inFlight && isPulse) cells[width - 1] = { ch: GLYPH.busyPulse, fg: ACTIVITY_COLOR[inFlight], bg: DEFAULT }
    else if (!inFlight && last && last.ch !== GLYPH.busy) {
      cells[width - 1] = { ch: isPulse ? GLYPH.idlePulse : GLYPH.idle, fg: IDLE_COLOR, bg: DEFAULT }
    }
  }

  return cells
}

function head(loop: RadarLoop, layout: Layout, now: number, isViewed: boolean): Cell[] {
  const row = fill(layout.head)
  if (isViewed) row[0] = { ch: GLYPH.viewed, fg: DEFAULT, bg: DEFAULT }
  let x = 1
  write(row, x, loop.name, layout.nameWidth)
  x += layout.nameWidth + 1
  write(row, x, loop.model || '?', 6)
  x += 7
  const look = STATUS_LOOK[loop.status]
  write(row, x, ` ${look.label}`.padEnd(6), 6, BLACK, look.color)
  x += 7
  if (layout.isWide) {
    write(row, x, clock(runTime(loop, now)), 5, DEFAULT, DEFAULT, true)
    x += 6
    write(row, x, tokens(loop.tokens), 5, DEFAULT, DEFAULT, true)
  }

  return row
}

const windowLabel = (ms: number) => (ms >= 3_600_000 ? `-${ms / 3_600_000}h` : `-${Math.round(ms / 60_000)}m`)

function axis(layout: Layout, spanMs: number, bucketMs: number): Cell[] {
  const row = fill(layout.columns)
  const laneWidth = layout.columns - layout.head
  write(row, 0, `1 col = ${clock(bucketMs)} `, layout.head, AXIS, DEFAULT, true)
  write(row, layout.head, windowLabel(spanMs), 6, AXIS)
  write(row, layout.head + Math.floor(laneWidth / 2) - 2, windowLabel(spanMs / 2), 5, AXIS)
  write(row, layout.columns - 3, 'now', 3, AXIS)

  return row
}

/** Every row of the picture: one per loop (as many as `layout.rows` holds), then the axis. */
export function buildGrid(
  loops: readonly RadarLoop[],
  layout: Layout,
  now: number,
  spanMs: number,
  viewAgent?: string,
): Cell[][] {
  const laneWidth = layout.columns - layout.head
  const bucketMs = Math.max(1, spanMs / laneWidth)
  const rows = loops
    .slice(0, layout.rows - 1)
    .map(loop => [...head(loop, layout, now, loop.id === viewAgent), ...lane(loop, laneWidth, now, bucketMs)])

  return [...rows, axis(layout, spanMs, bucketMs)]
}

/** The cells as a Raster takes them: base64 of little-endian u32 triplets. */
export function pack(grid: readonly Cell[][]): string {
  const cells = grid.flat()
  const bytes = new Uint8Array(cells.length * 12)
  const view = new DataView(bytes.buffer)
  cells.forEach((cell, i) => {
    view.setUint32(i * 12, cell.ch, true)
    view.setUint32(i * 12 + 4, cell.fg, true)
    view.setUint32(i * 12 + 8, cell.bg, true)
  })
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x2000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x2000))

  return btoa(binary)
}

/** The inverse of `pack`, for reading a drawn Raster back. */
export function unpack(cells: string, columns: number): Cell[][] {
  const binary = atob(cells)
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const grid: Cell[][] = []
  for (let i = 0; i < bytes.length / 12; i++) {
    const row = Math.floor(i / columns)
    ;(grid[row] ??= []).push({
      ch: view.getUint32(i * 12, true),
      fg: view.getUint32(i * 12 + 4, true),
      bg: view.getUint32(i * 12 + 8, true),
    })
  }

  return grid
}

export type Run = { text: string; fg: number; bg: number }

/** A row cut into runs of one color, for a surface that draws text, not cells. */
export function runs(row: readonly Cell[]): Run[] {
  const out: Run[] = []
  for (const cell of row) {
    const ch = String.fromCodePoint(cell.ch)
    const last = out[out.length - 1]
    if (last && last.fg === cell.fg && last.bg === cell.bg) last.text += ch
    else out.push({ text: ch, fg: cell.fg, bg: cell.bg })
  }

  return out
}

/** A cell color as a Text color: undefined for the terminal's default. */
export const hex = (color: number) => (color === DEFAULT ? undefined : `#${color.toString(16).padStart(6, '0')}`)
