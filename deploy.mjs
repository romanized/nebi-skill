#!/usr/bin/env node
/**
 * deploy.mjs: deploy the Nebi setup to Claude Code and Codex.
 *
 * Usage:  node deploy.mjs [backup-suffix] [--home <directory>] [--check]
 *
 * - Copies the master files (CLAUDE.md, rules, skills + evals, output-style, nebi/ tools
 *   including the browser route and router, hooks).
 * - Seeds runtime files only if missing. Existing runtime state is never overwritten.
 * - Merges into ~/.claude/settings.json: statusLine (re-run every 5 s), outputStyle, one
 *   claudeMdExcludes entry (~/AGENTS.md), a default skillListingBudgetFraction, the
 *   doctrine's quiet-screen keys (theme, turn duration, recaps, Bash diffs, tips,
 *   prompt suggestions, tab progress bar), its env keys (idle notice, autoupdater),
 *   its enabledPlugins entries (the nebi mods, the "you should know" note), and hooks
 *   (SessionStart sweep, UserPromptSubmit feedback capture, PreToolUse steer channel,
 *   PostToolUse/PostToolUseFailure tool ledger, Stop proof nudge, SessionEnd state
 *   refresh) WITHOUT touching anything else in the file.
 * - macOS: writes and loads the com.nebi.claude-update LaunchAgent (daily 05:30
 *   `claude update`), because the env turns the in-session autoupdater off.
 * - Reports measured skill-listing size, bindings dates, and core section parity.
 * - Copies the Codex master to ~/.codex/AGENTS.md, the seven common skills to
 *   ~/.agents/skills/, and Nebi sources/state to ~/.codex/nebi/. Codex settings,
 *   hooks, and rules are not touched.
 * - Preflights every required master AND both JSON merge targets before the
 *   first deploy write, then byte-verifies every copied file against its master.
 * - Backs up settings.json, ~/.codex/hooks.json, and an existing ~/.codex/AGENTS.md
 *   before replacing them (<file>.<suffix>, default "nebi-bak"; override via
 *   arg or NEBI_BAK_SUFFIX env var). An existing backup is never overwritten:
 *   the first run's copy stays the pristine pre-Nebi state.
 *
 * `--home` makes an explicit, isolated target root possible for tests and
 * staging. `--check` (or `--dry-run`) performs every preflight validation but
 * never creates, copies, backs up, or rewrites a target file.
 *
 * Cross-platform: Windows (win32) and macOS/Linux, Node 18+.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// ---------------------------------------------------------------------------
// Constants & environment
// ---------------------------------------------------------------------------

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(REPO_ROOT, 'claude-home');
const CODEX_SOURCE_DIR = path.join(REPO_ROOT, 'codex-home');

let OPTIONS;
try {
  OPTIONS = parseArguments(process.argv.slice(2));
} catch (err) {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
}
const HOME = OPTIONS.home;
const TARGET_DIR = path.join(HOME, '.claude');
const CODEX_TARGET_DIR = path.join(HOME, '.codex');
const AGENT_SKILLS_TARGET_DIR = path.join(HOME, '.agents', 'skills');

const IS_WINDOWS = process.platform === 'win32';
const PLATFORM_LABEL = IS_WINDOWS
  ? 'Windows'
  : process.platform === 'darwin'
    ? 'macOS'
    : 'Linux';

const COMMON_SKILLS = [
  'nebi-orchestration',
  'nebi-debugging',
  'nebi-sessions',
  'nebi-maintenance',
  'nebi-prompting',
  'nebi-research',
  'nebi-hillclimb',
];

// Claude-only skills: they drive Claude Code itself, or arrived while Codex is parked (tikhub).
const CLAUDE_ONLY_SKILLS = ['nebi-mod-verify', 'codex-browser', 'tikhub', 'nebi-tools'];

// Local run cruft inside a skill folder is never deploy input.
const SKIPPED_ENTRIES = new Set(['__pycache__', '.DS_Store']);

const SHARED_HOOK_FILES = [
  'hooks/runtime.mjs',
  'hooks/session-start.mjs',
  'hooks/steer-channel.mjs',
  'hooks/tool-ledger.mjs',
  'hooks/verify-before-stop.mjs',
  'hooks/session-end-state.mjs',
  'hooks/feedback-capture.mjs',
];
// The upstream register and its read-only status checker ship to both clients.
const SHARED_RUNTIME_FILES = [...SHARED_HOOK_FILES, 'nebi/context.mjs', 'nebi/upstreams.mjs', 'nebi/upstreams.json', 'nebi/skill-usage.mjs', 'nebi/term.mjs'];

// Non-skill masters are deliberately explicit: a runtime log, local scratch
// file, or .DS_Store added below claude-home/ must never become deploy input.
// Each supported skill directory is recursive so its new resources reach both
// Claude and Codex without another manifest edit.
const NON_SKILL_FILES = [
  'CLAUDE.md',
  'rules/code-quality.md',
  'rules/writing.md',
  'commands/sharpen.md',
  'output-styles/nebi.md',
  'nebi/statusline.mjs',
  'nebi/SOURCES.md',
  'nebi/session-start-sweep.ps1',
  'nebi/session-start-sweep.sh',
  'nebi/run-trigger-evals.mjs',
  // Browser route (mods/CONTRACT.md "Route"): reader and $BROWSER router. The account defaults
  // (nebi/browsers.json) are a seed: they name this machine's Chrome profiles and devices.
  'nebi/route.mjs',
  'nebi/browser-open',
  // Denies pkill calls that would kill other sessions and Chrome (Claude Bash only).
  'hooks/kill-guard.mjs',
  // Codex computer-use bridge for Claude (skills/codex-browser): any browser, any account.
  'nebi/codex-browser.mjs',
  // Live sessions on every Claude account, with their SendMessage address.
  'nebi/peers.mjs',
  // Read-only check: would subagentPromptCacheTtl 1h pay off? (upstream gist, pinned in upstreams.json)
  'nebi/cache_gap_check.py',
  ...SHARED_RUNTIME_FILES,
  'agents/nebi-scout.md',
  'agents/nebi-checker.md',
  'agents/nebi-builder.md',
  'handoffs/README.md',
];
const SKILL_FILES = [...COMMON_SKILLS, ...CLAUDE_ONLY_SKILLS].flatMap((name) =>
  listFilesRecursively(path.join(SOURCE_DIR, 'skills', name)).map((rel) => `skills/${name}/${rel}`),
);
const FILES = [...NON_SKILL_FILES, ...SKILL_FILES];

// Discovery deploys new resources automatically. These are the indispensable
// files whose absence must still fail preflight rather than shrink FILES.
const REQUIRED_CLAUDE_MASTERS = [
  'CLAUDE.md',
  'commands/sharpen.md',
  'output-styles/nebi.md',
  'rules/code-quality.md',
  'rules/writing.md',
  'nebi/SOURCES.md',
  'nebi/failure-log.md',
  'nebi/statusline.mjs',
  'nebi/session-start-sweep.ps1',
  'nebi/session-start-sweep.sh',
  'nebi/run-trigger-evals.mjs',
  'hooks/steer-channel.mjs',
  'hooks/tool-ledger.mjs',
  'hooks/verify-before-stop.mjs',
  'hooks/session-end-state.mjs',
  'hooks/feedback-capture.mjs',
  'nebi/upstreams.mjs',
  'nebi/upstreams.json',
  'nebi/skill-usage.mjs',
  'nebi/route.mjs',
  'nebi/browsers.json',
  'nebi/browser-open',
  ...CLAUDE_ONLY_SKILLS.map((name) => `skills/${name}/SKILL.md`),
  'handoffs/README.md',
];

// The $BROWSER router is run directly by Claude Code, so it must stay executable.
const EXECUTABLE_FILES = ['nebi/browser-open'];

// Runtime files: seeded on first deploy, never overwritten after (they hold
// live data the masters must not clobber).
const SEED_FILES = [
  'nebi/failure-log.md',
  // The repo copy holds placeholder device IDs; the live file is edited per machine and never overwritten.
  'nebi/browsers.json',
];

// Codex gets one explicit core plus the seven common, model-free skills.
const CODEX_FILES = ['AGENTS.md', 'agents/nebi-scout.toml', 'agents/nebi-checker.toml'];
const COMMON_SKILL_FILES = COMMON_SKILLS.flatMap((name) =>
  listFilesRecursively(path.join(SOURCE_DIR, 'skills', name)).map(
    (rel) => `skills/${name}/${rel}`,
  ),
);
const REQUIRED_COMMON_SKILL_MASTERS = COMMON_SKILLS.flatMap((name) => [
  `skills/${name}/SKILL.md`,
  `skills/${name}/evals/triggers.md`,
  `skills/${name}/evals/evals.json`,
]);
const CODEX_NEBI_SOURCE_FILES = ['nebi/SOURCES.md', 'nebi/failure-log.md'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function usageError(message) {
  return new Error(
    `${message}\nUsage: node deploy.mjs [backup-suffix] [--home <directory>] [--check | --verify]`,
  );
}

function usage() {
  return 'Usage: node deploy.mjs [backup-suffix] [--home <directory>] [--check | --verify]';
}

/** Parse the small CLI without treating an arbitrary value as a backup name. */
function parseArguments(args) {
  let home = os.homedir();
  let backupSuffix = process.env.NEBI_BAK_SUFFIX || 'nebi-bak';
  let backupSuffixSet = false;
  let check = false;
  let verify = false;
  let help = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--verify') {
      verify = true;
      continue;
    }
    if (arg === '--check' || arg === '--dry-run') {
      check = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--home') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw usageError('--home requires a directory.');
      home = path.resolve(value);
      continue;
    }
    if (arg.startsWith('--home=')) {
      const value = arg.slice('--home='.length);
      if (!value) throw usageError('--home requires a directory.');
      home = path.resolve(value);
      continue;
    }
    if (arg.startsWith('-')) throw usageError(`Unknown option: ${arg}`);
    if (backupSuffixSet) throw usageError(`Unexpected argument: ${arg}`);
    backupSuffix = arg;
    backupSuffixSet = true;
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(backupSuffix) || backupSuffix === '.' || backupSuffix === '..') {
    throw usageError(
      'Backup suffix must contain only letters, numbers, dots, underscores, and hyphens, and cannot be . or ...',
    );
  }
  if (check && verify) throw usageError('--check and --verify are separate read-only modes.');
  return { home, backupSuffix, check, verify, help };
}

