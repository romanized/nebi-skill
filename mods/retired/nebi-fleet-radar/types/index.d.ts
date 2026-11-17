// What a tool call counts as on a lane.
export type RadarActivity = 'read' | 'edit' | 'bash' | 'web' | 'spawn' | 'error'

// One tool call on a loop's lane; `end` is null while it runs.
export type RadarSpan = { kind: RadarActivity; start: number; end: number | null }

export type RadarStatus = 'running' | 'done' | 'failed' | 'killed' | 'idle'

// One model loop: the main conversation (`id` "main") or one sub-agent.
export type RadarLoop = {
  id: string
  name: string
  type: string
  model: string
  status: RadarStatus
  // When the loop was working: a sub-agent's run, each of main's turns.
  live: [number, number | null][]
  tokens: number
  spans: RadarSpan[]
}

// The 5-hour window: its reading now, and the reading at the session's first spawn.
export type RadarQuota = { percent: number | null; base: number | null; resetsAt: string | null }

declare module 'claude-code' {
  interface PluginState {
    'nebi-fleet-radar': {
      loops: RadarLoop[]
      quota: RadarQuota
      now: number
      // Minutes the lanes show; 0 picks the smallest window that fits the fleet.
      windowMin: number
      autoOpened: boolean
    }
  }
}
