#!/usr/bin/env node
// Keep ~/Documents/GitHub tidy: every git worktree lives at <root>/.worktrees/<repo>/<lane>, and a worktree whose
// work is safe elsewhere is removed.
//
// Usage: node ~/.claude/nebi/worktrees.mjs [list | tidy] [--apply] [--skip <repo>[,<repo>]] [--root <dir>] [--json]
//   list (default) prints every linked worktree of every repo under the root with the planned action.
//   tidy prints the same plan; with --apply it carries it out. Without --apply nothing changes.
//   --skip leaves whole repos alone (a repo whose sessions are mid-work). --root defaults to ~/Documents/GitHub
//   (or NEBI_GITHUB_ROOT).
//
// Actions, first match wins:
//   keep    the worktree sits outside the root (another session's scratchpad), is locked, holds another worktree,
//           a Claude process has a folder in it open, Railway links it or a folder in it (~/.railway/config.json),
//           a file or its git index changed in the last 2 hours, or the repo is skipped.
//   remove  clean and merged into the default branch; or clean, every commit on a remote, and the last commit older
//           than 7 days. `git worktree remove` keeps the branch, so committed work stays recoverable with
//           `git worktree add <path> <branch>`.
//   move    anything else outside <root>/.worktrees/<repo>/, moved there with `git worktree move` (keeps everything).
//   ok      already in place. <repo>/.claude/worktrees/ (the harness's own spot) counts as in place: never moved,
//           but removed like any other once safe, because the harness leaves many behind.
// A removal is downgraded to a move when the worktree holds ignored files that are not caches or dependencies
// (an .env copy, local data, renders), because `git worktree remove` deletes ignored files without asking.
//
// Gotchas:
// - Sub-agents cd inside one Claude process, so an open-folder check misses them; the 2-hour mtime check covers that.
// - `git worktree remove` refuses a dirty worktree and `move` refuses one with submodules; both are reported, never forced.
// - `git worktree remove` deletes ignored folders, nested worktrees included, so an ignored `.claude/` is never a cache,
//   a worktree holding another is kept, and --apply runs every move before any removal.
// - Empty <repo>.wt folders left behind after moves are deleted (rmdir only, so a non-empty one stays).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_PATTERNS = [
  /(^|\/)node_modules(\/|$)/, /(^|\/)\.next(\/|$)/, /(^|\/)dist(\/|$)/, /(^|\/)build(\/|$)/, /(^|\/)out(\/|$)/,
  /(^|\/)\.turbo(\/|$)/, /(^|\/)\.cache(\/|$)/, /(^|\/)\.wrangler(\/|$)/, /(^|\/)\.vercel(\/|$)/,
  /(^|\/)\.svelte-kit(\/|$)/, /(^|\/)\.astro(\/|$)/, /(^|\/)coverage(\/|$)/, /(^|\/)__pycache__(\/|$)/,
  /(^|\/)\.venv(\/|$)/, /(^|\/)test-results(\/|$)/, /(^|\/)playwright-report(\/|$)/, /(^|\/)\.DS_Store$/,
  /\.tsbuildinfo$/, /(^|\/)tsconfig\.json$/, /(^|\/)\.eslintcache$/,
  /(^|\/)\.vite-cache(\/|$)/, /(^|\/)\.react-router(\/|$)/, /(^|\/)\.shopify(\/|$)/, /(^|\/)\.lighthouse(\/|$)/,
  /(^|\/)next-env\.d\.ts$/, /(^|\/)sourcemap\.json$/, /^Packages\/$/, /(^|\/)\.tmp-solve(\/|$)/,
];
const RECENT_MS = 2 * 60 * 60 * 1000;
const STALE_DAYS = 7;

