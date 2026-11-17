import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-project-context-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function setup(name) {
  const home = path.join(temp, name);
  for (const client of ['.claude', '.codex']) {
    fs.cpSync(path.join(root, 'claude-home/hooks'), path.join(home, client, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(home, client, 'nebi'), { recursive: true });
    const context = path.join(root, 'claude-home/nebi/context.mjs');
    if (fs.existsSync(context)) fs.copyFileSync(context, path.join(home, client, 'nebi/context.mjs'));
  }
  return home;
}

function hook(home, client, name, input) {
  const result = spawnSync(process.execPath, [path.join(home, client, 'hooks', name)], {
    input: JSON.stringify(input), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('starting project B never points to project A global work note', () => {
  const home = setup('foreign-note');
  const a = path.join(home, 'a');
  const b = path.join(home, 'b');
  fs.mkdirSync(a); fs.mkdirSync(b);
  const legacy = path.join(home, '.claude/nebi/current-work.md');
  fs.writeFileSync(legacy, `Project: ${a}\nGoal: project A only\nLast state: in progress\nNext step: finish A\n`);
  const output = hook(home, '.claude', 'session-start.mjs', { cwd: b, session_id: 'b-session' });
  assert.ok(output, 'startup context must be emitted');
  assert.match(output, /Project: b \(/);
  assert.equal(output.includes(legacy), false, 'a global note must not be offered as this project’s context');
  assert.equal(output.includes('project A only'), false);
  assert.match(fs.readFileSync(legacy, 'utf8'), /project A only/);
});

function context(home, client, command, cwd, session, input, extra = []) {
  const args = [path.join(home, client, 'nebi/context.mjs'), command, '--cwd', cwd];
  if (session) args.push('--session', session);
  const result = spawnSync(process.execPath, [...args, ...extra], {
    input: input ? JSON.stringify(input) : undefined, encoding: 'utf8',
    env: { ...process.env, CODEX_THREAD_ID: '', CLAUDE_SESSION_ID: '' },
  });
  return { ...result, value: result.stdout ? JSON.parse(result.stdout) : null };
}
function checkpoint(goal, expectedRevision = null) {
  return { expectedRevision, goal, lastState: 'Implemented; tests still pending', nextStep: 'Run the focused proof', notes: 'Keep the accepted design.' };
}

test('same-name projects and concurrent tasks have separate notes; both clients see the shared overview', () => {
  const home = setup('isolation');
  const a = path.join(home, 'one', 'shop');
  const b = path.join(home, 'two', 'shop');
  fs.mkdirSync(a, { recursive: true }); fs.mkdirSync(b, { recursive: true });
  const first = context(home, '.codex', 'save', a, 'alpha', checkpoint('Fix checkout'));
  const second = context(home, '.claude', 'save', a, 'beta', checkpoint('Write the landing page'));
  const third = context(home, '.codex', 'save', b, 'alpha', checkpoint('A different shop'));
  for (const result of [first, second, third]) assert.equal(result.status, 0, result.stderr);
  assert.notEqual(first.value.file, second.value.file);
  assert.notEqual(first.value.file, third.value.file);
  assert.notEqual(first.value.checkpoint.projectId, third.value.checkpoint.projectId);
  assert.equal(context(home, '.codex', 'show', a, 'alpha').value.checkpoint.goal, 'Fix checkout');
  const overview = context(home, '.claude', 'list', a, null, null, ['--all']);
  assert.equal(overview.value.projects.length, 2);
  assert.equal(overview.value.projects.flatMap(p => p.tasks).length, 3);
  const fresh = context(home, '.claude', 'show', a, 'fresh').value;
  assert.equal(fresh.checkpoint, null, 'a fresh session must not silently adopt the latest other task');
  assert.equal(fresh.candidates.length, 2);
});

test('resume selection is session-local and stale writes are rejected with history preserved', () => {
  const home = setup('resume');
  const cwd = path.join(home, 'repo'); fs.mkdirSync(cwd);
  const initial = context(home, '.codex', 'save', cwd, 'original', checkpoint('Shared task')).value;
  const task = initial.checkpoint.taskId;
  const selected = context(home, '.claude', 'select', cwd, 'resumer', null, ['--task', task]);
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(selected.value.checkpoint.goal, 'Shared task');
  assert.equal(context(home, '.claude', 'show', cwd, 'unrelated').value.checkpoint, null);
  const updated = context(home, '.claude', 'save', cwd, 'resumer', checkpoint('Reviewed task', initial.revision));
  assert.equal(updated.status, 0, updated.stderr);
  const stale = context(home, '.codex', 'save', cwd, 'original', checkpoint('Stale overwrite', initial.revision));
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /changed since it was read/);
  assert.equal(context(home, '.codex', 'show', cwd, 'original').value.checkpoint.goal, 'Reviewed task');
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(initial.file), 'history', `${initial.revision}.json`), 'utf8')).goal, 'Shared task');
  const before = fs.readFileSync(initial.file, 'utf8');
  hook(home, '.claude', 'session-end-state.mjs', { cwd, session_id: 'resumer' });
  assert.equal(fs.readFileSync(initial.file, 'utf8'), before, 'shutdown facts must not rewrite authored intent');
  assert.equal(context(home, '.codex', 'show', cwd, 'x', null, ['--task', '../escape']).status, 1);
});

