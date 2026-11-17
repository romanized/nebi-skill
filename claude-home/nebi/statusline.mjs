// Nebi statusline: how many other sessions wait on Nebi, model, context-window %,
// prompt-cache time left, effort, 5h and weekly limits, account and browser, git branch.
// Purpose: give the doctrine's dumb-zone rule (nebi-sessions skill) a live number
// instead of vibes, and say quietly when other sessions wait on Nebi, without any mod.
// The waiting count is plain text ("3 waiting"): no names, no wait times, no badge.
// Reads Claude Code's session JSON from stdin (fields per
// code.claude.com/docs/en/statusline); deploy re-runs it every 5 s. Beacon rules
// follow mods/CONTRACT.md ("Session beacon files"). Never throws: a broken
// statusline must never break the CLI. Node (no jq dependency on Windows).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

// The route reader ships beside this file; without it the account label is skipped.
let resolveRoute = null;
try { ({ resolveRoute } = await import("./route.mjs")); } catch { /* not deployed yet */ }

const MOD_STALE_MS = 90_000;                // a mod beacon past its heartbeat
const HOOK_STALE_MS = 12 * 60 * 60 * 1000;  // a Stop-hook beacon
const HOLD_STALE_MS = 15 * 60 * 1000;       // a Red Button hold
const MAX_FILE_BYTES = 64 * 1024;
const TAIL_BYTES = 256 * 1024;              // transcript tail the cache meter reads
const CACHE_1H_MS = 60 * 60 * 1000;
const CACHE_5M_MS = 5 * 60 * 1000;
const CACHE_WARN_MS = 10 * 60 * 1000;       // under this the cache meter turns yellow
const HIT_SHOWN_BELOW = 0.8;                // a normal turn's hit rate stays hidden
const NAME_MAX = 24;
const ACCOUNT_DIRS = [".claude", ".claude-max2"]; // account a, account b

// The account alert sits on a badge background with black text, readable on light and dark.
const RESET = "\x1b[0m";
const ALERT = "\x1b[30;41m";  // black on red
const badge = (color, text) => `${color} ${text} ${RESET}`;

// Beacon and route text comes from other sessions and repos: keep only what a person can see.
const ESCAPES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const UNSEEN = /[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}]/gu;
function clean(text, max) {
  if (typeof text !== "string") return "";
  const safe = text.replace(ESCAPES, "").replace(/\s+/g, " ").replace(UNSEEN, "").trim();
  const points = [...safe];
  return points.length > max ? `${points.slice(0, max - 1).join("")}…` : safe;
}

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

function readJson(file) {
  try {
    if (fs.statSync(file).size > MAX_FILE_BYTES) return null;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null; // missing, half-written or garbled: the next refresh retries
  }
}

function age(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// One <sessionId>.json (v1 or v2) to its kind, or null when stale.
function beaconKind(data, now) {
  if (data.version !== 1 && data.version !== 2) return null;
  const writer = data.version === 1 ? "mod" : data.writer;
  const updatedAt = num(data.updatedAt);
  const heartbeatAt = num(data.heartbeatAt);
  if (writer === "mod") {
    if (heartbeatAt === undefined || now - heartbeatAt > MOD_STALE_MS) return null;
  } else if (writer === "hook") {
    if (updatedAt === undefined || now - updatedAt > HOOK_STALE_MS) return null;
  } else {
    return null;
  }
  return data.kind;
}

// One <sessionId>.hold.json: Red Button holds a call, so that session needs Nebi.
function holdLive(data, now) {
  const heldAt = num(data.heldAt);
  return data.version === 1 && heldAt !== undefined && now - heldAt <= HOLD_STALE_MS;
}

/** Ids of live peer sessions that need Nebi, from the shared beacon folder, this session excluded. */
export function waitingPeers(home, ownId, now) {
  const dir = path.join(home, ".claude", "nebi", "beacons");
  let files;
  try { files = fs.readdirSync(dir); } catch { return new Set(); }
  const waiting = new Set();
  for (const file of files) {
    const hold = file.endsWith(".hold.json");
    if (!file.endsWith(".json")) continue;
    const id = file.slice(0, -(hold ? ".hold.json" : ".json").length);
    if (!id || id === ownId) continue;
    const data = readJson(path.join(dir, file));
    if (!data || data.sessionId !== id) continue;
    if (hold ? holdLive(data, now) : beaconKind(data, now) === "need") waiting.add(id);
  }
  return waiting;
}

// Claude Code's per-process session registry for both accounts
// (<config>/sessions/<pid>.json), read once a run: a few small files.
function readRegistry(home) {
  const sessions = [];
  for (const account of ACCOUNT_DIRS) {
    const dir = path.join(home, account, "sessions");
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; } // no such account here
    for (const file of files) {
      const data = file.endsWith(".json") ? readJson(path.join(dir, file)) : null;
      if (typeof data?.sessionId !== "string") continue;
      sessions.push({ sessionId: data.sessionId, configDir: path.join(home, account) });
    }
  }
  return sessions;
}

// "3 waiting" in plain text when other sessions need Nebi; nothing when none do.
const waitingSegment = (waiting) => (waiting.size ? `${waiting.size} waiting` : null);

// The last lines of a file; the first one is dropped when the tail cuts it mid-entry.
function readTail(file, bytes) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, bytes);
    const buf = Buffer.alloc(length);
    const read = fs.readSync(fd, buf, 0, length, size - length);
    const lines = buf.toString("utf8", 0, read).split("\n");
    return length < size ? lines.slice(1) : lines;
  } finally {
    fs.closeSync(fd);
  }
}

