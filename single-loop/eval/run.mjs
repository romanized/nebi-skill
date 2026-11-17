#!/usr/bin/env node
// Run the nebi fleet eval as one variant and write rows compare.py reads.
//
//   node run.mjs --variant baseline --work <scratch dir> --earshot <clone> --te <clone>
//                [--reps 2] [-j 3] [--deny nebi-scout,nebi-checker] [--only s1,c2]
//                [--model claude-opus-5-5] [--timeout-min 25] [--out ../results]
//   node run.mjs --regrade --variant <name> --work <scratch dir>   (re-grade stored runs)
//
// Each (task, rep) gets a fresh fixture (fixture.mjs) and one headless session:
// `claude -p <prompt> --model <id> --output-format stream-json --verbose
//  --permission-mode bypassPermissions [--disallowedTools "Agent(<name>)" ...]`
// run from the fixture directory with the user's real global setup (core, skills,
// agents, hooks, mods), so routing is the real lead's. Rows land in
// <out>/<variant>/results.jsonl, one per (task, rep), plus meta.json.
//
// Gotchas:
// - "Folding" an agent here means denying it with Agent(<name>) (documented in
//   code.claude.com/docs/en/sub-agents, "Disable specific subagents"). The core still
//   names the agent, so a folded variant scores "agent unavailable", not "agent never
//   existed". PLAN.md records this limit.
// - Sub-agent tokens are read from the session's transcript folder
//   (<projects>/<cwd slug>/<session>/subagents/**/agent-*.jsonl), not from the stream,
//   which does not carry background agents' usage.
// - in_tokens/out_tokens come from the result event's modelUsage (every model in the
//   session, sub-agents and helper models included); in_tokens is effective input
//   (input + cache read + cache write), dominated by cache reads, not a price.
// - by_agent[x].calls is model calls, .invocations how often the agent was started;
//   the per-agent split comes from transcripts and misses helper models such as
//   web-fetch's, which the totals include.
// - The Nebi output style appends a status line to every answer; graders ignore it.
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildFixture } from './fixture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECTS = join(homedir(), '.claude', 'projects');

function parseArgs(argv) {
  const a = { reps: 2, j: 3, deny: [], only: null, model: 'claude-opus-5-5', timeoutMin: 25, out: resolve(HERE, '..', 'results') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--variant') a.variant = v();
    else if (k === '--work') a.work = resolve(v());
    else if (k === '--earshot') a.earshot = resolve(v());
    else if (k === '--te') a.te = resolve(v());
    else if (k === '--reps') a.reps = Number(v());
    else if (k === '-j') a.j = Number(v());
    else if (k === '--deny') a.deny = v().split(',').filter(Boolean);
    else if (k === '--only') a.only = new Set(v().split(','));
    else if (k === '--model') a.model = v();
    else if (k === '--timeout-min') a.timeoutMin = Number(v());
    else if (k === '--out') a.out = resolve(v());
    else throw new Error(`unknown argument ${k}`);
  }
  for (const req of ['variant', 'work', 'earshot', 'te']) if (!a[req]) throw new Error(`--${req} is required`);
  return a;
}

const slug = (p) => realpathSync(p).replace(/[^A-Za-z0-9]/g, '-');

function usageOf(lines) {
  const byId = new Map();
  for (const d of lines) {
    const m = d.message;
    if (d.type === 'assistant' && m && m.usage) byId.set(m.id || d.uuid, m.usage);
  }
  let input = 0, output = 0, peak = 0;
  for (const u of byId.values()) {
    const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    input += ctx; output += u.output_tokens || 0; peak = Math.max(peak, ctx);
  }
  return { calls: byId.size, input, output, peak };
}

