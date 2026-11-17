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
  ]) assert.equal(check(cmd), null, cmd);
  assert.match(check("cat <<EOF > notes.txt\nhi\nEOF\npkill -f node"), /too broad/);
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
