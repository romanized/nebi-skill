// Nebi Red Button: holds a call that cannot be taken back (rm -rf, a force
// push, destructive SQL) or that reaches people outside this machine (a send,
// a publish, a deploy) until Nebi presses a button. Everything else runs.
// While it holds, `<sessionId>.hold.json` in the beacons folder tells other
// sessions' status lines that this one needs him; it goes on every exit.
//
// Where it shows: a hold only ever draws its row in the AbovePrompt band. The
// pane opens only when Nebi types a bare `/redbutton` (CONTRACT, Panes); while
// that pane is up it carries the hold and the band yields to it.
//
// NEBI_VERIFY=1 marks a verification session (nebi-mod-verify's paint check,
// with nobody at the terminal): a hold still draws and waits, but no push goes
// out and no hold file is written, so neither Nebi nor other sessions see it.
//
// Holding: a hook has a budget of its own time, but a `$` call in flight is
// free, so the hold waits on `$.process.run(['sleep', '0.25'])` until a button
// writes the choice into `$.state` (the pattern Blast Radius uses).
//
// No-mod fallback: the session's permission mode decides these calls (with
// NEBI_MODS_OFF naming this mod, or the mod not loaded, nothing holds them).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { RedButtonChoice, RedButtonHold } from '../types'
import { RULES, classifyCall, clean } from './classify'
import type { Probe, Risk } from './classify'

const hold = atom({ plugin: 'nebi-red-button', key: 'hold' } as const, null)
const isPaneOpen = atom({ plugin: 'nebi-red-button', key: 'isPaneOpen' } as const, false)
const allowed = atom({ plugin: 'nebi-red-button', key: 'allowed' } as const, [])
const isOff = atom({ plugin: 'nebi-red-button', key: 'isOff' } as const, false)

const PLUGIN = 'nebi-red-button'
const PANE = PLUGIN
const POLL_SECONDS = '0.25'
const HOLD_LIMIT_MS = 10 * 60 * 1000
const CHANGE_LINES = 6

// One hold at a time: claimed with no await between the check and the claim.
let isBusy = false
// The answer to each hold, by its id. The hold learns it here: a `$.state` read
// inside the long-running tool.call dispatch keeps seeing the value it started
// with, so state carries only what the drawing shows.
const choices = new Map<string, RedButtonChoice>()
let heldId: string | null = null
// CONTRACT kill switch, read once per module load: NEBI_MODS_OFF=all or a list naming this mod.
let isKilled: boolean | undefined
// NEBI_VERIFY=1, read once per module load: a verification session.
let isVerifyCached: boolean | undefined
// userConfig `push`: one phone push per hold.
let isPushOn = true

export const register: Register = (on, options) => {
  isPushOn = options.push !== false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    if (await killed($)) return result
    // A pane flag left over would hide the band row: a new session starts with the band.
    await update($, isPaneOpen, () => false)
    // A hold left in state by a module that reloaded mid-hold is dead: nothing waits on it.
    if (!isBusy) {
      await update($, hold, () => null)
      const file = (await isVerify($)) ? null : await holdPath($).catch(() => null)
      if (file !== null) await $.process.run(['rm', '-f', file]).catch(() => undefined)
    }
    await $.command.register({
      name: 'redbutton',
      description: 'Red Button: open its pane and list what it holds; off or on for this session',
      argumentHint: '[on|off]',
      immediate: true,
    })

    return result
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (tool !== 'Bash' && !tool.startsWith('mcp__')) return next(e)

    if (await killed($)) return next(e)
    const input = e as unknown as Readonly<Record<string, unknown>>
    const cwd = tool === 'Bash' ? await $.session.cwd() : ''
    const tmpdir = tool === 'Bash' ? ((await $.env.get('TMPDIR').catch(() => undefined)) ?? '') : ''
    const risk = classifyCall(tool, input, cwd, tmpdir)
    if (risk === null || (await read($, isOff)) || (await read($, allowed)).includes(risk.rule)) return next(e)

    // A sub-agent has nobody watching it: stop it at once and send it back to its lead.
    if (e.agentId !== undefined) {
      $.ui.toast(`Red Button stopped a sub-agent: ${risk.short}`)

      const instead = risk.hint ?? 'Report the exact command to the lead instead of trying another route.'

      return { deny: `Nebi's Red Button blocks sub-agents from ${risk.label}. ${instead}` }
    }

    const choice = await holdCall($, risk, next.signal)
    if (choice === 'allow') {
      await update($, allowed, list => (list.includes(risk.rule) ? list : [...list, risk.rule]))
      $.ui.toast(`Red Button: ${risk.label} allowed for this session`)
    }
    if (choice === 'run' || choice === 'allow') return next(e)

    return { deny: denial(risk, choice) }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, isPaneOpen, () => false)
    await paneClosed($, e.origin.kind)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    const held = await read($, hold)
    if (held === null || held.id !== heldId) return <Text dimColor>Nothing is held.</Text>

    return card($, e, held, 'pane')
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const held = await read($, hold)
    if (held === null || held.id !== heldId || (await read($, isPaneOpen))) return below

    const { Box } = $.ui.resolve(e)
    const mine = card($, e, held, 'band')
    if (!hasContent(below)) return mine

    return (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    )
  })

  on('command.run', { command: 'redbutton' }, async ($, e, next) => {
    if (await killed($)) return next(e)
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      await update($, isOff, () => true)

      return { text: 'Red Button is off for this session: nothing is held. /redbutton on arms it again.' }
    }
    if (arg === 'on') {
      await update($, isOff, () => false)

      return { text: 'Red Button is armed.' }
    }

    // The one sanctioned pane: Nebi typed a bare /redbutton. It shows the hold, or that nothing is held.
    if (arg === '' && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
      const held = await read($, hold)
      const rows = held === null ? undefined : 9 + held.change.length
      const opened = await $.ui.open({ id: PANE, title: 'Red Button', focus: true, closeOnEscape: true, ...(rows === undefined ? {} : { rows }) })
      await update($, isPaneOpen, () => opened.isPlaced)
    }

    return { text: listing(await read($, isOff), await read($, allowed)) }
  })
}