/** Relative files below dir, sorted and using / on every platform. */
function listFilesRecursively(dir, prefix = '') {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => !SKIPPED_ENTRIES.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const rel = `${prefix}${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new Error(`Deploy masters must not contain symlinks: ${path.join(dir, entry.name)}`);
      }
      if (entry.isDirectory()) return listFilesRecursively(path.join(dir, entry.name), `${rel}/`);
      return entry.isFile() ? [rel] : [];
    });
}

/** Convert a manifest-relative path ("rules/writing.md") to a native path. */
function native(relPath) {
  return relPath.split('/').join(path.sep);
}

/** Quote one path for the shell used by command-string hooks. */
function shellQuote(value) {
  // cmd.exe uses backslashes literally, so escaping them would corrupt a
  // normal C:\\ path. This retains the previously supported Windows form.
  if (IS_WINDOWS) return `"${value.replace(/"/g, '\\"')}"`;
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function nodeCommand(script) {
  return `node ${shellQuote(script)}`;
}

/**
 * Write JSON atomically (a sibling temp file renamed over the target, so a
 * crash or a concurrent reader never sees half a file), then confirm the
 * exact bytes and parseable readback.
 */
function writeJsonAndVerify(file, value, label) {
  const expected = `${JSON.stringify(value, null, 2)}\n`;
  // A symlinked settings.json (a dotfiles repo) keeps its link: the rename lands on the real file,
  // or on the path a dangling link names.
  const isLink = fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
  const target = fs.existsSync(file)
    ? fs.realpathSync(file)
    : isLink ? path.resolve(path.dirname(file), fs.readlinkSync(file)) : file;
  // The temp file takes the old file's mode, so a 0600 settings.json stays 0600.
  const mode = fs.statSync(target, { throwIfNoEntry: false })?.mode;
  const temp = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, expected, 'utf8');
    if (mode !== undefined && !IS_WINDOWS) fs.chmodSync(temp, mode & 0o7777);
    fs.renameSync(temp, target);
  } finally {
    fs.rmSync(temp, { force: true });
  }
  const actual = fs.readFileSync(file, 'utf8');
  if (actual !== expected) throw new Error(`${label} readback did not match the written JSON.`);
  try {
    JSON.parse(actual);
  } catch (err) {
    throw new Error(`${label} readback is not valid JSON (${err.message}).`);
  }
}

/**
 * Recognize only the exact deployed script path, including legacy quote forms.
 * A filename substring is not ownership: it can belong to an unrelated hook.
 */
