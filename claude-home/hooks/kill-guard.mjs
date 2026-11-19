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
// The command is read by one small shell scanner: quoted text, comments and
// heredoc bodies are data, so a pkill named in a message or prompt is no call;
// $( … ) and backticks run, quoted or not, and so do `sh -c` and `eval` strings;
// redirections such as 2>&1 are not patterns; \pkill and /usr/bin/pkill are pkill.
// Fail-safe: any error → exit 0, never blocks a tool.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// pkill/pgrep options that take a value (macOS BSD).
const ARG_FLAGS = new Set(['F', 'G', 'M', 'N', 'P', 'U', 'c', 'g', 'j', 't', 'u']);
const SHARED_NAMES = /^(claude|node|bun|npm|npx|python3?|zsh|bash|sh|chrome|google chrome|google chrome helper|ghostty|codex|chatgpt)$/i;
// Words before the real command that leave it the command: `sudo pkill`, `command pkill`.
const PREFIXES = new Set(['sudo', 'command', 'exec', 'env', 'nohup', 'time', 'then', 'do', 'else', '!']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const MAX_DEPTH = 4;

/**
 * The simple commands in a shell command, each a word list with quotes and escapes
 * removed and redirections dropped. What runs inside $( … ), backticks and <( … ) comes
 * back as commands of its own, and so does a heredoc body fed to a shell; a command
 * whose words held $( … ) or backticks has `hasSubstitution` set. `closer` ends a
 * substitution; `isMath` reads $(( … )), where `<<` and `>` are operators, not redirections.
 */
function scan(text, start = 0, closer = '', isMath = false) {
  const cmds = [];
  const heredocs = []; // { end, isIndented, reader } waiting for the next newline
  let words = [];
  let word = '';
  let isWord = false;
  let isTarget = false; // the next word is a redirection's target
  let hasSub = false;
  let parens = 0;
  const endWord = () => {
    if (isWord && !isTarget) words.push(word);
    if (isWord) isTarget = false;
    word = '';
    isWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) cmds.push(Object.assign(words, { hasSubstitution: hasSub }));
    words = [];
    hasSub = false;
  };
  // $( … ) or backticks from `from` (just inside) to `close`: its commands, its text kept in the word.
  const substitute = (at, from, close) => {
    const inner = scan(text, from, close);
    cmds.push(...inner.cmds);
    word += text.slice(at, inner.end + 1);
    isWord = true;
    hasSub = true;
    return inner.end;
  };
  let i = start;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === closer && parens === 0) break;
    if (ch === '\\') {
      if (text[i + 1] !== '\n') { word += text[i + 1] ?? ''; isWord = true; }
      i++;
    } else if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end < 0 ? text.length : end;
      word += text.slice(i + 1, stop);
      isWord = true;
      i = stop;
    } else if (ch === '$' && text[i + 1] === "'") {
      for (i += 2; i < text.length && text[i] !== "'"; i++) word += text[i] === '\\' ? (text[++i] ?? '') : text[i];
      isWord = true;
    } else if (ch === '"') {
      isWord = true;
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\') word += text[++i] ?? '';
        else if (text[i] === '`') i = substitute(i, i + 1, '`');
        else if (text[i] === '$' && text[i + 1] === '(' && text[i + 2] !== '(') i = substitute(i, i + 2, ')');
        else word += text[i];
      }
    } else if (ch === '`') {
      i = substitute(i, i + 1, '`');
    } else if (ch === '$' && text[i + 1] === '(' && text[i + 2] === '(') {
      const inner = scan(text, i + 3, ')', true);
      cmds.push(...inner.cmds);
      word += text.slice(i, inner.end + 2);
      isWord = true;
      i = inner.end + 1;
    } else if ((ch === '$' || ch === '<' || ch === '>') && text[i + 1] === '(') {
      if (ch !== '$') endWord();
      i = substitute(i, i + 2, ')');
    } else if (isMath) {
      if (ch === '(') parens++;
      if (ch === ')') parens--;
      if (/\s/.test(ch)) endWord();
      else { word += ch; isWord = true; }
    } else if (ch === '#' && !isWord) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i++;
    } else if (ch === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      endWord();
      let j = i + 2;
      const isIndented = text[j] === '-';
      if (isIndented) j++;
      while (text[j] === ' ' || text[j] === '\t') j++;
      const tag = /^(['"]?)(\w+)\1/.exec(text.slice(j));
      if (tag) heredocs.push({ end: tag[2], isIndented, reader: words });
      i = tag ? j + tag[0].length - 1 : i + 1;
    } else if (ch === '<' || ch === '>' || (ch === '&' && text[i + 1] === '>')) {
      // A redirection: an fd number right before it is part of it (2>&1), and so is its target.
      if (isWord && /^\d+$/.test(word)) { word = ''; isWord = false; } else endWord();
      let j = i + 1;
      while ('<>&'.includes(text[j] ?? '-') || (text[j] === '|' && text[j - 1] === '>')) j++;
      i = j - 1;
      isTarget = true;
    } else if (ch === '\n') {
      endCommand();
      // Closed heredoc bodies are data, unless a shell reads them; an unclosed one stays script.
      for (const doc of heredocs.splice(0)) {
        for (let from = i + 1; from < text.length;) {
          const nl = text.indexOf('\n', from);
          const stop = nl < 0 ? text.length : nl;
          const line = text.slice(from, stop);
          if ((doc.isIndented ? line.trim() : line) === doc.end) {
            if (SHELLS.has(invocation(doc.reader).name)) cmds.push(...scan(text.slice(i + 1, from)).cmds);
            i = stop;
            break;
          }
          from = stop + 1;
        }
      }
    } else if (ch === '(' || ch === ')') {
      parens = Math.max(0, parens + (ch === '(' ? 1 : -1));
      endCommand();
    } else if (ch === ';' || ch === '&' || ch === '|') {
      endCommand();
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      word += ch;
      isWord = true;
    }
  }
  endCommand();
  return { cmds, end: i };
}

