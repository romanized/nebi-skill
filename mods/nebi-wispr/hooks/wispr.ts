// Wispr's text work, pure: the glossary rewrite, the parts of a prompt it never
// touches, and the fuzzy guess at names dictation mangled. No `$` here.
import type { WisprTerm } from '../types'

export type Glossary = Record<string, string>

// What a fresh store starts with: heard (lowercase) → meant.
export const SEED: Glossary = {
  scapling: 'Scrapling',
  scrapeling: 'Scrapling',
  'ultra code': 'ultracode',
  'cloud code': 'Claude Code',
  'cloud md': 'CLAUDE.md',
  'tick hub': 'TikHub',
  'tik hub': 'TikHub',
  nebby: 'nebi',
}

// Code fences, inline code, double-quoted text (straight or curly), and any token
// with a slash, backslash, `www.` or an `@` (paths, URLs, emails) stay as typed.
const PROTECTED = /```[\s\S]*?(?:```|$)|`[^`\n]*`|"[^"\n]*"|“[^”\n]*”|\S*[/\\]\S*|\S*www\.\S*|\S+@\S+/g

type Segment = { text: string; isProtected: boolean }

export function segments(text: string): Segment[] {
  const out: Segment[] = []
  let at = 0
  for (const match of text.matchAll(PROTECTED)) {
    const start = match.index ?? 0
    if (start > at) out.push({ text: text.slice(at, start), isProtected: false })
    out.push({ text: match[0], isProtected: true })
    at = start + match[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at), isProtected: false })

  return out
}

/** A heard phrase as the glossary keys it: lowercase, single spaces. */
export const keyOf = (heard: string) => heard.trim().toLowerCase().replace(/\s+/g, ' ')

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The glossary applied to the prompt's own words, whole words and phrases only. */
export function applyGlossary(text: string, glossary: Glossary): { text: string; changes: [string, string][] } {
  const heard = Object.keys(glossary).filter(Boolean).sort((a, b) => b.length - a.length)
  if (heard.length === 0) return { text, changes: [] }
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${heard.map(h => escape(h).replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
  const changes: [string, string][] = []
  const fixed = segments(text)
    .map(part =>
      part.isProtected
        ? part.text
        : part.text.replace(pattern, found => {
            const meant = glossary[keyOf(found)] ?? found
            if (meant !== found && !changes.some(([from]) => from === found)) changes.push([found, meant])
            return meant
          }),
    )
    .join('')

  return { text: fixed, changes }
}

// ---- The fuzzy layer: a hint for the model, never a rewrite ----------------------

export type VocabSources = {
  commands: readonly string[]
  tools: readonly string[]
  folders: readonly string[]
}

const lettersOf = (name: string) => name.toLowerCase().replace(/[^\p{L}]/gu, '')
const MIN_LETTERS = 6

/** Every name worth matching against: whole names, and the parts of a-b or a_b names. */
export function buildVocab({ commands, tools, folders }: VocabSources): WisprTerm[] {
  const terms = new Map<string, string>()
  const add = (display: string) => {
    const key = lettersOf(display)
    if (key.length >= MIN_LETTERS && !terms.has(key)) terms.set(key, display)
  }
  const addWithParts = (name: string) => {
    add(name)
    for (const part of name.split(/[-_:.\s]+/)) add(part)
  }

  for (const name of commands) addWithParts(name)
  for (const name of folders) addWithParts(name)
  for (const name of tools) {
    const mcp = /^mcp__(.+?)__(.+)$/.exec(name)
    if (mcp) {
      add((mcp[1] ?? '').replace(/^claude_ai_/, ''))
      add(mcp[2] ?? '')
    } else {
      add(name)
    }
  }

  return [...terms]
}

/** Optimal string alignment distance: edits, with a swap of neighbours as one. */
export function distance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  const at = (i: number, j: number) => rows[i]?.[j] ?? Infinity
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, at(i - 2, j - 2) + 1)
      const row = rows[i]
      if (row) row[j] = best
    }
  }

  return at(a.length, b.length)
}

// A plural or tense of the same word is the word, not a mishearing.
const isInflection = (a: string, b: string) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]

  return long.startsWith(short) && ['s', 'es', 'd', 'ed', 'ing', 'er', 'ly'].includes(long.slice(short.length))
}

/** Words of the prompt that sound like a known name but are not one. At most three. */
export function suspects(text: string, vocab: readonly WisprTerm[], glossary: Glossary): [string, string][] {
  const known = new Set([...vocab.map(([key]) => key), ...Object.keys(glossary).map(lettersOf), ...Object.values(glossary).map(lettersOf)])
  const found: [string, string][] = []
  for (const part of segments(text)) {
    if (part.isProtected) continue
    for (const match of part.text.matchAll(/(?<![\p{L}\p{N}_-])\p{L}+(?![\p{L}\p{N}_-])/gu)) {
      const word = match[0]
      const key = word.toLowerCase()
      if (key.length < MIN_LETTERS || known.has(key) || found.some(([seen]) => seen.toLowerCase() === key)) continue
      const limit = key.length >= 10 ? 2 : 1
      let best: [number, string] | undefined
      for (const [term, display] of vocab) {
        if (term[0] !== key[0] || Math.abs(term.length - key.length) > limit || isInflection(term, key)) continue
        const d = distance(key, term)
        if (d > 0 && d <= limit && (best === undefined || d < best[0])) best = [d, display]
      }
      if (best) found.push([word, best[1]])
      if (found.length === 3) return found
    }
  }

  return found
}

/** `heard => meant` (also `->`, `→`, `=`) from /wispr add's arguments. */
export function parseAdd(args: string): [string, string] | null {
  const match = /^(.+?)\s*(?:=>|->|→|=)\s*(.+)$/.exec(args.trim())
  const heard = keyOf(match?.[1] ?? '')
  const meant = (match?.[2] ?? '').trim()
  if (heard === '' || meant === '' || heard.length > 60 || meant.length > 60) return null

  return [heard, meant]
}
