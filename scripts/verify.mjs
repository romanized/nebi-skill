#!/usr/bin/env node
// One dependency-free entry point, including Windows (no shell glob expansion).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['.git', 'node_modules'].includes(e.name)) return [];
    const target = path.join(dir, e.name);
    return e.isDirectory() ? walk(target) : [target];
  });
}
function run(args) {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (r.error || r.status !== 0) process.exit(r.status || 1);
}
for (const file of walk(root).filter(f => f.endsWith('.mjs'))) run(['--check', file]);
run(['scripts/check-pack.mjs']);
run(['--test', ...fs.readdirSync(path.join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).map(f => `tests/${f}`)]);
