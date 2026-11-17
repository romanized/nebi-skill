import { describe, expect, mock, test } from 'claude-code/testing'

// Its own file: the switch is read once per module load, and a file shares one load.
const CWD = '/Users/nebi/Documents/GitHub/nebi-skill'

describe('nebi-session-guard kill switch', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`NEBI_MODS_OFF=all lets every opener through, sub-agents included, on ${surface}`, async ($, on) => {
      mock.env(on, { HOME: '/Users/nebi', NEBI_MODS_OFF: 'all' })
      const ran: string[] = []
      on('session.start', (_, e) => ({ cwd: e.cwd }) as any)
      on('prompt.submit', (_, e) => ({ text: e.text, origin: e.origin }))
      on('tool.call', (_, e) => {
        ran.push(String((e as unknown as { command?: string }).command))
        return { result: 'ran' } as any
      })

      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      await $.prompt.submit({ text: 'fix the failing test', wait: false, origin: { kind: 'composer' } } as any)
      expect(await $.tool.call({ tool: 'Bash', command: 'node ~/.claude/nebi/term.mjs' } as any)).toMatchObject({ result: 'ran' })
      expect(await $.tool.call({ tool: 'Bash', command: 'open -na Ghostty', agentId: 'scout-1' } as any)).toMatchObject({ result: 'ran' })
      expect(ran).toEqual(['node ~/.claude/nebi/term.mjs', 'open -na Ghostty'])
    })
  }
})
