// The Model Lock's grammar: which model a prompt binds to which role of
// sub-agents, and which role an agent type belongs to. No engine calls here.
import type { Lock, LockModel, LockRole } from '../types'

// Display order and labels, for the footer label and /lock.
const ROLES: readonly LockRole[] = ['scout', 'checker', 'builder', 'all']
const LABEL: Record<LockRole, string> = { scout: 'scouts', checker: 'checker', builder: 'builders', all: 'agents' }

const SCOUT_TYPES = new Set(['nebi-scout', 'explore'])
const CHECKER_TYPES = new Set(['nebi-checker'])

const MODEL = String.raw`(opus|sonnet|haiku|fable)(?:[\s-]?v?\d+(?:\.\d+)?)?`
const ROLE = String.raw`(scouts?|checkers?|reviewers?|builders?|workers?|subagents?|agents?|fleet|everyone|everybody)`
// "sonnet scouts", "a fable checker", "opus 5.5 builders"
const MODEL_ROLE = new RegExp(String.raw`\b${MODEL}\s+${ROLE}\b`, 'g')
// "scouts on haiku", "set scouts to haiku", "scout model: haiku", "reviewers: fable"
const ROLE_MODEL = new RegExp(
  String.raw`\b${ROLE}(?:\s+models?)?(?:\s+(?:(?:should|must|will|can)\s+)?(?:(?:run|be|go|stay|all)\s+)?(?:on|with|using|use|to)\s+|\s*(?:=|:|→|->)\s*)${MODEL}\b`,
  'g',
)
// "use sonnet for scouts", "opus for everyone else"
const MODEL_FOR_ROLE = new RegExp(
  String.raw`\b${MODEL}\s+for\s+(?:(?:the|my|our|all|every|each|any|other)\s+){0,3}${ROLE}\b`,
  'g',
)
// "a sonnet for my agents" is a poem, not a lock.
const ARTICLE_BEFORE = /\b(?:a|an|the|this|that|my|your|our)\s+$/
const NEGATED_BEFORE = /\b(?:don't|dont|do not|never|not|no|avoid|stop|without)\b(?:\s+\S+){0,2}\s*$/
// Talk about models, not an instruction: comparisons, prices, questions.
const SIDE_TALK = /\b(?:cheap\w*|cost\w*|pric\w*|than|vs|versus|compar\w*|expensive)\b/
const QUESTION_START = /^(?:why|what|how|did|does|do|is|are|was|were|which|who|should)\b/
// "…", “…”, `…` and '…' (an apostrophe inside a word is no quote).
const QUOTED = /"[^"\n]*"|“[^”\n]*”|`[^`\n]*`|(^|[\s(\[])'[^'\n]*'(?=$|[\s.,;:!?)\]])/g

function roleOfWord(word: string): LockRole {
  if (word.startsWith('scout')) return 'scout'
  if (word.startsWith('checker') || word.startsWith('reviewer')) return 'checker'
  if (word.startsWith('builder') || word.startsWith('worker')) return 'builder'

  return 'all'
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(QUOTED, (_: string, lead?: string) => `${lead ?? ''} `)
    .replace(/\bvs\./g, 'vs')
    .replace(/\bsub[\s-]+(agents?)\b/g, 'sub$1')
    .replace(/[ \t]+/g, ' ')
}

// The clauses that could be instructions: a sentence that asks a question
// goes whole, and so does a clause that compares, prices or asks.
function instructions(said: string): string[] {
  const kept: string[] = []
  for (const sentence of said.split(/(?<=[.!?])\s+|\n+/)) {
    const parts = sentence.split(/[,;]/).map(part => part.trim())
    if (sentence.trimEnd().endsWith('?') && QUESTION_START.test(parts[0] ?? '')) continue
    for (const clause of parts) {
      if (!clause || clause.endsWith('?') || SIDE_TALK.test(clause) || QUESTION_START.test(clause)) continue
      kept.push(clause)
    }
  }

  return kept
}

/**
 * The model each role was bound to in `text`, later mentions winning; empty
 * when the text binds none (a bare "use haiku", "the sonnet poem").
 */
export function parseLock(text: string): Lock {
  const result: Lock = {}
  for (const clause of instructions(normalize(text))) {
    const found: { at: number; role: LockRole; model: LockModel }[] = []
    const take = (pattern: RegExp, modelAt: 1 | 2, isGuarded: boolean) => {
      for (const match of clause.matchAll(pattern)) {
        const at = match.index ?? 0
        const before = clause.slice(0, at)
        if (NEGATED_BEFORE.test(before)) continue
        if (isGuarded && ARTICLE_BEFORE.test(before)) continue
        const model = match[modelAt] as LockModel | undefined
        const word = match[modelAt === 1 ? 2 : 1]
        if (model && word) found.push({ at, role: roleOfWord(word), model })
      }
    }
    take(MODEL_ROLE, 1, false)
    take(ROLE_MODEL, 2, false)
    take(MODEL_FOR_ROLE, 1, true)
    for (const { role, model } of found.sort((a, b) => a.at - b.at)) result[role] = model
  }

  return result
}

/** The role an agent type belongs to; a plugin's `plugin:name` reads by its name. */
export function roleOf(subagentType: string): Exclude<LockRole, 'all'> {
  const name = (subagentType.split(':').pop() ?? subagentType).toLowerCase()
  if (SCOUT_TYPES.has(name)) return 'scout'
  if (CHECKER_TYPES.has(name)) return 'checker'

  return 'builder'
}

const LABEL_CELLS = 20

/**
 * The footer label, at most 20 cells: the first locked role, and a count of
 * the rest ("🔒 sonnet scouts", "🔒 sonnet scouts +1"); "" with no lock.
 */
export function lockLabel(current: Lock): string {
  const held = ROLES.filter(role => current[role])
  const first = held[0]
  if (first === undefined) return ''
  const more = held.length > 1 ? ` +${held.length - 1}` : ''
  // 🔒 is two cells wide and two UTF-16 units long, so length counts cells here.
  const room = LABEL_CELLS - '🔒 '.length - more.length
  const phrase = `${current[first]} ${LABEL[first]}`

  return `🔒 ${phrase.length > room ? `${phrase.slice(0, room - 1)}…` : phrase}${more}`
}

/** "scouts→sonnet · checker→fable", or "" with no lock. */
export function describeLock(current: Lock): string {
  return ROLES.flatMap(role => (current[role] ? [`${LABEL[role]}→${current[role]}`] : [])).join(' · ')
}

export const hasLock = (current: Lock) => ROLES.some(role => current[role])
