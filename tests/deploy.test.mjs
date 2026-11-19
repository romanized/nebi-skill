import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY = path.join(REPO_ROOT, 'deploy.mjs');
const TEMP_DIRS = [];

function tempDir(prefix = 'nebi-deploy-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TEMP_DIRS.push(dir);
  return dir;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function run(home, args = [], script = DEPLOY) {
  return spawnSync(process.execPath, [script, ...args, '--home', home], {
    cwd: path.dirname(script),
    encoding: 'utf8',
  });
}

function ownHookCount(groups, command) {
  return groups.flatMap((group) => group.hooks).filter((hook) => hook.command === command).length;
}

function quoteForCurrentPlatform(value) {
  if (process.platform === 'win32') return `"${value.replace(/"/g, '\\"')}"`;
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function nodeCommandForCurrentPlatform(script) {
  return `node ${quoteForCurrentPlatform(script)}`;
}

test.after(() => {
  for (const dir of TEMP_DIRS) fs.rmSync(dir, { recursive: true, force: true });
});

test('deploy preserves user state, replaces only exact Nebi hooks, and is idempotent', () => {
  const home = tempDir();
  const nebihook = `node "${path.join(home, '.claude', 'hooks', 'steer-channel.mjs')}"`;
  const externalHook = 'node "/tmp/not-nebi/steer-channel.mjs"';
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const agentsPath = path.join(home, '.codex', 'AGENTS.md');
  const initialSettings = {
    preserve: { answer: 42 },
    hooks: {
      CustomEvent: [{ hooks: [{ command: 'echo custom' }] }],
      PreToolUse: [
        { matcher: 'external', hooks: [{ command: externalHook }] },
        { hooks: [{ command: nebihook }] },
      ],
    },
  };
  writeJson(settingsPath, initialSettings);
  fs.mkdirSync(path.dirname(agentsPath), { recursive: true });
  fs.writeFileSync(agentsPath, 'custom Codex instructions\n');
  fs.mkdirSync(path.join(home, '.claude', 'nebi'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'my own doctrine\n');
  fs.writeFileSync(path.join(home, '.claude', 'nebi', 'failure-log.md'), 'keep Claude runtime\n');
  fs.writeFileSync(path.join(home, '.claude', 'nebi', 'current-work.md'), 'keep Claude work\n');

  const first = run(home);
  assert.equal(first.status, 0, first.stderr);
  const settings = readJson(settingsPath);
  const expectedSteer = nodeCommandForCurrentPlatform(path.join(home, '.claude', 'hooks', 'steer-channel.mjs'));
  assert.deepEqual(settings.preserve, initialSettings.preserve);
  assert.equal(settings.hooks.CustomEvent[0].hooks[0].command, 'echo custom');
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, externalHook);
  assert.equal(ownHookCount(settings.hooks.PreToolUse, expectedSteer), 1);
  assert.equal(fs.readFileSync(path.join(home, '.claude', 'nebi', 'failure-log.md'), 'utf8'), 'keep Claude runtime\n');
  assert.equal(fs.readFileSync(path.join(home, '.claude', 'nebi', 'current-work.md'), 'utf8'), 'keep Claude work\n');
  assert.deepEqual(readJson(`${settingsPath}.nebi-bak`), initialSettings);
  assert.equal(fs.readFileSync(`${agentsPath}.nebi-bak`, 'utf8'), 'custom Codex instructions\n');
  assert.equal(fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md.nebi-bak'), 'utf8'), 'my own doctrine\n');
  assert.equal(fs.existsSync(path.join(home, '.cursor')), false, 'deploy touches only Claude Code and Codex');

  const beforeSecondSettings = fs.readFileSync(settingsPath, 'utf8');
  const second = run(home);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), beforeSecondSettings);
  assert.deepEqual(readJson(`${settingsPath}.nebi-bak`), initialSettings);
  assert.equal(fs.readFileSync(path.join(home, '.claude', 'CLAUDE.md.nebi-bak'), 'utf8'), 'my own doctrine\n', 'the first backup stays');
});

test('malformed nested settings or hook shapes fail before any deployment write', () => {
  const cases = [
    ['settings hooks is an array', '.claude/settings.json', { hooks: [] }],
    ['settings event is an object', '.claude/settings.json', { hooks: { SessionStart: {} } }],
    ['settings group has no hook array', '.claude/settings.json', { hooks: { Stop: [{ hooks: {} }] } }],
    ['Codex Stop is malformed', '.codex/hooks.json', { hooks: { Stop: [{ hooks: {} }] } }],
  ];
  for (const [name, relative, malformed] of cases) {
    const home = tempDir();
    const malformedPath = path.join(home, relative);
    const sentinel = path.join(home, '.claude', 'CLAUDE.md');
    writeJson(malformedPath, malformed);
    fs.mkdirSync(path.dirname(sentinel), { recursive: true });
    fs.writeFileSync(sentinel, `sentinel ${name}\n`);
    const result = run(home);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, /Preflight failed/);
    assert.deepEqual(readJson(malformedPath), malformed);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), `sentinel ${name}\n`);
    assert.equal(fs.existsSync(path.join(home, '.codex', 'AGENTS.md')), false);
  }
});

