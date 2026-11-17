import { describe, expect, mock, test } from 'claude-code/testing'

// Its own file: the switch is read once per module load, and a file shares one load.
const CWD = '/Users/nebi/Documents/GitHub/shop'

describe('nebi-red-button kill switch', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`NEBI_MODS_OFF naming the mod lets every call through and registers no command, on ${surface}`, async ($, on) => {
      mock.env(on, { HOME: '/Users/nebi', NEBI_MODS_OFF: 'nebi-session-guard, nebi-red-button' })
      const registered: string[] = []
      const ran: string[] = []
      on('session.start', (_, e) => ({ cwd: e.cwd }) as any)
      on('session.cwd', () => ({ value: CWD }))
      on('session.id', () => ({ value: 'sess-1' }))
      on('command.register', (_, e) => {
        registered.push(e.name)
        return { value: { command: e.name } } as any
      })
      on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
      on('tool.call', (_, e) => {
        ran.push(String((e as unknown as { command?: string }).command))
        return { result: 'ran' } as any
      })

      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      expect(await $.tool.call({ tool: 'Bash', command: 'rm -rf src' } as any)).toMatchObject({ result: 'ran' })
      expect(await $.tool.call({ tool: 'Bash', command: 'git push --force origin main', agentId: 'scout-1' } as any)).toMatchObject({ result: 'ran' })
      expect(ran).toEqual(['rm -rf src', 'git push --force origin main'])
      expect(registered).toEqual([])
    })
  }
})
