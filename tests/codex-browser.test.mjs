import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proxy = path.join(root, 'claude-home/nebi/codex-browser.mjs');

// A stand-in for cua_repl: on start it asks two questions, then reports every
// answer it receives as a test/answer notification.
const FAKE_SERVER = `
import readline from 'node:readline'
const send = message => process.stdout.write(JSON.stringify(message) + '\\n')
send({ jsonrpc: '2.0', id: 'approval', method: 'elicitation/create', params: {
  message: 'Allow download from https://storage.googleapis.com?',
  requestedSchema: { type: 'object', properties: {} },
  _meta: { codex_approval_kind: 'mcp_tool_call', connector_id: 'browser-use' },
} })
send({ jsonrpc: '2.0', id: 'question', method: 'elicitation/create', params: {
  message: 'Which account?',
  requestedSchema: { type: 'object', properties: { account: { type: 'string' } }, required: ['account'] },
} })
readline.createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line)
  if (message.result) send({ jsonrpc: '2.0', method: 'test/answer', params: { id: message.id, result: message.result } })
})
`;

function fakeCodexHome() {
  const home = mkdtempSync(path.join(os.tmpdir(), 'codex-browser-test-'));
  const version = path.join(home, 'plugins/cache/openai-bundled/unified-computer-use/1.0.0');
  mkdirSync(version, { recursive: true });
  const server = path.join(home, 'fake-cua-repl.mjs');
  writeFileSync(server, FAKE_SERVER);
  writeFileSync(path.join(version, '.mcp.json'), JSON.stringify({
    mcpServers: { cua_repl: { command: process.execPath, args: [server], env: {} } },
  }));
  return home;
}

async function testApprovalsAreAcceptedAndQuestionsReachTheUser() {
  const child = spawn(process.execPath, [proxy], {
    env: { ...process.env, CODEX_HOME: fakeCodexHome() },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const seen = [];
  const lines = readline.createInterface({ input: child.stdout });
  // Wait until both questions have played out, or give up after a few seconds.
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 3000);
    lines.on('line', line => {
      seen.push(JSON.parse(line));
      const answered = seen.some(message => message.method === 'test/answer');
      const asked = seen.some(message => message.id === 'question');
      if (answered && asked) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  child.stdin.end();
  setTimeout(() => child.kill(), 2000).unref();

  assert.ok(!seen.some(message => message.id === 'approval'), 'the Accept/Decline prompt must not reach Claude Code');
  assert.deepEqual(
    seen.find(message => message.method === 'test/answer').params,
    { id: 'approval', result: { action: 'accept', content: {} } },
  );
  assert.equal(seen.find(message => message.id === 'question').method, 'elicitation/create', 'a prompt with input fields still reaches the user');
}

test('codex-browser accepts Browser Use approvals itself and forwards real questions', testApprovalsAreAcceptedAndQuestionsReachTheUser);