function readJsonl(path) {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function subagents(cwd, sessionId) {
  const dir = join(PROJECTS, slug(cwd), sessionId, 'subagents');
  const agents = {};
  for (const p of walk(dir).filter((p) => /agent-[^/]+\.jsonl$/.test(p))) {
    let type = 'unknown';
    try { type = JSON.parse(readFileSync(p.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType || type; } catch {}
    const u = usageOf(readJsonl(p));
    const a = (agents[type] ||= { invocations: 0, calls: 0, input_tokens: 0, output_tokens: 0 });
    a.invocations += 1; a.calls += u.calls; a.input_tokens += u.input; a.output_tokens += u.output;
  }
  return agents;
}

/** Session totals over every model from the result event; transcripts only give the per-agent split. */
function totalsOf(result) {
  const models = Object.values(result.modelUsage || {});
  if (!models.length) return null;
  return {
    input: models.reduce((n, m) => n + (m.inputTokens || 0) + (m.cacheReadInputTokens || 0) + (m.cacheCreationInputTokens || 0), 0),
    output: models.reduce((n, m) => n + (m.outputTokens || 0), 0),
  };
}

function grade(task, text, cwd) {
  const g = task.grade;
  if (g.kind === 'names') {
    const found = g.need.filter((n) => new RegExp(`\\b${n}\\b`).test(text));
    const ok = found.length / g.need.length >= g.minShare && g.mustAll.every((n) => found.includes(n));
    return { pass: ok ? 1 : 0, detail: `${found.length}/${g.need.length} names` };
  }
  if (g.kind === 'regex') {
    const miss = g.all.filter((r) => !new RegExp(r, 'i').test(text));
    const vetoed = (g.none || []).filter((r) => new RegExp(r, 'im').test(text));
    if (vetoed.length) return { pass: 0, detail: `vetoed: ${vetoed.join(' | ')}` };
    return { pass: miss.length ? 0 : 1, detail: miss.length ? `missing: ${miss.join(' | ')}` : 'all matched' };
  }
  if (g.kind === 'hidden') {
    const run = (args, env = {}) => {
      try { return execFileSync('node', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }); }
      catch (e) { return (e.stdout || '') + (e.stderr || ''); }
    };
    const count = (out, k) => Number((out.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) || [])[1] || 0);
    const hidden = run(['--test', ...[g.files || [g.file]].flat().map((f) => join(HERE, 'hidden', f))], { FIXTURE: cwd });
    const visible = run(['--test', 'test/']);
    const hp = count(hidden, 'pass'), hf = count(hidden, 'fail'), vf = count(visible, 'fail'), vp = count(visible, 'pass');
    return { pass: hf === 0 && hp > 0 && vf === 0 && vp > 0 ? 1 : 0, detail: `hidden ${hp}/${hp + hf}, visible fail ${vf}` };
  }
  throw new Error(`unknown grader ${g.kind}`);
}

function runOne(a, task, rep) {
  const name = `${task.id}-r${rep}`;
  const cwd = join(a.work, a.variant, name);
  buildFixture(cwd, task.id);
  const prompt = task.prompt.replaceAll('{EARSHOT}', a.earshot).replaceAll('{TE}', a.te);
  const args = ['-p', prompt, '--model', a.model, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'];
  for (const d of a.deny) args.push('--disallowedTools', `Agent(${d})`);
  const rawPath = join(a.work, a.variant, `${name}.stream.jsonl`);
  const raw = createWriteStream(rawPath);
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn('claude', args, { cwd, env: { ...process.env, NEBI_EVAL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', err = '';
    const lines = [];
    child.stdout.on('data', (c) => { raw.write(c); buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { lines.push(JSON.parse(l)); } catch {} } });
    child.stderr.on('data', (c) => { err += c; });
    const timer = setTimeout(() => child.kill('SIGTERM'), a.timeoutMin * 60000);
    child.on('close', (code) => {
      clearTimeout(timer); raw.end();
      const result = lines.find((l) => l.type === 'result') || {};
      const main = usageOf(lines.filter((l) => !l.parent_tool_use_id));
      const dispatched = [];
      for (const l of lines) {
        if (l.type !== 'assistant' || l.parent_tool_use_id) continue;
        for (const b of l.message?.content || []) {
          if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) dispatched.push(b.input?.subagent_type || 'general-purpose');
          if (b.type === 'tool_use' && b.name === 'Workflow') dispatched.push('workflow');
        }
      }
      const subs = result.session_id ? subagents(cwd, result.session_id) : {};
      const byAgent = { main: { calls: main.calls, invocations: 1, input_tokens: main.input } };
      let inTok = main.input, outTok = main.output, calls = main.calls;
      for (const [t, s] of Object.entries(subs)) { byAgent[t] = { calls: s.calls, invocations: s.invocations, input_tokens: s.input_tokens }; inTok += s.input_tokens; outTok += s.output_tokens; calls += s.calls; }
      const totals = totalsOf(result);
      if (totals) { inTok = totals.input; outTok = totals.output; }
      const text = String(result.result || '');
      const status = result.type ? (result.is_error ? 'error' : 'ok') : (Date.now() - started >= a.timeoutMin * 60000 ? 'timeout' : 'error');
      const g = status === 'ok' ? grade(task, text, cwd) : { pass: 0, detail: `${status}: exit ${code} ${err.slice(0, 200)}` };
      const row = {
        prompt_id: task.id, rep, variant: a.variant, tags: [task.domain], status, model: a.model,
        grade: { pass: g.pass }, grade_detail: g.detail,
        latency_s: Math.round((Date.now() - started) / 100) / 10, in_tokens: inTok, out_tokens: outTok, model_calls: calls,
        main_peak_context: main.peak, by_agent: byAgent, dispatched, cost_usd: result.total_cost_usd ?? null,
        num_turns: result.num_turns ?? null, session_id: result.session_id ?? null,
      };
      appendFileSync(join(a.out, a.variant, 'results.jsonl'), JSON.stringify(row) + '\n');
      console.log(`${a.variant} ${name}: pass=${g.pass} ${g.detail} | ${row.latency_s}s in=${inTok} calls=${calls} agents=[${dispatched.join(',')}] $${row.cost_usd}`);
      done(row);
    });
  });
}

// --regrade <variant>: re-apply the graders to stored runs after a grader fix (no model calls).
function regrade(a) {
  const tasks = Object.fromEntries(JSON.parse(readFileSync(join(HERE, 'tasks.json'), 'utf8')).tasks.map((t) => [t.id, t]));
  const file = join(a.out, a.variant, 'results.jsonl');
  const rows = readJsonl(file).map((row) => {
    if (row.status !== 'ok') return row;
    const name = `${row.prompt_id}-r${row.rep}`;
    const result = readJsonl(join(a.work, a.variant, `${name}.stream.jsonl`)).find((l) => l.type === 'result') || {};
    const g = grade(tasks[row.prompt_id], String(result.result || ''), join(a.work, a.variant, name));
    if (g.pass !== row.grade.pass) console.log(`${a.variant} ${name}: ${row.grade.pass} -> ${g.pass} (${g.detail})`);
    const totals = totalsOf(result);
    const byAgent = Object.fromEntries(Object.entries(row.by_agent).map(([k, v]) => [k, k === 'main' ? { ...v, invocations: 1 } : v]));
    return { ...row, grade: { pass: g.pass }, grade_detail: g.detail, by_agent: byAgent, ...(totals ? { in_tokens: totals.input, out_tokens: totals.output } : {}) };
  });
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

async function main() {
  if (process.argv.includes('--regrade')) {
    const argv = process.argv.slice(2).filter((x) => x !== '--regrade');
    return regrade({ ...parseArgs([...argv, '--earshot', '-', '--te', '-']) });
  }
  const a = parseArgs(process.argv.slice(2));
  const tasks = JSON.parse(readFileSync(join(HERE, 'tasks.json'), 'utf8')).tasks.filter((t) => !a.only || a.only.has(t.id));
  mkdirSync(join(a.out, a.variant), { recursive: true });
  mkdirSync(join(a.work, a.variant), { recursive: true });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: HERE, encoding: 'utf8' }).trim();
  const version = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
  const meta = { variant: a.variant, model: a.model, deny: a.deny, reps: a.reps, tasks: tasks.map((t) => t.id), commit, claude: version, started: new Date().toISOString() };
  const jobs = [];
  for (let rep = 1; rep <= a.reps; rep++) for (const t of tasks) jobs.push([t, rep]);
  let next = 0;
  const worker = async () => { while (next < jobs.length) { const [t, r] = jobs[next++]; await runOne(a, t, r); } };
  await Promise.all(Array.from({ length: a.j }, worker));
  meta.ended = new Date().toISOString();
  const metaPath = join(a.out, a.variant, 'meta.json');
  const runs = existsSync(metaPath) ? [JSON.parse(readFileSync(metaPath, 'utf8'))].flat() : [];
  writeFileSync(metaPath, JSON.stringify([...runs, meta], null, 2) + '\n');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
