#!/usr/bin/env node
// feedback-capture.mjs — UserPromptSubmit hook for Claude Code and Codex.
// Wired by deploy.mjs. Saves the user's own complaints about agent behavior,
// ideas they drop and repos they name for integration into
// ~/.agents/nebi/feedback/inbox.jsonl, which nebi-maintenance triages. The Stop
// hook adds agent concessions ("You're right", "My fault"), which follow real
// complaints. The failure log depended on the agent remembering to write it;
// this capture does not. It is silent: nothing is added to the model's context
// and a prompt is never blocked. Patterns come from the user's own transcripts
// and stay tight so normal instructions do not turn the inbox into a message log.
// Set NEBI_FEEDBACK_CAPTURE=off for probes and test runs.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVAL_RUN, HARNESS, HARNESS_HOME, PLUGIN_SIDECALL } from './runtime.mjs';

export const INBOX = path.join(path.dirname(HARNESS_HOME), '.agents', 'nebi', 'feedback', 'inbox.jsonl');

// Longer messages are usually pasted briefs, logs or documents: only their
// opening and closing words are read as the user's own reaction.
const MAX_CHARS = 1500;
const EDGE_CHARS = 600;

const COMPLAINT = [
  /\bi (?:already |just )?(?:told|asked) you\b/i,
  /\bi'?ve (?:asked|told) you\b/i,
  /\b(?:like|as) i (?:said|asked)\b/i,
  /\bwhy (?:did|didn'?t|don'?t|won'?t) you\b/i,
  /\bwhy are you (?:still|using|doing|asking|adding|ignoring|making)\b/i,
  /\byou (?:didn'?t|did not|ignored|forgot|skipped|missed|ruined|messed|broke|still haven'?t|(?:clearly )?haven'?t listened)\b/i,
  /\byou (?:keep|never) (?:ignoring|forgetting|skipping|missing|asking|adding|breaking|doing that|listen|read|use|follow)\b/i,
  /\b(?:that'?s |this is )?not what i (?:asked|wanted|meant|said)\b/i,
  /\b(?:it was better before|before (?:it )?was better|nothing is different|literally no difference|have you even)\b/i,
  /\bwhat have you (?:really )?(?:done|changed|updated|improved)\b/i,
  /\bstill (?:broken|wrong|the same|not (?:fixed|working|done))\b/i,
  /\bstop (?:doing that|asking me|adding|making|being)\b/i,
  /\b(?:do it yourself|you can (?:easily )?do (?:this|it) yourself|why am i (?:supposed|the one))\b/i,
  /\b(?:you'?re so unclear|you are so unclear|i don'?t get it|too much text|pissing me off|making me mad)\b/i,
  /\b(?:is|looks|sounds|reads|feels)(?: like)? (?:ai[- ])?slop\b/i,
  /\b(?:took?|taking) (?:some )?inspiration\b/i,
  /\b(?:waarom (?:heb|doe|deed|ben) je|ik (?:zei|had (?:al )?gezegd)|nog steeds niet|niet wat ik (?:vroeg|bedoelde)|je (?:hebt|doet) (?:het )?weer)\b/i,
];
const IDEA = [
  /^(?:idea|idee|note to self|for later)\s*[:\-]/i,
  /\b(?:it would be (?:nice|great|cool)|would be (?:nice|great) if|i wish (?:you|it|we)|what if we|in the future (?:we|you)|remember (?:this|that) for (?:later|next time))\b/i,
  /\b(?:zou (?:mooi|leuk|handig) zijn|in de toekomst)\b/i,
];
// A public repo or catalog link next to integrate wording: the user naming something to install.
const NAMED_LINKS = /\b(?:https?:\/\/)?(?:github\.com\/[\w.-]+\/[\w.-]+(?:\/[\w./#-]*)?|skills\.sh\/[\w./-]+)/gi;
const NAMED_VERB = /\b(?:install|integrate|add|use|set up|setup|implement|try)\b/i;
// A bare owner/repo ("integrate kajisho5/ffmpeg-skill") counts only with install/integrate
// shortly before it, and never when it looks like a file path.
const BARE_REPO = /(?:^|[\s(`'"])([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*[A-Za-z0-9])(?=[\s).,`'"!?:;]|$)/g;
const STRONG_VERB = /\b(?:install|integrate)\b/i;
const FILE_LIKE = /\.(?:[cm]?[jt]sx?|json|md|py|liquid|css|scss|html|ya?ml|toml|lua|luau|txt|mp4|mov|webm|png|jpe?g|webp|gif|svg|mp3|wav|pdf)$/i;
// Agent replies that concede a mistake almost always follow a real complaint.
const CONCESSION = /^(?:you'?re (?:right|correct)|fair(?:\s*[—–.,:!-])|my (?:fault|mistake|bad)|that'?s on me|i was wrong|good catch)/i;

/** Drop quoted lines and code so a pasted log or diff cannot trigger capture. */
function ownWords(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<pasted_content[\s\S]*?<\/pasted_content[^>]*>/g, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n')
    .trim();
}

const links = (text) => [...new Set(text.match(NAMED_LINKS) ?? [])];
const bareRepos = (text) => [...text.matchAll(BARE_REPO)]
  .filter((m) => STRONG_VERB.test(text.slice(Math.max(0, m.index - 80), m.index)))
  .map((m) => m[1])
  .filter((name) => /[A-Za-z]/.test(name.split('/')[0]) && !FILE_LIKE.test(name) && !name.includes('github.com'));
/** Repo links and bare owner/repo names the user named, from the full text (before any truncation). */
const named = (text) => [...new Set([...links(text), ...bareRepos(text)])].slice(0, 10);

export function classify(prompt) {
  if (typeof prompt !== 'string') return null;
  let text = ownWords(prompt);
  // Slash commands and sharpened prompt artifacts are instructions, not reactions.
  if (!text || text.startsWith('/') || /^## Goal\b/.test(text) || /\n## Constraints\b/.test(text)) return null;
  if (text.length > MAX_CHARS) text = `${text.slice(0, EDGE_CHARS)}\n${text.slice(-EDGE_CHARS)}`;
  if (COMPLAINT.some((re) => re.test(text))) return 'complaint';
  if ((links(text).length && NAMED_VERB.test(text)) || bareRepos(text).length) return 'named';
  if (IDEA.some((re) => re.test(text))) return 'idea';
  return null;
}

/** Mask common secret and contact shapes; public repo links are kept separately and left intact. */
export function redact(text) {
  const kept = links(text);
  let masked = text;
  kept.forEach((link, i) => { masked = masked.split(link).join(`\u0000${i}\u0000`); });
  masked = masked
    .replace(/\b(?:sk|pk|rk|ghp|gho|ghs|xox[abp])[-_][A-Za-z0-9_-]{10,}/g, '[secret]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[secret]')
    .replace(/\b[A-Za-z0-9+_-]{32,}\b/g, '[secret]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b/g, '[phone]')
    .replace(/\b0[1-9](?:[\s-]?\d){8}\b/g, '[phone]');
  kept.forEach((link, i) => { masked = masked.split(`\u0000${i}\u0000`).join(link); });
  return masked.slice(0, 500);
}

function lastRecord() {
  if (!existsSync(INBOX)) return null;
  const lines = readFileSync(INBOX, 'utf8').trimEnd().split('\n');
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

function append(input, kind, text, repos = []) {
  const last = lastRecord();
  // Only an immediate repeat in the same session is a duplicate.
  if (last && last.kind === kind && last.text === text && last.session === (input.session_id ?? null)) return;
  mkdirSync(path.dirname(INBOX), { recursive: true });
  const record = {
    ts: new Date().toISOString(), harness: HARNESS, session: input.session_id ?? null,
    cwd: input.cwd ?? null, kind, text,
  };
  if (repos.length) record.links = repos;
  // Owner-only on creation: the inbox holds the user's own words.
  appendFileSync(INBOX, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

/** Called by the Stop hook: record a reply that concedes a mistake (first line only). */
export function recordConcession(input) {
  if (process.env.NEBI_FEEDBACK_CAPTURE === 'off' || PLUGIN_SIDECALL || EVAL_RUN) return;
  const raw = input.last_assistant_message ?? input.lastAssistantMessage ?? '';
  const message = typeof raw === 'string' ? raw.trim() : '';
  if (!CONCESSION.test(message)) return;
  append(input, 'concession', redact(message.split('\n')[0]).slice(0, 200));
}

function main() {
  if (process.env.NEBI_FEEDBACK_CAPTURE === 'off' || PLUGIN_SIDECALL || EVAL_RUN) return;
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const prompt = input.prompt ?? input.user_prompt ?? '';
  const kind = classify(prompt);
  if (!kind) return;
  const own = ownWords(prompt);
  append(input, kind, redact(own), named(own));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    /* fail-safe: capture is best effort and must never block a prompt */
  }
  process.exit(0);
}
