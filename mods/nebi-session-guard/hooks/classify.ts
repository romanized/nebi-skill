// Session Guard's rules: which shell commands open a terminal, a window or an
// interactive Claude session, and which prompts ask for one. Pure functions,
// no `$`: the tests table them. The shell reading follows nebi-red-button's.

// The launchers in ~/.local/bin (claude-nebi, claude-omer, claude-a, claude-b
// are claude-profile under another name) and the CLI itself.
const LAUNCHERS = new Set(['claude-profile', 'claude-nebi', 'claude-omer', 'claude-a', 'claude-b'])
const ACCOUNTS = new Set(['nebi', 'omer', 'a', 'b'])
// claude-profile's administrative list: these never open a session.
const ADMIN = new Set([
  'agents', 'attach', 'auth', 'auto-mode', 'doctor', 'gateway', 'import', 'install', 'logs', 'mcp', 'plugin', 'plugins',
  'project', 'respawn', 'rm', 'setup-token', 'stop', 'kill', 'ultrareview', 'update', 'upgrade', '--version', '-v', '--help', '-h',
])
const TERMINAL_APP = /^(?:ghostty|terminal|iterm2?)(?:\.app)?$/i
const TERMINAL_BUNDLES = new Set(['com.mitchellh.ghostty', 'com.apple.terminal', 'com.googlecode.iterm2'])
// AppleScript or JXA that talks to a terminal app.
const AIMED_SCRIPT = /\b(?:application|app|process)\s*\(?\s*(?:id\s+)?["']?(?:ghostty|terminal|iterm2?|com\.mitchellh\.ghostty|com\.apple\.terminal|com\.googlecode\.iterm2)\b/i

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const RUNTIMES = new Set(['node', 'bun', 'deno'])
// Words that can come before the real command without changing what it does.
const PREFIXES = new Set(['command', 'exec', 'env', 'nohup', 'time', 'then', 'do', 'else', '!', 'xargs'])
// Matched where `heredocAt` finds a `<<` the shell reads as an operator.
const HEREDOC = /^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const SHORT_FLAGS = /^-[A-Za-z]+$/
const REDIRECT_ALONE = /^(?:\d*|&)(?:>>?|<<?<?|>&|<&|>\|)$/
const REDIRECT_JOINED = /^(?:\d*|&)(?:>>?|<<?|>&|<&)\S+$/
const MAX_DEPTH = 4

// A prompt asks for one when an opening word comes at most three words before a terminal word.
const ASK =
  /\b(?:open|start|launch|spawn|spin\s+up|fire\s+up|new|another|create|split)(?:\s+[\w'-]+){0,3}?\s+(?:terminals?|tabs?|windows?|splits?|panes?|sessions?|ghostty|claude(?:-(?:nebi|omer|profile|a|b))?)\b/i

/** True when Nebi's own prompt asks for a terminal, tab, window, split or session. */
export function asksForSession(text: string): boolean {
  return ASK.test(text)
}

/** What the command would open, in a few words, or null when it opens nothing. */
export function opensSession(command: string): string | null {
  return scriptOpens(command, 0)
}

function scriptOpens(whole: string, depth: number): string | null {
  if (depth > MAX_DEPTH) return null
  const { script, bodies } = splitHeredocs(whole)
  for (const body of bodies) {
    if (SHELLS.has(body.cmd)) {
      const inner = scriptOpens(body.text, depth + 1)
      if (inner) return inner
    }
  }
  const segments = splitCommands(script)
  // osascript reads its script from -e, a heredoc or a pipe: look at all of it.
  // A term.mjs dry run's printed AppleScript fed to osascript opens the tab after all.
  if (segments.some(segment => commandName(segment) === 'osascript') && (AIMED_SCRIPT.test(whole) || /term\.mjs/.test(whole))) return 'AppleScript aimed at a terminal app'
  for (const sub of script.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) {
    const inner = scriptOpens(sub[1] ?? sub[2] ?? '', depth + 1)
    if (inner) return inner
  }
  for (const segment of segments) {
    const found = wordsOpen(commandWords(segment), depth)
    if (found) return found
  }

  return null
}

function wordsOpen(words: readonly string[], depth: number): string | null {
  const [first, ...args] = words
  if (first === undefined) return null
  const cmd = baseName(first.replace(/^\\/, ''))

  if (cmd === 'term.mjs' || (RUNTIMES.has(cmd) && args.some(a => baseName(a) === 'term.mjs'))) {
    const own = cmd === 'term.mjs' ? args : args.slice(args.findIndex(a => baseName(a) === 'term.mjs') + 1)

    return isDryRun(own) ? null : 'term.mjs'
  }
  if (cmd === 'open') return openApp(args)
  if (cmd === 'ghostty') {
    if (['--version', '-v', '--help', '-h'].includes(args[0] ?? '')) return null
    const action = args.find(a => a.startsWith('+'))

    return action === undefined || action === '+new-window' ? 'a Ghostty window' : null
  }
  if (cmd === 'claude') return claudeOpens(args) ? 'an interactive claude' : null
  if (LAUNCHERS.has(cmd)) {
    const rest = cmd === 'claude-profile' && ACCOUNTS.has(args[0] ?? '') ? args.slice(1) : args

    return claudeOpens(rest) ? `an interactive ${cmd}` : null
  }
  if (cmd === 'eval') return scriptOpens(args.join(' '), depth + 1)
  if (SHELLS.has(cmd)) {
    const at = args.findIndex(a => /^-[A-Za-z]*c[A-Za-z]*$/.test(a))
    const script = at === -1 ? undefined : args[at + 1]

    return script === undefined ? null : scriptOpens(script, depth + 1)
  }

  return null
}

/** term.mjs `--dry-run` before any `--` only prints the AppleScript and opens nothing. */
function isDryRun(args: readonly string[]): boolean {
  const end = args.indexOf('--')

  return (end === -1 ? args : args.slice(0, end)).includes('--dry-run')
}

/** `claude …` opens a session unless it prints (-p) or runs an admin subcommand. */
function claudeOpens(args: readonly string[]): boolean {
  if (args.includes('-p') || args.includes('--print')) return false

  return !ADMIN.has(args[0] ?? '')
}

/** `open -a Ghostty`, `open -na iTerm`, `open -b com.apple.Terminal`, `open /Applications/Ghostty.app`. */
function openApp(args: readonly string[]): string | null {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? ''
    if (arg === '--args') break
    if (SHORT_FLAGS.test(arg)) {
      const value = args[i + 1] ?? ''
      if (arg.includes('a') && isTerminalApp(value)) return `the ${appName(value)} app`
      if (arg.includes('b') && TERMINAL_BUNDLES.has(value.toLowerCase())) return 'a terminal app'
    } else if (/\.app\/?$/i.test(arg) && isTerminalApp(arg)) {
      return `the ${appName(arg)} app`
    }
  }

  return null
}

const baseName = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? ''
const isTerminalApp = (name: string) => TERMINAL_APP.test(baseName(name))
const appName = (name: string) => baseName(name).replace(/\.app$/i, '')

// ---- Reading a shell script (as nebi-red-button does) -------------------------

/** The command a segment runs, without its path. */
function commandName(segment: string): string {
  return baseName((commandWords(segment)[0] ?? '').replace(/^\\/, ''))
}

/**
 * The script with heredoc bodies taken out, and each body with the command that reads it.
 * A heredoc whose end line never comes is not taken out: its lines stay script.
 */
function splitHeredocs(script: string): { script: string; bodies: { cmd: string; text: string }[] } {
  const lines = script.split('\n')
  const kept: string[] = []
  const bodies: { cmd: string; text: string }[] = []
  let open = ''
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    kept.push(line)
    const scan = heredocAt(line, open)
    open = scan.open
    const found = scan.heredoc
    if (found === null) continue
    const close = lines.findIndex((next, j) => j > i && (found.isIndented ? next.trim() : next) === found.end)
    if (close === -1) continue
    const head = splitCommands(line.slice(found.from, found.at)).pop() ?? ''
    bodies.push({ cmd: commandName(head), text: lines.slice(i + 1, close).join('\n') })
    i = close
  }

  return { script: kept.join('\n'), bodies }
}

/**
 * The first `<<` on a line that the shell reads as a heredoc, and what is still open
 * at the line's end. A here-string (`<<<`) is none, and neither is a `<<` inside quotes,
 * after a `#` comment or in arithmetic (`$((1 << n))`). Inside `"`, a `$(` reads as
 * unquoted until its `)`, the way bash reads it, heredocs included. `open` is what the
 * line starts in: one character per quote or parenthesis, innermost last. `from` is
 * where the heredoc's command starts: just inside the `$(` when it opened on this line.
 */
function heredocAt(line: string, open: string): { heredoc: { at: number; from: number; isIndented: boolean; end: string } | null; open: string } {
  let stack = open
  const starts: number[] = [] // where the text of each parenthesis opened on this line begins
  let arithmetic = 0 // parentheses open inside (( … ))
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i] ?? ''
    const top = stack.at(-1)
    if (c === '\\' && top !== "'") {
      i += 1
    } else if (top === '"' && line.startsWith('$(', i) && line[i + 2] !== '(') {
      stack += '('
      starts.push(i + 2)
      i += 1
    } else if (top === '"' || top === "'") {
      if (c === top) stack = stack.slice(0, -1)
    } else if (c === '"' || c === "'") {
      stack += c
    } else if (arithmetic > 0) {
      if (c === '(') arithmetic += 1
      if (c === ')') arithmetic -= 1
    } else if (c === '(' && line[i + 1] === '(') {
      arithmetic = 2
      i += 1
    } else if (top === '(' && (c === '(' || c === ')')) {
      if (c === '(') starts.push(i + 1)
      else starts.pop()
      stack = c === '(' ? stack + c : stack.slice(0, -1)
    } else if (c === '#' && (i === 0 || /[\s;&|()]/.test(line[i - 1] ?? ''))) {
      break
    } else if (line.startsWith('<<<', i)) {
      i += 2
    } else if (line.startsWith('<<', i)) {
      const match = HEREDOC.exec(line.slice(i))
      if (match) return { heredoc: { at: i, from: starts.at(-1) ?? 0, isIndented: match[1] === '-', end: match[3] ?? '' }, open: stack }
      i += 1
    }
  }

  return { heredoc: null, open: stack }
}

