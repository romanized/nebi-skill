import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check } from '../claude-home/hooks/kill-guard.mjs';

const HOOK = fileURLToPath(new URL('../claude-home/hooks/kill-guard.mjs', import.meta.url));

test('blocks the two commands that killed every session on 2026-10-12', () => {
  assert.match(check('pkill -f "cat" -U $(id -u) -x 2>/dev/null; true'), /"-U" comes after the pattern/);
  assert.match(check('pkill -f "recv.py" -n -o 2>/dev/null; ps aux | grep recv.py'), /"-n" comes after the pattern/);
});

test('blocks broad patterns and pgrep feeding kill', () => {
  assert.match(check('pkill -f cat'), /too broad/);
  assert.match(check('pkill node'), /too broad/);
  assert.match(check('sudo pkill -9 -f claude'), /too broad/);
  assert.match(check('pgrep -f vitest -n | xargs kill'), /comes after the pattern/);
  assert.match(check('kill $(pgrep -f chrome)'), /too broad/);
  assert.match(check('kill "$(pgrep -f node)"'), /too broad/);
});

test('allows the specific kills sessions used safely today', () => {
  for (const cmd of [
    'pkill -f "ChatGPT for Chrome chrome-extension"; sleep 10',
    'kill 19478 19437 2>/dev/null; sleep 3; pkill -f "wdb-k24-b/node_modules/vitest" ; sleep 2',
    'pkill -f -n "recv.py"',
    'pkill -x cat',
    'pkill -U $(id -u) -f "/tmp/scratchpad/recv.py"',
    'pkill -f -- "-weird-name-server"',
    'pgrep -lf vitest -n',
    'kill 16212 2>/dev/null; cat vitest.config.ts',
    'pgrep -f "vitest run" | head -3',
    'git commit -m "Block pkill -f cat -U $HOME -x calls"',
    "claude --resume abc 'never pkill with a short pattern or options after it'",
    "git commit -F - <<'EOF'\nBlock pkill calls that take out every session\nEOF\ngit push",
    // A quoted search term is data, not a command.
    'grep -rn "pkill" .',
    "rg 'pkill' mods",
    "grep -rn 'pkill' --include=*.mjs .",
  ]) assert.equal(check(cmd), null, cmd);
  assert.match(check("cat <<EOF > notes.txt\nhi\nEOF\npkill -f node"), /too broad/);
});

test('finds a pkill that quotes, escapes, paths or substitutions used to hide (F02)', () => {
  for (const cmd of [
    `echo "don't" && pkill -f cat && echo "can't"`,
    'echo "`pkill -f cat`"',
    '`pkill -f cat`',
    'echo "$(pkill -f cat)"',
    '/usr/bin/pkill -f cat',
    '\\pkill -f cat',
    'command pkill -f cat',
    'timeout 5 pkill -f cat',
    "bash -c 'pkill -f cat'",
    'eval "pkill -f cat"',
    'bash <<EOF\npkill -f cat\nEOF',
    'echo $((1 << 2))\npkill -f cat',
    'cat <<EOF\npkill -f cat',
    'cat <<< "x"; pkill -f cat',
    "cat <<'MY-EOF'\ndon't stop here\nMY-EOF\npkill -f cat",
    'timeout 5 \\pkill -f cat',
  ]) assert.match(check(cmd) ?? '', /Blocked pkill: .*too broad/, cmd);
  for (const cmd of ['kill `pgrep -f cat`', 'kill $(pgrep -f cat)', 'kill -9 "`pgrep -f cat`"']) {
    assert.match(check(cmd) ?? '', /Blocked pgrep: .*too broad/, cmd);
  }
  assert.match(check('pkill -f "my-specific-server.mjs" -n 2>&1'), /"-n" comes after the pattern/);
});

test('redirections are not patterns (F02)', () => {
  for (const cmd of [
    'pkill -f "my-specific-server.mjs" 2>&1',
    'pkill -f "my-specific-server.mjs" > /dev/null',
    'pkill -f "my-specific-server.mjs" 2>/dev/null',
    'pkill -f "my-specific-server.mjs" >/dev/null 2>&1',
    'pkill -f "my-specific-server.mjs" &>/dev/null',
    'pkill -f "my-specific-server.mjs" || true',
    'pkill -f "my-specific-server.mjs"',
    'kill $(pgrep -f "my-specific-server.mjs") 2>/dev/null',
    "echo 'pkill -f cat' > notes.txt",
    'cat <<< "pkill -f cat"',
    '# pkill -f cat\nls',
  ]) assert.equal(check(cmd), null, cmd);
});

test('hook denies through the PreToolUse JSON contract and passes other tools', () => {
  const run = (input) => spawnSync('node', [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
  const denied = run({ tool_name: 'Bash', tool_input: { command: 'pkill -f "recv.py" -n -o' } });
  assert.equal(denied.status, 0);
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'ls -la' } }).stdout, '');
  assert.equal(run({ tool_name: 'Read', tool_input: { file_path: '/x' } }).stdout, '');
  assert.equal(spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' }).status, 0);
});