test('--check and --dry-run validate without creating target paths', () => {
  for (const flag of ['--check', '--dry-run']) {
    const home = tempDir();
    fs.writeFileSync(path.join(home, 'sentinel.txt'), flag);
    const before = fs.readdirSync(home).sort();
    const result = run(home, [flag]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No target files were created/);
    assert.deepEqual(fs.readdirSync(home).sort(), before);
  }
});

test('odd target paths are shell-quoted in generated command strings', () => {
  const home = path.join(tempDir(), "odd ' $HOME `not-a-command`");
  const result = run(home);
  assert.equal(result.status, 0, result.stderr);
  const settings = readJson(path.join(home, '.claude', 'settings.json'));
  const script = path.join(home, '.claude', 'nebi', 'statusline.mjs');
  assert.equal(settings.statusLine.command, nodeCommandForCurrentPlatform(script));
  const hook = settings.hooks.PreToolUse.flatMap((group) => group.hooks).find((h) => h.command.includes('steer-channel.mjs'));
  assert.equal(
    hook.command,
    nodeCommandForCurrentPlatform(path.join(home, '.claude', 'hooks', 'steer-channel.mjs')),
  );
  if (process.platform !== 'win32') {
    const executed = spawnSync('/bin/sh', ['-c', settings.statusLine.command], { encoding: 'utf8' });
    assert.equal(executed.status, 0, executed.stderr);
  }
});

test('CLI rejects invalid arguments and unsafe backup suffixes before writes', () => {
  const home = tempDir();
  for (const args of [['--unknown'], ['--home'], ['../escape']]) {
    const result = run(home, args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.equal(fs.existsSync(path.join(home, '.claude')), false);
  }
});

test('--help is non-mutating', () => {
  const home = tempDir();
  const result = run(home, ['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Usage: node deploy\.mjs/m);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
});

test('Codex adapters deploy with native timeouts, preserve external hooks/config, and verify detects drift without writes', () => {
  const home = tempDir();
  const hookFile = path.join(home, '.codex/hooks.json');
  const configFile = path.join(home, '.codex/config.toml');
  const old = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo external' }] }] } };
  writeJson(hookFile, old);
  fs.writeFileSync(configFile, 'model = "preserve-choice"\n');
  const deployed = run(home);
  assert.equal(deployed.status, 0, deployed.stderr);
  const hooks = readJson(hookFile).hooks;
  assert.equal(hooks.Stop[0].hooks[0].command, 'echo external');
  assert.equal(hooks.SessionEnd.at(-1).hooks[0].timeout, 3);
  assert.equal(hooks.PostToolUse.at(-1).matcher, 'Bash|Edit|Write|MultiEdit|apply_patch');
  assert.equal(fs.readFileSync(configFile, 'utf8'), 'model = "preserve-choice"\n');
  assert.deepEqual(readJson(`${hookFile}.nebi-bak`), old);
  const verified = run(home, ['--verify']);
  assert.equal(verified.status, 0, verified.stderr);
  const script = path.join(home, '.codex/hooks/tool-ledger.mjs');
  fs.appendFileSync(script, '\n// local drift\n');
  const failed = run(home, ['--verify']);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Drift: .*tool-ledger/);
  assert.match(fs.readFileSync(script, 'utf8'), /local drift/);
  const second = run(home);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readJson(hookFile).hooks.Stop.length, 2);
});

test('installed verification ignores JSON object key order but detects changed hook values', () => {
  const home = tempDir();
  assert.equal(run(home).status, 0);
  const file = path.join(home, '.claude/settings.json');
  const settings = readJson(file);
  const group = settings.hooks.PostToolUse.at(-1);
  settings.hooks.PostToolUse[settings.hooks.PostToolUse.length - 1] = {
    matcher: group.matcher, hooks: group.hooks,
  };
  writeJson(file, settings);
  const before = fs.readFileSync(file, 'utf8');
  const verified = run(home, ['--verify']);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'verification stays read-only');
  settings.hooks.PostToolUse.at(-1).hooks[0].timeout += 1;
  writeJson(file, settings);
  const changed = run(home, ['--verify']);
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /Configuration drift: Claude/);
});

