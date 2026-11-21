#!/usr/bin/env node
// claude-accounts: every Claude Code account on this Mac side by side, plus drift repair.
//
//   claude-accounts [status]      one row per account: login, plan, MCP servers, last measured load
//   claude-accounts diff          what differs between accounts and how sync would fix it
//   claude-accounts sync [--dry-run]
//                                 give every account the same user-scope MCP servers and shared links
//   claude-accounts probe         measure startup context per account (local /context, no model call)
//   claude-accounts mcp add|add-json|remove ...
//                                 run one `claude mcp` command on every account
//
// The account list lives in ~/.agents/nebi/accounts.json (private: emails and org ids stay out of
// this public repo); ~/.local/bin/claude-profile reads the same file for its wrong-account guard.
// Shared pieces: settings.json, plugins, skills, hooks, rules and the rest of SHARED are symlinks to
// ~/.claude, so they are identical by construction. MCP servers are the exception, because each
// account keeps them in its own .claude.json; sync mirrors the union of user-scope servers into every
// account through `claude mcp add-json`, never by editing a live .claude.json. Logins, tokens and
// per-project state are never copied. Stdlib only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const HOME = os.homedir()
const REGISTRY = path.join(HOME, '.agents/nebi/accounts.json')
const PROBES = path.join(HOME, '.agents/nebi/accounts-probe.json')
const PROBE_CWD = path.join(HOME, '.agents/nebi/probe')
const MAIN = path.join(HOME, '.claude')
// What every extra profile links to ~/.claude, so one install reaches every account.
const SHARED = ['CLAUDE.md', 'agents', 'commands', 'file-history', 'handoffs', 'history.jsonl',
  'hooks', 'mcp-servers', 'nebi', 'output-styles', 'paste-cache', 'plugins', 'projects', 'rules',
  'settings.json', 'settings.local.json', 'shared', 'skills', 'skills-project-packs']

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
// Key order differs between hand-written and CLI-written configs, so compare sorted.
const sorted = (_, value) => (value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)))
  : value)
const same = (x, y) => JSON.stringify(x, sorted) === JSON.stringify(y, sorted)
const die = (message) => { console.error(`claude-accounts: ${message}`); process.exit(2) }

function loadAccounts () {
  const registry = readJson(REGISTRY)
  if (!registry?.accounts) die(`cannot read ${REGISTRY}`)
  return Object.entries(registry.accounts).map(([id, entry]) => {
    const dir = entry.configDir ? entry.configDir.replace(/^~(?=\/|$)/, HOME) : null
    const env = { ...process.env }
    delete env.CLAUDE_CONFIG_DIR
    delete env.CLAUDE_CODE_PROJECT_DIR_NAME
    if (dir) env.CLAUDE_CONFIG_DIR = dir
    const configFile = dir ? path.join(dir, '.claude.json') : path.join(HOME, '.claude.json')
    return { id, ...entry, dir: dir ?? MAIN, configFile, env, skip: new Set(entry.mcpSkip ?? []) }
  })
}

const config = (account) => readJson(account.configFile) ?? {}
const userServers = (account) => config(account).mcpServers ?? {}

function loginCheck (account) {
  const login = config(account).oauthAccount ?? {}
  if (!login.emailAddress) return { ok: false, text: 'not signed in' }
  const text = `${login.emailAddress} · ${login.organizationName}`
  if (!account.email) return { ok: false, text: `${text} (unconfirmed)` }
  const ok = login.emailAddress === account.email && login.organizationUuid === account.orgId
  return { ok, text: ok ? text : `WRONG: ${text}, expected ${account.email} · ${account.org}` }
}

function linkDrift (account) {
  if (account.dir === MAIN) return []
  return SHARED.flatMap((name) => {
    const at = path.join(account.dir, name)
    const want = path.join(MAIN, name)
    let stat
    try { stat = fs.lstatSync(at) } catch { return [{ name, at, want, problem: 'missing', fixable: true }] }
    if (!stat.isSymbolicLink()) return [{ name, at, want, problem: 'own copy, not shared', fixable: false }]
    const target = path.resolve(account.dir, fs.readlinkSync(at))
    return target === want ? [] : [{ name, at, want, problem: `points to ${target}`, fixable: false }]
  })
}

// The union of user-scope MCP servers across accounts. A name defined differently on two
// accounts is a conflict: sync leaves it alone and diff shows it.
function serverPlan (accounts) {
  const union = new Map()
  const conflicts = new Set()
  for (const account of accounts) {
    for (const [name, server] of Object.entries(userServers(account))) {
      if (!union.has(name)) union.set(name, { server, from: account.id })
      else if (!same(union.get(name).server, server)) conflicts.add(name)
    }
  }
  const missing = accounts.map((account) => {
    const own = userServers(account)
    const names = [...union.keys()].filter((name) => !(name in own) && !account.skip.has(name) && !conflicts.has(name))
    return { account, names }
  })
  return { union, conflicts, missing }
}

