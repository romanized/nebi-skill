#!/usr/bin/env node
// skill-usage.mjs — which skills load in real work, for Claude Code and Codex.
// The steer-channel PreToolUse hook calls recordSkillUse() on every tool call;
// it appends one line to ~/.agents/nebi/skill-usage.jsonl when a skill loads.
// Claude loads a skill through the Skill tool. Codex has no such tool: it reads
// the SKILL.md with a shell command, so only plain reads (cat, sed -n, head, nl,
// less, bat, flags allowed) of an installed SKILL.md count: one under a .agents, .claude or
// .codex skills or plugins folder. Searches that merely mention one, and reads
// of a repo master being edited (claude-home/skills/...), are not loads.
// Run directly for the report: `node skill-usage.mjs [--days N]`. It counts each skill once
// per session, the unit the 2026-09-24 baseline ledger uses; entries logged before
// the session field existed count once each.
// Set NEBI_SKILL_USAGE=off for probes. Fail-safe: never blocks a tool.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const installedHome = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = path.basename(installedHome) === '.codex' ? 'codex' : 'claude';
export const USAGE_LOG = path.join(homedir(), '.agents', 'nebi', 'skill-usage.jsonl');

const SHELL_TOOLS = new Set(['Bash', 'shell', 'exec_command', 'local_shell']);
const READ_SKILL = /(?:^|[\s;&|(])(?:sed\s+-n\s+\S+|(?:cat|head|nl|less|bat)(?:\s+-\S+(?:\s+\d+)?)*)\s+['"]?([^'"\s;|&]*\/([^/\s'"]+)\/SKILL\.md)/;
const INSTALLED_ROOT = /(?:^|\/)\.(?:agents|claude|codex)\/(?:skills|plugins)\//;

/** The skill a tool call loads, or null. */
export function skillFrom(input) {
  const tool = input?.tool_name;
  const args = input?.tool_input ?? {};
  if (tool === 'Skill' && typeof args.skill === 'string' && args.skill.trim()) return args.skill.trim();
  if (SHELL_TOOLS.has(tool)) {
    const command = Array.isArray(args.command) ? args.command.join(' ') : args.command ?? args.cmd;
    const match = typeof command === 'string' ? command.match(READ_SKILL) : null;
    if (match && INSTALLED_ROOT.test(match[1])) return match[2];
  }
  return null;
}

export function recordSkillUse(input) {
  if (process.env.NEBI_SKILL_USAGE === 'off') return;
  const skill = skillFrom(input);
  if (!skill) return;
  mkdirSync(path.dirname(USAGE_LOG), { recursive: true });
  const entry = { ts: new Date().toISOString(), harness: HARNESS, skill, session: input.session_id ?? null, cwd: input.cwd ?? null };
  appendFileSync(USAGE_LOG, `${JSON.stringify(entry)}\n`);
}

/** Installed skill names from the two personal skill roots. */
function installedSkills() {
  const names = new Set();
  for (const root of [path.join(homedir(), '.claude', 'skills'), path.join(homedir(), '.agents', 'skills')]) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if ((entry.isDirectory() || entry.isSymbolicLink()) && existsSync(path.join(root, entry.name, 'SKILL.md'))) names.add(entry.name);
    }
  }
  return names;
}

export function report(days = 30, now = Date.now()) {
  const since = now - days * 86400000;
  const counts = new Map();
  if (existsSync(USAGE_LOG)) {
    for (const line of readFileSync(USAGE_LOG, 'utf8').split('\n')) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (!e?.skill || Date.parse(e.ts) < since) continue;
      const name = e.skill.includes(':') ? e.skill.split(':').pop() : e.skill;
      const row = counts.get(name) ?? { claude: new Set(), codex: new Set(), last: e.ts };
      row[e.harness === 'codex' ? 'codex' : 'claude'].add(e.session ?? `${e.ts}#${line.length}`);
      if (e.ts > row.last) row.last = e.ts;
      counts.set(name, row);
    }
  }
  const used = [...counts].map(([name, r]) => [name, { claude: r.claude.size, codex: r.codex.size, last: r.last }])
    .sort((a, b) => (b[1].claude + b[1].codex) - (a[1].claude + a[1].codex));
  const never = [...installedSkills()].filter((name) => !counts.has(name)).sort();
  return { days, used, never };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--days');
  const days = i > 0 ? Number(process.argv[i + 1]) || 30 : 30;
  const { used, never } = report(days);
  console.log(`Sessions that loaded each skill, last ${days} days (${USAGE_LOG})`);
  if (!used.length) console.log('  none recorded yet');
  for (const [name, r] of used) console.log(`  ${String(r.claude + r.codex).padStart(4)}  ${name}  (claude ${r.claude}, codex ${r.codex}, last ${r.last.slice(0, 10)})`);
  console.log(`\nInstalled but never loaded in this window (${never.length}):`);
  console.log(never.length ? `  ${never.join(', ')}` : '  none');
}
