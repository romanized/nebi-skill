import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { currentAccount, resolveRoute } from '../claude-home/nebi/route.mjs';

// Run as if outside any Claude session: a session's own CLAUDE_CONFIG_DIR (for example
// ~/.claude-team) would otherwise leak into the tests that read process.env.
delete process.env.CLAUDE_CONFIG_DIR;

const root = fileURLToPath(new URL('../', import.meta.url));
const routeScript = path.join(root, 'claude-home/nebi/route.mjs');
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-route-')));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const MAIN = { label: 'Main Chrome', chromeProfile: 'Default', deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', codexBrowserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
const RAPID = { label: 'RapidSneakers Chrome', chromeProfile: 'Profile 3', deviceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', codexBrowserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
const PROJECT_B = { version: 1, ...RAPID, claudeAccount: 'b' };

let count = 0;
// A fresh home (with the repo's real browsers.json unless told otherwise) and an empty folder for repos.
function world({ browsers = true } = {}) {
  const dir = path.join(temp, `w${count++}`);
  const home = path.join(dir, 'home');
  fs.mkdirSync(path.join(home, '.claude', 'nebi'), { recursive: true });
  if (browsers) fs.copyFileSync(path.join(root, 'claude-home/nebi/browsers.json'), path.join(home, '.claude/nebi/browsers.json'));
  return { home, dir };
}

function repo(parent, name, { browser, gitFile = false } = {}) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  if (gitFile) fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
  else fs.mkdirSync(path.join(dir, '.git'));
  if (browser !== undefined) {
    fs.mkdirSync(path.join(dir, '.claude'));
    fs.writeFileSync(path.join(dir, '.claude/browser.json'), typeof browser === 'string' ? browser : JSON.stringify(browser));
  }
  return dir;
}

test('the shipped browsers.json holds both known devices', () => {
  const file = JSON.parse(fs.readFileSync(path.join(root, 'claude-home/nebi/browsers.json'), 'utf8'));
  assert.equal(file.version, 1);
  assert.deepEqual(file.accounts, { a: MAIN, b: RAPID });
});

test('currentAccount reads CLAUDE_CONFIG_DIR', () => {
  const home = '/Users/someone';
  assert.equal(currentAccount({}, home), 'a', 'unset');
  assert.equal(currentAccount({ CLAUDE_CONFIG_DIR: '' }, home), 'a', 'empty counts as unset');
  assert.equal(currentAccount({ CLAUDE_CONFIG_DIR: '/Users/someone/.claude' }, home), 'a');
  assert.equal(currentAccount({ CLAUDE_CONFIG_DIR: '/Users/someone/.claude/' }, home), 'a', 'trailing slash');
  assert.equal(currentAccount({ CLAUDE_CONFIG_DIR: '~/.claude' }, home), 'a', 'unexpanded tilde');
  assert.equal(currentAccount({ CLAUDE_CONFIG_DIR: '/Users/someone/.claude-max2' }, home), 'b');
  assert.equal(currentAccount({ CLAUDE_CONFIG_DIR: '~/.claude-max2' }, home), 'b');
  assert.equal(currentAccount({ CLAUDE_CONFIG_DIR: '/Volumes/x/.claude-max2/' }, home), 'b', 'any path containing .claude-max2');
  assert.equal(currentAccount({ CLAUDE_CONFIG_DIR: '/Users/someone/.claude-work' }, home), null, 'other dir');
  assert.equal(currentAccount({ CLAUDE_CONFIG_DIR: '/Users/other/.claude' }, home), null, "another home's .claude");
  assert.equal(currentAccount(undefined, home), 'a', 'no env object');
});

