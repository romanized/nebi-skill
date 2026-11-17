import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPack } from '../scripts/check-pack.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
test('all masters, corpora, references, and harness invariants validate', () => {
  assert.deepEqual(checkPack(root).errors, []);
});
test('checker catches broken references, duplicate evals, invalid YAML and harness drift', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-structure-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const dir of ['claude-home', 'codex-home']) fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true });
  const base = path.join(temp, 'claude-home/skills/nebi-debugging');
  fs.appendFileSync(path.join(base, 'SKILL.md'), '\n[Missing](references/absent.md)\n');
  const corpusPath = path.join(base, 'evals/evals.json');
  const corpus = JSON.parse(fs.readFileSync(corpusPath)); corpus.evals.push(corpus.evals[0]);
  fs.writeFileSync(corpusPath, JSON.stringify(corpus));
  const otherSkill = path.join(temp, 'claude-home/skills/nebi-maintenance/SKILL.md');
  fs.writeFileSync(otherSkill, fs.readFileSync(otherSkill, 'utf8').replace(/^description:.*$/m, 'description: Invalid: unquoted YAML'));
  fs.appendFileSync(path.join(temp, 'codex-home/AGENTS.md'), '\n## 11. accidental drift\n');
  const errors = checkPack(temp).errors.join('\n');
  assert.match(errors, /missing reference/); assert.match(errors, /duplicate case ID/);
  assert.match(errors, /YAML quoting/); assert.match(errors, /section IDs differ/);
});
