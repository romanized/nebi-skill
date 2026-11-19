import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFileSync, chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'nebi-hooks-test-'));

function runHook(relativePath, home, input, env = {}) {
  const target = pathToFileURL(path.join(root, relativePath)).href;
  const bootstrap = [
    "import os from 'node:os';",
    "import { syncBuiltinESMExports } from 'node:module';",
    `os.homedir = () => ${JSON.stringify(home)};`,
    'syncBuiltinESMExports();',
    'process.exit = (code = 0) => { process.exitCode = code; };',
    `await import(${JSON.stringify(target)});`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', bootstrap], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function ledgerPath(home, sessionId) {
  return path.join(home, '.claude', 'nebi', 'ledgers', `${sessionId}.jsonl`);
}

function appendLedger(home, sessionId, entries) {
  const file = ledgerPath(home, sessionId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
}

function testUnknownToolResponseIsNotSuccess() {
  const home = path.join(fixtureRoot, 'unknown-response');
  runHook('claude-home/hooks/tool-ledger.mjs', home, {
    tool_name: 'Bash', session_id: 'unknown', tool_response: null,
  });
  const [entry] = readFileSync(ledgerPath(home, 'unknown'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(entry.ok, null);
}

function testLatestCommandControlsProofHeuristic() {
  const home = path.join(fixtureRoot, 'command-order');
  appendLedger(home, 'order', [
    { tool: 'Write', ok: true },
    { tool: 'Bash', ok: true },
    { tool: 'Bash', ok: false },
  ]);
  const output = runHook('claude-home/hooks/verify-before-stop.mjs', home, {
    session_id: 'order', last_assistant_message: '✅ Done',
  });
  assert.match(output, /command-order heuristic/i);

  appendLedger(home, 'known-success', [
    { tool: 'Write', ok: true },
    { tool: 'Bash', ok: true },
  ]);
  assert.equal(runHook('claude-home/hooks/verify-before-stop.mjs', home, {
    session_id: 'known-success', last_assistant_message: '✅ Done',
  }), '');
}

function testSessionEndPreservesNotesAndDoesNotInventCleanGitState() {
  const home = path.join(fixtureRoot, 'session-state');
  const cwd = path.join(fixtureRoot, 'project');
  const state = path.join(home, '.claude', 'nebi', 'current-work.md');
  mkdirSync(path.dirname(state), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(state, [
    `Project: project (${cwd})`,
    'Goal: Keep notes',
    'Last state: old',
    'Next step: verify',
    '',
    '## User notes',
    'Do not lose this.',
  ].join('\n'));
  const original = readFileSync(state, 'utf8');
  mkdirSync(path.join(cwd, '.git'), { recursive: true });

  const bin = path.join(fixtureRoot, 'fake-git-bin');
  mkdirSync(bin, { recursive: true });
  const fakeGit = path.join(bin, 'git');
  writeFileSync(fakeGit, '#!/usr/bin/env sh\ncase "$4" in\n  --show-toplevel) printf "%s\\n%s\\n" "$2" "$2/.git"; exit 0 ;;\n  --abbrev-ref) echo main; exit 0 ;;\nesac\nexit 1\n');
  chmodSync(fakeGit, 0o755);
  runHook('claude-home/hooks/session-end-state.mjs', home, { cwd, session_id: 'state' }, {
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  });
  const refreshed = readFileSync(state, 'utf8');
  assert.equal(refreshed, original, 'legacy intent must remain byte-identical');
  assert.match(refreshed, /## User notes\nDo not lose this\./);
  const projects = path.join(home, '.agents/nebi/projects');
  const sessions = path.join(projects, readdirSync(projects)[0], 'sessions');
  const observation = JSON.parse(readFileSync(path.join(sessions, readdirSync(sessions)[0]), 'utf8'));
  assert.equal(observation.dirty, null, 'failed git status must not become a clean-state claim');
  assert.equal(observation.head, null);
  assert.equal(observation.branch, 'main');
  runHook('claude-home/hooks/session-end-state.mjs', home, { cwd, session_id: 'state' }, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.equal(readFileSync(state, 'utf8').split('<!--')[0], refreshed.split('<!--')[0], 'refresh must not accumulate blank lines');

  const other = path.join(fixtureRoot, 'other');
  writeFileSync(state, `Project: other (${other})\nGoal: leave me alone\n`);
  runHook('claude-home/hooks/session-end-state.mjs', home, { cwd, session_id: 'mismatch' });
  assert.equal(readFileSync(state, 'utf8'), `Project: other (${other})\nGoal: leave me alone\n`);
}

function testStatuslineDoesNotDemandFixedHandoffThreshold() {
  const output = runHook('claude-home/nebi/statusline.mjs', path.join(fixtureRoot, 'statusline'), {
    context_window: { used_percentage: 75, context_window_size: 200000 },
  });
  assert.match(output, /ctx 75%/);
  assert.doesNotMatch(output, /hand off|fresh session/i);
}

function testSteerOperatorDenyIsPreserved() {
  const home = path.join(fixtureRoot, 'steer-stop');
  const stop = path.join(home, '.claude', 'nebi', 'AGENT_STOP');
  mkdirSync(path.dirname(stop), { recursive: true });
  writeFileSync(stop, 'stop\n');
  const output = runHook('claude-home/hooks/steer-channel.mjs', home, {});
  assert.equal(JSON.parse(output).hookSpecificOutput.permissionDecision, 'deny');
}

function testStopNudgesEarlyStopsOnlyWhenNothingIsInFlight() {
  const home = path.join(fixtureRoot, 'early-stop');
  appendLedger(home, 'proven', [{ tool: 'Write', ok: true }, { tool: 'Bash', ok: true }]);
  const stop = (message, extra = {}) => runHook('claude-home/hooks/verify-before-stop.mjs', home, {
    session_id: 'proven', last_assistant_message: message, background_tasks: [], ...extra,
  });
  const early = /ends without ✅ Done or ❓ Need you/;

  assert.match(stop('Migrated two endpoints. Next I will update their tests.\n\n⏳ Working — updating the tests next'), early);
  assert.match(stop('Migrated two endpoints. Next I will update their tests.'), early, 'no status line is an early stop too');

  const build = { background_tasks: [{ id: 't1', type: 'shell', status: 'running', description: 'build' }] };
  assert.equal(stop('⏳ Working — waiting on the build', build), '', 'a ⏳ reply with work running is honest');
  const running = stop('✅ Done — build started', build);
  assert.match(running, /1 background task still running — wait for it and use its result before claiming done/);
  assert.doesNotMatch(running, early);

  assert.equal(stop('Tests pass on the migrated endpoints.\n\n✅ Done — ready for review'), '');
  assert.equal(stop('Two ways to split the table.\n\n❓ Need you — pick A or B'), '');
  assert.equal(stop('⏳ Working — updating the tests next', { stop_hook_active: true }), '', 'loop guard');
  assert.equal(stop('⏳ Working — next poll at 9:00', { session_crons: [{ id: 'c1', recurring: true }] }), '');
  assert.equal(stop('⏳ Working — updating the tests next', { background_tasks: undefined }), '', 'unknown task state stays silent');
}

const MAIN_CHROME = { label: 'Main Chrome', chromeProfile: 'Default', deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const SNEAKERS_CHROME = { label: 'RapidSneakers Chrome', chromeProfile: 'Profile 3', deviceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const ACCOUNT_A = { CLAUDE_CONFIG_DIR: '' };
const ACCOUNT_B = { CLAUDE_CONFIG_DIR: '/Users/someone/.claude-max2' };
const NO_ACCOUNT = { CLAUDE_CONFIG_DIR: '/Users/someone/.config/other-claude' };

// A home with both account defaults, a plain folder (account route) and a
// repository whose browser.json routes it to account b.
function routeFixture(name) {
  const home = path.join(fixtureRoot, name);
  mkdirSync(path.join(home, '.claude', 'nebi'), { recursive: true });
  writeFileSync(path.join(home, '.claude', 'nebi', 'browsers.json'), JSON.stringify({ version: 1, accounts: { a: MAIN_CHROME, b: SNEAKERS_CHROME } }));
  const plain = path.join(home, 'work', 'plain');
  const sneakers = path.join(home, 'work', 'sneakers');
  mkdirSync(plain, { recursive: true });
  mkdirSync(path.join(sneakers, '.git'), { recursive: true });
  mkdirSync(path.join(sneakers, '.claude'), { recursive: true });
  writeFileSync(path.join(sneakers, '.claude', 'browser.json'), JSON.stringify({ version: 1, ...SNEAKERS_CHROME, claudeAccount: 'b' }));
  return { home, plain, sneakers };
}

const beaconPath = (home, sessionId) => path.join(home, '.claude', 'nebi', 'beacons', `${sessionId}.json`);

function testStopIgnoresArtifactWatchersAndNudgesRealWorkOnlyOnDone() {
  const home = path.join(fixtureRoot, 'watchers');
  appendLedger(home, 'watch', [{ tool: 'Write', ok: true }, { tool: 'Bash', ok: true }]);
  const watchers = [
    { id: 'm1', type: 'monitor', status: 'running', description: 'live updates for artifact https://claude.ai/code/artifact/abc (publish)' },
    { id: 'm2', type: 'monitor', status: 'running', description: 'presence on artifact https://claude.ai/code/artifact/abc' },
  ];
  const workflow = { id: 'w1', type: 'local_workflow', status: 'running', description: 'mods rework' };
  const stop = (message, background_tasks) => runHook('claude-home/hooks/verify-before-stop.mjs', home, {
    session_id: 'watch', last_assistant_message: message, background_tasks,
  });

  assert.match(stop('Published the page.\n\n⏳ Working — wiring the comments next', watchers), /^.*Soft check \(§3\)/,
    'watcher-only + ⏳ gets the soft check, not a background-task nudge');
  assert.doesNotMatch(stop('⏳ Working — wiring the comments next', watchers), /background task still running/);
  assert.equal(stop('✅ Done — page published', watchers), '');
  assert.equal(stop('⏳ Working — waiting on the workflow', [...watchers, workflow]), '', 'real workflow + ⏳ stays silent');
  assert.equal(stop('❓ Need you — pick a name while the workflow runs', [...watchers, workflow]), '');
  assert.match(stop('✅ Done — all lanes merged', [...watchers, workflow]), /1 background task still running/,
    'real workflow + ✅ gets the nudge, counting only the workflow');
  const tail = { id: 'm3', type: 'monitor', status: 'running', description: 'tail the build log' };
  assert.match(stop('✅ Done', [tail]), /1 background task still running/, 'a Monitor-tool watcher is still work');
}

function testStopWritesHookBeaconOnlyWithoutFreshModBeacon() {
  const { home, plain } = routeFixture('hook-beacon');
  const file = beaconPath(home, 'sess-b');
  const stop = (message, env = ACCOUNT_A) => runHook('claude-home/hooks/verify-before-stop.mjs', home, {
    session_id: 'sess-b', cwd: plain, last_assistant_message: message, background_tasks: [],
  }, env);
  const read = () => JSON.parse(readFileSync(file, 'utf8'));

  const before = Date.now();
  stop('Shipped the segment.\n\n**✅ Done — status line reads beacons**');
  let beacon = read();
  assert.equal(beacon.version, 2);
  assert.equal(beacon.writer, 'hook');
  assert.equal(beacon.sessionId, 'sess-b');
  assert.equal(beacon.cwd, plain);
  assert.equal(beacon.project, 'plain');
  assert.equal(beacon.account, 'a');
  assert.deepEqual(beacon.browser, { deviceId: MAIN_CHROME.deviceId, label: 'Main Chrome' });
  assert.equal(beacon.kind, 'done');
  assert.equal(beacon.text, 'status line reads beacons');
  assert.ok(beacon.updatedAt >= before && beacon.updatedAt <= Date.now());
  assert.equal(beacon.heartbeatAt, undefined, 'a hook file has no heartbeat');
  assert.equal(beacon.ask, undefined);

  stop('Two ways to split it.\n\n❓ Need you — pick A or B', ACCOUNT_B);
  beacon = read();
  assert.equal(beacon.kind, 'need');
  assert.deepEqual(beacon.ask, { what: 'pick A or B' });
  assert.equal(typeof beacon.askedAt, 'number');
  assert.equal(beacon.account, 'b');
  assert.equal(beacon.browser.label, 'RapidSneakers Chrome');

  stop('Fixed it.\n\n✅ Done — \x1b[31mred\x1b[0m\u0007 text');
  assert.equal(read().text, 'red text', 'escape sequences and controls are stripped');
  stop('No status line here.');
  assert.equal(read().kind, 'missing');

  const mod = { version: 2, writer: 'mod', sessionId: 'sess-b', kind: 'working', text: 'busy', updatedAt: Date.now(), heartbeatAt: Date.now() };
  writeFileSync(file, JSON.stringify(mod));
  stop('✅ Done — the mod owns this file');
  assert.deepEqual(read(), mod, 'a fresh mod beacon is left alone');

  writeFileSync(file, JSON.stringify({ ...mod, heartbeatAt: Date.now() - 120_000 }));
  stop('✅ Done — the mod went quiet');
  assert.equal(read().writer, 'hook', 'a mod beacon past 90 s is replaced');

  // An open ask survives a turn a task notification started, and clears on Nebi's own prompt.
  const transcript = path.join(home, 'transcript.jsonl');
  const prompt = (kind, content) => appendFileSync(transcript, `${JSON.stringify({ type: 'user', origin: { kind }, message: { role: 'user', content } })}\n`);
  const turn = (message) => runHook('claude-home/hooks/verify-before-stop.mjs', home, {
    session_id: 'sess-b', cwd: plain, transcript_path: transcript, last_assistant_message: message, background_tasks: [],
  }, ACCOUNT_A);
  prompt('human', 'split the table');
  turn('❓ Need you — pick A or B');
  const asked = read();
  appendFileSync(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } })}\n`);
  prompt('task-notification', '<task-notification>build finished</task-notification>');
  turn('✅ Done — build finished');
  assert.equal(read().kind, 'need', 'a background turn does not close the ask');
  assert.deepEqual(read().ask, { what: 'pick A or B' });
  assert.equal(read().askedAt, asked.askedAt, 'the wait keeps its start');
  prompt('human', 'A');
  turn('✅ Done — split into A');
  assert.equal(read().kind, 'done');
  assert.equal(read().ask, undefined, 'Nebi answering closes the ask');

  runHook('claude-home/hooks/verify-before-stop.mjs', home, {
    session_id: 'sub', agent_id: 'agent-1', cwd: plain, last_assistant_message: '✅ Done',
  });
  assert.equal(existsSync(beaconPath(home, 'sub')), false, 'sub-agents write no beacon');
}

function testStopWritesNoHookBeaconInAVerificationSession() {
  const { home, plain } = routeFixture('hook-beacon-verify');
  const stop = (sessionId, env) => runHook('claude-home/hooks/verify-before-stop.mjs', home, {
    session_id: sessionId, cwd: plain, last_assistant_message: '❓ Need you — add a test for hello.py in demo? Yes or no', background_tasks: [],
  }, { ...ACCOUNT_A, ...env });

  assert.equal(stop('verify-1', { NEBI_VERIFY: '1' }), '');
  assert.equal(existsSync(beaconPath(home, 'verify-1')), false, 'a verification session writes no beacon');
  stop('verify-0', { NEBI_VERIFY: '0' });
  assert.equal(existsSync(beaconPath(home, 'verify-0')), true, 'only NEBI_VERIFY=1 silences it');
}

function testSessionEndDeletesOnlyItsOwnHookBeacon() {
  const home = path.join(fixtureRoot, 'beacon-end');
  const cwd = path.join(home, 'work');
  mkdirSync(cwd, { recursive: true });
  mkdirSync(path.dirname(beaconPath(home, 'x')), { recursive: true });
  const hook = (sessionId) => JSON.stringify({ version: 2, writer: 'hook', sessionId, kind: 'done', updatedAt: Date.now() });
  writeFileSync(beaconPath(home, 'end-1'), hook('end-1'));
  writeFileSync(beaconPath(home, 'end-3'), hook('end-3'));
  writeFileSync(beaconPath(home, 'end-2'), JSON.stringify({ version: 2, writer: 'mod', sessionId: 'end-2', kind: 'idle', heartbeatAt: Date.now() }));

  runHook('claude-home/hooks/session-end-state.mjs', home, { cwd, session_id: 'end-1' });
  assert.equal(existsSync(beaconPath(home, 'end-1')), false);
  assert.equal(existsSync(beaconPath(home, 'end-3')), true, 'another session keeps its beacon');
  runHook('claude-home/hooks/session-end-state.mjs', home, { cwd, session_id: 'end-2' });
  assert.equal(existsSync(beaconPath(home, 'end-2')), true, 'a mod beacon is the mod\'s to delete');
}

function testSessionStartNamesTheProjectBrowser() {
  const { home, plain, sneakers } = routeFixture('start-route');
  const context = (cwd, env) => JSON.parse(runHook('claude-home/hooks/session-start.mjs', home, { cwd, session_id: 'start' }, env))
    .hookSpecificOutput.additionalContext;

  const onA = context(plain, ACCOUNT_A);
  assert.ok(onA.includes(`Browser: Main Chrome (Chrome profile Default, device ${MAIN_CHROME.deviceId}, account a). Use select_browser with this device. Call switch_browser only when the user asks this turn to pair or switch browsers, because it sends a pairing request to every Chrome. Don't ask which browser to use.`), onA);
  assert.doesNotMatch(onA, /mismatch/i);

  const wrong = context(sneakers, ACCOUNT_A);
  assert.ok(wrong.includes(`Browser: RapidSneakers Chrome (Chrome profile Profile 3, device ${SNEAKERS_CHROME.deviceId}, account b).`), wrong);
  assert.match(wrong, /Account mismatch: this project runs on Claude account b, but this session is on account a\. .*claude-omer/);
  assert.doesNotMatch(context(sneakers, ACCOUNT_B), /mismatch/i);
  assert.doesNotMatch(context(plain, NO_ACCOUNT), /Browser:/, 'no route, no browser line');
}

function testSessionStartRoutesToCodexBrowserFromAnyAccount() {
  const { home, plain, sneakers } = routeFixture('start-codex');
  const codexId = 'a2ecff6d-98ef-462e-b499-5e053713a0e3';
  writeFileSync(path.join(sneakers, '.claude', 'browser.json'), JSON.stringify({ version: 1, ...SNEAKERS_CHROME, codexBrowserId: codexId, claudeAccount: 'b' }));
  const context = (cwd, env) => JSON.parse(runHook('claude-home/hooks/session-start.mjs', home, { cwd, session_id: 'start' }, env))
    .hookSpecificOutput.additionalContext;

  const wrong = context(sneakers, ACCOUNT_A);
  assert.ok(wrong.includes(`Browser: RapidSneakers Chrome (Chrome profile Profile 3). Drive it with the codex-browser skill: cua.getBrowser({ extensionInstanceId: "${codexId}" }).`), wrong);
  assert.ok(wrong.includes(`Claude in Chrome, when Nebi wants its side panel: RapidSneakers Chrome (Chrome profile Profile 3, device ${SNEAKERS_CHROME.deviceId}, account b).`), wrong);
  assert.match(wrong, /Account mismatch: .*Use codex-browser for browser work here\./);
  assert.doesNotMatch(wrong, /Do no browser work/, 'a codex route never stops browser work on the wrong account');
  assert.doesNotMatch(context(plain, ACCOUNT_A), /codex-browser/, 'routes without codexBrowserId keep the old line');
}

function testSteerChannelKeepsChromeOnTheProjectBrowser() {
  const { home, plain, sneakers } = routeFixture('steer-browser');
  const call = (tool, tool_input = {}, extra = {}, env = ACCOUNT_A) => runHook('claude-home/hooks/steer-channel.mjs', home, {
    tool_name: `mcp__claude-in-chrome__${tool}`, tool_input, cwd: plain, ...extra,
  }, env);
  const decision = (output) => JSON.parse(output).hookSpecificOutput;

  const pairing = decision(call('switch_browser'));
  assert.equal(pairing.permissionDecision, 'deny');
  assert.equal(pairing.permissionDecisionReason,
    `switch_browser pops a pairing request in every Chrome. Call select_browser with deviceId ${MAIN_CHROME.deviceId} (Main Chrome) instead.`);
  const other = decision(call('select_browser', { deviceId: SNEAKERS_CHROME.deviceId }));
  assert.equal(other.permissionDecision, 'deny');
  assert.equal(other.permissionDecisionReason,
    `This project uses Main Chrome (${MAIN_CHROME.deviceId}). Call select_browser with deviceId ${MAIN_CHROME.deviceId} instead. If Nebi wants another browser, ask him in one plain sentence: his reply lets you switch.`);
  assert.equal(call('select_browser', { deviceId: MAIN_CHROME.deviceId.toUpperCase() }), '', 'the project device passes');
  assert.equal(call('navigate', { url: 'https://example.com' }), '');
  assert.equal(call('list_connected_browsers'), '');

  assert.match(decision(call('select_browser', { deviceId: MAIN_CHROME.deviceId }, { cwd: sneakers }, ACCOUNT_B)).permissionDecisionReason,
    /This project uses RapidSneakers Chrome \(bbbbbbbb-/, 'the project file wins');
  assert.equal(call('switch_browser', {}, {}, NO_ACCOUNT), '', 'no route: everything passes');

  const transcript = path.join(home, 'transcript.jsonl');
  writeFileSync(transcript, [
    { type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: 'pair the rapidsneakers browser please' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Pairing.' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
  ].map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  assert.equal(call('switch_browser', {}, { transcript_path: transcript }), '', 'Nebi asked to pair this turn');
  assert.equal(call('select_browser', { deviceId: SNEAKERS_CHROME.deviceId }, { transcript_path: transcript }), '');
  appendFileSync(transcript, `${JSON.stringify({ type: 'user', origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification>switch the browser</task-notification>' } })}\n`);
  assert.equal(decision(call('switch_browser', {}, { transcript_path: transcript })).permissionDecision, 'deny',
    'a task notification is not Nebi asking');
  assert.equal(decision(call('switch_browser', {}, { transcript_path: path.join(home, 'missing.jsonl') })).permissionDecision, 'deny',
    'an unreadable transcript stays strict');

  // nebi-browser's other two allowances, for select_browser only.
  const lines = (...entries) => entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
  const own = (content) => ({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content } });
  writeFileSync(transcript, lines(own('nope wrong browser, do it in my main chrome')));
  assert.equal(call('select_browser', { deviceId: SNEAKERS_CHROME.deviceId }, { transcript_path: transcript }), '', 'naming a browser opens select_browser');
  assert.equal(decision(call('switch_browser', {}, { transcript_path: transcript })).permissionDecision, 'deny', 'but not switch_browser');
  writeFileSync(transcript, lines(own('click the login button in the browser')));
  assert.equal(decision(call('select_browser', { deviceId: SNEAKERS_CHROME.deviceId }, { transcript_path: transcript })).permissionDecision, 'deny',
    '"in the browser" names no browser');

  const refusal = [
    own('check the order page'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'sb1', name: 'mcp__claude-in-chrome__select_browser', input: { deviceId: SNEAKERS_CHROME.deviceId } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'sb1', is_error: true, content: other.permissionDecisionReason }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Do you want the RapidSneakers Chrome?' }] } },
  ];
  writeFileSync(transcript, lines(...refusal, own('yes')));
  assert.equal(call('select_browser', { deviceId: SNEAKERS_CHROME.deviceId }, { transcript_path: transcript }), '', 'his reply after a refusal opens select_browser');
  writeFileSync(transcript, lines(...refusal, own('yes'), own('now the cart')));
  assert.equal(decision(call('select_browser', { deviceId: SNEAKERS_CHROME.deviceId }, { transcript_path: transcript })).permissionDecision, 'deny',
    'only the first reply after the refusal');
}

function testSteerNoteIsTheLeadsOnly() {
  const home = path.join(fixtureRoot, 'steer-note');
  const note = path.join(home, '.claude', 'nebi', 'STEER.md');
  mkdirSync(path.dirname(note), { recursive: true });
  writeFileSync(note, 'use the staging database\n');
  assert.equal(runHook('claude-home/hooks/steer-channel.mjs', home, { tool_name: 'Bash', agent_id: 'sub-1' }), '', 'a sub-agent gets no note');
  assert.equal(existsSync(note), true, 'and leaves it for the lead');
  const lead = JSON.parse(runHook('claude-home/hooks/steer-channel.mjs', home, { tool_name: 'Bash' })).hookSpecificOutput;
  assert.match(lead.additionalContext, /use the staging database/);
  assert.equal(existsSync(note), false);
  assert.equal(existsSync(path.join(home, '.claude', 'nebi', 'STEER.consumed.md')), true);
}

test.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
test('stop hook ignores artifact watchers and nudges real work only on ✅', testStopIgnoresArtifactWatchersAndNudgesRealWorkOnlyOnDone);
test('stop hook writes a hook beacon only when no fresh mod beacon exists', testStopWritesHookBeaconOnlyWithoutFreshModBeacon);
test('stop hook writes no hook beacon when NEBI_VERIFY=1', testStopWritesNoHookBeaconInAVerificationSession);
test('session end deletes only its own hook beacon', { skip: process.platform === 'win32' }, testSessionEndDeletesOnlyItsOwnHookBeacon);
test('session start names the project browser and warns on an account mismatch', testSessionStartNamesTheProjectBrowser);
test('session start routes to codex-browser from any account when the route names one', testSessionStartRoutesToCodexBrowserFromAnyAccount);
test('steer channel keeps Claude in Chrome on the project browser', testSteerChannelKeepsChromeOnTheProjectBrowser);
test('steer note goes to the lead, never a sub-agent', testSteerNoteIsTheLeadsOnly);
test('stop hook nudges early stops only when nothing is in flight', testStopNudgesEarlyStopsOnlyWhenNothingIsInFlight);
test('unknown tool responses are not success', testUnknownToolResponseIsNotSuccess);
test('latest command controls the heuristic', testLatestCommandControlsProofHeuristic);
test('state refresh preserves notes and unavailable git evidence', { skip: process.platform === 'win32' }, testSessionEndPreservesNotesAndDoesNotInventCleanGitState);
test('a slow git identity lookup under load still records the session', { skip: process.platform === 'win32' }, () => {
  const home = path.join(fixtureRoot, 'slow-identity');
  const cwd = path.join(fixtureRoot, 'slow-project');
  mkdirSync(path.join(cwd, '.git'), { recursive: true });
  const bin = path.join(fixtureRoot, 'slow-git-bin');
  mkdirSync(bin, { recursive: true });
  const fakeGit = path.join(bin, 'git');
  // 500 ms on the identity call alone: slower than the old 400 ms budget.
  writeFileSync(fakeGit, '#!/usr/bin/env sh\ncase "$4" in\n  --show-toplevel) sleep 0.5; printf "%s\\n%s\\n" "$2" "$2/.git"; exit 0 ;;\n  --abbrev-ref) echo main; exit 0 ;;\nesac\nexit 1\n');
  chmodSync(fakeGit, 0o755);
  runHook('claude-home/hooks/session-end-state.mjs', home, { cwd, session_id: 'slow' }, { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  const projects = path.join(home, '.agents/nebi/projects');
  const sessions = path.join(projects, readdirSync(projects)[0], 'sessions');
  assert.equal(JSON.parse(readFileSync(path.join(sessions, readdirSync(sessions)[0]), 'utf8')).branch, 'main');
});
test('statusline does not demand handoff at a fixed threshold', testStatuslineDoesNotDemandFixedHandoffThreshold);
test('operator stop still denies tools', testSteerOperatorDenyIsPreserved);
test('documented PostToolUse success and PostToolUseFailure payloads drive ledger order', () => {
  const home = path.join(fixtureRoot, 'official-events');
  const session_id = 'official';
  runHook('claude-home/hooks/tool-ledger.mjs', home, { session_id, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_response: { filePath: 'sample.mjs' } });
  runHook('claude-home/hooks/tool-ledger.mjs', home, { session_id, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: 'tests passed', stderr: '', interrupted: false, isImage: false } });
  assert.equal(runHook('claude-home/hooks/verify-before-stop.mjs', home, { session_id, last_assistant_message: 'Done' }), '');
  runHook('claude-home/hooks/tool-ledger.mjs', home, { session_id, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'Command exited with non-zero status code 1', is_interrupt: false });
  assert.match(runHook('claude-home/hooks/verify-before-stop.mjs', home, { session_id, last_assistant_message: 'Done' }), /command-order heuristic/);
  const entries = readFileSync(ledgerPath(home, session_id), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(entries.map(e => e.ok), [true, true, false]);
});
test('skill loads are logged from Claude Skill calls and Codex reads of installed SKILL.md files only', () => {
  const home = path.join(fixtureRoot, 'skill-usage');
  const log = path.join(home, '.agents', 'nebi', 'skill-usage.jsonl');
  const steer = (input, env) => runHook('claude-home/hooks/steer-channel.mjs', home, { cwd: '/repo', ...input }, env);
  steer({ tool_name: 'Skill', tool_input: { skill: 'nebi-hillclimb' }, session_id: 's1' });
  steer({ tool_name: 'Skill', tool_input: { skill: 'nebi-hillclimb' }, session_id: 's1' });
  steer({ tool_name: 'Bash', tool_input: { command: "sed -n '1,200p' /Users/x/.agents/skills/nebi-debugging/SKILL.md" } });
  steer({ tool_name: 'Bash', tool_input: { command: 'rg -n gotcha /Users/x/.agents/skills/nebi-research/SKILL.md' } });
  steer({ tool_name: 'Bash', tool_input: { command: "sed -n '1,80p' claude-home/skills/nebi-orchestration/SKILL.md" } });
  steer({ tool_name: 'Bash', tool_input: { command: "nl -ba /Users/x/.agents/skills/nebi-sessions/SKILL.md | sed -n '1,200p'" } });
  steer({ tool_name: 'Bash', tool_input: { command: 'cat -n ~/.codex/skills/.system/imagegen/SKILL.md' } });
  steer({ tool_name: 'Read', tool_input: { file_path: '/Users/x/.claude/skills/nebi-sessions/SKILL.md' } });
  steer({ tool_name: 'Skill', tool_input: { skill: 'nebi-prompting' } }, { NEBI_SKILL_USAGE: 'off' });
  const entries = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(entries.map((e) => e.skill), ['nebi-hillclimb', 'nebi-hillclimb', 'nebi-debugging', 'nebi-sessions', 'imagegen']);
  assert.equal(entries[0].session, 's1');
  assert.equal(entries[0].cwd, '/repo');
  mkdirSync(path.join(home, '.claude', 'skills', 'nebi-hillclimb'), { recursive: true });
  writeFileSync(path.join(home, '.claude', 'skills', 'nebi-hillclimb', 'SKILL.md'), '---\nname: nebi-hillclimb\n---\n');
  mkdirSync(path.join(home, '.claude', 'skills', 'unused-skill'), { recursive: true });
  writeFileSync(path.join(home, '.claude', 'skills', 'unused-skill', 'SKILL.md'), '---\nname: unused-skill\n---\n');
  const out = spawnSync(process.execPath, [path.join(root, 'claude-home', 'nebi', 'skill-usage.mjs')], {
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
  }).stdout;
  assert.match(out, /1 {2}nebi-hillclimb/);
  assert.match(out, /never loaded in this window \(1\):\n {2}unused-skill/);
});

test('session hooks stay silent inside a plugin sidecall (TE_SIDECALL=1)', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'nebi-sidecall-'));
  try {
    for (const hook of ['session-start.mjs', 'verify-before-stop.mjs', 'session-end-state.mjs']) {
      const target = pathToFileURL(path.join(root, 'claude-home/hooks', hook)).href;
      const bootstrap = [
        "import os from 'node:os';",
        "import { syncBuiltinESMExports } from 'node:module';",
        `os.homedir = () => ${JSON.stringify(home)};`,
        'syncBuiltinESMExports();',
        `await import(${JSON.stringify(target)});`,
      ].join('\n');
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', bootstrap], {
        input: JSON.stringify({ session_id: 'side', cwd: home, last_assistant_message: 'done' }),
        encoding: 'utf8',
        env: { ...process.env, TE_SIDECALL: '1' },
      });
      assert.equal(result.status, 0, `${hook}: ${result.stderr}`);
      assert.equal(result.stdout, '', `${hook} must add nothing to a sidecall`);
    }
    assert.deepEqual(readdirSync(home), [], 'nothing written under home');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('an eval run (NEBI_EVAL=1) keeps the session-start context but records nothing', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'nebi-eval-'));
  try {
    const target = pathToFileURL(path.join(root, 'claude-home/hooks/session-start.mjs')).href;
    const bootstrap = [
      "import os from 'node:os';",
      "import { syncBuiltinESMExports } from 'node:module';",
      `os.homedir = () => ${JSON.stringify(home)};`,
      'syncBuiltinESMExports();',
      `await import(${JSON.stringify(target)});`,
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', bootstrap], {
      input: JSON.stringify({ session_id: 'eval', cwd: home }), encoding: 'utf8',
      env: { ...process.env, NEBI_EVAL: '1', TE_SIDECALL: '' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nebi claude runtime active/, 'routing context still injected');
    assert.equal(existsSync(path.join(home, '.agents', 'nebi', 'projects')), false, 'no checkpoint store written');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
