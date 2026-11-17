#!/usr/bin/env node
// Source-pack trigger loader evaluation; dependency-free, Node 18+.
// --list is offline. --headless requires an explicit model and a Claude CLI
// supporting the isolation flags checked below. Run --help for options.
// Stage all seven source skills in a temporary project; never deploy to evaluate.
// Grade only assistant Skill tool calls with a visible registry and successful
// terminal result. Restricted runs measure invocation, not task completion.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const DEFAULT_SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url));
let SKILLS_DIR = DEFAULT_SKILLS_DIR;
const IS_WINDOWS = process.platform === 'win32';
const PLUGIN_PREFIX = 'nebi-eval:';
const canonicalSkill = (name) => name.startsWith(PLUGIN_PREFIX) ? name.slice(PLUGIN_PREFIX.length) : name;

// ---------------------------------------------------------------------------
// Parsing — two trigger-file formats exist
// ---------------------------------------------------------------------------

/**
 * Extract the prompt text from one numbered item line (already de-numbered).
 * Format A wraps prompts in "double quotes" (trailing "(comment)" allowed after
 * the closing quote); format B wraps them in `backticks`.
 */
function extractPrompt(rest) {
  const text = rest.trim();
  for (const q of ['`', '"']) {
    if (text.startsWith(q)) {
      const end = text.lastIndexOf(q);
      if (end > 0) return text.slice(1, end).trim();
    }
  }
  return text; // unquoted fallback — take the whole line
}

/**
 * Parse a triggers.md into { mustFire: [], mustNotFire: [] }.
 * Handles both formats:
 *   A: "Must fire (positives):" / "Must NOT fire (near-misses):" + `1. "..."` lines
 *   B: "## Must fire" / "## Must not fire" + "1. `...`" lines
 */
export function parseTriggers(markdown) {
  const mustFire = [];
  const mustNotFire = [];
  let section = null;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.replace(/^#+\s*/, '').trim().toLowerCase();
    if (/^must not fire/.test(heading)) { section = 'not'; continue; }
    if (/^must fire/.test(heading)) { section = 'fire'; continue; }
    if (/^(how to run|pass\s*=)/.test(heading)) { section = null; continue; }
    if (!section) continue;

    const item = line.match(/^\s*\d+[.)]\s*(.+)$/);
    if (!item) continue;
    const prompt = extractPrompt(item[1]);
    if (!prompt) continue;
    (section === 'fire' ? mustFire : mustNotFire).push(prompt);
  }
  return { mustFire, mustNotFire };
}

