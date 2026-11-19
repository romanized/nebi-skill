// Safety guards for a harness that drives a real claude in a pty. Pure functions plus two small file helpers;
// no npm dependencies, so tests run offline. Keep this file identical in every harness that copies it.
// Gotchas:
// - Claude Code draws its own modal dialogs (auto mode offer, folder trust, surveys, update notes). Typed text plus
//   Enter lands in the dialog and picks the highlighted choice, which can rewrite ~/.claude/settings.json. Call
//   planDialog() on the screen before every keystroke you send, and never type while it returns a plan.
// - "❯" alone is not a dialog: the input box ("❯ " between two rules) and the echoed prompt in the transcript use it
//   too. A dialog is a block of two or more options at one column with the cursor on one of them, and at least one
//   option that reads as a choice ("Yes, …", "No, …", "1. Allow", "Not now") or a known dialog title on screen.
// - Folder trust must be accepted or the session exits; the bypass-permissions warning is accepted too, because
//   declining it exits and the harness launched in that mode. Every other dialog gets the option that keeps the
//   current setting or declines, or Esc when no option does.
// - The settings guard restores only `permissions` and `enabledPlugins`. Other top-level keys are reported, never
//   touched: another live session may have written them on purpose.
// - The run folder is deleted before every run, so outputDir() refuses any folder that is not plainly a run's.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { isAbsolute, join, parse, relative, resolve } from 'node:path'

// ---- run folder guard ----

