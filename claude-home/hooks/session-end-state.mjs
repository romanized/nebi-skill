#!/usr/bin/env node
// Record this session's repository facts. Never rewrite authored checkpoints
// or the legacy global work note. Session observations have separate writers.
// On Claude it also removes this session's fallback beacon (writer "hook",
// written by verify-before-stop.mjs); a nebi-beacon file is the mod's to delete.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVAL_RUN, HARNESS, LEDGER_DIR, PLUGIN_SIDECALL, safeSessionId } from './runtime.mjs';
import { observe } from '../nebi/context.mjs';

function removeHookBeacon(sessionId) {
  if (HARNESS !== 'claude' || typeof sessionId !== 'string' || safeSessionId(sessionId) !== sessionId) return;
  const file = path.join(os.homedir(), '.claude', 'nebi', 'beacons', `${sessionId}.json`);
  let beacon;
  try { beacon = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
  if (beacon?.writer === 'hook') fs.rmSync(file, { force: true });
}

function pruneLedgers() {
  if (!fs.existsSync(LEDGER_DIR)) return;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(LEDGER_DIR).slice(0, 1000)) {
    if (!name.endsWith('.jsonl')) continue;
    try {
      const file = path.join(LEDGER_DIR, name);
      if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
    } catch { /* one bad ledger must not prevent session shutdown */ }
  }
}
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  // A child inherits its lead's brief; it must not update the lead's context.
  if (input.session_id && !input.agent_id && !PLUGIN_SIDECALL && !EVAL_RUN) {
    try { removeHookBeacon(input.session_id); } catch { /* a stale hook beacon expires in 12 h */ }
    observe({ cwd: input.cwd || process.cwd(), session: input.session_id }, 'end');
  }
  pruneLedgers();
} catch (error) {
  process.stderr.write(`Nebi context snapshot skipped: ${error.message}\n`);
}
