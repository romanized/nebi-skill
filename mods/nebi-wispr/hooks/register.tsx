// Nebi Wispr: fixes the words dictation keeps getting wrong before Claude reads
// them (scapling → Scrapling), from a glossary kept across sessions, with one
// toast naming what it changed. userConfig `guesses`: off (default) or on. On,
// a word that only sounds like one of this machine's commands, tools or projects
// gets a note to Claude the person never sees, and is never rewritten. It starts
// off because the guesses were mostly wrong in use: of 62 notes in a month of
// prompts, about 44 named ordinary words (theres → themes, waiting → writing).
//
// No-mod fallback: CLAUDE.md §4, which tells the model he dictates and to read
// misheard words for what he meant (with NEBI_MODS_OFF naming this mod, or the
// mod not loaded, prompts arrive exactly as dictated).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { WisprTerm } from '../types'
import { SEED, applyGlossary, buildVocab, keyOf, parseAdd, suspects } from './wispr'
import type { Glossary } from './wispr'

const NAME = 'nebi-wispr'

const vocab = atom({ plugin: 'nebi-wispr', key: 'vocab' } as const, [])

const STORE_KEY = 'glossary'
const USAGE = 'Use /wispr add <heard> => <meant>, or /wispr remove <heard>.'

// CONTRACT kill switch: NEBI_MODS_OFF=all or a list naming this mod. Read at
// every session.start, or on first use after a reload; while named, every prompt passes.
let off: Promise<boolean> | null = null

async function namedOff($: EngineInterface): Promise<boolean> {
  const value = (await $.env.get('NEBI_MODS_OFF').catch(() => undefined)) ?? ''

  return value.split(',').some(name => name.trim() === 'all' || name.trim() === NAME)
}

const isKilled = ($: EngineInterface) => (off ??= namedOff($))

export const register: Register = (on, options) => {
  const isGuessing = options.guesses === 'on'

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    off = namedOff($)
    if (await off) return result
    await $.command.register({
      name: 'wispr',
      description: 'Wispr: list the dictation glossary, or add / remove a word',
      argumentHint: '[add <heard> => <meant> | remove <heard>]',
      immediate: true,
    })
    await glossaryOf($)
    if (isGuessing) {
      const terms = await gatherVocab($)
      await update($, vocab, () => terms)
    }

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const isPersons = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (!isPersons || /^\s*\/wispr\b/.test(e.text) || (await isKilled($))) return next(e)

    const glossary = await glossaryOf($)
    const { text, changes } = applyGlossary(e.text, glossary)
    // The prompt's one toast, and only when his words actually changed.
    if (text !== e.text) $.ui.toast(`Wispr: ${changes.map(([from, to]) => `${from} → ${to}`).join(', ')}`)
    if (!isGuessing) return text === e.text ? next(e) : next({ ...e, text })

    let terms: WisprTerm[] = await read($, vocab)
    if (terms.length === 0) {
      terms = await gatherVocab($)
      await update($, vocab, () => terms)
    }
    // A sound-alike is only a guess: Claude hears it, his words and the screen stay as they are.
    const guesses = suspects(text, terms, glossary)
    if (guesses.length === 0) return text === e.text ? next(e) : next({ ...e, text })

    const note = guesses.map(([heard, meant]) => `Dictation note: '${heard}' probably means '${meant}'.`).join(' ')

    return next({ ...e, text, context: [...(e.context ?? []), note] })
  })

  on('command.run', { command: 'wispr' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const args = rest.join(' ')
    const glossary = await glossaryOf($)

    if (verb === 'add') {
      const pair = parseAdd(args)
      if (pair === null) return { text: `Wispr could not read that. ${USAGE}` }
      const [heard, meant] = pair
      await $.store.set(STORE_KEY, { ...glossary, [heard]: meant })

      return { text: `Wispr will write "${meant}" when it hears "${heard}".` }
    }
    if (verb === 'remove') {
      const heard = keyOf(args)
      if (!(heard in glossary)) return { text: `"${heard}" is not in the glossary. /wispr lists it.` }
      const { [heard]: _gone, ...kept } = glossary
      await $.store.set(STORE_KEY, kept)

      return { text: `Wispr no longer changes "${heard}".` }
    }
    if (verb !== '') return { text: USAGE }

    const rows = Object.entries(glossary).map(([heard, meant]) => `  ${heard} → ${meant}`)

    return { text: [`Wispr glossary (${rows.length}):`, ...(rows.length > 0 ? rows : ['  (empty)']), '', USAGE].join('\n') }
  })
}

/** The glossary from the store, seeded on the first run ever. */
async function glossaryOf($: EngineInterface): Promise<Glossary> {
  const stored = await $.store.get(STORE_KEY)
  if (stored === undefined) {
    await $.store.set(STORE_KEY, SEED)

    return { ...SEED }
  }
  const glossary: Glossary = {}
  if (stored !== null && typeof stored === 'object') {
    for (const [heard, meant] of Object.entries(stored)) if (typeof meant === 'string') glossary[keyOf(heard)] = meant
  }

  return glossary
}

/** Names of the commands (not the built-in ones: those are everyday words), tools and projects. */
async function gatherVocab($: EngineInterface): Promise<WisprTerm[]> {
  const commands = (await $.command.list().catch(() => [])).filter(c => c.source !== 'builtin').map(c => c.name)
  const tools = (await $.tool.list().catch(() => [])).map(t => t.name)
  const home = (await $.env.get('HOME')) ?? ''
  const folders = home === '' ? [] : (await $.fs.list(`${home}/Documents/GitHub`).catch(() => [])).filter(f => f.kind !== 'file' && !f.name.startsWith('.')).map(f => f.name)

  return buildVocab({ commands, tools, folders })
}