/** The command a word list runs, without its path, and its arguments: `sudo /usr/bin/pkill -f x` is pkill. */
function invocation(words) {
  let i = 0;
  while (i < words.length && (PREFIXES.has(words[i]) || /^[A-Za-z_]\w*=/.test(words[i]))) {
    i++;
    if (words[i - 1] === 'sudo') {
      while ((words[i] ?? '').startsWith('-')) i += ['-u', '-g'].includes(words[i]) ? 2 : 1;
    }
  }
  return { name: baseName(words[i] ?? ''), args: words.slice(i + 1) };
}

const baseName = (word) => word.split('/').pop();

/** The script a shell or eval runs from its arguments (`sh -c '…'`, `eval "…"`), or null. */
function innerScript(name, args) {
  if (name === 'eval') return args.join(' ');
  if (!SHELLS.has(name)) return null;
  const at = args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/.test(a));
  return at < 0 ? null : (args[at + 1] ?? null);
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

/** First dangerous pkill (or pgrep feeding kill) in a shell command, or null. */
export function check(command, depth = 0) {
  const cmds = scan(command).cmds;
  const has = (words, name) => words.some((w) => baseName(w) === name);
  // `kill $(pgrep …)`, kill `pgrep …` and `pgrep … | xargs kill`: pgrep picks what dies.
  const feedsKill = cmds.some((words) => has(words, 'kill') && (words.hasSubstitution || has(words, 'xargs')));
  for (const words of cmds) {
    // Any word counts, so `timeout 5 pkill …` and `env -i pkill …` are read too.
    for (const [at, word] of words.entries()) {
      const name = baseName(word);
      if (name !== 'pkill' && !(name === 'pgrep' && feedsKill)) continue;
      const problem = problemWith(words.slice(at + 1));
      if (problem) return `Blocked ${name}: ${problem}`;
    }
    const { name, args } = invocation(words);
    const inner = depth < MAX_DEPTH ? innerScript(name, args) : null;
    const reason = inner === null ? null : check(inner, depth + 1);
    if (reason) return reason;
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
