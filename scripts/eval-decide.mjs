#!/usr/bin/env node
// Pre-registered decision rule for the skill verdict (written before Measure, 2026-09-27).
// Usage: node scripts/eval-decide.mjs --none a.json[,b.json] --nebi x.json[,..] [--up y.json[,..]]
//                        [--nebi-skill name] [--up-skill name] [--exclude c1,c2] [--override o.json] [--out d.json]
// Rule: per comparison, one stratified permutation test across kept cases on run-level scores (0..1).
// "Better" = one-sided p < 0.10 AND a mean gap of at least 20 points. Anything else: no detectable difference.
// Fix 27 Sep 18:40 (after pilots, before any final): session/usage-limit errors and failed judge calls are infra too.
// Errors: rate limit / overload / 429 / 529 / auth / interrupted / skippedPaidGraders -> run dropped (rerun that case in ALL arms).
// Timeout or max-turns -> counts as score 0, never rerun. partial:true files are rejected.
// Overrides ({tracePath: score}) must cover every run of a case in every arm, or none of them.
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? undefined : argv[i + 1]; };
const list = (k) => (opt(k) ? opt(k).split(',').filter(Boolean) : []);
const P_MAX = 0.10, GAP_MIN = 20, ITER = 20000;

const INFRA = /session limit|usage limit|hit your .*limit|judge call failed|rate.?limit|\b429\b|\b529\b|overload|auth|credential|\b401\b|\b403\b|interrupt|ECONN|network|docker|sandbox cannot/i;
const FAIL = /time.?out|timed out|max.?turns|turn limit/i;

const override = opt('override') ? JSON.parse(fs.readFileSync(opt('override'), 'utf8')) : {};
const exclude = new Set(list('exclude'));
const skillName = { nebi: opt('nebi-skill'), up: opt('up-skill') };

function fired(tracePath, arm) {
  if (!tracePath || !fs.existsSync(tracePath)) return null;
  const t = fs.readFileSync(tracePath, 'utf8');
  const names = [...t.matchAll(/"name":"Skill","input":\{"(?:skill|command|name)":"([^"]+)"/g)].map((m) => m[1]);
  if (!names.length) return false;
  const want = skillName[arm];
  return want ? names.some((n) => n.includes(want)) : true;
}

function load(arm, files) {
  const cases = {}; const notes = { dropped: 0, unknownErrors: [], timeouts: 0, rejectedFiles: [] };
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (j.partial) { notes.rejectedFiles.push(`${f} (partial: ${j.partialReason ?? '?'})`); continue; }
    for (const c of j.cases ?? []) {
      if (exclude.has(c.name)) continue;
      const runs = c.arms?.with ?? [];
      for (const r of runs) {
        const e = r.error ? String(r.error) : '';
        let score;
        const judgeErr = (r.graders ?? []).some((g) => INFRA.test(String(g.explanation ?? '')));
        if (r.skippedPaidGraders || judgeErr || (e && INFRA.test(e))) { notes.dropped++; continue; }
        if (e && FAIL.test(e)) { notes.timeouts++; score = 0; }
        else if (e) { notes.unknownErrors.push(`${c.name}: ${e.slice(0, 120)}`); notes.dropped++; continue; }
        else score = r.score;
        if (r.tracePath && override[r.tracePath] !== undefined) score = override[r.tracePath];
        (cases[c.name] ??= []).push({ score, passed: !!r.passed, fired: arm === 'none' ? null : fired(r.tracePath, arm), trace: r.tracePath, overridden: override[r.tracePath] !== undefined });
      }
    }
  }
  return { cases, notes };
}

// Seeded PRNG so the p-values are reproducible.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

function compare(X, Y, labelX, labelY) {
  const names = Object.keys(X.cases).filter((n) => Y.cases[n]?.length && X.cases[n]?.length);
  if (!names.length) return { comparison: `${labelX} vs ${labelY}`, cases: 0, verdict: 'no shared cases' };
  const strata = names.map((n) => ({ n, x: X.cases[n].map((r) => r.score), y: Y.cases[n].map((r) => r.score) }));
  const stat = (s) => s.reduce((acc, { x, y }) => acc + (x.length * y.length / (x.length + y.length)) * (mean(x) - mean(y)), 0);
  const obs = stat(strata);
  const rand = rng(0x5eed + names.length);
  let geX = 0, geY = 0;
  for (let i = 0; i < ITER; i++) {
    const perm = strata.map(({ x, y }) => {
      const pool = [...x, ...y];
      for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
      return { x: pool.slice(0, x.length), y: pool.slice(x.length) };
    });
    const t = stat(perm);
    if (t >= obs - 1e-12) geX++;
    if (t <= obs + 1e-12) geY++;
  }
  const pX = (1 + geX) / (1 + ITER), pY = (1 + geY) / (1 + ITER);
  const gap = 100 * (mean(strata.map((s) => mean(s.x))) - mean(strata.map((s) => mean(s.y))));
  let verdict = 'no detectable difference';
  if (pX < P_MAX && gap >= GAP_MIN) verdict = `${labelX} better`;
  else if (pY < P_MAX && -gap >= GAP_MIN) verdict = `${labelY} better`;
  return { comparison: `${labelX} vs ${labelY}`, cases: names.length, gapPoints: +gap.toFixed(1), pOneSided: { [`${labelX}>${labelY}`]: +pX.toFixed(4), [`${labelY}>${labelX}`]: +pY.toFixed(4) }, verdict };
}

function checkOverrides(arms) {
  const byCase = {};
  for (const [arm, A] of Object.entries(arms)) for (const [n, runs] of Object.entries(A.cases)) for (const r of runs) (byCase[n] ??= []).push(r.overridden);
  const bad = Object.entries(byCase).filter(([, v]) => v.some(Boolean) && !v.every(Boolean)).map(([n]) => n);
  if (bad.length) { console.error(`Override rule broken (re-judge all runs of a case in every arm, or none): ${bad.join(', ')}`); process.exit(3); }
}

const arms = { none: load('none', list('none')), nebi: load('nebi', list('nebi')) };
if (list('up').length) arms.up = load('up', list('up'));
checkOverrides(arms);

const perCase = {};
for (const [arm, A] of Object.entries(arms)) for (const [n, runs] of Object.entries(A.cases)) {
  const f = runs.filter((r) => r.fired !== null);
  (perCase[n] ??= {})[arm] = { runs: runs.length, meanScore: +mean(runs.map((r) => r.score)).toFixed(3), fullPass: runs.filter((r) => r.score >= 1).length, fired: f.length ? `${f.filter((r) => r.fired).length}/${f.length}` : null };
}
const comparisons = [compare(arms.nebi, arms.none, 'nebi', 'none')];
if (arms.up) comparisons.push(compare(arms.up, arms.none, 'upstream', 'none'), compare(arms.nebi, arms.up, 'nebi', 'upstream'));
const out = { rule: `one-sided stratified permutation p < ${P_MAX} and gap >= ${GAP_MIN} points, run-level scores, ${ITER} permutations`, perCase, comparisons, notes: Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, v.notes])) };
if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
