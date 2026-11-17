#!/usr/bin/env node
// kill-guard.mjs — Claude Code PreToolUse hook (matcher Bash): denies pkill calls
// that would kill far more than the agent meant to.
// Why: on 2026-10-12 two sub-agents killed every other Claude session and all
// Chrome tabs, twice. macOS pkill stops reading options at the first pattern, so
// in `pkill -f "cat" -U $(id -u) -x` and `pkill -f "recv.py" -n -o` the trailing
// "-U", "-x", "-n", "-o" became extra -f patterns ("cat" also hits "Applications").
// pkill skips its own ancestors, so the session that fired it survived.
// Rules, applied to pkill and to a pgrep whose output feeds kill:
//   1. no option after the first pattern (put options first, or use `--`);
//   2. without -x, a pattern must be 5+ characters and not a bare shared name
//      such as node, claude, chrome or ghostty.
// Fail-safe: any error → exit 0, never blocks a tool.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// pkill/pgrep options that take a value (macOS BSD).
const ARG_FLAGS = new Set(['F', 'G', 'M', 'N', 'P', 'U', 'c', 'g', 'j', 't', 'u']);
const SHARED_NAMES = /^(claude|node|bun|npm|npx|python3?|zsh|bash|sh|chrome|google chrome|google chrome helper|ghostty|codex|chatgpt)$/i;
const SEPARATORS = new Set([';', '&', '|', '\n', ')', '`']);

/** Text after `start` up to the next unquoted shell separator. */
function segmentFrom(command, start) {
  let quote = null;
  let depth = 0; // inside $( … )
  let i = start;
  for (; i < command.length; i++) {
    const ch = command[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '$' && command[i + 1] === '(') { depth++; i++; continue; }
    if (ch === ')' && depth > 0) { depth--; continue; }
    if (depth === 0 && SEPARATORS.has(ch)) break;
  }
  return command.slice(start, i);
}

/** Whitespace split that keeps quoted text and $( … ) together and drops the quotes. */
function tokenize(text) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let depth = 0;
  let has = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (ch === '$' && text[i + 1] === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    if (depth === 0 && /\s/.test(ch)) { if (has || cur) tokens.push(cur); cur = ''; has = false; continue; }
    cur += ch;
    has = true;
  }
  if (has || cur) tokens.push(cur);
  return tokens;
}

/** Why this pkill/pgrep argument list is dangerous, or null when it is fine. */
export function problemWith(args) {
  const flags = new Set();
  let i = 0;
  let afterDashDash = false;
  for (; i < args.length; i++) {
    const t = args[i];
    if (t === '--') { afterDashDash = true; i++; break; }
    if (!t.startsWith('-') || t === '-') break;
    if (i === 0 && /^-([0-9]+|[A-Z]{2,}[0-9]*)$/.test(t)) continue; // signal: -9, -TERM, -USR1
    const letters = t.slice(1);
    const at = [...letters].findIndex((c) => ARG_FLAGS.has(c));
    for (const c of at < 0 ? letters : letters.slice(0, at + 1)) flags.add(c);
    if (at === letters.length - 1) i++; // value is the next token
  }
  const patterns = args.slice(i);
  if (patterns.length === 0) return null;
  if (!afterDashDash) {
    const late = patterns.slice(1).find((t) => t.startsWith('-') && t !== '-');
    if (late) {
      return `"${late}" comes after the pattern "${patterns[0]}". macOS pkill stops reading options at the first pattern, so "${late}" becomes another pattern that matches almost every process (this killed every Claude session and all Chrome tabs twice on 2026-10-12). Put all options before the pattern, or better, kill the exact PID.`;
    }
  }
  if (!flags.has('x')) {
    const broad = patterns.find((p) => p.replace(/[\^$]/g, '').length < 5 || SHARED_NAMES.test(p.replace(/[\^$]/g, '')));
    if (broad !== undefined) {
      return `pattern "${broad}" is too broad: pkill matches it as a substring${flags.has('f') ? ' of every full command line' : ' of every process name'}, so it also hits other Claude sessions, their MCP servers and Chrome (e.g. "cat" matches "Applications"). Kill the exact PID you started, or use a long, specific pattern such as the script's full path.`;
    }
  }
  return null;
}

/** The command with heredoc bodies and quoted text blanked to spaces (same length), so a pkill
 *  named inside a message or prompt is not taken for a call. A double-quoted $( … ) still runs, so it stays. */
function maskQuoted(command) {
  const blank = (q) => q[0] + ' '.repeat(q.length - 2) + q[0];
  return command
    .replace(/(<<-?\s*(['"]?)(\w+)\2[^\n]*\n)([\s\S]*?)(\n\s*\3(?=\n|$))/g, (_, head, _q, _tag, body, tail) => head + body.replace(/[^\n]/g, ' ') + tail)
    .replace(/'[^']*'/g, blank)
    .replace(/"(?:[^"\\]|\\.)*"/g, (q) => (q.includes('$(') ? q : blank(q)));
}

/** First dangerous pkill (or pgrep feeding kill) in a shell command, or null. */
export function check(command) {
  const code = maskQuoted(command);
  const feedsKill = /\b(xargs\s+(-\S+\s+)*kill|kill\s+(-\S+\s+)*["']?\$\(\s*pgrep)\b/.test(code);
  const re = feedsKill ? /(^|[\s;&|(`"])(sudo\s+)?(pkill|pgrep)(?=\s)/g : /(^|[\s;&|(`"])(sudo\s+)?(pkill)(?=\s)/g;
  for (const m of code.matchAll(re)) {
    const args = tokenize(segmentFrom(command, m.index + m[0].length));
    const problem = problemWith(args);
    if (problem) return `Blocked ${m[3]}: ${problem}`;
  }
  return null;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  if (input?.tool_name !== 'Bash') return;
  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !/\bp(kill|grep)\b/.test(command)) return;
  const reason = check(command);
  if (!reason) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch { /* fail-safe */ }
  process.exit(0);
}