function projectDrift (accounts) {
  const byProject = new Map()
  for (const account of accounts) {
    for (const [project, state] of Object.entries(config(account).projects ?? {})) {
      for (const name of Object.keys(state.mcpServers ?? {})) {
        const key = `${project}\u0000${name}`
        if (!byProject.has(key)) byProject.set(key, new Set())
        byProject.get(key).add(account.id)
      }
    }
  }
  const ids = accounts.map((account) => account.id)
  return [...byProject].filter(([, has]) => has.size < ids.length).map(([key, has]) => {
    const [project, name] = key.split('\u0000')
    return { project: project.replace(HOME, '~') || '/', name, on: [...has], off: ids.filter((id) => !has.has(id)) }
  })
}

function claudeVersion () {
  try { return execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim().split(' ')[0] } catch { return '?' }
}

function sharedSettings () {
  const settings = readJson(path.join(MAIN, 'settings.json')) ?? {}
  const plugins = Object.values(settings.enabledPlugins ?? {})
  return {
    model: settings.model ?? '(default)',
    channel: settings.autoUpdatesChannel ?? 'latest',
    pluginsOn: plugins.filter(Boolean).length,
    pluginsOff: plugins.filter((on) => !on).length,
    denied: (settings.deniedMcpServers ?? []).map((entry) => entry.serverName ?? entry.serverUrl ?? JSON.stringify(entry.serverCommand))
  }
}

function status () {
  const accounts = loadAccounts()
  const shared = sharedSettings()
  const probes = readJson(PROBES) ?? {}
  const plan = serverPlan(accounts)
  console.log(`Claude Code ${claudeVersion()} (one binary for every account) · channel ${shared.channel} · model ${shared.model}`)
  console.log(`Shared by every account: ${shared.pluginsOn} plugins on (${shared.pluginsOff} off) · ${plan.union.size} user MCP servers in the union · ${shared.denied.length} servers denied`)
  const rows = [['', 'launcher', 'login', 'plan', 'user MCP', 'drift', 'startup ctx', 'MCP tools', 'connectors', 'probed']]
  for (const account of accounts) {
    const login = loginCheck(account)
    const drift = linkDrift(account).length + (plan.missing.find((entry) => entry.account === account)?.names.length ?? 0)
    const probe = probes[account.id]
    rows.push([account.id, account.launcher, `${login.ok ? 'ok' : '!!'} ${login.text}`, account.plan ?? '',
      String(Object.keys(userServers(account)).length), drift ? `${drift} (diff)` : 'none',
      probe?.total ?? '-', probe ? `${probe.mcpTools} / ${probe.servers}` : '-',
      probe ? String(probe.connectors.length) : '-', probe?.at?.slice(0, 16).replace('T', ' ') ?? 'never'])
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)))
  for (const row of rows) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd())
  if (plan.conflicts.size) console.log(`Conflicts (same name, different config): ${[...plan.conflicts].join(', ')}`)
  console.log('MCP tools = tools / servers loaded at startup, from `claude-accounts probe`.')
}

function diff () {
  const accounts = loadAccounts()
  const plan = serverPlan(accounts)
  let issues = 0
  for (const account of accounts) {
    const lines = []
    const login = loginCheck(account)
    if (!login.ok) lines.push(`login: ${login.text}`)
    for (const link of linkDrift(account)) lines.push(`link ${link.name}: ${link.problem}${link.fixable ? ' (sync links it)' : ' (fix by hand)'}`)
    for (const name of plan.missing.find((entry) => entry.account === account).names) {
      lines.push(`MCP ${name}: missing at user scope (sync copies it from ${plan.union.get(name).from})`)
    }
    issues += lines.length
    console.log(`${account.id} ${account.launcher}: ${lines.length ? '' : 'no drift'}`)
    for (const line of lines) console.log(`  - ${line}`)
  }
  for (const name of plan.conflicts) { issues++; console.log(`conflict: user MCP "${name}" differs between accounts; pick one and run claude-accounts mcp add-json`) }
  const projects = projectDrift(accounts)
  if (projects.length) {
    console.log('Project-scope MCP servers on some accounts only (informational; add with `claude-accounts mcp add -s local ...` from the project folder to give them to all):')
    for (const entry of projects) console.log(`  ${entry.project}: ${entry.name} on ${entry.on.join(',')}, not on ${entry.off.join(',')}`)
  }
  return issues
}

