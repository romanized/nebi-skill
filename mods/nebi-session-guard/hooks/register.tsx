// Nebi Session Guard: agents never open a terminal, a Ghostty window or tab, or
// an interactive Claude session that Nebi did not ask for. A Bash call that
// would (term.mjs, `open -a Ghostty`, osascript aimed at a terminal app,
// `ghostty +new-window`, an interactive claude or claude-nebi/omer/a/b/profile)
// runs only in a turn his own prompt (typed, or over Remote Control) asked for
// a terminal, tab, window, split or session. Peer and notification turns never
// count, and sub-agents are always stopped. `claude -p` and the launcher's
// admin subcommands always run.
//
// No-mod fallback: the CLAUDE.md §10 rule (open a terminal, tab or session only
// when he asks in that message; otherwise hand him a paste-ready prompt).
import type { EngineInterface, Register } from 'claude-code'

import { asksForSession, opensSession } from './classify'

const PLUGIN = 'nebi-session-guard'

const MAIN_DENY =
  'Nebi opens terminals and sessions himself, so give him one fenced, paste-ready prompt whose first line is the launch line (claude-nebi or claude-omer, then the folder); only when he asks you to open it, run node ~/.claude/nebi/term.mjs --tab, which opens a tab in his current window.'
const SUBAGENT_DENY = 'Sub-agents never open terminals or sessions: report the exact command to the lead instead.'

// CONTRACT kill switch, read once per module load: NEBI_MODS_OFF=all or a list naming this mod.
let isKilled: boolean | undefined
// Whether the prompt that started this turn (or one Nebi typed into it) asked for a terminal.
// A module variable on purpose: after a reload it starts false, which only denies.
let isAsked = false

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (await killed($)) return next(e)
    const before = isAsked
    const isNebi = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    // A prompt delivered into a running turn joins that turn; any other starts a new one.
    const isJoining = e.turnId !== undefined
    if (isNebi) isAsked = (isJoining && isAsked) || asksForSession(e.text)
    else if (!isJoining) isAsked = false

    const result = await next(e)
    if (result.drop !== undefined) isAsked = before

    return result
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Bash') return next(e)
    if (await killed($)) return next(e)
    if (opensSession(String(e.command ?? '')) === null) return next(e)
    if (e.agentId !== undefined) return { deny: SUBAGENT_DENY }

    return isAsked ? next(e) : { deny: MAIN_DENY }
  })
}

async function killed($: EngineInterface): Promise<boolean> {
  if (isKilled === undefined) {
    const off = (await $.env.get('NEBI_MODS_OFF').catch(() => undefined)) ?? ''
    const names = off.split(',').map(name => name.trim())
    isKilled = names.includes('all') || names.includes(PLUGIN)
  }

  return isKilled
}
