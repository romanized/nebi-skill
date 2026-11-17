// How the latest finished check-like Bash command went. `unknown`: it was
// sent to the background, so no exit status came back.
export type CheckOutcome = 'passed' | 'failed' | 'unknown'

export type ReceiptCheck = {
  // The cleaned check part of the command (`npm test`).
  command: string
  // `seq` when the command started.
  startedAt: number
  outcome: CheckOutcome
}

// What the open main-loop turn changed and checked, sub-agents included.
export type ReceiptTurn = {
  // The open main-loop turn; null between turns or while the mod is off.
  turnId: string | null
  // A counter that orders starts and finishes of calls within the turn.
  seq: number
  // Absolute paths, in first-edit order, each once.
  files: string[]
  // `seq` when the latest successful edit finished; 0 before any.
  lastEditAt: number
  // The finished check that started last.
  check: ReceiptCheck | null
}

declare module 'claude-code' {
  interface PluginState {
    'nebi-receipt': {
      turn: ReceiptTurn
    }
  }
}
