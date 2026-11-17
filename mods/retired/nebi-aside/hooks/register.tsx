// Nebi Aside: side questions that never touch the running turn. A prompt that
// starts with ?? (or /aside <question>) is kept out of the conversation and
// answered by a fork of this session's transcript, so the answer knows the
// context and the main turn keeps going. Answers land in the Aside pane.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelApiError, ModelForkResult, Register, Timer } from 'claude-code'

import type { AsideEntry } from '../types'

const PANE = 'nebi-aside'
const KEEP = 5
const FRAME_MS = 120
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const MARKDOWN_MAX = 9_000
const DROPPED = 'Answered aside: see the Aside pane'

const entries = atom({ plugin: 'nebi-aside', key: 'entries' } as const, [])
const now = atom({ plugin: 'nebi-aside', key: 'now' } as const, 0)

// Only what a person typed (here, from Remote Control or an SDK host) is read
// as an aside; a peer's message or a plugin's prompt that starts with ?? is not.
const PERSON_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])

// Model text and questions are drawn, so they are cleaned first (the Next Steps
// mod's clean()); the markdown form keeps newlines and tabs.
const ESCAPE_SEQUENCES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g
const TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/u
const UNSEEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}\p{Variation_Selector}ᅟᅠㅤﾠ]/gu
const UNSEEN_BUT_LINES = /(?![\n\t])[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}\p{Variation_Selector}ᅟᅠㅤﾠ]/gu
const COMBINING_RUN = /(\p{M}{3})\p{M}+/gu