function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Pure decision for one worktree. Every input is a plain value so tests need no git. */
export function planAction(wt, { root, skip = new Set() }) {
  const home = path.join(root, '.worktrees', wt.repo);
  const target = path.join(home, wt.lane);
  if (skip.has(wt.repo)) return { action: 'keep', reason: 'repo skipped' };
  if (!wt.path.startsWith(root + path.sep)) return { action: 'keep', reason: 'outside the GitHub folder (another session may own it)' };
  if (wt.locked) return { action: 'keep', reason: 'locked' };
  if (wt.nests) return { action: 'keep', reason: 'holds another worktree' };
  if (wt.open) return { action: 'keep', reason: 'a Claude session has it open' };
  if (wt.railway) return { action: 'keep', reason: 'Railway links this path' };
  if (wt.recent) return { action: 'keep', reason: 'changed in the last 2 hours' };
  const clean = wt.dirty === 0;
  const safe = clean && (wt.merged || (wt.unpushed === 0 && wt.ageDays > STALE_DAYS));
  // Claude Code parks its own worktrees in <repo>/.claude/worktrees/ and cleans them itself; leave them there.
  const inPlace = path.dirname(wt.path) === home || path.dirname(wt.path) === path.join(wt.main, '.claude', 'worktrees');
  if (safe && wt.keepers.length === 0) {
    return { action: 'remove', reason: wt.merged ? 'merged and clean' : `clean, pushed, idle ${wt.ageDays}d` };
  }
  if (inPlace) return { action: 'ok', reason: safe ? `holds ignored files: ${wt.keepers.slice(0, 3).join(', ')}` : 'in place' };
  const why = safe
    ? `holds ignored files: ${wt.keepers.slice(0, 3).join(', ')}`
    : [!clean && `${wt.dirty} uncommitted`, wt.unpushed > 0 && `${wt.unpushed} unpushed`, !wt.merged && 'unmerged']
        .filter(Boolean).join(', ');
  return { action: 'move', reason: why, target };
}

/** The lane name inside .worktrees/<repo>/: drop the repo prefix and the old .wt parent from the folder name. */
export function laneName(repo, wtPath) {
  const base = path.basename(wtPath);
  for (const prefix of [`${repo}-wt-`, `${repo}-`]) {
    if (base.startsWith(prefix) && base.length > prefix.length) return base.slice(prefix.length);
  }
  return base;
}

function openFolders() {
  const out = new Set();
  let pids = '';
  try {
    pids = execFileSync('pgrep', ['-f', 'claude'], { encoding: 'utf8' }).trim();
  } catch {
    return out;
  }
  for (const pid of pids.split('\n').filter(Boolean)) {
    try {
      const cwd = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\n').find((l) => l.startsWith('n'));
      if (cwd) out.add(real(cwd.slice(1)));
    } catch {}
  }
  return out;
}

function railwayPaths() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.railway', 'config.json'), 'utf8'));
    return new Set(Object.keys(cfg.projects || {}));
  } catch {
    return new Set();
  }
}

function recentlyChanged(dir) {
  const cutoff = Date.now() - RECENT_MS;
  const stack = [{ dir, depth: 0 }];
  while (stack.length) {
    const { dir: d, depth } = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      try { if (fs.lstatSync(p).mtimeMs > cutoff) return true; } catch {}
      if (e.isDirectory() && depth < 3) stack.push({ dir: p, depth: depth + 1 });
    }
  }
  return false;
}

function defaultBranch(dir) {
  const head = git(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head) return head;
  for (const b of ['origin/main', 'origin/master', 'main', 'master']) if (git(dir, ['rev-parse', '--verify', '-q', b])) return b;
  return null;
}

const under = (p, dir) => p === dir || p.startsWith(dir + path.sep);
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

function indexChanged(wtPath) {
  const gitDir = git(wtPath, ['rev-parse', '--absolute-git-dir']);
  try { return gitDir ? fs.statSync(path.join(gitDir, 'index')).mtimeMs > Date.now() - RECENT_MS : false; } catch { return false; }
}

function inspect(repo, mainPath, wtPath, branch, locked, ctx) {
  const status = git(wtPath, ['status', '--porcelain', '--ignored']) ?? '';
  const lines = status.split('\n').filter(Boolean);
  const dirty = lines.filter((l) => !l.startsWith('!!')).length;
  const keepers = lines.filter((l) => l.startsWith('!!')).map((l) => l.slice(3)).filter((p) => !CACHE_PATTERNS.some((re) => re.test(p)));
  const unpushed = Number(git(wtPath, ['rev-list', '--count', 'HEAD', '--not', '--remotes']) ?? 0);
  const def = defaultBranch(mainPath);
  const merged = def ? git(wtPath, ['merge-base', '--is-ancestor', 'HEAD', def]) !== null : false;
  const last = Number(git(wtPath, ['log', '-1', '--format=%ct']) ?? 0);
  return {
    repo, main: mainPath, path: wtPath, branch, lane: laneName(repo, wtPath), dirty, unpushed, merged, keepers,
    ageDays: last ? Math.floor((Date.now() / 1000 - last) / 86400) : 0,
    locked,
    open: [...ctx.open].some((c) => under(c, real(wtPath))),
    railway: [...ctx.railway].some((k) => under(path.resolve(k), wtPath) || under(path.resolve(k), real(wtPath))),
    recent: recentlyChanged(wtPath) || indexChanged(wtPath),
  };
}

