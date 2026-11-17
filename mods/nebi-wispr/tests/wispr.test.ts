import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { buildVocab, distance, suspects } from '../hooks/wispr'

type Seen = { toasts: string[]; commands: string[] }

/** The engine beneath the plugin: a session with a few names on this machine. */
function engine(on: On, store?: Record<string, unknown>, env: Record<string, string> = {}): Seen {
  const seen: Seen = { toasts: [], commands: [] }
  mock.store(on, store)
  mock.env(on, { HOME: '/Users/nebi', ...env })
  on('session.start', (_, e) => ({ cwd: e.cwd }) as any)
  on('command.register', (_, e) => {
    seen.commands.push(e.name)
    return { value: { command: e.name } } as any
  })
  on('command.list', () => ({
    value: [
      { name: 'higgsfield-generate', description: '', source: 'plugin' as const },
      { name: 'rewind', description: '', source: 'builtin' as const },
    ],
  }))
  on('tool.list', () => ({
    value: [
      { name: 'Read', description: '', mcp: false },
      { name: 'mcp__claude_ai_Supabase__execute_sql', description: '', mcp: true },
    ],
  }))
  on('fs.list', (_, e) => ({
    value: e.path === '/Users/nebi/Documents/GitHub' ? [{ name: 'shopwave-landing', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }] : [],
  }))
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  return seen
}

const say = (text: string) => ({ text, origin: { kind: 'composer' }, wait: false }) as any
const wispr = (args: string) => ({ command: 'wispr', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } }) as any