// ---- Holding a call ------------------------------------------------------------

/** Shows the hold, waits for a choice, and always takes the hold down again. Exported for the interrupt tests. */
export async function holdCall($: EngineInterface, risk: Risk, signal: AbortSignal): Promise<RedButtonChoice> {
  while (isBusy) {
    if (signal.aborted) return 'interrupted'
    await $.process.run(['sleep', POLL_SECONDS], { timeoutMs: 5000 })
  }
  isBusy = true
  let id = ''
  let file: string | null = null
  try {
    id = `${await $.clock.now()}-${Math.random().toString(36).slice(2, 8)}`
    heldId = id
    const change = risk.probe ? await probe($, risk.probe) : []
    // The hold draws its band row and nothing more: it never opens a pane.
    await update($, hold, () => ({ id, tool: risk.tool, what: risk.what, rule: risk.rule, ruleLabel: risk.label, change, choice: null }))
    const isVerifying = await isVerify($)
    file = isVerifying ? null : await writeHoldFile($, risk)
    // One push per hold, over Remote Control; the engine skips it while the person is at the terminal.
    if (isPushOn && !isVerifying) void $.tool.call({ tool: 'PushNotification', message: clean(`Claude needs approval: ${risk.short}`, 190), status: 'proactive' }).catch(() => undefined)

    const startedAt = await $.clock.now()
    for (;;) {
      const choice = choices.get(id)
      if (choice !== undefined) return choice
      if (signal.aborted) return 'interrupted'
      if ((await $.clock.now()) - startedAt > HOLD_LIMIT_MS) return 'timeout'
      await $.process.run(['sleep', POLL_SECONDS], { timeoutMs: 5000 })
    }
  } catch {
    return 'block' // anything unexpected refuses the call
  } finally {
    await update($, hold, held => (held?.id === id ? null : held)).catch(() => undefined)
    if (file !== null) await $.process.run(['rm', '-f', file]).catch(() => undefined)
    choices.delete(id)
    heldId = null
    isBusy = false
  }
}

/**
 * The dialog closed. Esc is a Block; a dialog the engine dropped can never be
 * answered, so it denies at once; a plugin closing it answers nothing.
 * Exported because the test kit cannot raise a person's or the engine's close.
 */
export async function paneClosed($: EngineInterface, kind: 'plugin' | 'person' | 'unload') {
  if (kind === 'person') await choose($, null, 'escape')
  if (kind === 'unload') await choose($, null, 'unloaded')
}

/** Records the first choice for the hold `id` (null: whichever is held now). */
async function choose($: EngineInterface, id: string | null, choice: RedButtonChoice) {
  const target = id ?? heldId
  if (target === null || target !== heldId || choices.has(target)) return
  choices.set(target, choice)
  await update($, hold, held => (held?.id === target ? { ...held, choice } : held))
}

