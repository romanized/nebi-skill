// Nebi Beacon: one row above the prompt, drawn only while Claude waits on Nebi
// (a yellow NEED YOU) or the last turn died on an API error (a red STOPPED),
// and never while a turn runs. It reads the ✅ / ⏳ / ❓ status line every
// reply ends with; an ask it opens survives turns a background task or a peer
// started and clears only on Nebi's own prompt. One push per ask. A beacon
// file per session (CONTRACT.md, v2) lets other sessions and the status line
// see this one.
//
// Without this mod: the reply's own status line, the output style's push
// sentence, and the status line's other-sessions segment (fed by the Stop
// hook's fallback beacon files).
//
// The turn's end comes from `turn.step` (the last main-loop step's text and
// stop reason) and, for an interrupt during a tool, from that `tool.call`'s
// aborted signal: `turn.complete` is nebi-receipt's alone (CONTRACT.md).
//
// NEBI_VERIFY=1 marks a verification session (nebi-mod-verify's paint check,
// with nobody at the terminal): the row still draws, but no push goes out
// and no beacon file is written, so neither Nebi nor other sessions see it.
//
// The file's `browser` follows claude-home/nebi/route.mjs step for step
// (hooks/route.ts), and `browserActiveAt` is the session's last Chrome call,
// a sub-agent's too: nebi-constellation flags a clash only while two sessions
// on one Chrome both used it in the last 10 minutes.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, Timer } from 'claude-code'

import type { BeaconFile, BeaconKind, BrowserRoute, Route, TurnState } from '../types'
import { cellWidth, clean, fitRow, originNote, peerName, stepEnd, waitText } from './parts'
import type { StepOutcome } from './parts'
import { accountRoute, beaconBrowser, currentAccount, gitRootCandidates, joinPath, parseObject, projectRoute } from './route'

const turn = atom({ plugin: 'nebi-beacon', key: 'turn' } as const, null, { shape: 'v3' })
const ask = atom({ plugin: 'nebi-beacon', key: 'ask' } as const, null, { shape: 'v3' })
const question = atom({ plugin: 'nebi-beacon', key: 'question' } as const, null)
const now = atom({ plugin: 'nebi-beacon', key: 'now' } as const, 0)
const browserAt = atom({ plugin: 'nebi-beacon', key: 'browserAt' } as const, null)

const HEARTBEAT_MS = 30_000
const CHROME_TOOL = 'mcp__claude-in-chrome__'
const TEXT_MAX = 300

// State colours on badge backgrounds with black text: they read on a light
// terminal and a dark one alike. Non-breaking spaces keep a badge on one line.
const NEED = { label: 'NEED YOU', back: '#ffd23f' }
const STOPPED = { label: 'STOPPED', back: '#ff7070' }
const badgeText = (label: string) => ` ${label} `.replace(/ /g, ' ')

// Module values: a hot reload drops them, and the next event starts them again.
let heartbeat: Timer | null = null
// Set by session.end so a write still in flight never brings the old file back.
let isEnded = false
let isOffCached: boolean | null = null
let isVerifyCached: boolean | null = null
// Who sent the prompt the next turn.start runs: prompt.submit precedes it.
let nextOrigin: { kind: string; from: string } | null = null
// The turn a push went out in, the model's or this mod's: no second push there.
let pushedIn = ''

// NEBI_MODS_OFF=all or a comma list naming nebi-beacon: every hook passes through.
async function isOff($: EngineInterface): Promise<boolean> {
  if (isOffCached === null) {
    const list = (await $.env.get('NEBI_MODS_OFF').catch(() => undefined)) ?? ''
    const names = list.split(',').map(name => name.trim())
    isOffCached = names.includes('all') || names.includes('nebi-beacon')
  }

  return isOffCached
}

// NEBI_VERIFY=1: a verification session that must never reach Nebi or his other sessions.
async function isVerify($: EngineInterface): Promise<boolean> {
  if (isVerifyCached === null) isVerifyCached = (await $.env.get('NEBI_VERIFY').catch(() => undefined)) === '1'

  return isVerifyCached
}

const projectOf = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
const beaconPath = (home: string, sessionId: string) => `${home}/.claude/nebi/beacons/${sessionId}.json`