test('the project file wins over the account default', () => {
  const { home, dir } = world();
  const cwd = repo(dir, 'cnlsneakers', { browser: PROJECT_B });
  const route = resolveRoute({ cwd, env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude-max2') }, home });
  assert.deepEqual(route, { ...RAPID, claudeAccount: 'b', account: 'b', source: 'project', mismatch: false });
});

test('no project file gives the current account default', () => {
  const { home, dir } = world();
  const cwd = repo(dir, 'nebi-skill');
  assert.deepEqual(resolveRoute({ cwd, env: {}, home }),
    { ...MAIN, claudeAccount: 'a', account: 'a', source: 'account', mismatch: false });
  assert.deepEqual(resolveRoute({ cwd, env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude') }, home }),
    { ...MAIN, claudeAccount: 'a', account: 'a', source: 'account', mismatch: false });
  assert.deepEqual(resolveRoute({ cwd, env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude-max2') }, home }),
    { ...RAPID, claudeAccount: 'b', account: 'b', source: 'account', mismatch: false });
});

test('an unknown config dir with no project file has no route', () => {
  const { home, dir } = world();
  const cwd = repo(dir, 'plain');
  assert.equal(resolveRoute({ cwd, env: { CLAUDE_CONFIG_DIR: '/tmp/some-other-claude' }, home }), null);
});

test('a project file naming the other account is a mismatch', () => {
  const { home, dir } = world();
  const cwd = repo(dir, 'cnlsneakers', { browser: PROJECT_B });
  const onA = resolveRoute({ cwd, env: {}, home });
  assert.equal(onA.source, 'project');
  assert.equal(onA.account, 'a');
  assert.equal(onA.claudeAccount, 'b');
  assert.equal(onA.mismatch, true);
  assert.equal(onA.deviceId, RAPID.deviceId, 'the project browser still wins on a mismatch');
  const onOther = resolveRoute({ cwd, env: { CLAUDE_CONFIG_DIR: '/tmp/some-other-claude' }, home });
  assert.equal(onOther.account, null);
  assert.equal(onOther.mismatch, true, 'an unknown account is not account b');
});

test('a project file without claudeAccount never mismatches', () => {
  const { home, dir } = world();
  const cwd = repo(dir, 'loose', { browser: { version: 1, ...RAPID } });
  const route = resolveRoute({ cwd, env: {}, home });
  assert.equal(route.claudeAccount, null);
  assert.equal(route.mismatch, false);
  assert.equal(route.source, 'project');
});

test('no project file and no browsers.json means no route', () => {
  const { home, dir } = world({ browsers: false });
  const cwd = repo(dir, 'bare');
  assert.equal(resolveRoute({ cwd, env: {}, home }), null);
  assert.equal(resolveRoute({ cwd, env: { CLAUDE_CONFIG_DIR: path.join(home, '.claude-max2') }, home }), null);
});

test('broken JSON counts as no file and never throws', () => {
  const { home, dir } = world();
  for (const bad of ['{ "label": "Main', '', '[]', 'null', '"text"', '{}', '{"label": 7}']) {
    const cwd = repo(dir, `bad${count++}`, { browser: bad });
    assert.deepEqual(resolveRoute({ cwd, env: {}, home }),
      { ...MAIN, claudeAccount: 'a', account: 'a', source: 'account', mismatch: false }, `project file ${JSON.stringify(bad)}`);
  }
  fs.writeFileSync(path.join(home, '.claude/nebi/browsers.json'), '{ "accounts": ');
  assert.equal(resolveRoute({ cwd: repo(dir, 'bad-defaults'), env: {}, home }), null);
  fs.writeFileSync(path.join(home, '.claude/nebi/browsers.json'), JSON.stringify({ version: 1, accounts: { a: 'Main' } }));
  assert.equal(resolveRoute({ cwd: repo(dir, 'odd-defaults'), env: {}, home }), null);
});

test('a nested cwd finds the browser.json at its git root', () => {
  const { home, dir } = world();
  const top = repo(dir, 'cnlsneakers', { browser: PROJECT_B });
  const deep = path.join(top, 'growth', 'b-tiktok', 'raw');
  fs.mkdirSync(deep, { recursive: true });
  const route = resolveRoute({ cwd: deep, env: { CLAUDE_CONFIG_DIR: '~/.claude-max2' }, home });
  assert.equal(route.source, 'project');
  assert.equal(route.chromeProfile, 'Profile 3');
  assert.equal(route.mismatch, false);
  const missing = resolveRoute({ cwd: path.join(top, 'not', 'made', 'yet'), env: {}, home });
  assert.equal(missing.source, 'project', 'a cwd that does not exist yet still walks up');
});

test('the nearest .git is the root: a nested repo or worktree does not borrow the outer file', () => {
  const { home, dir } = world();
  const outer = repo(dir, 'outer', { browser: PROJECT_B });
  const inner = repo(outer, 'vendor/inner');
  assert.equal(resolveRoute({ cwd: path.join(inner, 'src'), env: {}, home }).source, 'account');
  const worktree = repo(outer, 'wt', { gitFile: true, browser: PROJECT_B });
  assert.equal(resolveRoute({ cwd: worktree, env: {}, home }).source, 'project', 'a .git file marks a root too');
});

test('a cwd outside any repo, or no cwd, uses the account default', () => {
  const { home, dir } = world();
  const loose = path.join(dir, 'loose-folder');
  fs.mkdirSync(loose);
  for (const cwd of [loose, undefined, '', 42]) {
    assert.equal(resolveRoute({ cwd, env: {}, home })?.source, 'account', `cwd ${String(cwd)}`);
  }
  assert.doesNotThrow(() => resolveRoute());
});

test('the CLI prints the route for a folder', () => {
  const { home, dir } = world();
  const cwd = repo(dir, 'cnlsneakers', { browser: PROJECT_B });
  const result = spawnSync(process.execPath, [routeScript, path.join(cwd, 'growth')], {
    encoding: 'utf8', env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude-max2') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ...RAPID, claudeAccount: 'b', account: 'b', source: 'project', mismatch: false });
});

test('importing the module prints nothing', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(routeScript).href)})`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
