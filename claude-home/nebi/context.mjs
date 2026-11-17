#!/usr/bin/env node
// Local project/task context shared by both clients. Hooks own observations;
// only an explicit save owns intent. No global "current project" pointer.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HARNESS, HARNESS_HOME } from '../hooks/runtime.mjs';

export const STORE = path.join(path.dirname(HARNESS_HOME), '.agents', 'nebi');
const hash = value => createHash('sha256').update(value).digest('hex');
// Identity needs one spelling per directory. Git prints worktree paths through the
// OS realpath (Windows long names like runneradmin, true letter case); only the
// native realpath matches it, while fs.realpathSync keeps 8.3 names like RUNNER~1.
const canonical = value => fs.realpathSync.native(path.resolve(value));
const statuses = new Set(['active', 'blocked', 'done', 'cancelled', 'superseded', 'unverified']);
const now = () => new Date().toISOString();

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function json(file) {
  const text = read(file);
  return text === null ? null : JSON.parse(text);
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}
function locked(file, action) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Context is being updated: ${lock}. No checkpoint changed. Retry after the other writer finishes; if it crashed, inspect the lock's PID before removing it.`);
    throw error;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: now() }));
    return action();
  } finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }); }
}
// Identity decides which project a session belongs to, so it gets more time
// than the fact reads, which degrade to unknown and share one budget. Together
// (1.5s + 0.7s) they leave Node startup room inside Codex's 3s SessionEnd limit.
const IDENTITY_TIMEOUT_MS = 1500;
const FACT_TIMEOUT_MS = 400;
const FACTS_BUDGET_MS = 700;
function git(cwd, args, timeout = FACT_TIMEOUT_MS) {
  return spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8', timeout, maxBuffer: 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C' },
  });
}

export function identify(cwd) {
  const directory = canonical(cwd);
  const result = git(directory, ['rev-parse', '--show-toplevel', '--git-common-dir'], IDENTITY_TIMEOUT_MS);
  let checkout = directory, anchor = directory, isGit = false;
  if (result.status === 0) {
    const lines = result.stdout.trim().split('\n');
    if (lines.length !== 2) throw new Error('Git returned an invalid project identity; context was not reassigned.');
    checkout = canonical(lines[0]);
    anchor = canonical(path.resolve(directory, lines[1]));
    isGit = true;
  } else if (result.error || !result.stderr.includes('not a git repository')) {
    throw new Error('Could not identify the project reliably; context was not reassigned.');
  }
  const name = isGit ? path.basename(path.basename(anchor) === '.git' ? path.dirname(anchor) : anchor) : path.basename(anchor);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'project';
  return { id: `${slug}-${hash(`${isGit ? 'git' : 'folder'}:${anchor}`).slice(0, 16)}`, name, anchor, checkout, isGit };
}

