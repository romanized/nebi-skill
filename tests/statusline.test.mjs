import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const statusline = path.join(root, 'claude-home/nebi/statusline.mjs');
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-statusline-')));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const OWN = 'own-0000';
const MIN = 60_000;
const ALERT = '\x1b[30;41m';
const WARM = '\x1b[32m';
const SOON = '\x1b[1;33m';
const COLD = '\x1b[2m';
const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');
// An SGR code that sets a background colour (40-47, 100-107), alone or among other params.
const BACKGROUND = /\x1b\[(?:[0-9]+;)*(?:4[0-7]|10[0-7])(?:;[0-9]+)*m/;

let count = 0;
// A fresh home holding the repo's browsers.json, so the account label resolves.
function home() {
  const dir = path.join(temp, `h${count++}`);
  fs.mkdirSync(path.join(dir, '.claude', 'nebi', 'beacons'), { recursive: true });
  fs.copyFileSync(path.join(root, 'claude-home/nebi/browsers.json'), path.join(dir, '.claude/nebi/browsers.json'));
  return dir;
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}

function beacon(dir, id, fields) {
  write(path.join(dir, '.claude/nebi/beacons', `${id}.json`), { version: 2, writer: 'mod', sessionId: id, ...fields });
}

function hold(dir, id, fields) {
  write(path.join(dir, '.claude/nebi/beacons', `${id}.hold.json`), { version: 1, sessionId: id, ...fields });
}

function run(homeDir, payload, { env = {}, script = statusline } = {}) {
  const base = { ...process.env, HOME: homeDir, USERPROFILE: homeDir };
  delete base.CLAUDE_CONFIG_DIR;
  // A folder outside any repo: without current_dir the statusline routes from its own cwd.
  const result = spawnSync(process.execPath, [script], {
    input: typeof payload === 'string' ? payload : JSON.stringify({ session_id: OWN, ...payload }),
    encoding: 'utf8',
    cwd: temp,
    env: { ...base, ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function gitRepo(name, branch) {
  const dir = path.join(temp, name);
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
  git('init', '-q');
  git('checkout', '-q', '-b', branch);
  git('commit', '-q', '--allow-empty', '-m', 'x');
  return dir;
}

test('the own segments read short: model, ctx, effort, limits, account, branch last', () => {
  const repo = gitRepo('plain-repo', 'feat/statusline');
  const out = run(home(), {
    model: { display_name: 'Opus 5.5 (1M context)' },
    context_window: { used_percentage: 45.4, context_window_size: 1_000_000 },
    effort: { level: 'xhigh' },
    rate_limits: { five_hour: { used_percentage: 8.2 }, seven_day: { used_percentage: 31.6 } },
    workspace: { current_dir: repo },
  });
  assert.equal(plain(out), 'Opus 5.5 · ctx 45% · xhigh · 5h 8% · wk 32% · A · Main · ⎇ feat/statusline');
  assert.doesNotMatch(out, /1M|eff:|\|/);
});

test('nothing leads the line when no other session waits, and done sessions stay quiet', () => {
  const dir = home();
  const now = Date.now();
  beacon(dir, 'busy', { cwd: '/w/busy', kind: 'working', updatedAt: now, heartbeatAt: now });
  beacon(dir, 'finished', { cwd: '/w/finished', kind: 'done', updatedAt: now - MIN, heartbeatAt: now });
  const out = run(dir, { model: { display_name: 'Opus 5.5' } });
  assert.match(plain(out), /^Opus 5\.5 · A · Main$/);
});

test('one session needing Nebi leads as plain "1 waiting": no name, no wait, no background', () => {
  const dir = home();
  const now = Date.now();
  beacon(dir, 'n1', { cwd: '/w/cnlsneakers', kind: 'need', askedAt: now - 12 * MIN, updatedAt: now, heartbeatAt: now });
  session(dir, '.claude-max2', 'n1', { name: 'rs-growth', nameSource: 'user' });
  const out = run(dir, { model: { display_name: 'Opus 5.5' } });
  assert.equal(out, '1 waiting · Opus 5.5 · A · Main');
  assert.doesNotMatch(out, BACKGROUND);
});

test('three sessions needing Nebi read "3 waiting", whatever writer or version made the beacon', () => {
  const dir = home();
  const now = Date.now();
  beacon(dir, 'n1', { cwd: '/w/cnlsneakers', kind: 'need', askedAt: now - 12 * MIN, updatedAt: now, heartbeatAt: now });
  // v1 file: no writer field, counts as a mod file.
  write(path.join(dir, '.claude/nebi/beacons/n2.json'), { version: 1, sessionId: 'n2', cwd: '/w/ecom', kind: 'need', updatedAt: now - 5 * MIN, heartbeatAt: now });
  beacon(dir, 'n3', { writer: 'hook', cwd: '/w/hooked', kind: 'need', updatedAt: now - 60 * MIN });
  beacon(dir, 'w1', { cwd: '/w/working', kind: 'working', updatedAt: now, heartbeatAt: now });
  beacon(dir, 'd1', { cwd: '/w/finished', kind: 'done', updatedAt: now - MIN, heartbeatAt: now });
  const out = run(dir, { model: { display_name: 'Opus 5.5' } });
  assert.equal(out.split(' · ')[0], '3 waiting');
  assert.equal(out, '3 waiting · Opus 5.5 · A · Main');
  assert.doesNotMatch(out, BACKGROUND);
  assert.doesNotMatch(out, /cnlsneakers|ecom|hooked|finished|\d+[smh]\b|\+/);
});

test('stale, garbled, mislabeled and own beacons are not counted', () => {
  const dir = home();
  const now = Date.now();
  beacon(dir, OWN, { cwd: '/w/me', kind: 'need', askedAt: now, updatedAt: now, heartbeatAt: now });
  beacon(dir, 'stale-mod', { cwd: '/w/stalemod', kind: 'need', updatedAt: now, heartbeatAt: now - 2 * MIN });
  beacon(dir, 'stale-hook', { writer: 'hook', cwd: '/w/stalehook', kind: 'need', updatedAt: now - 13 * 60 * MIN });
  beacon(dir, 'no-writer', { writer: 'other', cwd: '/w/nowriter', kind: 'need', updatedAt: now, heartbeatAt: now });
  write(path.join(dir, '.claude/nebi/beacons/garbled.json'), '{"version":2,');
  write(path.join(dir, '.claude/nebi/beacons/renamed.json'), { version: 2, writer: 'mod', sessionId: 'other', cwd: '/w/renamed', kind: 'need', heartbeatAt: now });
  write(path.join(dir, '.claude/nebi/beacons/v3.json'), { version: 3, writer: 'mod', sessionId: 'v3', cwd: '/w/v3', kind: 'need', heartbeatAt: now });
  hold(dir, 'old-hold', { cwd: '/w/oldhold', heldAt: now - 16 * MIN });
  hold(dir, OWN, { cwd: '/w/me', heldAt: now });
  assert.match(plain(run(dir, { model: { display_name: 'Opus 5.5' } })), /^Opus 5\.5 · A · Main$/);
  // One live peer beside them all counts alone.
  beacon(dir, 'live', { cwd: '/w/live', kind: 'need', askedAt: now, updatedAt: now, heartbeatAt: now });
  assert.equal(run(dir, { model: { display_name: 'Opus 5.5' } }), '1 waiting · Opus 5.5 · A · Main');
});

test('a hold file counts its session as waiting, once even beside a need beacon', () => {
  const dir = home();
  const now = Date.now();
  beacon(dir, 'h1', { cwd: '/w/held', kind: 'working', updatedAt: now - 30 * MIN, heartbeatAt: now });
  hold(dir, 'h1', { cwd: '/w/held', heldAt: now - 4 * MIN });
  hold(dir, 'h2', { cwd: '/w/holdonly', heldAt: now - 2 * MIN });
  beacon(dir, 'h3', { cwd: '/w/both', kind: 'need', askedAt: now - MIN, updatedAt: now, heartbeatAt: now });
  hold(dir, 'h3', { cwd: '/w/both', heldAt: now - MIN });
  assert.equal(run(dir, { model: { display_name: 'Opus 5.5' } }), '3 waiting · Opus 5.5 · A · Main');
});

// One <config>/sessions/<pid>.json, shaped like Claude Code's per-process registry file.
let pid = 1000;
function session(dir, account, id, fields = {}) {
  const n = pid++;
  write(path.join(dir, account, 'sessions', `${n}.json`), { pid: n, sessionId: id, cwd: '/w', kind: 'interactive', ...fields });
}

test('account b comes from CLAUDE_CONFIG_DIR, or from its session registry when the env is missing', () => {
  const dir = home();
  assert.equal(plain(run(dir, {}, { env: { CLAUDE_CONFIG_DIR: path.join(dir, '.claude-max2') } })), 'B · RapidSneakers');
  assert.equal(plain(run(dir, {})), 'A · Main');
  write(path.join(dir, '.claude-max2/sessions/4242.json'), { pid: 4242, sessionId: OWN, cwd: '/w' });
  write(path.join(dir, '.claude-max2/sessions/4343.json'), '{garbled');
  assert.equal(plain(run(dir, {})), 'B · RapidSneakers');
  assert.equal(plain(run(dir, { session_id: 'someone-else' })), 'A · Main');
  // A sessions path that is a file, not a folder, is no registry at all.
  const odd = home();
  write(path.join(odd, '.claude-max2/sessions'), 'not a folder');
  assert.equal(plain(run(odd, {})), 'A · Main');
});

test('a project that wants the other account shows a red badge', () => {
  const dir = home();
  const repo = gitRepo('rapid-repo', 'main');
  write(path.join(repo, '.claude/browser.json'), {
    version: 1, label: 'RapidSneakers Chrome', chromeProfile: 'Profile 3',
    deviceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', claudeAccount: 'b',
  });
  const wrong = run(dir, { workspace: { current_dir: repo } });
  assert.equal(wrong, `${ALERT} A · RapidSneakers \x1b[0m · ⎇ main`);
  const right = run(dir, { workspace: { current_dir: repo } }, { env: { CLAUDE_CONFIG_DIR: path.join(dir, '.claude-max2') } });
  assert.equal(right, 'B · RapidSneakers · ⎇ main');
});

test('it never throws: blank stdin, junk payloads, a missing route reader', () => {
  const dir = home();
  assert.equal(plain(run(dir, '')), 'A · Main');
  assert.equal(plain(run(dir, 'not json')), 'A · Main');
  assert.equal(plain(run(dir, JSON.stringify({ model: 7, context_window: { used_percentage: 'x' }, rate_limits: null, workspace: { current_dir: '/does/not/exist' } }))), 'A · Main');
  const lone = path.join(temp, 'lone');
  fs.mkdirSync(lone, { recursive: true });
  fs.copyFileSync(statusline, path.join(lone, 'statusline.mjs'));
  assert.equal(run(dir, { model: { display_name: 'Opus 5.5' } }, { script: path.join(lone, 'statusline.mjs') }), 'Opus 5.5');
});

// A transcript fixture: entries become JSON lines, strings stay as written.
function transcript(...entries) {
  const file = path.join(temp, 'transcripts', `t${count++}.jsonl`);
  write(file, `${entries.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n')}\n`);
  return file;
}

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const asked = (ms) => ({ type: 'user', timestamp: ago(ms), message: { role: 'user', content: 'go on' } });

// One API response `ms` back, shaped like a real transcript entry; `wrote` names the tier it cached.
function reply(ms, wrote = {}) {
  const h1 = wrote.h1 ?? 0;
  const m5 = wrote.m5 ?? 0;
  return {
    type: 'assistant', isSidechain: false, timestamp: ago(ms),
    message: {
      model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'text', text: 'ok' }],
      usage: {
        input_tokens: 2, cache_creation_input_tokens: h1 + m5, cache_read_input_tokens: 90_000, output_tokens: 40,
        cache_creation: { ephemeral_1h_input_tokens: h1, ephemeral_5m_input_tokens: m5 },
      },
    },
  };
}

// Margins keep each expected minute stable while the statusline process starts.
const HALF = 30_000;

test('the cache meter follows ctx: green while 10+ minutes of a 1h cache are left', () => {
  const dir = home();
  const file = transcript(asked(14 * MIN), reply(13 * MIN - HALF, { h1: 1579 }));
  const out = run(dir, {
    model: { display_name: 'Opus 5.5' }, context_window: { used_percentage: 45.4 }, effort: { level: 'xhigh' }, transcript_path: file,
  });
  assert.equal(plain(out), 'Opus 5.5 · ctx 45% · cache 47m · xhigh · A · Main');
  assert.ok(out.includes(`${WARM}cache 47m\x1b[0m`), JSON.stringify(out));
  assert.equal(run(dir, { transcript_path: transcript(reply(50 * MIN - HALF, { h1: 9 })) }), `${WARM}cache 10m\x1b[0m · A · Main`);
  // No entry in the tail wrote cache: a pure read still restarts the clock, on the 1h default.
  assert.equal(plain(run(dir, { transcript_path: transcript(reply(20 * MIN - HALF)) })), 'cache 40m · A · Main');
});

test('a 5m cache counts down from the last response, a pure read keeping the newest tier', () => {
  const file = transcript(reply(30 * MIN, { h1: 4000 }), reply(4 * MIN, { m5: 800 }), asked(2 * MIN), reply(2 * MIN - HALF));
  assert.equal(run(home(), { transcript_path: file }), `${SOON}cache 3m\x1b[0m · A · Main`);
});

test('under 10 minutes left the meter turns yellow, and seconds show in the last minute', () => {
  const dir = home();
  assert.equal(run(dir, { transcript_path: transcript(reply(52 * MIN - HALF, { h1: 500 })) }), `${SOON}cache 8m\x1b[0m · A · Main`);
  assert.match(run(dir, { transcript_path: transcript(reply(5 * MIN - 20_000, { m5: 500 })) }), /^\x1b\[1;33mcache 1\ds\x1b\[0m · /);
});

test('an expired cache reads dim "cache cold", with no hit rate', () => {
  const dir = home();
  const rebuilt = { context_window: { current_usage: { input_tokens: 5, cache_creation_input_tokens: 90_000, cache_read_input_tokens: 0, output_tokens: 9 } } };
  assert.equal(run(dir, { ...rebuilt, transcript_path: transcript(reply(61 * MIN, { h1: 500 })) }), `${COLD}cache cold\x1b[0m · A · Main`);
  assert.equal(run(dir, { transcript_path: transcript(reply(10 * MIN, { h1: 500 }), reply(6 * MIN, { m5: 500 })) }), `${COLD}cache cold\x1b[0m · A · Main`);
});

test('before the first API response the meter is absent', () => {
  const dir = home();
  const system = { type: 'system', subtype: 'turn_duration', timestamp: ago(0) };
  assert.equal(plain(run(dir, { model: { display_name: 'Opus 5.5' }, transcript_path: transcript(asked(MIN), system) })), 'Opus 5.5 · A · Main');
  assert.equal(plain(run(dir, { transcript_path: transcript() })), 'A · Main');
});

test('a missing or unreadable transcript drops the meter, never the line', () => {
  const dir = home();
  for (const transcriptPath of [path.join(temp, 'gone.jsonl'), temp, 7, '', null]) {
    assert.equal(plain(run(dir, { model: { display_name: 'Opus 5.5' }, transcript_path: transcriptPath })), 'Opus 5.5 · A · Main');
  }
});

test('the last request\'s hit rate shows only under 80%', () => {
  const dir = home();
  const file = transcript(reply(13 * MIN - HALF, { h1: 1579 }));
  const usage = (input_tokens, cache_creation_input_tokens, cache_read_input_tokens) =>
    ({ transcript_path: file, context_window: { current_usage: { input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens: 300 } } });
  assert.equal(run(dir, usage(500, 87_500, 12_000)), `${WARM}cache 47m · 12% hit\x1b[0m · A · Main`);
  assert.equal(plain(run(dir, usage(5, 90_000, 0))), 'cache 47m · 0% hit · A · Main');
  assert.equal(plain(run(dir, usage(2, 1579, 298_317))), 'cache 47m · A · Main');
  assert.equal(plain(run(dir, usage(0, 20_000, 80_000))), 'cache 47m · A · Main');
  assert.equal(plain(run(dir, { transcript_path: file, context_window: { current_usage: null } })), 'cache 47m · A · Main');
});

test('garbled, synthetic, sidechain and cut-off lines are skipped; only the tail is read', () => {
  const dir = home();
  const synthetic = { ...reply(10_000), message: { model: '<synthetic>', role: 'assistant', content: [], usage: { input_tokens: 0, output_tokens: 0 } } };
  const file = transcript(
    'not json', reply(13 * MIN - HALF, { h1: 1579 }), '', 'null', '[1,2]', '{"type":"assistant",',
    { ...reply(MIN, { m5: 700 }), isSidechain: true }, synthetic, { ...reply(0), timestamp: 'not a date' },
    asked(10_000), '{"type":"assistant","timestamp":"',
  );
  assert.equal(run(dir, { transcript_path: file }), `${WARM}cache 47m\x1b[0m · A · Main`);
  // A 5m write before 300 KB of tool output lies outside the tail, so the clock uses the 1h default.
  const big = { type: 'user', timestamp: ago(5 * MIN), message: { role: 'user', content: 'x'.repeat(300 * 1024) } };
  const long = transcript(reply(10 * MIN, { m5: 800 }), big, reply(4 * MIN - HALF));
  assert.equal(plain(run(dir, { transcript_path: long })), 'cache 56m · A · Main');
});
