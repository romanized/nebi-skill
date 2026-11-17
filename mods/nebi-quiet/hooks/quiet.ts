// The pure parts of Nebi Quiet: what a row says, and what the footer keeps.

export const NAME = 'nebi-quiet'

// The footer hints Nebi never reads. Everything else in the hint stays.
const HINT_NOISE = ['(shift+tab to cycle)', '? for shortcuts'] as const
// A ` · ` that stands alone between parts, not one inside a word.
const SEPARATOR = /(?<=^|\s)·(?=\s|$)/

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// Text from a tool or the model reaches the screen only through clean(), the
// same rules as nebi-beacon's: escape sequences go, then control, format,
// unassigned, private-use and surrogate characters and the letters that render
// blank; whitespace folds to one line; text with Unicode tag characters is refused.
const ESCAPE_SEQUENCES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g
const TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/u
const UNSEEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}\p{Variation_Selector}ᅟᅠㅤﾠ]/gu
const COMBINING_RUN = /(\p{M}{3})\p{M}+/gu

export function clean(text: string): string {
  if (TAG_CHARACTERS.test(text)) return ''

  return text
    .replace(ESCAPE_SEQUENCES, '')
    .replace(/\s+/g, ' ')
    .replace(UNSEEN_CHARACTERS, '')
    .replace(COMBINING_RUN, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()
}

// NEBI_MODS_OFF: `all`, or a comma list of mod names.
export function isNamedOff(value: string | undefined): boolean {
  return (value ?? '').split(',').some(name => name.trim() === 'all' || name.trim() === NAME)
}

// The footer hint without its noise, or null when there was none to strip.
export function trimHint(hint: string): string | null {
  if (!HINT_NOISE.some(noise => hint.includes(noise))) return null
  let text = hint
  for (const noise of HINT_NOISE) text = text.split(noise).join(' ')

  return text
    .split(SEPARATOR)
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')
}

// A path as short as it stays clear: under the session folder, relative; under home, from ~.
export function shortPath(path: string, cwd: string, home: string): string {
  const text = clean(path)
  if (cwd !== '' && text.startsWith(`${cwd}/`)) return text.slice(cwd.length + 1)
  if (home !== '' && text.startsWith(`${home}/`)) return `~/${text.slice(home.length + 1)}`

  return text
}

function lineCount(content: string): number {
  if (content === '') return 0

  return content.replace(/\n$/, '').split('\n').length
}

function patchCounts(patch: unknown): { added: number; removed: number } | null {
  if (!Array.isArray(patch)) return null
  let added = 0
  let removed = 0
  for (const hunk of patch) {
    const lines: unknown = isRecord(hunk) ? hunk.lines : undefined
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }

  return { added, removed }
}

// One line for a write or edit that went through, or null to leave the engine's row.
// A staged write (held for review, file unchanged) and a result with an error keep the engine's.
export function describeEdit(tool: string, output: unknown, cwd: string, home: string): string | null {
  if (!isRecord(output) || output.staged === true || typeof output.error === 'string') return null

  if (tool === 'NotebookEdit') {
    if (typeof output.notebook_path !== 'string') return null
    const path = shortPath(output.notebook_path, cwd, home)
    if (output.edit_mode === 'insert') return `added a cell · ${path}`
    if (output.edit_mode === 'delete') return `deleted a cell · ${path}`

    return `edited a cell · ${path}`
  }

  if (typeof output.filePath !== 'string') return null
  const path = shortPath(output.filePath, cwd, home)

  if (tool === 'Write') {
    if (typeof output.content !== 'string') return null

    return `wrote ${plural(lineCount(output.content), 'line')} · ${path}`
  }

  const counts = patchCounts(output.structuredPatch)

  return counts === null ? `edited ${path}` : `edited ${path} +${counts.added} −${counts.removed}`
}

const NAME_MAX = 60

// The workflow's name: what the result or input names, else the script's `meta.name`.
export function workflowName(input: unknown, output: unknown): string {
  const named = isRecord(output) && typeof output.workflowName === 'string' ? output.workflowName : ''
  let name = named
  if (name === '' && isRecord(input)) {
    if (typeof input.name === 'string') name = input.name
    else if (typeof input.script === 'string') name = /\bmeta\s*=\s*\{[^}]*?\bname\s*:\s*(['"`])([^'"`\n]+)\1/.exec(input.script)?.[2] ?? ''
    if (name === '' && typeof input.scriptPath === 'string') name = input.scriptPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
  }
  const text = clean(name)

  return text.length > NAME_MAX ? `${text.slice(0, NAME_MAX - 1)}…` : text
}
