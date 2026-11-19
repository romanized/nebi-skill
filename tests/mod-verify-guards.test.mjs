// Dialog and settings guards of the nebi-mod-verify paint check, fed recorded screens instead of a live session.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  KEYS, planDialog, findOptions, inputBoxText, readyToSubmit, compareSettings, snapshotSettings, enforceSettings, settingsFiles, outputDir,
} from '../claude-home/skills/nebi-mod-verify/scripts/guards.mjs';
import { checkRun } from '../claude-home/skills/nebi-mod-verify/scripts/check.mjs';

const RULE = '─'.repeat(150);
const BANNER = [
  '',
  ' ▐▛███▛█   Claude Code v2.1.288',
  '▝▜██████▀  Model (1M context) with xhigh effort · Claude Max',
  ' ▝▝   ▝▝   ~/.cache/nebi-mod-verify/demo',
  '',
  '❯ Create hello.py that prints hello. Then ask me in one plain sentence whether you should also add a test, and end your reply with a ❓ Need you      ',
  '  status line.                                                                                                                                        ',
  '',
  '⏺ Write(hello.py)',
  '  ⎿  wrote 1 line · hello.py',
  '',
  '⏺ I created hello.py. Running it with python3 hello.py prints hello and exits with code 0.',
  '',
  '  ❓  Need you — should I add a test for hello.py in the demo repo?',
  '',
];

// Recorded at the end of turn one on 2026-10-03: typing the next prompt plus Enter here chose "Yes".
const AUTO_MODE = [...BANNER,
  RULE,
  ' Make auto mode your default permission mode?',
  '',
  '   Auto mode lets Claude handle permission prompts automatically. Claude checks each tool call for risky actions and prompt injection before',
  '   executing, runs the ones it assesses as lower-risk, and blocks the rest.',
  '',
  '   ❯ Yes, set auto mode as my default permission mode',
  '     No, keep bypass permissions',
  '', '', '',
].join('\n');

const TRUST = (cursorOnYes = false) => ['',
  RULE,
  ' Accessing workspace:',
  '',
  ' /tmp/demo',
  '',
  ' Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team).',
  ' If not, take a moment to review what\'s in this folder first.',
  '',
  ' Claude Code\'ll be able to read, edit, and execute files here.',
  '',
  ' Security guide',
  '',
  cursorOnYes ? '   No, exit' : ' ❯ No, exit',
  cursorOnYes ? ' ❯ Yes, I trust this folder' : '   Yes, I trust this folder',
  '',
  ' Enter to confirm · Esc to cancel',
].join('\n');

const IDLE = (input = '') => [...BANNER,
  '⏺ nebi-receipt: changed hello.py · no check since the last edit',
  '', '', '',
  '  NEED YOU  should I add a test for hello.py in the demo repo? · 1m                                                                                [-]',
  '',
  RULE,
  `❯ ${input}`,
  RULE,
  '   demo 15m · ctx 8% · Main · ⎇ main',
  '  ⏵⏵ bypass permissions on',
].join('\n');

test('auto mode offer: moves down to "No, keep bypass permissions" and confirms', () => {
  const plan = planDialog(AUTO_MODE);
  assert.ok(plan, 'dialog detected');
  assert.equal(plan.title, 'Make auto mode your default permission mode?');
  assert.deepEqual(plan.options, ['Yes, set auto mode as my default permission mode', 'No, keep bypass permissions']);
  assert.equal(plan.cursor, 0);
  assert.equal(plan.choice, 'No, keep bypass permissions');
  assert.deepEqual(plan.keys, [KEYS.down, KEYS.enter]);
  assert.equal(readyToSubmit(AUTO_MODE, 'count to 5'), false, 'never submit over the dialog');
});

test('folder trust is accepted, from either cursor position', () => {
  const fresh = planDialog(TRUST());
  assert.equal(fresh.choice, 'Yes, I trust this folder');
  assert.deepEqual(fresh.keys, [KEYS.down, KEYS.enter]);
  assert.deepEqual(planDialog(TRUST(true)).keys, [KEYS.enter]);
});

test('idle screen: no dialog, the echoed prompt and the input box are not options', () => {
  assert.equal(findOptions(IDLE()), null);
  assert.equal(planDialog(IDLE()), null);
  assert.equal(inputBoxText(IDLE()), '');
  assert.equal(inputBoxText(AUTO_MODE), null, 'the dialog hides the input box');
});

