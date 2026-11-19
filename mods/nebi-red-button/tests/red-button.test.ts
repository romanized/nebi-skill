import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { classifyCall } from '../hooks/classify'
import { denial, holdCall, paneClosed } from '../hooks/register'

const PLUGIN = 'nebi-red-button'
const CWD = '/Users/nebi/Documents/GitHub/shop'
// macOS's per-user temp folder, as $TMPDIR spells it.
const TMPDIR = '/var/folders/x8/abc123/T/'
const HOLD_FILE = '/Users/nebi/.claude/nebi/beacons/sess-1.hold.json'
const CARRY_ON = "Nebi didn't answer in 10 min. Skip this step, carry on with the rest, and put the exact command in your ❓ line."

// [tool, input, the rule it breaks or null when it runs]
const TABLE: readonly [string, Record<string, unknown>, string | null][] = [
  // Bash that holds
  ['Bash', { command: 'rm -rf src' }, 'rm-recursive'],
  ['Bash', { command: 'rm -r ~/Documents/old' }, 'rm-recursive'],
  ['Bash', { command: 'sudo rm -Rf /var/www' }, 'rm-recursive'],
  ['Bash', { command: 'cd /tmp && rm -rf ../Users/nebi' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf /tmp/x/../../Users/nebi' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf /tmp' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf /private/tmp' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf /var/folders/x8/abc123/T' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf /private/var/folders/x8/abc123/T/../../../db' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf /var/folders/x8/other/T/x' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf /private/var/db' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf $S' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf "/tmp/x"/../../Users/nebi' }, 'rm-recursive'],
  ['Bash', { command: 'find . -name "*.log" | xargs rm -rf' }, 'rm-recursive'],
  ['Bash', { command: 'git push --force origin main' }, 'git-push-force'],
  ['Bash', { command: 'git push -f' }, 'git-push-force'],
  ['Bash', { command: 'git push --force-with-lease=main origin main' }, 'git-push-force'],
  ['Bash', { command: 'git -C ../site push origin +main' }, 'git-push-force'],
  ['Bash', { command: 'git push origin --delete old-branch' }, 'git-push-delete'],
  ['Bash', { command: 'git reset --hard HEAD~3' }, 'git-reset-hard'],
  ['Bash', { command: 'git clean -fdx' }, 'git-clean'],
  ['Bash', { command: 'git branch -D feature/login' }, 'git-branch-delete'],
  ['Bash', { command: 'git checkout -- .' }, 'git-discard'],
  ['Bash', { command: 'git restore .' }, 'git-discard'],
  ['Bash', { command: 'psql "$DATABASE_URL" -c "DROP TABLE orders"' }, 'sql-drop'],
  ['Bash', { command: 'echo "TRUNCATE sessions" | /usr/bin/psql "$DB"' }, 'sql-truncate'],
  ['Bash', { command: 'psql "$DB" <<SQL\nDROP TABLE orders;\nSQL' }, 'sql-drop'],
  ['Bash', { command: 'bash <<EOF\nrm -rf ~/Documents/old\nEOF' }, 'rm-recursive'],
  // Data that only mentions the words: no database client or shell runs it
  ['Bash', { command: 'grep -rn "DROP TABLE" supabase/migrations' }, null],
  ['Bash', { command: 'git commit -m "supabase: drop table legacy users"' }, null],
  ['Bash', { command: "cat > notes.md <<'EOF'\nsupabase migration will DROP TABLE legacy\nrm -rf ~/old is the cleanup step\nEOF" }, null],
  ['Bash', { command: "python3 - <<'PY'\nprint('supabase DROP TABLE x')\nPY" }, null],
  ['Bash', { command: 'supabase db execute --sql "truncate table events"' }, 'sql-truncate'],
  ['Bash', { command: 'sqlite3 app.db "DELETE FROM users"' }, 'sql-delete-all'],
  // Bash that hides the command one level down
  ['Bash', { command: 'find . -name "*.tmp" -delete' }, 'find-delete'],
  ['Bash', { command: 'find ~/Documents -type d -exec rm -rf {} +' }, 'rm-recursive'],
  ['Bash', { command: 'find . -name "*.orig" -execdir rm -r {} \\;' }, 'rm-recursive'],
  ['Bash', { command: 'find . -maxdepth 1 -name repo -exec git -C {} reset --hard \\;' }, 'git-reset-hard'],
  ['Bash', { command: 'bash -c "rm -rf ~/Documents"' }, 'rm-recursive'],
  ['Bash', { command: "sh -c 'git push --force origin main'" }, 'git-push-force'],
  ['Bash', { command: 'zsh -lc "cd ~/site && git reset --hard"' }, 'git-reset-hard'],
  ['Bash', { command: 'eval "rm -rf $HOME/old"' }, 'rm-recursive'],
  ['Bash', { command: 'echo "$(rm -rf ~/x)"' }, 'rm-recursive'],
  ['Bash', { command: 'supabase db reset' }, 'db-reset'],
  ['Bash', { command: 'supabase db reset --linked' }, 'db-reset'],
  ['Bash', { command: 'npx prisma migrate reset --force' }, 'db-reset'],
  ['Bash', { command: 'pnpm exec prisma db push --force-reset' }, 'db-reset'],
  ['Bash', { command: 'git stash drop' }, 'git-stash-drop'],
  ['Bash', { command: 'git stash clear' }, 'git-stash-drop'],
  ['Bash', { command: 'git checkout -f main' }, 'git-discard'],
  ['Bash', { command: 'git push --mirror backup' }, 'git-push-force'],
  ['Bash', { command: 'rm -rf ../node_modules' }, 'rm-recursive'],
  ['Bash', { command: 'cd .. && rm -rf node_modules' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf /Users/nebi/node_modules' }, 'rm-recursive'],
  ['Bash', { command: 'rm -rf node_modules src' }, 'rm-recursive'],
  // A `<<` that starts no heredoc, or one that never ends, hides nothing after it (F01)
  ['Bash', { command: 'echo $((1 << n))\nrm -rf ~/Documents' }, 'rm-recursive'],
  ['Bash', { command: 'x=$((1<<n))\ngit push --force origin main' }, 'git-push-force'],
  ['Bash', { command: '# note <<EOF\nrm -rf ~/Documents' }, 'rm-recursive'],
  ['Bash', { command: "echo 'a <<EOF'\nrm -rf ~/Documents" }, 'rm-recursive'],
  ['Bash', { command: 'echo "a <<EOF"\nrm -rf ~/Documents' }, 'rm-recursive'],
  ['Bash', { command: 'git commit -m "first\n<<EOF\nlast"\nrm -rf ~/Documents\nEOF' }, 'rm-recursive'],
  ['Bash', { command: 'cat <<<EOF\nrm -rf ~/Documents' }, 'rm-recursive'],
  ['Bash', { command: 'cat <<EOF\nrm -rf ~/Documents' }, 'rm-recursive'],
  ['Bash', { command: 'cat <<EOF\nhello\nEOF\nrm -rf ~/Documents' }, 'rm-recursive'],
  // A heredoc inside "$( … )" is still a heredoc: the commit message is data
  ['Bash', { command: "git commit -m \"$(cat <<'EOF'\nClose bypasses (F01)\n\nHold `rm -rf ~/Documents` after a fake heredoc.\nEOF\n)\"" }, null],
  ['Bash', { command: "git commit -m \"$(cat <<'EOF'\nQuote \" once, then `rm -rf ~/Documents`\nEOF\n)\"" }, null],
  ['Bash', { command: "git commit -m \"$(cat <<'A'\nfirst `rm -rf ~/x`\nA\n)\"\ngit commit -m \"$(cat <<'B'\nsecond `rm -rf ~/y`\nB\n)\"" }, null],
  ['Bash', { command: "echo \"$(bash <<'EOF'\nrm -rf ~/Documents\nEOF\n)\"" }, 'rm-recursive'],
  ['Bash', { command: "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\"\nrm -rf ~/Documents" }, 'rm-recursive'],
  // Every refspec and git's own options with a value (F12)
  ['Bash', { command: 'git push origin main :secret-branch' }, 'git-push-delete'],
  ['Bash', { command: 'git push origin main +other' }, 'git-push-force'],
  ['Bash', { command: 'git --git-dir /repo/.git push --force' }, 'git-push-force'],
  ['Bash', { command: 'git --git-dir=/repo/.git push --force' }, 'git-push-force'],
  ['Bash', { command: 'git --work-tree /repo push --force' }, 'git-push-force'],
  // Bash that runs
  ['Bash', { command: 'rm -rf /tmp/x' }, null],
  ['Bash', { command: 'rm -rf /private/tmp/claude-501/scratch' }, null],
  ['Bash', { command: 'rm -rf /private/tmp/claude-501/-Users-nebi-shop/5376e9a8/scratchpad/run-1' }, null],
  ['Bash', { command: 'cd /private/tmp/claude-501/scratch && rm -rf out' }, null],
  ['Bash', { command: 'rm -rf "/private/tmp/claude-501/scratch"/out' }, null],
  ['Bash', { command: 'rm -rf /var/folders/x8/abc123/T/build-1' }, null],
  ['Bash', { command: 'rm -rf /private/var/folders/x8/abc123/T/build-1' }, null],
  ['Bash', { command: 'find /private/var/folders/x8/abc123/T/run -name "*.log" -delete' }, null],
  ['Bash', { command: 'rm file.txt' }, null],
  ['Bash', { command: 'rm -f notes.bak' }, null],
  ['Bash', { command: 'git push' }, null],
  ['Bash', { command: 'git push origin main' }, null],
  ['Bash', { command: 'git push -u origin feature' }, null],
  ['Bash', { command: 'git reset --soft HEAD~1' }, null],
  ['Bash', { command: 'git clean -n' }, null],
  ['Bash', { command: 'git branch -d merged-branch' }, null],
  ['Bash', { command: 'git checkout main' }, null],
  ['Bash', { command: 'git restore --staged .' }, null],
  ['Bash', { command: 'psql -c "DELETE FROM t WHERE id=1"' }, null],
  ['Bash', { command: 'psql -c "ALTER TABLE t ALTER COLUMN c DROP NOT NULL"' }, null],
  ['Bash', { command: 'echo "DROP TABLE x" > notes.md' }, null],
  ['Bash', { command: 'ls -la && git status' }, null],
  ['Bash', { command: 'rm -rf /tmp/x 2>/dev/null' }, null],
  ['Bash', { command: 'rm -rf /tmp/build > /dev/null 2>&1' }, null],
  ['Bash', { command: 'rm -rf /tmp/out &>/dev/null' }, null],
  ['Bash', { command: 'rm -rf node_modules dist .next' }, null],
  ['Bash', { command: 'rm -rf ./build packages/web/.turbo coverage/ .cache out' }, null],
  ['Bash', { command: 'find /tmp/x -name "*.log" -delete' }, null],
  ['Bash', { command: 'find . -name "*.ts" -exec grep -l foo {} \\;' }, null],
  ['Bash', { command: 'bash -c "echo hi && ls"' }, null],
  ['Bash', { command: 'sh -c "rm -rf /tmp/x"' }, null],
  ['Bash', { command: 'npx prisma db push' }, null],
  ['Bash', { command: 'prisma migrate dev' }, null],
  ['Bash', { command: 'supabase db push' }, null],
  ['Bash', { command: 'git stash pop' }, null],
  ['Bash', { command: 'git checkout -b feature' }, null],
  ['Bash', { command: 'git commit -m "rm -rf old; drop table cleanup"' }, null],
  ['Bash', { command: 'git push origin main feature' }, null],
  ['Bash', { command: 'cat <<-EOF\n\trm -rf ~/old\n\tEOF' }, null],
  ['Bash', { command: "git commit -F - <<'EOF'\nrm -rf ~/old is gone\nEOF\ngit status" }, null],
  // MCP tools
  ['mcp__claude_ai_Gmail__search_threads', { query: 'from:me' }, null],
  ['mcp__claude_ai_Gmail__send_message', { to: 'a@b.c', subject: 'Hi' }, 'mcp:Gmail:send'],
  ['mcp__claude_ai_Gmail__forward', { messageId: 'm1' }, 'mcp:Gmail:forward'],
  ['mcp__claude_ai_Gmail__reply', { messageId: 'm1' }, 'mcp:Gmail:reply'],
  ['mcp__claude_ai_Gmail__untrash_message', { messageId: 'm1' }, null],
  ['mcp__claude_ai_Google_Drive__trash_file', { fileId: 'f1' }, 'mcp:Google_Drive:trash'],
  ['mcp__claude_ai_Google_Drive__share_file', { fileId: 'f1' }, 'mcp:Google_Drive:share'],
  ['mcp__claude_ai_Google_Drive__read_file_content', { fileId: 'f1' }, null],
  ['mcp__railway__deploy', { service: 'web' }, 'mcp:railway:deploy'],
  ['mcp__railway__remove_service', { service: 'web' }, 'mcp:railway:remove'],
  ['mcp__railway__delete_domain', { domain: 'x.app' }, 'mcp:railway:delete'],
  ['mcp__railway__list_services', {}, null],
  ['mcp__claude_ai_Higgsfield__tiktok_prepare_publish', { id: 'v1' }, 'mcp:Higgsfield:publish'],
  ['mcp__claude_ai_Higgsfield__tiktok_publish_status', { id: 'v1' }, null],
  ['mcp__claude_ai_Higgsfield__remove_background', { image: 'i1' }, null],
  ['mcp__claude_ai_Shopify__bulk-update-product-status', { status: 'DRAFT' }, 'mcp:Shopify:bulk_update'],
  ['mcp__claude_ai_Shopify__set-inventory', { quantity: 0 }, 'mcp:Shopify:set_inventory'],
  ['mcp__claude_ai_Shopify__create-discount', { percent: 90 }, 'mcp:Shopify:create_discount'],
  ['mcp__claude_ai_Shopify__graphql_mutation', { query: 'mutation { x }' }, 'mcp:Shopify:graphql_mutation'],
  ['mcp__claude_ai_Shopify__graphql_query', { query: '{ shop { name } }' }, null],
  ['mcp__claude_ai_Supabase__execute_sql', { query: 'select * from orders' }, null],
  ['mcp__claude_ai_Supabase__execute_sql', { query: 'DELETE FROM orders;' }, 'sql-delete-all'],
  ['mcp__claude_ai_Supabase__apply_migration', { query: 'drop table legacy_users;' }, 'sql-drop'],
  ['mcp__claude_ai_Supabase__pause_project', { project_id: 'p1' }, 'mcp:Supabase:pause'],
  ['mcp__claude_ai_Supabase__merge_branch', { branch_id: 'b1' }, 'mcp:Supabase:merge'],
  ['mcp__claude_ai_Supabase__reset_branch', { branch_id: 'b1' }, 'mcp:Supabase:reset'],
  ['mcp__claude_ai_Supabase__list_tables', {}, null],
  // camelCase names read as their snake_case form (F12)
  ['mcp__gmail__sendEmail', { to: 'a@b.c' }, 'mcp:gmail:send'],
  ['mcp__github__deleteRepo', { repo: 'x' }, 'mcp:github:delete'],
  ['mcp__github__getStatus', {}, null],
  ['mcp__claude_ai_Higgsfield__removeBackground', { image: 'i1' }, null],
  // Tools Red Button never holds
  ['Read', { file_path: '/etc/hosts' }, null],
  ['Edit', { file_path: 'a.ts', old_string: 'a', new_string: 'b' }, null],
]

const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

const PANE_PROPS = {
  title: 'Red Button',
  isFocused: true,
  bodyColumns: 100,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}
const BAND_PROPS = { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 }, view: {} }

/** The engine beneath the plugin: a session, a clock, a shell, and the pane calls. */
function engine(on: On, isPlaced = true) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, { HOME: '/Users/nebi', TMPDIR })
  const seen = {
    opened: 0,
    closed: 0,
    ran: [] as string[],
    pushed: [] as string[],
    spoken: [] as string[],
    toasts: [] as string[],
    panes: [] as unknown[],
    statuses: 0,
    writes: [] as { path: string; text: string }[],
    removed: [] as string[],
  }
  on('session.start', (_, e) => ({ cwd: e.cwd }) as any)
  on('session.cwd', () => ({ value: CWD }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }) as any)
  on('fs.write', (_, e) => {
    seen.writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('process.run', async (_, e) => {
    if (e.argv[0] === 'sleep') {
      await clock.sleep(250)
      return { value: ok() }
    }
    if (e.argv[0] === 'rm') {
      seen.removed.push(e.argv.join(' '))
      return { value: ok() }
    }
    if (e.argv.join(' ') === 'git diff --stat HEAD') return { value: ok(' src/cart.ts | 12 ++++----\n 1 file changed, 8 insertions(+), 4 deletions(-)\n') }
    return { value: ok() }
  })
  on('ui.open', (_, e) => {
    seen.opened += 1
    seen.panes.push(e)
    return { value: isPlaced ? { isPlaced: true as const } : { isPlaced: false as const, reason: 'narrow' } }
  })
  on('ui.close', () => {
    seen.closed += 1
    return { value: undefined }
  })
  on('ui.status', () => {
    seen.statuses += 1
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('audio.speak', (_, e) => {
    seen.spoken.push(e.text)
    return { value: { via: 'system' as const } }
  })
  on('tool.call', (_, e) => {
    const call = e as unknown as { tool: string; command?: string; message?: string }
    // The hold's own phone push is not the held call: keep it out of `ran`.
    if (call.tool === 'PushNotification') {
      seen.pushed.push(String(call.message))
      return { result: 'sent' } as any
    }
    seen.ran.push(String(call.command ?? call.tool))
    return { result: 'ran' } as any
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ children: [] }))

  return { clock, seen }
}

const bash = (command: string) => ({ tool: 'Bash', command }) as any
const RM = `rm -f ${HOLD_FILE}`
const FULLSCREEN = { columns: 160, rows: 48, isFullscreen: true }
const MAIN_SCREEN = { columns: 160, rows: 48, isFullscreen: false }

describe('nebi-red-button', () => {
  test(`the classifier holds what it should and passes the rest (${TABLE.length} cases)`, () => {
    for (const [tool, input, rule] of TABLE) {
      const risk = classifyCall(tool, input, CWD, TMPDIR)
      expect(risk?.rule ?? null, `${tool} ${JSON.stringify(input)}`).toBe(rule)
    }
    expect(TABLE.length).toBeGreaterThanOrEqual(24)
  })

  test('the $TMPDIR folder runs only when it is known, and a path in a variable says so', () => {
    const inTmpdir = 'rm -rf /var/folders/x8/abc123/T/build-1'
    expect(classifyCall('Bash', { command: inTmpdir }, CWD, TMPDIR)).toBeNull()
    expect(classifyCall('Bash', { command: inTmpdir }, CWD)?.rule).toBe('rm-recursive')
    // A $TMPDIR of / or one level deep allows nothing beyond /tmp.
    expect(classifyCall('Bash', { command: 'rm -rf /Users/nebi' }, CWD, '/')?.rule).toBe('rm-recursive')
    expect(classifyCall('Bash', { command: 'rm -rf /var/db' }, CWD, '/var')?.rule).toBe('rm-recursive')

    for (const command of ['rm -rf $S', 'rm -rf "$SCRATCH"/run-1', 'cd "$S" && rm -rf out']) {
      expect(classifyCall('Bash', { command }, CWD, TMPDIR), command).toMatchObject({
        rule: 'rm-recursive',
        label: 'rm -rf on a path in a shell variable',
        hint: expect.stringContaining('literal path'),
      })
    }
    // A variable the script set to a literal path earlier, unconditionally, is filled in.
    for (const command of [
      'S=/private/tmp/x/scratchpad; C=$S/up; rm -rf $S/pullcheck && mkdir $S/pullcheck',
      'T=/private/tmp/x/staged && rm -rf "$T" && git status',
      'export SP=/tmp/a; C=$SP/b; rm -rf "${C}"',
      'S=/tmp/a; cd "$S" && rm -rf out',
      'cd repo && S=/tmp/a && rm -rf $S/x',
    ]) {
      expect(classifyCall('Bash', { command }, CWD, TMPDIR), command).toBeNull()
    }
    // A pipe or a finished loop earlier in the script does not taint what it sets afterwards,
    // and a tail still in a variable runs when the written-out start is a temp job folder.
    for (const command of [
      'git ls-files | wc -l; SC=/private/tmp/x/scratchpad; rm -rf $SC/shots-before',
      'for f in a b; do echo $f; done; S=/tmp/a; rm -rf $S/x',
      'if true; then echo hi; fi\nS=/tmp/a; rm -rf $S/x',
      'S=/private/tmp/job/scratchpad; for v in a b; do rm -rf $S/$v; done',
      'rm -rf /private/tmp/job/scratchpad/bisect/$sha/out',
    ]) {
      expect(classifyCall('Bash', { command }, CWD, TMPDIR), command).toBeNull()
    }
    // A name whose `&&` chain ended, or one holding a fresh mktemp folder, is that temp path
    // or empty. It runs where the empty case deletes nothing: no tail, or a plain folder name.
    for (const command of [
      'cd repo && S=/tmp/a; rm -rf $S/x',
      'cd repo && OUT=/private/tmp/x/accept; rm -rf "$OUT"',
      'cd repo && S=/tmp/a; rm -rf "${S}/x/*"',
      'prof=$(mktemp -d /tmp/k24chrome.XXXX); chrome --user-data-dir="$prof"; rm -rf $prof',
      'd="$(mktemp -d)"; cp a "$d"/; rm -rf "$d"/copy',
    ]) {
      expect(classifyCall('Bash', { command }, CWD, TMPDIR), command).toBeNull()
    }
    // The empty case would reach the disk's own folders, the current folder or a path
    // the shell already holds, so these stay held.
    for (const command of [
      'cd repo && S=/tmp/a; rm -rf $S/*',
      'cd repo && S=/tmp/a; rm -rf $S/',
      'cd repo && S=/tmp/a; rm -rf $S/usr',
      'cd repo && S=/tmp/a; rm -rf $S/../x',
      'cd repo && S=/tmp/a; rm -rf ${S}x',
      'cd repo && S=/tmp/a; rm -rf $S/$v',
      'cd repo && HOME=/tmp/a; rm -rf $HOME/x',
      'cd repo && CACHE_DIR=/tmp/a; rm -rf $CACHE_DIR/x',
      'd=$(mktemp -d); rm -rf $d/*',
      'd=$(mktemp -d ~/x.XXXX); rm -rf $d',
      'cd repo && S=/tmp/a; S=$(pwd); rm -rf $S/x',
      'cd repo && S=/tmp/a; cd "$S" && rm -rf src',
      'rm -rf /tmp/x/$v',
      'rm -rf /private/tmp/job/scratchpad/$v/../../../x',
      // A `..` after the name climbs out of the real temp folder, or reaches / when it is empty (F12).
      'd=$(mktemp -d); rm -rf "$d/foo/../../../C"',
      'd=$(mktemp -d); rm -rf "$d/foo/.."',
      'cd repo && S=/tmp/a; rm -rf $S/x/../../usr',
    ]) {
      expect(classifyCall('Bash', { command }, CWD, TMPDIR)?.rule, command).toBe('rm-recursive')
    }
    // One that may not hold when the rm runs stays a variable: set in a branch, subshell,
    // pipe or background job, changed or unset since.
    for (const command of [
      'if true; then S=/tmp/a; fi; rm -rf $S/x',
      'false || S=/tmp/a; rm -rf $S/x',
      '(S=/tmp/a); rm -rf $S/x',
      'S=/tmp/a | cat; rm -rf $S/x',
      'S=/tmp/a &\nrm -rf $S/x',
      'S=/tmp/a; read S; rm -rf $S/x',
      'S=/tmp/a; S=$(pwd); rm -rf $S',
      'S=/tmp/a; unset S; rm -rf $S/*',
      'S=/tmp/a rm -rf $S',
    ]) {
      expect(classifyCall('Bash', { command }, CWD, TMPDIR)?.label, command).toBe('rm -rf on a path in a shell variable')
    }
    // Caches run wherever they sit; build output runs in the session's folder or another
    // project folder such as a worktree; source folders and a shallow folder stay held.
    for (const command of [
      'rm -rf __pycache__',
      'rm -rf /Users/nebi/.agents/work/sweep/__pycache__ scripts/.pytest_cache',
      'cd /Users/nebi/Documents/GitHub/shop.wt/lane-1/games/zombie && rm -rf dist node_modules',
      'cd /Users/nebi/Documents/GitHub/shop.wt/lane-1 && rm -rf test-results/synth-pack test/tmp',
      'rm -rf dist/assets',
    ]) {
      expect(classifyCall('Bash', { command }, CWD, TMPDIR), command).toBeNull()
    }
    for (const command of [
      'cd /Users/nebi/Documents/GitHub/shop.wt/lane-1 && rm -rf src',
      'cd /Users/nebi/Documents/GitHub/shop.wt/lane-1 && rm -rf dist/../src',
      'cd /Users/nebi && rm -rf build',
      'rm -rf __pycache__/../src',
      'rm -rf src/__scratch',
    ]) {
      expect(classifyCall('Bash', { command }, CWD, TMPDIR)?.label, command).toBe('rm -rf outside /tmp')
    }
    for (const command of ['S=/Users/nebi/site; rm -rf $S/dist', 'S=/tmp/a/../../Users/nebi; rm -rf $S']) {
      expect(classifyCall('Bash', { command }, CWD, TMPDIR)?.label, command).toBe('rm -rf outside /tmp')
    }
    // A real path beside the variable, or a home path, keeps the plain rule and no hint.
    for (const command of ['rm -rf "$S" src', 'rm -rf ~/x']) {
      const risk = classifyCall('Bash', { command }, CWD, TMPDIR)
      expect(risk?.label, command).toBe('rm -rf outside /tmp')
      expect(risk?.hint, command).toBeUndefined()
    }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const mountBand = ($: any, viewport: typeof FULLSCREEN) => $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: BAND_PROPS, viewport })
    const mountPane = ($: any) => $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PLUGIN, props: PANE_PROPS })

    test(`a held call runs on r and is denied on b, in the band, on ${surface}`, async ($, on) => {
      const { clock, seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, FULLSCREEN)

      // r, Run it: the call waits, the band row shows what and why, then it runs.
      const first = $.tool.call(bash('git reset --hard HEAD~1'))
      await clock.settle()
      expect(seen.ran).toEqual([])
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeDefined()
      expect(await band.find({ type: 'Text', text: 'git reset --hard HEAD~1' })).toBeDefined()
      expect(await band.find({ type: 'Text', text: /git reset --hard$/ })).toBeDefined()
      expect(await band.find({ type: 'Text', text: /loses 1 file changed, 8 insertions/ })).toBeDefined()
      expect(await band.find({ type: 'Button', key: 'run' })).toMatchObject({ props: { hotkey: 'r' } })
      expect(await band.find({ type: 'Button', key: 'block' })).toMatchObject({ props: { variant: 'primary', hotkey: 'b' } })
      expect(await band.find({ type: 'Button', key: 'allow' })).toMatchObject({ props: { hotkey: 'a' } })
      expect(await band.find({ type: 'Text', text: /ctrl\+x tab, then r run · b block · a allow for the session/ })).toBeDefined()
      // A hold is silent: nothing is spoken. The phone push still goes out.
      expect(seen.spoken).toEqual([])
      expect(seen.pushed).toEqual(['Claude needs approval: git reset hard'])
      await band.press({ key: 'run' })
      await clock.advance(250)
      expect(await first).toMatchObject({ result: 'ran' })
      expect(seen.ran).toEqual(['git reset --hard HEAD~1'])
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeUndefined()

      // b, Block: the call never runs and Claude is told to ask.
      const second = $.tool.call(bash('git push --force origin main'))
      await clock.settle()
      await band.press({ key: 'block' })
      await clock.advance(250)
      expect(await second).toEqual({
        deny: 'Nebi blocked this with Red Button (git push --force). Ask before trying another route.',
      })
      expect(seen.ran).toEqual(['git reset --hard HEAD~1'])
      expect(seen.spoken).toEqual([])

      // Safe calls never wait, and no hold opened a pane.
      expect(await $.tool.call(bash('git push origin main'))).toMatchObject({ result: 'ran' })
      expect(seen.opened).toBe(0)
      await band.unmount()
    })

    test(`a allows the rule for the session on ${surface}`, async ($, on) => {
      const { clock, seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, FULLSCREEN)

      const first = $.tool.call({ tool: 'mcp__claude_ai_Gmail__send_message', to: 'shop@example.com', subject: 'Order' } as any)
      await clock.settle()
      expect(await band.find({ type: 'Text', text: /to: shop@example.com · subject: Order/ })).toBeDefined()
      await band.press({ key: 'allow' })
      await clock.advance(250)
      expect(await first).toMatchObject({ result: 'ran' })
      expect(seen.toasts).toContain('Red Button: Gmail send allowed for this session')

      // The same rule runs at once now; another rule still holds.
      expect(await $.tool.call({ tool: 'mcp__claude_ai_Gmail__send_message', to: 'b@example.com' } as any)).toMatchObject({ result: 'ran' })
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeUndefined()
      const other = $.tool.call({ tool: 'mcp__railway__deploy', service: 'web' } as any)
      await clock.settle()
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeDefined()
      await band.press({ key: 'block' })
      await clock.advance(250)
      expect(await other).toMatchObject({ deny: expect.stringContaining('railway deploy') })
      expect(seen.opened).toBe(0)

      const listed = await $.command.run({ command: 'redbutton', args: 'list', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as any)
      expect(listed.text).toContain('mcp:Gmail:send')
      await band.unmount()
    })

    for (const viewport of [FULLSCREEN, MAIN_SCREEN]) {
      test(`a hold ${viewport.isFullscreen ? 'in' : 'off'} fullscreen calls no ui.open and draws only its band row, on ${surface}`, async ($, on) => {
        const { clock, seen } = engine(on)
        await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
        const band = await mountBand($, viewport)
        expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeUndefined()

        const held = $.tool.call(bash('rm -rf src'))
        await clock.settle()
        expect(seen.opened).toBe(0)
        expect(seen.panes).toEqual([])
        expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeDefined()
        expect(await band.find({ type: 'Text', text: /rm -rf outside \/tmp/ })).toBeDefined()
        await band.press({ key: 'block' })
        await clock.advance(250)
        expect(await held).toMatchObject({ deny: expect.stringContaining('rm -rf outside /tmp') })
        expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeUndefined()

        // r from the band runs it.
        const second = $.tool.call(bash('git clean -fd'))
        await clock.settle()
        expect(await band.find({ type: 'Text', text: /git clean -f/ })).toBeDefined()
        await band.press({ key: 'run' })
        await clock.advance(250)
        expect(await second).toMatchObject({ result: 'ran' })
        expect(seen.ran).toEqual(['git clean -fd'])
        expect(seen.opened).toBe(0)
        await band.unmount()
      })
    }

    test(`a bare /redbutton Nebi typed opens the pane, which carries the hold while the band yields, on ${surface}`, async ($, on) => {
      const { clock, seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, FULLSCREEN)
      const run = (args: string, kind = 'composer') =>
        $.command.run({ command: 'redbutton', args, origin: kind === 'plugin' ? { kind, name: 'other' } : { kind }, presentation: { isFullscreen: true, columns: 120 } } as any)

      const held = $.tool.call(bash('git reset --hard HEAD~1'))
      await clock.settle()
      expect(seen.opened).toBe(0)

      // Arguments, a plugin and a notification never open it.
      await run('off')
      await run('on')
      await run('', 'plugin')
      await run('', 'task-notification')
      expect(seen.opened).toBe(0)

      expect((await run('')).text).toContain('It holds these and asks first:')
      expect(seen.opened).toBe(1)
      expect(seen.panes[0]).toMatchObject({ id: PLUGIN, title: 'Red Button', focus: true, closeOnEscape: true, rows: 9 + 2 })
      const pane = await mountPane($)
      expect(await pane.find({ type: 'Text', text: /RED BUTTON/ })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: 'git reset --hard HEAD~1' })).toBeDefined()
      expect(await pane.find({ type: 'Text', text: /r run · b block · a allow for the session · Esc blocks/ })).toBeDefined()
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeUndefined()

      await pane.press({ key: 'block' })
      await clock.advance(250)
      expect(await held).toMatchObject({ deny: expect.stringContaining('git reset --hard') })
      expect(await pane.find({ type: 'Text', text: /Nothing is held/ })).toBeDefined()
      // Answering the hold leaves the pane Nebi opened alone.
      expect(seen.closed).toBe(0)
      await pane.unmount()
      await band.unmount()
    })

    test(`/redbutton with nothing held opens the pane; a pane that is not placed leaves the hold in the band, on ${surface}`, async ($, on) => {
      const { clock, seen } = engine(on, false)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, FULLSCREEN)

      await $.command.run({ command: 'redbutton', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as any)
      expect(seen.opened).toBe(1)
      expect(seen.panes[0]).not.toHaveProperty('rows')
      const pane = await mountPane($)
      expect(await pane.find({ type: 'Text', text: /Nothing is held/ })).toBeDefined()

      const held = $.tool.call(bash('git stash drop'))
      await clock.settle()
      expect(seen.opened).toBe(1)
      expect(await band.find({ type: 'Text', text: /git stash drop/ })).toBeDefined()
      await band.press({ key: 'block' })
      await clock.advance(250)
      expect(await held).toMatchObject({ deny: expect.stringContaining('git stash drop') })
      await pane.unmount()
      await band.unmount()
    })

    test(`a sub-agent is stopped at once, the main loop still holds, and a session allow covers both, on ${surface}`, async ($, on) => {
      const { clock, seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, FULLSCREEN)

      // A sub-agent's call: denied with no hold, no dialog, no voice.
      expect(await $.tool.call({ ...bash('rm -rf ~/x'), agentId: 'scout-1' })).toEqual({
        deny: "Nebi's Red Button blocks sub-agents from rm -rf outside /tmp. Report the exact command to the lead instead of trying another route.",
      })
      expect(seen.opened).toBe(0)
      expect(seen.spoken).toEqual([])
      expect(seen.toasts).toEqual(['Red Button stopped a sub-agent: delete a folder: ~/x'])
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeUndefined()

      // The same rule from the main loop still holds; a allows it for the session.
      const main = $.tool.call(bash('rm -rf ~/x'))
      await clock.settle()
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeDefined()
      await band.press({ key: 'allow' })
      await clock.advance(250)
      expect(await main).toMatchObject({ result: 'ran' })

      // Now a sub-agent's call under that rule runs.
      expect(await $.tool.call({ ...bash('rm -rf ~/y'), agentId: 'scout-1' })).toMatchObject({ result: 'ran' })
      expect(seen.ran).toEqual(['rm -rf ~/x', 'rm -rf ~/y'])
      expect(seen.opened).toBe(0)
      await band.unmount()
    })

    test(`a sub-agent's rm in a temp folder runs, and one on a variable path is told to write the literal path, on ${surface}`, async ($, on) => {
      const { seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)

      for (const command of ['rm -rf /private/tmp/claude-501/scratch/run-1', 'rm -rf /var/folders/x8/abc123/T/build-1', 'rm -rf /private/var/folders/x8/abc123/T/build-1']) {
        expect(await $.tool.call({ ...bash(command), agentId: 'scout-1' }), command).toMatchObject({ result: 'ran' })
      }
      expect(await $.tool.call({ ...bash('rm -rf "$S"'), agentId: 'scout-1' })).toEqual({
        deny: "Nebi's Red Button blocks sub-agents from rm -rf on a path in a shell variable. Run it again with the literal path written out: paths inside /tmp, /private/tmp or $TMPDIR run; report any other path to the lead.",
      })
      expect(seen.opened).toBe(0)
      expect(seen.toasts).toEqual(['Red Button stopped a sub-agent: delete a folder: $S'])
    })

    test(`/redbutton off lets everything through until /redbutton on, on ${surface}`, async ($, on) => {
      const { clock, seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, FULLSCREEN)
      const run = (args: string) =>
        $.command.run({ command: 'redbutton', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as any)

      expect((await run('off')).text).toContain('off for this session')
      expect(await $.tool.call(bash('rm -rf src'))).toMatchObject({ result: 'ran' })
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeUndefined()
      expect((await run('status')).text).toContain('OFF')

      expect((await run('on')).text).toContain('armed')
      const held = $.tool.call(bash('rm -rf src'))
      await clock.settle()
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeDefined()
      await band.press({ key: 'block' })
      await clock.advance(250)
      expect(await held).toMatchObject({ deny: expect.any(String) })
      expect(seen.opened).toBe(0)
      await band.unmount()
    })
    test(`the hold file is written while it holds and removed after run, block and allow, on ${surface}`, async ($, on) => {
      const { clock, seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, MAIN_SCREEN)
      // session.start clears a hold file a dead module left behind.
      expect(seen.removed).toEqual([RM])

      for (const [i, key] of (['run', 'block', 'allow'] as const).entries()) {
        const held = $.tool.call(bash(`git reset --hard HEAD~${i + 1}`))
        await clock.settle()
        expect(seen.writes.length).toBe(i + 1)
        expect(seen.writes[i]?.path).toBe(HOLD_FILE)
        expect(JSON.parse(seen.writes[i]?.text ?? '')).toEqual({
          version: 1,
          sessionId: 'sess-1',
          project: 'shop',
          cwd: CWD,
          account: 'a',
          what: `git reset --hard HEAD~${i + 1}`,
          heldAt: expect.any(Number),
        })
        expect(seen.removed.length).toBe(i + 1)
        await band.press({ key })
        await clock.advance(250)
        expect(await held).toMatchObject(key === 'block' ? { deny: expect.any(String) } : { result: 'ran' })
        expect(seen.removed.length).toBe(i + 2)
        expect(seen.removed[i + 1]).toBe(RM)
      }
      // No yellow warning line, ever.
      expect(seen.statuses).toBe(0)
      await band.unmount()
    })

    test(`after 10 minutes with no answer the call is denied with carry on, on ${surface}`, { timeoutMs: 60_000 }, async ($, on) => {
      const { clock, seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, MAIN_SCREEN)

      const held = $.tool.call(bash('git push --force origin main'))
      await clock.settle()
      await clock.advance(9 * 60 * 1000)
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeDefined()
      await clock.advance(60 * 1000 + 500)
      expect(await held).toEqual({ deny: CARRY_ON })
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeUndefined()
      expect(seen.ran).toEqual([])
      expect(seen.removed).toEqual([RM, RM])
      expect(seen.pushed.length).toBe(1)
      await band.unmount()
    })

    test(`two holds at once wait in turn, one push and one hold file each, on ${surface}`, async ($, on) => {
      const { clock, seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, MAIN_SCREEN)

      const first = $.tool.call(bash('rm -rf src'))
      const second = $.tool.call(bash('git stash clear'))
      await clock.settle()
      expect(seen.pushed).toEqual(['Claude needs approval: delete a folder: src'])
      expect(seen.writes.length).toBe(1)
      expect(await band.find({ type: 'Text', text: 'rm -rf src' })).toBeDefined()
      expect(await band.find({ type: 'Text', text: 'git stash clear' })).toBeUndefined()

      // Blocking the first answers only the first; the second then shows with its own id.
      await band.press({ key: 'block' })
      await clock.advance(250)
      expect(await first).toMatchObject({ deny: expect.stringContaining('rm -rf') })
      await clock.advance(250)
      expect(await band.find({ type: 'Text', text: 'git stash clear' })).toBeDefined()
      expect(seen.pushed).toEqual(['Claude needs approval: delete a folder: src', 'Claude needs approval: drop stashed work'])
      expect(seen.writes.length).toBe(2)
      expect(seen.ran).toEqual([])

      await band.press({ key: 'run' })
      await clock.advance(250)
      expect(await second).toMatchObject({ result: 'ran' })
      expect(seen.ran).toEqual(['git stash clear'])
      expect(seen.removed).toEqual([RM, RM, RM])
      await band.unmount()
    })

    test(`push off sends no push but still holds, on ${surface}`, { options: { push: false } }, async ($, on) => {
      const { clock, seen } = engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const band = await mountBand($, MAIN_SCREEN)

      const held = $.tool.call(bash('rm -rf src'))
      await clock.settle()
      expect(await band.find({ type: 'Text', text: /RED BUTTON/ })).toBeDefined()
      expect(seen.pushed).toEqual([])
      await band.press({ key: 'block' })
      await clock.advance(250)
      expect(await held).toMatchObject({ deny: expect.any(String) })
      await band.unmount()
    })

    test(`/redbutton lists the session allows under [a], on ${surface}`, async ($, on) => {
      engine(on)
      await $.session.start({ surface, isInteractive: true, cwd: CWD } as any)
      const listed = await $.command.run({ command: 'redbutton', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as any)
      expect(listed.text).toContain('Allowed for this session with [a]:')
      expect(listed.text).not.toContain('[3]')
    })
  }

  // The kit's `$` has no clock, shell or files, and cannot raise a person's or the
  // engine's pane close, so these drive the exported hold with a small engine of their own.
  test('Esc blocks and the hold file goes; a later Esc keeps the first choice; a plugin close answers nothing', async () => {
    const fake = fakeEngine()
    const risk = mustHold('rm -rf src')

    let isAnswered = false
    const first = holdCall(fake.$, risk, new AbortController().signal).then(choice => {
      isAnswered = true
      return choice
    })
    await fake.tick()
    expect(fake.writes).toEqual([HOLD_FILE])
    await paneClosed(fake.$, 'plugin')
    await fake.tick()
    expect(isAnswered).toBe(false)
    await paneClosed(fake.$, 'person')
    await fake.tick()
    expect(await first).toBe('escape')
    expect(denial(risk, 'escape')).toBe('Nebi blocked this with Red Button (rm -rf outside /tmp). Ask before trying another route.')
    expect(fake.removed).toEqual([RM])

    // The first answer stands: an Esc after it changes nothing (a press answers through the same path).
    const second = holdCall(fake.$, risk, new AbortController().signal)
    await fake.tick()
    await paneClosed(fake.$, 'unload')
    await paneClosed(fake.$, 'person')
    await fake.tick()
    expect(await second).toBe('unloaded')
    expect(fake.removed).toEqual([RM, RM])
  })

  test('a dialog the engine unloads denies at once and tells Claude to carry on', async () => {
    const fake = fakeEngine()
    const risk = mustHold('git branch -D old')

    const held = holdCall(fake.$, risk, new AbortController().signal)
    await fake.tick()
    await paneClosed(fake.$, 'unload')
    await fake.tick()
    expect(await held).toBe('unloaded')
    expect(denial(risk, 'unloaded')).toBe(
      "Red Button's dialog closed before Nebi answered (git branch -D). Skip this step, carry on with the rest, and put the exact command in your ❓ line.",
    )
    expect(denial(risk, 'timeout')).toBe(CARRY_ON)
    expect(fake.removed).toEqual([RM])
  })

  test('an interrupt ends a hold that is showing and one still queued, and cleans up', async () => {
    const fake = fakeEngine()
    const risk = mustHold('rm -rf src')
    const showing = new AbortController()
    const queued = new AbortController()

    const first = holdCall(fake.$, risk, showing.signal)
    await fake.tick()
    const second = holdCall(fake.$, risk, queued.signal)
    await fake.tick()
    expect(fake.writes).toEqual([HOLD_FILE])
    expect(fake.pushes).toBe(1)

    queued.abort()
    await fake.tick()
    expect(await second).toBe('interrupted')
    // The queued one never held: no file and no push of its own.
    expect(fake.writes).toEqual([HOLD_FILE])
    expect(fake.removed).toEqual([])

    showing.abort()
    await fake.tick()
    expect(await first).toBe('interrupted')
    expect(fake.removed).toEqual([RM])
    expect(fake.pushes).toBe(1)

    // Nothing is left busy: the next hold shows at once.
    const third = holdCall(fake.$, risk, showing.signal)
    await fake.tick()
    expect(await third).toBe('interrupted')
    expect(fake.writes).toEqual([HOLD_FILE, HOLD_FILE])
  })
})

function mustHold(command: string) {
  const risk = classifyCall('Bash', { command }, CWD)
  if (risk === null) throw new Error(`${command} should hold`)
  return risk
}

/** Just enough of the engine for `holdCall`: a clock, sleeps the test releases, files, state. */
function fakeEngine() {
  const now = 1_000_000
  let sleepers: (() => void)[] = []
  const values = new Map<string, { value: unknown; version: number }>()
  const fake = {
    writes: [] as string[],
    removed: [] as string[],
    pushes: 0,
    /** Releases every sleep and lets the holds run until they sleep again. */
    tick: async () => {
      for (let round = 0; round < 3; round += 1) {
        const waiting = sleepers
        sleepers = []
        for (const wake of waiting) wake()
        for (let i = 0; i < 50; i += 1) await Promise.resolve()
      }
    },
    $: {} as any,
  }
  const key = (ref: { plugin: string; key: string }) => `${ref.plugin}.${ref.key}`
  fake.$ = {
    clock: { now: async () => now },
    env: { get: async (name: string) => (name === 'HOME' ? '/Users/nebi' : undefined) },
    session: { id: async () => 'sess-1', cwd: async () => CWD },
    fs: {
      write: async (path: string) => {
        fake.writes.push(path)
      },
    },
    process: {
      run: async (argv: readonly string[]) => {
        if (argv[0] === 'sleep') await new Promise<void>(wake => sleepers.push(wake))
        if (argv[0] === 'rm') fake.removed.push(argv.join(' '))
        return ok()
      },
    },
    state: {
      get: async (ref: { plugin: string; key: string }) => values.get(key(ref)) ?? { value: undefined, version: 0 },
      set: async (ref: { plugin: string; key: string }, value: unknown) => {
        const version = (values.get(key(ref))?.version ?? 0) + 1
        values.set(key(ref), { value, version })
        return { isSet: true, version }
      },
    },
    tool: {
      call: async () => {
        fake.pushes += 1
        return { result: 'sent' }
      },
    },
    ui: { open: async () => ({ isPlaced: false, reason: 'narrow' }), close: async () => undefined, log: () => undefined },
  }
  return fake
}
