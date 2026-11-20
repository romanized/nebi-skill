import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { laneName, markNested, planAction } from '../claude-home/nebi/worktrees.mjs';

const script = fileURLToPath(new URL('../claude-home/nebi/worktrees.mjs', import.meta.url));
// Paths go through path.resolve so the pure cases hold on the Windows CI runner too.
const R = (...p) => path.resolve('/r', ...p);
const root = R();
const base = { repo: 'app', main: R('app'), path: R('app-lane'), lane: 'lane', dirty: 0, unpushed: 0, merged: false, keepers: [], ageDays: 30, open: false, railway: false, recent: false, locked: false, nests: false };
const posixOnly = { skip: process.platform === 'win32' && 'the tidy tool reads lsof and pgrep, macOS only' };
const plan = (over, opts = {}) => planAction({ ...base, ...over }, { root, ...opts });

test('worktrees: merged and clean is removed, dirty or unpushed work is moved under .worktrees/<repo>/', () => {
  assert.equal(plan({ merged: true }).action, 'remove');
  assert.equal(plan({ ageDays: 30 }).action, 'remove');
  assert.deepEqual(plan({ dirty: 2, merged: true }), { action: 'move', reason: '2 uncommitted', target: R('.worktrees', 'app', 'lane') });
  assert.equal(plan({ unpushed: 3 }).action, 'move');
  assert.equal(plan({ ageDays: 2 }).action, 'move');
});

test('worktrees: ignored files that are not caches turn a removal into a move', () => {
  assert.equal(plan({ merged: true, keepers: ['src/img/generated/G01.png'] }).action, 'move');
  assert.equal(plan({ merged: true, keepers: ['.claude/'] }).action, 'move', 'an ignored .claude/ can hold a nested worktree');
});

test('worktrees: open, Railway-linked, recently changed, skipped or outside-root worktrees are kept', () => {
  for (const over of [{ open: true }, { railway: true }, { recent: true }, { locked: true }, { nests: true }, { path: path.resolve('/tmp/scratch/app-lane') }]) {
    assert.equal(plan({ merged: true, ...over }).action, 'keep', JSON.stringify(over));
  }
  assert.equal(plan({ merged: true }, { skip: new Set(['app']) }).action, 'keep');
});

test('worktrees: already under .worktrees/<repo>/ or the harness .claude/worktrees/ counts as in place', () => {
  assert.equal(plan({ dirty: 1, path: R('.worktrees', 'app', 'lane') }).action, 'ok');
  assert.equal(plan({ dirty: 1, path: R('app', '.claude', 'worktrees', 'wf_1') }).action, 'ok');
  assert.equal(plan({ merged: true, path: R('app', '.claude', 'worktrees', 'wf_1') }).action, 'remove', 'harness leftovers go once safe');
});

test('worktrees: a worktree with another inside it is flagged', () => {
  const rows = markNested([{ path: R('app-lane') }, { path: R('app-lane', '.claude', 'worktrees', 'x') }, { path: R('app-lane2') }]);
  assert.deepEqual(rows.map((r) => r.nests), [true, false, false]);
});

test('worktrees: lane names drop the repo prefix', () => {
  assert.equal(laneName('Karpet24', R('Karpet24-wt-webshop')), 'webshop');
  assert.equal(laneName('withdrawal-desk', R('withdrawal-desk-bol')), 'bol');
  assert.equal(laneName('withdrawal-desk', R('wdb-A0')), 'wdb-A0');
});

test('worktrees: tidy --apply removes a merged worktree, moves a dirty one, and keeps both branches', posixOnly, () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-tidy-')));
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    const origin = path.join(tmp, 'origin.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    const gh = path.join(tmp, 'GitHub');
    fs.mkdirSync(gh);
    const app = path.join(gh, 'app');
    execFileSync('git', ['clone', '-q', origin, app], { stdio: 'ignore' });
    git(app, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
    git(app, 'push', '-q', 'origin', 'main');
    git(app, 'remote', 'set-head', 'origin', 'main');
    git(app, 'worktree', 'add', '-q', '-b', 'done', path.join(gh, 'app-done'));
    git(app, 'worktree', 'add', '-q', '-b', 'wip', path.join(gh, 'app-wip'));
    fs.writeFileSync(path.join(gh, 'app-wip', 'draft.txt'), 'unsaved');
    const old = new Date(Date.now() - 86_400_000);
    for (const dir of [path.join(gh, 'app-done'), path.join(gh, 'app-wip')]) {
      for (const p of [dir, ...fs.readdirSync(dir).map((n) => path.join(dir, n))]) fs.utimesSync(p, old, old);
    }
    for (const name of ['app-done', 'app-wip']) fs.utimesSync(path.join(app, '.git', 'worktrees', name, 'index'), old, old);
    const r = spawnSync(process.execPath, [script, 'tidy', '--apply', '--root', gh, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const rows = JSON.parse(r.stdout);
    assert.deepEqual(rows.map((x) => [x.lane, x.action, x.done]).sort(), [['done', 'remove', true], ['wip', 'move', true]]);
    assert.equal(fs.existsSync(path.join(gh, 'app-done')), false);
    assert.equal(fs.readFileSync(path.join(gh, '.worktrees', 'app', 'wip', 'draft.txt'), 'utf8'), 'unsaved');
    assert.match(git(app, 'branch', '--list', 'done', 'wip'), /done[\s\S]*wip/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('worktrees: tidy --apply never deletes a worktree nested in an ignored .claude/ of a merged lane', posixOnly, () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-nest-')));
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    const origin = path.join(tmp, 'origin.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    const gh = path.join(tmp, 'GitHub');
    fs.mkdirSync(gh);
    const app = path.join(gh, 'app');
    execFileSync('git', ['clone', '-q', origin, app], { stdio: 'ignore' });
    fs.writeFileSync(path.join(app, '.gitignore'), '.claude/\n');
    git(app, 'add', '.gitignore');
    git(app, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
    git(app, 'push', '-q', 'origin', 'main');
    git(app, 'remote', 'set-head', 'origin', 'main');
    const outer = path.join(gh, 'app-outer');
    git(app, 'worktree', 'add', '-q', '-b', 'outer', outer);
    const inner = path.join(outer, '.claude', 'worktrees', 'x');
    git(app, 'worktree', 'add', '-q', '-b', 'inner', inner);
    fs.writeFileSync(path.join(inner, 'edit.txt'), 'keep me');
    const old = new Date(Date.now() - 86_400_000);
    const age = (dir) => { for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); if (n !== '.git' && fs.lstatSync(p).isDirectory()) age(p); fs.utimesSync(p, old, old); } fs.utimesSync(dir, old, old); };
    age(outer);
    for (const name of ['app-outer', 'x']) fs.utimesSync(path.join(app, '.git', 'worktrees', name, 'index'), old, old);
    const r = spawnSync(process.execPath, [script, 'tidy', '--apply', '--root', gh, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const rows = JSON.parse(r.stdout);
    assert.equal(rows.some((x) => x.lane === 'outer' && x.action === 'remove'), false, JSON.stringify(rows));
    const survivors = [path.join(inner, 'edit.txt'), path.join(gh, '.worktrees', 'app', 'x', 'edit.txt')].filter((p) => fs.existsSync(p));
    assert.equal(survivors.length, 1, 'the inner worktree edit survives exactly once');
    assert.equal(fs.readFileSync(survivors[0], 'utf8'), 'keep me');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
