#!/usr/bin/env node
// nebi-prompting brief helper: save a brief to the shared task store, run the
// fresh-context review, and print the one activation line that runs it.
//
// Gotchas:
// - The deployed copy (~/.claude/skills/nebi-prompting/scripts) imports
//   ~/.claude/nebi/context.mjs; run it from there, not from ~/.agents/skills.
// - `claude --bare` only accepts ANTHROPIC_API_KEY, so OAuth logins fail there. The
//   review uses read-only --tools/--allowedTools plus --strict-mcp-config instead,
//   takes its prompt on stdin (--tools is variadic and would swallow a positional
//   prompt), and sets TE_SIDECALL=1 so the pack's hooks don't record it as a session.
// - Launchers (claude-nebi, claude-omer, claude-team, claude-team2) pass every flag
//   through to claude, so the activation line can carry -n, --model and --effort.
// - A cloud session clones the repository and cannot read ~/.agents, so --cloud
//   inlines the brief with $(cat ...); push the branch first. Whether --cloud honors
//   --model/--effort is unverified (CLI 2.1.330), so the cloud line carries neither.
// - Run settings live once, on the brief's `Run:` header line (model=, effort=,
//   ultracode=yes|no, launcher=); activate reads them, and its flags override.
// - This CLI has no turn cap for -p runs, so the review is bounded by read-only tools,
//   a prompt that forbids broad searches, and the timeout.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { identify, show, STORE } from '../../../nebi/context.mjs';

const LAUNCHERS = { a: 'claude-nebi', b: 'claude-omer', c: 'claude-team', d: 'claude-team2' };
const CONFIG_DIRS = { '.claude': 'a', '.claude-max2': 'b', '.claude-team': 'c', '.claude-team2': 'd' };
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const REVIEW_TOOLS = 'Read,Grep,Glob';

const USAGE = `Usage: node brief.mjs <command> [options]

  save     --cwd DIR [--session ID | --task ID] --slug NAME [--kind brief|handoff]
           Reads the brief on stdin; prints the saved path (task briefs/ or handoffs/,
           else the store's briefs/ when no session or task is known).
  review   PATH --model ID [--cwd DIR] [--effort LEVEL] [--timeout SECONDS] [--dry-run]
           Fresh-context read of the brief, read-only tools, no MCP. Prints the findings.
  activate PATH --cwd DIR [--model ID] [--effort LEVEL] [--ultracode | --no-ultracode]
           [--launcher NAME] [--name NAME] [--cloud | --paste]
           Prints the one line that runs the brief, with settings from the brief's
           'Run: model=… effort=… ultracode=yes|no [launcher=…]' header; flags override.
           --paste copies the brief to the clipboard instead (macOS pbcopy) for a tool
           that is not a Claude session.`;

function parse(argv) {
  const [command, ...rest] = argv;
  const options = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) { options._.push(arg); continue; }
    const key = arg.slice(2);
    if (key === 'no-ultracode') { options.ultracode = false; continue; }
    if (['ultracode', 'cloud', 'paste', 'dry-run', 'help'].includes(key)) { options[key] = true; continue; }
    const value = rest[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} needs a value`);
    options[key] = value;
  }
  return { command, options };
}

const slugify = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const tilde = value => value.startsWith(os.homedir() + path.sep) ? `~${value.slice(os.homedir().length)}` : value;
// Single quotes keep $, backticks and spaces literal; an embedded ' becomes '\''.
const quote = value => /^[A-Za-z0-9_./~:=@%+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
const cdPath = value => value.startsWith('~/') && /^[A-Za-z0-9_./~-]+$/.test(value) ? value : quote(value);

function readBrief(file) {
  const resolved = path.resolve(file || '');
  if (!file || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Brief not found: ${file || '(none given)'}`);
  return resolved;
}

