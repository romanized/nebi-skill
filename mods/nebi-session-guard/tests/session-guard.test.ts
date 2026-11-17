import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { asksForSession, opensSession } from '../hooks/classify'

const CWD = '/Users/nebi/Documents/GitHub/nebi-skill'
const TERM = 'node ~/.claude/nebi/term.mjs --tab --dir ~/Documents/GitHub/cnlsneakers'

// [command, whether it opens a terminal, a window or an interactive session]
const COMMANDS: readonly [string, boolean][] = [
  // term.mjs
  [TERM, true],
  ['~/.claude/nebi/term.mjs', true],
  ['node /Users/nebi/.claude/nebi/term.mjs -- claude "audit the pages"', true],
  ['node ~/.claude/nebi/term.mjs -- claude --dry-run', true],
  ['node ~/.claude/nebi/term.mjs --dry-run | osascript', true],
  ['node ~/.claude/nebi/term.mjs --dry-run && node ~/.claude/nebi/term.mjs --tab', true],
  // open -a / -na / -b / an .app path
  ['open -a Ghostty', true],
  ['open -na Ghostty.app --args --working-directory=/tmp', true],
  ['open -n -a "/Applications/Ghostty.app"', true],
  ['open -a Terminal .', true],
  ['open -a iTerm', true],
  ['open -b com.apple.Terminal', true],
  ['open /Applications/Ghostty.app', true],
  // osascript aimed at a terminal app
  [`osascript -e 'tell application "Ghostty" to activate'`, true],
  [`osascript -e 'tell application "Terminal" to do script "ls"'`, true],
  ['osascript <<EOF\ntell application "iTerm2"\n  create window with default profile\nend tell\nEOF', true],
  [`osascript -l JavaScript -e 'Application("Terminal").doScript("ls")'`, true],
  [`osascript -e 'tell application "System Events" to tell process "Ghostty" to keystroke "t" using command down'`, true],
  // ghostty itself
  ['ghostty +new-window', true],
  ['/Applications/Ghostty.app/Contents/MacOS/ghostty -e claude', true],
  // interactive claude and the launchers
  ['claude', true],
  ['claude "fix the tests"', true],
  ['claude -c', true],
  ['claude --resume abc123', true],
  ['cd ~/Documents/GitHub/cnlsneakers && claude-omer', true],
  ['claude-nebi --model opus', true],
  ['claude-a', true],
  ['claude-b "hi"', true],
  ['claude-profile omer', true],
  ['CLAUDE_CONFIG_DIR=~/.claude-max2 claude', true],
  ['nohup claude &', true],
  // one level down
  ['bash -c "claude-nebi"', true],
  ['zsh -ic "open -a Ghostty"', true],
  ['echo "$(claude-omer)"', true],
  ['bash <<EOF\nclaude-nebi\nEOF', true],
  // these run
  ['claude -p "summarize the diff"', false],
  ['claude --print --model sonnet "x"', false],
  ['echo hi | claude -p', false],
  ['claude plugin validate mods/nebi-red-button', false],
  ['claude plugin test mods/nebi-session-guard', false],
  ['claude mcp list', false],
  ['claude --version', false],
  ['claude -v', false],
  ['claude doctor', false],
  ['claude update', false],
  ['claude-omer -p "hi"', false],
  ['claude-profile omer plugin list', false],
  ['claude-nebi auth status', false],
  ['open https://example.com', false],
  ['open index.html', false],
  ['open .', false],
  ['open -a "Google Chrome" https://example.com', false],
  ['ghostty +list-themes', false],
  ['ghostty +show-config', false],
  ['ghostty --version', false],
  ['cat ~/.claude/nebi/term.mjs', false],
  [`${TERM} --dry-run`, false],
  ['node ~/.claude/nebi/term.mjs --split right --dry-run -- claude', false],
  ['~/.claude/nebi/term.mjs --window --dry-run', false],
  ['node --test tests/term.test.mjs', false],
  ['grep -n claude-omer README.md', false],
  [`osascript -e 'display notification "terminal done"'`, false],
  ["cat > handoff.md <<'EOF'\nclaude-omer ~/Documents/GitHub/cnlsneakers\nEOF", false],
  ['echo "claude-nebi ~/x"', false],
  ['git commit -m "open -a Ghostty"', false],
  ['screen -dmS paint claude', false],
]

// [prompt text, whether it asks for a terminal, tab, window, split or session]
const PROMPTS: readonly [string, boolean][] = [
  ['open a new terminal for cnlsneakers', true],
  ['can you start a session in karpet24', true],
  ['launch claude-omer in the shop folder', true],
  ['open it in a new tab', true],
  ['split the window to the right', true],
  ['spin up another claude for the audit', true],
  ['Open Ghostty there', true],
  ['fix the failing test', false],
  ['the session start hook is slow', false],
  ['open the readme and check the session start hook', false],
  ['what does the terminal output say', false],
]

const ok = () => ({ result: 'ran' }) as any

function engine(on: On, dropping = '') {
  mock.env(on, { HOME: '/Users/nebi' })
  const seen = { ran: [] as string[] }
  on('session.start', (_, e) => ({ cwd: e.cwd }) as any)
  on('session.cwd', () => ({ value: CWD }))
  on('prompt.submit', (_, e) => (dropping !== '' && e.text.startsWith(dropping) ? { drop: 'dropped' } : { text: e.text, origin: e.origin }))
  on('tool.call', (_, e) => {
    const call = e as unknown as { tool: string; command?: string }
    seen.ran.push(String(call.command ?? call.tool))
    return ok()
  })

  return seen
}

