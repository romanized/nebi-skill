import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeTest from 'node:test';

// browser-open is the macOS $BROWSER router (it calls `open -na "Google Chrome"` and is set in ~/.zshenv), so Windows skips it.
const test = process.platform === 'win32' ? nodeTest.skip : nodeTest;

// The router must never open a real window here. Every run is either --dry-run, or runs with PATH set to a folder
// that holds only a fake `open`, so the real /usr/bin/open cannot be reached.
const root = fileURLToPath(new URL('../', import.meta.url));
const router = path.join(root, 'claude-home/nebi/browser-open');
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-browser-open-')));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const URL_A = 'https://example.com/page?x=1';
const q = (arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg}'`);
const chrome = (profile, url = URL_A) => ['open', '-na', 'Google Chrome', '--args', `--profile-directory=${profile}`, url].map(q).join(' ');

let count = 0;
// A fresh home with the shipped browsers.json (unless told otherwise) and a git repo, optionally with a route file.
function world({ browsers = true, project } = {}) {
  const dir = path.join(temp, `w${count++}`);
  const home = path.join(dir, 'home');
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(path.join(home, '.claude', 'nebi'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src', 'deep'), { recursive: true });
  if (browsers) fs.copyFileSync(path.join(root, 'claude-home/nebi/browsers.json'), path.join(home, '.claude/nebi/browsers.json'));
  if (project !== undefined) {
    fs.mkdirSync(path.join(repo, '.claude'));
    fs.writeFileSync(path.join(repo, '.claude/browser.json'), typeof project === 'string' ? project : JSON.stringify(project));
  }
  return { dir, home, repo };
}

function run(args, { cwd, home, env = {}, script = router }) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { HOME: home, PATH: '/nonexistent', ...env },
  });
}

