export type PeerKind = 'idle' | 'working' | 'done' | 'need' | 'background' | 'stopped' | 'error' | 'missing'

// The Chrome a session drives: its device id and the name Nebi gave it.
export type PeerRoute = { deviceId: string; label: string }

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
  // The account the session runs on.
  account: ClaudeAccount | null
  source: 'project' | 'account'
  // The project file names another account than the session's.
  mismatch: boolean
}

// One other live session, read from its beacon or hold file; every string cleaned.
export type Peer = {
  id: string
  project: string
  cwd: string
  account: 'a' | 'b' | null
  // The browser its beacon names (v2 only); null when it names none.
  browser: PeerRoute | null
  // Its last Chrome call (a v2 beacon's browserActiveAt); null when it names none.
  activeAt: number | null
  kind: PeerKind
  // What it asks (need) or what its status line says.
  what: string
  // When it started waiting on Nebi (need), else when its state last changed.
  since: number
}

declare module 'claude-code' {
  interface PluginState {
    'nebi-constellation': {
      // `❓ cnlsneakers 12m +1`, drawn off the terminal only; null when nobody waits.
      waiting: string | null
      // `⚠ 2 on RapidSneakers`, drawn on every surface while this and another
      // live session on one Chrome both used it in the last 10 minutes; else null.
      clash: string | null
      // When this session last called a Chrome tool (any loop); null until it does.
      browserAt: number | null
      // Each live peer's kind at the last read; null until the first read.
      seen: Record<string, PeerKind> | null
    }
  }
}
