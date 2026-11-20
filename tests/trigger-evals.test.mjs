import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFiredSkills, gradeTranscript, parseTriggers, stageSkills, validateCases } from '../claude-home/nebi/run-trigger-evals.mjs';
const c = { skill: 'nebi-debugging', kind: 'not', prompt: 'write a heading' };
const stream = (...events) => events.map(JSON.stringify).join('\n');
const init = { type: 'system', subtype: 'init', skills: [c.skill] };
const say = { type: 'assistant', message: { content: [{ type: 'text', text: 'Reply' }] } };
const result = { type: 'result', subtype: 'success', is_error: false };
const invoke = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: c.skill } }] } };
test('only assistant Skill tool calls count; registry, quoted JSON and user/tool data do not', () => {
  assert.deepEqual([...detectFiredSkills(stream(init, { type: 'result', skill: c.skill }, { ...invoke, type: 'user' }))], []);
  assert.deepEqual([...detectFiredSkills(stream(init, invoke, result))], [c.skill]);
});
test('unavailable target, truncated stream and failed result are ERROR, never negative PASS', () => {
  for (const s of [stream(init), stream(result), stream({ ...init, skills: [] }, result), stream(init, { ...result, is_error: true })]) {
    assert.equal(gradeTranscript(s, c).status, 'ERROR');
  }
});
test('grades real invocation and non-invocation in both directions', () => {
  assert.equal(gradeTranscript(stream(init, say, result), c).status, 'PASS');
  assert.equal(gradeTranscript(stream(init, invoke, result), c).status, 'FAIL');
  assert.equal(gradeTranscript(stream(init, invoke, result), { ...c, kind: 'fire' }).status, 'PASS');
  assert.equal(gradeTranscript(stream(init, say, result), { ...c, kind: 'fire' }).status, 'FAIL');
});
test('parses both established trigger formats without trailing how-to steps', () => {
  assert.deepEqual(parseTriggers('## Must fire\n1. `fix it`\n## Must NOT fire\n1. "write it" (near miss)\n## How to run\n1. ignore'), { mustFire: ['fix it'], mustNotFire: ['write it'] });
});
test('CLI rejects invalid inputs instead of zero-case success', () => {
  for (const args of [['--limit', '0'], ['--timeout', 'NaN'], ['--unknown'], ['--skill'], ['--headless']]) {
    const r = spawnSync(process.execPath, ['claude-home/nebi/run-trigger-evals.mjs', ...args], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stdout);
  }
});
test('default list uses source pack without requiring deployment', () => {
  const r = spawnSync(process.execPath, ['claude-home/nebi/run-trigger-evals.mjs', '--list'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /11 skills/);
  assert.match(r.stdout, /claude-home[\\/]skills/, 'the list prints native paths, so either separator');
});
test('cross-skill rows fail on forbidden co-firing even when the target fires', () => {
  const other = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'nebi-prompting' } }] } };
  const graded = gradeTranscript(stream({ ...init, skills: [c.skill, 'nebi-prompting'] }, invoke, other, result), { ...c, kind: 'fire', forbiddenSkills: ['nebi-prompting'] });
  assert.equal(graded.status, 'FAIL');
  assert.match(graded.reason, /Forbidden co-fire/);
});

test('required co-fires are measured in one session; misspelled or contradictory names are errors', () => {
  const row = { ...c, kind: 'fire', requiredSkills: ['nebi-sessions'] };
  const visible = { ...init, skills: [c.skill, 'nebi-sessions'] };
  assert.equal(gradeTranscript(stream(visible, invoke, result), row).status, 'FAIL');
  assert.throws(() => validateCases([{ ...c, forbiddenSkills: ['nebi-typo'] }], [c.skill]), /Unknown/);
  assert.throws(() => validateCases([{ ...c, requiredSkills: [c.skill] }], [c.skill]), /Contradictory/);
});

test('truncated JSON or unknown assistant shape cannot pass a negative case', () => {
  for (const bad of ['{"type":"assistant",', JSON.stringify({ type: 'assistant', payload: [] })]) {
    assert.equal(gradeTranscript(stream(init, say, result) + '\n' + bad, c).status, 'ERROR');
  }
  assert.equal(gradeTranscript(stream(init, result), c).status, 'ERROR');
});

test('headless staging copies every installed skill, codex-browser and tikhub included, without evals', (t) => {
  const skills = fileURLToPath(new URL('../claude-home/skills/', import.meta.url));
  const staged = fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-trigger-stage-'));
  t.after(() => fs.rmSync(staged, { recursive: true, force: true }));
  const want = fs.readdirSync(skills).filter((dir) => fs.existsSync(path.join(skills, dir, 'SKILL.md'))).sort();
  assert.ok(want.includes('codex-browser') && want.includes('tikhub'));
  assert.deepEqual(Object.keys(stageSkills(skills, staged)).sort(), want);
  assert.deepEqual(fs.readdirSync(staged).sort(), want);
  for (const dir of want) assert.equal(fs.existsSync(path.join(staged, dir, 'evals')), false, dir);
});
