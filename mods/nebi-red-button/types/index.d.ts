// What a held call shows and how it was answered.
export type RedButtonChoice = 'run' | 'block' | 'allow' | 'escape' | 'unloaded' | 'interrupted' | 'timeout'

export type RedButtonHold = {
  // A fresh id per hold, so a press on an old drawing never answers a new call.
  id: string
  // The tool and one cleaned line of what it would do.
  tool: string
  what: string
  // The rule that held it: its id (what a session allow names) and its words.
  rule: string
  ruleLabel: string
  // What it would change, when that was cheap to learn; empty when not.
  change: string[]
  choice: RedButtonChoice | null
}

declare module 'claude-code' {
  interface PluginState {
    'nebi-red-button': {
      hold: RedButtonHold | null
      // The /redbutton pane is placed: it carries the hold and the band yields to it.
      isPaneOpen: boolean
      // Rule ids allowed for this session with [a].
      allowed: string[]
      isOff: boolean
    }
  }
}