// route.mjs readJson: the file as an object, or null when it is missing, unreadable or not an object.
async function readObject($: EngineInterface, path: string): Promise<Record<string, unknown> | null> {
  if (!(await $.fs.exists(path).catch(() => false))) return null
  const text = await $.fs.read(path).catch(() => null)

  return parseObject(typeof text === 'string' ? text : null)
}

// route.mjs gitRoot: the nearest folder at or above `cwd` holding `.git` (a folder, or a file in a worktree).
async function gitRootOf($: EngineInterface, cwd: string): Promise<string | null> {
  for (const dir of gitRootCandidates(cwd)) {
    if (await $.fs.exists(joinPath(dir, '.git')).catch(() => false)) return dir
  }

  return null
}

// route.mjs resolveRoute, step for step: the project file at the git root
// wins, else the current account's default, else no route. Read fresh on
// every write, as the status line does, so a new browser.json counts at once.
async function routeOf($: EngineInterface, cwd: string, home: string): Promise<Route> {
  const account = currentAccount(await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined), home, cwd || '/')
  let found: BrowserRoute | null = null
  try {
    const root = cwd ? await gitRootOf($, cwd) : null
    found = projectRoute(root === null ? null : await readObject($, joinPath(root, '.claude/browser.json')), account)
    if (found === null && account !== null) {
      found = accountRoute(await readObject($, joinPath(home, '.claude/nebi/browsers.json')), account)
    }
  } catch {
    found = null
  }

  return { account, browser: beaconBrowser(found) }
}

function ensureHeartbeat($: EngineInterface) {
  if (heartbeat === null) heartbeat = $.clock.every(HEARTBEAT_MS, () => void beat($))
}

async function beat($: EngineInterface) {
  if ((await read($, ask)) !== null) {
    const t = await $.clock.now()
    await update($, now, () => t)
  }
  await writeBeacon($)
}

async function writeBeacon($: EngineInterface) {
  if (isEnded || (await isVerify($))) return
  try {
    const last = await read($, turn)
    const home = await $.env.get('HOME')
    if (last === null || !home) return

    const open = await read($, ask)
    const pending = await read($, question)
    const activeAt = await read($, browserAt)
    const sessionId = await $.session.id()
    const cwd = await $.session.cwd()
    const where = await routeOf($, cwd, home)
    const asking = pending ?? open
    const file: BeaconFile = {
      version: 2,
      writer: 'mod',
      sessionId,
      project: projectOf(cwd),
      cwd,
      account: where.account,
      browser: where.browser,
      kind: asking === null ? last.kind : 'need',
      text: asking?.what ?? last.text,
      ...(asking === null ? {} : { ask: { what: asking.what }, askedAt: asking.askedAt }),
      origin: last.origin,
      ...(activeAt === null ? {} : { browserActiveAt: activeAt }),
      startedAt: last.startedAt,
      updatedAt: last.changedAt,
      heartbeatAt: await $.clock.now(),
    }
    if (isEnded) return
    ensureHeartbeat($)
    await $.fs.write(beaconPath(home, sessionId), `${JSON.stringify(file, null, 2)}\n`)
  } catch (error) {
    $.ui.log(`nebi-beacon: could not write the beacon file: ${String(error)}`, { to: 'debug' })
  }
}

// A Chrome call in any loop: other sessions read it as browserActiveAt. The
// first one, or one after a quiet spell, is written at once; the heartbeat
// carries the rest, well inside the readers' 10-minute window.
async function markBrowser($: EngineInterface) {
  const t = await $.clock.now()
  const previous = await read($, browserAt)
  await update($, browserAt, () => t)
  if (previous === null || t - previous >= HEARTBEAT_MS) await writeBeacon($)
}

// The file's updatedAt moves whenever the ask or the question changes.
async function touch($: EngineInterface) {
  const t = await $.clock.now()
  await update($, turn, last => (last === null ? last : { ...last, changedAt: t }))
}