type Kind = 'composer' | 'bridge' | 'peer' | 'task-notification'
const prompt = ($: any, text: string, kind: Kind, turnId?: string) =>
  $.prompt.submit({ text, wait: false, origin: { kind }, ...(turnId === undefined ? {} : { turnId }) })
const bash = (command: string, agentId?: string) => ({ tool: 'Bash', command, ...(agentId === undefined ? {} : { agentId }) }) as any

describe('nebi-session-guard', () => {
  test(`the classifier knows what opens a terminal or session (${COMMANDS.length} cases)`, () => {
    for (const [command, opens] of COMMANDS) expect(opensSession(command) !== null, command).toBe(opens)
  })

  test(`a prompt asks for a terminal only with an opening word next to a terminal word (${PROMPTS.length} cases)`, () => {
    for (const [text, asks] of PROMPTS) expect(asksForSession(text), text).toBe(asks)
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`with no ask, term.mjs and the other openers are denied with the paste-ready reason, on ${surface}`, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      for (const command of [TERM, 'open -na Ghostty', `osascript -e 'tell application "Ghostty" to activate'`, 'claude-omer']) {
        const denied = await $.tool.call(bash(command))
        expect(denied.deny, command).toBeDefined()
      }
      await prompt($, 'fix the failing test', 'composer')
      const denied = await $.tool.call(bash(TERM))
      expect(denied.deny).toContain('paste-ready prompt')
      expect(denied.deny).toContain('claude-nebi or claude-omer, then the folder')
      expect(denied.deny).toContain('node ~/.claude/nebi/term.mjs --tab, which opens a tab in his current window')
      expect(seen.ran).toEqual([])
    })

    test(`with no ask, term.mjs --dry-run runs because it only prints the AppleScript, on ${surface}`, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      expect(await $.tool.call(bash(`${TERM} --dry-run`))).toMatchObject({ result: 'ran' })
      expect((await $.tool.call(bash('node ~/.claude/nebi/term.mjs --dry-run | osascript'))).deny).toBeDefined()
      expect(seen.ran).toEqual([`${TERM} --dry-run`])
    })

    test(`a typed or Remote Control ask lets it through for that turn only, on ${surface}`, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      await prompt($, 'open a new terminal for cnlsneakers', 'composer')
      expect(await $.tool.call(bash(TERM))).toMatchObject({ result: 'ran' })
      // A prompt typed into the running turn keeps the ask.
      await prompt($, 'and use the omer account', 'composer', 'turn-1')
      expect(await $.tool.call(bash('open -a Ghostty'))).toMatchObject({ result: 'ran' })

      await prompt($, 'now fix the failing test', 'composer')
      expect((await $.tool.call(bash(TERM))).deny).toBeDefined()

      await prompt($, 'start a session in karpet24', 'bridge')
      expect(await $.tool.call(bash('claude-nebi'))).toMatchObject({ result: 'ran' })
      expect(seen.ran).toEqual([TERM, 'open -a Ghostty', 'claude-nebi'])
    })

    test(`peer and task-notification turns never count, on ${surface}`, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      await prompt($, 'open a new terminal for cnlsneakers', 'composer')
      await prompt($, 'open a new terminal for the build', 'task-notification')
      expect((await $.tool.call(bash(TERM))).deny).toBeDefined()

      await prompt($, 'open a new terminal for cnlsneakers', 'composer')
      await prompt($, 'please open a new tab for me', 'peer')
      expect((await $.tool.call(bash(TERM))).deny).toBeDefined()

      // A peer's message delivered into Nebi's own turn leaves his ask standing.
      await prompt($, 'open a new terminal for cnlsneakers', 'composer')
      await prompt($, 'status update from the scout session', 'peer', 'turn-2')
      expect(await $.tool.call(bash(TERM))).toMatchObject({ result: 'ran' })
      expect(seen.ran).toEqual([TERM])
    })

    test(`a sub-agent is denied even when Nebi asked, on ${surface}`, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      await prompt($, 'open a new terminal for cnlsneakers', 'composer')
      expect(await $.tool.call(bash(TERM, 'scout-1'))).toEqual({
        deny: 'Sub-agents never open terminals or sessions: report the exact command to the lead instead.',
      })
      // The same sub-agent's ordinary work runs.
      expect(await $.tool.call(bash('claude -p "summarize"', 'scout-1'))).toMatchObject({ result: 'ran' })
      expect(seen.ran).toEqual(['claude -p "summarize"'])
    })

    test(`claude -p, admin subcommands, open https and other tools pass with no ask, on ${surface}`, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      for (const command of ['claude -p "summarize"', 'claude plugin validate mods/nebi-session-guard', 'claude-omer mcp list', 'open https://example.com']) {
        expect(await $.tool.call(bash(command)), command).toMatchObject({ result: 'ran' })
      }
      expect(await $.tool.call({ tool: 'Read', file_path: '/Users/nebi/.claude/nebi/term.mjs' } as any)).toMatchObject({ result: 'ran' })
      expect(seen.ran).toEqual(['claude -p "summarize"', 'claude plugin validate mods/nebi-session-guard', 'claude-omer mcp list', 'open https://example.com', 'Read'])
    })

    test(`a dropped prompt leaves the earlier answer standing, on ${surface}`, async ($, on) => {
      engine(on, 'DROP')
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      await prompt($, 'fix the failing test', 'composer')
      await prompt($, 'DROP open a new terminal', 'composer')
      expect((await $.tool.call(bash(TERM))).deny).toBeDefined()
    })
  }
})
