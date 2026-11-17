// The userConfig values (plugin.json), fixed for each load.
export type QuietEdits = 'compact' | 'full'
export type QuietFooter = 'trim' | 'engine'

// Nebi Quiet keeps nothing in $.state: what it draws comes from the row's own
// props, its userConfig and NEBI_MODS_OFF (fixed per process).
declare module 'claude-code' {
  interface PluginState {
    'nebi-quiet': Record<string, never>
  }
}
