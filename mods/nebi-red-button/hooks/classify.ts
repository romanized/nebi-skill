// Red Button's rules: which tool calls are irreversible or reach outside this
// machine, and so wait for Nebi. Pure functions, no `$`: the tests table them.

// What a hold needs to learn what the call would change, when that is cheap.
export type Probe =
  | { kind: 'rm'; dir: string; targets: string[] }
  | { kind: 'reset'; dir: string }
  | { kind: 'discard'; dir: string }
  | { kind: 'push'; dir: string; remote: string; branch: string }
  | { kind: 'clean'; dir: string; flags: string[] }
  | { kind: 'branch'; dir: string; branch: string }

export type Risk = {
  // The rule's id: what "Allow for session" allows.
  rule: string
  // The rule in a few words, for the card and the deny.
  label: string
  // What the phone push says after "Claude needs approval:".
  short: string
  // The tool, and one cleaned line of what the call would do.
  tool: string
  what: string
  probe?: Probe
  // What a stopped sub-agent should do instead, when that beats reporting to its lead.
  hint?: string
}

// The rules /redbutton lists. MCP rules are named per server and verb.
export const RULES: readonly { id: string; label: string }[] = [
  { id: 'rm-recursive', label: 'rm -r / rm -rf outside /tmp, /private/tmp and $TMPDIR (caches like __pycache__ and build folders like node_modules or dist in a project folder run)' },
  { id: 'find-delete', label: 'find -delete outside /tmp, /private/tmp and $TMPDIR (and rm or git run by find -exec)' },
  { id: 'git-push-force', label: 'git push --force / -f / --force-with-lease / +ref / --mirror' },
  { id: 'git-push-delete', label: 'git push --delete (a remote branch)' },
  { id: 'git-reset-hard', label: 'git reset --hard' },
  { id: 'git-clean', label: 'git clean -f' },
  { id: 'git-branch-delete', label: 'git branch -D' },
  { id: 'git-discard', label: 'git checkout -- . / git restore . / git checkout -f' },
  { id: 'git-stash-drop', label: 'git stash drop / clear' },
  { id: 'db-reset', label: 'supabase db reset, prisma migrate reset, prisma db push --force-reset' },
  { id: 'sql-drop', label: 'SQL DROP' },
  { id: 'sql-truncate', label: 'SQL TRUNCATE' },
  { id: 'sql-delete-all', label: 'SQL DELETE FROM without WHERE' },
  { id: 'mcp:<server>:<verb>', label: 'MCP tools that send, publish, delete, remove, trash, deploy, merge, pause, reset, share, forward, reply, bulk-update, set-inventory, create-discount or run a GraphQL mutation' },
]

// ---- Cleaning text a model wrote before drawing it -------------------------

const ESCAPES = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-_]/g
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g