test('Enter is allowed only when the input box holds the typed text', () => {
  assert.equal(readyToSubmit(IDLE('count to 5 slowly'), 'count to 5 slowly'), true);
  assert.equal(readyToSubmit(IDLE(''), 'count to 5 slowly'), false);
  assert.equal(readyToSubmit(IDLE('/exit'), '/exit'), true);
});

test('permission prompt: "Yes, and don\'t ask again" is never taken for a decline', () => {
  const screen = [...BANNER, RULE, ' Bash command', '', '   rm -rf build', '', ' Do you want to proceed?',
    ' ❯ 1. Yes', '   2. Yes, and don\'t ask again for rm commands in /tmp/demo', '   3. No, and tell Claude what to do differently (esc)', ''].join('\n');
  const plan = planDialog(screen);
  assert.equal(plan.choice, '3. No, and tell Claude what to do differently (esc)');
  assert.deepEqual(plan.keys, [KEYS.down, KEYS.down, KEYS.enter]);
});

test('options with description rows: cursor index counts options only, cursor below moves up', () => {
  const screen = [RULE, ' Turn on the new status line?', '', '   1. Yes, turn it on', '      Shows usage in the footer', ' ❯ 2. Not now', '   3. Don\'t ask again', ''].join('\n');
  const plan = planDialog(screen);
  assert.deepEqual(plan.options, ['1. Yes, turn it on', '2. Not now', '3. Don\'t ask again']);
  assert.equal(plan.cursor, 1);
  assert.equal(plan.choice, '2. Not now');
  assert.deepEqual(plan.keys, [KEYS.enter]);
});

test('dialog with no declining option gets Esc; the survey gets its dismiss key', () => {
  const noDecline = [RULE, ' Make auto mode your default permission mode?', '', ' ❯ Yes, set it', '   Yes, and tell me more', ''].join('\n');
  assert.deepEqual(planDialog(noDecline).keys, [KEYS.esc]);
  const survey = IDLE().replace('  NEED YOU', '● How is Claude doing this session? (optional)\n  1: Bad    2: Fine   3: Good   0: Dismiss\n  NEED YOU');
  assert.deepEqual(planDialog(survey).keys, ['0']);
});

test('settings guard: restores permissions and enabledPlugins, reports other keys, flags the run', () => {
  const before = { model: 'opus', permissions: { defaultMode: 'bypassPermissions' }, enabledPlugins: { 'nebi-beacon@nebi': true } };
  const after = { model: 'sonnet', permissions: { defaultMode: 'auto' }, enabledPlugins: { 'nebi-beacon@nebi': true, 'x@y': true }, newKey: 1 };
  const cmp = compareSettings(before, after);
  assert.equal(cmp.failed, true);
  assert.deepEqual(cmp.guardedDiff, ['permissions.defaultMode: "bypassPermissions" -> "auto"', 'enabledPlugins.x@y: (absent) -> true']);
  assert.deepEqual(cmp.otherChangedKeys, ['model', 'newKey']);
  assert.deepEqual(cmp.restored, { ...after, permissions: before.permissions, enabledPlugins: before.enabledPlugins });
  assert.deepEqual(compareSettings(before, structuredClone(before)), { failed: false, guardedDiff: [], otherChangedKeys: [], restored: null });
});

test('settings guard on disk: writes back only the guarded keys and leaves an unchanged file alone', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mod-verify-guard-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json');
  const quiet = path.join(dir, 'quiet.json');
  fs.writeFileSync(file, JSON.stringify({ permissions: { defaultMode: 'bypassPermissions' }, theme: 'light' }, null, 2) + '\n');
  fs.writeFileSync(quiet, '{"a": 1}\n');
  const snaps = snapshotSettings([file, quiet, path.join(dir, 'missing.json')]);
  fs.writeFileSync(file, JSON.stringify({ permissions: { defaultMode: 'auto' }, theme: 'dark', skipAutoModeOffer: true }, null, 2) + '\n');
  const report = enforceSettings(snaps);
  assert.equal(report.failed, true);
  assert.deepEqual(report.files[0].guardedDiff, ['permissions.defaultMode: "bypassPermissions" -> "auto"']);
  assert.equal(report.files[0].restored, true);
  assert.deepEqual(report.files[0].otherChangedKeys, ['skipAutoModeOffer', 'theme']);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { permissions: { defaultMode: 'bypassPermissions' }, theme: 'dark', skipAutoModeOffer: true });
  assert.equal(report.files[1].restored, false);
  assert.equal(fs.readFileSync(quiet, 'utf8'), '{"a": 1}\n', 'untouched file keeps its bytes');
  assert.deepEqual(report.files[2], { file: path.join(dir, 'missing.json'), guardedDiff: [], otherChangedKeys: [], restored: false });
});

