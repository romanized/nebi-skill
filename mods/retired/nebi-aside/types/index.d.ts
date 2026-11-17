// One side question and what came back: the answer as cleaned markdown, or,
// when the fork gave none, the reason in plain words.
export type AsideEntry = {
  id: string
  question: string
  status: 'thinking' | 'answered' | 'unanswered'
  answer: string
  askedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'nebi-aside': {
      // The last five, newest first.
      entries: AsideEntry[]
      // The clock while a question waits: drives the thinking line.
      now: number
    }
  }
}