/** One line, no escape sequences or control characters, at most `max` long. */
export function clean(text: string, max = 400): string {
  const line = text.replace(ESCAPES, '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim()

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// ---- Entry point -------------------------------------------------------------

/**
 * The rule a tool call breaks, or null when it may run. `cwd` is the session's;
 * `tmpdir` is the per-user temp folder ($TMPDIR) and `home` is $HOME, '' when unknown.
 */
export function classifyCall(tool: string, input: Readonly<Record<string, unknown>>, cwd = '', tmpdir = '', home = ''): Risk | null {
  if (tool === 'Bash') return classifyBash(String(input.command ?? ''), cwd, tmpdir, home)
  if (tool.startsWith('mcp__')) return classifyMcp(tool, input)

  return null
}

// ---- SQL ---------------------------------------------------------------------

/** The destructive SQL rule a statement list breaks, or null. */
export function destructiveSql(sql: string): { rule: string; label: string; short: string } | null {
  const text = sql.replace(/--(?![A-Za-z])[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  if (/\bDROP\s+(?!NOT\s+NULL\b|DEFAULT\b|IDENTITY\b|EXPRESSION\b)[A-Za-z]/i.test(text)) {
    return { rule: 'sql-drop', label: 'SQL DROP', short: 'drop in the database' }
  }
  if (/\bTRUNCATE\b/i.test(text)) {
    return { rule: 'sql-truncate', label: 'SQL TRUNCATE', short: 'truncate a table' }
  }
  for (const statement of text.split(';')) {
    if (/\bDELETE\s+FROM\b/i.test(statement) && !/\bWHERE\b/i.test(statement)) {
      return { rule: 'sql-delete-all', label: 'SQL DELETE FROM without WHERE', short: 'delete every row of a table' }
    }
  }

  return null
}

// ---- Bash --------------------------------------------------------------------

const SQL_CLIENTS = new Set(['psql', 'supabase', 'sqlite', 'sqlite3'])
// `cmd <<EOF`, `cmd <<-'EOF'`: the body runs only when cmd is a shell or a database client.
// Matched where `heredocAt` finds a `<<` the shell reads as an operator.
const HEREDOC = /^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/
// Words that can come before the real command without changing what it does.
const PREFIXES = new Set(['command', 'exec', 'env', 'nohup', 'time', 'then', 'do', 'else', '!', 'xargs', 'npx', 'bunx', 'pnpx'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
// Folders a build or test run makes again: `rm -rf` of one, or of anything inside one, runs
// when the path is relative to the session's folder or to another project folder.
const ARTIFACTS = new Set(['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.cache', 'out', 'test-results', 'playwright-report', 'tmp', '.tmp'])
// Caches a tool rebuilds without being asked: deleting one runs wherever it sits.
const CACHES = new Set(['__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache'])
// A folder this deep sits inside a project, not in a home or beside the projects:
// /Users/<name>/<folder>/<projects>/<project>.
const PROJECT_DEPTH = 5
// Folders at the top of a Mac's disk: `rm -rf $S/usr` with `$S` empty must never run.
const ROOT_FOLDERS = new Set(['Applications', 'Library', 'System', 'Users', 'Volumes', 'bin', 'cores', 'dev', 'etc', 'home', 'opt', 'private', 'sbin', 'tmp', 'usr', 'var'])
// Names a shell already holds: one of these may carry a real path when the script's own assignment did not run.
const INHERITED = /^(?:HOME|PATH|PWD|OLDPWD|TMPDIR|TMP|TEMP|USER|SHELL|.*_(?:HOME|PATH|DIR|ROOT))$/
// `$(mktemp -d)`, with an optional template inside /tmp: a fresh temp folder, or nothing when it fails.
const MKTEMP = /^mktemp(?:\s+-d)?(?:\s+(?:\/private)?\/tmp\/[\w.-]+)?$/
const MKTEMP_HOME = '/tmp/.mktemp'
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
// A word that may change a variable: `read S`, `unset S`, `for S in`, `S+=x`, `local S=…`.
const NAMES_VARIABLE = /^([A-Za-z_][A-Za-z0-9_]*)(?:\+?=.*)?$/
const VARIABLE = /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g
// Words of a branch, a loop or a function: an assignment in a segment that starts with one may not run.
const CONTROL = new Set(['if', 'then', 'elif', 'else', 'fi', 'case', 'esac', 'for', 'select', 'while', 'until', 'do', 'done', 'function'])
// The ones that open a block, and the ones that close it.
const OPENERS = new Set(['if', 'case', 'for', 'select', 'while', 'until', 'function'])
const CLOSERS = new Set(['fi', 'esac', 'done'])
// Operators after which the next command runs in this same shell, every time (`&&` within its chain).
const SEQUENTIAL = new Set(['', ';', '\n', '&&'])
const SHORT_FLAGS = /^-[A-Za-z]+$/
const REDIRECT_ALONE = /^(?:\d*|&)(?:>>?|<<?<?|>&|<&|>\|)$/
const REDIRECT_JOINED = /^(?:\d*|&)(?:>>?|<<?|>&|<&)\S+$/
const MAX_DEPTH = 4

// A stopped sub-agent whose rm path sat in a variable: the literal path may well be a temp one.
const VARIABLE_HINT = 'Run it again with the literal path written out: paths inside /tmp, /private/tmp or $TMPDIR run; report any other path to the lead.'

// Claude Code's own rm check (2.1.329) asks even in bypass mode for a target that starts with
// an unguarded variable followed by `/` and a glob, another `$`, a `/` or nothing: with the
// variable unset that is `rm -rf /` or `/*`. `${E:?}/…` stops the shell first, so it does not ask.
const UNSET_TO_ROOT = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)(?::?-)?\}|([A-Za-z_][A-Za-z0-9_]*))\/(?:[*?[{$/]|$)/
// What it asks for as written: /, a top-level folder, home, the working folder or a folder above it.
// macOS spells some top-level folders under /private; the check reads them without it.
const PRIVATE_ALIASES = new Set(['etc', 'var', 'tmp', 'home'])

type BashRisk = Omit<Risk, 'tool' | 'what'>
// Where the script runs: the session's folder, the per-user temp folder and $HOME ('' when unknown),
// and the whole command. `maybe` holds names that are either the literal path given or empty when
// the rm runs. `plainRm` is the segment's text when it is a bare `rm` at the script's top level,
// the only place this mod relies on Claude Code's own rm check.
type Context = { cwd: string; tmpdir: string; home: string; script: string; maybe?: ReadonlyMap<string, string>; plainRm?: string }

/** The first rule a shell command breaks, or null. */
export function classifyBash(command: string, cwd = '', tmpdir = '', home = ''): Risk | null {
  const risk = scriptRisk(command, cwd, { cwd, tmpdir, home, script: command }, 0)

  return risk ? { ...risk, tool: 'Bash', what: clean(command) } : null
}

/** A whole script: SQL piped to a client, command substitutions, then each command in turn with the variables it set filled in. */
function scriptRisk(whole: string, from: string, ctx: Context, depth: number): BashRisk | null {
  if (depth > MAX_DEPTH) return null
  const { script, bodies } = splitHeredocs(whole)
  for (const body of bodies) {
    if (SHELLS.has(body.cmd)) {
      const inner = scriptRisk(body.text, from, ctx, depth + 1)
      if (inner) return inner
    } else if (SQL_CLIENTS.has(body.cmd)) {
      const sql = destructiveSql(body.text)
      if (sql) return sql
    }
  }
  // SQL counts only when a database client is one of the commands: `echo … | psql`,
  // `psql -c …`. A grep, a commit message or a file that mentions the words does not.
  if (splitCommands(script).some(segment => SQL_CLIENTS.has(commandName(segment)))) {
    const sql = destructiveSql(script)
    if (sql) return sql
  }
  for (const sub of script.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) {
    const inner = scriptRisk(sub[1] ?? sub[2] ?? '', from, ctx, depth + 1)
    if (inner) return inner
  }

  let dir = from
  // `S=/private/tmp/…; rm -rf $S/x`: what the script itself set, kept only while it
  // is certain to hold when a later command runs. A name set after `&&` holds to the
  // end of its chain; nothing set inside a branch, loop, group, subshell or pipe counts.
  // A pipe or a loop that has ended does not taint what the script sets after it.
  // A name whose `&&` chain ended (`cd repo && S=/tmp/a; rm -rf $S/x`) or that holds a
  // fresh `$(mktemp -d)` is either that path or empty: `maybe` keeps it for `rmRisk`,
  // which lets it through only where the empty case deletes nothing.
  const vars = new Map<string, string>()
  const maybe = new Map<string, string>()
  let chained: string[] = []
  let parens = 0
  let blocks = 0
  let isInBackticks = false
  const parts = segments(script)
  for (const [i, { text, sep }] of parts.entries()) {
    if (sep !== '&&') {
      for (const name of chained) {
        const value = vars.get(name)
        if (value !== undefined && !INHERITED.test(name)) maybe.set(name, value)
        vars.delete(name)
      }
      chained = []
    }
    if (sep === '(') parens += 1
    if (sep === ')') parens = Math.max(0, parens - 1)
    if (sep === '`') isInBackticks = !isInBackticks
    const raw = rawWords(text)
    const head = raw[0] ?? ''
    const trimmed = text.trim()
    if (OPENERS.has(head) || trimmed.startsWith('{')) blocks += 1
    const isTopLevel = parens === 0 && blocks === 0 && !isInBackticks && SEQUENTIAL.has(sep) && !CONTROL.has(head)
    if (CLOSERS.has(head) || /(?:^|\s)\}$/.test(trimmed)) blocks = Math.max(0, blocks - 1)
    const after = parts[i + 1]?.sep ?? ''
    const made = madeByMktemp(raw, parts[i + 1], parts[i + 2])
    const set = assign(raw, vars, isTopLevel && after !== '|' && after !== '&')
    if (set !== null) {
      for (const name of set) maybe.delete(name)
      if (sep === '&&') chained.push(...set)
      if (made !== null && isTopLevel && !INHERITED.test(made)) maybe.set(made, `${MKTEMP_HOME}/${made}`)
      continue
    }
    const words = commandWords(text).map(word => expand(word, vars))
    for (const word of raw) {
      const name = NAMES_VARIABLE.exec(word)?.[1] ?? ''
      vars.delete(name)
      maybe.delete(name)
    }
    if (words[0] === 'cd' || words[0] === 'pushd') {
      dir = joinPath(dir, words[1] ?? '~')
      continue
    }
    const command = raw.find(word => !['do', 'then', 'else', '!'].includes(word))
    const isPlainRm = depth === 0 && parens === 0 && !isInBackticks && command === 'rm'
    const risk = wordsRisk(words, dir, { ...ctx, maybe, plainRm: isPlainRm ? text : undefined }, depth)
    if (risk) return risk
  }

  return null
}

/** The command a segment runs, without its path: `/usr/bin/psql` is `psql`. */
function commandName(segment: string): string {
  return (commandWords(segment)[0] ?? '').replace(/^\\/, '').split('/').pop() ?? ''
}

/**
 * For a segment that only assigns (`S=…`, `export S=…`), the names it gave a literal
 * value in `vars`, or null when the segment runs a command. A value still holding
 * `$` or a backtick once known names are filled in, or one that may not take effect
 * (`isCertain` false), makes `vars` forget the name instead.
 */
function assign(raw: readonly string[], vars: Map<string, string>, isCertain: boolean): string[] | null {
  const words = raw[0] === 'export' ? raw.slice(1) : raw
  if (words.length === 0 || !words.every(word => ASSIGNMENT.test(word))) return null
  const set: string[] = []
  for (const word of words) {
    const at = word.indexOf('=')
    const name = word.slice(0, at)
    const value = expand(word.slice(at + 1), vars)
    if (isCertain && !/[$`]/.test(value)) {
      vars.set(name, value)
    } else {
      vars.delete(name)
    }
    set.push(name)
  }

  return set
}

/**
 * The name a segment gives a fresh temp folder: `d="$(mktemp -d)"` in one segment, or
 * `d=$(mktemp -d)`, which `segments` cuts at the parentheses. Null for anything else.
 */
function madeByMktemp(raw: readonly string[], next?: { text: string; sep: string }, close?: { text: string; sep: string }): string | null {
  if (raw.length !== 1) return null
  const word = raw[0] ?? ''
  const quoted = /^([A-Za-z_][A-Za-z0-9_]*)=\$\((.*)\)$/.exec(word)
  if (quoted) return MKTEMP.test((quoted[2] ?? '').trim()) ? (quoted[1] ?? null) : null
  const open = /^([A-Za-z_][A-Za-z0-9_]*)=\$$/.exec(word)
  if (!open || next?.sep !== '(' || close?.sep !== ')') return null

  return MKTEMP.test(next.text.trim()) ? (open[1] ?? null) : null
}

/** The word with each `$NAME` or `${NAME}` the script set filled in; others stay as written. */
function expand(word: string, vars: ReadonlyMap<string, string>): string {
  return word.replace(VARIABLE, (whole, braced?: string, bare?: string) => vars.get(braced ?? bare ?? '') ?? whole)
}

/**
 * The script with every heredoc body taken out, and each body with the command
 * that reads it. A body is data unless that command is a shell or a database client.
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

/** One command's words: rm, git, find, a shell or eval running a string, a database reset. */
function wordsRisk(words: readonly string[], dir: string, ctx: Context, depth: number): BashRisk | null {
  const [first, ...args] = words
  if (first === undefined) return null
  const cmd = first.replace(/^\\/, '').split('/').pop() ?? ''

  if (cmd === 'rm') return rmRisk(args, dir, ctx)
  if (cmd === 'git') return gitRisk(args, dir)
  if (cmd === 'find') return findRisk(args, dir, ctx, depth)
  if (cmd === 'eval') return scriptRisk(args.join(' '), dir, ctx, depth + 1)
  if (SHELLS.has(cmd)) {
    const at = args.findIndex(a => /^-[A-Za-z]*c[A-Za-z]*$/.test(a))
    const script = at === -1 ? undefined : args[at + 1]

    return script === undefined ? null : scriptRisk(script, dir, ctx, depth + 1)
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(cmd)) {
    const rest = ['exec', 'dlx', 'x'].includes(args[0] ?? '') ? args.slice(1) : args
    const tool = rest.findIndex(a => !a.startsWith('-'))

    return tool === -1 || !['prisma', 'supabase'].includes(rest[tool] ?? '') ? null : wordsRisk(rest.slice(tool), dir, ctx, depth + 1)
  }
  if (cmd === 'supabase' && args[0] === 'db' && args[1] === 'reset') return dbReset('supabase db reset')
  if (cmd === 'prisma' && args[0] === 'migrate' && args[1] === 'reset') return dbReset('prisma migrate reset')
  if (cmd === 'prisma' && args[0] === 'db' && args[1] === 'push' && args.includes('--force-reset')) return dbReset('prisma db push --force-reset')

  return null
}

const dbReset = (label: string): BashRisk => ({ rule: 'db-reset', label, short: 'reset the database' })

function rmRisk(args: readonly string[], dir: string, ctx: Context): BashRisk | null {
  const end = args.indexOf('--')
  const options = (end === -1 ? args : args.slice(0, end)).filter(a => a.startsWith('-') && a !== '-')
  const isRecursive = options.some(f => f === '--recursive' || (/^-[^-]/.test(f) && /[rR]/.test(f)))
  if (!isRecursive) return null

  const targets = end === -1 ? args.filter(a => !a.startsWith('-') || a === '-') : [...args.slice(0, end).filter(a => !a.startsWith('-')), ...args.slice(end + 1)]
  const held = targets.filter(t => {
    const target = settled(t, ctx.maybe)
    return !isTempPath(target, dir, ctx.tmpdir) && !isArtifact(target, dir, ctx.cwd) && !isCache(target)
  })
  if (targets.length > 0 && held.length === 0) return null
  // Claude Code asks for these itself; a hold on top would ask Nebi twice.
  if (ctx.plainRm !== undefined && held.length > 0 && held.every(t => isAskedByClaudeCode(t, ctx))) return null
  const blocking = held.map(t => settled(t, ctx.maybe))
  // `rm -rf $S`, `cd "$S" && rm -rf out`: the path sits in a variable this cannot read.
  const isInVariable = blocking.length > 0 && blocking.every(t => t.includes('$') || (!/^[/~]/.test(t) && dir.includes('$')))

  const flags = options.join(' ')
  const shown = targets.length === 0 ? 'paths from stdin' : targets.join(' ')
  const canCount = targets.length > 0 && !targets.includes('{}')

  return {
    rule: 'rm-recursive',
    label: isInVariable ? `rm ${flags} on a path in a shell variable` : `rm ${flags} outside /tmp`,
    short: `delete ${targets.length === 1 ? 'a folder' : 'folders'}: ${clean(shown, 60)}`,
    probe: canCount ? { kind: 'rm', dir, targets } : undefined,
    hint: isInVariable ? VARIABLE_HINT : undefined,
  }
}

/** `find -delete` outside the temp folders, and whatever `-exec` / `-execdir` would run on each match. */
function findRisk(args: readonly string[], dir: string, ctx: Context, depth: number): BashRisk | null {
  for (let at = 0; at < args.length; at += 1) {
    if (!['-exec', '-execdir', '-ok', '-okdir'].includes(args[at] ?? '')) continue
    const tail = args.slice(at + 1)
    const end = tail.findIndex(a => a === ';' || a === '\\;' || a === '+')
    const risk = wordsRisk(end === -1 ? tail : tail.slice(0, end), dir, ctx, depth + 1)
    if (risk) return risk
  }
  if (!args.includes('-delete')) return null
  const starts: string[] = []
  for (const arg of args) {
    if (arg.startsWith('-') || arg === '(' || arg === '\\(' || arg === '!') break
    starts.push(arg)
  }
  if ((starts.length === 0 ? ['.'] : starts).every(p => isTempPath(p, dir, ctx.tmpdir))) return null

  return { rule: 'find-delete', label: 'find -delete', short: 'find and delete files' }
}

// Git's own options that take the next word as their value: `git --git-dir /repo/.git push`.
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix'])

function gitRisk(args: readonly string[], dir: string): BashRisk | null {
  // Git's own options come before the subcommand; -C and --git-dir move where it runs.
  let gitDir = dir
  let i = 0
  while (i < args.length && (args[i] ?? '').startsWith('-')) {
    const option = args[i] ?? ''
    if (option === '-C' || option === '--git-dir') gitDir = joinPath(gitDir, args[i + 1] ?? '.')
    if (option.startsWith('--git-dir=')) gitDir = joinPath(gitDir, option.slice('--git-dir='.length))
    i += GIT_VALUE_OPTIONS.has(option) ? 2 : 1
  }
  const sub = args[i]
  const rest = args.slice(i + 1)
  const has = (...names: string[]) => rest.some(a => names.includes(a))
  const hasShort = (letter: string) => rest.some(a => SHORT_FLAGS.test(a) && a.includes(letter))
  const positional = rest.filter(a => !a.startsWith('-'))

  if (sub === 'push') {
    const remote = positional[0] ?? 'origin'
    // Every refspec counts: `git push origin main :old` deletes old, `main +other` forces other.
    const specs = positional.slice(1)
    const spec = specs.find(s => s.startsWith('+')) ?? specs[0] ?? ''
    const branch = spec.replace(/^\+/, '').split(':').pop() ?? ''
    if (has('--delete') || hasShort('d') || specs.some(s => s.startsWith(':'))) {
      return { rule: 'git-push-delete', label: 'git push --delete', short: `delete a remote branch on ${remote}` }
    }
    if (has('--mirror')) return { rule: 'git-push-force', label: 'git push --mirror', short: `mirror push to ${remote}` }
    const isForced = has('--force', '--force-if-includes') || rest.some(a => a.startsWith('--force-with-lease')) || hasShort('f') || specs.some(s => s.startsWith('+'))
    if (!isForced) return null

    return { rule: 'git-push-force', label: 'git push --force', short: `force push${branch ? ` to ${branch}` : ''}`, probe: { kind: 'push', dir: gitDir, remote, branch } }
  }
  if (sub === 'reset' && has('--hard')) {
    return { rule: 'git-reset-hard', label: 'git reset --hard', short: 'git reset hard', probe: { kind: 'reset', dir: gitDir } }
  }
  if (sub === 'clean') {
    const isForced = has('--force') || hasShort('f')
    const isDryRun = has('--dry-run') || hasShort('n')
    if (!isForced || isDryRun) return null
    const flags = rest.filter(a => a.startsWith('-'))

    return { rule: 'git-clean', label: 'git clean -f', short: 'git clean, untracked files go', probe: { kind: 'clean', dir: gitDir, flags } }
  }
  if (sub === 'branch') {
    const isForcedDelete = rest.some(a => SHORT_FLAGS.test(a) && a.includes('D')) || (has('-d', '--delete') && has('-f', '--force'))
    if (!isForcedDelete) return null
    const branch = positional[0] ?? ''

    return { rule: 'git-branch-delete', label: 'git branch -D', short: `delete branch ${branch}`.trim(), probe: { kind: 'branch', dir: gitDir, branch } }
  }
  if (sub === 'stash' && (positional[0] === 'drop' || positional[0] === 'clear')) {
    return { rule: 'git-stash-drop', label: `git stash ${positional[0]}`, short: 'drop stashed work' }
  }
  if (sub === 'checkout' && has('-f', '--force')) {
    return { rule: 'git-discard', label: 'git checkout -f', short: 'discard every uncommitted change', probe: { kind: 'reset', dir: gitDir } }
  }
  if (sub === 'checkout' || sub === 'restore') {
    const isStagedOnly = sub === 'restore' && has('--staged', '-S') && !has('--worktree', '-W')
    if (!has('.', ':/') || isStagedOnly) return null

    return { rule: 'git-discard', label: `git ${sub} .`, short: 'discard every uncommitted change', probe: { kind: 'discard', dir: gitDir } }
  }

  return null
}

/** The script's commands, cut where `segments` cuts it. */
function splitCommands(script: string): string[] {
  return segments(script).map(part => part.text)
}

/**
 * The script cut at `&&`, `||`, `;`, `|`, `&`, newlines and parentheses outside
 * quotes, each part with the operator before it ('' for the first).
 */
function segments(script: string): { text: string; sep: string }[] {
  const parts: { text: string; sep: string }[] = []
  let current = ''
  let sep = ''
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
      current += c // part of a redirection: 2>&1, &>file
    } else if (';|&\n()`'.includes(c)) {
      parts.push({ text: current, sep })
      current = ''
      const isDouble = (c === '&' || c === '|') && script[i + 1] === c
      sep = isDouble ? c + c : c
      if (isDouble) i += 1
    } else {
      current += c
    }
  }
  parts.push({ text: current, sep })

  return parts
}

/** One segment's words with braces and redirections dropped. */
function rawWords(segment: string): string[] {
  return withoutRedirections(tokenize(segment.trim().replace(/^[{]+\s*/, '').replace(/\s*[}]+$/, '')))
}

/** One command's words: redirections, leading assignments, sudo and harmless prefixes dropped. */
function commandWords(segment: string): string[] {
  const words = rawWords(segment)
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
      words.shift() // an option of a prefix: env -i, xargs -0, npx -y
    } else {
      return words
    }
  }
}

function withoutRedirections(words: readonly string[]): string[] {
  const kept: string[] = []
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? ''
    if (REDIRECT_ALONE.test(word)) i += 1 // the operator and its target
    else if (!REDIRECT_JOINED.test(word)) kept.push(word)
  }

  return kept
}

/**
 * Words of one segment, honouring quotes; quoted and bare pieces that touch make
 * one word, as in the shell (`"$S"/out`). Good enough to read flags and paths.
 */
function tokenize(text: string): string[] {
  const words: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s"']+|["'])|(\s+)/g
  let word: string | null = null
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m[4] !== undefined) {
      if (word !== null) words.push(word)
      word = null
    } else {
      word = (word ?? '') + (m[1] ?? m[2] ?? m[3] ?? '')
    }
  }
  if (word !== null) words.push(word)

  return words
}