export function cleanLine(text: string, max: number): string {
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

export function cleanMarkdown(text: string): string {
  if (TAG_CHARACTERS.test(text)) return ''
  const safe = text
    .replace(/\r\n?/g, '\n')
    .replace(ESCAPE_SEQUENCES, '')
    .replace(UNSEEN_BUT_LINES, '')
    .replace(COMBINING_RUN, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (safe.length <= MARKDOWN_MAX) return safe
  let cut = ''
  for (const point of safe) {
    if (cut.length + point.length >= MARKDOWN_MAX) break
    cut += point
  }

  return `${cut}…`
}

// The question in a prompt that starts with ??, or null for any other prompt.
export function asideQuestion(text: string): string | null {
  const trimmed = text.trimStart()

  return trimmed.startsWith('??') ? trimmed.slice(2).trim() : null
}

const forkPrompt = (question: string) =>
  [
    'Side question from the person, asked while the main work goes on. Answer it here only:',
    'do not continue the main task and do not call tools. Answer from what this conversation',
    'already shows, briefly (a few sentences or a short list). If it does not show the answer, say so.',
    '',
    `Question: ${question}`,
  ].join('\n')

const API_WORDS: Partial<Record<ModelApiError, string>> = {
  rate_limit: 'rate limited',
  overloaded: 'the API is overloaded',
  server_error: 'a server error',
  authentication_failed: 'not signed in',
  billing_error: 'a billing problem',
  invalid_request: 'the request was refused',
  model_not_found: 'the model was not found',
  unknown: 'an unknown error',
}
const PASSING: ReadonlySet<ModelApiError> = new Set(['rate_limit', 'overloaded', 'server_error'])

// Why the fork gave no answer, in plain words.
export function reasonText(result: Exclude<ModelForkResult, { isAnswered: true }>): string {
  switch (result.reason) {
    case 'nothing-to-fork':
      return 'No answer: this session has no reply to look back on yet (it is new or was just cleared). Ask again after its first answer.'
    case 'api-error': {
      const http = result.status ? `, HTTP ${result.status}` : ''
      const retry = PASSING.has(result.error) ? ' Try again in a moment.' : ''
      return `No answer: the model call failed (${API_WORDS[result.error] ?? result.error.replace(/_/g, ' ')}${http}).${retry}`
    }
    case 'empty-reply':
      return 'No answer: the model replied without any text.'
    case 'aborted':
      return 'No answer: the question was cut off before a reply came (the turn it rode on was interrupted).'
  }
}

// Module state: a reload resets it, so a question whose fork it dropped shows as such.
let spinner: Timer | null = null
const waiting = new Set<string>()

function ensureSpinner($: EngineInterface) {
  spinner ??= $.clock.every(FRAME_MS, () => void tick($))
}

async function tick($: EngineInterface) {
  if (waiting.size === 0) {
    spinner?.cancel()
    spinner = null
    return
  }
  const at = await $.clock.now()
  await update($, now, () => at)
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Aside' }).catch(() => undefined)

async function ask($: EngineInterface, raw: string) {
  const question = cleanLine(raw, 500)
  if (!question) return
  const askedAt = await $.clock.now()
  const id = `${askedAt}-${waiting.size}-${Math.random().toString(36).slice(2, 6)}`
  waiting.add(id)
  await update($, now, () => askedAt)
  await update($, entries, list => [{ id, question, status: 'thinking' as const, answer: '', askedAt }, ...list].slice(0, KEEP))
  void openPane($)
  ensureSpinner($)

  let settled: Pick<AsideEntry, 'status' | 'answer'>
  try {
    const result = await $.model.fork({ prompt: forkPrompt(raw.trim()) })
    const answer = result.isAnswered ? cleanMarkdown(result.text) : ''
    settled = result.isAnswered
      ? answer
        ? { status: 'answered', answer }
        : { status: 'unanswered', answer: reasonText({ isAnswered: false, reason: 'empty-reply', usage: result.usage }) }
      : { status: 'unanswered', answer: reasonText(result) }
  } catch (error) {
    settled = { status: 'unanswered', answer: `No answer: Claude Code refused the fork (${cleanLine(String(error), 160)}).` }
  } finally {
    waiting.delete(id)
  }
  await update($, entries, list => list.map(entry => (entry.id === id ? { ...entry, ...settled } : entry)))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command
      .register({
        name: 'aside',
        description: 'Ask a side question without touching the running turn',
        argumentHint: '<question>',
        immediate: true,
      })
      .catch(error => $.ui.log(`nebi-aside: /aside not registered: ${String(error)}`, { to: 'debug' }))

    return result
  })

  // Works whether nebi-wispr runs before or after: it leaves a leading ?? alone.
  on('prompt.submit', async ($, e, next) => {
    const question = PERSON_ORIGINS.has(e.origin.kind) ? asideQuestion(e.text) : null
    if (question === null) return next(e)
    if (question) {
      void ask($, question)
      return { drop: DROPPED }
    }
    void openPane($)

    return { drop: 'Aside: put your question after the ??' }
  })

  on('command.run', { command: 'aside' }, async ($, e) => {
    const question = e.args.trim().replace(/^\?\?\s*/, '')
    if (question) void ask($, question)
    else void openPane($)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, entries)
    const isThinking = list.some(entry => entry.status === 'thinking' && waiting.has(entry.id))
    const at = isThinking ? await read($, now) : 0
    const table = $.ui.resolve(e)
    const { Box, Text, Markdown } = table
    const Input = 'Input' in table ? table.Input : undefined

    const body = (entry: AsideEntry, isNewest: boolean) => {
      if (entry.status === 'answered') return <Markdown text={entry.answer} dimColor={!isNewest} />
      if (entry.status === 'unanswered') return <Text color="red">{`✖ ${entry.answer}`}</Text>
      // A question still marked thinking that no request here waits on was
      // asked before a reload dropped its fork.
      if (!waiting.has(entry.id)) return <Text color="red">✖ No answer: the mod reloaded while it waited. Ask again.</Text>
      const glyph = SPIN[Math.floor(at / FRAME_MS) % SPIN.length]
      const secs = Math.max(0, Math.floor((at - entry.askedAt) / 1000))

      return (
        <Box flexDirection="row" gap={1}>
          <Text color="cyan">{glyph}</Text>
          <Text dimColor>{`thinking over this session · ${secs}s`}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {Input ? <Input key="ask" placeholder="ask another side question…" submitLabel="ask" onSubmit={value => void ask($, value)} /> : null}
        {list.length === 0 ? (
          <Box marginTop={1}>
            <Text dimColor>Start a prompt with ?? or run /aside to ask without stopping the main turn.</Text>
          </Box>
        ) : null}
        {list.map((entry, i) => (
          <Box key={`q-${entry.id}`} flexDirection="column" marginTop={1}>
            <Text bold={i === 0} dimColor={i > 0} wrap="wrap">{`?? ${entry.question}`}</Text>
            {body(entry, i === 0)}
          </Box>
        ))}
      </Box>
    )
  })
}
