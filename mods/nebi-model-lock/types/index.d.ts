// A role groups agent types: scouts (nebi-scout, Explore), the checker
// (nebi-checker), builders (every other type) and `all`, the fallback a
// generic "agents" / "fleet" names for every type no specific role locks.
export type LockRole = 'scout' | 'checker' | 'builder' | 'all'

export type LockModel = 'opus' | 'sonnet' | 'haiku' | 'fable'

export type Lock = Partial<Record<LockRole, LockModel>>

declare module 'claude-code' {
  interface PluginState {
    'nebi-model-lock': { lock: Lock }
  }
}
