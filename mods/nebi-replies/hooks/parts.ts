// Nebi Replies' pure parts: the status line split off a reply block, and what
// counts as a working note (narration only). Nothing here touches `$`.

// The Stop hook's status line (claude-home/hooks/verify-before-stop.mjs:30),
// matched per line; the last matching line counts.
export const STATUS_RE = /^[\s>*_`]*(✅|⏳|❓)/u

export type StatusKind = 'done' | 'working'
export type Status = { kind: StatusKind; body: string; words: string }
export type StepOutcome = { toolUses: readonly unknown[]; stopReason: string | null }
export type StepNotes = { notes: string[]; finals: string[] }

const NOTE_MAX = 240
const GLYPHS = /[✅⏳❓]/u
const ESCAPES = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-_]/g
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g

/** Model text made safe to draw: no escape sequences or controls, one line. */
export function clean(text: string): string {
  return text.replace(ESCAPES, '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim()
}

/** True when NEBI_MODS_OFF is `all` or a comma list naming this mod. */
export function isNamedOff(value: string | undefined): boolean {
  return (value ?? '')
    .split(',')
    .map(name => name.trim().toLowerCase())
    .some(name => name === 'all' || name === 'nebi-replies')
}

/**
 * A block's ✅ or ⏳ status line split from its body, or null when there is
 * none, when it is ❓ (the beacon band owns need-you), or when text follows it
 * (the status line is always last, so a ✅ list item above more text is not it).
 */
export function splitStatus(text: string): Status | null {
  const lines = text.split('\n')
  let at = lines.length - 1
  while (at >= 0 && !STATUS_RE.test(lines[at]!)) at -= 1
  if (at < 0 || lines.slice(at + 1).some(line => line.trim() !== '')) return null
  const line = lines[at]!
  const glyph = STATUS_RE.exec(line)?.[1]
  if (glyph !== '✅' && glyph !== '⏳') return null

  return { kind: glyph === '✅' ? 'done' : 'working', body: lines.slice(0, at).join('\n').trimEnd(), words: statusWords(line) }
}

// "✅ Done — X" gives "X": the glyph, the word the badge already says and its separator go.
function statusWords(line: string): string {
  const lead = /^[\s>*_`]*/u.exec(line)?.[0] ?? ''
  let rest = line.replace(STATUS_RE, '').replace(/^[\s*_`]*(?:done|working)\b[*_`]*\s*(?:[—–:.,!-]+\s*)?/iu, '')
  if (/[*_]/.test(lead)) rest = rest.replace(/[*_]+\s*$/u, '')

  return clean(rest)
}

/** The text a block is matched by: AssistantMessage carries no step id. */
export function noteKey(text: string): string {
  return text.trim()
}

/** Short enough, one line, not a question and not a status line. */
export function isNoteShape(key: string): boolean {
  return key !== '' && [...key].length < NOTE_MAX && !key.includes('\n') && !key.includes('?') && !GLYPHS.test(key)
}

// Narration openers: the only notes that may hide.
const OPENER = /^[\s>*_`]*(?:(?:now\s+)?let\s+me|let['’]s|now\s+i['’]ll|i['’]ll|i\s+will)\b|^[\s>*_`]*(?:next|first|okay|ok|alright)\s*,/iu
// What the doctrine needs on screen keeps a note whatever it opens with: a
// heads-up, a deviation, a problem, a number with a unit, a file path or a status glyph.
const KEEPS = [
  /heads[\s-]*up|instead|deviat|differently|fail|error|blocked|can['’]?t\b|cannot|couldn['’]?t\b/iu,
  /\d(?:[.,]\d+)?\s*(?:%|(?:ms|s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?|days?|[kmgt]i?b|bytes?|px|files?|lines?|tests?|errors?|warnings?|commits?|steps?|x)\b)/iu,
  /(?:^|[\s`'"(])(?:~|\.\.?)?\/[\w.-]|[\w.-]\/(?:[\w.-]|[\s,;:)'"`]|$)|\b[\w-]+\.(?:[cm]?[jt]sx?|json|md|py|rb|go|rs|sh|ya?ml|toml|html?|css|txt|lock|env|sql|csv)\b/iu,
  /[✅⏳❓⚠❌✓✔✗✘⛔]/u,
]

/** A working note that may hide: note-shaped narration ("Let me read the file.") that keeps nothing Nebi needs. */
export function isNarration(key: string): boolean {
  return isNoteShape(key) && OPENER.test(key) && !KEEPS.some(keep => keep.test(key))
}

/**
 * Sorts a main-loop step's text blocks: narration of a step that went on to call
 * tools is a working note; note-shaped text of a step that ended without tools
 * is a final reply, which wins over a note with the same text.
 */
export function classifyStep(step: StepOutcome, texts: readonly string[]): StepNotes {
  const isMidTurn = step.toolUses.length > 0 || step.stopReason === 'tool_use'
  const found: StepNotes = { notes: [], finals: [] }
  for (const key of texts.map(noteKey)) {
    if (isMidTurn ? isNarration(key) : isNoteShape(key)) (isMidTurn ? found.notes : found.finals).push(key)
  }

  return found
}
