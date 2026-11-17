// Nebi Model Lock: when the person names a model for sub-agents in a prompt
// ("sonnet scouts", "a fable checker", "all agents on haiku"), every later
// spawn of that role gets it on the Agent call's own `model` parameter, so an
// agent type's default model can no longer silently win. While a lock holds,
// one footer label says so (`🔒 sonnet scouts`); /lock prints it in full.
//
// No-mod fallback: CLAUDE.md §0, which tells the lead to pass the named model
// on every dispatch's own `model` parameter (with NEBI_MODS_OFF naming this
// mod, or the mod not loaded, nothing rewrites a spawn and no label shows).
import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, EngineInterface, Register } from 'claude-code'

import type { Lock, LockModel } from '../types'
import { describeLock, hasLock, lockLabel, parseLock, roleOf } from './parse'

const NAME = 'nebi-model-lock'

const lock = atom({ plugin: 'nebi-model-lock', key: 'lock' } as const, {})

// CONTRACT kill switch: NEBI_MODS_OFF=all or a list naming this mod. Read at
// every session.start, or on first use after a reload; while named, every hook passes.
let off: Promise<boolean> | null = null

async function namedOff($: EngineInterface): Promise<boolean> {
  const value = (await $.env.get('NEBI_MODS_OFF').catch(() => undefined)) ?? ''

  return value.split(',').some(name => name.trim() === 'all' || name.trim() === NAME)
}

const isKilled = ($: EngineInterface) => (off ??= namedOff($))

const clean = (text: string) =>
  text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function lockedFor(current: Lock, e: AgentSpawnInput): LockModel | undefined {
  // A fork inherits its parent's model whatever it is given; an ocx- agent's
  // model is pinned by its proxy, so its `model` is a placeholder.
  if (e.fork || e.subagentType.startsWith('ocx-')) return undefined

  return current[roleOf(e.subagentType)] ?? current.all
}

async function setLock($: EngineInterface, change: (current: Lock) => Lock): Promise<Lock> {
  return update($, lock, change)
}

const USAGE = 'Name models for roles in a prompt ("sonnet scouts", "a fable checker", "all agents on haiku"), or /lock <phrase>. /lock off clears it.'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    off = namedOff($)
    if (await off) {
      await setLock($, () => ({}))

      return result
    }
    await $.command.register({
      name: 'lock',
      description: 'Show, set or clear the sub-agent model lock',
      argumentHint: '[off | sonnet scouts, fable checker]',
      immediate: true,
    })

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const isPersons = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (!isPersons || (await isKilled($))) return next(e)

    const named = parseLock(e.text)
    if (hasLock(named)) await setLock($, current => ({ ...current, ...named }))

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    if (await isKilled($)) return next(e)
    const model = lockedFor(await read($, lock), e)
    const isHeld = model === undefined || (e.model ?? '').toLowerCase().includes(model)

    return isHeld ? next(e) : next({ ...e, model })
  })

  on('command.run', { command: 'lock' }, async ($, e) => {
    const args = e.args.trim()
    if (/^(off|clear|none|reset)$/i.test(args)) {
      await setLock($, () => ({}))

      return { text: 'Model Lock off: sub-agents run on whatever each call or agent type says.' }
    }

    if (args) {
      const named = parseLock(args)
      if (!hasLock(named)) return { text: `No role and model found in "${clean(args).slice(0, 60)}". ${USAGE}` }
      await setLock($, current => ({ ...current, ...named }))
    }

    const current = await read($, lock)

    return {
      text: hasLock(current) ? `Model Lock: ${describeLock(current)}` : `Model Lock is off. ${USAGE}`,
    }
  })

  // CONTRACT: one SessionMode label, appended, on every surface (the status line has no lock).
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (await isKilled($)) return next(e)
    const label = lockLabel(await read($, lock))
    if (label === '') return next(e)

    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
  })
}