describe('nebi-wispr', () => {
  test('the fuzzy match is close names only, never plurals or other first letters', () => {
    const vocab = buildVocab({ commands: ['scrapling-official'], tools: ['mcp__claude_ai_Supabase__list_tables'], folders: ['shopwave-landing'] })
    expect(vocab.map(([key]) => key)).toContain('scrapling')
    expect(vocab.map(([key]) => key)).toContain('supabase')
    expect(distance('scrapling', 'scarpling')).toBe(1)
    expect(suspects('try scraplin and supabass', vocab, {})).toEqual([['scraplin', 'scrapling'], ['supabass', 'Supabase']])
    expect(suspects('the landings and shopwaves', vocab, {})).toEqual([])
    expect(suspects('a supabase project', vocab, {})).toEqual([])
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`a fresh store is seeded and the glossary fixes the prompt on ${surface}`, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      const entered = await $.prompt.submit(say('Use scapling with Ultra Code and update the cloud md, nebby'))
      expect(entered.text).toBe('Use Scrapling with ultracode and update the CLAUDE.md, nebi')
      expect(entered.context ?? []).toEqual([])
      expect(seen.toasts).toEqual(['Wispr: scapling → Scrapling, Ultra Code → ultracode, cloud md → CLAUDE.md, nebby → nebi'])
      // The seed went into the store: a removal there is what the next prompt reads.
      expect((await $.command.run(wispr(''))).text).toContain('tick hub → TikHub')
      expect((await $.command.run(wispr('remove scapling'))).text).toContain('no longer changes')
      expect((await $.prompt.submit(say('scapling and tik hub'))).text).toBe('scapling and TikHub')
    })

    test(`code, quoted text, URLs and paths stay as typed on ${surface}`, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      const code = 'run `scapling --help`, read https://github.com/scapling/x and ~/scapling/notes.md\n```\nscapling.fetch()\n```\nthen scapling'
      expect((await $.prompt.submit(say(code))).text).toBe(code.replace(/then scapling$/, 'then Scrapling'))

      const quoted = 'the error says "scapling not found" and “nebby” was the log name, so fix scapling'
      expect((await $.prompt.submit(say(quoted))).text).toBe('the error says "scapling not found" and “nebby” was the log name, so fix Scrapling')
      expect(seen.toasts).toEqual(['Wispr: scapling → Scrapling', 'Wispr: scapling → Scrapling'])

      // Only the person's own prompts are touched.
      const relayed = await $.prompt.submit({ text: 'scapling', origin: { kind: 'peer' }, wait: false } as any)
      expect(relayed.text).toBe('scapling')
      expect(seen.toasts.length).toBe(2)
    })

    test(`guesses are off unless turned on: the glossary still rewrites, no note is added, on ${surface}`, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      const entered = await $.prompt.submit(say('run scapling then higsfield and supabass, theres more'))
      expect(entered.text).toBe('run Scrapling then higsfield and supabass, theres more')
      expect(entered.context ?? []).toEqual([])
      expect(seen.toasts).toEqual(['Wispr: scapling → Scrapling'])
    })

    test(`a leading ?? is an ordinary prompt: fixed, noted and toasted like any other on ${surface}`, { options: { guesses: 'on' } }, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      const entered = await $.prompt.submit(say('?? is scapling higsfield ready'))
      expect(entered.text).toBe('?? is Scrapling higsfield ready')
      expect(entered.context).toEqual(["Dictation note: 'higsfield' probably means 'higgsfield'."])
      expect(seen.toasts).toEqual(['Wispr: scapling → Scrapling'])
    })

    test(`a sound-alike goes to Claude's context only: no rewrite, no toast on ${surface}`, { options: { guesses: 'on' } }, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      const entered = await $.prompt.submit(say('make a video with higsfield and save it in supabass for shopwave, then remind me'))
      expect(entered.text).toBe('make a video with higsfield and save it in supabass for shopwave, then remind me')
      expect(entered.context).toEqual(["Dictation note: 'higsfield' probably means 'higgsfield'. Dictation note: 'supabass' probably means 'Supabase'."])
      expect(entered.context?.join(' ')).not.toContain('/wispr')
      expect(seen.toasts).toEqual([])
    })

    test(`a rewrite plus a guess still gives one toast, and plain words give none, on ${surface}`, { options: { guesses: 'on' } }, async ($, on) => {
      const seen = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      const both = await $.prompt.submit(say('run scapling then higsfield, nebby'))
      expect(both.text).toBe('run Scrapling then higsfield, nebi')
      expect(both.context).toEqual(["Dictation note: 'higsfield' probably means 'higgsfield'."])
      expect(seen.toasts).toEqual(['Wispr: scapling → Scrapling, nebby → nebi'])

      const plain = await $.prompt.submit(say('build the landing page and run the tests'))
      expect(plain.text).toBe('build the landing page and run the tests')
      expect(plain.context ?? []).toEqual([])
      expect(seen.toasts.length).toBe(1)
    })

    for (const value of ['nebi-wispr', 'all', 'nebi-model-lock,nebi-wispr'] as const) {
      test(`NEBI_MODS_OFF=${value} passes every prompt as dictated on ${surface}`, async ($, on) => {
        const seen = engine(on, undefined, { NEBI_MODS_OFF: value })
        await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)
        expect(seen.commands).toEqual([])

        const entered = await $.prompt.submit(say('run scapling then higsfield'))
        expect(entered.text).toBe('run scapling then higsfield')
        expect(entered.context ?? []).toEqual([])
        expect(seen.toasts).toEqual([])
      })
    }

    test(`/wispr add fixes the new word and the store keeps it on ${surface}`, async ($, on) => {
      engine(on, { glossary: { 'eleven labs': 'ElevenLabs' } })
      await $.session.start({ surface, isInteractive: true, cwd: '/work' } as any)

      // The stored glossary is the one in use: no seed over it.
      expect((await $.prompt.submit(say('eleven labs or scapling'))).text).toBe('ElevenLabs or scapling')

      expect((await $.command.run(wispr('add mobin => Mobbin'))).text).toBe('Wispr will write "Mobbin" when it hears "mobin".')
      expect((await $.prompt.submit(say('search mobin for flows'))).text).toBe('search Mobbin for flows')

      expect((await $.command.run(wispr(''))).text).toContain('mobin → Mobbin')
      expect((await $.command.run(wispr('remove eleven labs'))).text).toContain('no longer changes')
      expect((await $.prompt.submit(say('eleven labs'))).text).toBe('eleven labs')
      expect((await $.command.run(wispr('add nothing here'))).text).toContain('could not read')
    })
  }
})