/** True when `inner` is `outer` itself or lies inside it. */
const isWithin = (inner, outer) => {
  const rel = relative(outer, inner)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * The folder a run deletes and refills, or { error } to refuse before anything is deleted.
 * --label is one plain folder name under `runsRoot`. --out may sit elsewhere, but never at or above the filesystem
 * root, a home folder, the working folder, a repository root or `runsRoot` itself; outside `runsRoot` it must be
 * new, empty or an earlier run (it holds meta.json).
 */
export function outputDir({ out, label, runsRoot, home, cwd, repoRoots = [] }) {
  if (out === undefined && (!/^[\w.-]+$/.test(label ?? '') || /^\.+$/.test(label))) {
    return { error: `--label ${JSON.stringify(label)} must be one plain folder name` }
  }
  if (out !== undefined && /^\s*\.{1,2}\/*\s*$/.test(out)) return { error: `--out ${out} names the working folder or its parent` }
  const dir = resolve(cwd, out ?? join(runsRoot, label))
  const guarded = [home, cwd, runsRoot, ...repoRoots].filter(Boolean).map(p => resolve(p))
  const homeLike = /^\/(?:Users|home)\/[^/]+$/.test(dir) || dir === '/root'
  if (dir === parse(dir).root || homeLike || guarded.some(p => isWithin(p, dir))) {
    return { error: `refusing ${dir}: it is, or holds, the filesystem root, a home, the working folder, a repository or the runs folder` }
  }
  if (!isWithin(dir, resolve(runsRoot)) && existsSync(dir) && readdirSync(dir).length > 0 && !existsSync(join(dir, 'meta.json'))) {
    return { error: `refusing ${dir}: it is outside ${runsRoot} and is not an earlier run (no meta.json)` }
  }
  return { dir }
}

export const KEYS = { up: '\x1b[A', down: '\x1b[B', enter: '\r', esc: '\x1b' }

const RULE = /^\s*─{10,}\s*$/
const CURSOR = /^(\s*)❯\s+(\S.*?)\s*$/
const NUMBER = /^(?:\d+[.):]\s*)?/
const CHOICE = new RegExp(`${NUMBER.source}(?:yes|no|not now|skip|keep|don'?t|do not|never|always|allow|deny|accept|decline|cancel|dismiss|later|remind me|continue|exit|enable|disable|set|use|switch|turn)\\b`, 'i')
const AFFIRM = new RegExp(`${NUMBER.source}(?:yes|allow|accept|always|enable|set|use|switch|turn on|continue|ok|confirm|trust|install|update|upgrade)\\b`, 'i')
// Best first: keep the current setting, then put it off, then a plain no, then "don't". "exit" loses ties.
const DECLINE_RANK = [/\bkeep\b/i, /\bnot now\b|\bskip\b|\blater\b|\bdismiss\b|\bcancel\b/i, new RegExp(`${NUMBER.source}no\\b`, 'i'), /\bdon'?t\b|\bdo not\b|\bnever\b/i]
// Titles of dialogs seen in the wild; any of them makes a ❯ block a dialog even when no option reads as a choice.
// Keep these specific: a loose word such as "feedback" also shows up in the transcript.
const KNOWN_TITLES = [/default permission mode\?/i, /Accessing workspace:/i, /trust (?:the files in )?this folder/i,
  /Bypass Permissions mode/i]
const SURVEY = /How is Claude doing[\s\S]{0,300}?(\d):\s*Dismiss/i

/** The option block around the ❯ cursor line, or null when the screen has no dialog-shaped block. */
export function findOptions(screen) {
  const lines = screen.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = CURSOR.exec(lines[i])
    if (!m) continue
    const col = m[1].length + lines[i].slice(m[1].length).indexOf(m[2])
    const indent = l => (/\S/.test(l) ? l.search(/\S/) : -1)
    // Options start at the cursor's text column; deeper lines are an option's description and stay in the block.
    const inBlock = l => !l.includes('❯') && indent(l) >= col
    let top = i, bottom = i
    while (top > 0 && inBlock(lines[top - 1])) top--
    while (bottom < lines.length - 1 && inBlock(lines[bottom + 1])) bottom++
    while (top < i && indent(lines[top]) !== col) top++ // a block never starts on a description line
    const rows = lines.slice(top, bottom + 1).map((l, k) => ({ text: top + k === i ? m[2] : l.trim(), at: top + k }))
      .filter(r => r.at === i || indent(lines[r.at]) === col)
    if (rows.length < 2) continue
    // The input box: the block sits directly between two horizontal rules.
    if (RULE.test(lines[top - 1] ?? '') && RULE.test(lines[bottom + 1] ?? '')) continue
    // The dialog's own text: from the nearest rule above the block (dialogs open with one), else the 12 rows above.
    let rule = top - 1
    while (rule >= Math.max(0, top - 20) && !RULE.test(lines[rule])) rule--
    const head = lines.slice(rule >= Math.max(0, top - 20) ? rule + 1 : Math.max(0, top - 12), top)
    const options = rows.map(r => r.text)
    if (!KNOWN_TITLES.some(t => t.test(head.join('\n'))) && !options.some(o => CHOICE.test(o))) continue
    return { options, cursor: rows.findIndex(r => r.at === i), title: head.map(l => l.trim()).find(Boolean) ?? '' }
  }
  return null
}

/** Index of the option to choose, and why. Folder trust and the bypass warning are accepted; everything else declines. */
export function chooseOption(options, title = '') {
  const find = re => options.findIndex(o => re.test(o))
  const trust = find(/Yes, I trust this folder/i)
  if (trust >= 0) return { index: trust, reason: 'folder trust is accepted (the session exits otherwise)' }
  const bypass = find(/^(?:\d+[.)]\s*)?Yes, I accept/i)
  if (bypass >= 0 && /Bypass Permissions/i.test(title + options.join(' '))) {
    return { index: bypass, reason: 'bypass warning is accepted (the harness launched in that mode)' }
  }
  const ranked = options.map((o, index) => ({ o, index, rank: AFFIRM.test(o) ? -1 : DECLINE_RANK.findIndex(r => r.test(o)) }))
    .filter(c => c.rank >= 0)
    .sort((a, b) => a.rank - b.rank || /exit|quit/i.test(a.o) - /exit|quit/i.test(b.o) || a.index - b.index)
  return ranked.length ? { index: ranked[0].index, reason: 'keeps the current setting or declines' } : null
}

/**
 * What to press for the dialog on this screen, or null when none is showing.
 * Returns { kind, title, options, cursor, choice, reason, keys } with keys an array of keystrokes to send in order.
 */
export function planDialog(screen) {
  const survey = SURVEY.exec(screen)
  if (survey) return { kind: 'survey', title: 'How is Claude doing this session?', options: [], cursor: -1,
    choice: `${survey[1]}: Dismiss`, reason: 'survey is dismissed', keys: [survey[1]] }
  const found = findOptions(screen)
  if (!found) return null
  const { options, cursor, title } = found
  const pick = chooseOption(options, title)
  if (!pick) return { kind: 'dialog', title, options, cursor, choice: null, reason: 'no option keeps the setting; Esc', keys: [KEYS.esc] }
  const step = pick.index > cursor ? KEYS.down : KEYS.up
  const keys = [...Array(Math.abs(pick.index - cursor)).fill(step), KEYS.enter]
  return { kind: 'dialog', title, options, cursor, choice: options[pick.index], reason: pick.reason, keys }
}

/** Text in the prompt input box ("❯ …" between two rules), '' when empty, null when the box is not on screen. */
export function inputBoxText(screen) {
  const lines = screen.split('\n')
  for (let i = lines.length - 1; i > 0; i--) {
    const m = /^❯ ?(.*)$/.exec(lines[i])
    if (!m || !RULE.test(lines[i - 1])) continue
    let end = i
    while (end + 1 < lines.length && !RULE.test(lines[end + 1])) end++
    if (end + 1 >= lines.length) continue
    return [m[1], ...lines.slice(i + 1, end + 1)].map(l => l.trim()).join(' ').trim()
  }
  return null
}

/** Enter is safe only when no dialog shows and the input box visibly holds the typed text (wrapping ignored). */
export function readyToSubmit(screen, text) {
  const box = inputBoxText(screen)
  const squash = s => s.replace(/\s+/g, '')
  return !planDialog(screen) && box !== null && squash(box).includes(squash(text))
}

// ---- settings guard ----

export const GUARDED_KEYS = ['permissions', 'enabledPlugins']

const stable = v => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x))