test('missing required masters fail before target writes and discovered resources deploy automatically', () => {
  const clone = tempDir('nebi-deploy-clone-');
  const repo = path.join(clone, 'repo');
  fs.cpSync(REPO_ROOT, repo, {
    recursive: true,
    filter: (source) => path.basename(source) !== '.git',
  });
  const clonedDeploy = path.join(repo, 'deploy.mjs');
  const resource = path.join(
    repo,
    'claude-home',
    'skills',
    'nebi-debugging',
    'references',
    'new-skill-resource.txt',
  );
  fs.mkdirSync(path.dirname(resource), { recursive: true });
  fs.writeFileSync(resource, 'deploy me\n');
  const resourceHome = tempDir();
  const resourceResult = run(resourceHome, [], clonedDeploy);
  assert.equal(resourceResult.status, 0, resourceResult.stderr);
  assert.equal(
    fs.readFileSync(
      path.join(resourceHome, '.claude', 'skills', 'nebi-debugging', 'references', 'new-skill-resource.txt'),
      'utf8',
    ),
    'deploy me\n',
  );
  assert.equal(
    fs.readFileSync(
      path.join(resourceHome, '.agents', 'skills', 'nebi-debugging', 'references', 'new-skill-resource.txt'),
      'utf8',
    ),
    'deploy me\n',
  );

  fs.unlinkSync(path.join(repo, 'claude-home', 'CLAUDE.md'));
  const missingHome = tempDir();
  const sentinel = path.join(missingHome, '.claude', 'sentinel.txt');
  fs.mkdirSync(path.dirname(sentinel), { recursive: true });
  fs.writeFileSync(sentinel, 'unchanged\n');
  const missingResult = run(missingHome, [], clonedDeploy);
  assert.notEqual(missingResult.status, 0);
  assert.match(missingResult.stderr, /CLAUDE\.md/);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'unchanged\n');
});

