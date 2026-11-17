#!/usr/bin/env node
// Offline structural checks for this pack's deliberately simple frontmatter.
// This is not a general YAML parser or a measurement of model behavior.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTriggers } from '../claude-home/nebi/run-trigger-evals.mjs';

export function checkPack(root = fileURLToPath(new URL('../', import.meta.url))) {
  const errors = [];
  const metrics = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  const skillsDir = path.join(root, 'claude-home/skills');
  const dirs = fs.readdirSync(skillsDir).sort();
  for (const dir of dirs) {
    const base = path.join(skillsDir, dir);
    const raw = fs.readFileSync(path.join(base, 'SKILL.md'), 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    require(fm, `${dir}: missing frontmatter`);
    if (!fm) continue;
    // Fail explicitly on unsupported syntax rather than silently miscounting it.
    const entries = fm[1].split(/\r?\n/).filter((line) => line.trim()).map((line) => line.match(/^(name|description): (.+)$/));
    require(entries.every(Boolean) && entries.length === 2, `${dir}: use plain name and description frontmatter; extend this checker before changing schema`);
    const fields = Object.fromEntries(entries.filter(Boolean).map((m) => [m[1], m[2].startsWith('"') ? JSON.parse(m[2]) : m[2]]));
    require(fields.name === dir && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dir) && dir.length <= 64, `${dir}: invalid or mismatched name`);
    require(fields.description?.length > 0 && fields.description.length <= 1024, `${dir}: description must be 1–1024 characters`);
    const descriptionEntry = entries.find((m) => m?.[1] === 'description');
    require(descriptionEntry?.[2].startsWith('"'), `${dir}: description needs YAML quoting (use a JSON string)`);
    const body = raw.slice(fm[0].length);
    require(body.trim() && body.split('\n').length < 500, `${dir}: empty or oversized body`);
    require(!/\b(?:GPT-\d|Opus|Sonnet|Haiku|Fable|Mythos|gpt-\d)/i.test(body), `${dir}: model binding in shared skill`);
    for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|#)/.test(target)) continue;
      require(fs.existsSync(path.resolve(base, target.split('#')[0])), `${dir}: missing reference ${target}`);
    }
    const corpus = JSON.parse(fs.readFileSync(path.join(base, 'evals/evals.json'), 'utf8'));
    require(corpus.skill_name === dir && Array.isArray(corpus.evals) && corpus.evals.length > 0, `${dir}: invalid behavioral corpus`);
    const ids = new Set();
    for (const c of corpus.evals ?? []) {
      require(Number.isInteger(c.id) && !ids.has(c.id), `${dir}: invalid or duplicate case ID ${c.id}`);
      ids.add(c.id);
      require(c.name && c.prompt && c.expected_output && c.expectations?.length && c.expectations.every((v) => typeof v === 'string' && v.trim()), `${dir}: incomplete case ${c.id}`);
      for (const file of c.files ?? []) require(fs.existsSync(path.resolve(base, file)), `${dir}: missing eval fixture ${file}`);
    }
    const triggers = parseTriggers(fs.readFileSync(path.join(base, 'evals/triggers.md'), 'utf8'));
    require(triggers.mustFire.length > 0 && triggers.mustNotFire.length > 0, `${dir}: missing trigger polarity`);
    const prompts = [...triggers.mustFire, ...triggers.mustNotFire];
    require(new Set(prompts).size === prompts.length, `${dir}: duplicate/conflicting trigger prompt`);
    metrics.push({ skill: dir, listingChars: dir.length + (fields.description?.length ?? 0), bodyLines: body.split('\n').length, triggers: prompts.length, behaviorCases: corpus.evals.length });
  }
  const cores = ['claude-home/CLAUDE.md', 'codex-home/AGENTS.md'].map((file) => fs.readFileSync(path.join(root, file), 'utf8'));
  const dates = cores.map((raw) => raw.match(/as of\s+\*\*(\d{4}-\d{2}-\d{2})\*\*/)?.[1]);
  require(dates.every(Boolean) && new Set(dates).size === 1, 'Harness binding review dates differ or are missing');
  const headings = cores.map((raw) => [...raw.matchAll(/^## (\d+[a-z]?)[.\s]/gm)].map((m) => m[1]).join(','));
  require(new Set(headings).size === 1, 'Harness core section IDs differ');
  const template = fs.readFileSync(path.join(root, 'claude-home/nebi/current-work.template.md'), 'utf8');
  require(template.split('\n').slice(0, 4).every((line, i) => line.startsWith(['Project:', 'Goal:', 'Last state:', 'Next step:'][i])), 'Current-work template canonical fields differ');
  return { errors, metrics, listingChars: metrics.reduce((sum, s) => sum + s.listingChars, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkPack(process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
