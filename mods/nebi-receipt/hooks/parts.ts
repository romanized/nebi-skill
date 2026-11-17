// Nebi Receipt's pure parts: untrusted text made safe, what counts as a check,
// and the receipt line itself. Nothing here touches `$`.
import type { ReceiptTurn } from '../types'

// --- Untrusted text -------------------------------------------------------
// File paths and commands come from the model: escape sequences go, then
// every control, format, unassigned, private-use and surrogate character;
// whitespace folds to single spaces; text with Unicode tag characters is
// refused outright. (Ported from nebi-beacon's parts.ts.)
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

// --- What counts as a check -------------------------------------------------
// The receipt's own heuristic, ported from the isCheck the old nebi-beacon
// had: the word must stand alone, so a path such as tests/beacon.test.ts is
// no check. Two changes from that port: `node --test`, the runner this repo's
// own tests use, counts; and the words are read per part of the command with
// any `cd` part left out, so `cd tests && ls` is no check.
const CHECK =
  /(?<![\w./-])(test|tests|vitest|jest|pytest|tsc|lint|eslint|validate|build|verify)(?![\w./-])|cargo test|go test|plugin test|\bnode\b[^|;&\n]*\s--test(?![\w-])/

export const EDIT_TOOLS: ReadonlySet<string> = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

const COMMAND_MAX = 40
const NAME_MAX = 32
const NAMES_SHOWN = 3

// The parts of a command that check, without env assignments or
// redirections: `cd mods && CI=1 npx vitest run 2>&1 | tail -5` gives
// `npx vitest run`.
function checkParts(command: string): string[] {
  return command
    .split(/\s*(?:&&|\|\||;|\||\n)\s*/)
    .map(part =>
      part
        .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '')
        .replace(/\s*(?:\d*>&\d+|&>>?\s*\S+|\d*>>?\s*\S+|<\s*\S+)/g, '')
        .trim(),
    )
    .filter(part => part !== '' && !/^(?:cd|pushd)(?:\s|$)/.test(part) && CHECK.test(part))
}

export const isCheck = (command: string) => checkParts(command).length > 0

export const checkLabel = (command: string) => clean(checkParts(command).join(' && '), COMMAND_MAX)

// --- The line -----------------------------------------------------------------
const baseName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path

function relative(path: string, cwd: string, home: string): string {
  if (cwd !== '' && path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  if (home !== '' && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`

  return path
}

// Names as short as they can be: the file's own name, or its path from the
// project when two edited files share that name.
export function fileNames(files: readonly string[], cwd: string, home: string): string {
  const counts = new Map<string, number>()
  for (const file of files) counts.set(baseName(file), (counts.get(baseName(file)) ?? 0) + 1)
  const names = files.slice(0, NAMES_SHOWN).map(file => {
    const name = baseName(file)
    return clean((counts.get(name) ?? 0) > 1 ? relative(file, cwd, home) : name, NAME_MAX)
  })
  const more = files.length - NAMES_SHOWN

  return `${names.join(', ')}${more > 0 ? ` +${more}` : ''}`
}

// CONTRACT's proof rule: an edit is proven when the latest check-like command
// run after the latest file edit passed. A check that started before the last
// edit finished does not count.
export function proof(turn: ReceiptTurn): string {
  const check = turn.check
  if (check === null || check.startedAt < turn.lastEditAt) return 'no check since the last edit'
  if (check.outcome === 'passed') return `checked ${check.command} ✓`
  if (check.outcome === 'failed') return `check failed: ${check.command}`

  return `check not finished: ${check.command}`
}

// One line, or '' when the turn changed no file.
export function receiptLine(turn: ReceiptTurn, cwd: string, home: string): string {
  if (turn.files.length === 0) return ''

  return `changed ${fileNames(turn.files, cwd, home)} · ${proof(turn)}`
}
