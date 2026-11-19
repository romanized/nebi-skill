import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { checkDocs, extractPosts, localTreeHash, markReviewed, normalizeDoc } from '../claude-home/nebi/upstreams.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'claude-home/nebi/upstreams.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-upstreams-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function upstreamRepo(name) {
  const repo = path.join(temp, name, 'upstream');
  fs.mkdirSync(path.join(repo, 'skills/alpha/references'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'skills/beta'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.invalid');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  git(repo, 'config', 'uploadpack.allowFilter', 'true');
  fs.writeFileSync(path.join(repo, 'skills/alpha/SKILL.md'), '---\nname: alpha\n---\nv1\n');
  fs.writeFileSync(path.join(repo, 'skills/alpha/references/notes.md'), 'notes\n');
  fs.writeFileSync(path.join(repo, 'skills/beta/SKILL.md'), '---\nname: beta\n---\nstable\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'v1');
  const pin = git(repo, 'rev-parse', 'HEAD');
  const installed = path.join(temp, name, 'installed');
  for (const skill of ['alpha', 'beta']) fs.cpSync(path.join(repo, 'skills', skill), path.join(installed, skill), { recursive: true });
  fs.writeFileSync(path.join(repo, 'skills/alpha/SKILL.md'), '---\nname: alpha\n---\nv2\n');
  git(repo, 'commit', '-q', '-am', 'v2');
  return { url: pathToFileURL(repo).href, pin, installed, head: git(repo, 'rev-parse', 'HEAD') };
}

function run(label, register, ...extra) {
  const env = typeof extra[0] === 'object' ? extra.shift() : {};
  const file = path.join(temp, `register-${label}.json`);
  fs.writeFileSync(file, JSON.stringify(register));
  const result = spawnSync(process.execPath, [script, '--register', file, '--json', ...extra], {
    encoding: 'utf8', env: { ...process.env, NEBI_UPSTREAM_CACHE: path.join(temp, 'cache'), ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

// Project locks may name only GitHub or http(s) sources; git's own url rewrite points a
// GitHub name at the local test repo, so nothing reaches the network.
const githubAlias = (url, name) => ({
  GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${url}.insteadOf`, GIT_CONFIG_VALUE_0: `https://github.com/${name}.git`,
});

test('local tree hash equals the git tree id of the same folder', () => {
  const { url } = upstreamRepo('hash');
  const repo = fileURLToPath(url);
  assert.equal(localTreeHash(path.join(repo, 'skills/alpha')), git(repo, 'rev-parse', 'HEAD:skills/alpha'));
});

test('status reports behind, current, local edits and unregistered installs without changing them', () => {
  const up = upstreamRepo('status');
  fs.appendFileSync(path.join(up.installed, 'beta/SKILL.md'), 'my local tweak\n');
  const before = fs.readFileSync(path.join(up.installed, 'beta/SKILL.md'), 'utf8');
  const lock = path.join(temp, 'lock.json');
  fs.writeFileSync(lock, JSON.stringify({ skills: { alpha: { source: 'x/y' }, stray: { source: 'someone/else' } } }));
  const out = run('status', {
    locks: [lock],
    sources: [{
      name: 'pack', repo: up.url, pin: up.pin,
      update: 'skills add pack#<SHA> --skill alpha beta',
      skills: [
        { name: 'alpha', path: 'skills/alpha', installed: [path.join(up.installed, 'alpha')] },
        { name: 'beta', path: 'skills/beta', installed: [path.join(up.installed, 'beta')] },
      ],
    }],
  });
  const [alpha, beta] = out.results[0].rows;
  assert.match(alpha.status, /^changed upstream/);
  assert.match(alpha.status, /matches pin/);
  assert.match(beta.status, /^current/);
  assert.match(beta.status, /local edits/);
  assert.equal(out.results[0].update, `skills add pack#${up.head} --skill alpha beta`);
  assert.deepEqual(out.unregistered.map((s) => s.name), ['stray']);
  assert.equal(fs.readFileSync(path.join(up.installed, 'beta/SKILL.md'), 'utf8'), before);
});

test('a lock tree hash stands in for a missing commit pin', () => {
  const up = upstreamRepo('tree-pin');
  const tree = git(fileURLToPath(up.url), 'rev-parse', `${up.pin}:skills/beta`);
  const out = run('tree-pin', {
    sources: [{ name: 'lockonly', repo: up.url, skills: [{ name: 'beta', path: 'skills/beta', tree, installed: [path.join(up.installed, 'beta')] }] }],
  });
  assert.match(out.results[0].rows[0].status, /^current; matches pin/);
});

test('a per-skill commit pin overrides the source pin', () => {
  const up = upstreamRepo('skill-pin');
  const out = run('skill-pin', {
    sources: [{ name: 'mixed', repo: up.url, pin: up.head, skills: [{ name: 'alpha', path: 'skills/alpha', pin: up.pin, installed: [path.join(up.installed, 'alpha')] }] }],
  });
  assert.match(out.results[0].rows[0].status, /^changed upstream.*; matches pin/);
});

test('CLI copy exclusions and script caches are not local edits; real edits are named', () => {
  const up = upstreamRepo('exclusions');
  const repo = fileURLToPath(up.url);
  fs.writeFileSync(path.join(repo, 'skills/beta/metadata.json'), '{}\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'metadata');
  const pin = git(repo, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(up.installed, 'beta/__pycache__'));
  fs.writeFileSync(path.join(up.installed, 'beta/__pycache__/x.pyc'), 'cache');
  const clean = run('exclusions-clean', {
    sources: [{ name: 'pack', repo: up.url, pin, skills: [{ name: 'beta', path: 'skills/beta', installed: [path.join(up.installed, 'beta')] }] }],
  });
  assert.match(clean.results[0].rows[0].status, /matches pin$/);
  fs.appendFileSync(path.join(up.installed, 'beta/SKILL.md'), 'edit\n');
  const edited = run('exclusions-edited', {
    sources: [{ name: 'pack', repo: up.url, pin, skills: [{ name: 'beta', path: 'skills/beta', installed: [path.join(up.installed, 'beta')] }] }],
  });
  assert.match(edited.results[0].rows[0].status, /local edits in .*\(1 file: SKILL\.md\)/);
});

test('project locks under lockRoots are checked and one-client installs are flagged', () => {
  const up = upstreamRepo('projects');
  const root = path.join(temp, 'projects-root');
  const project = path.join(root, 'shop');
  fs.mkdirSync(path.join(project, '.agents/skills'), { recursive: true });
  fs.mkdirSync(path.join(project, '.claude/skills'), { recursive: true });
  fs.cpSync(path.join(fileURLToPath(up.url), 'skills/beta'), path.join(project, '.agents/skills/beta'), { recursive: true });
  // A junction on Windows (no symlink privilege needed); the type is ignored elsewhere.
  fs.symlinkSync('../../.agents/skills/beta', path.join(project, '.claude/skills/beta'), 'junction');
  fs.cpSync(path.join(fileURLToPath(up.url), 'skills/alpha'), path.join(project, '.agents/skills/alpha'), { recursive: true });
  fs.writeFileSync(path.join(project, 'skills-lock.json'), JSON.stringify({ skills: {
    alpha: { source: 'test/projects', skillPath: 'skills/alpha/SKILL.md' },
    beta: { source: 'test/projects', skillPath: 'skills/beta/SKILL.md', ref: up.pin },
  } }));
  const out = run('projects', { lockRoots: [root], sources: [] }, githubAlias(up.url, 'test/projects'));
  assert.equal(out.projects.locks, 1);
  const rows = Object.fromEntries(out.projects.rows.map((r) => [r.item, r.status]));
  assert.match(rows.alpha, /^unpinned; matches upstream HEAD; Codex only/);
  assert.match(rows.beta, /^current; matches pin$/);
});

test('a project lock cannot pass git an option, use a local transport or name a path (F03)', () => {
  const up = upstreamRepo('hostile');
  const root = path.join(temp, 'hostile-root');
  const project = path.join(root, 'evil');
  const marker = path.join(temp, 'hostile-PWNED');
  fs.mkdirSync(path.join(project, '.agents/skills'), { recursive: true });
  fs.writeFileSync(path.join(project, 'skills-lock.json'), JSON.stringify({ skills: {
    demo: { source: 'test/hostile', skillPath: 'skills/alpha/SKILL.md', ref: `--upload-pack=touch ${marker};git-upload-pack` },
    local: { source: up.url, skillPath: 'skills/beta/SKILL.md', ref: up.pin },
    '../../../../etc': { source: 'test/hostile', ref: up.pin },
  } }));
  const out = run('hostile', { lockRoots: [root], sources: [] }, githubAlias(up.url, 'test/hostile'));
  const rows = Object.fromEntries(out.projects.rows.map((r) => [r.item, r.status]));
  assert.match(rows.demo, /^pin refused: not a commit or ref name/);
  assert.equal(fs.existsSync(marker), false, 'the ref ran as --upload-pack');
  assert.match(rows.local, /^local source file:/);
  assert.equal(fs.existsSync(path.join(temp, 'cache', up.url.replace(/[^A-Za-z0-9._-]+/g, '__'))), false, 'a file:// project source was cloned');
  assert.equal(rows['../../../../etc'], 'refused: skill name has a path separator or ..');
});

test('offline mode checks installs only and never touches the network', () => {
  const out = run('offline', {
    sources: [{ name: 'tool', repo: 'https://invalid.example.invalid/none.git', pin: 'abc', kind: 'cli', installed: [path.join(temp, 'absent')] }],
  }, '--offline');
  assert.match(out.results[0].rows[0].status, /upstream not checked; missing/);
});

// Docs mode: every fetch is injected (fake responses or data: URLs); nothing reaches the network.
const response = (body, type = 'text/html', { status = 200, url = '' } = {}) => ({
  ok: status >= 200 && status < 300, status, url, headers: new Headers({ 'content-type': type }), text: async () => body,
});
const fakeFetch = (routes) => async (url) => {
  const route = routes[url];
  if (route instanceof Error) throw route;
  if (!route) throw new Error(`unexpected fetch ${url}`);
  return route;
};
const sha = (body, type) => createHash('sha256').update(normalizeDoc(body, type)).digest('hex');

test('docs normalization strips HTML down to its text and leaves a Markdown export as served', () => {
  const html = '<html><head><style>p{}</style><script>var build = 1;</script></head><body><!-- id 7 --><p>Keep&nbsp;going &amp; <b>stop</b>&#x21;</p>\n\n</body></html>';
  assert.equal(normalizeDoc(html, 'text/html; charset=utf-8'), 'Keep going & stop !');
  assert.equal(normalizeDoc('# Title\n\n<b>raw</b>  &amp; text\n', 'text/markdown'), '# Title <b>raw</b> &amp; text');
});

test('index posts: links below the registered folder, feed item links as given', () => {
  const home = '<a href="/blog/">Blog</a><a href="/blog/b-post/#top">B</a><a href="/blog/a-post/?ref=x">A</a><a href="/about/">About</a><a href="https://other.example/blog/c/">C</a>';
  // claude.dev/blog/ redirects to the home page; relative links resolve against the landing URL.
  assert.deepEqual(extractPosts('https://site.example/blog/', home, 'text/html', 'https://site.example/'),
    ['https://site.example/blog/a-post/', 'https://site.example/blog/b-post/']);
  const map = '- [Hooks](https://docs.example/docs/hooks.md): x\n- [Self](https://docs.example/docs/llms.txt)\n- [Guide](https://docs.example/guides/g.md)';
  assert.deepEqual(extractPosts('https://docs.example/docs/llms.txt', map, 'text/plain'), ['https://docs.example/docs/hooks.md']);
  const feed = '<rss><channel><link>https://feed.example/</link><item><link>https://feed.example/log/#r2</link></item><item><title>x</title><link>https://feed.example/log/#r1</link></item></channel></rss>';
  assert.deepEqual(extractPosts('https://feed.example/log/rss.xml', feed, 'application/xml'), ['https://feed.example/log/#r1', 'https://feed.example/log/#r2']);
});

test('docs check reports unchanged, CHANGED, NEW POSTS and ERROR, one status per entry', async () => {
  const blog = '<a href="/blog/old/">old</a><a href="/blog/new/">new</a>';
  const docs = [
    { id: 'same', url: 'https://a.example/same.md', kind: 'page', reviewed: '2026-09-01', sha256: sha('# Same', 'text/markdown') },
    { id: 'edited', url: 'https://a.example/edited.md', kind: 'page', reviewed: '2026-09-02', sha256: sha('# Before', 'text/markdown') },
    { id: 'blog', url: 'https://b.example/blog/', kind: 'index', reviewed: '2026-09-03', sha256: 'old', posts: ['https://b.example/blog/old/'] },
    { id: 'gone', url: 'https://a.example/gone.md', kind: 'page', reviewed: '2026-09-04', sha256: 'x' },
    { id: 'offline', url: 'https://down.example/', kind: 'page', reviewed: '2026-09-05', sha256: 'x' },
    { id: 'redesigned', url: 'https://b.example/news/', kind: 'index', reviewed: '2026-09-06', sha256: 'x', posts: ['https://b.example/news/a/'] },
  ];
  const results = await checkDocs(docs, fakeFetch({
    'https://a.example/same.md': response('# Same\n', 'text/markdown'),
    'https://a.example/edited.md': response('# After', 'text/markdown'),
    'https://b.example/blog/': response(blog),
    'https://a.example/gone.md': response('Not found', 'text/plain', { status: 404 }),
    'https://down.example/': Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
    'https://b.example/news/': response('<p>no links any more</p>'),
  }));
  assert.deepEqual(Object.fromEntries(results.map((r) => [r.id, r.status])), {
    same: 'unchanged',
    edited: 'CHANGED since 2026-09-02 (https://a.example/edited.md)',
    blog: 'NEW POSTS since 2026-09-03: https://b.example/blog/new/',
    gone: 'ERROR HTTP 404',
    offline: 'ERROR ENOTFOUND',
    redesigned: 'ERROR no post links found (page layout changed?)',
  });
});

test('mark-reviewed records date, hash and posts for the chosen entry only', async () => {
  const register = { sources: [], docs: [
    { id: 'blog', url: 'https://b.example/blog/', kind: 'index', reviewed: '2026-09-03', sha256: 'old', why: 'w', posts: ['https://b.example/blog/old/'] },
    { id: 'page', url: 'https://a.example/p.md', kind: 'page', reviewed: '2026-09-01', sha256: 'keep', why: 'w' },
  ] };
  const body = '<a href="/blog/old/">o</a><a href="/blog/new/">n</a>';
  const fetchImpl = fakeFetch({ 'https://b.example/blog/': response(body), 'https://a.example/p.md': new TypeError('must not be fetched') });
  const results = await markReviewed(register, 'blog', { fetchImpl, today: '2026-09-24' });
  assert.deepEqual(results, [{ id: 'blog', marked: true, status: 'marked reviewed 2026-09-24' }]);
  assert.deepEqual(register.docs[0], {
    id: 'blog', url: 'https://b.example/blog/', kind: 'index', reviewed: '2026-09-24', sha256: sha(body, 'text/html'), why: 'w',
    posts: ['https://b.example/blog/new/', 'https://b.example/blog/old/'],
  });
  assert.equal(register.docs[1].sha256, 'keep');
  const failed = await markReviewed(register, 'all', {
    fetchImpl: fakeFetch({ 'https://b.example/blog/': response(body), 'https://a.example/p.md': response('', 'text/plain', { status: 500 }) }), today: '2026-09-25',
  });
  assert.deepEqual(failed.map((r) => r.marked), [true, false]);
  assert.equal(register.docs[1].reviewed, '2026-09-01');
  await assert.rejects(markReviewed(register, 'nope', { fetchImpl }), /no docs entry "nope"/);
});

test('--docs CLI: exit 0 with changes to review, --mark-reviewed writes only the docs entry', () => {
  const page = 'data:text/markdown,%23%20Guide%0A%0AStay%20lean.';
  const file = path.join(temp, 'register-docs.json');
  const register = { about: 'keep me', sources: [], docs: [{ id: 'guide', url: page, kind: 'page', reviewed: '2026-09-01', sha256: 'stale', why: 'w' }] };
  fs.writeFileSync(file, `${JSON.stringify(register, null, 2)}\n`);
  const cli = (...extra) => spawnSync(process.execPath, [script, '--docs', '--register', file, ...extra], { encoding: 'utf8' });
  const before = cli();
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /guide CHANGED since 2026-09-01 \(data:/);
  assert.match(before.stdout, /--mark-reviewed <id\|all>/);
  const mark = cli('--mark-reviewed', 'guide');
  assert.equal(mark.status, 0, mark.stderr);
  const written = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(written.about, 'keep me');
  assert.equal(written.docs[0].sha256, sha('# Guide\n\nStay lean.', 'text/markdown'));
  assert.match(written.docs[0].reviewed, /^\d{4}-\d{2}-\d{2}$/);
  const after = cli();
  assert.equal(after.status, 0, after.stderr);
  assert.match(after.stdout, /guide unchanged\n$/);
  assert.equal(cli('--mark-reviewed').status, 1);
});
