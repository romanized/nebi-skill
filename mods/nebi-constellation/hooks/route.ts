// The route: which Chrome and which Claude account a project uses. The same
// steps as claude-home/nebi/route.mjs (CONTRACT, Route), which a mod cannot
// import: the same git-root walk, the same per-field checks, the same fallback
// to the account default when the project file is missing or invalid, and no
// <cwd>/.claude/browser.json lookup outside a repo. Pure: register.tsx asks
// the files and hands their contents here. tests/route-vectors.ts holds
// route.mjs's test cases; the mod's tests run them so the two cannot drift.
// nebi-browser, nebi-beacon and nebi-constellation each carry this file.
import type { BrowserRoute, ClaudeAccount } from '../types'

const ACCOUNTS: readonly ClaudeAccount[] = ['a', 'b']

/** Untrusted text made safe to draw: no escape sequences or controls, one line. */
export const clean = (text: string) =>
  text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** An absolute path with `.`, `..`, repeated and trailing slashes resolved (node's path.normalize for POSIX). */
function normalize(absolute: string): string {
  const parts: string[] = []
  for (const part of absolute.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }

  return `/${parts.join('/')}`
}

/** node's path.resolve(base, p) for POSIX. */
const resolvePath = (p: string, base: string) => normalize(p.startsWith('/') ? p : `${base}/${p}`)

/** node's path.join(dir, name). */
export const joinPath = (dir: string, name: string) => normalize(`${dir}/${name}`)

/** route.mjs currentAccount: "a" for the default ~/.claude, "b" for ~/.claude-max2, null for any other config dir. */
export function currentAccount(configDir: string | undefined, home: string | undefined, cwd = '/'): ClaudeAccount | null {
  if (!configDir) return 'a'
  if (configDir.includes('.claude-max2')) return 'b'
  if (!home) return null
  const expanded = configDir === '~' || configDir.startsWith('~/') ? joinPath(home, configDir.slice(1)) : configDir

  return resolvePath(expanded, cwd) === joinPath(home, '.claude') ? 'a' : null
}

/** route.mjs gitRoot's walk: the folder itself, then each parent up to `/`. The first holding `.git` (a folder or a file) is the root. */
export function gitRootCandidates(cwd: string): string[] {
  const dirs: string[] = []
  let dir = resolvePath(cwd, '/')
  for (;;) {
    dirs.push(dir)
    if (dir === '/') return dirs
    dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  }
}

/** route.mjs readJson: a file's text as an object, or null for anything else (missing, broken, an array, a string). */
export function parseObject(text: string | null): Record<string, unknown> | null {
  if (text === null) return null
  try {
    const value: unknown = JSON.parse(text)

    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

type Browser = Pick<BrowserRoute, 'label' | 'chromeProfile' | 'deviceId'>

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

/** route.mjs browserOf: the browser half of a route, or null when the entry names no browser at all. */
function browserOf(entry: unknown): Browser | null {
  if (!entry || typeof entry !== 'object') return null
  const fields = entry as Record<string, unknown>
  const browser = { label: text(fields.label), chromeProfile: text(fields.chromeProfile), deviceId: text(fields.deviceId) }

  return browser.label || browser.chromeProfile || browser.deviceId ? browser : null
}

/** `<git root>/.claude/browser.json`, parsed: its route, or null to fall back to the account default. */
export function projectRoute(project: Record<string, unknown> | null, account: ClaudeAccount | null): BrowserRoute | null {
  const browser = browserOf(project)
  if (project === null || browser === null) return null
  const named = ACCOUNTS.find(name => name === project.claudeAccount) ?? null

  return { ...browser, claudeAccount: named, account, source: 'project', mismatch: named !== null && named !== account }
}

/** `~/.claude/nebi/browsers.json`, parsed: the current account's default, or no route. */
export function accountRoute(defaults: Record<string, unknown> | null, account: ClaudeAccount | null): BrowserRoute | null {
  if (account === null) return null
  const accounts = defaults?.accounts
  const browser = browserOf(accounts !== null && typeof accounts === 'object' ? (accounts as Record<string, unknown>)[account] : undefined)

  return browser === null ? null : { ...browser, claudeAccount: account, account, source: 'account', mismatch: false }
}

/** What a beacon file's `browser` holds for a route, as the Stop hook's fallback writes it: a device and its name, or null. */
export function beaconBrowser(route: BrowserRoute | null): { deviceId: string; label: string } | null {
  return route?.deviceId ? { deviceId: route.deviceId, label: route.label ?? route.deviceId.slice(0, 8) } : null
}
