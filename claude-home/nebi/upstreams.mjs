#!/usr/bin/env node
// upstreams.mjs — read-only status for the Nebi upstream register (upstreams.json).
// Usage: node upstreams.mjs [--register <file>] [--offline] [--json] [--all]
//        node upstreams.mjs --docs [--mark-reviewed <id|all>] [--register <file>]
// For every registered source it answers: is it installed where the register
// says, does the installed folder still match the pinned upstream (local edits),
// and has upstream changed since the pin (behind)? Skills in the listed global
// lock must be registered; project skills-CLI locks under `lockRoots` are read
// automatically and also checked for being visible to only one client.
// It never installs, updates or edits a skill. Its only writes are a blobless
// Git cache under ~/.agents/nebi/cache/upstreams/ used to compare trees.
//
// --docs does the same for the documentation pages the doctrine is built from
// (the register's `docs` list). Each page is fetched and hashed after
// normalizing: a served Markdown export as is, HTML and RSS with script, style
// and tags stripped and entities decoded, whitespace collapsed in both. One line
// per entry: unchanged, CHANGED since <reviewed>, NEW POSTS (an index's post
// links missing from its stored list) or ERROR <reason>. Like the repo mode, it
// exits 0 whenever the check ran, even with something to review, and 1 only when
// it could not run: the lines are the signal. --mark-reviewed writes today's
// date, the current hash and an index's post list into the register for that
// entry (or all); it is docs mode's only write, never touches doctrine, and exits
// 1 if an entry could not be fetched (that entry is left as it was).
// Gotchas: mark the master (claude-home/nebi/upstreams.json in the repo), then
// redeploy; a mark on a deployed copy is overwritten by the next deploy. Index
// posts are RSS item links, or links below the registered URL's folder, so keep
// the registered URL even when it redirects (claude.dev/blog/ lands on the home
// page; registering that would make every site link a post). An index that
// yields no posts reports ERROR, because a redesign would otherwise hide new
// posts for good. Generic slugs can redirect: OpenAI's prompt-guidance serves
// latest-model, so a model's own guide is registered by its model URL.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const expand = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);
const tilde = (p) => (p.startsWith(os.homedir()) ? `~${p.slice(os.homedir().length)}` : p);
const here = path.dirname(fileURLToPath(import.meta.url));
const registerPath = path.resolve(expand(option('--register') ?? path.join(here, 'upstreams.json')));
const cacheRoot = expand(process.env.NEBI_UPSTREAM_CACHE ?? '~/.agents/nebi/cache/upstreams');
const offline = flag('--offline');
const firstLine = (err) => String(err?.message ?? err).split('\n')[0];

function git(cwd, ...gitArgs) {
  return execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
}

