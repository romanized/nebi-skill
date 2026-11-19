import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const term = fileURLToPath(new URL('../claude-home/nebi/term.mjs', import.meta.url));
// --window --dry-run prints the AppleScript and never calls osascript.
const dryRun = (...command) => spawnSync(process.execPath, [term, '--window', '--dry-run', '--dir', '/tmp', '--', ...command], { encoding: 'utf8' });
const typed = (r) => r.stdout.match(/^set initial input of c to (.*) & linefeed$/m)?.[1];

test('term.mjs keeps a multi-word argument as one shell word', () => {
  assert.equal(typed(dryRun('claude', 'audit the product pages')), '"claude \'audit the product pages\'"');
  assert.equal(typed(dryRun('echo', "it's", '$HOME', 'a;b')), String.raw`"echo 'it'\\''s' '$HOME' 'a;b'"`);
  assert.equal(typed(dryRun('npm', 'test')), '"npm test"', 'plain words stay bare');
});

test('term.mjs types a single word after -- as a shell line', () => {
  assert.equal(typed(dryRun('npm test && npm run build')), '"npm test && npm run build"');
});

test('term.mjs refuses a command with a line break', () => {
  const r = dryRun('claude', 'one\nrm -rf x');
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /line break/);
});
