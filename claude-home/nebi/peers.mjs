#!/usr/bin/env node
// peers: every live Claude Code session on this Mac, across all config folders
// (~/.claude is account a, ~/.claude-max2 b, ~/.claude-team c, ~/.claude-team2 d), with the address
// SendMessage takes. ListAgents only sees sessions in the caller's own folder;
// SendMessage({ to: "uds:<socket>" }) reaches any of them.
//
// Usage: node ~/.claude/nebi/peers.mjs [--json]
// A record counts as live when its pid answers and its socket file exists, so a
// stale record whose pid was reused by another program can still slip through.
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

const ACCOUNTS = { '.claude': 'a', '.claude-max2': 'b', '.claude-team': 'c', '.claude-team2': 'd' }

const isAlive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

const seen = new Set()
const peers = []
for (const folder of readdirSync(homedir()).filter(name => name.startsWith('.claude'))) {
  const dir = join(homedir(), folder, 'sessions')
  if (!existsSync(dir)) continue
  const real = realpathSync(dir)
  if (seen.has(real)) continue
  seen.add(real)
  for (const file of readdirSync(dir).filter(name => name.endsWith('.json'))) {
    let record
    try {
      record = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch {
      continue
    }
    const socket = record.messagingSocketPath
    if (!record.pid || !socket || !existsSync(socket) || !isAlive(record.pid)) continue
    peers.push({
      account: ACCOUNTS[folder] ?? folder,
      name: record.name ?? '',
      status: record.status ?? '',
      project: basename(record.cwd ?? ''),
      address: `uds:${socket}`,
      isYou: socket === process.env.CLAUDE_CODE_MESSAGING_SOCKET,
    })
  }
}
peers.sort((x, y) => x.account.localeCompare(y.account) || x.name.localeCompare(y.name))

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(peers, null, 2)}\n`)
} else if (peers.length === 0) {
  process.stdout.write('No live Claude sessions found.\n')
} else {
  for (const p of peers) {
    process.stdout.write(`${p.account}  ${p.name.padEnd(24)} ${p.status.padEnd(8)} ${p.project.padEnd(20)} ${p.address}${p.isYou ? '  (you)' : ''}\n`)
  }
}