const isRemote = (repo) => /^[\w.-]+\/[\w.-]+$/.test(repo) || /^(?:https?|file):\/\//.test(repo);
const repoUrl = (repo) => (/^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}.git` : repo);

/** Blobless bare cache per repo: trees are enough to compare skill folders. */
function cacheFor(repo) {
  const dir = path.join(cacheRoot, repo.replace(/[^A-Za-z0-9._-]+/g, '__'));
  if (!fs.existsSync(path.join(dir, 'HEAD'))) {
    fs.mkdirSync(cacheRoot, { recursive: true });
    git(cacheRoot, 'clone', '-q', '--bare', '--depth=1', '--filter=blob:none', repoUrl(repo), dir);
  }
  return dir;
}

function fetchCommit(dir, ref) {
  if (ref !== 'HEAD') {
    try { git(dir, 'cat-file', '-e', `${ref}^{commit}`); return ref; } catch { /* not cached yet */ }
  }
  git(dir, 'fetch', '-q', '--depth=1', '--filter=blob:none', 'origin', ref);
  return git(dir, 'rev-parse', 'FETCH_HEAD').trim();
}

// One fetch of HEAD per repo per run, shared by registered and project skills.
const repos = new Map();
function openRepo(repo) {
  if (offline || !repo || !isRemote(repo)) return null;
  if (!repos.has(repo)) {
    try {
      const dir = cacheFor(repo);
      repos.set(repo, { dir, head: fetchCommit(dir, 'HEAD') });
    } catch (err) {
      repos.set(repo, { error: firstLine(err) });
    }
  }
  return repos.get(repo);
}

function treeAt(dir, commit, folder) {
  try { return git(dir, 'rev-parse', `${commit}:${folder}`).trim(); } catch { return null; }
}

const gitObject = (type, body) => createHash('sha1').update(`${type} ${body.length}\0`).update(body).digest('hex');

// The skills CLI leaves these out when it copies a skill (installer.ts EXCLUDE_*),
// running a skill's scripts creates caches, and plugin caches carry in-use markers;
// none of these is a local edit.
const SKIP_FILES = new Set(['metadata.json', '.DS_Store']);
const SKIP_DIRS = new Set(['.git', '__pycache__', '__pypackages__', '.in_use']);
const skipped = (rel) => {
  const parts = rel.split('/');
  return SKIP_FILES.has(parts[parts.length - 1]) || parts.slice(0, -1).some((part) => SKIP_DIRS.has(part));
};

/** path -> git blob id for every file under a local folder, minus CLI exclusions. */
function localFiles(dir, prefix = '', files = new Map()) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) { if (!SKIP_DIRS.has(name)) localFiles(full, rel, files); continue; }
    if (skipped(rel)) continue;
    files.set(rel, gitObject('blob', stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(full)) : fs.readFileSync(full)));
  }
  return files;
}

/** path -> blob id under a commit's folder or a bare tree id, from the blobless cache. */
function upstreamFiles(dir, treeish, folder) {
  const files = new Map();
  for (const record of git(dir, 'ls-tree', '-r', '-z', folder ? `${treeish}:${folder}` : treeish).split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const rel = record.slice(tab + 1);
    if (!skipped(rel)) files.set(rel, record.slice(0, tab).split(' ')[2]);
  }
  return files;
}

function editedFiles(local, upstream) {
  const names = new Set([...local.keys(), ...upstream.keys()]);
  return [...names].filter((name) => local.get(name) !== upstream.get(name)).sort();
}

const fileList = (edited) => `${edited.length} file${edited.length === 1 ? '' : 's'}: ${edited.slice(0, 3).join(', ')}${edited.length > 3 ? ', …' : ''}`;

/** Git tree id of a local folder, computed like `git write-tree` (fallback when no file list is available). */
export function localTreeHash(dir) {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory() && SKIP_DIRS.has(name)) continue;
    let mode;
    let id;
    if (stat.isSymbolicLink()) { mode = '120000'; id = gitObject('blob', Buffer.from(fs.readlinkSync(full))); }
    else if (stat.isDirectory()) { id = localTreeHash(full); mode = '40000'; if (!id) continue; }
    else { mode = stat.mode & 0o111 ? '100755' : '100644'; id = gitObject('blob', fs.readFileSync(full)); }
    entries.push({ name, mode, id, key: Buffer.from(mode === '40000' ? `${name}/` : name) });
  }
  if (entries.length === 0) return null;
  entries.sort((a, b) => Buffer.compare(a.key, b.key));
  return gitObject('tree', Buffer.concat(entries.flatMap((e) => [Buffer.from(`${e.mode} ${e.name}\0`), Buffer.from(e.id, 'hex')])));
}

function installState(item, pinTree, upstream, label = 'pin') {
  if (item.kind === 'reference') return 'reference only';
  if (!item.installed?.length) return item.parked ? `parked in ${item.parked}` : 'not installed';
  const states = item.installed.map((p) => {
    const real = expand(p);
    if (!fs.existsSync(real)) return `missing ${p}`;
    if (upstream) {
      const edited = editedFiles(localFiles(fs.realpathSync(real)), upstream);
      if (edited.length === 0) return `matches ${label}`;
      // Without a pin, a difference from HEAD may be an older install rather than an edit.
      return label === 'upstream HEAD' ? `differs from upstream HEAD, behind or edited, in ${p} (${fileList(edited)})` : `local edits in ${p} (${fileList(edited)})`;
    }
    if (!pinTree) return 'installed';
    return localTreeHash(fs.realpathSync(real)) === pinTree ? `matches ${label}` : `local edits in ${p}`;
  });
  return [...new Set(states)].join('; ');
}

function checkSkill(repo, skill, sourcePin, label) {
  let pin = null;
  let pinError = null;
  const ref = skill.pin ?? sourcePin;
  if (repo?.dir && ref) {
    try { pin = fetchCommit(repo.dir, ref); } catch { pinError = `pin ${ref.slice(0, 12)} not fetchable upstream`; }
  }
  const pinTree = skill.tree ?? (pin ? treeAt(repo.dir, pin, skill.path) : null);
  const headTree = repo?.head ? treeAt(repo.dir, repo.head, skill.path) : null;
  let upstream = 'upstream not checked';
  if (repo?.error) upstream = `upstream unreachable: ${repo.error}`;
  else if (pinError) upstream = pinError;
  else if (repo?.head) {
    if (!headTree) upstream = 'removed or renamed upstream';
    else if (!pinTree) upstream = 'unpinned';
    else upstream = headTree === pinTree ? 'current' : `changed upstream (HEAD ${repo.head.slice(0, 12)})`;
  }
  let files = null;
  if (repo?.dir) {
    // Without any pin, compare against HEAD: equal means current; different means behind or edited.
    const treeish = pin ?? skill.tree ?? (!pinTree && repo.head ? repo.head : null);
    const folder = pin || (!pinTree && repo.head) ? skill.path : '';
    if (treeish) { try { files = upstreamFiles(repo.dir, treeish, folder); } catch { files = null; } }
  }
  const matchLabel = pin || skill.tree ? label : 'upstream HEAD';
  return `${upstream}; ${installState(skill, pinTree, files, matchLabel)}`;
}

function checkSource(source) {
  const repo = openRepo(source.repo);
  const rows = [];
  const skills = source.skills ?? [];
  if (skills.length === 0) {
    let upstream = 'upstream not checked';
    if (repo?.error) upstream = `upstream unreachable: ${repo.error}`;
    else if (repo?.head) upstream = repo.head === source.pin ? 'current' : `upstream moved to ${repo.head.slice(0, 12)}`;
    rows.push({ source: source.name, item: `(${source.kind ?? 'source'})`, status: `${upstream}; ${installState(source)}` });
  }
  for (const skill of skills) rows.push({ source: source.name, item: skill.name, status: checkSkill(repo, skill, source.pin, 'pin') });
  const behind = rows.some((r) => /changed upstream|upstream moved|removed or renamed/.test(r.status));
  return { rows, update: behind && source.update ? source.update.replaceAll('<SHA>', repo?.head ?? '<SHA>') : null };
}

function readLock(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function unregistered(register) {
  const known = new Set(register.sources.flatMap((s) => (s.skills ?? []).map((k) => k.name)));
  const found = [];
  for (const lockPath of register.locks ?? []) {
    const lock = readLock(expand(lockPath));
    for (const [name, entry] of Object.entries(lock?.skills ?? {})) {
      if (!known.has(name)) found.push({ name, source: entry.source ?? '?', lock: lockPath });
    }
  }
  return found;
}

/** skills-lock.json files one or two levels below each lock root, minus explicitly registered locks. */
function projectLocks(register) {
  const explicit = new Set((register.locks ?? []).map((p) => path.resolve(expand(p))));
  const found = [];
  for (const root of register.lockRoots ?? []) {
    const base = expand(root);
    if (!fs.existsSync(base)) continue;
    const dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(base, d.name));
    for (const dir of dirs.flatMap((d) => [d, ...fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules').map((e) => path.join(d, e.name))])) {
      const file = path.join(dir, 'skills-lock.json');
      if (fs.existsSync(file) && !explicit.has(path.resolve(file))) found.push(file);
    }
  }
  return found.sort();
}

/** Every skill in the project locks: upstream state, local edits, and which clients can load it. */
function checkProjects(register) {
  const rows = [];
  const locks = projectLocks(register);
  for (const file of locks) {
    const project = path.dirname(file);
    for (const [name, entry] of Object.entries(readLock(file)?.skills ?? {})) {
      const places = ['.agents/skills', '.claude/skills'].map((base) => path.join(project, base, name));
      const skill = {
        name, path: path.posix.dirname(entry.skillPath ?? `${name}/SKILL.md`).replace(/^\.$/, ''),
        pin: entry.ref, installed: places.filter((p) => fs.existsSync(p)).map(tilde),
      };
      const [codex, claude] = places.map((p) => fs.existsSync(p));
      const reach = codex && claude ? '' : codex ? '; Codex only (no .claude/skills link)' : claude ? '; Claude Code only' : '';
      const source = entry.source ?? '?';
      const status = isRemote(source) ? checkSkill(openRepo(source), skill, null, 'pin') : `local source ${source}; ${installState(skill)}`;
      // The project column already names the folder; keep only the client-relative path.
      rows.push({ project: tilde(project), item: name, source, status: `${status}${reach}`.replaceAll(`${tilde(project)}/`, '') });
    }
  }
  return { locks: locks.length, rows };
}

const clean = (row) => /^(?:current|unpinned|upstream not checked); matches (?:pin|upstream HEAD)$/.test(row.status);

function main() {
  const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
  const results = register.sources.map((source) => ({ name: source.name, ...checkSource(source) }));
  const strays = unregistered(register);
  const projects = checkProjects(register);
  if (flag('--json')) {
    process.stdout.write(`${JSON.stringify({ register: registerPath, offline, results, unregistered: strays, projects }, null, 2)}\n`);
    return;
  }
  console.log(`Upstream register: ${registerPath}${offline ? ' (offline: install checks only)' : ''}`);
  for (const result of results) {
    for (const row of result.rows) console.log(`  ${row.source.padEnd(36)} ${row.item.padEnd(34)} ${row.status}`);
    if (result.update) console.log(`    review the diff, then update: ${result.update}`);
  }
  if (strays.length) {
    console.log('In the global lock but not in the register (add them or remove them deliberately):');
    for (const s of strays) console.log(`  ${s.name.padEnd(30)} ${s.source}  [${s.lock}]`);
  }
  const cleanCount = projects.rows.filter(clean).length;
  const shown = flag('--all') ? projects.rows : projects.rows.filter((row) => !clean(row));
  console.log(`Project installs: ${projects.rows.length} skills in ${projects.locks} project locks; ${cleanCount} clean${flag('--all') ? '' : ' (hidden; --all shows them)'}.`);
  for (const row of shown) console.log(`  ${row.project.padEnd(44)} ${row.item.padEnd(34)} ${row.status}`);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
  if (name[0] !== '#') return ENTITIES[name] ?? match;
  const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
  return code <= 0x10ffff ? String.fromCodePoint(code) : match;
});

/** The text a doc's hash is taken over (see the header for the rule). */
export function normalizeDoc(body, contentType = '') {
  let text = body;
  if (/html|xml/i.test(contentType)) {
    text = text.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');
    text = decodeEntities(text);
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Post URLs on an index: RSS item links as given, else page links below the registered URL's folder without query or fragment. */
export function extractPosts(entryUrl, body, contentType = '', finalUrl = entryUrl) {
  const posts = new Set();
  if (/xml/i.test(contentType)) {
    for (const [item] of body.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
      const link = /<link>\s*([^<]+?)\s*<\/link>/i.exec(item);
      if (link) posts.add(decodeEntities(link[1]));
    }
    return [...posts].sort();
  }
  const folder = new URL('.', entryUrl);
  const links = /markdown|plain/i.test(contentType) ? body.matchAll(/\]\(\s*([^)\s]+)/g) : body.matchAll(/href\s*=\s*["']([^"']+)["']/gi);
  for (const [, href] of links) {
    let url;
    try { url = new URL(decodeEntities(href), finalUrl); } catch { continue; }
    url.hash = '';
    url.search = '';
    const below = url.origin === folder.origin && url.pathname.startsWith(folder.pathname) && url.pathname !== folder.pathname;
    if (below && url.href !== entryUrl) posts.add(url.href);
  }
  return [...posts].sort();
}

const DOC_TIMEOUT_MS = 30000;

/** Fetch one docs entry: its hash and, for an index, its posts; or the reason it failed. */
export async function readDoc(entry, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(entry.url, { redirect: 'follow', signal: AbortSignal.timeout(DOC_TIMEOUT_MS) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const body = await res.text();
    const type = res.headers.get('content-type') ?? '';
    const sha256 = createHash('sha256').update(normalizeDoc(body, type)).digest('hex');
    if (entry.kind !== 'index') return { sha256 };
    const posts = extractPosts(entry.url, body, type, res.url || entry.url);
    return posts.length ? { sha256, posts } : { error: 'no post links found (page layout changed?)' };
  } catch (err) {
    return { error: err.name === 'TimeoutError' ? `timed out after ${DOC_TIMEOUT_MS / 1000}s` : err.cause?.code ?? firstLine(err) };
  }
}

export function docStatus(entry, current) {
  if (current.error) return `ERROR ${current.error}`;
  const since = entry.reviewed ?? 'never reviewed';
  if (entry.kind === 'index') {
    const known = new Set(entry.posts ?? []);
    const fresh = current.posts.filter((post) => !known.has(post));
    if (fresh.length) return `NEW POSTS since ${since}: ${fresh.join(' ')}`;
  }
  return current.sha256 === entry.sha256 ? 'unchanged' : `CHANGED since ${since} (${entry.url})`;
}

export async function checkDocs(docs, fetchImpl = fetch) {
  return Promise.all(docs.map(async (entry) => ({ id: entry.id, status: docStatus(entry, await readDoc(entry, fetchImpl)) })));
}

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Record the current state of one entry (or all) in the register object; entries that fail to fetch are left as they were. */
export async function markReviewed(register, which, { fetchImpl = fetch, today = localDate() } = {}) {
  const docs = register.docs ?? [];
  const targets = which === 'all' ? docs : docs.filter((entry) => entry.id === which);
  if (targets.length === 0) throw new Error(`no docs entry "${which}"; ids: ${docs.map((entry) => entry.id).join(', ')}, all`);
  return Promise.all(targets.map(async (entry) => {
    const current = await readDoc(entry, fetchImpl);
    if (current.error) return { id: entry.id, marked: false, status: `ERROR ${current.error} (not marked)` };
    entry.reviewed = today;
    entry.sha256 = current.sha256;
    if (entry.kind === 'index') entry.posts = current.posts;
    return { id: entry.id, marked: true, status: `marked reviewed ${today}` };
  }));
}

async function docsMain() {
  const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
  const width = Math.max(0, ...(register.docs ?? []).map((entry) => entry.id.length));
  const print = (rows) => { for (const row of rows) console.log(`  ${row.id.padEnd(width)} ${row.status}`); };
  if (flag('--mark-reviewed')) {
    const which = option('--mark-reviewed');
    if (!which || which.startsWith('--')) throw new Error('--mark-reviewed needs a docs entry id or "all"');
    const results = await markReviewed(register, which);
    if (results.some((r) => r.marked)) fs.writeFileSync(registerPath, `${JSON.stringify(register, null, 2)}\n`);
    console.log(`Docs register: ${registerPath}`);
    print(results);
    if (results.some((r) => !r.marked)) process.exitCode = 1;
    return;
  }
  const results = await checkDocs(register.docs ?? []);
  console.log(`Docs register: ${registerPath}`);
  print(results);
  if (results.some((r) => /^(?:CHANGED|NEW POSTS)/.test(r.status))) {
    console.log('    read what changed, update the doctrine if it needs it, then in the nebi-skill repo: node claude-home/nebi/upstreams.mjs --docs --mark-reviewed <id|all>, and redeploy');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fail = (err) => { console.error(`upstreams: ${err.message}`); process.exitCode = 1; };
  if (flag('--mark-reviewed') && !flag('--docs')) fail(new Error('--mark-reviewed only works with --docs'));
  else if (flag('--docs')) docsMain().catch(fail);
  else { try { main(); } catch (err) { fail(err); } }
}
