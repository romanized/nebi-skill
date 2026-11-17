// Shared hooks derive their runtime from their deployed location. Never route
// Codex state through Claude's home, even when both clients run concurrently.
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const installedHome = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HARNESS = path.basename(installedHome) === '.codex' ? 'codex' : 'claude';
// Direct source execution is used by the isolated fixtures and manual probes.
export const HARNESS_HOME = path.basename(installedHome) === 'claude-home'
  ? path.join(homedir(), '.claude') : installedHome;
export const NEBI_DIR = path.join(HARNESS_HOME, 'nebi');
export const LEDGER_DIR = path.join(NEBI_DIR, 'ledgers');

// A headless model call a plugin makes for its own bookkeeping (TokenEconomizer sets
// TE_SIDECALL=1 on its `claude -p` judge and fact proposer) is not a user session:
// hooks that record, capture or nudge skip it.
export const PLUGIN_SIDECALL = process.env.TE_SIDECALL === '1';
// An eval run (single-loop/eval/run.mjs sets NEBI_EVAL=1) keeps the injected context and
// the proof nudge, so routing stays real, but records nothing: no checkpoint, no skill
// usage, no inbox line, no hook fallback beacon (the nebi-beacon mod still writes its own).
export const EVAL_RUN = process.env.NEBI_EVAL === '1';

export function safeSessionId(value) {
  return String(value || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
}
