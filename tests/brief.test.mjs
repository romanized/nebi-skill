import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const helper = path.join(root, 'claude-home/skills/nebi-prompting/scripts/brief.mjs');
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-brief-')));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

// HOME points the shared store at the sandbox; CLAUDE_CONFIG_DIR picks the current account.
function run(args, { input, env = {} } = {}) {
  return spawnSync(process.execPath, [helper, ...args], {
    input, encoding: 'utf8',
    env: { ...process.env, HOME: path.join(temp, 'home'), CLAUDE_CONFIG_DIR: '', ...env },
  });
}

function project(name, account) {
  const dir = path.join(temp, name);
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  spawnSync('git', ['init', '-q', dir]);
  if (account) fs.writeFileSync(path.join(dir, '.claude/browser.json'), JSON.stringify({ claudeAccount: account }));
  return dir;
}

function save(dir, args = []) {
  const result = run(['save', '--cwd', dir, '--session', 's1', ...args], { input: '# Brief\n\n## Goal\nShip it.\n' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('save writes a dated brief into the task folder and never overwrites', () => {
  const dir = project('save', 'c');
  const first = save(dir, ['--slug', 'Onboarding Rebuild!']);
  const second = save(dir, ['--slug', 'onboarding rebuild']);
  assert.match(first, /\/\.agents\/nebi\/projects\/save-[0-9a-f]{16}\/tasks\/[^/]+\/briefs\/\d{4}-\d{2}-\d{2}-onboarding-rebuild\.md$/);
  assert.equal(second, first.replace(/\.md$/, '-2.md'));
  assert.equal(fs.readFileSync(first, 'utf8'), '# Brief\n\n## Goal\nShip it.\n');
  assert.match(save(dir, ['--slug', 'wrap', '--kind', 'handoff']), /\/handoffs\/\d{4}-\d{2}-\d{2}-wrap\.md$/);
});

test('save refuses an empty brief or a slug with no letters', () => {
  const dir = project('refuse');
  assert.notEqual(run(['save', '--cwd', dir, '--slug', 'x'], { input: '  \n' }).status, 0);
  assert.notEqual(run(['save', '--cwd', dir, '--slug', '!!!'], { input: '# B\n' }).status, 0);
});

test('activate builds one line from the project account, settings and ultracode', () => {
  const dir = project('activate', 'c');
  const brief = save(dir, ['--slug', 'pricing']);
  const result = run(['activate', brief, '--cwd', dir, '--model', 'opus', '--effort', 'xhigh', '--ultracode']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `cd ${dir} && claude-team -n pricing --model opus --effort xhigh 'ultracode: run the brief at ${brief}'`);
});

test('activate takes settings from the Run: header, and flags override them', () => {
  const dir = project('header', 'b');
  const header = '# Brief\nMade 2026-11-23 · project x\nRun: model=claude-mythos-5-2 effort=xhigh ultracode=yes · two big lanes\n\n## Goal\nShip.\n';
  const saved = run(['save', '--cwd', dir, '--session', 's1', '--slug', 'lanes'], { input: header });
  const brief = saved.stdout.trim();
  assert.equal(run(['activate', brief, '--cwd', dir]).stdout.trim(),
    `cd ${dir} && claude-omer -n lanes --model claude-mythos-5-2 --effort xhigh 'ultracode: run the brief at ${brief}'`);
  assert.equal(run(['activate', brief, '--cwd', dir, '--model', 'sonnet', '--effort', 'high', '--no-ultracode']).stdout.trim(),
    `cd ${dir} && claude-omer -n lanes --model sonnet --effort high 'Run the brief at ${brief}'`);
  const bad = run(['save', '--cwd', dir, '--session', 's1', '--slug', 'bad'], { input: '# B\nRun: effort=ultra\n' }).stdout.trim();
  assert.match(run(['activate', bad, '--cwd', dir]).stderr, /got ultra/);
});

test('activate falls back to the current account and omits unset flags', () => {
  const dir = project('fallback');
  const brief = save(dir, ['--slug', 'audit']);
  const team2 = run(['activate', brief, '--cwd', dir], { env: { CLAUDE_CONFIG_DIR: '/x/.claude-team2' } });
  assert.equal(team2.stdout.trim(), `cd ${dir} && claude-team2 -n audit 'Run the brief at ${brief}'`);
  assert.match(run(['activate', brief, '--cwd', dir]).stdout, /&& claude-nebi -n audit /);
});

test('activate --cloud inlines the brief; bad input fails loudly', () => {
  const dir = project('cloud', 'a');
  const brief = save(dir, ['--slug', 'night']);
  assert.equal(run(['activate', brief, '--cwd', dir, '--cloud']).stdout.trim(), `cd ${dir} && claude-nebi --cloud "$(cat ${brief})"`);
  assert.match(run(['activate', brief, '--cwd', dir, '--effort', 'ultra']).stderr, /effort is one of/);
  assert.match(run(['activate', path.join(dir, 'missing.md'), '--cwd', dir]).stderr, /Brief not found/);
  assert.match(run(['activate', brief, '--cwd', dir, '--cloud', '--paste']).stderr, /pick one/);
});

test('review runs read-only, without MCP, with the prompt on stdin', () => {
  const dir = project('review');
  const brief = save(dir, ['--slug', 'check']);
  assert.match(run(['review', brief, '--cwd', dir]).stderr, /needs --model/);
  const dry = JSON.parse(run(['review', brief, '--cwd', dir, '--model', 'm', '--dry-run']).stdout);
  assert.equal(dry.cwd, dir);
  assert.deepEqual(dry.args.slice(0, 5), ['-p', '--model', 'm', '--effort', 'high']);
  for (const flag of ['--strict-mcp-config', '--no-session-persistence']) assert.ok(dry.args.includes(flag));
  assert.equal(dry.args[dry.args.indexOf('--tools') + 1], 'Read,Grep,Glob');
  assert.match(dry.input, /READY/);
  assert.match(dry.input, /--- BRIEF ---\n# Brief/);
});

test('review passes a side-call marker so hooks do not record it', () => {
  const dir = project('stub');
  const brief = save(dir, ['--slug', 'stub']);
  const stub = path.join(temp, 'fake-claude.mjs');
  fs.writeFileSync(stub, '#!/usr/bin/env node\nprocess.stdout.write(`side=${process.env.TE_SIDECALL} args=${process.argv.length - 2}`);\n', { mode: 0o755 });
  const result = run(['review', brief, '--cwd', dir, '--model', 'm'], { env: { NEBI_CLAUDE_BIN: stub } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^side=1 args=\d+$/);
});