test('a symlinked master is rejected before a target write', { skip: process.platform === 'win32' }, () => {
  const clone = tempDir('nebi-deploy-symlink-');
  const repo = path.join(clone, 'repo');
  fs.cpSync(REPO_ROOT, repo, {
    recursive: true,
    filter: (source) => path.basename(source) !== '.git',
  });
  const skillResources = path.join(repo, 'claude-home', 'skills', 'nebi-debugging', 'references');
  fs.mkdirSync(skillResources, { recursive: true });
  fs.symlinkSync(
    path.join(repo, 'claude-home', 'hooks', 'steer-channel.mjs'),
    path.join(skillResources, 'unexpected-link.mjs'),
  );
  const home = tempDir();
  const result = run(home, ['--check'], path.join(repo, 'deploy.mjs'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not contain symlinks/);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
});

test('a symlinked explicit master is rejected before a target write', { skip: process.platform === 'win32' }, () => {
  const clone = tempDir('nebi-deploy-master-symlink-');
  const repo = path.join(clone, 'repo');
  fs.cpSync(REPO_ROOT, repo, {
    recursive: true,
    filter: (source) => path.basename(source) !== '.git',
  });
  const codexMaster = path.join(repo, 'codex-home', 'AGENTS.md');
  const realFile = `${codexMaster}.real`;
  fs.renameSync(codexMaster, realFile);
  fs.symlinkSync(realFile, codexMaster);
  const home = tempDir();
  const result = run(home, ['--check'], path.join(repo, 'deploy.mjs'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing, non-files, or symlinks/);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
});
test('failure events are registered and preserve unrelated failure hooks', () => {
  const home = tempDir();
  const target = path.join(home, '.claude/settings.json');
  const external = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo external-failure' }] };
  writeJson(target, { hooks: { PostToolUseFailure: [external] } });
  assert.equal(run(home).status, 0);
  const groups = readJson(target).hooks.PostToolUseFailure;
  assert.deepEqual(groups[0], external);
  assert.match(groups[1].hooks[0].command, /tool-ledger\.mjs/);
  assert.equal(run(home).status, 0);
  assert.equal(readJson(target).hooks.PostToolUseFailure.length, 2);
});

test('settings keep user excludes and budget, exclude ~/AGENTS.md once, and wire feedback capture in both clients', () => {
  const home = tempDir();
  const settingsPath = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ claudeMdExcludes: ['/work/legacy/CLAUDE.md'], skillListingBudgetFraction: 0.05 }));
  for (let i = 0; i < 2; i += 1) assert.equal(run(home).status, 0);
  const settings = readJson(settingsPath);
  assert.deepEqual(settings.claudeMdExcludes, ['/work/legacy/CLAUDE.md', path.join(home, 'AGENTS.md')]);
  assert.equal(settings.skillListingBudgetFraction, 0.05, 'an explicit user budget wins');
  const capture = nodeCommandForCurrentPlatform(path.join(home, '.claude', 'hooks', 'feedback-capture.mjs'));
  assert.deepEqual(settings.hooks.UserPromptSubmit.flatMap((g) => g.hooks.map((h) => h.command)), [capture]);
  const codex = readJson(path.join(home, '.codex', 'hooks.json'));
  assert.equal(JSON.stringify(codex.hooks.UserPromptSubmit).includes('feedback-capture.mjs'), true);
  for (const client of ['.claude', '.codex']) {
    assert.equal(fs.existsSync(path.join(home, client, 'nebi', 'upstreams.mjs')), true);
    assert.equal(fs.existsSync(path.join(home, client, 'nebi', 'upstreams.json')), true);
  }
  assert.equal(run(home, ['--verify']).status, 0);

  const fresh = tempDir();
  assert.equal(run(fresh).status, 0);
  assert.equal(readJson(path.join(fresh, '.claude', 'settings.json')).skillListingBudgetFraction, 0.02);
});