// Claude Code's own push: the engine skips it while Nebi is active in this
// terminal, which is what makes it fire only when he is away.
async function notify($: EngineInterface, what: string, turnId: string) {
  pushedIn = turnId
  if (await isVerify($)) return
  const project = projectOf(await $.session.cwd().catch(() => ''))
  const message = clean(`${project} needs you: ${what}`.replace(/[`*_]/g, ''), 190)
  void $.tool.call({ tool: 'PushNotification', message, status: 'proactive' }).catch(() => undefined)
}

// The main-loop turn ended: how, an ask when it ended on ❓, one push per ask.
async function settle($: EngineInterface, turnId: string, status: { kind: BeaconKind; text: string }) {
  const last = await read($, turn)
  const t = await $.clock.now()
  const origin = last?.turnId === turnId ? last.origin : 'unclassified'
  const from = last?.turnId === turnId ? last.from : ''
  await update($, turn, () => ({
    kind: status.kind,
    text: status.text,
    origin,
    from,
    turnId,
    startedAt: last?.startedAt ?? t,
    changedAt: t,
  }))

  if (status.kind === 'need') {
    const open = await read($, ask)
    const what = status.text === '' ? 'waiting on you' : status.text
    await update($, ask, () => ({ what, origin, from, askedAt: open?.askedAt ?? t }))
    await update($, now, () => t)
    if (open === null && pushedIn !== turnId) await notify($, what, turnId)
  }
  await writeBeacon($)
}

// A step of a settled turn brought no response: the turn reads as that
// settle left it, its ask and push untouched.
async function restore($: EngineInterface, turnId: string, settled: TurnState) {
  await update($, turn, current => (current !== null && current.turnId === turnId && current.kind === 'working' ? settled : current))
  await writeBeacon($)
}

// Nebi interrupted a tool of the running turn: it ends there.
async function interrupted($: EngineInterface, turnId: string) {
  const last = await read($, turn)
  if (last !== null && last.turnId === turnId && last.kind === 'working') {
    await settle($, turnId, { kind: 'stopped', text: 'interrupted' })
  }
}

const idleTurn = (at: number): TurnState => ({
  kind: 'idle',
  text: '',
  origin: 'unclassified',
  from: '',
  turnId: '',
  startedAt: at,
  changedAt: at,
})

// What the other mods drew in the band: kept unless there is nothing in it.
const isEmpty = (tree: RenderElement | null | undefined) =>
  tree === null || tree === undefined || ((tree.type === 'Box' || tree.type === 'Text') && (tree.children?.length ?? 0) === 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    if (await isOff($)) return result

    isEnded = false
    if ((await read($, turn)) === null) {
      const at = await $.clock.now()
      await update($, turn, () => idleTurn(at))
    }
    await writeBeacon($)

    return result
  })

  on('session.end', async ($, e, next) => {
    if (await isOff($)) return next(e)

    // The file goes on every end: a /clear carries on under a new session id,
    // whose file the next turn.start writes and whose heartbeat it restarts.
    isEnded = true
    heartbeat?.cancel()
    heartbeat = null
    const home = await $.env.get('HOME').catch(() => undefined)
    if (home && !(await isVerify($))) await $.process.run(['rm', '-f', beaconPath(home, e.sessionId)]).catch(() => undefined)
    const at = await $.clock.now()
    await update($, turn, () => idleTurn(at))
    await update($, ask, () => null)
    await update($, question, () => null)
    await update($, browserAt, () => null)
    nextOrigin = null

    return next(e)
  })

  // Nebi's own prompt (typed, or from his phone) answers the ask; a task
  // notification, a peer or a plugin does not.
  on('prompt.submit', async ($, e, next) => {
    if (await isOff($)) return next(e)

    const kind = e.origin?.kind ?? 'unclassified'
    nextOrigin = { kind, from: peerName(e.origin ?? { kind }, e.text) }
    if ((kind === 'composer' || kind === 'bridge') && (await read($, ask)) !== null) {
      await update($, ask, () => null)
      await touch($)
      void writeBeacon($)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (await isOff($)) return next(e)

    isEnded = false
    const t = await $.clock.now()
    const origin = nextOrigin ?? { kind: 'unclassified', from: '' }
    nextOrigin = null
    await update($, turn, () => ({
      kind: 'working',
      text: clean(e.text, TEXT_MAX),
      origin: origin.kind,
      from: origin.from,
      turnId: e.turnId,
      startedAt: t,
      changedAt: t,
    }))
    await writeBeacon($)

    return next(e)
  })

  // Observes only: a Chrome call in any loop (browserActiveAt), the model's
  // own push, an AskUserQuestion waiting on its dialog (an ask while it waits;
  // the dialog is the drawing, so no row), and Nebi's Esc during any
  // main-loop tool, which ends the turn with no step streaming to see it.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (await isOff($)) return next(e)
    if (tool.startsWith(CHROME_TOOL)) await markBrowser($)
    if (e.agentId !== undefined) return next(e)

    const turnId = (await read($, turn))?.turnId ?? ''
    if (tool !== 'PushNotification' && tool !== 'AskUserQuestion') {
      try {
        return await next(e)
      } finally {
        if (next.signal.aborted) await interrupted($, turnId)
      }
    }
    if (tool === 'PushNotification') {
      pushedIn = turnId

      return next(e)
    }

    const asked = (e as { questions?: readonly { question?: unknown }[] }).questions?.[0]?.question
    const what = clean(typeof asked === 'string' ? asked : 'answer the question', TEXT_MAX)
    const wasOpen = (await read($, ask)) !== null
    const at = await $.clock.now()
    await update($, question, () => ({ what, askedAt: at }))
    await touch($)
    await writeBeacon($)
    if (!wasOpen && pushedIn !== turnId) void notify($, what, turnId)

    try {
      return await next(e)
    } finally {
      await update($, question, () => null)
      await touch($)
      if (next.signal.aborted) await interrupted($, turnId)
      else void writeBeacon($)
    }
  })

  // A main-loop step that ended the turn settles it; one that called a tool
  // leaves it running. Read-only: every chunk passes on as it came.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || (await isOff($))) return yield* next(e)

    // A settings Stop hook that blocked makes the model go on in the same turn.
    // `settled` is how the step before left it: put back when this step
    // brings no response, so a no-request step leaves its ❓ or ✅ standing.
    const last = await read($, turn)
    const settled = last !== null && last.turnId === e.turnId && last.kind !== 'working' ? last : null
    if (settled !== null) {
      const t = await $.clock.now()
      await update($, turn, () => ({ ...settled, kind: 'working', changedAt: t }))
      await writeBeacon($)
    }

    let outcome: StepOutcome = 'abandoned'
    let step: { answer: string; stopReason: string | null; toolCount: number } | null = null
    try {
      const result = yield* next(e)
      step = { answer: result.answer, stopReason: result.stopReason, toolCount: result.toolUses.length }
      outcome = result.stopReason === null && next.signal.aborted ? 'aborted' : 'done'

      return result
    } catch (error) {
      outcome = next.signal.aborted ? 'aborted' : 'failed'
      throw error
    } finally {
      // Reached on a result, a throw, or a stream closed early: an interrupt
      // aborts the signal; a close with no abort changes nothing.
      if (outcome === 'abandoned' && next.signal.aborted) outcome = 'aborted'
      const end = stepEnd(outcome, step)
      if (end !== null) await settle($, e.turnId, end)
      else if (settled !== null && (step === null || step.stopReason === null)) await restore($, e.turnId, settled)
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (await isOff($)) return below
    // A hot reload (deploy's /reload-plugins) drops the heartbeat; a session
    // idle on an ask would go stale in 90 s, so the band's redraw restarts it.
    if (!isEnded) ensureHeartbeat($)
    if (e.props.hasSurvey || e.props.isWorking) return below

    const last = await read($, turn)
    if (last === null || last.kind === 'working' || (await read($, question)) !== null) return below
    const open = await read($, ask)
    if (open === null && last.kind !== 'error') return below

    const look = open === null ? STOPPED : NEED
    const badge = badgeText(look.label)
    const room = Math.max(20, e.props.bodyColumns - 2) - cellWidth(badge) - 1
    const line =
      open === null
        ? fitRow(last.text, [], room)
        : fitRow(open.what, [waitText((await read($, now)) - open.askedAt), originNote(open.origin, open.from)], room)

    const { Box, Text } = $.ui.resolve(e)
    const mine = (
      <Box flexDirection="row" gap={1} paddingX={1}>
        <Box flexShrink={0}>
          <Text color="black" backgroundColor={look.back} bold wrap="truncate">
            {badge}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">{line}</Text>
        </Box>
      </Box>
    )

    return isEmpty(below) ? mine : (
      <Box flexDirection="column">
        {below}
        {mine}
      </Box>
    )
  })
}
