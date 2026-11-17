export type BeaconKind = 'idle' | 'working' | 'done' | 'need' | 'background' | 'stopped' | 'error' | 'missing'

// The last main-loop turn: running, or how it ended.
export type TurnState = {
  kind: BeaconKind
  // The status line's words once it ended; the prompt while it runs.
  text: string
  // PromptOrigin kind of the prompt that started it ('unclassified' when none was seen).
  origin: string
  // The peer session's name when a peer started it; '' otherwise.
  from: string
  turnId: string
  startedAt: number
  // When kind, text or the ask last changed: the beacon file's `updatedAt`.
  changedAt: number
}

// An ask Claude is waiting on: opened by a ❓ status line, cleared only by
// Nebi's own prompt (composer or bridge).
export type OpenAsk = {
  what: string
  // Origin and peer of the turn that asked last.
  origin: string
  from: string
  askedAt: number
}

// An AskUserQuestion call that is waiting on its dialog.
export type PendingQuestion = { what: string; askedAt: number }

// Which Chrome and which Claude account a project uses (CONTRACT, Route), as
// claude-home/nebi/route.mjs resolves it; hooks/route.ts follows it step for step.
export type ClaudeAccount = 'a' | 'b'

export type BrowserRoute = {
  // Each browser field is the file's non-empty string, else null (route.mjs);
  // at least one of the three is set.
  label: string | null
  chromeProfile: string | null
  deviceId: string | null
  // The account the project file names; the current account for an account default.
  claudeAccount: ClaudeAccount | null
  // The account this session runs on, from CLAUDE_CONFIG_DIR.
  account: ClaudeAccount | null
  source: 'project' | 'account'
  // The project file names another account than this session's.
  mismatch: boolean
}

// What the beacon file says about the route: the session's account and the
// Chrome device it resolves to (null when the route names no device).
export type Route = {
  account: ClaudeAccount | null
  browser: { deviceId: string; label: string } | null
}

// One session's beacon file (v2), as CONTRACT.md spells it.
export type BeaconFile = {
  version: 2
  writer: 'mod'
  sessionId: string
  project: string
  cwd: string
  account: Route['account']
  browser: Route['browser']
  kind: BeaconKind
  text: string
  ask?: { what: string }
  origin: string
  askedAt?: number
  // This session's last mcp__claude-in-chrome__* call, a sub-agent's too; absent until one.
  browserActiveAt?: number
  startedAt: number
  updatedAt: number
  heartbeatAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'nebi-beacon': {
      turn: Shaped<TurnState | null>
      ask: Shaped<OpenAsk | null>
      question: PendingQuestion | null
      // The clock the wait on the row reads, moved by the heartbeat while an ask is open.
      now: number
      // When this session last called a Chrome tool (any loop); null until it does.
      browserAt: number | null
    }
  }
}
