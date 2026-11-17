#!/usr/bin/env node
// Re-run a skill's plugin-eval cases: a no-skill arm and a skill arm, then the pre-registered decision rule.
//
// Usage: node scripts/plugin-eval.mjs <skill> [--runs 6] [--case <glob>] [-j 3] [--model opus]
//
// Cases live in tests/plugin-evals/<skill>/<case>/ (case.yaml as JSON, plus prompt.md, graders/, history.jsonl,
// scaffold.sh as needed) without any appended context. Both arms get claude-home/CLAUDE.md + the Nebi output
// style appended identically, so the result is "what the skill adds on top of the doctrine".
// Result: <tmp>/out/{none,skill}.json and .html, and decision.json from scripts/eval-decide.mjs
// (one-sided stratified permutation on run scores; "better" = p < 0.10 and a gap of at least 20 points).
//
// Gotchas (learned 2026-09-27):
// - history_file (replay) cases get no baseline under the default with-without ablation, so both arms run with
//   --ablation none and the no-skill arm is its own target dir without a SKILL.md.
// - WebFetch summarises with the small fast model: the Haiku/small-fast env vars are pinned to --model here.
// - On this Mac, Bash-granting evals are refused (Docker Desktop symlinks in ~/.docker); cases grant Write/Edit only.
// - The eval harness bills the account the CLI is logged in with; a 5-hour quota hit shows up as run errors,
//   which eval-decide.mjs drops rather than scoring as fails. Re-run those cases in both arms.
// - Scores are run-level (0..1); with --threshold 0 the case-level "passed" count means nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const skill = argv[0];
const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const runs = opt('--runs', '6'), jobs = opt('-j', '3'), model = opt('--model', 'opus'), caseGlob = opt('--case');

const casesDir = path.join(ROOT, 'tests/plugin-evals', skill ?? '');
const skillDir = path.join(ROOT, 'claude-home/skills', skill ?? '');
if (!skill || !fs.existsSync(casesDir) || !fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
  const have = fs.existsSync(path.join(ROOT, 'tests/plugin-evals')) ? fs.readdirSync(path.join(ROOT, 'tests/plugin-evals')).join(', ') : 'none';
  console.error(`usage: node scripts/plugin-eval.mjs <skill> [--runs 6] [--case <glob>] [-j 3] [--model opus]\nskills with cases: ${have}`);
  process.exit(2);
}

const context = fs.readFileSync(path.join(ROOT, 'claude-home/CLAUDE.md'), 'utf8') + '\n\n'
  + fs.readFileSync(path.join(ROOT, 'claude-home/output-styles/nebi.md'), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `nebi-eval-${skill}-`));
const out = path.join(tmp, 'out');
fs.mkdirSync(out);

function stageEvals(dest) {
  for (const c of fs.readdirSync(casesDir).filter((n) => fs.statSync(path.join(casesDir, n)).isDirectory())) {
    const to = path.join(dest, 'evals', c);
    fs.cpSync(path.join(casesDir, c), to, { recursive: true });
    const file = path.join(to, 'case.yaml');
    const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
    (spec.execution ??= {}).append_system_prompt = context;
    fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  }
}

const arms = {
  none: path.join(tmp, 'none', 'no-skill'),
  skill: path.join(tmp, 'skill', skill),
};
fs.cpSync(skillDir, arms.skill, { recursive: true, filter: (p) => !p.includes(`${path.sep}evals`) });
fs.mkdirSync(arms.none, { recursive: true });
for (const dir of Object.values(arms)) stageEvals(dir);

const env = { ...process.env, ANTHROPIC_DEFAULT_HAIKU_MODEL: model, ANTHROPIC_SMALL_FAST_MODEL: model, CLAUDE_CODE_EFFORT_LEVEL: process.env.CLAUDE_CODE_EFFORT_LEVEL ?? 'xhigh' };
for (const [arm, dir] of Object.entries(arms)) {
  console.log(`\n== ${skill}: ${arm} arm (${runs} runs per case)`);
  const args = ['plugin', 'eval', dir, '--runs', runs, '-j', jobs, '--model', model, '--judge-model', model,
    '--trust-plugin', '--threshold', '0', '--no-publish', '--keep-temp', '--ablation', 'none', '--scaffold',
    '--allow-tools', 'Write', 'Edit', 'WebSearch', 'WebFetch',
    ...(caseGlob ? ['--case', caseGlob] : []), '--json', path.join(out, `${arm}.json`), '--report', path.join(out, `${arm}.html`)];
  const r = spawnSync('claude', args, { cwd: dir, env, stdio: 'inherit' });
  if (r.status !== 0 || !fs.existsSync(path.join(out, `${arm}.json`))) { console.error(`${arm} arm failed (exit ${r.status}); files in ${tmp}`); process.exit(1); }
}

const d = spawnSync('node', [path.join(ROOT, 'scripts/eval-decide.mjs'), '--none', path.join(out, 'none.json'),
  '--nebi', path.join(out, 'skill.json'), '--nebi-skill', skill, '--out', path.join(out, 'decision.json')], { encoding: 'utf8' });
const decision = JSON.parse(d.stdout);
console.log(`\n== decision (${decision.rule})`);
for (const [c, a] of Object.entries(decision.perCase)) console.log(`  ${c}: no skill ${a.none?.meanScore} (${a.none?.runs}) | ${skill} ${a.nebi?.meanScore} (${a.nebi?.runs}), fired ${a.nebi?.fired}`);
for (const c of decision.comparisons) console.log(`  ${c.comparison}: gap ${c.gapPoints} pts, p ${JSON.stringify(c.pOneSided)} -> ${c.verdict}`);
console.log(`\nresults: ${out}`);
