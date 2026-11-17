#!/usr/bin/env node
// verify-before-stop.mjs — Claude Code Stop hook (§6 proof gate, ledger-backed v2).
// Wired by deploy.mjs into settings.json as hooks.Stop.
// Reads the Stop event JSON from stdin (last_assistant_message, stop_hook_active,
// background_tasks on 2.1.145+) and checks done-claims against the session's
// evidence ledger (~/.claude/nebi/ledgers/<session_id>.jsonl, written by
// tool-ledger.mjs): a done-claim after an edit needs the latest tracked Bash
// result to be a known success. This is only a command-order heuristic: it
// cannot prove a command was semantically relevant, and shell-side writes are
// outside the edit ledger. Read-only sessions and sessions without a ledger
// stay silent — no evidence, no nudge. It also catches early stops (§3): when
// the payload shows nothing in flight and the reply ends on ⏳ or on no status
// line, it nudges once to continue or ask. While real background work runs it
// nudges only a ✅ reply; artifact watchers never count as work. Emits at most
// one soft additionalContext per stop — NEVER decision:"block". On Claude it
// also writes this session's fallback beacon (mods/CONTRACT.md, writer "hook")
// when no fresh nebi-beacon file exists, except in a verification session
// (NEBI_VERIFY=1, nebi-mod-verify's paint check), which other sessions must
// never see. A broken hook must never block a
// session: any error → exit 0.
import { readFileSync, existsSync, mkdirSync, writeFileSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HARNESS, LEDGER_DIR, safeSessionId } from './runtime.mjs';
import { recordConcession } from './feedback-capture.mjs';

// Ledger entries that count as edits. The latest Bash entry after the last one
// must be a known success for this heuristic to stay silent.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'apply_patch']);

// Done-claims per §6 ("done means verified").
const DONE_RE = /\b(done|verified|complete[d]?|passes|works now)\b/i;

// §3 status line: a line opening with one of the three signals, allowing
// markdown emphasis or code ticks around it. The last one found counts.
const STATUS_RE = /^[\s>*_`]*(✅|⏳|❓)/u;

// The engine's artifact comment and presence watchers never end, and the Stop
// payload drops their ambient flag. A Monitor-tool watcher has other wording.
const WATCHER_RE = /^(live updates for|presence on) artifact /i;

// Beacon files (mods/CONTRACT.md): one folder for both accounts; a mod file
// counts as fresh while its heartbeat is under 90 s old.
const BEACON_DIR = path.join(os.homedir(), '.claude', 'nebi', 'beacons');
const MOD_FRESH_MS = 90_000;
const BEACON_KIND = { '✅': 'done', '⏳': 'background', '❓': 'need' };
const STATUS_LABEL = /^[\s*_`]*(?:done|working|need you)\b[\s*_`]*[—–:·-]?\s*/iu;
const TEXT_MAX = 300;
// An open ask clears only on a prompt Nebi typed (CONTRACT: composer or bridge;
// the transcript calls it human), not on a task notification or a peer.
const OWN_PROMPT = new Set(['human', 'composer', 'bridge']);
const TRANSCRIPT_TAIL = 1024 * 1024;

function emit(context) {
  // Codex Stop has no Claude-style additionalContext continuation. Keep this
  // heuristic advisory through its supported UI/event-stream warning field.
  const output = HARNESS === 'codex'
    ? { systemMessage: context }
    : { hookSpecificOutput: { hookEventName: 'Stop', additionalContext: context } };
  process.stdout.write(
    JSON.stringify(output) + '\n',
  );
}

/** In-flight background tasks, or null when the payload doesn't report them. */
function backgroundTaskList(tasks) {
  // Shape is version-dependent; accept array or object map. The field is absent
  // on older clients, on Codex, and when the task registry is unreachable.
  if (Array.isArray(tasks)) return tasks;
  return tasks && typeof tasks === 'object' ? Object.values(tasks) : null;
}

function isWatcher(task) {
  return task?.type === 'monitor' && WATCHER_RE.test(String(task.description ?? ''));
}

function countRunning(list) {
  return (list ?? []).filter(
    (t) => t && typeof t === 'object' && String(t.status ?? '').toLowerCase() === 'running',
  ).length;
}

/** The reply's last status line, or null when it has none. */
function finalStatusLine(msg) {
  return msg.split('\n').findLast((line) => STATUS_RE.test(line)) ?? null;
}

/** The last status signal in the reply, or null when it has none. */
function finalStatus(msg) {
  return finalStatusLine(msg)?.match(STATUS_RE)[1] ?? null;
}

/** Model text made safe for another session's screen: no escapes or controls, one line. */
function clean(text, max) {
  const safe = String(text)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}]/gu, '')
    .trim();
  const points = [...safe];
  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : safe;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Origin kind of the prompt that started this turn, or null when unknown. */
function promptOrigin(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return null;
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
    if (entry?.type === 'user' && typeof entry.origin?.kind === 'string') return entry.origin.kind;
  }
  return null;
}

/**
 * Fallback beacon (CONTRACT v2, writer "hook") for sessions running without
 * nebi-beacon. A fresh mod file wins; a stale one or an older hook file is replaced.
 */
async function writeHookBeacon(input, msg) {
  const sessionId = input.session_id;
  if (HARNESS !== 'claude' || input.agent_id || process.env.NEBI_VERIFY === '1') return;
  if (typeof sessionId !== 'string' || !sessionId || safeSessionId(sessionId) !== sessionId) return;
  const file = path.join(BEACON_DIR, `${sessionId}.json`);
  const now = Date.now();
  const current = readJson(file);
  const isModFile = current?.version === 1 || current?.writer === 'mod';
  if (isModFile && Number.isFinite(current.heartbeatAt) && now - current.heartbeatAt < MOD_FRESH_MS) return;

  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  let route = null;
  let account = null;
  try {
    const { resolveRoute, currentAccount } = await import('../nebi/route.mjs');
    route = resolveRoute({ cwd });
    account = route ? route.account : currentAccount();
  } catch { /* route is optional: no account, no browser */ }

  const line = finalStatusLine(msg);
  const signal = line?.match(STATUS_RE);
  let kind = signal ? BEACON_KIND[signal[1]] : 'missing';
  let text = signal
    ? clean(line.slice(signal[0].length).replace(STATUS_LABEL, '').replace(/[\s*_`]+$/u, ''), TEXT_MAX)
    : '';
  // An ask this hook recorded stays open through turns Nebi did not start.
  let origin = null;
  try { origin = promptOrigin(input.transcript_path); } catch { /* unknown: follow the reply */ }
  const open = current?.writer === 'hook' && current.ask && Number.isFinite(current.askedAt) ? current : null;
  const carried = open && origin !== null && !OWN_PROMPT.has(origin) ? open : null;
  if (carried && kind !== 'need') {
    kind = 'need';
    text = clean(carried.ask.what ?? '', TEXT_MAX);
  }
  const beacon = {
    version: 2,
    writer: 'hook',
    sessionId,
    project: path.basename(cwd),
    cwd,
    account,
    browser: route?.deviceId ? { deviceId: route.deviceId, label: route.label ?? route.deviceId.slice(0, 8) } : null,
    kind,
    text,
    ...(kind === 'need' ? { ask: { what: text }, askedAt: carried?.askedAt ?? now } : {}),
    updatedAt: now,
  };
  mkdirSync(BEACON_DIR, { recursive: true });
  writeFileSync(file, `${JSON.stringify(beacon, null, 2)}\n`);
}

