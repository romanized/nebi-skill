// Which Chrome and which Claude account a project uses (CONTRACT, Route).
export type ClaudeAccount = 'a' | 'b'

export type BrowserRoute = {
  // Each browser field is the file's non-empty string, else null (route.mjs);
  // at least one of the three is set.
  // How Nebi names that Chrome ("RapidSneakers Chrome").
  label: string | null
  chromeProfile: string | null
  // The Claude in Chrome extension's device id in that profile.
  deviceId: string | null
  // The account the project file names; the current account for an account default.
  claudeAccount: ClaudeAccount | null
  // The account this session runs on, from CLAUDE_CONFIG_DIR.
  account: ClaudeAccount | null
  source: 'project' | 'account'
  // The project file names another account than this session's.
  mismatch: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'nebi-browser': {
      // null: no route, so every call passes and no label is drawn.
      route: BrowserRoute | null
      // NEBI_MODS_OFF names this mod: it passes everything through.
      isOff: boolean
    }
  }
}
