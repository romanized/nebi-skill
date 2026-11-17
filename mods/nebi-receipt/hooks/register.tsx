// Nebi Receipt: one line beneath a main-loop reply that changed files, saying
// what changed and whether it was proven:
//   changed statusline.mjs, nebi.md · checked node --test ✓
//   changed hero.tsx · no check since the last edit
//   changed hero.tsx · check failed: npm test
// It watches the turn's tool calls, its sub-agents' included, and is the only
// nebi mod that returns text at turn.complete. Read-only, aborted and
// sub-agent turns get no line.
//
// Without this mod: the Stop hook's §6 check (claude-home/hooks/
// verify-before-stop.mjs) still nudges a done-claim that has no passing
// command after the last edit.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CheckOutcome, ReceiptTurn } from '../types'
import { EDIT_TOOLS, checkLabel, isCheck, receiptLine } from './parts'

const NAME = 'nebi-receipt'
const CLOSED: ReceiptTurn = { turnId: null, seq: 0, files: [], lastEditAt: 0, check: null }

const turn = atom({ plugin: 'nebi-receipt', key: 'turn' } as const, CLOSED)

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    // CONTRACT kill switch: while named, no turn opens, so every hook passes.
    if (!(await isOff($))) await update($, turn, () => ({ ...CLOSED, turnId: e.turnId }))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const args = e as unknown as Readonly<Record<string, unknown>>
    const isEdit = EDIT_TOOLS.has(tool)
    const command = tool === 'Bash' && typeof args.command === 'string' ? args.command : ''
    if (!isEdit && !isCheck(command)) return next(e)

    const turnId = (await read($, turn)).turnId
    if (turnId === null) return next(e)

    // A check counts from when it started; an edit from when it finished.
    const startedAt = isEdit ? 0 : await tick($, turnId)
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    if (isEdit) {
      const path = typeof args.file_path === 'string' ? args.file_path : typeof args.notebook_path === 'string' ? args.notebook_path : ''
      if (ran.isError === true || path === '') return ran
      await update($, turn, t => {
        if (t.turnId !== turnId) return t
        const seq = t.seq + 1

        return { ...t, seq, lastEditAt: seq, files: t.files.includes(path) ? t.files : [...t.files, path] }
      })

      return ran
    }

    const check = { command: checkLabel(command), startedAt, outcome: outcomeOf(ran, args) }
    await update($, turn, t => (t.turnId !== turnId || (t.check !== null && t.check.startedAt > startedAt) ? t : { ...t, check }))

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    let ended = CLOSED
    await update($, turn, t => {
      ended = t
      return CLOSED
    })
    if (e.isAborted || ended.turnId !== e.turnId || ended.files.length === 0) return result

    const cwd = await $.session.cwd().catch(() => '')
    const home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
    const line = receiptLine(ended, cwd, home)

    return line === '' ? result : { ...result, text: line }
  })
}

async function isOff($: EngineInterface): Promise<boolean> {
  const value = (await $.env.get('NEBI_MODS_OFF').catch(() => undefined)) ?? ''

  return value.split(',').some(name => name.trim() === 'all' || name.trim() === NAME)
}

/** Moves the turn's counter on and resolves where it stands. */
async function tick($: EngineInterface, turnId: string): Promise<number> {
  return (await update($, turn, t => (t.turnId === turnId ? { ...t, seq: t.seq + 1 } : t))).seq
}

/** Failed on an error result or an interrupt; unknown when sent to the background. */
function outcomeOf(ran: { isError?: true; result?: unknown }, args: Readonly<Record<string, unknown>>): CheckOutcome {
  if (ran.isError === true) return 'failed'
  const result = typeof ran.result === 'object' && ran.result !== null ? (ran.result as Readonly<Record<string, unknown>>) : {}
  if (result.interrupted === true) return 'failed'
  if (args.run_in_background === true || typeof result.backgroundTaskId === 'string') return 'unknown'

  return 'passed'
}