/** Parsed ledger entries for this session, or null when no ledger file exists. */
function readLedger(sessionId) {
  const file = path.join(LEDGER_DIR, `${safeSessionId(sessionId)}.jsonl`);
  if (!existsSync(file)) return null;
  const entries = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      /* corrupt line — skip it */
    }
  }
  return entries;
}

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  try { recordConcession(input); } catch { /* capture is best effort */ }

  const raw = input.last_assistant_message ?? input.lastAssistantMessage ?? '';
  const msg = typeof raw === 'string' ? raw : String(raw?.text ?? '');
  try { await writeHookBeacon(input, msg); } catch { /* the beacon is best effort */ }

  // Loop guard: we already nudged once this stop cycle — let it end.
  if (input.stop_hook_active === true) return;

  // Unknown task state (field absent) stays null; artifact watchers are not work.
  const tasks = backgroundTaskList(input.background_tasks)?.filter((t) => !isWatcher(t)) ?? null;
  const running = countRunning(tasks);
  const status = finalStatus(msg);
  if (running > 0) {
    // A ⏳ or ❓ reply already says work is in flight; only a done-claim is early.
    if (status !== '✅') return;
    const one = running === 1;
    emit(
      `${running} background task${one ? '' : 's'} still running — wait for ${one ? 'it' : 'them'} and use ${one ? 'its result' : 'their results'} before claiming done.`,
    );
    return;
  }

  if (!msg) return;

  // Early stop (§3): the reply ends on ⏳ Working or on no status line, and the
  // payload shows nothing in flight or scheduled to wake the session. Unknown
  // task state (field absent) stays silent rather than guessing.
  const scheduled = Array.isArray(input.session_crons) && input.session_crons.length > 0;
  if (tasks?.length === 0 && !scheduled && status !== '✅' && status !== '❓') {
    emit(
      'Soft check (§3): this reply ends without ✅ Done or ❓ Need you, and no background task ' +
        'is still running. If the work is finished and verified, end with ✅ Done. If the next step ' +
        'needs nothing from the user, take it now; otherwise ' +
        'end with ❓ Need you and the one thing you need.',
    );
    return;
  }

  // Evidence, not vibes: no ledger (hook not firing yet / older session) → silence.
  const entries = readLedger(input.session_id);
  if (entries === null) return;

  // Read-only session — nothing was written, nothing to prove. Stay silent
  // no matter what the reply claims.
  const lastEdit = entries.findLastIndex((e) => e && EDIT_TOOLS.has(e.tool) && e.ok !== false);
  if (lastEdit === -1) return;

  // Command order matters: an earlier success cannot mask a later failure or
  // an unknown response. This does not establish that the command proves the
  // claim; it merely detects the absence of a known-successful latest command.
  const latestCommand = entries.slice(lastEdit + 1).findLast((e) => e && e.tool === 'Bash');
  const proven = latestCommand?.ok === true;
  if (proven) return;
  // Codex unified exec omits exit status from hook payloads in 0.153.0. Keep
  // that result unknown and defer to the lead's tool output; do not nag on
  // every ordinary successful command or manufacture a passing receipt.
  if (HARNESS === 'codex' && latestCommand?.ok === null) return;

  if (DONE_RE.test(msg) || msg.includes('✅')) {
    emit(
      'Soft check (§6): this reply claims done, but the command-order heuristic has no ' +
        'known-successful latest Bash result after the latest tracked edit. It cannot establish ' +
        'semantic relevance or shell-side writes; run the relevant proving command and read its ' +
        'output before claiming done. If proof is genuinely unclear or the change is risky, ' +
        'dispatch one small fresh checker rather than self-certifying.',
    );
  }
}

try {
  await main();
} catch {
  /* fail-safe: never block a stop */
}
process.exit(0);
