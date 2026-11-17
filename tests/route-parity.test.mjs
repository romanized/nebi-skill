import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { currentAccount, resolveRoute } from '../claude-home/nebi/route.mjs';
// Node strips the types when it imports a .ts file, so the mod's vectors load as plain data.
import { ACCOUNT_HOME, ACCOUNT_VECTORS, ROUTE_VECTORS } from '../mods/nebi-browser/tests/route-vectors.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const MODS = ['nebi-browser', 'nebi-beacon', 'nebi-constellation'];
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-route-parity-')));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

// Each mod carries its own copy of a shared file; group the copies by their bytes and name the first line that differs.
function assertOneVersion(rel) {
  const versions = new Map();
  for (const mod of MODS) {
    const bytes = fs.readFileSync(path.join(root, 'mods', mod, rel));
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!versions.has(hash)) versions.set(hash, { text: bytes.toString('utf8'), mods: [] });
    versions.get(hash).mods.push(mod);
  }
  if (versions.size === 1) return;
  const [a, b] = [...versions.values()];
  const [linesA, linesB] = [a.text.split('\n'), b.text.split('\n')];
  let i = 0;
  while (linesA[i] === linesB[i]) i++;
  const groups = [...versions.values()].map((v, n) => `  ${'ABC'[n]}: ${v.mods.join(', ')}`).join('\n');
  assert.fail(`mods/*/${rel} has drifted into ${versions.size} versions:\n${groups}\n`
    + `First difference at line ${i + 1}:\n  A: ${linesA[i] ?? '(end of file)'}\n  B: ${linesB[i] ?? '(end of file)'}\n`
    + 'Make the copies byte-identical: edit one, copy it over the others.');
}

test('the three mods carry one route.ts', () => assertOneVersion('hooks/route.ts'));

test('the three mods carry one route-vectors.ts', () => assertOneVersion('tests/route-vectors.ts'));

test('route.mjs agrees with every account vector', () => {
  assert.ok(ACCOUNT_VECTORS.length > 0, 'no account vectors loaded');
  for (const [dir, want] of ACCOUNT_VECTORS) {
    assert.equal(currentAccount(dir === undefined ? {} : { CLAUDE_CONFIG_DIR: dir }, ACCOUNT_HOME), want, `CLAUDE_CONFIG_DIR ${dir}`);
  }
});

test('the route vectors loaded', () => assert.ok(ROUTE_VECTORS.length > 0, 'no route vectors loaded'));

// Each vector's absolute paths are materialised under a fresh folder, then route.mjs answers for it.
for (const v of ROUTE_VECTORS) {
  test(`route.mjs agrees with the vector: ${v.name}`, () => {
    const dir = fs.mkdtempSync(path.join(temp, 'v'));
    const at = (p) => path.join(dir, p);
    for (const d of v.gitDirs) fs.mkdirSync(at(path.join(d, '.git')), { recursive: true });
    for (const d of v.gitFiles ?? []) {
      fs.mkdirSync(at(d), { recursive: true });
      fs.writeFileSync(at(path.join(d, '.git')), 'gitdir: /elsewhere\n');
    }
    for (const [p, text] of Object.entries(v.files)) {
      fs.mkdirSync(path.dirname(at(p)), { recursive: true });
      fs.writeFileSync(at(p), text);
    }
    const env = v.configDir === undefined ? {} : { CLAUDE_CONFIG_DIR: v.configDir.startsWith('/') ? at(v.configDir) : v.configDir };
    // route.mjs treats an empty cwd as no cwd; keep it empty rather than prefixing.
    const cwd = v.cwd === '' ? '' : at(v.cwd);
    assert.deepEqual(resolveRoute({ cwd, env, home: at(v.home) }), v.expected);
  });
}
