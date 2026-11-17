// Session Guard draws nothing, so it keeps no $.state values.
export type SessionGuardState = Record<string, never>

declare module 'claude-code' {
  interface PluginState {
    'nebi-session-guard': SessionGuardState
  }
}
