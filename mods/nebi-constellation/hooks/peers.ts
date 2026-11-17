// The pure half of Nebi Constellation: beacon and hold files in, peers and the
// few words drawn about them out. No `$` here, so the tests drive it directly.
import type { Peer, PeerKind, PeerRoute } from '../types'

export const MOD_STALE_MS = 90_000
export const HOOK_STALE_MS = 12 * 60 * 60 * 1000
export const HOLD_STALE_MS = 15 * 60 * 1000
// A session counts toward a browser clash while its last Chrome call is this recent.
export const BROWSER_ACTIVE_MS = 10 * 60 * 1000
export const LABEL_CELLS = 20

const KINDS: readonly PeerKind[] = ['idle', 'working', 'done', 'need', 'background', 'stopped', 'error', 'missing']
const STATE: Record<PeerKind, string> = {
  need: 'needs you',
  working: 'working',
  background: 'background task',
  done: 'done',
  stopped: 'stopped',
  error: 'error',
  missing: 'no status',
  idle: 'idle',
}
// Needs you, then finished and waiting for a prompt, then busy, then idle.
const RANK: Record<PeerKind, number> = { need: 0, done: 1, stopped: 1, error: 1, missing: 1, working: 2, background: 2, idle: 3 }

// Beacon files are written by other sessions and carry model text: keep only
// what a person can see.
const ESCAPE_SEQUENCES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g
const TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/u
const UNSEEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}\p{Variation_Selector}ᅟᅠㅤﾠ]/gu
const COMBINING_RUN = /(\p{M}{3})\p{M}+/gu