/** What the model reads when a held call does not run. Exported for the tests. */
export function denial(risk: Risk, choice: RedButtonChoice): string {
  if (choice === 'interrupted') return `Red Button held this (${risk.label}) and the turn was interrupted before Nebi answered. Ask before trying another route.`
  if (choice === 'timeout') return "Nebi didn't answer in 10 min. Skip this step, carry on with the rest, and put the exact command in your ❓ line."
  if (choice === 'unloaded') return `Red Button's dialog closed before Nebi answered (${risk.label}). Skip this step, carry on with the rest, and put the exact command in your ❓ line.`

  return `Nebi blocked this with Red Button (${risk.label}). Ask before trying another route.`
}

// ---- Kill switch and the hold file ----------------------------------------------

async function killed($: EngineInterface): Promise<boolean> {
  if (isKilled === undefined) {
    const off = (await $.env.get('NEBI_MODS_OFF').catch(() => undefined)) ?? ''
    const names = off.split(',').map(name => name.trim())
    isKilled = names.includes('all') || names.includes(PLUGIN)
  }

  return isKilled
}

// NEBI_VERIFY=1: a verification session that must never reach Nebi or his other sessions.
async function isVerify($: EngineInterface): Promise<boolean> {
  if (isVerifyCached === undefined) isVerifyCached = (await $.env.get('NEBI_VERIFY').catch(() => undefined)) === '1'

  return isVerifyCached
}

/** `<HOME>/.claude/nebi/beacons/<sessionId>.hold.json`, or null when HOME is unknown. */
async function holdPath($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME').catch(() => undefined)

  return home ? `${home}/.claude/nebi/beacons/${await $.session.id()}.hold.json` : null
}

/** Writes the CONTRACT hold file; returns its path for the cleanup even when the write failed. */
async function writeHoldFile($: EngineInterface, risk: Risk): Promise<string | null> {
  const file = await holdPath($).catch(() => null)
  if (file === null) return null
  try {
    const cwd = await $.session.cwd()
    const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? ''
    const home = (await $.env.get('HOME')) ?? ''
    const account = configDir === '' || configDir === `${home}/.claude` || configDir === '~/.claude' ? 'a' : configDir.includes('.claude-max2') ? 'b' : null
    const body = {
      version: 1,
      sessionId: await $.session.id(),
      project: cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd,
      cwd,
      account,
      what: risk.what,
      heldAt: await $.clock.now(),
    }
    await $.fs.write(file, `${JSON.stringify(body, null, 2)}\n`)
  } catch (error) {
    $.ui.log(`nebi-red-button: could not write the hold file: ${String(error)}`, { to: 'debug' })
  }

  return file
}

// ---- What the call would change ------------------------------------------------

