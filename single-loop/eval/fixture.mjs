#!/usr/bin/env node
// Build one disposable task directory for the nebi fleet eval.
//
//   node fixture.mjs <empty-dest> <task-id>
//
// Every task gets a small git repo ("acme-utils") committed as the base. Review tasks
// (c*) then leave one builder change uncommitted, with one planted bug among harmless
// edits. Build tasks (b*) get a SPEC.md and visible tests; the hidden tests that grade
// them live in ./hidden and never enter the task directory. Research tasks (s*) get the
// bare repo only; their sources are the read-only clones named in tasks.json.
//
// Gotcha: the repo is committed with a fixed author and date so every rep starts from
// an identical tree; `git diff` is what the reviewer is meant to see.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = {
  'package.json': JSON.stringify({ name: 'acme-utils', version: '1.4.0', type: 'module', scripts: { test: 'node --test test/' } }, null, 2) + '\n',
  'README.md': '# acme-utils\n\nSmall helpers shared by the Acme services. Run `npm test`.\n',
  'src/paginate.js': `export function pageCount(total, size) {
  return Math.ceil(total / size);
}

export function paginate(items, size) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer');
  const pages = pageCount(items.length, size);
  return Array.from({ length: pages }, (_, i) => items.slice(i * size, (i + 1) * size));
}
`,
  'src/store.js': `export async function saveAll(db, records) {
  for (const r of records) await db.put(r.id, r);
  return records.length;
}
`,
  'src/files.js': `import path from 'node:path';

export function safeJoin(base, rel) {
  const root = path.resolve(base);
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('path escapes base');
  return target;
}
`,
  'src/text.js': `export function titleCase(s) {
  return String(s).replace(/\\b\\w/g, (c) => c.toUpperCase());
}
`,
  'test/paginate.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../src/paginate.js';

test('splits evenly', () => {
  assert.deepEqual(paginate([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
});
`,
  'test/store.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveAll } from '../src/store.js';

test('returns the count', async () => {
  const db = { put: async () => {} };
  assert.equal(await saveAll(db, [{ id: 1 }, { id: 2 }]), 2);
});
`,
  'test/files.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeJoin } from '../src/files.js';

test('joins inside the base', () => {
  assert.ok(safeJoin('/data/app', 'logs/a.txt').endsWith('logs/a.txt'));
});
test('rejects ..', () => {
  assert.throws(() => safeJoin('/data/app', '../etc/passwd'));
});
`,
  'test/text.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleCase } from '../src/text.js';

test('title case', () => assert.equal(titleCase('hello world'), 'Hello World'));
`,
};

// Uncommitted builder changes for the review tasks: one planted bug each, plus noise.
const REVIEW = {
  c1: {
    'src/paginate.js': `/** Number of pages needed to show \`total\` items, \`size\` per page. */
export function pageCount(total, size) {
  return Math.floor(total / size);
}

/** Split \`items\` into pages of \`size\`. */
export function paginate(items, size) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer');
  const pages = pageCount(items.length, size);
  return Array.from({ length: pages }, (_, page) => items.slice(page * size, (page + 1) * size));
}
`,
  },
  c2: {
    'src/store.js': `function validate(record) {
  if (record == null || record.id == null) throw new TypeError('record needs an id');
}

// Writes run concurrently now; the old loop wrote one record at a time.
export async function saveAll(db, records) {
  records.forEach(validate);
  records.forEach(async (r) => {
    await db.put(r.id, r);
  });
  return records.length;
}
`,
  },
  c3: {
    'src/files.js': `import path from 'node:path';

export function isInside(root, target) {
  return target.startsWith(root);
}

// Resolve \`rel\` under \`base\`, refusing anything that escapes it.
export function safeJoin(base, rel) {
  const root = path.resolve(base);
  const target = path.resolve(root, rel);
  if (!isInside(root, target)) throw new Error('path escapes base');
  return target;
}
`,
  },
};

const BUILD = {
  b1: {
    'SPEC.md': `# slugify

Add \`slugify(text, maxLength = 60)\` to src/text.js and export it.

- Lowercase the text.
- Remove accents: "Crème Brûlée" becomes "creme-brulee".
- Every run of characters that is not a-z or 0-9 becomes one "-".
- No "-" at the start or end.
- If the result is longer than maxLength, cut it at the last "-" at or before maxLength and drop that "-"; if there is no "-" in range, cut at maxLength.
- An input with no letters or digits returns "".
`,
  },
  b2: {
    'SPEC.md': `# Two helpers

These are independent; each has its own file.

## retry (src/async.js)

\`retry(fn, { retries = 3, delayMs = 0 } = {})\` calls the async function \`fn\`. If it throws, wait delayMs and call it again, up to \`retries\` extra attempts. Resolve with the first successful result. If every attempt fails, reject with the last error. \`retries\` must be an integer >= 0, otherwise throw a RangeError synchronously-in-the-promise (reject before calling fn).

## chunk (src/array.js)

\`chunk(array, size)\` returns a new array of consecutive slices of \`size\` items; the last slice may be shorter. \`chunk([], n)\` is []. \`size\` must be an integer >= 1, otherwise throw a RangeError.
`,
  },
  b3: {
    'src/duration.js': `const UNITS = { h: 3600, m: 60, s: 1 };

// "1h30m" -> 5400 seconds
export function parseDuration(text) {
    const parts = String(text).trim().match(/(\\d+)([hms])/);
    if (!parts) throw new SyntaxError(\`bad duration: \${text}\`);
    let total = 0;
    for (const part of [parts[0]]) {
      const [, n, unit] = part.match(/(\\d+)([hms])/);
      total += Number(n) * UNITS[unit];
    }
    return total;
}
`,
    'test/duration.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from '../src/duration.js';

test('single unit', () => assert.equal(parseDuration('45s'), 45));
test('hours and minutes', () => assert.equal(parseDuration('1h30m'), 5400));
`,
  },
};

const AUTHOR = ['-c', 'user.name=Acme Bot', '-c', 'user.email=bot@acme.test', '-c', 'commit.gpgsign=false'];
const ENV = { ...process.env, GIT_AUTHOR_DATE: '2026-11-01T10:00:00Z', GIT_COMMITTER_DATE: '2026-11-01T10:00:00Z' };

function write(root, files) {
  for (const [rel, body] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
}

// Chain tasks reuse the pieces above: l1 is the bare repo, l2 bundles the three
// builds in one repo, l3 is b1 with a review demanded before done.
BUILD.l2 = {
  ...BUILD.b3,
  'SPEC-slugify.md': BUILD.b1['SPEC.md'],
  'SPEC-helpers.md': BUILD.b2['SPEC.md'],
};
BUILD.l3 = BUILD.b1;

export function buildFixture(dest, taskId) {
  if (existsSync(dest) && readdirSync(dest).length) throw new Error(`destination not empty: ${dest}`);
  mkdirSync(dest, { recursive: true });
  write(dest, BASE);
  if (BUILD[taskId]) write(dest, BUILD[taskId]);
  const git = (...a) => execFileSync('git', [...AUTHOR, ...a], { cwd: dest, env: ENV, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'acme-utils 1.4.0');
  if (REVIEW[taskId]) write(dest, REVIEW[taskId]);
  return dest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dest, taskId] = process.argv.slice(2);
  if (!dest || !taskId) {
    console.error('usage: node fixture.mjs <empty-dest> <task-id>');
    process.exit(2);
  }
  buildFixture(dest, taskId);
  console.log(dest);
}