/** Where `cd arg` lands from `dir`; `~` and `$VAR` stay unresolved. */
function joinPath(dir: string, arg: string): string {
  if (arg.startsWith('/') || arg.startsWith('~') || arg.startsWith('$') || dir === '') return arg

  return `${dir}/${arg}`
}

/** The absolute path's parts with `.` and `..` resolved; null when it cannot be known. */
function resolvedParts(target: string, dir: string): string[] | null {
  if (/[$`~]/.test(target)) return null
  const full = target.startsWith('/') ? target : dir.startsWith('/') ? `${dir}/${target}` : ''
  if (full === '') return null
  const parts: string[] = []
  for (const part of full.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }

  return parts
}

/**
 * The temp folders as path parts. macOS links /tmp to /private/tmp and /var to
 * /private/var, so each comes in both spellings; `tmpdir` ($TMPDIR, often
 * /var/folders/…/T/) counts when it is absolute and at least two levels deep.
 */
function tempRoots(tmpdir: string): string[][] {
  const roots = [['tmp'], ['private', 'tmp']]
  const own = tmpdir.startsWith('/') ? resolvedParts(tmpdir, '/') : null
  if (own === null || own.length < 2) return roots
  roots.push(own)
  if (own[0] === 'var') roots.push(['private', ...own])
  if (own[0] === 'private' && own[1] === 'var') roots.push(own.slice(1))

  return roots
}

/**
 * True when the path is strictly inside /tmp, /private/tmp or `tmpdir` (either spelling)
 * once `..` is resolved. A path whose tail sits in a variable (`/tmp/job/run/$v`) counts
 * when its literal start is two folders deep in a temp root: with `$v` empty it deletes
 * that one job folder, never the temp root or another session's folder beside it.
 */
export function isTempPath(target: string, dir: string, tmpdir = ''): boolean {
  const inside = (parts: readonly string[], deep: number) =>
    tempRoots(tmpdir).some(root => parts.length >= root.length + deep && root.every((part, i) => parts[i] === part))
  const parts = resolvedParts(target, dir)
  if (parts !== null) return inside(parts, 1)
  const stem = literalStem(target, dir)

  return stem !== null && inside(stem, 2)
}

/** The folders written out before the first `$name` of a path, or null when the rest could climb back out (`..`, `~`, a backtick). */
function literalStem(target: string, dir: string): string[] | null {
  const pieces = target.split('/')
  const at = pieces.findIndex(piece => piece.includes('$'))
  if (at <= 0 || /[`~]/.test(target) || pieces.slice(at).includes('..')) return null

  return resolvedParts(pieces.slice(0, at).join('/') || '/', dir)
}

