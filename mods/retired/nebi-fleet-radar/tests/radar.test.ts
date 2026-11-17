import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { ACTIVITY_COLOR, IDLE_COLOR, STATUS_LOOK, unpack } from '../hooks/grid'
import type { Cell } from '../hooks/grid'

const PLUGIN = 'nebi-fleet-radar'
const T0 = 1_790_000_000_000
const BUSY = 0x2586
const IDLE = 0x2500

const SPAWN = {
  tool_use_id: 'tu',
  prompt: 'go',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
}

const PANE = {
  title: 'Fleet Radar',
  isFocused: false,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

const USAGE = {
  input_tokens: 1000,
  output_tokens: 2000,
  cache_read_input_tokens: 40_000,
  cache_creation_input_tokens: 5000,
}

const shown = (row: readonly Cell[]) => row.map(cell => String.fromCodePoint(cell.ch)).join('')
const painted = (row: readonly Cell[], color: number) =>
  row.flatMap((cell, x) => (cell.ch === BUSY && cell.fg === color ? [x] : []))

describe('nebi-fleet-radar', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`swimlanes follow the fleet on ${surface}`, async ($, on) => {
      const clock = mock.clock(on, { now: T0 })
      let percentUsed = 30
      const agents: AgentInfo[] = []
      const opened: string[] = []
      const blits: { requestId: string; key: string; cells?: string }[] = []

      on('session.start', (_, e) => ({ cwd: e.cwd }))
      on('command.register', (_, e) => ({ value: { command: e.name } }))
      on('turn.start', (_, e) => ({ turnId: e.turnId }))
      on('turn.complete', (_, e) => ({ text: e.answer }))
      on('tool.call', (_, e) =>
        (e.tool === 'Bash' && e.command === 'false'
          ? { isError: true, result: 'exit 1', text: 'exit 1' }
          : { result: 'ok' }) as any,
      )
      on('agent.spawn', (_, e) => ({
        model: e.model === 'haiku' ? 'claude-haiku-4-5' : 'claude-sonnet-5',
        agentId: e.description === 'map the repo' ? 'a1' : 'a2',
      }))
      on('agent.list', () => ({ value: agents.map(agent => ({ ...agent })) }))
      on('session.usage', () => ({
        value: {
          startedAt: T0,
          context: { window: 200_000 },
          rateLimits: [
            { kind: 'five_hour', percentUsed, resetsAt: new Date(T0 + 2 * 3_600_000 + 15 * 60_000).toISOString() },
          ],
        } as any,
      }))
      on('ui.open', (_, e) => {
        opened.push(e.id)
        return { value: { isPlaced: true as const } }
      })
      on('ui.blit', (_, e) => {
        blits.push(e as any)
        return { value: {} }
      })
      on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['? for shortcuts'] }))

      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
      // The footer tells the radar whether a pane would dock: only the terminal here.
      const hint = await $.ui.mount({
        plugin: PLUGIN,
        surface,
        component: 'PromptHint',
        props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
        viewport: { columns: 220, rows: 50, isFullscreen: surface === 'terminal' },
      })
      await hint.unmount()

      await $.turn.start({ text: 'build the landing page', turnId: 't1' } as any)
      await $.agent.spawn({ ...SPAWN, description: 'map the repo', subagentType: 'nebi-scout', model: 'sonnet' } as any)
      agents.push({ id: 'a1', description: 'map the repo', type: 'nebi-scout', status: 'running' })
      expect(opened).toEqual([])

      // A second sub-agent at once opens the radar unasked, where a pane docks.
      await $.agent.spawn({ ...SPAWN, description: 'build the hero section', subagentType: 'general-purpose', model: 'haiku' } as any)
      agents.push({ id: 'a2', description: 'build the hero section', type: 'general-purpose', status: 'running' })
      expect(opened).toEqual(surface === 'terminal' ? [PLUGIN] : [])

      // One tool call every ten seconds, each on its own loop.
      await clock.advance(10_000)
      await $.tool.call({ tool: 'Read', file_path: '/work/README.md', agentId: 'a1' } as any)
      await clock.advance(10_000)
      await $.tool.call({ tool: 'Edit', file_path: '/work/hero.tsx', old_string: 'a', new_string: 'b', agentId: 'a2' } as any)
      await clock.advance(10_000)
      await $.tool.call({ tool: 'Bash', command: 'false', agentId: 'a2' } as any)
      await clock.advance(10_000)
      await $.tool.call({ tool: 'WebFetch', url: 'https://example.com', prompt: 'read' } as any)
      percentUsed = 36
      await clock.advance(10_000)

      // The scout finishes with what it spent.
      agents[0]!.status = 'completed'
      await $.turn.complete({
        reason: 'answer',
        answer: 'found it',
        durationMs: 50_000,
        isAborted: false,
        turnId: 'a1-run',
        agentId: 'a1',
        usage: { ...USAGE, model: 'claude-sonnet-5' },
      } as any)

      const ran = await $.command.run({ command: 'fleet', args: '2' } as any)
      expect(ran.text).toBe('Fleet Radar open: 2 sub-agents tracked.')
      expect(opened.at(-1)).toBe(PLUGIN)

      const ui = await $.ui.mount({
        plugin: PLUGIN,
        surface,
        component: 'Pane',
        requestId: PLUGIN,
        props: { ...PANE, bodyColumns: 166 } as any,
        viewport: { columns: 220, rows: 50, isFullscreen: surface === 'terminal' },
      })
      expect(await ui.find({ type: 'Text', text: /^1 running · 1 done · 2m window$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^5h 36%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /fleet \+6%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /resets in 2h14/ })).toBeDefined()

      if (surface === 'terminal') {
        // The whole grid is one Raster: three loops and the time axis.
        const raster = await ui.find({ type: 'Raster' })
        expect(raster?.props.columns).toBe(166)
        expect(raster?.props.rows).toBe(4)
        const [main, scout, builder, axis] = unpack(String(raster?.props.cells), 166)

        // Heads: name, short model, status badge (black on its color), run time, tokens.
        expect(shown(main!)).toMatch(/^ main\s+opus\s+RUN\s+50s\s+-/)
        expect(shown(scout!)).toMatch(/^ map the repo\s+sonnet\s+DONE\s+50s\s+48k/)
        expect(shown(builder!)).toMatch(/^ build the hero se…\s+haiku\s+RUN\s+50s\s+-/)
        const badge = shown(scout!).indexOf('DONE')
        expect(scout![badge]).toEqual({ ch: 'D'.codePointAt(0), fg: 0, bg: STATUS_LOOK.done.color })

        // Lanes: 120 columns of one second each, the last one now (T0 + 50s).
        expect(painted(scout!, ACTIVITY_COLOR.read)).toEqual([125])
        expect(painted(builder!, ACTIVITY_COLOR.edit)).toEqual([135])
        expect(painted(builder!, ACTIVITY_COLOR.error)).toEqual([145])
        expect(painted(main!, ACTIVITY_COLOR.web)).toEqual([155])
        // Alive without a tool is a faint line; before its spawn, nothing.
        expect(scout![130]).toEqual({ ch: IDLE, fg: IDLE_COLOR, bg: 0x01000000 })
        expect(scout![100]!.ch).toBe(0x20)
        expect(shown(axis!)).toMatch(/1 col = 1s -2m\s+-1m\s+now$/)

        // Once a second the lanes slide left by one bucket, by blit, not by redraw.
        const before = blits.length
        await clock.advance(1000)
        expect(blits.length).toBe(before + 1)
        const slid = unpack(blits.at(-1)!.cells!, 166)
        expect(blits.at(-1)).toMatchObject({ requestId: PLUGIN, key: 'lanes' })
        expect(painted(slid[1]!, ACTIVITY_COLOR.read)).toEqual([124])
        expect(painted(slid[2]!, ACTIVITY_COLOR.error)).toEqual([144])
      } else {
        // No Raster on the desktop: the same cells as runs of colored text.
        expect(await ui.find({ type: 'Raster' })).toBeUndefined()
        expect(await ui.find({ type: 'Text', text: /map the repo\s+sonnet/ })).toBeDefined()
        const done = await ui.find({ type: 'Text', text: ' DONE ' })
        expect(done?.props).toMatchObject({ color: '#000000', backgroundColor: '#4ade80' })
        const lanes = (await ui.findAll({ type: 'Text', text: /^▆+$/ })).map(found => found.props.color)
        expect(lanes).toEqual(['#c026d3', '#3b82f6', '#22a35a', '#e5383b'])
      }

      // Everyone finishes: the clock stops repainting.
      agents[1]!.status = 'completed'
      await $.turn.complete({ reason: 'answer', answer: 'built', durationMs: 51_000, isAborted: false, turnId: 'a2-run', agentId: 'a2', usage: { ...USAGE, model: 'claude-haiku-4-5' } } as any)
      await $.turn.complete({ reason: 'answer', answer: '✅ Done', durationMs: 52_000, isAborted: false, turnId: 't1' } as any)
      await clock.advance(1000)
      const settled = blits.length
      await clock.advance(5000)
      expect(blits.length).toBe(settled)
      expect(await ui.find({ type: 'Text', text: /^0 running · 2 done · 2m window$/ })).toBeDefined()

      await ui.unmount()
    })
  }
})
