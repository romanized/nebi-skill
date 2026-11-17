import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-codex-runtime-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function fixture(name) {
  const home = path.join(temp, name);
  fs.cpSync(path.join(root, 'claude-home/hooks'), path.join(home, '.codex/hooks'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex/nebi'), { recursive: true });
  fs.copyFileSync(path.join(root, 'claude-home/nebi/context.mjs'), path.join(home, '.codex/nebi/context.mjs'));
  return home;
}

function run(home, script, input) {
  const url = pathToFileURL(path.join(home, '.codex/hooks', script)).href;
  const code = `import os from 'node:os';
import {syncBuiltinESMExports} from 'node:module';
os.homedir = () => ${JSON.stringify(home)};
syncBuiltinESMExports();
await import(${JSON.stringify(url)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
    input: JSON.stringify(input), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

test('Codex steering uses only the Codex runtime directory', () => {
  const home = fixture('steering');
  for (const client of ['.claude', '.codex']) fs.mkdirSync(path.join(home, client, 'nebi'), { recursive: true });
  const claudeNote = path.join(home, '.claude/nebi/STEER.md');
  fs.writeFileSync(claudeNote, 'Claude only');
  assert.equal(run(home, 'steer-channel.mjs', {}), null);
  assert.equal(fs.readFileSync(claudeNote, 'utf8'), 'Claude only');
  fs.writeFileSync(path.join(home, '.codex/nebi/STEER.md'), 'Codex only');
  assert.match(run(home, 'steer-channel.mjs', {}).hookSpecificOutput.additionalContext, /Codex only/);
  assert.equal(run(home, 'steer-channel.mjs', {}), null);
  fs.writeFileSync(path.join(home, '.codex/nebi/AGENT_STOP'), 'stop');
  assert.equal(run(home, 'steer-channel.mjs', {}).hookSpecificOutput.permissionDecision, 'deny');
});

test('Codex records apply_patch and never treats a failed or unknown Bash result as proof', () => {
  const home = fixture('evidence');
  const event = { session_id: 'proof', hook_event_name: 'PostToolUse' };
  run(home, 'tool-ledger.mjs', { ...event, tool_name: 'apply_patch', tool_response: 'Success. Updated the following files:\nM sample.txt' });
  for (const tool_response of [{ exit_code: 1 }, { stdout: 'maybe' }, { exit_code: 0 }]) {
    run(home, 'tool-ledger.mjs', { ...event, tool_name: 'Bash', tool_response });
  }
  const file = path.join(home, '.codex/nebi/ledgers/proof.jsonl');
  const entries = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(entries.map(e => e.ok), [true, false, null, true]);
  assert.equal(entries[0].tool, 'apply_patch');
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
  const stop = { session_id: 'proof', last_assistant_message: 'Done' };
  assert.equal(run(home, 'verify-before-stop.mjs', stop), null);
  run(home, 'tool-ledger.mjs', { ...event, tool_name: 'Bash', tool_response: { exit_code: 1 } });
  const warning = run(home, 'verify-before-stop.mjs', stop);
  assert.match(warning.systemMessage, /command-order heuristic/);
  assert.equal(warning.decision, undefined, 'a heuristic must not force continuation');
  assert.equal(warning.hookSpecificOutput, undefined, 'Codex Stop does not accept Claude Stop additionalContext');
});

test('Codex state refresh leaves Claude state and foreign Codex intent intact', () => {
  const home = fixture('state');
  for (const client of ['.claude', '.codex']) fs.mkdirSync(path.join(home, client, 'nebi'), { recursive: true });
  const claudeState = path.join(home, '.claude/nebi/current-work.md');
  fs.writeFileSync(claudeState, 'Project: [project]\nGoal: Claude work\n');
  run(home, 'session-end-state.mjs', { cwd: root, session_id: 'state' });
  assert.equal(fs.readFileSync(claudeState, 'utf8'), 'Project: [project]\nGoal: Claude work\n');
  const codexState = path.join(home, '.codex/nebi/current-work.md');
  assert.equal(fs.existsSync(codexState), false, 'shutdown no longer creates a global project note');
  const foreign = 'Project: /a/different/project\nGoal: Preserve me\n';
  fs.writeFileSync(codexState, foreign);
  run(home, 'session-end-state.mjs', { cwd: root });
  assert.equal(fs.readFileSync(codexState, 'utf8'), foreign);
});

test('startup uses the event directory and returns native additionalContext without writing state', () => {
  const home = fixture('startup');
  const output = run(home, 'session-start.mjs', { cwd: root });
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.hookSpecificOutput.additionalContext, /Nebi codex runtime active/);
  assert.ok(output.hookSpecificOutput.additionalContext.includes(root));
  assert.equal(fs.existsSync(path.join(home, '.codex/nebi/current-work.md')), false);
});

test('native raw command text stays unknown and does not cause repeated Codex stop warnings', () => {
  const home = fixture('unknown-native');
  const event = { session_id: 'native', hook_event_name: 'PostToolUse' };
  run(home, 'tool-ledger.mjs', { ...event, tool_name: 'apply_patch', tool_response: 'Success. Updated the following files:\nM file' });
  const stop = { session_id: 'native', last_assistant_message: 'Done' };
  assert.match(run(home, 'verify-before-stop.mjs', stop).systemMessage, /command-order heuristic/);
  // These are stdout, not a trusted status header; don't parse them as proof.
  run(home, 'tool-ledger.mjs', { ...event, tool_name: 'Bash', tool_response: 'Process exited with code 0\nTests passed!' });
  assert.equal(run(home, 'verify-before-stop.mjs', stop), null);
  const lines = fs.readFileSync(path.join(home, '.codex/nebi/ledgers/native.jsonl'), 'utf8').trim().split('\n');
  assert.equal(JSON.parse(lines.at(-1)).ok, null);
});
