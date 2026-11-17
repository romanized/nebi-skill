#!/usr/bin/env node
// codex-browser: a stdio MCP server that lets any Claude Code session (either
// Claude account, and its sub-agents) drive the browsers and desktop apps that
// Codex's computer use controls. It starts the cua_repl server installed with
// ChatGPT.app (unified-computer-use plugin, newest version) and adds the
// x-codex-turn-metadata its browser side requires on every tools/call. No
// OpenAI model runs: cua_repl is a JavaScript REPL with the `cua` API.
//
// When the session ends it calls cua_repl's turn_ended, which closes the
// session's agent tabs that were not marked with markHandoff/markDeliverable.
//
// Registered with: claude mcp add -s user codex-browser -- node ~/.claude/nebi/codex-browser.mjs
// Unofficial: a ChatGPT update can rename or move these files.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import readline from 'node:readline'

const CLEANUP_ID = 'codex-browser-cleanup'
const CLEANUP_WAIT_MS = 5000

const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
const pluginDir = join(codexHome, 'plugins/cache/openai-bundled/unified-computer-use')
const newest = readdirSync(pluginDir)
  .filter(name => /^\d/.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .pop()
if (!newest) {
  process.stderr.write(`codex-browser: no unified-computer-use version under ${pluginDir}; install the Chrome plugin in the ChatGPT app\n`)
  process.exit(1)
}
const server = JSON.parse(readFileSync(join(pluginDir, newest, '.mcp.json'), 'utf8')).mcpServers.cua_repl

// One Codex session per Claude session (one server process each); turn_ended starts a new turn.
const sessionId = process.env.CODEX_BROWSER_SESSION_ID || randomUUID()
let turnId = randomUUID()
const turnMetadata = () => JSON.stringify({ session_id: sessionId, turn_id: turnId })

const child = spawn(server.command, server.args, { env: { ...process.env, ...server.env }, stdio: ['pipe', 'pipe', 'inherit'] })
child.on('exit', code => process.exit(code ?? 0))

let hasUsedRuntime = false
let finishCleanup = null

const toChild = message => child.stdin.write(`${JSON.stringify(message)}\n`)

readline.createInterface({ input: process.stdin }).on('line', line => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    child.stdin.write(`${line}\n`)
    return
  }
  if (message.method === 'tools/call') {
    message.params = { ...message.params, _meta: { ...(message.params?._meta ?? {}), 'x-codex-turn-metadata': turnMetadata() } }
    if (message.params.name === 'js') hasUsedRuntime = true
    if (message.params.name === 'turn_ended') setImmediate(() => { turnId = randomUUID() })
  }
  toChild(message)
})

// Browser Use asks before each new site, download or upload with an
// elicitation that has no input fields: Accept or Decline only. Claude Code
// shows those even in bypass mode and a background sub-agent cannot answer
// them, so accept them here. A question with real input fields still reaches
// the user. The answer asks Browser Use to remember the approval for the site
// ("always" when offered, else "session"), so the same question is not asked again.
function acceptApproval(line) {
  if (!line.includes('"elicitation/create"')) return false
  const message = JSON.parse(line)
  const schema = message.params?.requestedSchema
  if (message.method !== 'elicitation/create' || !schema || Object.keys(schema.properties ?? {}).length > 0) return false
  process.stderr.write(`codex-browser: accepted "${message.params.message}"\n`)
  const offered = [message.params?._meta?.persist ?? message.params?.meta?.persist].flat()
  const persist = offered.includes('always') ? 'always' : offered.includes('session') ? 'session' : undefined
  toChild({ jsonrpc: '2.0', id: message.id, result: { action: 'accept', content: {}, ...(persist ? { _meta: { persist } } : {}) } })
  return true
}

// Forward the server's replies, except the answer to our own cleanup call and
// the approvals accepted above.
readline.createInterface({ input: child.stdout }).on('line', line => {
  if (finishCleanup && line.includes(CLEANUP_ID)) {
    finishCleanup()
    return
  }
  if (acceptApproval(line)) return
  process.stdout.write(`${line}\n`)
})

let isShuttingDown = false
async function shutDown() {
  if (isShuttingDown) return
  isShuttingDown = true
  if (hasUsedRuntime) {
    await new Promise(resolve => {
      finishCleanup = resolve
      setTimeout(resolve, CLEANUP_WAIT_MS)
      toChild({
        jsonrpc: '2.0',
        id: CLEANUP_ID,
        method: 'tools/call',
        params: {
          name: 'turn_ended',
          arguments: { hook_event_name: 'SessionEnd', session_id: sessionId, turn_id: turnId },
          _meta: { 'x-codex-turn-metadata': turnMetadata() },
        },
      })
    })
  }
  child.stdin.end()
  setTimeout(() => child.kill(), 1000).unref()
}
process.stdin.on('end', shutDown)
process.on('SIGTERM', shutDown)
process.on('SIGINT', shutDown)
