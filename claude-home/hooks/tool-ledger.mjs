#!/usr/bin/env node
// tool-ledger.mjs — Claude Code tool completion/failure evidence ledger.
// Wired by deploy.mjs into PostToolUse and PostToolUseFailure with matcher
// Bash|Edit|Write|MultiEdit.
// Appends one JSON line {ts, tool, ok} per tool call to
// ~/.claude/nebi/ledgers/<session_id>.jsonl. The Stop hook reads this to check
// done-claims against what actually ran (§6); the SessionEnd hook prunes
// ledgers older than 7 days. Fail-safe: any error → exit 0, never blocks a tool.
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { HARNESS, LEDGER_DIR, safeSessionId } from './runtime.mjs';

const LEDGER_TOOLS = new Set(['Bash', 'Edit', 'Write', 'MultiEdit', 'apply_patch']);

/** Known tool result: true, false, or null when the response shape is unknown. */
function toolOk(resp, event, tool) {
  if (event === 'PostToolUseFailure') return false;
  // PostToolUse is the harness success event. Bash's normal response carries
  // stdout/stderr/interrupted, not an exit code. Respect explicit failures first.
  if (resp && typeof resp === 'object') {
    if (resp.success === false || resp.is_error === true || resp.isError === true || resp.interrupted === true) return false;
    const code = resp.exit_code ?? resp.exitCode;
    if (typeof code === 'number') return code === 0;
  }
  // Codex fires PostToolUse after failed Bash commands too. In 0.153.0 unified
  // exec sends plain output without an exit code. Never infer status from text.
  if (HARNESS === 'codex') {
    if (tool === 'apply_patch' && typeof resp === 'string') {
      return resp.startsWith('Success. Updated the following files:') ? true : null;
    }
    return resp?.success === true ? true : null;
  }
  if (event === 'PostToolUse') return true;
  if (!resp || typeof resp !== 'object' || Array.isArray(resp)) return null;
  if (resp.success === false) return false;
  if (resp.is_error === true || resp.isError === true) return false;
  if (resp.interrupted === true) return false;
  const code = resp.exit_code ?? resp.exitCode;
  if (typeof code === 'number') return code === 0;
  if (resp.success === true) return true;
  return null;
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const tool = typeof input.tool_name === 'string' ? input.tool_name : '';
  // The settings matcher already filters, but don't trust it blindly.
  if (!LEDGER_TOOLS.has(tool)) return;

  const entry = { ts: new Date().toISOString(), tool, ok: toolOk(input.tool_response, input.hook_event_name, tool) };
  mkdirSync(LEDGER_DIR, { recursive: true });
  appendFileSync(
    path.join(LEDGER_DIR, `${safeSessionId(input.session_id)}.jsonl`),
    JSON.stringify(entry) + '\n',
    'utf8',
  );
}

try {
  main();
} catch {
  /* fail-safe: never block a tool */
}
process.exit(0);
