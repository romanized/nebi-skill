// One-off backfill for the 2026-09-24 usage pass: skill loads per session in the last N days of
// Claude Code transcripts (Skill calls, slash commands) and Codex sessions (reads of installed SKILL.md
// files, including code-mode exec). Sessions in this repo and probe/eval folders are excluded or split out.
// Run: NEBI_SKILL_USAGE=off node 2026-09-24-usage-backfill.mjs [days]
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { skillFrom } from '../skill-usage.mjs';

const DAYS = Number(process.argv[2] ?? 30);
const since = Date.now() - DAYS * 86400000;
const PROBE = /nebi-trigger-eval|\/tmp\/nebi-|scratchpad|codexprobe|scratch-workspaces|\/T\/|neutral/;
const real = new Map(); const probe = new Map();
let FILE = '';
const bump = (m, skill, harness, project, ts) => {
  skill = skill.replace(/^\//, '');
  if (!/^[a-z][\w:-]+$/.test(skill)) return;
  const e = m.get(skill) ?? { n: 0, claude: 0, codex: 0, projects: new Set(), sessions: new Set(), last: '' };
  if (e.sessions.has(FILE)) return;
  e.sessions.add(FILE); e.n++; e[harness]++; e.projects.add(project); if (ts > e.last) e.last = ts; m.set(skill, e);
};
const READ = /(?:^|[\s;&|("'])(?:sed\s+-n\s+\S+|(?:cat|head|nl|less|bat)(?:\s+-\S+(?:\s+\d+)?)*)\s+['"]?[^'"\s;|&]*\/([^/\s'"]+)\/SKILL\.md/g;
const walk = (dir, out = []) => { if (!fs.existsSync(dir)) return out; for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, d.name); if (d.isDirectory()) walk(p, out); else if (d.name.endsWith('.jsonl') && fs.statSync(p).mtimeMs >= since) out.push(p); } return out; };
let files = 0;

for (const file of walk(path.join(homedir(), '.claude', 'projects'))) {
  files++; FILE = file;
  const project = file.split('/projects/')[1].split('/')[0];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"Skill"') && !line.includes('command-name') && !line.includes('SKILL.md')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const ts = o.timestamp ?? ''; if (!ts || Date.parse(ts) < since) continue;
    const cwd = o.cwd ?? project; const m = PROBE.test(cwd) || PROBE.test(project) ? probe : real;
    const content = o.message?.content;
    if (o.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) if (c.type === 'tool_use') { const s = skillFrom({ tool_name: c.name, tool_input: c.input }); if (s) bump(m, s, 'claude', project, ts); }
    }
    if (o.type === 'user') {
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => c.text ?? '').join(' ') : '';
      for (const [, name] of text.matchAll(/<command-name>\/([\w:-]+)<\/command-name>/g)) bump(m, `/${name}`, 'claude', project, ts);
    }
  }
}
for (const file of walk(path.join(homedir(), '.codex', 'sessions'))) {
  files++; FILE = file;
  let cwd = '';
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type === 'session_meta') { cwd = o.payload?.cwd ?? ''; continue; }
    if (!line.includes('SKILL.md')) continue;
    const ts = o.timestamp ?? ''; if (!ts || Date.parse(ts) < since) continue;
    const p = o.payload ?? {};
    if (p.type !== 'function_call' && p.type !== 'custom_tool_call') continue;
    const text = String(p.arguments ?? p.input ?? '').replace(/\\"/g, '"');
    for (const mm of text.matchAll(READ)) if (/\.(?:agents|claude|codex)\/(?:skills|plugins)|\.codex\/skills/.test(mm[0]) && !/nebi-skill/.test(cwd)) bump(PROBE.test(cwd) ? probe : real, mm[1], 'codex', path.basename(cwd) || '?', ts);
  }
}
const show = (label, m) => {
  console.log(`\n${label}`);
  for (const [k, e] of [...m].sort((a, b) => b[1].n - a[1].n)) console.log(`${String(e.n).padStart(5)}  ${k.padEnd(40)} claude ${e.claude} codex ${e.codex}  projects ${e.projects.size}  last ${e.last.slice(0, 10)}`);
};
console.log(`files scanned: ${files}, window ${DAYS}d`);
show('REAL WORK', real);
show('PROBES / EVALS', probe);