function facts(project) {
  const deadline = Date.now() + FACTS_BUDGET_MS;
  const value = args => {
    const left = deadline - Date.now();
    if (left < 50) return null;
    const result = git(project.checkout, args, Math.min(FACT_TIMEOUT_MS, left));
    return result.status === 0 ? result.stdout.trim() : null;
  };
  if (!project.isGit) return { branch: null, head: null, dirty: null };
  const branch = value(['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = value(['rev-parse', 'HEAD']);
  const status = value(['status', '--porcelain']);
  return { branch, head, dirty: status === null ? null : Boolean(status) };
}
function validTask(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,100}$/.test(id)) throw new Error('Task id must contain only lowercase letters, numbers, underscores or hyphens.');
  return id;
}
function location(options = {}) {
  const project = identify(options.cwd || process.cwd());
  const directory = path.join(STORE, 'projects', project.id);
  const sessionKey = options.session ? `${HARNESS}-${hash(String(options.session)).slice(0, 24)}` : null;
  const sessionFile = sessionKey ? path.join(directory, 'sessions', `${sessionKey}.json`) : null;
  const observation = sessionFile ? json(sessionFile) : null;
  const taskId = options.task ? validTask(options.task) : observation?.taskId || sessionKey;
  const file = taskId ? path.join(directory, 'tasks', validTask(taskId), 'checkpoint.json') : null;
  return { project, directory, sessionKey, sessionFile, observation, taskId, file };
}
function register(scope) {
  fs.mkdirSync(scope.directory, { recursive: true });
  const file = path.join(scope.directory, 'project.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ version: 1, id: scope.project.id, name: scope.project.name, anchor: scope.project.anchor, createdAt: now() }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
}

export function observe(options, event) {
  const scope = location(options);
  if (!scope.sessionFile) return scope;
  register(scope);
  const snapshot = facts(scope.project);
  locked(scope.sessionFile, () => {
    const previous = json(scope.sessionFile);
    write(scope.sessionFile, {
      version: 1, harness: HARNESS, sessionKey: scope.sessionKey,
      taskId: previous?.taskId || scope.taskId, checkout: scope.project.checkout,
      ...snapshot, event, observedAt: now(),
    });
  });
  return scope;
}

function tasks(directory) {
  const dir = path.join(directory, 'tasks');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
    const file = path.join(dir, entry.name, 'checkpoint.json');
    const checkpoint = json(file);
    return checkpoint ? [{ ...checkpoint, file }] : [];
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function show(options = {}) {
  const scope = location(options);
  const raw = scope.file ? read(scope.file) : null;
  const checkpoint = raw === null ? null : JSON.parse(raw);
  const current = facts(scope.project);
  return {
    project: scope.project, sessionKey: scope.sessionKey, taskId: scope.taskId,
    file: scope.file, revision: raw === null ? null : hash(raw), checkpoint,
    handoffs: scope.taskId ? path.join(scope.directory, 'tasks', scope.taskId, 'handoffs') : null,
    current,
    checkoutChanged: Boolean(checkpoint && checkpoint.checkout !== scope.project.checkout),
    headChanged: Boolean(checkpoint?.head && current.head && checkpoint.head !== current.head),
    candidates: tasks(scope.directory).filter(task => task.taskId !== scope.taskId && !['done', 'cancelled', 'superseded'].includes(task.status))
      .sort((a, b) => Number(b.checkout === scope.project.checkout) - Number(a.checkout === scope.project.checkout))
      .slice(0, 5).map(({ taskId, goal, status, checkout, updatedAt, file }) => ({ taskId, goal, status, checkout, updatedAt, file })),
  };
}

export function save(options, input) {
  const scope = location(options);
  if (!scope.file) throw new Error('Saving requires --session or an explicit --task; there is no global active task.');
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.hasOwn(input, 'expectedRevision')) throw new Error('Provide JSON with expectedRevision from show (null for a new task).');
  for (const key of ['goal', 'lastState', 'nextStep']) {
    if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error(`${key} must be a nonempty string.`);
  }
  if (input.notes !== undefined && typeof input.notes !== 'string') throw new Error('notes must be a string.');
  register(scope);
  return locked(scope.file, () => {
    const old = read(scope.file);
    const revision = old === null ? null : hash(old);
    if (revision !== input.expectedRevision) throw new Error('Checkpoint changed since it was read. Reload show, reconcile the other writer’s changes, then save; nothing was overwritten.');
    const previous = old === null ? null : JSON.parse(old);
    const status = input.status || previous?.status || 'active';
    if (!statuses.has(status)) throw new Error('Unsupported task status.');
    if (old !== null) {
      const history = path.join(path.dirname(scope.file), 'history', `${revision}.json`);
      fs.mkdirSync(path.dirname(history), { recursive: true });
      if (!fs.existsSync(history)) fs.writeFileSync(history, old, { flag: 'wx', mode: 0o600 });
    }
    const checkpoint = {
      version: 1, projectId: scope.project.id, taskId: scope.taskId,
      checkout: scope.project.checkout, ...facts(scope.project),
      goal: input.goal, lastState: input.lastState, nextStep: input.nextStep,
      notes: input.notes ?? previous?.notes ?? '', status, updatedAt: now(), author: HARNESS,
    };
    write(scope.file, checkpoint);
    return { file: scope.file, revision: hash(read(scope.file)), checkpoint };
  });
}

export function select(options) {
  if (!options.session || !options.task) throw new Error('select requires both --session and --task.');
  const scope = location(options);
  if (!json(scope.file)) throw new Error('That task does not exist in this project.');
  locked(scope.sessionFile, () => write(scope.sessionFile, {
    ...json(scope.sessionFile), harness: HARNESS, sessionKey: scope.sessionKey,
    taskId: scope.taskId, checkout: scope.project.checkout, selectedAt: now(),
  }));
  return show({ ...options, task: undefined });
}

export function list(options = {}) {
  const directories = options.all
    ? (fs.existsSync(path.join(STORE, 'projects')) ? fs.readdirSync(path.join(STORE, 'projects')).map(name => path.join(STORE, 'projects', name)) : [])
    : [location(options).directory];
  const projects = directories.flatMap(directory => {
    const project = json(path.join(directory, 'project.json'));
    if (!project) return [];
    return [{ ...project, tasks: tasks(directory).map(({ taskId, goal, lastState, nextStep, status, checkout, updatedAt, file }) => ({ taskId, goal, lastState, nextStep, status, checkout, updatedAt, file })) }];
  });
  const inbox = path.join(STORE, 'inbox');
  return { projects, unassignedLegacyNotes: options.all && fs.existsSync(inbox) ? fs.readdirSync(inbox).filter(name => name.endsWith('.json')).map(name => path.join(inbox, name)) : [] };
}

export function migrate(options = {}) {
  const source = path.join(HARNESS_HOME, 'nebi', 'current-work.md');
  const content = read(source);
  if (!content) return { status: 'absent', source };
  const lines = content.split(/\r?\n/);
  const field = label => lines.find(line => line.startsWith(`${label}:`))?.slice(label.length + 1).trim() || '';
  const label = field('Project');
  if (!label || label.startsWith('[')) return { status: 'empty-template', source };
  const recorded = path.isAbsolute(label) ? label : label.match(/\((\/(?:.*)|[A-Za-z]:[\\/].*)\)\s*$/)?.[1];
  const cwd = options.project || recorded;
  const id = `legacy-${HARNESS}-${hash(content).slice(0, 16)}`;
  if (!cwd || !fs.existsSync(cwd)) {
    const file = path.join(STORE, 'inbox', `${id}.json`);
    if (!fs.existsSync(file)) write(file, { source, projectLabel: label, content, importedAt: now() });
    return { status: 'unassigned', file, source };
  }
  const task = { cwd, task: id };
  const existing = show(task);
  if (existing.checkpoint) return { status: 'already-imported', file: existing.file, source };
  const result = save(task, {
    expectedRevision: null, goal: field('Goal') || '[legacy goal missing]',
    lastState: field('Last state') || '[legacy state missing]', nextStep: field('Next step') || '[legacy next step missing]',
    status: 'unverified', notes: `Imported from ${source}; not reverified. Original preserved.\n\n${lines.slice(4).join('\n')}`,
  });
  return { status: 'imported-unverified', file: result.file, source };
}

function main() {
  const args = process.argv.slice(2);
  const command = args.shift() || 'help';
  if (['help', '--help', '-h'].includes(command)) {
    console.log('Usage: node context.mjs show|list|save|select|migrate [--cwd PATH] [--session ID] [--task ID] [--all] [--project PATH]');
    console.log('show/list are read-only. save takes JSON on stdin: expectedRevision, goal, lastState, nextStep, optional notes/status. select binds only this session. migrate copies the old note, never removes it; --project explicitly maps a legacy note lacking a path.');
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') options.all = true;
    else if (['--cwd', '--session', '--task', '--project'].includes(args[i]) && args[i + 1]) options[args[i].slice(2)] = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  options.session ||= HARNESS === 'codex' ? process.env.CODEX_THREAD_ID : process.env.CLAUDE_SESSION_ID;
  const actions = { show, list, select, migrate, save: opts => save(opts, JSON.parse(fs.readFileSync(0, 'utf8'))) };
  if (!actions[command]) throw new Error(`Unknown command: ${command}`);
  console.log(JSON.stringify(actions[command](options), null, 2));
}
// Node builds import.meta.url with fs.realpathSync, so the entry check must too.
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