test('repository subdirectories and worktrees share project identity but keep checkout identity', () => {
  const home = setup('worktrees');
  const repo = path.join(home, 'repo'); fs.mkdirSync(repo);
  for (const args of [['init'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture']]) {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const subdir = path.join(repo, 'src'); fs.mkdirSync(subdir);
  const worktree = path.join(home, 'other-checkout');
  const added = spawnSync('git', ['-C', repo, 'worktree', 'add', '-b', 'other', worktree], { encoding: 'utf8' });
  assert.equal(added.status, 0, added.stderr);
  const a = context(home, '.codex', 'show', repo, 'a').value;
  const b = context(home, '.claude', 'show', subdir, 'b').value;
  const c = context(home, '.codex', 'show', worktree, 'c').value;
  assert.equal(a.project.id, b.project.id);
  assert.equal(a.project.id, c.project.id);
  assert.notEqual(a.project.checkout, c.project.checkout);
});

test('legacy import is non-destructive, idempotent and never guesses from a project name', () => {
  const home = setup('legacy');
  const cwd = path.join(home, 'repo'); fs.mkdirSync(cwd);
  const source = path.join(home, '.codex/nebi/current-work.md');
  const old = `Project: repo (${cwd})\nGoal: Old work\nLast state: paused\nNext step: validate\n\nAn important decision.\n`;
  fs.writeFileSync(source, old);
  const first = context(home, '.codex', 'migrate', cwd, null);
  assert.equal(first.value.status, 'imported-unverified');
  assert.equal(JSON.parse(fs.readFileSync(first.value.file, 'utf8')).status, 'unverified');
  assert.equal(fs.readFileSync(source, 'utf8'), old);
  assert.equal(context(home, '.codex', 'migrate', cwd, null).value.status, 'already-imported');
  fs.writeFileSync(path.join(home, '.claude/nebi/current-work.md'), 'Project: repo\nGoal: Ambiguous name\n');
  const unknown = context(home, '.claude', 'migrate', cwd, null);
  assert.equal(unknown.value.status, 'unassigned');
  const all = context(home, '.claude', 'list', cwd, null, null, ['--all']).value;
  assert.equal(all.projects[0].tasks.length, 1);
  assert.equal(all.unassignedLegacyNotes.length, 1);
});

test('simultaneous writers cannot both replace the same checkpoint revision', async () => {
  const home = setup('parallel');
  const cwd = path.join(home, 'repo'); fs.mkdirSync(cwd);
  const run = (client, goal) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(home, client, 'nebi/context.mjs'), 'save', '--cwd', cwd, '--task', 'one-task'], {
      env: { ...process.env, CODEX_THREAD_ID: '', CLAUDE_SESSION_ID: '' },
    });
    let stderr = '';
    child.stdout.resume(); child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject); child.on('close', status => resolve({ status, stderr }));
    child.stdin.end(JSON.stringify(checkpoint(goal)));
  });
  const results = await Promise.all([run('.claude', 'Claude change'), run('.codex', 'Codex change')]);
  assert.deepEqual(results.map(result => result.status).sort(), [0, 1]);
  assert.match(results.find(result => result.status === 1).stderr, /being updated|changed since it was read/);
  const record = context(home, '.codex', 'show', cwd, null, null, ['--task', 'one-task']).value.checkpoint;
  assert.ok(['Claude change', 'Codex change'].includes(record.goal));
});

test('subagent hook events cannot change the lead session observation', () => {
  const home = setup('child');
  const cwd = path.join(home, 'repo'); fs.mkdirSync(cwd);
  hook(home, '.claude', 'session-start.mjs', { cwd, session_id: 'lead' });
  const projects = path.join(home, '.agents/nebi/projects');
  const sessions = path.join(projects, fs.readdirSync(projects)[0], 'sessions');
  const file = path.join(sessions, fs.readdirSync(sessions)[0]);
  const before = fs.readFileSync(file, 'utf8');
  hook(home, '.claude', 'session-end-state.mjs', { cwd, session_id: 'lead', agent_id: 'child' });
  assert.equal(hook(home, '.claude', 'session-start.mjs', { cwd, session_id: 'lead', agent_id: 'child' }), '');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