function dryRun(url, options) {
  const r = run(['--dry-run', url], options);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

const PROJECT_B = { version: 1, label: 'RapidSneakers Chrome', chromeProfile: 'Profile 3', deviceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', claudeAccount: 'b' };

test('is an executable node script that runs straight from its path', () => {
  assert.ok(fs.statSync(router).mode & 0o111, 'executable bit');
  assert.match(fs.readFileSync(router, 'utf8'), /^#!\/usr\/bin\/env node\n/);
  const { repo } = world({ project: PROJECT_B });
  const r = spawnSync(router, ['--dry-run', URL_A], { cwd: repo, encoding: 'utf8', env: { ...process.env, HOME: path.join(temp, 'nohome') } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), chrome('Profile 3'));
});

test('the project file wins, found from a subfolder', () => {
  const { home, repo } = world({ project: PROJECT_B });
  assert.equal(dryRun(URL_A, { cwd: path.join(repo, 'src/deep'), home }), chrome('Profile 3'));
});

test('no project file uses the current account default', () => {
  const { home, repo } = world();
  assert.equal(dryRun(URL_A, { cwd: repo, home }), chrome('Default'), 'account a');
  const b = { CLAUDE_CONFIG_DIR: path.join(home, '.claude-max2') };
  assert.equal(dryRun(URL_A, { cwd: repo, home, env: b }), chrome('Profile 3'), 'account b');
});

test('no route falls back to plain open', () => {
  const { home, repo } = world({ browsers: false });
  assert.equal(dryRun(URL_A, { cwd: repo, home }), `open '${URL_A}'`, 'no defaults file');
  const other = world();
  const env = { CLAUDE_CONFIG_DIR: path.join(other.home, '.claude-work') };
  assert.equal(dryRun(URL_A, { cwd: other.repo, home: other.home, env }), `open '${URL_A}'`, 'unknown account');
});

test('only http(s) links go to Chrome', () => {
  const { home, repo } = world({ project: PROJECT_B });
  assert.equal(dryRun('file:///tmp/report.html', { cwd: repo, home }), 'open file:///tmp/report.html');
  assert.equal(dryRun('mailto:a@b.c', { cwd: repo, home }), 'open mailto:a@b.c');
  assert.equal(dryRun('HTTP://example.com', { cwd: repo, home }), chrome('Profile 3', 'HTTP://example.com'));
});

test('a garbled project file falls through to the account default', () => {
  const { home, repo } = world({ project: '{not json' });
  assert.equal(dryRun(URL_A, { cwd: repo, home }), chrome('Default'));
});

test('a missing route.mjs never throws: plain open, exit 0', () => {
  const { dir, home, repo } = world({ project: PROJECT_B });
  const alone = path.join(dir, 'alone', 'browser-open');
  fs.mkdirSync(path.dirname(alone));
  fs.copyFileSync(router, alone);
  assert.equal(dryRun(URL_A, { cwd: repo, home, script: alone }), `open '${URL_A}'`);
});

test('a flag-like argument is never handed on as a URL', () => {
  const { home, repo } = world({ project: PROJECT_B });
  const r = run(['--dry-run', '--remote-debugging-port=9222'], { cwd: repo, home });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^Usage: browser-open/);
});

// One fake `open`, run twice up front: macOS scans a new executable on its first run (~250 ms here), which would
// blow the router's 50 ms fail window. FAKE_OPEN_LOG logs the arguments, FAKE_OPEN_FAIL makes the Chrome call exit 1,
// FAKE_OPEN_LINGER keeps it running for 2 s.
const fakeBin = path.join(temp, 'fake-bin');
fs.mkdirSync(fakeBin);
fs.writeFileSync(path.join(fakeBin, 'open'), [
  '#!/bin/sh',
  '[ -n "$FAKE_OPEN_LOG" ] && printf \'%s\\n\' "$*" >> "$FAKE_OPEN_LOG"',
  '[ -n "$FAKE_OPEN_FAIL" ] && [ "$1" = "-na" ] && exit 1',
  '[ -n "$FAKE_OPEN_LINGER" ] && /bin/sleep 2',
  'exit 0',
  '',
].join('\n'), { mode: 0o755 });
for (let i = 0; i < 2; i++) spawnSync(path.join(fakeBin, 'open'), [], { env: {} });

function fakeOpen(dir, { fail = false, linger = false } = {}) {
  const log = path.join(dir, 'open.log');
  const env = { PATH: fakeBin, FAKE_OPEN_LOG: log, ...(fail && { FAKE_OPEN_FAIL: '1' }), ...(linger && { FAKE_OPEN_LINGER: '1' }) };
  return { env, log };
}

function readLog(log, lines) {
  const until = Date.now() + 2000;
  for (;;) {
    const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
    const got = text.split('\n').filter(Boolean);
    if (got.length >= lines || Date.now() > until) return got;
    spawnSync('/bin/sleep', ['0.05']);
  }
}

test('opens detached and exits 0 at once while Chrome is still starting', (t) => {
  const { dir, home, repo } = world({ project: PROJECT_B });
  const { env, log } = fakeOpen(dir, { linger: true });
  const started = Date.now();
  const r = run([URL_A], { cwd: repo, home, env });
  const elapsed = Date.now() - started;
  t.diagnostic(`exited in ${elapsed} ms (node start included)`);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(elapsed < 500, `took ${elapsed} ms; the fake open lingers 2 s, so the router did not wait for it`);
  assert.deepEqual(readLog(log, 1), [`-na Google Chrome --args --profile-directory=Profile 3 ${URL_A}`]);
});

test('falls back to plain open when the Chrome call fails, still exit 0', () => {
  const { dir, home, repo } = world({ project: PROJECT_B });
  const { env, log } = fakeOpen(dir, { fail: true });
  const r = run([URL_A], { cwd: repo, home, env });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readLog(log, 2), [`-na Google Chrome --args --profile-directory=Profile 3 ${URL_A}`, URL_A]);
});

test('exits 0 even when open cannot be found at all', () => {
  const { home, repo } = world({ project: PROJECT_B });
  const r = run([URL_A], { cwd: repo, home, env: { PATH: path.join(temp, 'empty-path') } });
  assert.equal(r.status, 0, r.stderr);
});
