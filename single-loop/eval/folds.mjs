#!/usr/bin/env node
// Fold the lean sub-agents one at a time, each against the last variant that held.
//
//   node folds.mjs --work <scratch dir> --earshot <clone> --te <clone> [--reps 2] [-j 3]
//                  [--kept nebi-scout --last v1 --next 2]   (resume after an interruption)
//
// For each agent in ORDER: run the eval with that agent denied on top of every fold
// already kept, then compare per task with the last kept variant. A task is worse when
// it passes in fewer reps than before. Any worse task reverts the fold (the agent stays)
// and the next agent is tried against the same kept variant. A fold whose agent was never
// dispatched before is NO SIGNAL, and one where the lead swapped in another agent is
// REROUTED; neither is kept. Otherwise the fold is kept.
// Decisions append to <out>/folds.log; the kit's compare.py output goes to
// <out>/<variant>/compare.txt. Waits for baseline to have every task x rep first.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'results');
const KIT = resolve(HERE, '..', '..', '.claude', 'skills', 'single-agent-loop', 'scripts');
const ORDER = ['nebi-scout', 'nebi-checker', 'nebi-builder'];

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const work = opt('--work'), earshot = opt('--earshot'), te = opt('--te');
const reps = Number(opt('--reps', 2)), j = opt('-j', '3');
if (!work || !earshot || !te) { console.error('usage: node folds.mjs --work <dir> --earshot <clone> --te <clone>'); process.exit(2); }

const tasks = JSON.parse(readFileSync(join(HERE, 'tasks.json'), 'utf8')).tasks.map((t) => t.id);
const rows = (v) => existsSync(join(OUT, v, 'results.jsonl'))
  ? readFileSync(join(OUT, v, 'results.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const passes = (v) => Object.fromEntries(tasks.map((t) => [t, rows(v).filter((r) => r.prompt_id === t).reduce((s, r) => s + r.grade.pass, 0)]));
const log = (line) => { console.log(line); appendFileSync(join(OUT, 'folds.log'), `${line}\n`); };

while (rows('baseline').length < tasks.length * reps) {
  spawnSync('sleep', ['20']);
}

// Resume after an interruption: --kept a,b (folds already kept) --last <variant> --next <n>.
let kept = (opt('--kept', '') || '').split(',').filter(Boolean), lastKept = opt('--last', 'baseline'), n = Number(opt('--next', 1)) - 1;
for (const agent of ORDER.filter((a) => !kept.includes(a))) {
  const variant = `v${++n}`;
  const deny = [...kept, agent];
  if (!new Set(rows(lastKept).flatMap((r) => r.dispatched || [])).has(agent)) {
    log(`${variant}: NO SIGNAL, ${agent} was never dispatched in ${lastKept}; not run, ${agent} stays`);
    n--;
    continue;
  }
  log(`${variant}: fold ${agent} (deny ${deny.join(',')}) vs ${lastKept}`);
  execFileSync('node', [join(HERE, 'run.mjs'), '--variant', variant, '--work', work, '--earshot', earshot, '--te', te,
    '--reps', String(reps), '-j', j, '--deny', deny.join(',')], { stdio: 'inherit' });
  const cmp = spawnSync('python3', [join(KIT, 'compare.py'), OUT, lastKept, variant, '--exclude', 'main', '--exclude', agent], { encoding: 'utf8' });
  writeFileSync(join(OUT, variant, 'compare.txt'), (cmp.stdout || '') + (cmp.stderr || ''));
  const broken = rows(variant).filter((r) => r.status !== 'ok');
  if (broken.length) {
    log(`${variant}: STOP, ${broken.length} run(s) ended in ${[...new Set(broken.map((r) => r.status))].join('/')} (harness, not the fold); no decision. Fix the cause, move results/${variant} aside and resume.`);
    process.exit(1);
  }
  const before = passes(lastKept), after = passes(variant);
  const worse = tasks.filter((t) => after[t] < before[t]);
  // A fold only means something where the agent was used, and only holds if the lead did
  // not swap in another (often costlier) agent for the one it lost.
  const used = (v) => new Set(rows(v).flatMap((r) => r.dispatched || []));
  const signal = used(lastKept).has(agent);
  const before_by = (t, v) => new Set(rows(v).filter((r) => r.prompt_id === t).flatMap((r) => r.dispatched || []));
  const rerouted = tasks.flatMap((t) => [...before_by(t, variant)].filter((x) => !before_by(t, lastKept).has(x)).map((x) => `${t}->${x}`));
  if (!worse.length && !signal) {
    log(`${variant}: NO SIGNAL, ${agent} was never dispatched in ${lastKept}; the fold is untested here, ${agent} stays`);
    continue;
  }
  if (!worse.length && rerouted.length) {
    log(`${variant}: REROUTED (${rerouted.join(', ')}); ${agent} stays until the swap is judged`);
    continue;
  }
  if (worse.length) {
    log(`${variant}: REVERT, worse on ${worse.map((t) => `${t} ${before[t]}->${after[t]}`).join(', ')}; ${agent} stays`);
  } else {
    kept = deny; lastKept = variant;
    log(`${variant}: KEEP fold of ${agent}; no task worse (${Object.values(after).reduce((a, b) => a + b, 0)}/${tasks.length * reps} passes)`);
  }
}
log(`done: folded [${kept.join(', ') || 'none'}], last kept variant ${lastKept}`);
