#!/usr/bin/env node
// Open a Ghostty tab, window or split for a task, only when Nebi asks for one. Never Terminal.app or iTerm.
//
// Usage: node ~/.claude/nebi/term.mjs [--window | --split right|down|left|up] [--dir <path>] [--dry-run] [-- <command...>]
//   Default: a new tab in the Ghostty window that holds the calling session, else in the front window.
//   (--tab still works and means the same.) --window opens a new window; --split splits the focused terminal of the
//   front window. --dir defaults to the current directory. The command is typed into the new pane's own login shell,
//   so it runs exactly as if the user typed it and the pane stays open as a normal shell when the command ends.
//   --dry-run prints the AppleScript instead of running it; the read-only lookup of the session's window still runs.
//   Example: node ~/.claude/nebi/term.mjs --dir ~/Documents/GitHub/karpet24 -- claude "audit the product pages"
//   Several words after -- are a program and its arguments: each is shell-quoted, so "audit the product pages" stays
//   one argument. A single word after -- is a shell line typed as is: -- "npm test && npm run build". A command
//   holding a line break is refused, because the shell would run what comes before it on its own.
//
// Finding the calling session's window: Ghostty's AppleScript dictionary exposes each terminal's title and working
// directory, not its tty. Claude Code titles its terminal "<spinner> <session name>" when Nebi named the session, and
// <config dir>/sessions/<CLAUDE_PID>.json holds that name and the launch folder (a derived name is not in the title).
// The first of these that matches terminals in exactly one window picks it: name and folder, name, folder. No match,
// or matches in several windows, means the front window.
//
// Gotchas (2026-09-27, Ghostty 1.3.1):
// - `open -na Ghostty.app --args --working-directory=…` ignores the directory on macOS, so this uses Ghostty's
//   AppleScript dictionary (Ghostty 1.3+; disabled if the config sets macos-applescript = false).
// - macOS asks once for Automation permission when another app (for example Terminal.app) first controls Ghostty.
// - A tab or split opens a new window when Ghostty has no window yet.
// - Use `character id 9` for a tab character inside `tell application "Ghostty"`: there `tab` is Ghostty's tab class.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const opts = sep < 0 ? argv : argv.slice(0, sep);
// POSIX single quotes, left off a word that needs none.
const shellQuote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const words = sep < 0 ? [] : argv.slice(sep + 1);
const command = words.length === 1 ? words[0] : words.map(shellQuote).join(' ');
if (/[\r\n]/.test(command)) {
  console.error('The command holds a line break; pass it on one line.');
  process.exit(2);
}
const value = (flag) => { const i = opts.indexOf(flag); return i < 0 ? undefined : opts[i + 1]; };
const home = process.env.HOME ?? os.homedir();
const untilde = (p) => p.replace(/^~(?=$|\/)/, home);

const dir = path.resolve(untilde(value('--dir') ?? process.cwd()));
const split = value('--split');
if (split && !['right', 'down', 'left', 'up'].includes(split)) {
  console.error('--split takes right, down, left or up');
  process.exit(2);
}
const mode = split ? 'split' : opts.includes('--window') ? 'window' : 'tab';
const dryRun = opts.includes('--dry-run');

const str = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const osascript = (lines) => spawnSync('osascript', lines.flatMap((line) => ['-e', line]), { encoding: 'utf8' });

// The Claude session this runs under: the name Nebi gave it (shown in the terminal title) and its launch folder.
function callingSession() {
  const fallback = { name: '', cwd: process.cwd() };
  const pid = process.env.CLAUDE_PID;
  if (!/^\d+$/.test(pid ?? '')) return fallback;
  try {
    const configDir = untilde(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'));
    const s = JSON.parse(fs.readFileSync(path.join(configDir, 'sessions', `${pid}.json`), 'utf8'));
    const named = typeof s.name === 'string' && s.nameSource !== 'derived';
    return { name: named ? s.name : '', cwd: typeof s.cwd === 'string' ? s.cwd : fallback.cwd };
  } catch {
    return fallback;
  }
}

// Every Ghostty terminal as { window, dir, title }, read-only. Empty when Ghostty or its AppleScript is unavailable.
function terminals() {
  const r = osascript([
    'tell application "Ghostty"',
    'set out to ""',
    'repeat with w in windows',
    'set wid to id of w',
    'repeat with t in terminals of w',
    'set d to working directory of t',
    'if d is missing value then set d to ""',
    'set n to name of t',
    'if n is missing value then set n to ""',
    'set out to out & wid & (character id 9) & d & (character id 9) & n & linefeed',
    'end repeat',
    'end repeat',
    'return out',
    'end tell',
  ]);
  if (r.status !== 0) return [];
  return r.stdout.split('\n').filter(Boolean).map((line) => {
    const [window, dir = '', title = ''] = line.split('\t');
    return { window, dir, title };
  });
}

function sessionWindow() {
  const { name, cwd } = callingSession();
  const titled = (t) => Boolean(name) && (t.title === name || t.title.endsWith(` ${name}`));
  const tests = [(t) => t.dir === cwd && titled(t), titled, (t) => t.dir === cwd];
  const all = terminals();
  for (const test of tests) {
    const windows = new Set(all.filter(test).map((t) => t.window));
    if (windows.size === 1) return [...windows][0];
    if (windows.size > 1) return null;
  }
  return null;
}

const target = mode === 'tab' ? sessionWindow() : null;
const open = {
  window: ['new window with configuration c'],
  tab: ['if (count of windows) is 0 then', 'new window with configuration c', 'else', 'set w to front window',
    ...(target ? ['try', `set w to first window whose id is ${str(target)}`, 'end try'] : []),
    'new tab in w with configuration c', 'activate window w', 'end if'],
  split: ['if (count of windows) is 0 then', 'new window with configuration c', 'else',
    `split (focused terminal of selected tab of front window) direction ${split} with configuration c`, 'end if'],
}[mode];
const script = [
  'tell application "Ghostty"',
  'set c to new surface configuration',
  `set initial working directory of c to ${str(dir)}`,
  ...(command ? [`set initial input of c to ${str(command)} & linefeed`] : []),
  ...open,
  'activate',
  'end tell',
];

if (dryRun) {
  console.log(script.join('\n'));
  process.exit(0);
}
const r = osascript(script);
if (r.status !== 0) {
  console.error(`Ghostty did not open a ${mode}: ${(r.stderr || r.error?.message || '').trim()}`);
  process.exit(1);
}
const where = mode === 'tab' ? (target ? " in this session's window" : ' in the front window') : '';
console.log(`Opened a Ghostty ${mode}${where} in ${dir}${command ? ` running: ${command}` : ''}`);