/** The script cut at `&&`, `||`, `;`, `|`, `&`, newlines and parentheses outside quotes. */
function splitCommands(script: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < script.length; i += 1) {
    const c = script[i] ?? ''
    if (c === '\\' && quote !== "'") {
      current += c + (script[i + 1] ?? '')
      i += 1
    } else if (quote !== null) {
      if (c === quote) quote = null
      current += c
    } else if (c === '"' || c === "'") {
      quote = c
      current += c
    } else if (c === '&' && (script[i - 1] === '>' || script[i - 1] === '<' || script[i + 1] === '>')) {
      current += c
    } else if (';|&\n()`'.includes(c)) {
      parts.push(current)
      current = ''
    } else {
      current += c
    }
  }
  parts.push(current)

  return parts
}

/** One command's words: redirections, leading assignments, sudo and harmless prefixes dropped. */
function commandWords(segment: string): string[] {
  const words = withoutRedirections(tokenize(segment.trim().replace(/^[{]+\s*/, '').replace(/\s*[}]+$/, '')))
  for (;;) {
    const word = words[0]
    if (word === undefined) return words
    if (ASSIGNMENT.test(word) || PREFIXES.has(word)) {
      words.shift()
    } else if (word === 'sudo') {
      words.shift()
      while ((words[0] ?? '').startsWith('-')) {
        const option = words.shift()
        if (option === '-u' || option === '-g') words.shift()
      }
    } else if (word.startsWith('-') && words.length > 1) {
      words.shift() // an option of a prefix: env -i, xargs -0
    } else {
      return words
    }
  }
}

function withoutRedirections(words: readonly string[]): string[] {
  const kept: string[] = []
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? ''
    if (REDIRECT_ALONE.test(word)) i += 1
    else if (!REDIRECT_JOINED.test(word)) kept.push(word)
  }

  return kept
}

/** Words of one segment, honouring quotes. */
function tokenize(text: string): string[] {
  const words: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g
  for (let m = re.exec(text); m !== null; m = re.exec(text)) words.push(m[1] ?? m[2] ?? m[3] ?? '')

  return words
}