function commandRunsScript(command, script) {
  if (typeof command !== 'string') return false;
  if (command === nodeCommand(script)) return true;
  const quoted = command.match(/^node\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*$/);
  if (quoted) {
    const raw = quoted[1] ?? quoted[2];
    const unescaped = raw.replace(/\\([\\"'])/g, '$1');
    return unescaped === script;
  }
  return legacySweepRunsScript(command, script);
}

/**
 * The old SessionStart sweep as one command string: bash/sh <script>, or
 * powershell(.exe)/pwsh [flags] -File <script>, the script bare or quoted.
 * Only .sh and .ps1 scripts, and only as the last word.
 */
function legacySweepRunsScript(command, script) {
  if (!/\.(?:sh|ps1)$/.test(script)) return false;
  const words = [...command.matchAll(/"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+)/g)]
    .map((m) => m[1]?.replace(/\\([\\"'])/g, '$1') ?? m[2] ?? m[3]);
  if (words.length < 2 || words.at(-1) !== script) return false;
  const program = path.basename(words[0]).toLowerCase();
  if (program === 'bash' || program === 'sh') return words.length === 2;
  return ['powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'].includes(program) && words.at(-2).toLowerCase() === '-file';
}

/** Copy one file, creating parent directories. Returns true if copied. */
// Someone's own ~/.claude/CLAUDE.md survives as CLAUDE.md.<suffix> the first time the Nebi core replaces it.
function backupClaudeCore() {
  const dest = path.join(TARGET_DIR, 'CLAUDE.md');
  if (!fs.existsSync(dest) || fs.readFileSync(dest).equals(fs.readFileSync(path.join(SOURCE_DIR, 'CLAUDE.md')))) return;
  const { backupPath, created } = backupOnce(dest, OPTIONS.backupSuffix);
  if (created) console.log(`Backed up your existing CLAUDE.md to ${backupPath}`);
}

function copyFile(relPath) {
  const src = path.join(SOURCE_DIR, native(relPath));
  const dest = path.join(TARGET_DIR, native(relPath));

  if (!fs.existsSync(src)) return false;

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { force: true });
  if (!IS_WINDOWS && EXECUTABLE_FILES.includes(relPath)) fs.chmodSync(dest, 0o755);
  recordCopy(src, dest);
  return true;
}

/** Absolute native path to a deployed file under ~/.claude/. */
function deployedPath(relPath) {
  return path.join(TARGET_DIR, native(relPath));
}

/** Copy one file only if it doesn't exist at the target (runtime seeds). */
function seedFile(relPath) {
  const src = path.join(SOURCE_DIR, native(relPath));
  const dest = path.join(TARGET_DIR, native(relPath));

  if (!fs.existsSync(src)) return 'missing';
  if (fs.existsSync(dest)) return 'kept';

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest);
  recordCopy(src, dest);
  return 'seeded';
}

/** Copy one Codex master from codex-home/ into ~/.codex/. */
function copyCodexFile(relPath) {
  const src = path.join(CODEX_SOURCE_DIR, native(relPath));
  const dest = path.join(CODEX_TARGET_DIR, native(relPath));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { force: true });
  recordCopy(src, dest);
}

/** Copy one shared skill file from claude-home/skills/ into ~/.agents/skills/. */
function copyCommonSkillFile(relPath) {
  const src = path.join(SOURCE_DIR, native(relPath));
  const targetRel = relPath.replace(/^skills\//, '');
  const dest = path.join(AGENT_SKILLS_TARGET_DIR, native(targetRel));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { force: true });
  recordCopy(src, dest);
}

/** Write a runtime seed only when no target exists. */
function seedTextFile(dest, text) {
  if (fs.existsSync(dest)) return 'kept';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text, 'utf8');
  return 'seeded';
}

/**
 * Back up filePath to <filePath>.<suffix> — but never clobber an existing
 * backup: the first run's copy is the pristine pre-Nebi state, and a second
 * deploy would otherwise overwrite it with already-merged content.
 */
function backupOnce(filePath, backupSuffix) {
  const backupPath = `${filePath}.${backupSuffix}`;
  if (fs.existsSync(backupPath)) return { backupPath, created: false };
  fs.copyFileSync(filePath, backupPath);
  return { backupPath, created: true };
}

// Post-write verification (SOURCES.md deploy contract): every file copied or
// seeded from a master is recorded here and byte-compared against that master
// after the last write.
const VERIFY_LEDGER = [];

/** Record one master→deployed copy for post-write readback. */
function recordCopy(src, dest) {
  VERIFY_LEDGER.push({ src, dest });
}

/** Byte-compare every recorded copy with its master; fail loudly on mismatch. */
function verifyDeployedCopies() {
  const mismatched = [];
  for (const { src, dest } of VERIFY_LEDGER) {
    try {
      if (!fs.readFileSync(dest).equals(fs.readFileSync(src))) mismatched.push(dest);
    } catch (err) {
      mismatched.push(`${dest} (readback failed: ${err && err.message ? err.message : err})`);
    }
  }
  if (mismatched.length > 0) {
    throw new Error(
      [
        'Post-write verification FAILED — deployed files differ from their masters:',
        ...mismatched.map((f) => `  - ${f}`),
      ].join('\n'),
    );
  }
  console.log('');
  console.log(
    `Post-write verification: ${VERIFY_LEDGER.length} deployed files match their masters byte-for-byte.`,
  );
}

/** Every source the deploy may read, deduplicated by absolute path. */
function requiredMasterFiles() {
  const files = [
    ...FILES.map((rel) => path.join(SOURCE_DIR, native(rel))),
    ...REQUIRED_CLAUDE_MASTERS.map((rel) => path.join(SOURCE_DIR, native(rel))),
    ...SEED_FILES.map((rel) => path.join(SOURCE_DIR, native(rel))),
    ...CODEX_FILES.map((rel) => path.join(CODEX_SOURCE_DIR, native(rel))),
    ...COMMON_SKILL_FILES.map((rel) => path.join(SOURCE_DIR, native(rel))),
    ...REQUIRED_COMMON_SKILL_MASTERS.map((rel) => path.join(SOURCE_DIR, native(rel))),
    ...CODEX_NEBI_SOURCE_FILES.map((rel) => path.join(SOURCE_DIR, native(rel))),
  ];
  return [...new Set(files)];
}

/** Fail before mutation when any required deploy input is missing. */
function preflightMasters() {
  const missingOrSymlinked = requiredMasterFiles().filter((file) => {
    try {
      const stat = fs.lstatSync(file);
      return stat.isSymbolicLink() || !stat.isFile();
    } catch {
      return true;
    }
  });
  if (missingOrSymlinked.length === 0) return;
  throw new Error(
    [
      'Preflight failed. Required masters are missing, non-files, or symlinks; no deploy target was changed:',
      ...missingOrSymlinked.map((file) => `  - ${file}`),
    ].join('\n'),
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const CLAUDE_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SessionEnd'];

/** Reject shapes that a merge would otherwise silently replace or discard. */
function validateClaudeSettings(settings, label) {
  if (!isPlainObject(settings)) {
    throw new Error(`${label} does not contain a JSON object.`);
  }
  if (Object.hasOwn(settings, 'claudeMdExcludes') && !Array.isArray(settings.claudeMdExcludes)) {
    throw new Error(`${label}.claudeMdExcludes must be an array when present.`);
  }
  for (const key of ['env', 'enabledPlugins']) {
    if (Object.hasOwn(settings, key) && !isPlainObject(settings[key])) {
      throw new Error(`${label}.${key} must be a JSON object when present.`);
    }
  }
  if (!Object.hasOwn(settings, 'hooks')) return;
  if (!isPlainObject(settings.hooks)) {
    throw new Error(`${label}.hooks must be a JSON object when present.`);
  }
  for (const event of CLAUDE_HOOK_EVENTS) {
    if (!Object.hasOwn(settings.hooks, event)) continue;
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) {
      throw new Error(`${label}.hooks.${event} must be an array when present.`);
    }
    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      if (!isPlainObject(group) || !Array.isArray(group.hooks)) {
        throw new Error(`${label}.hooks.${event}[${i}] must be an object with a hooks array.`);
      }
    }
  }
}

/**
 * Fail before mutation when an existing JSON merge target cannot be merged:
 * discovering this mid-run would leave Claude deployed and Codex untouched,
 * so both targets are checked before the first write.
 */
function preflightJsonTargets() {
  const targets = [
    { label: '~/.claude/settings.json', file: path.join(TARGET_DIR, 'settings.json') },
    { label: '~/.codex/hooks.json', file: path.join(CODEX_TARGET_DIR, 'hooks.json') },
  ];
  for (const { label, file } of targets) {
    if (!fs.existsSync(file)) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(
        `Preflight failed: ${label} exists but is not valid JSON (${err.message}). ` +
          'No deploy target was changed — fix or remove the file, then re-run deploy.',
      );
    }
    try {
      validateClaudeSettings(parsed, label);
    } catch (err) {
      throw new Error(
        `Preflight failed: ${err.message} No deploy target was changed — fix the file, then re-run deploy.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Settings merge
// ---------------------------------------------------------------------------

/** Build the statusLine setting for this machine. */
function buildStatusLine() {
  // Native home path: backslashes on Windows, forward slashes on mac/Linux.
  // JSON.stringify escapes the backslashes correctly when written to disk.
  const script = deployedPath('nebi/statusline.mjs');
  return {
    type: 'command',
    command: nodeCommand(script),
    padding: 0,
    // Re-run on a timer too, so other sessions' waits stay current while this one idles.
    refreshInterval: 5,
  };
}

/**
 * Node startup adapter shares the same protocol and runtime as the other hooks.
 * Keep accepting the older platform-specific sweep paths during replacement.
 */
function buildSweepHookGroup() {
  return buildNodeHookGroup('hooks/session-start.mjs', 10);
}

/** True only if a hook runs the matching deployed Nebi script. */
function isOurHook(hook, relPath, targetDir = TARGET_DIR) {
  if (!hook || typeof hook !== 'object') return false;
  const relPaths = Array.isArray(relPath) ? relPath : [relPath];
  return relPaths.some((rel) => {
    const script = path.join(targetDir, native(rel));
    return commandRunsScript(hook.command, script) ||
      (Array.isArray(hook.args) && hook.args.some((arg) => arg === script));
  });
}

/**
 * Replace-don't-duplicate merge for one hook event (SessionStart/Stop/SessionEnd):
 * strip any entry running our exact script path from every group, keep everything else
 * intact, then append the fresh group.
 */
function mergeHookEvent(eventGroups, relPath, freshGroup, targetDir = TARGET_DIR) {
  const groups = eventGroups ?? [];

  const cleaned = groups
    .map((group) => {
      if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) {
        return group; // unknown shape — leave it alone
      }
      const kept = group.hooks.filter((h) => !isOurHook(h, relPath, targetDir));
      if (kept.length === group.hooks.length) return group;
      return { ...group, hooks: kept };
    })
    // Drop groups we emptied out entirely (they only held our old entry).
    .filter(
      (group) =>
        !(group && typeof group === 'object' && Array.isArray(group.hooks) && group.hooks.length === 0),
    );

  cleaned.push(freshGroup);
  return cleaned;
}

/**
 * Hook group running a deployed .mjs via node (same form as statusLine).
 * Pass a matcher to scope tool events (PreToolUse/PostToolUse); omit it to
 * fire on every tool.
 */
function buildNodeHookGroup(relPath, timeout, matcher, targetDir = TARGET_DIR) {
  const group = {
    hooks: [
      {
        type: 'command',
        command: nodeCommand(path.join(targetDir, native(relPath))),
        timeout,
      },
    ],
  };
  if (matcher) group.matcher = matcher;
  return group;
}

/**
 * Merge our hooks into the existing hooks object, preserving every other
 * hook the user has: SessionStart sweep, PreToolUse steer channel,
 * PostToolUse/PostToolUseFailure tool ledger, Stop proof nudge, SessionEnd state refresh.
 * Pre-existing entries of ours (previous deploy / other OS) are replaced,
 * not duplicated.
 */
function mergeHooks(existingHooks) {
  const hooks =
    existingHooks && typeof existingHooks === 'object' && !Array.isArray(existingHooks)
      ? { ...existingHooks }
      : {};

  hooks.SessionStart = mergeHookEvent(
    hooks.SessionStart,
    ['nebi/session-start-sweep.sh', 'nebi/session-start-sweep.ps1', 'hooks/session-start.mjs'],
    buildSweepHookGroup(),
  );
  // Feedback capture is silent and regex-only, so it stays cheap on every prompt.
  hooks.UserPromptSubmit = mergeHookEvent(
    hooks.UserPromptSubmit,
    'hooks/feedback-capture.mjs',
    buildNodeHookGroup('hooks/feedback-capture.mjs', 5),
  );
  // Steer channel must stay cheap — it runs before EVERY tool call (no matcher).
  hooks.PreToolUse = mergeHookEvent(
    hooks.PreToolUse,
    'hooks/steer-channel.mjs',
    buildNodeHookGroup('hooks/steer-channel.mjs', 10),
  );
  // Kill guard only reads Bash commands; on 2026-10-12 a misparsed pkill killed every session twice.
  hooks.PreToolUse = mergeHookEvent(
    hooks.PreToolUse,
    'hooks/kill-guard.mjs',
    buildNodeHookGroup('hooks/kill-guard.mjs', 5, 'Bash'),
  );
  // Ledger only cares about commands and file writes — matcher keeps the
  // per-call overhead off read-only tools.
  hooks.PostToolUse = mergeHookEvent(
    hooks.PostToolUse,
    'hooks/tool-ledger.mjs',
    buildNodeHookGroup('hooks/tool-ledger.mjs', 10, 'Bash|Edit|Write|MultiEdit'),
  );
  hooks.PostToolUseFailure = mergeHookEvent(
    hooks.PostToolUseFailure,
    'hooks/tool-ledger.mjs',
    buildNodeHookGroup('hooks/tool-ledger.mjs', 10, 'Bash|Edit|Write|MultiEdit'),
  );
  // Stop nudge is a quick ledger read; SessionEnd shells out to git, and the
  // event's default timeout is short — give it more headroom.
  hooks.Stop = mergeHookEvent(
    hooks.Stop,
    'hooks/verify-before-stop.mjs',
    buildNodeHookGroup('hooks/verify-before-stop.mjs', 10),
  );
  hooks.SessionEnd = mergeHookEvent(
    hooks.SessionEnd,
    'hooks/session-end-state.mjs',
    buildNodeHookGroup('hooks/session-end-state.mjs', 15),
  );
  return hooks;
}

// ~/AGENTS.md is the Codex doctrine pointer. Claude Code 2.1.277+ loads AGENTS.md
// from ancestors of a project without CLAUDE.md, which would hand Claude the
// Codex core and model bindings. Project AGENTS.md files still load.
const HOME_AGENTS_MD = path.join(HOME, 'AGENTS.md');
const SKILL_LISTING_BUDGET_FRACTION = 0.02;

function mergeClaudeMdExcludes(existing) {
  const list = Array.isArray(existing) ? existing : [];
  return list.includes(HOME_AGENTS_MD) ? list : [...list, HOME_AGENTS_MD];
}

// Values the doctrine owns: deploy sets them on every run, whatever the file held.
// Each key name is checked against the 2.1.288 settings schema; theme lives in
// settings.json, which wins over the theme in ~/.claude.json.
const DOCTRINE_SETTINGS = {
  theme: 'auto',                   // follows Ghostty's light/dark switch
  showTurnDuration: false,         // "Cooked for 1m 23s"
  awaySummaryEnabled: false,       // "recap:" lines
  bashEditDiffEnabled: false,      // Bash "what this command changed" diffs
  spinnerTipsEnabled: false,
  promptSuggestionEnabled: false,  // ghost text proposing what to type
  terminalProgressBarEnabled: false,  // OSC 9;4 progress bar in the Ghostty tab
  preferredNotifChannel: 'terminal_bell',  // Ghostty marks the waiting tab (bell-features) instead of a banner
  autoCompactWindow: 600000,       // net above the 50–60% handoff habit; 1M models default to ~967K
};
const DOCTRINE_ENV = {
  CLAUDE_CODE_IDLE_THRESHOLD_MINUTES: '100000000',   // "new task? /clear to save …"
  CLAUDE_CODE_IDLE_TOKEN_THRESHOLD: '1000000000000',
  DISABLE_AUTOUPDATER: '1',  // "Update installed · Restart"; the LaunchAgent updates instead
  // Sub-agents and workflow agents with no model of their own run the default-builder binding
  // (CLAUDE.md §1) instead of inheriting the session's model. A dispatch `model` still wins.
  CLAUDE_CODE_SUBAGENT_MODEL: 'opus',
};
const NEBI_MODS = [
  'nebi-beacon', 'nebi-constellation', 'nebi-quiet', 'nebi-replies', 'nebi-receipt',
  'nebi-browser', 'nebi-session-guard', 'nebi-red-button', 'nebi-model-lock', 'nebi-wispr',
];
const RETIRED_MODS = ['nebi-aside', 'nebi-fleet-radar', 'nebi-plan-rail'];
const DOCTRINE_PLUGINS = {
  'cc-plugin-you-should-know@builtin': false,  // its 1/2/0 note offers answers
  ...Object.fromEntries(NEBI_MODS.map((name) => [`${name}@nebi-mods`, true])),
  ...Object.fromEntries(RETIRED_MODS.map((name) => [`${name}@nebi-mods`, false])),
};

/** Set the doctrine's keys; every other key in settings, env and enabledPlugins stays. */
function applyDoctrineSettings(settings) {
  Object.assign(settings, DOCTRINE_SETTINGS);
  settings.env = { ...(isPlainObject(settings.env) ? settings.env : {}), ...DOCTRINE_ENV };
  settings.enabledPlugins = {
    ...(isPlainObject(settings.enabledPlugins) ? settings.enabledPlugins : {}),
    ...DOCTRINE_PLUGINS,
  };
}

/** True when settings already hold every doctrine-owned value. */
function hasDoctrineSettings(settings) {
  const holds = (object, expected) =>
    isPlainObject(object) && Object.entries(expected).every(([key, value]) => object[key] === value);
  return holds(settings, DOCTRINE_SETTINGS) && holds(settings.env, DOCTRINE_ENV) &&
    holds(settings.enabledPlugins, DOCTRINE_PLUGINS);
}

/**
 * Read, merge, back up, and write ~/.claude/settings.json.
 * Only statusLine, outputStyle, hooks (our entries), one claudeMdExcludes entry,
 * a default skillListingBudgetFraction and the doctrine-owned keys are touched.
 * Returns { backupPath|null, backupCreated, hadExisting }.
 */
function mergeSettings(backupSuffix) {
  const settingsPath = path.join(TARGET_DIR, 'settings.json');

  let settings = {};
  let hadExisting = false;
  let backupPath = null;
  let backupCreated = false;

  if (fs.existsSync(settingsPath)) {
    hadExisting = true;
    const raw = fs.readFileSync(settingsPath, 'utf8');
    try {
      settings = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `~/.claude/settings.json exists but is not valid JSON (${err.message}). ` +
          `Refusing to overwrite it — fix or remove the file, then re-run deploy.`,
      );
    }
    validateClaudeSettings(settings, '~/.claude/settings.json');

    // Back up BEFORE writing anything — but never clobber an earlier backup.
    ({ backupPath, created: backupCreated } = backupOnce(settingsPath, backupSuffix));
  }

  settings.statusLine = buildStatusLine();
  settings.outputStyle = 'Nebi';
  settings.hooks = mergeHooks(settings.hooks);
  settings.claudeMdExcludes = mergeClaudeMdExcludes(settings.claudeMdExcludes);
  // The default 1% of context cuts newer skills down to bare names once the
  // listing is full; 2% keeps integrated skills' descriptions routable. An
  // explicit user value always wins.
  settings.skillListingBudgetFraction ??= SKILL_LISTING_BUDGET_FRACTION;
  applyDoctrineSettings(settings);

  fs.mkdirSync(TARGET_DIR, { recursive: true });
  writeJsonAndVerify(settingsPath, settings, '~/.claude/settings.json');

  return { backupPath, backupCreated, hadExisting };
}

// ---------------------------------------------------------------------------
// macOS update agent
// ---------------------------------------------------------------------------

// DISABLE_AUTOUPDATER stops only the in-session updater: `claude update` checks
// DISABLE_UPDATES alone (2.1.288), so this daily job keeps Claude Code current.
const UPDATE_AGENT_LABEL = 'com.nebi.claude-update';
const UPDATE_AGENT_COMMAND = 'claude update';

function updateAgentPath() {
  return path.join(HOME, 'Library', 'LaunchAgents', `${UPDATE_AGENT_LABEL}.plist`);
}

const xmlText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The agent's plist: `claude update` at 05:30 daily with the deploying shell's PATH. */
function updateAgentPlist() {
  const log = path.join(HOME, 'Library', 'Logs', `${UPDATE_AGENT_LABEL}.log`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${UPDATE_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>${UPDATE_AGENT_COMMAND}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xmlText(process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin')}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>5</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlText(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlText(log)}</string>
</dict>
</plist>
`;
}

/**
 * Write the agent when it differs, then (re)load it. launchd is touched only for
 * the real home: a staged --home writes the file but never replaces the live agent.
 * Returns a one-line outcome for the deploy log.
 */
function installUpdateAgent() {
  const file = updateAgentPath();
  const plist = updateAgentPlist();
  let changed = true;
  try { changed = fs.readFileSync(file, 'utf8') !== plist; } catch { /* first install */ }
  if (changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, plist, 'utf8');
  }
  if (HOME !== path.resolve(os.homedir())) return `${changed ? 'written' : 'unchanged'}; not loaded (staged --home)`;

  const service = `gui/${process.getuid()}/${UPDATE_AGENT_LABEL}`;
  const loaded = spawnSync('launchctl', ['print', service], { stdio: 'ignore' }).status === 0;
  if (loaded && !changed) return 'unchanged and loaded';
  if (loaded) spawnSync('launchctl', ['bootout', service], { stdio: 'ignore' });
  const boot = spawnSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, file], { encoding: 'utf8' });
  if (boot.status !== 0) {
    throw new Error(`launchctl bootstrap ${UPDATE_AGENT_LABEL} failed: ${(boot.stderr || boot.error?.message || '').trim()}`);
  }
  return `${changed ? 'written' : 'unchanged'} and loaded`;
}

// ---------------------------------------------------------------------------
// Skill-listing measurements
// ---------------------------------------------------------------------------

/** Frontmatter name/description char counts for one deployed SKILL.md. */
function skillListingSize(skillMdPath) {
  const raw = fs.readFileSync(skillMdPath, 'utf8');
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const nameMatch = fm[1].match(/^name:\s*(.*)$/m);
  // description can be a single line or a folded multi-line block — count
  // every line until the next top-level "key:" line.
  let description = '';
  const lines = fm[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^description:\s*(.*)$/);
    if (!m) continue;
    const parts = [decodeYamlDescriptionScalar(m[1])];
    for (let j = i + 1; j < lines.length && !/^[A-Za-z_-]+:/.test(lines[j]); j++) {
      parts.push(lines[j].trim());
    }
    description = parts.join(' ').trim();
    break;
  }
  const name = nameMatch ? nameMatch[1].trim() : '';
  return { name, chars: name.length + description.length };
}

/** Count JSON-quoted YAML descriptions without their serialization quotes. */
function decodeYamlDescriptionScalar(value) {
  const trimmed = value.trim();
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/**
 * Scan deployed ~/.claude/skills/ and report the measured frontmatter listing.
 * Clients expose and consume skill listings differently, so this does not claim
 * a universal character or skill-count ceiling.
 */
function reportSkillListingMeasurements() {
  const skillsDir = path.join(TARGET_DIR, 'skills');
  console.log('');
  console.log('Skill-listing measurements (~/.claude/skills/*/SKILL.md frontmatter):');

  let entries = [];
  try {
    for (const dir of fs.readdirSync(skillsDir).sort()) {
      const skillMd = path.join(skillsDir, dir, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      try {
        const size = skillListingSize(skillMd);
        if (size) entries.push({ dir, ...size });
      } catch { /* unreadable SKILL.md — skip it */ }
    }
  } catch {
    console.log('  (no deployed skills dir found — skipped)');
    return;
  }

  const total = entries.reduce((n, e) => n + e.chars, 0);
  console.log(`  ${entries.length} skills, ${total} name+description chars`);
  console.log('  Compare with the active client\'s diagnostics and focused trigger recall; no universal count applies.');

  reportOtherSkillSurfaces();
}

/** Directories under `dir` (fixed depth, no symlink chasing); [] on any error. */
function subdirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** Sum frontmatter name+description chars for every SKILL.md in skillDirs. */
function surfaceTotal(skillDirs) {
  let count = 0;
  let chars = 0;
  for (const dir of skillDirs) {
    const skillMd = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    try {
      const size = skillListingSize(skillMd);
      if (size) {
        count += 1;
        chars += size.chars;
      }
    } catch { /* unreadable SKILL.md — skip it */ }
  }
  return { count, chars };
}

/**
 * Other clients may discover skills from more surfaces than ~/.claude/skills.
 * Report raw measurements only; availability and context cost are client-specific.
 */
function reportOtherSkillSurfaces() {
  const surfaces = [
    {
      label: '~/.agents/skills',
      // ~/.agents/skills/*/SKILL.md
      dirs: subdirs(path.join(HOME, '.agents', 'skills')),
    },
    {
      label: '~/.claude/plugins/cache',
      // ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/*/SKILL.md
      dirs: subdirs(path.join(TARGET_DIR, 'plugins', 'cache'))
        .flatMap(subdirs)
        .flatMap(subdirs)
        .flatMap((versionDir) => subdirs(path.join(versionDir, 'skills'))),
    },
  ];

  const found = surfaces
    .map((s) => ({ label: s.label, ...surfaceTotal(s.dirs) }))
    .filter((s) => s.count > 0);
  if (found.length === 0) return;

  console.log('  other skill surfaces (client discovery and loading behavior varies):');
  for (const s of found) {
    console.log(`    ${s.label}: ${s.count} skills, ${s.chars} chars`);
  }
}

// ---------------------------------------------------------------------------
// Bindings-parity check across all harness cores
// ---------------------------------------------------------------------------

/** The two harness cores whose parity the reports below check. */
const HARNESS_CORES = [
  { label: 'claude-home/CLAUDE.md', file: path.join(SOURCE_DIR, 'CLAUDE.md') },
  { label: 'codex-home/AGENTS.md', file: path.join(CODEX_SOURCE_DIR, 'AGENTS.md') },
];

/** The dated "as of **YYYY-MM-DD**" from a bindings table; null if absent. */
function bindingsDate(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return raw.match(/as of\s+\*{0,2}(\d{4}-\d{2}-\d{2})\*{0,2}/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Harness bindings differ by model, but their review dates move together.
 * Report-only, never fails the deploy.
 */
function reportBindingsParity() {
  const cores = HARNESS_CORES.map((core) => ({ ...core, date: bindingsDate(core.file) }));

  console.log('');
  if (cores.some((core) => !core.date)) {
    console.log('Bindings parity: an "as of" date is missing from at least one harness core.');
    for (const core of cores) console.log(`  ${core.label.padEnd(40)} ${core.date ?? '(missing)'}`);
    return;
  }
  const dates = new Set(cores.map((core) => core.date));
  if (dates.size === 1) {
    console.log(`Bindings parity: both harness cores dated ${cores[0].date}, in sync.`);
  } else {
    console.log('WARNING: split-brain bindings dates across harness cores');
    for (const core of cores) console.log(`  ${core.label.padEnd(40)} as of ${core.date}`);
    console.log('  Refresh both tables and dates in one edit.');
  }
}

/**
 * Section ids of one core's "## " headings, normalized to the leading section
 * number ("0", "3b", "10") so wording variants across harnesses don't read as
 * drift; an unnumbered heading falls back to its full text. Null if unreadable.
 */
function sectionIds(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^##\s/.test(line))
      .map((line) => {
        const heading = line.replace(/^##\s+/, '').trim();
        const num = heading.match(/^(\d+[a-z]?)[.:\s]/i);
        return num ? `§${num[1]}` : heading;
      });
  } catch {
    return null;
  }
}

/**
 * Report-only diff of the section sets across the two harness cores: a
 * section present in some cores but not others is exactly the drift the
 * dates-and-sizes checks cannot see. Never fails the deploy.
 */
function reportCoreSectionParity() {
  const cores = HARNESS_CORES.map((core) => ({ ...core, sections: sectionIds(core.file) }));
  console.log('');
  if (cores.some((core) => core.sections === null)) {
    console.log('Core section parity: skipped — at least one harness core is unreadable.');
    return;
  }
  const union = [...new Set(cores.flatMap((core) => core.sections))];
  const partial = union.filter((id) => !cores.every((core) => core.sections.includes(id)));
  if (partial.length === 0) {
    console.log(`Core section parity: both harness cores carry the same ${union.length} sections.`);
    return;
  }
  console.log('Core section parity (report-only): sections present in some cores but not others:');
  for (const id of partial) {
    const missing = cores.filter((core) => !core.sections.includes(id)).map((core) => core.label);
    console.log(`  ${id}: missing from ${missing.join(', ')}`);
  }
  console.log('  Intentional trims are fine; unintentional drift should be fixed in the masters.');
}

const CODEX_HOOK_SPECS = [
  ['SessionStart', 'hooks/session-start.mjs', 10],
  ['UserPromptSubmit', 'hooks/feedback-capture.mjs', 5],
  ['PreToolUse', 'hooks/steer-channel.mjs', 10],
  ['PostToolUse', 'hooks/tool-ledger.mjs', 10, 'Bash|Edit|Write|MultiEdit|apply_patch'],
  ['Stop', 'hooks/verify-before-stop.mjs', 10],
  // Codex's native maximum is 3s, including shutdown. The script bounds Git reads.
  ['SessionEnd', 'hooks/session-end-state.mjs', 3],
];

function expectedCodexHooks(existing = {}) {
  const hooks = { ...existing };
  for (const [event, file, timeout, matcher] of CODEX_HOOK_SPECS) {
    hooks[event] = mergeHookEvent(hooks[event], file,
      buildNodeHookGroup(file, timeout, matcher, CODEX_TARGET_DIR), CODEX_TARGET_DIR);
  }
  return hooks;
}

function mergeCodexHooks() {
  const file = path.join(CODEX_TARGET_DIR, 'hooks.json');
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  validateClaudeSettings(existing, '~/.codex/hooks.json');
  if (fs.existsSync(file)) backupOnce(file, OPTIONS.backupSuffix);
  writeJsonAndVerify(file, { ...existing, hooks: expectedCodexHooks(existing.hooks) }, '~/.codex/hooks.json');
}

/** Source-to-installed verification. Read-only; runtime intent is never compared
 * to a seed, and hook trust is checked separately through Codex's native loader. */
function verifyInstalled() {
  const pairs = [
    ...FILES.map(rel => [path.join(SOURCE_DIR, native(rel)), path.join(TARGET_DIR, native(rel))]),
    ...CODEX_FILES.map(rel => [path.join(CODEX_SOURCE_DIR, native(rel)), path.join(CODEX_TARGET_DIR, native(rel))]),
    ...SHARED_RUNTIME_FILES.map(rel => [path.join(SOURCE_DIR, native(rel)), path.join(CODEX_TARGET_DIR, native(rel))]),
    ...COMMON_SKILL_FILES.map(rel => [path.join(SOURCE_DIR, native(rel)), path.join(AGENT_SKILLS_TARGET_DIR, native(rel.replace(/^skills\//, '')))]),
    [path.join(SOURCE_DIR, 'nebi/SOURCES.md'), path.join(CODEX_TARGET_DIR, 'nebi/SOURCES.md')],
  ];
  const errors = [];
  for (const [source, target] of pairs) {
    try {
      if (!fs.readFileSync(source).equals(fs.readFileSync(target))) errors.push(`Drift: ${target}`);
    } catch { errors.push(`Missing or unreadable: ${target}`); }
  }
  const check = (label, fn) => {
    try { if (!fn()) errors.push(`Configuration drift: ${label}`); }
    catch { errors.push(`Missing or invalid configuration: ${label}`); }
  };
  const same = isDeepStrictEqual;
  check('Claude Nebi settings/hooks', () => {
    const value = JSON.parse(fs.readFileSync(path.join(TARGET_DIR, 'settings.json'), 'utf8'));
    return same(value.statusLine, buildStatusLine()) && value.outputStyle === 'Nebi' && same(value.hooks, mergeHooks(value.hooks)) &&
      Array.isArray(value.claudeMdExcludes) && value.claudeMdExcludes.includes(HOME_AGENTS_MD) &&
      typeof value.skillListingBudgetFraction === 'number' && hasDoctrineSettings(value);
  });
  if (process.platform === 'darwin') {
    // PATH in the plist follows whichever shell deployed, so only the job itself is compared.
    check('Claude update agent', () => {
      const plist = fs.readFileSync(updateAgentPath(), 'utf8');
      return plist.includes(`<string>${UPDATE_AGENT_LABEL}</string>`) && plist.includes(`<string>${UPDATE_AGENT_COMMAND}</string>`);
    });
  }
  check('Codex Nebi hooks', () => {
    const value = JSON.parse(fs.readFileSync(path.join(CODEX_TARGET_DIR, 'hooks.json'), 'utf8'));
    return same(value.hooks, expectedCodexHooks(value.hooks));
  });
  if (errors.length) throw new Error(`Installed verification failed:\n${errors.map(e => `  ${e}`).join('\n')}`);
  console.log(`Installed verification passed: ${pairs.length} source files and both Nebi hook configurations match.`);
  console.log('Read-only check. Codex hook trust and client loading require native verification; this is not a runtime execution claim.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (OPTIONS.help) {
    console.log(usage());
    console.log('Use --home to target an isolated staging profile; --check and --dry-run never write.');
    console.log('--verify compares installed files and Nebi configuration with these masters without writing.');
    return;
  }
  preflightMasters();
  preflightJsonTargets();

  if (OPTIONS.verify) {
    verifyInstalled();
    return;
  }

  console.log(`nebi deploy — ${PLATFORM_LABEL}`);
  console.log(`  source: ${SOURCE_DIR}`);
  console.log(`  target: ${TARGET_DIR}`);
  console.log('');

  if (OPTIONS.check) {
    console.log('Check passed: required masters and existing JSON merge targets are valid.');
    console.log('No target files were created, copied, backed up, or rewritten.');
    return;
  }

  // --- 1. Copy files -------------------------------------------------------
  const copied = [];
  for (const relPath of FILES) {
    if (relPath === 'CLAUDE.md') backupClaudeCore();
    if (!copyFile(relPath)) throw new Error(`Master disappeared after preflight: ${relPath}`);
    copied.push(relPath);
  }

  console.log(`Copied ${copied.length}/${FILES.length} files into ~/.claude/:`);
  for (const f of copied) console.log(`  + ${f}`);

  // --- 1b. Seed runtime files (never overwritten) --------------------------
  console.log('');
  for (const relPath of SEED_FILES) {
    const result = seedFile(relPath);
    if (result === 'seeded') console.log(`Seeded ${relPath} (first deploy).`);
    else if (result === 'kept') console.log(`Kept existing ${relPath} (runtime data, not overwritten).`);
    else throw new Error(`Seed master disappeared after preflight: ${relPath}`);
  }

  console.log('Project/task context lives in ~/.agents/nebi/projects/. Legacy current-work.md is preserved, not seeded or updated.');

  // --- 1c. Skill-listing measurements + bindings parity --------------------
  reportSkillListingMeasurements();
  reportBindingsParity();
  reportCoreSectionParity();

  // --- 2. Merge settings.json ---------------------------------------------
  const { backupPath, backupCreated, hadExisting } = mergeSettings(OPTIONS.backupSuffix);

  console.log('');
  console.log('settings.json merged (everything else in it preserved):');
  if (hadExisting && backupCreated) console.log(`  backup written: ${backupPath}`);
  else if (hadExisting) console.log(`  backup kept from an earlier run (not clobbered): ${backupPath}`);
  else console.log('  no existing settings.json — created fresh');
  console.log('  statusLine  -> node statusline.mjs (refreshInterval 5 s)');
  console.log('  outputStyle -> "Nebi"');
  console.log(`  claudeMdExcludes += ${HOME_AGENTS_MD} (Codex pointer stays out of Claude sessions)`);
  console.log(`  skillListingBudgetFraction -> ${SKILL_LISTING_BUDGET_FRACTION} unless already set`);
  console.log(
    '  hooks.SessionStart -> node session-start.mjs (other hooks untouched)',
  );
  console.log('  hooks.UserPromptSubmit -> node feedback-capture.mjs (complaint/idea inbox, silent, timeout 5)');
  console.log('  hooks.PreToolUse  -> node steer-channel.mjs (AGENT_STOP kill switch + STEER.md inject, timeout 10)');
  console.log('  hooks.PostToolUse -> node tool-ledger.mjs (evidence ledger: Bash|Edit|Write|MultiEdit, timeout 10)');
  console.log('  hooks.PostToolUseFailure -> node tool-ledger.mjs (failed tool results, timeout 10)');
  console.log('  hooks.Stop        -> node verify-before-stop.mjs (soft §6 nudge, ledger-backed, timeout 10)');
  console.log('  hooks.SessionEnd  -> node session-end-state.mjs (session facts + ledger prune, timeout 15)');
  console.log(`  ${Object.entries(DOCTRINE_SETTINGS).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ')}`);
  console.log(`  env: ${Object.keys(DOCTRINE_ENV).join(', ')} (other env keys untouched)`);
  console.log(`  enabledPlugins: ${NEBI_MODS.length} nebi mods on; ${RETIRED_MODS.join(', ')} and cc-plugin-you-should-know off`);

  // --- 2b. Codex deploy (core + seven common skills + sources/state) ----------
  console.log('');
  const codexAgentsPath = path.join(CODEX_TARGET_DIR, 'AGENTS.md');
  const codexAgentsBackup = fs.existsSync(codexAgentsPath)
    ? backupOnce(codexAgentsPath, OPTIONS.backupSuffix)
    : null;
  for (const relPath of CODEX_FILES) copyCodexFile(relPath);
  for (const relPath of SHARED_RUNTIME_FILES) {
    const source = path.join(SOURCE_DIR, native(relPath));
    const target = path.join(CODEX_TARGET_DIR, native(relPath));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { force: true });
    recordCopy(source, target);
  }
  mergeCodexHooks();
  console.log(`Copied codex-home/AGENTS.md -> ${codexAgentsPath}`);
  if (codexAgentsBackup && codexAgentsBackup.created) console.log(`  backup written: ${codexAgentsBackup.backupPath}`);
  else if (codexAgentsBackup) console.log(`  backup kept from an earlier run (not clobbered): ${codexAgentsBackup.backupPath}`);
  else console.log('  no existing AGENTS.md — created fresh');

  const [codexSourcesSource, codexFailureSource] = CODEX_NEBI_SOURCE_FILES;
  const codexSourcesMaster = path.join(SOURCE_DIR, native(codexSourcesSource));
  const codexSourcesPath = path.join(CODEX_TARGET_DIR, native(codexSourcesSource));
  fs.mkdirSync(path.dirname(codexSourcesPath), { recursive: true });
  fs.cpSync(codexSourcesMaster, codexSourcesPath, { force: true });
  recordCopy(codexSourcesMaster, codexSourcesPath);
  console.log('Copied claude-home/nebi/SOURCES.md -> ~/.codex/nebi/SOURCES.md');

  for (const relPath of COMMON_SKILL_FILES) copyCommonSkillFile(relPath);
  console.log(`Copied ${COMMON_SKILLS.length} common Nebi skill directories and evals -> ~/.agents/skills/`);

  const codexFailureMaster = path.join(SOURCE_DIR, native(codexFailureSource));
  const codexFailureLogPath = path.join(CODEX_TARGET_DIR, native('nebi/failure-log.md'));
  const codexFailureResult = seedTextFile(codexFailureLogPath, fs.readFileSync(codexFailureMaster, 'utf8'));
  if (codexFailureResult === 'seeded') recordCopy(codexFailureMaster, codexFailureLogPath);
  console.log(`${codexFailureResult === 'seeded' ? 'Seeded' : 'Kept existing'} ~/.codex/nebi/failure-log.md.`);

  console.log('Codex shares project/task checkpoints in ~/.agents/nebi/; legacy current-work.md remains untouched.');
  console.log('Codex native agents and hooks deployed. Existing unrelated hooks preserved; config.toml unchanged.');
  console.log('New or changed Codex hook definitions need native trust review before activation.');

  // --- 2c. macOS update agent (the env turned the in-session updater off) ---
  if (process.platform === 'darwin') {
    console.log('');
    console.log(`LaunchAgent ${UPDATE_AGENT_LABEL} (daily 05:30 \`${UPDATE_AGENT_COMMAND}\`): ${installUpdateAgent()}`);
  }

  // --- 2d. Post-write verification (SOURCES.md deploy contract) ------------
  verifyDeployedCopies();

  // --- 3. find-skills check (informational only, never auto-run) -----------
  const findSkillsDir = path.join(TARGET_DIR, 'skills', 'find-skills');
  console.log('');
  if (fs.existsSync(findSkillsDir)) {
    console.log('find-skills: already installed.');
  } else {
    console.log('find-skills: NOT installed. To add it, run:');
    console.log('  npx skills add https://github.com/vercel-labs/skills --skill find-skills');
  }

  // --- 4. Wrap up -----------------------------------------------------------
  console.log('');
  console.log(`Note: the statusline runs via "node" — Node ${process.version} is on PATH here,`);
  console.log('and it must stay on PATH for the statusline to render inside Claude Code.');
  console.log('');
  console.log('Next: restart Claude Code / reload the window to pick up the new settings.');
  console.log('Codex picks up AGENTS.md and shared skills on its next task.');
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('DEPLOY FAILED — runtime errors after preflight may leave a partial deployment.');
  console.error(`  ${err && err.message ? err.message : String(err)}`);
  process.exitCode = 1;
}