test('settings files: the CLAUDE_CONFIG_DIR copy is added when set', () => {
  assert.deepEqual(settingsFiles('/h', {}), ['/h/.claude/settings.json']);
  assert.deepEqual(settingsFiles('/h', { CLAUDE_CONFIG_DIR: '/h/.claude-b/' }), ['/h/.claude/settings.json', '/h/.claude-b/settings.json']);
});

test('render: headless Chrome keeps the mock keychain and basic password store flags', () => {
  const src = fs.readFileSync(new URL('../claude-home/skills/nebi-mod-verify/scripts/render.mjs', import.meta.url), 'utf8');
  const args = src.match(/spawn\(CHROME, \[([\s\S]*?)\]/)?.[1];
  assert.ok(args, 'render.mjs still launches Chrome with spawn(CHROME, [...])');
  const code = args.replace(/\/\/.*$/gm, '');
  for (const flag of ['--use-mock-keychain', '--password-store=basic']) {
    assert.ok(code.includes(`'${flag}'`), `${flag} is in the Chrome argument list`);
  }
});

test('run folder guard: refuses dot names, homes, repos and stray folders before any delete', (t) => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-mod-verify-out-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const home = path.join(temp, 'home');
  const repo = path.join(temp, 'repo');
  const runsRoot = path.join(home, '.cache/nebi-mod-verify/runs');
  const cwd = path.join(repo, 'src');
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(runsRoot, { recursive: true });
  const at = (args) => outputDir({ runsRoot, home, cwd, repoRoots: [repo], ...args });

  assert.deepEqual(at({ label: 'after' }), { dir: path.join(runsRoot, 'after') });
  for (const label of ['.', '..', '../..', 'a/b', '', '...']) assert.ok(at({ label }).error, `label ${JSON.stringify(label)}`);
  for (const out of ['.', '..', './', repo, cwd, home, temp, '/', runsRoot, path.dirname(runsRoot), '/Users/someone', '/home/someone']) {
    assert.ok(at({ out, label: 'after' }).error, `out ${out}`);
  }
  const stray = path.join(temp, 'notes');
  fs.mkdirSync(stray);
  fs.writeFileSync(path.join(stray, 'todo.md'), 'keep me\n');
  assert.match(at({ out: stray }).error, /not an earlier run/);
  const earlier = path.join(temp, 'earlier-run');
  fs.mkdirSync(earlier);
  fs.writeFileSync(path.join(earlier, 'meta.json'), '{}');
  assert.deepEqual(at({ out: earlier }), { dir: earlier });
  assert.deepEqual(at({ out: path.join(temp, 'new-run') }), { dir: path.join(temp, 'new-run') });
  assert.deepEqual(at({ out: 'here', label: 'after' }), { dir: path.join(cwd, 'here') }, 'a relative --out sits under the working folder');
});

test('check fails a run whose claude exited non-zero or whose session.full.txt is missing', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-mod-verify-check-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const run = (name, { exit, full = 'scrollback\n' }) => {
    const dir = path.join(temp, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ safeMode: true, ...(exit === undefined ? {} : { exit }) }));
    for (const scene of ['turn-end', 'mid-turn']) fs.writeFileSync(path.join(dir, `${scene}.txt`), '❓ Need you\n');
    if (full !== null) fs.writeFileSync(path.join(dir, 'session.full.txt'), full);
    return checkRun(dir).failures;
  };
  assert.deepEqual(run('clean', { exit: { code: 0 } }), []);
  assert.deepEqual(run('crashed', { exit: { code: 1 } }), ['exit: claude exited with 1']);
  assert.deepEqual(run('killed', { exit: { code: 'signal' } }), ['exit: claude exited with "signal"']);
  assert.deepEqual(run('no-exit', {}), ['exit: meta.json has no exit record']);
  assert.deepEqual(run('no-full', { exit: { code: 0 }, full: null }), ['session.full.txt is missing or unreadable']);
  const unreadable = path.join(temp, 'dir-full');
  fs.mkdirSync(unreadable);
  fs.mkdirSync(path.join(unreadable, 'session.full.txt'));
  fs.writeFileSync(path.join(unreadable, 'meta.json'), JSON.stringify({ safeMode: true, exit: { code: 0 } }));
  for (const scene of ['turn-end', 'mid-turn']) fs.writeFileSync(path.join(unreadable, `${scene}.txt`), '❓\n');
  assert.deepEqual(checkRun(unreadable).failures, ['session.full.txt is missing or unreadable']);
});