function sync (dryRun) {
  const accounts = loadAccounts()
  const plan = serverPlan(accounts)
  let failures = 0
  for (const account of accounts) {
    for (const link of linkDrift(account).filter((entry) => entry.fixable)) {
      console.log(`${account.id}: link ${link.at} -> ${link.want}${dryRun ? ' (dry run)' : ''}`)
      if (!dryRun) fs.symlinkSync(link.want, link.at)
    }
    for (const name of plan.missing.find((entry) => entry.account === account).names) {
      console.log(`${account.id}: add user MCP ${name} (from ${plan.union.get(name).from})${dryRun ? ' (dry run)' : ''}`)
      if (dryRun) continue
      // The JSON is an argument, not stdin: Claude Code refuses stdin JSON inside a session
      // because its permission prompt could not show the server.
      const result = spawnSync('claude', ['mcp', 'add-json', '-s', 'user', name, JSON.stringify(plan.union.get(name).server)], {
        env: account.env, encoding: 'utf8'
      })
      if (result.status !== 0) { failures++; console.log(`  failed: ${(result.stderr || result.stdout).trim().split('\n')[0]}`) }
    }
  }
  for (const name of plan.conflicts) console.log(`left alone (conflict): ${name}`)
  if (!dryRun) console.log(failures ? `${failures} step(s) failed` : 'in sync')
  return failures
}

// Startup context per account through its own launcher. /context is a local command:
// it reports cost 0 and no model turn, so this does not spend plan usage.
function probe () {
  const accounts = loadAccounts()
  const probes = readJson(PROBES) ?? {}
  fs.mkdirSync(PROBE_CWD, { recursive: true })
  for (const account of accounts) {
    const result = spawnSync(account.launcher, ['-p', '/context', '--output-format', 'json'], {
      cwd: PROBE_CWD,
      encoding: 'utf8',
      timeout: 180000,
      env: { ...process.env, NEBI_FEEDBACK_CAPTURE: 'off', MCP_CONNECTION_NONBLOCKING: '0', MCP_CONNECT_TIMEOUT_MS: '20000' }
    })
    const report = (() => { try { return JSON.parse(result.stdout) } catch { return null } })()
    if (!report?.result) { console.log(`${account.id}: probe failed (${(result.stderr || 'no output').trim().split('\n')[0]})`); continue }
    const text = String(report.result)
    const servers = {}
    for (const match of text.matchAll(/^\| mcp__\S+ \| (\S+) \| \d+ \|$/gm)) servers[match[1]] = (servers[match[1]] ?? 0) + 1
    const category = (label) => text.match(new RegExp(`^\\| ${label} \\| ([\\d.]+k?) \\|`, 'm'))?.[1] ?? '?'
    probes[account.id] = {
      at: new Date().toISOString(),
      cost: report.total_cost_usd,
      total: text.match(/\*\*Tokens:\*\* ([\d.]+k?)/)?.[1] ?? '?',
      serverInstructions: category('MCP server instructions'),
      mcpTools: Object.values(servers).reduce((sum, count) => sum + count, 0),
      servers: Object.keys(servers).length,
      connectors: Object.keys(servers).filter((name) => name.startsWith('claude_ai_')),
      byServer: servers
    }
    const entry = probes[account.id]
    console.log(`${account.id}: ${entry.total} tokens at start · ${entry.mcpTools} MCP tools from ${entry.servers} servers · instructions ${entry.serverInstructions} · cost ${entry.cost}`)
  }
  fs.writeFileSync(PROBES, JSON.stringify(probes, null, 2) + '\n')
}

function mcpEverywhere (args) {
  const verb = args[0]
  if (!['add', 'add-json', 'remove'].includes(verb)) die('mcp supports add, add-json and remove; use claude-<account> mcp ... for login, list and get')
  // The server name is the first positional argument; option values are not names.
  const valued = new Set(['-s', '--scope', '-t', '--transport', '-e', '--env', '-H', '--header', '--client-id', '--callback-port'])
  const name = args.slice(1).find((arg, index, list) => !arg.startsWith('-') && !valued.has(list[index - 1]))
  const input = args.includes('-') ? fs.readFileSync(0, 'utf8') : undefined
  let failures = 0
  for (const account of loadAccounts()) {
    if (verb !== 'remove' && account.skip.has(name)) { console.log(`${account.id}: skipped (mcpSkip)`); continue }
    const result = spawnSync('claude', ['mcp', ...args], { env: account.env, input, encoding: 'utf8' })
    const output = (result.stdout + result.stderr).trim().split('\n')[0]
    if (result.status !== 0) failures++
    console.log(`${account.id} ${account.launcher}: ${result.status === 0 ? 'ok' : 'failed'} ${output}`)
  }
  return failures
}

const [command = 'status', ...rest] = process.argv.slice(2)
const commands = {
  status: () => { status(); return 0 },
  diff: () => (diff() ? 1 : 0),
  sync: () => (sync(rest.includes('--dry-run')) ? 1 : 0),
  probe: () => { probe(); return 0 },
  mcp: () => (mcpEverywhere(rest) ? 1 : 0)
}
if (!commands[command]) die('usage: claude-accounts [status|diff|sync [--dry-run]|probe|mcp add|add-json|remove ...]')
process.exit(commands[command]())