export function save(options, text) {
  if (!text || !text.trim()) throw new Error('save reads the brief on stdin; it was empty');
  const slug = slugify(options.slug);
  if (!slug) throw new Error('save needs --slug with at least one letter or digit');
  const kind = options.kind || 'brief';
  if (!['brief', 'handoff'].includes(kind)) throw new Error('--kind is brief or handoff');
  const context = show({ cwd: options.cwd || process.cwd(), session: options.session, task: options.task });
  const dir = context.handoffs
    ? path.join(path.dirname(context.handoffs), kind === 'handoff' ? 'handoffs' : 'briefs')
    : path.join(STORE, 'briefs');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stem = `${new Date().toISOString().slice(0, 10)}-${slug}`;
  for (let n = 1; ; n++) {
    const file = path.join(dir, `${stem}${n > 1 ? `-${n}` : ''}.md`);
    try {
      fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`, { flag: 'wx', mode: 0o600 });
      return file;
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
}

function account(checkout, env = process.env) {
  try {
    const key = JSON.parse(fs.readFileSync(path.join(checkout, '.claude', 'browser.json'), 'utf8')).claudeAccount;
    if (LAUNCHERS[key]) return LAUNCHERS[key];
  } catch { /* no project account: fall back to the current session's */ }
  const configDir = env.CLAUDE_CONFIG_DIR ? path.basename(env.CLAUDE_CONFIG_DIR) : '.claude';
  return LAUNCHERS[CONFIG_DIRS[configDir]] || 'claude';
}

/** Settings from the brief's `Run:` header line: model=, effort=, ultracode=yes|no, launcher=. */
export function runSettings(text) {
  const line = text.split('\n').slice(0, 12).find(l => /^Run:/i.test(l.trim())) || '';
  const pairs = Object.fromEntries([...line.matchAll(/\b(model|effort|ultracode|launcher)=([^\s·,;]+)/gi)].map(m => [m[1].toLowerCase(), m[2]]));
  return {
    model: pairs.model, effort: pairs.effort, launcher: pairs.launcher,
    ultracode: pairs.ultracode === undefined ? undefined : /^(yes|true|on)$/i.test(pairs.ultracode),
  };
}

export function activate(file, flags, env = process.env) {
  const brief = readBrief(file);
  if (flags.cloud && flags.paste) throw new Error('--cloud and --paste are different destinations; pick one');
  if (flags.paste) return { paste: brief };
  const header = runSettings(fs.readFileSync(brief, 'utf8'));
  const options = { ...flags };
  for (const key of ['model', 'effort', 'launcher', 'ultracode']) if (options[key] === undefined) options[key] = header[key];
  if (options.effort && !EFFORTS.has(options.effort)) throw new Error(`effort is one of ${[...EFFORTS].join(', ')} (got ${options.effort})`);
  const checkout = identify(options.cwd || process.cwd()).checkout;
  const launcher = options.launcher || account(checkout, env);
  const prefix = options.ultracode ? 'ultracode: ' : '';
  const where = `cd ${cdPath(tilde(checkout))} && ${launcher}`;
  if (options.cloud) return { line: `${where} --cloud "${prefix}$(cat ${quote(brief)})"` };
  const name = slugify(options.name || path.basename(brief, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
  const cli = [name && `-n ${name}`, options.model && `--model ${quote(options.model)}`, options.effort && `--effort ${options.effort}`].filter(Boolean);
  const prompt = `${prefix}${prefix ? 'run' : 'Run'} the brief at ${brief}`;
  return { line: [where, ...cli, quote(prompt)].join(' ') };
}

export function reviewPrompt(brief, text) {
  return `You are the builder who will carry out the brief below in a fresh session, with only the brief and this repository (read-only tools). The brief file is ${brief}.

Read it as that builder before starting, then report compactly:
1. Questions you would have to ask before starting, each tagged ANSWERED (say where the brief or a file answers it), MINOR (you would decide it yourself; give your default) or USER (only Nebi can decide; give a recommended answer).
2. Gaps that would change the work or its proof: a missing or unrunnable done-check, unclear scope, a near miss that would pass for done, missing inputs, risks before irreversible steps, installed skills or tools that clearly apply.
3. Contradictions inside the brief.
4. Whether the run settings in its header (model, effort, ultracode) fit the work.

Look up only what the brief points at or what one of your questions needs; no broad searches across the disk. Skip style and wording. Report every finding that would change the work; the lead filters. If nothing would, answer READY and stop. Do not start the task.

--- BRIEF ---
${text}`;
}

export function reviewArgs(options) {
  if (!options.model) throw new Error('review needs --model (the core\'s highest-capability binding)');
  const effort = options.effort || 'high';
  if (!EFFORTS.has(effort)) throw new Error(`--effort is one of ${[...EFFORTS].join(', ')}`);
  return ['-p', '--model', options.model, '--effort', effort, '--tools', REVIEW_TOOLS,
    '--allowedTools', REVIEW_TOOLS, '--strict-mcp-config', '--no-session-persistence'];
}

function review(file, options) {
  const brief = readBrief(file);
  const args = [...reviewArgs(options), '--add-dir', path.dirname(brief)];
  const input = reviewPrompt(brief, fs.readFileSync(brief, 'utf8'));
  const cwd = identify(options.cwd || process.cwd()).checkout;
  if (options['dry-run']) return { stdout: JSON.stringify({ cwd, args, input }, null, 2), status: 0 };
  const result = spawnSync(process.env.NEBI_CLAUDE_BIN || 'claude', args, {
    cwd, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    timeout: Number(options.timeout || 600) * 1000,
    env: { ...process.env, TE_SIDECALL: '1' },
  });
  if (result.error) throw new Error(`review did not finish: ${result.error.message}`);
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function main() {
  const { command, options } = parse(process.argv.slice(2));
  if (!command || options.help || command === '--help') { console.log(USAGE); return; }
  if (command === 'save') { console.log(save(options, fs.readFileSync(0, 'utf8'))); return; }
  if (command === 'activate') {
    const result = activate(options._[0], options);
    if (result.paste) {
      const copied = spawnSync('pbcopy', { input: fs.readFileSync(result.paste, 'utf8') });
      if (copied.status !== 0) throw new Error('pbcopy failed; open the brief file and copy it by hand');
      console.log(`Copied ${result.paste} to the clipboard.`);
    } else console.log(result.line);
    return;
  }
  if (command === 'review') {
    const result = review(options._[0], options);
    process.stdout.write(result.stdout || '');
    if (result.status !== 0) { process.stderr.write(result.stderr || ''); process.exitCode = result.status || 1; }
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