/** Frontmatter name: from a SKILL.md, falling back to the directory name. */
function skillNameFor(dir) {
  try {
    const raw = fs.readFileSync(path.join(SKILLS_DIR, dir, 'SKILL.md'), 'utf8');
    const m = raw.match(/^---\r?\n[\s\S]*?^name:\s*(.+?)\s*$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return dir;
}

/** All skills under ~/.claude/skills/ that ship an evals/triggers.md. */
function loadEvalSuites() {
  const suites = [];
  let dirs = [];
  try {
    dirs = fs.readdirSync(SKILLS_DIR);
  } catch {
    return suites;
  }
  for (const dir of dirs.sort()) {
    const triggersPath = path.join(SKILLS_DIR, dir, 'evals', 'triggers.md');
    if (!fs.existsSync(triggersPath)) continue;
    const { mustFire, mustNotFire } = parseTriggers(fs.readFileSync(triggersPath, 'utf8'));
    if (mustFire.length + mustNotFire.length === 0) continue;
    suites.push({ skill: skillNameFor(dir), triggersPath, mustFire, mustNotFire });
  }
  return suites;
}

/** Flatten suites into ordered cases: { skill, prompt, kind: 'fire'|'not' }. */
function flattenCases(suites) {
  const cases = [];
  for (const s of suites) {
    for (const prompt of s.mustFire) cases.push({ skill: s.skill, prompt, kind: 'fire' });
    for (const prompt of s.mustNotFire) cases.push({ skill: s.skill, prompt, kind: 'not' });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// --list mode
// ---------------------------------------------------------------------------

function printChecklist(suites) {
  const total = suites.reduce((n, s) => n + s.mustFire.length + s.mustNotFire.length, 0);
  const fire = suites.reduce((n, s) => n + s.mustFire.length, 0);
  console.log(`Trigger evals — ${suites.length} skills, ${total} prompts (${fire} must fire / ${total - fire} must not fire)`);
  console.log('Paste each prompt into a FRESH session with no other context; check which skill loads.');

  let n = 0;
  for (const s of suites) {
    console.log('');
    console.log(`## ${s.skill}  (${s.triggersPath})`);
    for (const prompt of s.mustFire) {
      n += 1;
      console.log(`${String(n).padStart(3)}. ${prompt}`);
      console.log(`     → expected: ${s.skill} FIRES`);
    }
    for (const prompt of s.mustNotFire) {
      n += 1;
      console.log(`${String(n).padStart(3)}. ${prompt}`);
      console.log(`     → expected: ${s.skill} does NOT fire`);
    }
  }
  console.log('');
  console.log('PASS = every "FIRES" row loads the skill and no "does NOT fire" row does.');
  console.log('A description edit that flips a row is a regression.');
}

// ---------------------------------------------------------------------------
// --headless mode
// ---------------------------------------------------------------------------

function claudeCliAvailable() {
  try {
    const r = spawnSync('claude', ['--version'], {
      shell: IS_WINDOWS, // resolves claude.cmd shims on Windows
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Which skills fired in one stream-json transcript.
 * Primary: parse each line, collect Skill tool_use inputs.
 * Unknown stream schemas fail validation instead of falling back to string matching.
 */
export function detectFiredSkills(stdout) {
  const fired = new Set();
  const lines = String(stdout || '').split('\n');

  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== 'assistant') continue;
    const content = event?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'tool_use' && block.name === 'Skill' && typeof block.input?.skill === 'string') {
        fired.add(canonicalSkill(block.input.skill));
      }
    }
  }

  return fired;
}

// A negative row cannot pass on a login error, incomplete stream, or hidden skill.
export function gradeTranscript(stdout, c) {
  let parseFailures = 0;
  const events = String(stdout || '').split('\n').filter(Boolean).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== 'object' || Array.isArray(event)) { parseFailures++; return []; }
      return [event];
    } catch { parseFailures++; return []; }
  });
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
  const result = events.findLast((e) => e.type === 'result');
  const fired = [...detectFiredSkills(stdout)];
  const registry = Array.isArray(init?.skills) ? init.skills.filter(s => typeof s === 'string').map(canonicalSkill) : [];
  const diagnostic = { initKeys: Object.keys(init ?? {}), eventTypes: [...new Set(events.map((e) => `${e.type}:${e.subtype ?? ''}`))],
    resultSubtype: result?.subtype, registryType: typeof init?.skills,
    registrySample: Array.isArray(init?.skills) ? init.skills.slice(0, 3) : Object.keys(init?.skills ?? {}).slice(0, 3) };
  const assistant = events.filter(e => e?.type === 'assistant');
  if (parseFailures || !assistant.length || assistant.some(e => !Array.isArray(e.message?.content) || !e.message.content.length || e.message.content.some(b => !['text', 'thinking', 'redacted_thinking', 'tool_use'].includes(b?.type)))) {
    return { status: 'ERROR', reason: 'Unparseable or unsupported assistant stream', fired, diagnostic };
  }
  if (!init || [c.skill, ...(c.requiredSkills ?? []), ...(c.forbiddenSkills ?? [])].some(s => !registry.includes(s))) {
    return { status: 'ERROR', reason: 'Target skill absent from init registry', fired, diagnostic };
  }
  if (!result || result.is_error !== false || result.subtype !== 'success') {
    return { status: 'ERROR', reason: 'Missing successful terminal result', fired, diagnostic };
  }
  const forbidden = (c.forbiddenSkills ?? []).filter((skill) => fired.includes(skill));
  const missing = (c.requiredSkills ?? []).filter((skill) => !fired.includes(skill));
  return { status: (c.kind === 'fire') === fired.includes(c.skill) && forbidden.length === 0 && missing.length === 0 ? 'PASS' : 'FAIL', fired,
    ...(missing.length ? { reason: `Missing co-fire: ${missing.join(', ')}` } : {}),
    ...(forbidden.length ? { reason: `Forbidden co-fire: ${forbidden.join(', ')}` } : {}),
    model: init.model, registry: init.skills, costUSD: result.total_cost_usd ?? null };
}