test('doctrine-owned settings are set on every run while other keys survive', () => {
  const home = tempDir();
  const settingsPath = path.join(home, '.claude', 'settings.json');
  writeJson(settingsPath, {
    theme: 'dark',
    showTurnDuration: true,
    spinnerTipsEnabled: true,
    terminalProgressBarEnabled: true,
    model: 'opus[1m]',
    env: { KEEP_ME: 'yes', DISABLE_AUTOUPDATER: '0' },
    enabledPlugins: {
      'stripe@claude-plugins-official': true,
      'nebi-beacon@nebi-mods': false,
      'nebi-aside@nebi-mods': true,
      'cc-plugin-you-should-know@builtin': true,
    },
  });
  assert.equal(run(home).status, 0);
  const settings = readJson(settingsPath);
  assert.equal(settings.statusLine.refreshInterval, 5);
  assert.equal(settings.model, 'opus[1m]');
  for (const [key, value] of Object.entries({
    theme: 'auto', showTurnDuration: false, awaySummaryEnabled: false,
    bashEditDiffEnabled: false, spinnerTipsEnabled: false, promptSuggestionEnabled: false,
    terminalProgressBarEnabled: false, preferredNotifChannel: 'terminal_bell',
  })) assert.equal(settings[key], value, key);
  assert.deepEqual(settings.env, {
    KEEP_ME: 'yes',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_IDLE_THRESHOLD_MINUTES: '100000000',
    CLAUDE_CODE_IDLE_TOKEN_THRESHOLD: '1000000000000',
    CLAUDE_CODE_SUBAGENT_MODEL: 'opus',
  });
  const mods = ['nebi-beacon', 'nebi-constellation', 'nebi-quiet', 'nebi-replies', 'nebi-receipt',
    'nebi-browser', 'nebi-session-guard', 'nebi-red-button', 'nebi-model-lock', 'nebi-wispr'];
  assert.deepEqual(settings.enabledPlugins, {
    'stripe@claude-plugins-official': true,
    'nebi-beacon@nebi-mods': true,
    'nebi-aside@nebi-mods': false,
    'cc-plugin-you-should-know@builtin': false,
    ...Object.fromEntries(mods.map((name) => [`${name}@nebi-mods`, true])),
    'nebi-fleet-radar@nebi-mods': false,
    'nebi-plan-rail@nebi-mods': false,
  });

  const first = fs.readFileSync(settingsPath, 'utf8');
  assert.equal(run(home).status, 0);
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), first, 'a second deploy changes nothing');
  assert.equal(run(home, ['--verify']).status, 0);
  writeJson(settingsPath, { ...readJson(settingsPath), theme: 'dark' });
  const drifted = run(home, ['--verify']);
  assert.equal(drifted.status, 1);
  assert.match(drifted.stderr, /Configuration drift: Claude/);
});

test('settings.json is replaced by rename, never rewritten in place, and a symlink keeps its link', () => {
  const home = tempDir();
  const settingsPath = path.join(home, '.claude', 'settings.json');
  writeJson(settingsPath, { keep: 1 });
  // A hard link shares the file's bytes: an in-place write would change it too.
  const twin = path.join(home, 'settings.twin.json');
  fs.linkSync(settingsPath, twin);
  assert.equal(run(home).status, 0);
  assert.deepEqual(readJson(twin), { keep: 1 }, 'the old file was not written in place');
  assert.equal(readJson(settingsPath).keep, 1);
  assert.deepEqual(fs.readdirSync(path.dirname(settingsPath)).filter((name) => name.endsWith('.tmp')), [], 'no temp file left behind');

  if (process.platform === 'win32') return;
  const linked = tempDir();
  const real = path.join(linked, 'dotfiles', 'settings.json');
  writeJson(real, { keep: 2 });
  fs.mkdirSync(path.join(linked, '.claude'), { recursive: true });
  fs.symlinkSync(real, path.join(linked, '.claude', 'settings.json'));
  assert.equal(run(linked).status, 0);
  assert.equal(fs.lstatSync(path.join(linked, '.claude', 'settings.json')).isSymbolicLink(), true);
  assert.equal(readJson(real).outputStyle, 'Nebi');
});

test('settings.json keeps its file mode, and a dangling symlink keeps its link', { skip: process.platform === 'win32' }, () => {
  const home = tempDir();
  const settingsPath = path.join(home, '.claude', 'settings.json');
  writeJson(settingsPath, { keep: 1 });
  fs.chmodSync(settingsPath, 0o600);
  assert.equal(run(home).status, 0);
  assert.equal(fs.statSync(settingsPath).mode & 0o777, 0o600);

  const linked = tempDir();
  const real = path.join(linked, 'dotfiles', 'settings.json');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.mkdirSync(path.join(linked, '.claude'), { recursive: true });
  fs.symlinkSync(real, path.join(linked, '.claude', 'settings.json'));
  assert.equal(run(linked).status, 0);
  assert.equal(fs.lstatSync(path.join(linked, '.claude', 'settings.json')).isSymbolicLink(), true);
  assert.equal(readJson(real).outputStyle, 'Nebi');
});