export function clean(text: unknown, max: number): string {
  if (typeof text !== 'string' || TAG_CHARACTERS.test(text)) return ''
  const safe = text
    .replace(ESCAPE_SEQUENCES, '')
    .replace(/\s+/g, ' ')
    .replace(UNSEEN_CHARACTERS, '')
    .replace(COMBINING_RUN, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()
  const points = [...safe]

  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : safe
}

export function age(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`

  return `${Math.floor(s / 3600)}h`
}

// Terminal cells: wide East Asian and emoji-presentation characters take two.
const WIDE =
  /[\p{Emoji_Presentation}ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]/u
export const cells = (text: string) => [...text].reduce((n, c) => n + (/\p{M}/u.test(c) ? 0 : WIDE.test(c) ? 2 : 1), 0)

// `head + name + tail` in at most LABEL_CELLS cells, cutting the name.
function fit(head: string, name: string, tail: string): string {
  let points = [...name]
  if (cells(head + name + tail) <= LABEL_CELLS) return head + name + tail
  while (points.length > 1 && cells(`${head}${points.join('')}…${tail}`) > LABEL_CELLS) points = points.slice(0, -1)

  return `${head}${points.join('')}…${tail}`
}

const basename = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? ''
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const account = (value: unknown) => (value === 'a' || value === 'b' ? value : null)
const project = (data: Record<string, unknown>) =>
  clean(basename(typeof data.cwd === 'string' ? data.cwd : ''), 40) || clean(data.project, 40) || 'session'

// A `{ deviceId, label }` (a beacon's `browser`, or this session's own route)
// cleaned for drawing, or null when it names no device.
export function peerRoute(data: unknown): PeerRoute | null {
  if (!isRecord(data)) return null
  const deviceId = clean(data.deviceId, 64)
  const label = clean(data.label, 40)

  return deviceId ? { deviceId, label: label || deviceId.slice(0, 8) } : null
}

// One `<sessionId>.json` (v1 or v2) to a Peer, or null when it is garbled,
// mislabeled or stale: a mod's file past 90 s of heartbeat, a hook's past 12 h.
export function parseBeacon(raw: string, stem: string, at: number): Peer | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || (data.version !== 1 && data.version !== 2) || data.sessionId !== stem) return null
  const kind = data.kind as PeerKind
  if (!KINDS.includes(kind)) return null
  const writer = data.version === 1 ? 'mod' : data.writer
  const updatedAt = num(data.updatedAt)
  const heartbeatAt = num(data.heartbeatAt)
  if (writer === 'mod') {
    if (heartbeatAt === undefined || at - heartbeatAt > MOD_STALE_MS) return null
  } else if (writer === 'hook') {
    if (updatedAt === undefined || at - updatedAt > HOOK_STALE_MS) return null
  } else {
    return null
  }
  const changedAt = updatedAt ?? heartbeatAt ?? at
  const ask = isRecord(data.ask) ? clean(data.ask.what, 200) : ''

  return {
    id: stem,
    project: project(data),
    cwd: typeof data.cwd === 'string' ? data.cwd : '',
    account: account(data.account),
    browser: data.version === 2 ? peerRoute(data.browser) : null,
    activeAt: data.version === 2 ? (num(data.browserActiveAt) ?? null) : null,
    kind,
    what: ask || clean(data.text, 200),
    since: kind === 'need' ? (num(data.askedAt) ?? changedAt) : changedAt,
  }
}

// One `<sessionId>.hold.json` (Red Button holding a call) to a Peer in need,
// or null when garbled, mislabeled or held more than 15 minutes ago.
export function parseHold(raw: string, stem: string, at: number): Peer | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || data.version !== 1 || data.sessionId !== stem) return null
  const heldAt = num(data.heldAt)
  if (heldAt === undefined || at - heldAt > HOLD_STALE_MS) return null

  return {
    id: stem,
    project: project(data),
    cwd: typeof data.cwd === 'string' ? data.cwd : '',
    account: account(data.account),
    browser: null,
    activeAt: null,
    kind: 'need',
    what: clean(data.what, 200),
    since: heldAt,
  }
}

// A hold makes its session need you, whatever its beacon says.
export function merge(beacons: Peer[], holds: Peer[]): Peer[] {
  const byId = new Map(beacons.map(p => [p.id, p]))
  for (const hold of holds) {
    const peer = byId.get(hold.id)
    byId.set(
      hold.id,
      peer
        ? { ...peer, kind: 'need', what: hold.what || peer.what, since: peer.kind === 'need' ? Math.min(peer.since, hold.since) : hold.since }
        : hold,
    )
  }

  return order([...byId.values()])
}

// Needs you first, then finished, busy, idle; the longest wait first in each.
export function order(list: Peer[]): Peer[] {
  return [...list].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.since - b.since || a.id.localeCompare(b.id))
}

// `❓ cnlsneakers 12m +1`: the peer that has waited longest and how many more.
export function waitingLabel(list: Peer[], at: number): string | null {
  const needs = order(list.filter(p => p.kind === 'need'))
  const first = needs[0]
  if (!first) return null

  return fit('❓ ', first.project, ` ${age(at - first.since)}${needs.length > 1 ? ` +${needs.length - 1}` : ''}`)
}

// `⚠ 2 on RapidSneakers`: this session and n-1 live others resolve to one
// Chrome and each called it in the last 10 minutes; quiet at rest. A peer
// counts only through its v2 beacon's browserActiveAt (CONTRACT), so a v1
// file, a hold or a beacon without it never does.
export function clashLabel(own: PeerRoute | null, ownActiveAt: number | null, peers: Peer[], at: number): string | null {
  const isActive = (t: number | null) => t !== null && at - t <= BROWSER_ACTIVE_MS
  if (!own || !isActive(ownActiveAt)) return null
  const count = 1 + peers.filter(p => p.browser?.deviceId === own.deviceId && isActive(p.activeAt)).length
  if (count < 2) return null

  return fit(`⚠ ${count} on `, own.label.replace(/\s+chrome$/i, '') || own.label, '')
}

// The toast for the peers that just flipped into need, oldest ask first.
export function toastText(flipped: Peer[]): string | null {
  const [first, ...rest] = order(flipped)
  if (!first) return null
  const what = clean(first.what, 100)

  return `⌁ ${first.project} needs you${what ? `: ${what}` : ''}${rest.length > 0 ? ` · +${rest.length} more` : ''}`
}

// The key a peer's route is cached under: its account and its folder.
export const routeKey = (account: Peer['account'], cwd: string) => `${account ?? '-'} ${cwd}`

// `/sessions`: project · account · browser · state · wait, one line each. A
// beacon that names no browser falls back to the route of the peer's folder.
export function sessionsText(list: Peer[], at: number, routes: ReadonlyMap<string, PeerRoute | null>): string {
  if (list.length === 0) return 'No other live sessions.'

  return order(list)
    .map(p => {
      const browser = p.browser?.label || routes.get(routeKey(p.account, p.cwd))?.label || '-'
      const what = p.kind === 'need' ? clean(p.what, 60) : ''
      const state = what ? `${STATE[p.kind]}: ${what}` : STATE[p.kind]

      return [p.project, p.account ?? '-', browser, state, age(at - p.since)].join(' · ')
    })
    .join('\n')
}
