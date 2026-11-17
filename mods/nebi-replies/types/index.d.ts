// A reply block's trimmed text: AssistantMessage carries no step id, so blocks are matched by it.
export type NoteKey = string

declare module 'claude-code' {
  interface PluginState {
    'nebi-replies': {
      // Keys of main-loop narration blocks whose step went on to call tools: drawn as nothing.
      notes: NoteKey[]
      // Keys of blocks that ended a step without tools: always drawn, even when a note has the same text.
      finals: NoteKey[]
    }
  }
}
