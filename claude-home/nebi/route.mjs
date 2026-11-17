// Nebi route: which Chrome profile and which Claude account a project uses.
// Spec: mods/CONTRACT.md, section "Route". The project file
// <git root>/.claude/browser.json wins, else the current account's default in
// ~/.claude/nebi/browsers.json, else no route (null). Node built-ins only, no
// git spawn, never throws: the status line calls this every 5 s.
// CLI: `node route.mjs [cwd]` prints the route as JSON (for non-Node callers).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCOUNTS = ['a', 'b'];

/** "a" for the default ~/.claude, "b" for ~/.claude-max2, null for any other config dir. */
export function currentAccount(env = process.env, home = os.homedir()) {
  const dir = env?.CLAUDE_CONFIG_DIR;
  if (!dir) return 'a';
  if (dir.includes('.claude-max2')) return 'b';
  const expanded = dir === '~' || dir.startsWith('~/') ? path.join(home, dir.slice(1)) : dir;
  return path.resolve(expanded) === path.resolve(home, '.claude') ? 'a' : null;
}

function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Nearest folder holding .git (a folder, or a file in a worktree or submodule).
function gitRoot(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const text = (value) => (typeof value === 'string' && value ? value : null);

// The browser half of a route, or null when the entry names no browser at all.
function browserOf(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const browser = { label: text(entry.label), chromeProfile: text(entry.chromeProfile), deviceId: text(entry.deviceId) };
  // Only routes that name one carry it, so older route consumers see the same shape.
  const codexBrowserId = text(entry.codexBrowserId);
  if (codexBrowserId) browser.codexBrowserId = codexBrowserId;
  return browser.label || browser.chromeProfile || browser.deviceId || codexBrowserId ? browser : null;
}

/**
 * Route for a working folder:
 * { label, chromeProfile, deviceId, codexBrowserId, claudeAccount, account, source: 'project' | 'account', mismatch } or null.
 */
export function resolveRoute({ cwd, env = process.env, home = os.homedir() } = {}) {
  try {
    const account = currentAccount(env, home);
    const root = typeof cwd === 'string' && cwd ? gitRoot(cwd) : null;
    const project = root ? readJson(path.join(root, '.claude', 'browser.json')) : null;
    const fromProject = browserOf(project);
    if (fromProject) {
      const claudeAccount = ACCOUNTS.includes(project.claudeAccount) ? project.claudeAccount : null;
      return { ...fromProject, claudeAccount, account, source: 'project', mismatch: claudeAccount !== null && claudeAccount !== account };
    }
    if (!account) return null;
    const defaults = readJson(path.join(home, '.claude', 'nebi', 'browsers.json'));
    const fromAccount = browserOf(defaults?.accounts?.[account]);
    return fromAccount ? { ...fromAccount, claudeAccount: account, account, source: 'account', mismatch: false } : null;
  } catch {
    return null;
  }
}

function invokedDirectly() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.stdout.write(`${JSON.stringify(resolveRoute({ cwd: process.argv[2] || process.cwd() }))}\n`);
}
