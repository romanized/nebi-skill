export type PlanStepState = 'todo' | 'doing' | 'done' | 'blocked'

export type PlanStep = {
  title: string
  state: PlanStepState
  note: string
  // When the step was first seen doing (or, for a step that jumped straight
  // to done, when the plan was last updated before it); null while todo.
  startedAt: number | null
  // When the step flipped to done; null until then.
  endedAt: number | null
}

export type Plan = {
  goal: string
  done: string
  steps: PlanStep[]
  startedAt: number
  updatedAt: number
  // Set once every step is done; the band hides at the next turn after it.
  finishedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'nebi-plan-rail': {
      plan: Plan | null
      // True once a finished plan has been seen through to a new turn.
      isBandHidden: boolean
      // The minute the band's clock last showed, so it redraws once a minute.
      now: number
      isSoundOn: boolean
    }
  }
}
