// Nebi Beacon's pure parts: untrusted text made safe and fitted to cells, the
// status line and the row's notes. Nothing here touches `$`.
import type { BeaconKind } from '../types'

// --- Untrusted text -------------------------------------------------------
// Model output, tool inputs and prompts reach the screen only through clean():
// escape sequences go, then every control, format, unassigned, private-use and
// surrogate character, variation selectors and the letters that render blank;
// whitespace folds to single spaces; combining runs stop at three; text with
// Unicode tag characters is refused outright. (From the Next Steps mod.)
const ESCAPE_SEQUENCES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g
const TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/u
const UNSEEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}\p{Variation_Selector}ᅟᅠㅤﾠ]/gu
const COMBINING_RUN = /(\p{M}{3})\p{M}+/gu

export function clean(text: string, max: number): string {
  if (TAG_CHARACTERS.test(text)) return ''
  const safe = text
    .replace(ESCAPE_SEQUENCES, '')
    .replace(/\s+/g, ' ')
    .replace(UNSEEN_CHARACTERS, '')
    .replace(COMBINING_RUN, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()
  const points = [...safe]

  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : safe
}

// --- Cells ----------------------------------------------------------------
const WIDE = /[\p{Emoji_Presentation}ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u
const ZERO_WIDTH = /\p{M}/u

// How many terminal cells a string takes: emoji and CJK two, marks none.
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) width += ZERO_WIDTH.test(char) ? 0 : WIDE.test(char) ? 2 : 1

  return width
}

// Cuts at a word boundary with an ellipsis; one word too long for the room
// is the only thing cut inside.
export function fitWords(text: string, width: number): string {
  if (cellWidth(text) <= width) return text
  if (width < 2) return width === 1 ? '…' : ''

  let kept = ''
  for (const word of text.split(' ')) {
    const longer = kept === '' ? word : `${kept} ${word}`
    if (cellWidth(longer) + 1 > width) break
    kept = longer
  }
  if (kept === '') {
    for (const char of text) {
      if (cellWidth(kept + char) + 1 > width) break
      kept += char
    }
  }

  return `${kept.replace(/[\s,;:·—–-]+$/, '')}…`
}

// The row's words and notes in `width` cells: notes stay whole and drop from
// the end while the words would get fewer than 12 cells; the words are cut.
export function fitRow(words: string, notes: readonly string[], width: number): string {
  const kept = notes.filter(note => note !== '')
  const tail = () => kept.map(note => ` · ${note}`).join('')
  while (kept.length > 0 && cellWidth(tail()) + Math.min(12, cellWidth(words)) > width) kept.pop()

  return `${fitWords(words, width - cellWidth(tail()))}${tail()}`
}

// --- The status line --------------------------------------------------------
// The Stop hook's regex (CONTRACT.md), matched per line; the last match counts.
export const STATUS_RE = /^[\s>*_`]*(✅|⏳|❓)/u
const LABEL = /^[\s*_`]*(?:done|working|need you)\b[\s*_`]*[—–:·-]?\s*/iu
const KIND_OF: Record<string, BeaconKind> = { '✅': 'done', '⏳': 'background', '❓': 'need' }
const TEXT_MAX = 300

export function parseStatus(answer: string): { kind: BeaconKind; text: string } {
  const lines = answer.split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? ''
    const match = STATUS_RE.exec(line)
    if (match === null) continue
    const words = line.slice(match[0].length).replace(LABEL, '').replace(/[\s*_`]+$/u, '')

    return { kind: KIND_OF[match[1] ?? ''] ?? 'missing', text: clean(words, TEXT_MAX) }
  }

  return { kind: 'missing', text: '' }
}

// --- How a main-loop step leaves the turn ------------------------------------
// The beacon hooks `turn.step`, not `turn.complete` (nebi-receipt's alone, or
// the engine credits both mods with the receipt line). A step that called a
// tool, or that the engine carries on from, leaves the turn running (null);
// any other step ended it, and its text holds the status line. Nebi's
// interrupt aborts the step's signal; only a throw from beneath is an API
// error. A step with no response (stopReason null: on 2.1.288 the engine
// runs one with no request after the model's end_turn step, as when a Stop
// hook adds context) and a stream closed with no abort change nothing (null):
// the state the step before set stands.
export type StepOutcome = 'done' | 'aborted' | 'failed' | 'abandoned'
export type StepEnd = { kind: BeaconKind; text: string } | null

const CARRIES_ON = new Set(['tool_use', 'pause_turn', 'compaction'])

export function stepEnd(
  outcome: StepOutcome,
  step: { answer: string; stopReason: string | null; toolCount: number } | null,
): StepEnd {
  if (outcome === 'aborted') return { kind: 'stopped', text: 'interrupted' }
  if (outcome === 'failed') return { kind: 'error', text: 'an API error ended the turn' }
  if (step === null || step.stopReason === null) return null
  if (step.stopReason === 'refusal') return { kind: 'error', text: 'the model refused' }
  if (step.toolCount > 0 || CARRIES_ON.has(step.stopReason)) return null

  return parseStatus(step.answer)
}

// --- The row's notes --------------------------------------------------------
// How long Nebi has been waited on: nothing under a minute, then 12m, 1h05m.
export function waitText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return ''
  if (minutes < 60) return `${minutes}m`

  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

const isPeer = (origin: string) => origin === 'peer' || origin === 'peer-send-message'

// Who started the asking turn, when it was not Nebi's own prompt.
export function originNote(origin: string, from: string): string {
  if (origin === 'task-notification') return 'after background task'
  if (isPeer(origin)) return `from ${from === '' ? 'another session' : from}`

  return ''
}

// A peer's name: the origin's `name` where the engine sets one, else the
// message's from-name attribute.
export function peerName(origin: { kind: string }, text: string): string {
  if (!isPeer(origin.kind)) return ''
  const named = (origin as { name?: unknown }).name
  if (typeof named === 'string') return clean(named, 24)
  const match = /from-name="([^"]{1,80})"/.exec(text)

  return match === null ? '' : clean(match[1] ?? '', 24)
}
