#!/usr/bin/env node
// Use the installed client's parser and hashes, never a homemade trust hash.
// Default is read-only. --trust is explicit activation of reviewed Nebi hooks.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let trust = false;
let targetHome = os.homedir();
let cwd = process.cwd();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--trust') trust = true;
  else if (args[i] === '--home' && args[i + 1]) targetHome = path.resolve(args[++i]);
  else if (args[i] === '--cwd' && args[i + 1]) cwd = path.resolve(args[++i]);
  else if (args[i] === '--help') {
    console.log('Usage: node scripts/codex-hooks.mjs [--home <directory>] [--cwd <project>] [--trust]');
    console.log('Read native hook status. --trust activates only the six reviewed Nebi command hooks; disabled hooks are never enabled. Run deploy.mjs --verify first.');
    process.exit(0);
  } else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}

const codexHome = path.join(targetHome, '.codex');
const sourcePath = path.join(codexHome, 'hooks.json');
const samePath = (a, b) => {
  try { return fs.realpathSync(a) === fs.realpathSync(b); }
  catch { return path.resolve(a) === path.resolve(b); }
};
if (trust) {
  const verified = spawnSync(process.execPath, [fileURLToPath(new URL('../deploy.mjs', import.meta.url)), '--verify', '--home', targetHome], { encoding: 'utf8' });
  if (verified.status !== 0) {
    console.error(verified.stderr || 'Installed source verification failed.');
    process.exit(1);
  }
}
const specs = new Map([
  ['sessionStart', ['session-start.mjs', 10, null]],
  ['userPromptSubmit', ['feedback-capture.mjs', 5, null]],
  ['preToolUse', ['steer-channel.mjs', 10, null]],
  ['postToolUse', ['tool-ledger.mjs', 10, 'Bash|Edit|Write|MultiEdit|apply_patch']],
  ['stop', ['verify-before-stop.mjs', 10, null]],
  ['sessionEnd', ['session-end-state.mjs', 3, null]],
]);
const quote = value => process.platform === 'win32' ? `"${value.replace(/"/g, '\\"')}"` : `'${value.replace(/'/g, "'\"'\"'")}'`;
const child = spawn('codex', ['app-server', '--stdio'], {
  env: { ...process.env, CODEX_HOME: codexHome }, stdio: ['pipe', 'pipe', 'pipe'],
});
const pending = new Map();
let nextId = 0;
const timer = setTimeout(() => {
  for (const item of pending.values()) item.reject(new Error('Codex app-server timed out.'));
  child.kill();
}, 30000);
child.stderr.resume(); // Native logs may contain account context; don't print them.
child.on('error', error => { for (const item of pending.values()) item.reject(error); });
child.on('exit', code => {
  for (const item of pending.values()) item.reject(new Error(`Codex app-server exited (${code}).`));
});
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  let value;
  try { value = JSON.parse(line); } catch { return; }
  const item = pending.get(value.id);
  if (!item) return;
  pending.delete(value.id);
  if (value.error) item.reject(new Error(value.error.message));
  else item.resolve(value.result);
});
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

try {
  await request('initialize', { clientInfo: { name: 'nebi_hook_check', version: '1.0.0' } });
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  async function inspect() {
    const response = await request('hooks/list', { cwds: [cwd] });
    const entry = response.data.find(value => samePath(value.cwd, cwd));
    if (!entry || entry.errors.length) throw new Error('Native hook loading failed; inspect /hooks for parser errors.');
    const hooks = entry.hooks.filter(hook => samePath(hook.sourcePath, sourcePath) && specs.has(hook.eventName));
    // Fail closed on missing, duplicate, or unfamiliar definitions before trust.
    const selected = [];
    for (const [event, [file, timeout, matcher]] of specs) {
      const matches = hooks.filter(hook => hook.eventName === event &&
        hook.command === `node ${quote(path.join(codexHome, 'hooks', file))}`);
      if (matches.length !== 1 || matches[0].handlerType !== 'command' ||
          matches[0].timeoutSec !== timeout || matches[0].matcher !== matcher || matches[0].async) {
        throw new Error(`Expected exactly one current Nebi ${event} hook. Run deploy.mjs --verify.`);
      }
      selected.push(matches[0]);
    }
    return selected;
  }
  let hooks = await inspect();
  if (trust) {
    if (hooks.some(hook => !hook.enabled)) throw new Error('A Nebi hook is disabled; its owner choice was preserved.');
    for (const hook of hooks) {
      if (hook.trustStatus === 'trusted' || hook.trustStatus === 'managed') continue;
      await request('config/value/write', {
        keyPath: 'hooks.state',
        value: { [hook.key]: { trusted_hash: hook.currentHash } },
        mergeStrategy: 'upsert',
      });
    }
    hooks = await inspect();
  }
  console.log(JSON.stringify(hooks.map(hook => ({
    event: hook.eventName, enabled: hook.enabled, trust: hook.trustStatus, timeout: hook.timeoutSec,
  })), null, 2));
  if (hooks.some(hook => !hook.enabled || !['trusted', 'managed'].includes(hook.trustStatus))) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  lines.close();
  child.stdin.end();
  child.kill();
}