/**
 * True for a relative path, with no `..`, that is a build folder (node_modules, dist, ...)
 * or sits inside one, when the command runs in the session's folder or in another project
 * folder such as a worktree beside it.
 */
export function isArtifact(target: string, dir: string, cwd: string): boolean {
  const names = target.split('/').filter(part => part !== '' && part !== '.')
  if (target.startsWith('/') || names.includes('..') || !names.some(name => ARTIFACTS.has(name))) return false
  const parts = resolvedParts(target, dir)
  const from = resolvedParts(dir, '/')
  const base = cwd.startsWith('/') ? resolvedParts(cwd, '/') : null
  if (!parts || !from || !dir.startsWith('/')) return false
  const isInSession = base !== null && parts.length > base.length && base.every((part, i) => parts[i] === part)
  // `cd .. && rm -rf node_modules` climbs out of the session's folder: its parents never count.
  const isAboveSession = base !== null && from.length <= base.length && from.every((part, i) => base[i] === part)

  return isInSession || (from.length >= PROJECT_DEPTH && !isAboveSession)
}

/**
 * A target that starts with a name which is either a known path or empty (`$S/out`),
 * with the path filled in, when the empty case is harmless: nothing after the name
 * (`rm -rf ""` deletes nothing) or a plain folder name that is not one of the disk's
 * own (`/out` does not exist). `$S/*`, `$S/`, `$S/usr`, `${S}x` and any `..` after the
 * name (`$S/x/../../C` climbs out of the real temp folder) come back unchanged and stay
 * a path in a variable.
 */