export function validateCases(cases, names) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('Cases must be a nonempty array.');
  for (const c of cases) {
    if (!c || typeof c.prompt !== 'string' || !c.prompt.trim() || !['fire', 'not'].includes(c.kind) || !names.includes(c.skill)) throw new Error('Invalid case target, prompt, or kind.');
    for (const key of ['requiredSkills', 'forbiddenSkills']) {
      if (c[key] !== undefined && (!Array.isArray(c[key]) || c[key].some(s => !names.includes(s)))) throw new Error(`Unknown or invalid ${key}.`);
    }
    const positive = [...(c.requiredSkills ?? []), ...(c.kind === 'fire' ? [c.skill] : [])];
    const negative = [...(c.forbiddenSkills ?? []), ...(c.kind === 'not' ? [c.skill] : [])];
    if (positive.some(s => negative.includes(s))) throw new Error('Contradictory required/forbidden skill.');
  }
}

function runHeadless(cases, timeoutMs, options) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-trigger-eval-'));
  try {
  // Stage the exact source pack, including competitors, without deploying it.
  const plugin = path.join(scratch, 'plugin');
  fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'nebi-eval', version: '1.0.0' }));
  const staged = path.join(plugin, 'skills');
  fs.mkdirSync(staged, { recursive: true });
  const hashes = {};
  for (const dir of fs.readdirSync(SKILLS_DIR).filter((name) => name.startsWith('nebi-'))) {
    const source = path.join(SKILLS_DIR, dir);
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) continue;
    fs.cpSync(source, path.join(staged, dir), { recursive: true,
      filter: (file) => !path.relative(source, file).split(path.sep).includes('evals') });
    hashes[dir] = createHash('sha256').update(fs.readFileSync(path.join(source, 'SKILL.md'))).digest('hex');
  }
  // Seed a minimal plausible project. Measured 2026-08-31: in a bare empty dir,
  // prompts that name concrete project nouns ("these three modules", "this app")
  // make the model glob for the missing thing instead of loading a skill, so rows
  // report a false FAIL — the same prompt fires correctly when cwd looks like a
  // real repo. This skeleton is inert: no install, no scripts, nothing executed.
  fs.writeFileSync(path.join(scratch, 'package.json'),
    JSON.stringify({ name: 'trigger-eval-fixture', private: true, version: '0.0.0' }, null, 2) + '\n');
  fs.writeFileSync(path.join(scratch, 'README.md'), '# Fixture project\n\nInert fixture for nebi trigger evals.\n');
  for (const d of ['src', 'src/auth', 'src/billing', 'src/payments']) {
    fs.mkdirSync(path.join(scratch, d), { recursive: true });
  }
  fs.writeFileSync(path.join(scratch, 'src/index.js'), '// fixture entrypoint\n');
  const results = [];

  console.log(`Running ${cases.length} prompts headless (cwd: ${scratch}, per-prompt timeout ${timeoutMs / 1000}s)…`);
  console.log('');

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--restricted', '--tools', 'Skill,Read,Glob,Grep',
      '--allowedTools', 'Skill,Read,Glob,Grep',
      '--strict-mcp-config', '--no-chrome', '--setting-sources', 'project',
      '--settings', JSON.stringify({ disableAllHooks: true, autoMemoryEnabled: false }),
      '--plugin-dir', plugin,
      '--model', options.model, '--max-budget-usd', String(options.budget),
    ];
    // Prompt goes in via stdin, not argv — avoids all cross-platform quoting issues.
    const r = spawnSync('claude', args, {
      shell: IS_WINDOWS,
      cwd: scratch,
      input: c.prompt,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });

    let status;
    let fired = new Set();
    let receipt = {};
    if (r.error || r.signal || typeof r.status !== 'number' || r.status !== 0) {
      status = 'ERROR';
      receipt = gradeTranscript(r.stdout, c);
      fired = new Set(receipt.fired);
      receipt.reason = r.error?.code || r.signal || `CLI exit ${r.status}`;
    } else {
      receipt = gradeTranscript(r.stdout, c);
      fired = new Set(receipt.fired);
      status = receipt.status;
    }
    results.push({ ...c, ...receipt, status, fired: [...fired] });

    const expect = c.kind === 'fire' ? 'must fire   ' : 'must NOT    ';
    const firedLabel = fired.size ? [...fired].join(',') : '(none)';
    const prompt = c.prompt.length > 60 ? c.prompt.slice(0, 57) + '…' : c.prompt;
    console.log(`${String(i + 1).padStart(3)}. ${status.padEnd(5)} ${c.skill.padEnd(20)} ${expect} fired: ${firedLabel.padEnd(24)} ${prompt}${receipt.reason ? ` (${receipt.reason})` : ''}`);
  }

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const error = results.filter((r) => r.status === 'ERROR').length;

  console.log('');
  console.log(`Totals: ${pass} PASS / ${fail} FAIL / ${error} ERROR of ${results.length}`);
  for (const skill of [...new Set(results.map((r) => r.skill))]) {
    const mine = results.filter((r) => r.skill === skill);
    const p = mine.filter((r) => r.status === 'PASS').length;
    console.log(`  ${skill.padEnd(20)} ${p}/${mine.length}`);
  }
  if (fail + error > 0) process.exitCode = 1;
  if (options.report) {
    fs.writeFileSync(options.report, JSON.stringify({ generatedAt: new Date().toISOString(),
      cliVersion: options.cliVersion, requestedModel: options.model, source: SKILLS_DIR,
      hashes, limitations: 'Restricted Claude loader with explicit nebi-eval plugin; builtin skills remain competitors. Eval answers are excluded from staging. Invocation is measured, not behavioral quality. No raw transcripts or credentials stored.',
      results, totals: { pass, fail, error } }, null, 2) + '\n');
  }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log('Usage: node run-trigger-evals.mjs [--list | --headless --model MODEL] [--skills-dir PATH] [--skill NAME] [--cases JSON_FILE] [--limit N] [--timeout SECONDS] [--budget USD_PER_CASE] [--report FILE]\nDefault: list repository-local suites. Headless stages the source pack in a temporary project and requires a model. No deploy. Report contains hashes and grades, not raw transcripts.');
    return;
  }
  const flags = new Set(['--list', '--headless']);
  const values = new Set(['--skill', '--limit', '--timeout', '--skills-dir', '--report', '--model', '--budget', '--cases']);
  for (let i = 0; i < argv.length; i++) {
    if (flags.has(argv[i])) continue;
    if (!values.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Invalid or incomplete option: ${argv[i]}`);
    i++;
  }
  const value = (key, fallback) => argv.includes(key) ? argv[argv.indexOf(key) + 1] : fallback;
  SKILLS_DIR = path.resolve(value('--skills-dir', DEFAULT_SKILLS_DIR));
  const headless = argv.includes('--headless');
  const skillFilter = argv.includes('--skill') ? argv[argv.indexOf('--skill') + 1] : null;
  const limit = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : Infinity;
  const timeoutMs = (argv.includes('--timeout') ? Number(argv[argv.indexOf('--timeout') + 1]) : 180) * 1000;
  const budget = Number(value('--budget', '0.5'));
  if ((limit !== Infinity && (!Number.isInteger(limit) || limit < 1)) || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(budget) || budget <= 0) throw new Error('Limit must be a positive integer; timeout and budget must be positive numbers.');
  if (headless && argv.includes('--list')) throw new Error('Choose --headless or --list.');
  const model = value('--model', null);
  if (headless && !model) throw new Error('--headless requires --model so the evaluated model is explicit.');

  let suites = loadEvalSuites();
  if (skillFilter) suites = suites.filter((s) => s.skill === skillFilter || s.skill === `nebi-${skillFilter}`);

  if (suites.length === 0) {
    console.error(`No evals/triggers.md found under ${SKILLS_DIR}${skillFilter ? ` for skill "${skillFilter}"` : ''}.`);
    process.exitCode = 1;
    return;
  }

  let cases = flattenCases(suites);
  const casesFile = value('--cases', null);
  if (casesFile) {
    cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
    validateCases(cases, suites.map(s => s.skill));
  }
  if (!headless) {
    if (casesFile) { console.log(JSON.stringify(cases, null, 2)); return; }
    printChecklist(suites);
    return;
  }

  if (!claudeCliAvailable()) {
    throw new Error('claude CLI unavailable: headless evaluation did not run. Use --list for a manual checklist.');
  }

  const help = spawnSync('claude', ['--help'], { shell: IS_WINDOWS, encoding: 'utf8', timeout: 15000 });
  for (const option of ['--restricted', '--tools', '--strict-mcp-config', '--setting-sources', '--settings', '--max-budget-usd', '--plugin-dir']) {
    if (help.status !== 0 || !help.stdout.includes(option)) throw new Error(`CLI lacks required isolation option ${option}; evaluation did not run.`);
  }

  if (Number.isFinite(limit) && limit >= 0) cases = cases.slice(0, limit);
  runHeadless(cases, timeoutMs, { model, budget, report: value('--report', null),
    cliVersion: spawnSync('claude', ['--version'], { shell: IS_WINDOWS, encoding: 'utf8', timeout: 15000 }).stdout.trim() });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