test('legacy bash and PowerShell sweep hooks are removed, unrelated ones stay', () => {
  const home = tempDir();
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const sh = path.join(home, '.claude', 'nebi', 'session-start-sweep.sh');
  const ps1 = path.join(home, '.claude', 'nebi', 'session-start-sweep.ps1');
  const unrelated = [
    { type: 'command', command: 'bash /tmp/elsewhere/session-start-sweep.sh' },
    { type: 'command', command: `bash ${sh} --extra` },
  ];
  writeJson(settingsPath, {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'bash', args: [sh], timeout: 20 }] },
        { hooks: [{ type: 'command', command: `bash '${sh}'`, timeout: 20 }] },
        { hooks: [{ type: 'command', command: `bash ${sh}` }, ...unrelated] },
        { hooks: [{ type: 'command', command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ps1}"` }] },
        { hooks: [{ type: 'command', command: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1] }] },
      ],
    },
  });
  assert.equal(run(home).status, 0);
  const hooks = readJson(settingsPath).hooks.SessionStart.flatMap((group) => group.hooks);
  assert.deepEqual(hooks.map((hook) => hook.command), [
    ...unrelated.map((hook) => hook.command),
    nodeCommandForCurrentPlatform(path.join(home, '.claude', 'hooks', 'session-start.mjs')),
  ]);
});

test('a non-object env or enabledPlugins fails preflight', () => {
  for (const settings of [{ env: ['DISABLE_AUTOUPDATER=1'] }, { enabledPlugins: 'all' }]) {
    const home = tempDir();
    const settingsPath = path.join(home, '.claude', 'settings.json');
    writeJson(settingsPath, settings);
    const result = run(home);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Preflight failed/);
    assert.deepEqual(readJson(settingsPath), settings);
  }
});

test('the browser route, its router and the Claude-only mod-verify skill deploy to Claude only', () => {
  const home = tempDir();
  assert.equal(run(home).status, 0);
  for (const rel of ['nebi/route.mjs', 'nebi/browsers.json', 'nebi/browser-open', 'skills/nebi-mod-verify/SKILL.md']) {
    assert.deepEqual(
      fs.readFileSync(path.join(home, '.claude', rel)),
      fs.readFileSync(path.join(REPO_ROOT, 'claude-home', rel)),
      rel,
    );
  }
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(home, '.claude/nebi/browser-open')).mode & 0o111, 0o111, 'browser-open stays executable');
  }
  assert.equal(fs.existsSync(path.join(home, '.agents/skills/nebi-mod-verify')), false);
  assert.equal(fs.existsSync(path.join(home, '.codex/nebi/browser-open')), false);
  const skillFiles = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : skillFiles.push(entry.name));
  walk(path.join(home, '.claude/skills'));
  assert.equal(skillFiles.some((name) => name.endsWith('.pyc') || name === '.DS_Store'), false, 'no local run cruft');
});

test('macOS gets the daily claude update LaunchAgent, written idempotently and never loaded for a staged home', () => {
  const home = tempDir();
  const plist = path.join(home, 'Library', 'LaunchAgents', 'com.nebi.claude-update.plist');
  const first = run(home);
  assert.equal(first.status, 0, first.stderr);
  if (process.platform !== 'darwin') {
    assert.equal(fs.existsSync(plist), false);
    return;
  }
  assert.match(first.stdout, /com\.nebi\.claude-update .*: written; not loaded \(staged --home\)/);
  const text = fs.readFileSync(plist, 'utf8');
  assert.match(text, /<key>Label<\/key>\s*<string>com\.nebi\.claude-update<\/string>/);
  assert.match(text, /<string>\/bin\/sh<\/string>\s*<string>-c<\/string>\s*<string>claude update<\/string>/);
  assert.match(text, /<key>Hour<\/key>\s*<integer>5<\/integer>\s*<key>Minute<\/key>\s*<integer>30<\/integer>/);
  assert.match(text, /<key>PATH<\/key>\s*<string>[^<]+<\/string>/);
  const lint = spawnSync('plutil', ['-lint', plist], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  const second = run(home);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /com\.nebi\.claude-update .*: unchanged; not loaded \(staged --home\)/);
  assert.equal(fs.readFileSync(plist, 'utf8'), text);
  fs.rmSync(plist);
  const missing = run(home, ['--verify']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Claude update agent/);
});