// The newest real API response, { at, ttlMs }, or null before the first one.
// Every response restarts the cache clock, a pure cache read too; the tier comes
// from the newest entry that wrote cache, and 1h when none in the tail did.
function cacheClock(lines) {
  let at;
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; } // blank, garbled or half-written
    const message = entry?.message;
    if (entry?.type !== "assistant" || entry.isSidechain === true || message?.model === "<synthetic>") continue;
    const time = Date.parse(entry.timestamp);
    if (!Number.isFinite(time)) continue;
    at ??= time;
    const written = message?.usage?.cache_creation;
    if (num(written?.ephemeral_1h_input_tokens) > 0) return { at, ttlMs: CACHE_1H_MS };
    if (num(written?.ephemeral_5m_input_tokens) > 0) return { at, ttlMs: CACHE_5M_MS };
  }
  return at === undefined ? null : { at, ttlMs: CACHE_1H_MS };
}

// "cache 47m" green, yellow under 10 min, dim "cache cold" once expired; the last
// request's hit rate joins only when it fell under 80%, so a rebuild stands out.
function cacheSegment(d, now) {
  const file = d?.transcript_path;
  if (typeof file !== "string" || !file) return null;
  const clock = cacheClock(readTail(file, TAIL_BYTES));
  if (!clock) return null;
  const left = clock.at + clock.ttlMs - now;
  if (left <= 0) return `\x1b[2mcache cold${RESET}`;
  const color = left >= CACHE_WARN_MS ? "\x1b[32m" : "\x1b[1;33m"; // bold: Latte's yellow is pale
  const usage = d?.context_window?.current_usage;
  const hits = num(usage?.cache_read_input_tokens) ?? 0;
  const total = hits + (num(usage?.cache_creation_input_tokens) ?? 0) + (num(usage?.input_tokens) ?? 0);
  const rate = total > 0 ? hits / total : 1;
  const hit = rate < HIT_SHOWN_BELOW ? ` · ${Math.floor(rate * 100)}% hit` : "";
  return `${color}cache ${age(left)}${hit}${RESET}`;
}

// The status-line child may not inherit CLAUDE_CONFIG_DIR: account b's session
// registry (~/.claude-max2/sessions/<pid>.json) still names this session.
function accountEnv(env, home, sessionId, registry) {
  if (env.CLAUDE_CONFIG_DIR || !sessionId) return env;
  const accountB = path.join(home, ".claude-max2");
  const inB = registry.some((s) => s.sessionId === sessionId && s.configDir === accountB);
  return inB ? { ...env, CLAUDE_CONFIG_DIR: accountB } : env;
}

// "A · Main" / "B · RapidSneakers"; a red badge when the project wants the other account.
function accountLabel(dir, env, home, sessionId, registry) {
  if (!resolveRoute) return null;
  const route = resolveRoute({ cwd: dir, env: accountEnv(env, home, sessionId, registry), home });
  if (!route) return null;
  const browser = clean(route.label ?? route.chromeProfile ?? "", NAME_MAX).replace(/\s+chrome$/i, "");
  const text = [route.account?.toUpperCase(), browser].filter(Boolean).join(" · ");
  if (!text) return null;
  return route.mismatch ? badge(ALERT, text) : text;
}

function main() {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(0, "utf8")); } catch { /* no/blank stdin */ }
  const home = os.homedir();
  const now = Date.now();
  const sessionId = typeof d?.session_id === "string" ? d.session_id : "";
  const dir = d?.workspace?.current_dir || d?.cwd;
  const registry = readRegistry(home);

  const parts = [];
  const step = (fn) => { try { const part = fn(); if (part) parts.push(part); } catch { /* skip this part */ } };

  // Other sessions waiting on Nebi (both accounts share the beacon folder)
  step(() => waitingSegment(waitingPeers(home, sessionId, now)));

  // Model, without the "(1M context)" tail
  step(() => d?.model?.display_name?.replace(/\s*\(1M context\)\s*$/i, ""));

  // Context window % — display utilization only; session decisions belong to
  // nebi-sessions and task context, not a fixed statusline threshold.
  step(() => {
    const pct = d?.context_window?.used_percentage;
    if (typeof pct !== "number") return null;
    const p = Math.round(pct);
    // Color only helps scan utilization; it does not prescribe a handoff.
    let color = "\x1b[32m";                 // green
    if (p >= 75) color = "\x1b[31m";        // red   — past the danger line
    else if (p >= 55) color = "\x1b[33m";   // yellow— approaching dumb zone
    return `${color}ctx ${p}%${RESET}`;
  });

  // Prompt cache: how long this session stays cheap to continue
  step(() => cacheSegment(d, now));

  // Reasoning effort (ultracode reports as xhigh)
  step(() => d?.effort?.level);

  // 5-hour and weekly rate-limit windows (Max plan) — present after the 1st call
  step(() => {
    const rl = d?.rate_limits?.five_hour?.used_percentage;
    return typeof rl === "number" ? `5h ${Math.round(rl)}%` : null;
  });
  step(() => {
    const wk = d?.rate_limits?.seven_day?.used_percentage;
    return typeof wk === "number" ? `wk ${Math.round(wk)}%` : null;
  });

  // Which Claude account this is and which Chrome the project uses
  step(() => accountLabel(dir || process.cwd(), process.env, home, sessionId, registry));

  // Git branch, last (best-effort, fast, silent on failure / non-repo)
  if (dir) step(() => {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: dir, stdio: ["ignore", "pipe", "ignore"], timeout: 800,
    }).toString().trim();
    return branch ? `⎇ ${branch}` : null;
  });

  process.stdout.write(parts.join(" · "));
}

try { main(); } catch { /* prime directive: never break the CLI */ }
process.exit(0);
