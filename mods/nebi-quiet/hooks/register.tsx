// Nebi Quiet: the single owner of the built-in drawings Nebi does not read
// (CONTRACT: PromptHint, ToolProgress, ToolResult, ToolUse, InfoNotice).
//
// - ToolResult: a Write, Edit, MultiEdit or NotebookEdit that did not error
//   draws one dim line (`wrote 142 lines · mods/x.ts`, `edited statusline.mjs +3 −2`),
//   behind the terminal's `⎿` gutter. userConfig `edits: full` keeps the engine's rows.
// - ToolUse: a running Workflow is one line, `workflow · <name> · running`; the
//   model's own PushNotification row draws nothing.
// - ToolProgress: the ctrl+b pill draws nothing.
// - PromptHint: drops `(shift+tab to cycle)`, `? for shortcuts` and the
//   separators they leave, never sets `tail`. userConfig `footer: engine` keeps it.
// - InfoNotice: not hooked. A live capture on 2.1.288 showed the mod reload line
//   (`⏺ <mod>: reloaded`) draws as a transcript row, never through InfoNotice;
//   "Plugins changed" and the update notice are notifications (research modsapi-21).
// Errored and interrupted rows always pass through untouched.
//
// Kill switch: NEBI_MODS_OFF=all, or a comma list naming nebi-quiet. A hooks
// module has no `$` at load, so the value is read on the first drawing and
// every hook passes from then on.
// Fallback without this mod: none. No setting hides these drawings; the
// engine's own rows come back.
import type { EngineInterface, Register } from 'claude-code'

import type { QuietEdits, QuietFooter } from '../types'
import { clean, describeEdit, isNamedOff, trimHint, workflowName } from './quiet'

const EDIT_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const GUTTER = '  ⎿  '

// The environment is fixed for the process; a hot reload reads it again.
let isOff: Promise<boolean> | undefined
const off = ($: EngineInterface) =>
  (isOff ??= $.env.get('NEBI_MODS_OFF').then(isNamedOff, () => false))

const where = async ($: EngineInterface) => ({
  cwd: await $.session.cwd().catch(() => ''),
  home: (await $.env.get('HOME').catch(() => undefined)) ?? '',
})

export const register: Register = (on, options) => {
  const isCompact = (options.edits as QuietEdits) !== 'full'
  const isTrim = (options.footer as QuietFooter) !== 'engine'

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { tool, isErrored, output } = e.props
    const isEdit = isCompact && EDIT_TOOLS.has(tool)
    if (isErrored || (!isEdit && tool !== 'PushNotification') || (await off($))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    if (tool === 'PushNotification') return <Box />

    const { cwd, home } = await where($)
    const text = describeEdit(tool, output, cwd, home)
    if (text === null) return next(e)

    // The terminal's result gutter is part of what the engine draws here, so keep it.
    return <Text dimColor>{e.surface === 'terminal' ? `${GUTTER}${text}` : text}</Text>
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { tool, input, output, isRunning, isErrored, isInterrupted } = e.props
    const isQuieted = tool === 'PushNotification' || (tool === 'Workflow' && isRunning)
    if (!isQuieted || isErrored || isInterrupted || (await off($))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    if (tool === 'PushNotification') return <Box />

    const name = workflowName(input, output)

    return <Text>{name === '' ? 'workflow · running' : `workflow · ${name} · running`}</Text>
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (e.props.kind !== 'background_hint' || (await off($))) return next(e)

    return next({ ...e, props: { ...e.props, hint: '' } })
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!isTrim) return next(e)
    const hint = trimHint(e.props.hint)
    if (hint === null || (await off($))) return next(e)

    // A rewritten hint replaces the line; a tail would ride on a line that is gone.
    // 2.1.288 joins any rewrite to the mode label with ` · `, so an empty hint
    // still leaves `⏵⏵ bypass permissions on · ` (seen live; no hook output avoids it).
    const { tail: _tail, ...props } = e.props

    return next({ ...e, props: { ...props, hint: clean(hint) } })
  })
}