/** A few lines on what the call would change; empty when that cannot be learned. */
async function probe($: EngineInterface, p: Probe): Promise<string[]> {
  try {
    const home = (await $.env.get('HOME')) ?? ''
    const cwd = p.dir === '' ? undefined : p.dir.replace(/^~(?=\/|$)/, home)
    if (cwd !== undefined && cwd.includes('$')) return []
    const run = (argv: string[]) => $.process.run(argv, { cwd, timeoutMs: 4000 })

    if (p.kind === 'rm') {
      const paths = p.targets.filter(t => !/[*?[$`]/.test(t)).map(t => t.replace(/^~(?=\/|$)/, home)).map(t => (t.startsWith('/') ? t : `./${t}`))
      if (paths.length === 0) return ['the paths are globs or variables, so nothing was counted']
      const found = await run(['find', ...paths, '-maxdepth', '2'])
      const entries = found.stdout.split('\n').filter(Boolean)
      if (entries.length === 0) return ['nothing there: the paths do not exist']
      const count = entries.length >= 1000 ? '1000+' : String(entries.length)

      return [`deletes ${count} files and folders (two levels deep)`, ...entries.slice(0, CHANGE_LINES - 1).map(l => `  ${clean(l, 120)}`)]
    }
    if (p.kind === 'reset' || p.kind === 'discard') {
      const stat = await run(p.kind === 'reset' ? ['git', 'diff', '--stat', 'HEAD'] : ['git', 'diff', '--stat'])
      const lines = stat.stdout.split('\n').filter(Boolean)
      if (stat.exitCode !== 0) return []
      if (lines.length === 0) return ['no uncommitted changes to lose']
      const total = lines[lines.length - 1] ?? ''

      return [`loses ${clean(total, 120)}`, ...lines.slice(0, -1).slice(0, CHANGE_LINES - 1).map(l => `  ${clean(l, 120)}`)]
    }
    if (p.kind === 'push') {
      const branch = p.branch || (await run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
      if (branch === '') return []
      const ref = `${p.remote}/${branch}`
      const dropped = await run(['git', 'rev-list', '--count', `HEAD..${ref}`])
      const count = dropped.exitCode === 0 ? Number(dropped.stdout.trim()) : NaN

      return [
        `rewrites ${ref} on the remote`,
        ...(Number.isFinite(count) ? [count === 0 ? 'drops no commits it has (as of the last fetch)' : `drops ${count} commit${count === 1 ? '' : 's'} only ${ref} has (as of the last fetch)`] : []),
      ]
    }
    if (p.kind === 'clean') {
      const flags = p.flags.map(f => (/^-[A-Za-z]+$/.test(f) ? f.replace(/[fniq]/g, '') : f)).filter(f => f !== '-' && f !== '--force')
      const dry = await run(['git', 'clean', '-n', ...flags])
      const gone = dry.stdout.split('\n').filter(l => l.startsWith('Would remove ')).map(l => l.slice(13))
      if (dry.exitCode !== 0) return []
      if (gone.length === 0) return ['removes nothing: no untracked files match']

      return [`removes ${gone.length} untracked path${gone.length === 1 ? '' : 's'}`, ...gone.slice(0, CHANGE_LINES - 1).map(l => `  ${clean(l, 120)}`)]
    }
    if (p.kind === 'branch' && p.branch !== '') {
      const only = await run(['git', 'rev-list', '--count', `HEAD..${p.branch}`])
      const count = Number(only.stdout.trim())
      if (only.exitCode !== 0 || !Number.isFinite(count)) return []

      return [count === 0 ? `${p.branch} has no commits HEAD lacks` : `loses ${count} commit${count === 1 ? '' : 's'} only ${p.branch} has`]
    }
  } catch {
    // a probe that fails shows nothing; the hold still shows what and why
  }

  return []
}

// ---- Drawing --------------------------------------------------------------------

type RenderEvent = Parameters<EngineInterface['ui']['resolve']>[0]

function hasContent(tree: RenderElement | null | undefined): boolean {
  if (tree === null || tree === undefined) return false
  if (tree.type === 'Box' || tree.type === 'Text') return (tree.children ?? []).length > 0

  return true
}

/** The hold as a card: badge, what, rule, what it would change, three buttons. */
function card($: EngineInterface, e: RenderEvent, held: RedButtonHold, where: 'pane' | 'band') {
  const { Box, Text, Button } = $.ui.resolve(e)
  const tool = held.tool === 'Bash' ? 'Bash' : held.tool.replace(/^mcp__/, '').replace(/__/g, ' · ')

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Box flexShrink={0}>
          <Text color="black" backgroundColor="red" bold wrap="truncate">
            {' ⏺ RED BUTTON '}
          </Text>
        </Box>
        <Text bold wrap="truncate-end">
          {`Claude wants to run something that can't be taken back`}
        </Text>
      </Box>
      <Text wrap="wrap">
        <Text dimColor>{'what    '}</Text>
        <Text dimColor>{`${tool}  `}</Text>
        <Text bold>{held.what}</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text dimColor>{'rule    '}</Text>
        {held.ruleLabel}
      </Text>
      {held.change.map((line, i) => (
        <Text key={`change-${i}`} wrap="truncate-end">
          <Text dimColor>{i === 0 ? 'change  ' : '        '}</Text>
          {i === 0 ? <Text color="red">{line}</Text> : <Text dimColor>{line}</Text>}
        </Text>
      ))}
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Button key="run" label="Run it" hotkey="r" plain onPress={() => void choose($, held.id, 'run')} />
        <Button key="block" label="Block" hotkey="b" variant="primary" autoFocus onPress={() => void choose($, held.id, 'block')} />
        <Button key="allow" label="Allow this rule for the session" hotkey="a" plain onPress={() => void choose($, held.id, 'allow')} />
      </Box>
      <Text dimColor wrap="truncate-end">
        {where === 'pane' ? 'Claude is waiting on you · r run · b block · a allow for the session · Esc blocks' : 'Claude is waiting on you · ctrl+x tab, then r run · b block · a allow for the session'}
      </Text>
    </Box>
  )
}

function listing(off: boolean, allowList: readonly string[]): string {
  const rules = RULES.map(r => `  - ${r.label}`).join('\n')
  const allows = allowList.length === 0 ? '  (none)' : allowList.map(r => `  - ${r}`).join('\n')

  return [
    off ? 'Red Button is OFF for this session (/redbutton on arms it).' : 'Red Button is armed (/redbutton off turns it off for this session).',
    '',
    'It holds these and asks first:',
    rules,
    '',
    'Allowed for this session with [a]:',
    allows,
  ].join('\n')
}
