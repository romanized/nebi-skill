// One vocabulary term: its comparison key (lowercase letters only) and how it is spelled.
export type WisprTerm = [key: string, display: string]

declare module 'claude-code' {
  interface PluginState {
    'nebi-wispr': {
      // Names of this machine's commands, tools and projects; rebuilt at session.start.
      vocab: WisprTerm[]
    }
  }
}
