#!/usr/bin/env node
// steer-channel.mjs — Claude Code PreToolUse hook (operator channel).
// Wired by deploy.mjs into settings.json as hooks.PreToolUse (all tools).
// Two owner-controlled files under ~/.claude/nebi/:
//   AGENT_STOP — kill switch: while it exists, every tool call is denied.
//     This is the ONE hook that intentionally blocks — it's the owner's hand
//     on the wheel, not doctrine enforcement. Delete the file to resume.
//   STEER.md  — mid-run steering note: injected once as additionalContext,
//     then renamed to STEER.consumed.md so it can't inject twice.
// Browser guard (Claude only, the no-mod twin of nebi-browser): when the
// project has a route (mods/CONTRACT.md), switch_browser and select_browser
// naming another device are denied with what to call instead, unless Nebi's
// latest prompt asked to pair, switch or name a browser.
// It also records skill loads for the usage report (../nebi/skill-usage.mjs).
// Fast (existsSync on the hot path) and fail-safe: any error → exit 0.
import { readFileSync, existsSync, renameSync, rmSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import path from 'node:path';
import { HARNESS, NEBI_DIR } from './runtime.mjs';

const STOP_FILE = path.join(NEBI_DIR, 'AGENT_STOP');
const STEER_FILE = path.join(NEBI_DIR, 'STEER.md');
const CONSUMED_FILE = path.join(NEBI_DIR, 'STEER.consumed.md');

const CHROME = 'mcp__claude-in-chrome__';
// Same wording test as nebi-browser's: "pair the rapidsneakers browser", "switch chrome".
const ASKS_TO_PAIR = /\b(re-?pair|pair|switch|re-?name|name|nam)(s|es|ed|ing)?\b[^.?!\n]{0,40}\b(browsers?|chromes?)\b|\b(browsers?|chromes?)\b[^.?!\n]{0,40}\b(re-?pair|pair|switch|re-?name|name|nam)(s|es|ed|ing)?\b/i;
// Prompt origins that are Nebi typing (a task notification or a peer is not).
const OWN_PROMPT = new Set(['human', 'composer', 'bridge']);
const TRANSCRIPT_TAIL = 1024 * 1024;

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }) + '\n',
  );
}

/** The text of the transcript's latest prompt when Nebi typed it, else ''. */
function latestOwnPrompt(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return '';
  const fd = openSync(transcriptPath, 'r');
  let tail;
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, TRANSCRIPT_TAIL);
    tail = Buffer.alloc(length);
    readSync(fd, tail, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  const lines = tail.toString('utf8').split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (entry?.type !== 'user' || !entry.origin) continue;
    if (!OWN_PROMPT.has(entry.origin.kind)) return '';
    const content = entry.message?.content;
    if (typeof content === 'string') return content;
    return Array.isArray(content) ? content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '';
  }
  return '';
}

/** Why this Claude in Chrome call is refused, or null to let it pass. */
async function browserDenial(input) {
  const tool = typeof input.tool_name === 'string' ? input.tool_name : '';
  if (HARNESS !== 'claude' || !tool.startsWith(CHROME)) return null;
  const name = tool.slice(CHROME.length);
  if (name !== 'switch_browser' && name !== 'select_browser') return null;
  const { resolveRoute } = await import('../nebi/route.mjs');
  const route = resolveRoute({ cwd: typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd() });
  if (!route?.deviceId) return null;
  const asked = String(input.tool_input?.deviceId ?? '').trim().toLowerCase();
  if (name === 'select_browser' && asked === route.deviceId.toLowerCase()) return null;
  let isPairingAsked = false;
  try { isPairingAsked = ASKS_TO_PAIR.test(latestOwnPrompt(input.transcript_path)); } catch { /* unread: stay strict */ }
  if (isPairingAsked) return null;
  // A route file can sit in a cloned repository: one short plain line per value.
  const plain = (value) => String(value ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 64);
  const device = plain(route.deviceId);
  const label = plain(route.label);
  return name === 'switch_browser'
    ? `switch_browser pops a pairing request in every Chrome. Call select_browser with deviceId ${device}${label ? ` (${label})` : ''} instead.`
    : `This project uses ${label ? `${label} (${device})` : device}. Call select_browser with deviceId ${device} instead.`;
}

async function main(input) {
  if (existsSync(STOP_FILE)) {
    deny(`Nebi halted every tool call with ${STOP_FILE}. Make no more tool calls this turn; end with ❓ Need you and say the run is paused until Nebi removes that file.`);
    return true;
  }

  let refusal = null;
  try { refusal = await browserDenial(input); } catch { /* a broken route never blocks a tool */ }
  if (refusal) {
    deny(refusal);
    return true;
  }

  if (!existsSync(STEER_FILE)) return;
  const note = readFileSync(STEER_FILE, 'utf8');
  if (!note.trim()) return;

  // Consume BEFORE emitting: if the rename fails we skip the inject (next
  // tool call retries); the reverse order could inject the note in a loop.
  rmSync(CONSUMED_FILE, { force: true });
  renameSync(STEER_FILE, CONSUMED_FILE);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `Operator steer note (from ${STEER_FILE}, injected once):\n${note}`,
      },
    }) + '\n',
  );
}

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}') ?? {};
} catch {
  /* no payload: the stop switch and steer note still work */
}
let stopped = false;
try {
  stopped = (await main(input)) === true;
} catch {
  /* fail-safe: never block a tool */
}
// Usage logging loads last and on its own, so a missing or broken module can
// never take the stop switch or the steer note down with it.
if (!stopped) {
  try {
    const { recordSkillUse } = await import('../nebi/skill-usage.mjs');
    recordSkillUse(input);
  } catch {
    /* usage logging is best effort */
  }
}
process.exit(0);