function settled(target: string, maybe?: ReadonlyMap<string, string>): string {
  const match = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))(?:\/(.*))?$/.exec(target)
  const value = maybe?.get(match?.[1] ?? match?.[2] ?? '')
  if (!match || value === undefined) return target
  const rest = match[3]
  if (rest === undefined) return value
  const first = rest.split('/')[0] ?? ''
  if (!/^[A-Za-z0-9._-]+$/.test(first) || first === '.' || rest.split('/').includes('..') || ROOT_FOLDERS.has(first)) return target

  return `${value}/${rest}`
}

/** True for a cache a tool rebuilds without being asked (`__pycache__`, ...), wherever it sits. */
export function isCache(target: string): boolean {
  const names = target.split('/').filter(part => part !== '')

  return !names.includes('..') && CACHES.has(names[names.length - 1] ?? '')
}

/**
 * True when Claude Code's own rm check is sure to stop this target of a bare top-level `rm`
 * and ask, bypass mode or not. Only the shapes it always catches count; anything less clear
 * (a `..`, a glob deeper down, quotes it reads differently, a variable the script itself sets
 * or loops over) stays held, since asking twice beats not asking at all.
 */
function isAskedByClaudeCode(target: string, ctx: Context): boolean {
  const unset = UNSET_TO_ROOT.exec(target)
  if (unset) {
    const name = unset[1] ?? unset[2] ?? ''
    // Every mention of the name is a `$name` read: the command never sets it.
    const mentions = ctx.script.match(new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'g'))?.length ?? 0
    const reads = ctx.script.match(new RegExp(`\\$\\{?${name}(?![A-Za-z0-9_])`, 'g'))?.length ?? 0

    return mentions === reads && !(ctx.plainRm ?? '').includes("'")
  }
  const stem = target.endsWith('/*') ? target.slice(0, -2) || '/' : target
  if (/^~\/?$/.test(stem)) return true
  if (!stem.startsWith('/') || /[$`~*?[{]/.test(stem) || stem.split('/').includes('..')) return false
  const parts = resolvedParts(stem, '/') ?? []
  const path = parts[0] === 'private' && PRIVATE_ALIASES.has(parts[1] ?? '') ? parts.slice(1) : parts
  const isAt = (other: string) => {
    const own = other.startsWith('/') ? resolvedParts(other, '/') : null
    return own !== null && path.length <= own.length && path.every((part, i) => own[i] === part)
  }
  const isHome = ctx.home.startsWith('/') && (resolvedParts(ctx.home, '/') ?? []).join('/') === path.join('/')

  // `isAt(cwd)`: the working folder or one above it, the git root included.
  return path.length <= 1 || isHome || isAt(ctx.cwd)
}

// ---- MCP tools -----------------------------------------------------------------

// Tool names that only look at things, by their first word, never hold.
const READ_VERBS = new Set(['get', 'list', 'search', 'read', 'query', 'fetch', 'describe', 'show', 'find', 'view', 'check', 'preview', 'whoami', 'docs', 'validate', 'download'])
// Verbs that send, publish or destroy, anywhere in the tool's name.
const HOLD_VERBS = new Set(['send', 'publish', 'delete', 'remove', 'trash', 'deploy', 'merge', 'pause', 'reset', 'share', 'forward', 'reply'])
// Whole phrases that change a shop or run a write.
const HOLD_PHRASES = ['bulk_update', 'set_inventory', 'create_discount', 'graphql_mutation']
// Names that carry a hold verb but change nothing anyone else sees.
const HARMLESS = new Set(['remove_background', 'merge_designs'])

/** The rule an MCP tool call breaks, or null. */
export function classifyMcp(tool: string, input: Readonly<Record<string, unknown>>): Risk | null {
  const match = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (!match) return null
  const server = (match[1] ?? '').replace(/^claude_ai_/, '')
  // `sendEmail` and `send-email` read as `send_email`.
  const name = (match[2] ?? '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/-/g, '_')
  if (HARMLESS.has(name)) return null

  if (name === 'execute_sql' || name === 'apply_migration') {
    const sql = String(input.query ?? input.sql ?? '')
    const risk = destructiveSql(sql)

    return risk ? { ...risk, short: `${server} ${risk.short}`, tool, what: clean(sql) } : null
  }

  const words = name.split('_')
  const phrase = HOLD_PHRASES.find(p => name.includes(p))
  const isReadOnly = READ_VERBS.has(words[0] ?? '') || words[words.length - 1] === 'status'
  const verb = phrase ?? (isReadOnly ? undefined : words.find(w => HOLD_VERBS.has(w)))
  if (verb === undefined) return null
  const spoken = verb.replace(/_/g, ' ')

  return {
    rule: `mcp:${server}:${verb}`,
    label: `${server} ${spoken}`,
    short: `${server} ${spoken}`,
    tool,
    what: summarizeArgs(input),
  }
}

/** A few of the call's own arguments as `key: value`, on one line. */
function summarizeArgs(input: Readonly<Record<string, unknown>>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (key === 'tool' || key === 'tool_use_id' || key === 'agentId' || key === 'consent') continue
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue
    parts.push(`${key}: ${clean(String(value), 60)}`)
    if (parts.length === 4) break
  }

  return clean(parts.join(' · ') || '(no arguments)')
}