/** Flag every worktree that has another worktree inside it: removing it would delete the inner one. */
export function markNested(rows) {
  return rows.map((r) => ({ ...r, nests: rows.some((o) => o.path !== r.path && under(o.path, r.path)) }));
}

export function discover(root) {
  const ctx = { open: openFolders(), railway: railwayPaths() };
  const found = [];
  for (const name of fs.readdirSync(root).sort()) {
    const mainPath = path.join(root, name);
    let isMain = false;
    try { isMain = fs.statSync(path.join(mainPath, '.git')).isDirectory(); } catch {}
    if (!isMain) continue;
    const porcelain = git(mainPath, ['worktree', 'list', '--porcelain']) ?? '';
    for (const block of porcelain.split('\n\n')) {
      const raw = block.match(/^worktree (.+)$/m)?.[1];
      // git prints forward slashes on Windows too; resolve so every comparison uses one spelling.
      const wtPath = raw && path.resolve(raw);
      if (!wtPath || wtPath === path.resolve(mainPath) || /^prunable/m.test(block)) continue;
      const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? '(detached)';
      found.push(inspect(name, mainPath, wtPath, branch, /^locked/m.test(block), ctx));
    }
  }
  return markNested(found);
}

function apply(root, rows) {
  const results = [];
  const ordered = [...rows.filter((r) => r.action === 'move'), ...rows.filter((r) => r.action === 'remove')];
  for (const r of ordered) {
    const mainPath = path.join(root, r.repo);
    try {
      if (r.action === 'remove') {
        execFileSync('git', ['-C', mainPath, 'worktree', 'remove', r.path], { stdio: ['ignore', 'pipe', 'pipe'] });
        results.push({ ...r, done: true });
      } else if (r.action === 'move') {
        if (fs.existsSync(r.target)) throw new Error(`target exists: ${r.target}`);
        fs.mkdirSync(path.dirname(r.target), { recursive: true });
        execFileSync('git', ['-C', mainPath, 'worktree', 'move', r.path, r.target], { stdio: ['ignore', 'pipe', 'pipe'] });
        results.push({ ...r, done: true });
      }
    } catch (err) {
      results.push({ ...r, done: false, error: String(err.stderr || err.message).trim().split('\n')[0] });
    }
  }
  for (const repo of new Set(rows.map((r) => r.repo))) git(path.join(root, repo), ['worktree', 'prune']);
  for (const name of fs.readdirSync(root)) {
    if (name.endsWith('.wt')) { try { fs.rmdirSync(path.join(root, name)); } catch {} }
  }
  return results;
}

function main(argv) {
  const args = argv.slice(2);
  const cmd = ['list', 'tidy'].includes(args[0]) ? args.shift() : 'list';
  const flag = (n) => args.includes(n);
  const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const root = path.resolve(value('--root') || process.env.NEBI_GITHUB_ROOT || path.join(os.homedir(), 'Documents', 'GitHub'));
  const skip = new Set((value('--skip') || '').split(',').filter(Boolean));
  const rows = discover(root).map((wt) => ({ ...wt, ...planAction(wt, { root, skip }) }));
  const doApply = cmd === 'tidy' && flag('--apply');
  const out = doApply ? apply(root, rows.filter((r) => r.action === 'remove' || r.action === 'move')) : rows;
  if (flag('--json')) { console.log(JSON.stringify(out, null, 2)); return; }
  const rel = (p) => path.relative(root, p) || p;
  for (const r of out) {
    const status = doApply ? (r.done ? 'done ' : `FAILED (${r.error}) `) : '';
    const to = r.action === 'move' ? ` -> ${rel(r.target)}` : '';
    console.log(`${status}${r.action.padEnd(6)} ${rel(r.path)}${to}  [${r.reason}]`);
  }
  const count = (a) => out.filter((r) => r.action === a).length;
  console.log(`\n${out.length} worktrees: ${count('remove')} remove, ${count('move')} move, ${count('keep')} keep, ${count('ok')} in place.${doApply ? '' : ' Nothing changed (tidy --apply carries it out).'}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