/** Leaf-level differences between two JSON values: ["permissions.defaultMode: \"a\" -> \"b\"", ...]. */
export function diffJson(before, after, path = '') {
  if (stable(before) === stable(after)) return []
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v)
  if (isObj(before) && isObj(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
      .flatMap(k => diffJson(before[k], after[k], path ? `${path}.${k}` : k))
  }
  const show = v => (v === undefined ? '(absent)' : JSON.stringify(v))
  return [`${path || '(root)'}: ${show(before)} -> ${show(after)}`]
}

/**
 * Compare two parsed settings objects. Returns { failed, guardedDiff, otherChangedKeys, restored }: restored is
 * `after` with every guarded key put back to its `before` value (removed when it was absent), or null when no
 * guarded key changed.
 */
export function compareSettings(before, after) {
  before ??= {}; after ??= {}
  const guardedDiff = GUARDED_KEYS.flatMap(k => diffJson(before[k], after[k], k))
  const otherChangedKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => !GUARDED_KEYS.includes(k) && stable(before[k]) !== stable(after[k])).sort()
  let restored = null
  if (guardedDiff.length) {
    restored = { ...after }
    for (const k of GUARDED_KEYS) { if (k in before) restored[k] = before[k]; else delete restored[k] }
  }
  return { failed: guardedDiff.length > 0, guardedDiff, otherChangedKeys, restored }
}

/** Settings files a run can touch: ~/.claude/settings.json, plus the CLAUDE_CONFIG_DIR one when that is set. */
export function settingsFiles(home, env = process.env) {
  const files = [`${home}/.claude/settings.json`]
  if (env.CLAUDE_CONFIG_DIR) files.push(`${env.CLAUDE_CONFIG_DIR.replace(/\/+$/, '')}/settings.json`)
  return [...new Set(files)]
}

const readJson = file => {
  if (!existsSync(file)) return { raw: null, json: null }
  const raw = readFileSync(file, 'utf8')
  try { return { raw, json: JSON.parse(raw) } } catch { return { raw, json: null } }
}

/** Snapshot each settings file before the run: { file, raw, json } per file. */
export function snapshotSettings(files) {
  return files.map(file => ({ file, ...readJson(file) }))
}

/**
 * After the run: compare each file with its snapshot, write back the guarded keys that changed, and report.
 * Returns { failed, files: [{ file, guardedDiff, otherChangedKeys, restored, error? }] }.
 */
export function enforceSettings(snapshots) {
  const files = snapshots.map(snap => {
    const now = readJson(snap.file)
    if (snap.json === null && snap.raw !== null) return { file: snap.file, guardedDiff: [], otherChangedKeys: [], restored: false, error: 'snapshot was not valid JSON; not compared' }
    if (now.json === null && now.raw !== null) return { file: snap.file, guardedDiff: ['file is no longer valid JSON'], otherChangedKeys: [], restored: false, error: 'not valid JSON after the run; restore it by hand' }
    if (snap.raw === null && now.raw === null) return { file: snap.file, guardedDiff: [], otherChangedKeys: [], restored: false }
    const cmp = compareSettings(snap.json, now.json)
    let restored = false
    if (cmp.restored) { writeFileSync(snap.file, JSON.stringify(cmp.restored, null, 2) + '\n'); restored = true }
    return { file: snap.file, guardedDiff: cmp.guardedDiff, otherChangedKeys: cmp.otherChangedKeys, restored }
  })
  return { failed: files.some(f => f.guardedDiff.length > 0), files }
}
