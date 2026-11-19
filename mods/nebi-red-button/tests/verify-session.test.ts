import { describe, expect, mock, test } from 'claude-code/testing'

// Its own file: NEBI_VERIFY is read once per module load, and a file shares one load.
const PLUGIN = 'nebi-red-button'
const CWD = '/Users/nebi/Documents/GitHub/shop'
const BAND_PROPS = { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 }, view: {} }
const ok = () => ({ exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

describe('nebi-red-button in a verification session', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`NEBI_VERIFY=1 still holds and draws, but writes no hold file and sends no push, on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: 1_000_000 })
      mock.env(on, { HOME: '/Users/nebi', NEBI_VERIFY: '1' })
      const seen = { writes: [] as string[], pushed: [] as string[], removed: [] as string[], ran: [] as string[] }
      on('session.start', (_, e) => ({ cwd: e.cwd }) as any)
      on('session.cwd', () => ({ value: CWD }))
      on('session.id', () => ({ value: 'sess-1' }))
      on('command.register', (_, e) => ({ value: { command: e.name } }) as any)
      on('fs.write', (_, e) => {
        seen.writes.push(e.path)
        return { value: undefined }
      })
      on('ui.log', () => ({ value: undefined }))
      on('ui.toast', () => ({ value: undefined }))
      on('process.run', async (_, e) => {
        if (e.argv[0] === 'sleep') await clock.sleep(250)
        if (e.argv[0] === 'rm') seen.removed.push(e.argv.join(' '))
        return { value: ok() }
      })
      on('tool.call', (_, e) => {
        const call = e as unknown as { tool: string; command?: string; message?: string }
        if (call.tool === 'PushNotification') {
          seen.pushed.push(String(call.message))
          return { result: 'sent' } as any
        }
        seen.ran.push(String(call.command ?? call.tool))
        return { result: 'ran' } as any
      })
      on('ui.render', ($, e) => $.ui.resolve(e).Box({ children: [] }))

      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: BAND_PROPS, viewport: { columns: 160, rows: 48, isFullscreen: false } })

      const held = $.tool.call({ tool: 'Bash', command: 'rm -rf src' } as any)
      await clock.settle()
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeDefined()
      await band.press({ key: 'block' })
      await clock.advance(250)
      expect(await held).toMatchObject({ deny: expect.any(String) })
      expect(seen.ran).toEqual([])
      expect(seen.writes).toEqual([])
      expect(seen.pushed).toEqual([])
      expect(seen.removed).toEqual([])
      await band.unmount()
    })
  }
})
