# Independent Review of the Nebi Claude Code Setup

## 1. Verdict

This is a disciplined, empirically grounded Claude Code operating setup—far stronger than most public dotfile packs—because its hooks, lean sub-agents, mod contract, deployer preflight, and 168-test offline suite trace directly to real logged failures rather than prompt folklore. Its weakest spots are concrete, fixable bugs in the safety layer (multiline heredoc and quote-scanner bypasses in `nebi-red-button`, `nebi-session-guard`, and `kill-guard.mjs`; git option injection in `upstreams.mjs`; destructive path handling in `nebi-mod-verify`), live hook-vs-mod and doc-vs-doc contradictions (`steer-channel.mjs` vs `nebi-browser`, `CLAUDE.md` Mythos/Fable exception, `output-styles/nebi.md` status templates, `nebi-orchestration` vs `codex-browser`), and structural context overhead (a 19.8k-char `CLAUDE.md` loading into every custom sub-agent and an over-broad `rules/writing.md` glob). Because `bypassPermissions` is backed purely by regex classifiers rather than Claude Code's native OS Bash sandbox and `permissions.deny` rules, every parser bypass carries full host blast radius. Fix the parser/hook bugs and contradictions first, then layer native sandboxing and trim `CLAUDE.md` by ~25–30%.

## 2. Vibe

The setup feels battle-tested and coherent at the top level: a fresh agent immediately understands the core contract (§0 obedience, §3b honest deviation reporting, §5 surgical scope, §6 fresh-evidence proof, standalone status lines). Where it feels heavy or self-contradicting is the seam between layers accumulated over four months of patches. Half of `CLAUDE.md` sits in two sprawling sections (§1 Roles at 34.4% and §10 Hunt for skills at 15.6%) that mix standing posture with dated telemetry, CLI probe trivia, and occasional rubrics, while §3 repeats `output-styles/nebi.md`. Several older guards (Codex parity checks, two-account routing, two-key skill frontmatter validation, regex safety hooks) have started fighting newer capabilities (parked Codex, the third Team account, `codex-browser`, Mythos, and Claude Code's native sandboxing/hook/frontmatter features).

## 3. Findings Table (Ranked)

| ID | Severity | Confidence | Location | Issue (one line) | Fix (one line) |
|---|---|---|---|---|---|
| F01 | high | high | `mods/nebi-red-button/hooks/classify.ts:95,289`, `mods/nebi-session-guard/hooks/classify.ts:23,153` | Heredoc scanner matches `<<word` inside arithmetic, comments, or quotes and blinds all following lines. | Match `<<` only outside quotes, `#` comments, and `$((...))`, and ignore unclosed heredocs. |
| F02 | high | high | `claude-home/hooks/kill-guard.mjs:21,84,98-99,106` | Three `pkill` bypasses (apostrophe in double quotes, backticks, `/usr/bin/pkill`) plus false-positive blocks on `2>&1` / `> /dev/null`. | Replace chained regex masking with a single quote/escape scanner, allow path-prefixed `pkill`, and strip redirections. |
| F03 | high | high | `claude-home/nebi/upstreams.mjs:71,260-261` | Untrusted `skills-lock.json` `entry.ref` passes unvalidated to `git fetch`, enabling `--upload-pack=...` option injection. | Validate `ref` against a strict ref regex (no leading `-`), pass `--` where supported, and reject `/` or `..` in skill names. |
| F04 | high | high | `mods/nebi-browser/hooks/register.tsx:119,170`, `claude-home/hooks/steer-channel.mjs:26,77` | `steer-channel.mjs` denies `select_browser` switches that `nebi-browser` explicitly allowed via `NAMES_A_BROWSER` or `switchGate`. | Align `steer-channel.mjs` with `NAMES_A_BROWSER` and post-refusal replies (or yield when `nebi-browser` is active and not killed). |
| F05 | high | high | `claude-home/CLAUDE.md:40,42,47,123` | Unbounded Mythos standing permission paired with Fable stand-in re-opens the Fable ban and conflicts with §5 escalation. | Scope Mythos triggers explicitly, require confirmation before Fable stand-in (or restrict it to explicit Mythos requests), and move probe steps to `nebi-orchestration`. |
| F06 | high | high | `claude-home/output-styles/nebi.md:16,21` | `⏳ Working` template asks for `; whether input is needed`, contradicting line 21 and suppressing `❓ Need you` + `PushNotification`. | Change line 16 to ``⏳ Working — <what's still running; no input needed>``. |
| F07 | high | high | `claude-home/agents/nebi-{builder,checker,scout}.md:1-9`, `claude-home/CLAUDE.md:93,97,106` | Full 19.8k-char `CLAUDE.md` loads into all 3 custom sub-agents (~50% of scout/checker startup), colliding with their contracts. | Scope `CLAUDE.md` to the lead session in its preamble and benchmark `omitClaudeMd: true` on `nebi-scout`/`nebi-checker`. |
| F08 | high | high | `claude-home/skills/nebi-mod-verify/scripts/capture.mjs:52,74,79,83,99,251,255`, `check.mjs:18,40-44,69` | `nebi-mod-verify` can wipe arbitrary `--out` dirs, snapshots/restores wrong account's `settings.json`, and silently skips `session.full.txt`, leaked beacons, and orphaned `claude`. | Guard `OUT`/`LABEL`, use per-run temp `DEMO`/`chrome-profile`, pass child `env` to `settingsFiles()`, check `session.full.txt` + `meta.exit`, and signal process groups. |
| F09 | high | high | `mods/nebi-red-button/hooks/register.tsx:177,179`, `mods/CONTRACT.md:37` | `nebi-red-button` ignores `NEBI_VERIFY=1`, writing hold files and firing `PushNotification` during verification runs. | Add memoised `NEBI_VERIFY === '1'` check in `nebi-red-button` to skip `writeHoldFile` and `PushNotification`. |
| F10 | high | high | `claude-home/skills/nebi-orchestration/SKILL.md:58`, `codex-browser/SKILL.md:8`, `capability-routing.md:26,28` | `nebi-orchestration` bans sub-agent "tabs" against `codex-browser`; `capability-routing.md:26` mandates `select_browser`/stop on mismatch against `:28`. | Narrow `nebi-orchestration:58` to terminal tabs/sessions and scope `capability-routing.md:26` explicitly to Claude in Chrome. |
| F11 | medium | high | `claude-home/rules/writing.md:2-4,11,23` | `paths: ["**/*.{md,mdx,html,htm,txt}"]` fires marketing/CTA/`stop-slop` rules on engineering docs and HTML artifacts while missing code-embedded copy. | Restrict `paths:` to content/copy/template directories and `.mdx`, and explicitly exclude internal docs, prompts, and reports. |
| F12 | medium | high | `mods/nebi-receipt/hooks/parts.ts:35-36`, `nebi-model-lock/hooks/register.tsx:44,77`, `nebi-red-button/hooks/classify.ts:389,399,641,669` | `nebi-receipt` rejects `node scripts/verify.mjs`; `nebi-model-lock` lets old role locks override `"all agents on X"`; `nebi-red-button` misses multi-refspec push, `--git-dir`, camelCase MCP, and `$d/foo/..`. | Fix `CHECK` lookarounds for `.mjs`/`--verify`; clear role locks when `named.all` sets; scan all push refspecs, `--git-dir`, camelCase MCP names, and `..` segments. |
| F13 | medium | high | `claude-home/nebi/route.mjs:12,18,20,50-52`, `mods/nebi-beacon/hooks/route.ts:80-82`, `nebi-session-guard/hooks/classify.ts:32`, `deploy.mjs:61` | Third Team account (`claude-team`) is unsupported in routing, session-guard, and `deploy.mjs`; all 3 mods' `route.ts` dropped `codexBrowserId`. | Add Team account support across route/session-guard/deploy (or document its intentional absence) and sync `codexBrowserId` into `mods/*/hooks/route.ts` + `route-vectors.ts`. |
| F14 | medium | high | `scripts/check-pack.mjs:22-23,52-56`, `claude-home/CLAUDE.md:29,61` | `check-pack.mjs` enforces parked Codex date/section parity (freezing `CLAUDE.md` at `2026-10-03`) and blocks Claude Code skill frontmatter fields. | Skip Codex parity checks while Codex is parked, bump `CLAUDE.md:29`, and allow standard Claude Code skill frontmatter keys in `check-pack.mjs`. |
| F15 | medium | high | `AGENT-FAILURES.md:59,101,227`, `CLAUDE.md:78,133`, `.agents/skills/single-agent-loop/SKILL.md:210,231-236` | Three `AGENT-FAILURES.md` fixes (#2 resume cap, #5 lead visual checks, #16 secret redaction) are absent from `CLAUDE.md`/agents; untracked `.agents/skills/single-agent-loop/SKILL.md` has corrupted `Codex` rewrites. | Add the three missing one-liners to `CLAUDE.md` / `nebi-checker.md` and remove (or symlink) the corrupted `.agents/skills/single-agent-loop/` copy. |
| F16 | medium | high | `claude-home/hooks/verify-before-stop.mjs:237`, `steer-channel.mjs:29,107-108`, `nebi/term.mjs:32,46`, `deploy.mjs:297,314,635` | `verify-before-stop` skips early-stop nudge after any completed bg task; `steer-channel` races on `STEER.md` and misses prompts >1 MB back; `term.mjs` breaks multi-word args; `deploy.mjs` writes non-atomically and leaves legacy bash/PS sweep hooks. | Check `running === 0`; guard `STEER.md` with `agent_id` + atomic claim rename; shell-quote `term.mjs` argv; atomic-write `settings.json` and match legacy sweep hooks. |
| F17 | medium | medium | `deploy.mjs:645-649,697-715`, `claude-home/CLAUDE.md:75,93-97,159-166`, `README.md:53,116`, `SOURCES.md:41,44` | `bypassPermissions` lacks native Bash sandboxing and credential `permissions.deny`; hooks use shell strings instead of exec form; `CLAUDE.md`, `README.md`, and `SOURCES.md` carry bloat and drift. | Enable native Seatbelt sandboxing + secret `permissions.deny` + exec-form hooks (`command` + `args`), trim ~5k chars from `CLAUDE.md`, and refresh `README.md`/`SOURCES.md`. |
| F18 | low | high | `nebi-sessions/SKILL.md:3,70`, `nebi-maintenance/evals/evals.json:47`, `reliability-checklist.md:7,81,88`, `run-trigger-evals.mjs:242`, `tikhub/SKILL.md:11,36` | Walk-away guidance unreachable in `nebi-sessions`; maintenance evals expect dual-harness Codex installs; checklist loops unwired; headless trigger runner drops `codex-browser`/`tikhub`; `tikhub` hardcodes external path + private APIs. | Add walk-away trigger clause, update maintenance evals for parked Codex, wire checklist upkeep + R15, stage all skills in `run-trigger-evals.mjs`, and quote/cap `tikhub`. |

## 4. Finding Details

### F01. Heredoc scanner in `nebi-red-button` and `nebi-session-guard` lets any `<<word` blind all following lines
- **Location:** `mods/nebi-red-button/hooks/classify.ts:95,289` and `mods/nebi-session-guard/hooks/classify.ts:23,153`
- **Quote:**
  - `mods/nebi-red-button/hooks/classify.ts:95`: `const HEREDOC = /<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/`
  - `mods/nebi-red-button/hooks/classify.ts:289`: `const match = HEREDOC.exec(line)`
  - `mods/nebi-session-guard/hooks/classify.ts:23,153`: identical `HEREDOC` regex and `HEREDOC.exec(line)` loop.
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** `splitHeredocs` scans each raw line without skipping single/double quotes, `#` comments, or `$((...))` arithmetic. Any multiline Bash script containing `<<word` on an earlier line swallows all remaining lines into a heredoc body owned by a non-shell command. Reproduced live with `classifyCall`: both ``echo $((1 << n))\nrm -rf ~/Documents`` and ``# note <<EOF\nrm -rf ~/Documents`` return `null`, completely bypassing Red Button and Session Guard.
- **Smallest concrete change:** Only recognize `<<` outside single/double quotes, `#` comments, and `$((...))` arithmetic; require a word boundary/separator after the delimiter; and if no closing terminator line appears before EOF, treat it as non-heredoc so it cannot swallow the script.
- **What could break:** A malformed script with an intentionally unclosed heredoc whose body mentions `rm -rf` would start triggering a hold.

### F02. `kill-guard.mjs` has three `pkill` bypasses and false-positive blocks standard redirections
- **Location:** `claude-home/hooks/kill-guard.mjs:21,84,98-99,106`
- **Quote:**
  - `:21`: `const SEPARATORS = new Set([';', '&', '|', '\n', ')', '\`']);`
  - `:84`: `const broad = patterns.find((p) => p.replace(/[\^$]/g, '').length < 5 || SHARED_NAMES.test(p.replace(/[\^$]/g, '')));`
  - `:98-99`: `.replace(/'[^']*'/g, blank)` / `.replace(/"(?:[^"\\]|\\.)*"/g, (q) => (q.includes('$(') ? q : blank(q)));`
  - `:106`: `const re = feedsKill ? /(^|[\s;&|(\`"])(sudo\s+)?(pkill|pgrep)(?=\s)/g : /(^|[\s;&|(\`"])(sudo\s+)?(pkill)(?=\s)/g;`
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** Five cases were reproduced live against `check()`:
  1. Single-quote masking runs before double-quote masking: `echo "don't" && pkill -f cat && echo "can't"` blanks `pkill -f cat` and returns `null`.
  2. Backticks inside double quotes are blanked: ``echo "`pkill -f cat`"`` returns `null`.
  3. Path-prefixed binaries bypass `re`: `/usr/bin/pkill -f cat` returns `null`.
  4. Redirections are tokenized as pattern arguments: `pkill -f "my-specific-server.mjs" 2>&1` is blocked as `pattern "2>" is too broad`, and `pkill -f "my-specific-server.mjs" > /dev/null` is blocked as `pattern ">" is too broad`.
- **Smallest concrete change:** Replace chained `.replace()` calls in `maskQuoted` with one left-to-right quote/escape/heredoc scanner that preserves both `$(` and backticks inside double quotes; allow optional `(?:\\|(?:[\w./-]+\/))?` before `(pkill|pgrep)` (and backtick `kill \`pgrep ...\`` in `feedsKill`); strip shell redirections before `problemWith()`.
- **What could break:** Literal backticked `pkill` inside a double-quoted prose string (for example a git commit message) could be scanned as code; verify against `tests/kill-guard.test.mjs`.

### F03. Git option injection from untrusted project `skills-lock.json` in `upstreams.mjs`
- **Location:** `claude-home/nebi/upstreams.mjs:71,260-261`
- **Quote:**
  - `:71`: `git(dir, 'fetch', '-q', '--depth=1', '--filter=blob:none', 'origin', ref);`
  - `:261`: `pin: entry.ref, installed: places.filter((p) => fs.existsSync(p)).map(tilde),`
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** `projectLocks()` automatically walks `~/Documents/GitHub/*/*/skills-lock.json` across cloned repositories. `entry.ref` passes straight into `git fetch ... origin <ref>` without `--` or character validation. Because `git fetch` accepts flags after positional args, a malicious `ref` such as `--upload-pack=<cmd>` executes arbitrary commands during what `README.md:62` describes as a read-only check. `name` in line 258 is also joined into paths without rejecting `..` or `/`.
- **Smallest concrete change:** Validate `ref` against `/^(?:HEAD|[0-9a-f]{7,40}|[A-Za-z0-9._/@][A-Za-z0-9._/@-]*)$/` (rejecting any leading `-` or whitespace) before `fetchCommit`, pass `'--'` before refspecs where git accepts it, and reject skill names containing `/` or `..`.
- **What could break:** A malformed lockfile with a ref starting with `-` will report a pin error instead of invoking `git fetch`.

### F04. Live hook-vs-mod contradiction: `steer-channel.mjs` denies `select_browser` switches that `nebi-browser` allows
- **Location:** `mods/nebi-browser/hooks/register.tsx:119,170` vs `claude-home/hooks/steer-channel.mjs:26,77`
- **Quote:**
  - `nebi-browser/hooks/register.tsx:119`: ``return `This project uses ${named(r)}. Call select_browser with deviceId ${r.deviceId} instead. If Nebi wants another browser, ask him in one plain sentence: his reply lets you switch.` ``
  - `nebi-browser/hooks/register.tsx:170`: `if (switchGate === 'asked' || NAMES_A_BROWSER.test(e.text)) switchGate = 'open'`
  - `steer-channel.mjs:77`: `try { isPairingAsked = ASKS_TO_PAIR.test(latestOwnPrompt(input.transcript_path)); } catch { /* unread: stay strict */ }`
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** Both `nebi-browser` (mod `tool.call`) and `steer-channel.mjs` (settings `PreToolUse`) run on every Claude in Chrome call. `nebi-browser` opens its gate when Nebi names a browser (`"do it in my main chrome"`, `"nope wrong browser"`) or replies after a refusal (`switchGate === 'asked'`). `steer-channel.mjs` only checks `ASKS_TO_PAIR` (`pair`/`switch`/`rename`), which matches none of those replies, so `steer-channel.mjs` blocks the exact call `nebi-browser` just allowed.
- **Smallest concrete change:** Port `NAMES_A_BROWSER` into `steer-channel.mjs` and recognize a human reply following a browser-route refusal in the transcript—or skip `browserDenial` in `steer-channel.mjs` when `nebi-browser@nebi-mods` is enabled and not disabled by `NEBI_MODS_OFF`.
- **What could break:** Skipping `browserDenial` purely on `enabledPlugins` would leave browser switching unguarded if `nebi-browser` failed to load; mirroring the `NAMES_A_BROWSER` rule in `steer-channel.mjs` preserves the no-mod fallback safely.

### F05. `CLAUDE.md` Mythos standing permission + Fable stand-in re-opens the Fable ban and conflicts with §5
- **Location:** `claude-home/CLAUDE.md:40,42,47,123`
- **Quote:**
  - `:40`: `Only Opus 5.5 and Sonnet 5.5 are in use: default to Opus 5.5, move work to Sonnet 5.5 when I say usage is low, and don't use Haiku or Fable unless I name them or Fable stands in for Mythos (below).`
  - `:42`: `**Mythos is the exception.** When the account you run on has Mythos access (the team account does; another Claude account may), never hold back from Mythos sub-agents for improving any project, and treat this line as standing permission to run a workflow for them. ... With access, it is the bigger model in §5's order: use it there instead of asking me.`
  - `:47`: `- Without access, Fable stands in wherever Mythos would be used (the same model with extra safeguards); say so once.`
  - `:123`: `after two failed attempts at the same thing, change something before a third, in this order: ... then tell me a bigger model is the next step.`
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** `"never hold back from Mythos sub-agents for improving any project"` has no trigger boundary separating Opus 5.5 from Mythos—and line 5 makes `"never"` a hard limit. On accounts without Mythos access, combining line 42 (`"standing permission"`) with line 47 (`"Fable stands in wherever Mythos would be used"`) authorizes unasked Fable workflow dispatches, defeating line 40's Fable ban (`single-loop/FINDINGS.md:8` logs 56 dispatches hitting Fable usage limits) and contradicting §5's `"tell me"`. Line 44 also gives no command to discover `<version>` (`claude-mythos-<version>`), inviting the exact guesswork probes it warns against.
- **Smallest concrete change:** Define explicit triggers for Mythos (for example §5 two-attempt escalations, deep audits, or explicit improvement requests), clarify on line 47 that Fable stand-in still requires asking unless the user requested Mythos or an improvement pass, and move the CLI ID lookup/probe runbook into `nebi-orchestration`.
- **What could break:** Agents will become less eager to launch unprompted Mythos workflows on ordinary tasks until the task hits a stated trigger or the user asks.

### F06. Direct contradiction inside `output-styles/nebi.md` on `⏳ Working` vs `❓ Need you`
- **Location:** `claude-home/output-styles/nebi.md:16,21`
- **Quote:**
  - `:16`: ``- `⏳ Working — <what's still running; whether input is needed>` ``
  - `:21`: `Anything the user must do is ❓ Need you, even while other work keeps running. The first time you end with ❓ Need you on a given question, also send that line with the PushNotification tool so it reaches the user's phone`
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** Line 16 instructs the model to write `; whether input is needed` inside a `⏳ Working` status line, implying `⏳ Working` is valid when user input is required. That contradicts line 21 and suppresses both `❓ Need you` beacon detection (`nebi-beacon`, `statusline.mjs`) and `PushNotification`.
- **Smallest concrete change:** Change line 16 to ``- `⏳ Working — <what's still running; no input needed>` `` (or ``- `⏳ Working — <what's still running>` ``).
- **What could break:** Nothing; verify no test matches the old placeholder text verbatim.

### F07. 19.8k-char `CLAUDE.md` loads into all three custom sub-agents, colliding with their contracts and inflating startup context
- **Location:** `claude-home/agents/nebi-builder.md:1-9`, `nebi-checker.md:1-9`, `nebi-scout.md:1-9` vs `claude-home/CLAUDE.md:93,97,106`
- **Quote:**
  - `nebi-builder.md:9`: `End DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED with the deliverable, changed files, the check's result, and any concern.`
  - `nebi-checker.md:4,9`: `tools: Read, Grep, Glob` / `End DONE or DONE_WITH_CONCERNS and name what was not checked.`
  - `CLAUDE.md:93,97,106`: ``Every reply ends with a status line: `✅ Done`, `⏳ Working`, or `❓ Need you` `` / `put it in an HTML page (an Artifact in Claude Code)` / ``add one line to `~/.claude/nebi/failure-log.md`.``
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** Per `code.claude.com/docs/en/sub-agents`, custom sub-agents load user and project `CLAUDE.md` unless `omitClaudeMd: true` is set. None of the three `nebi-*` agents set it, so `CLAUDE.md` (19,830 chars, ~5k tokens) accounts for roughly half of `nebi-scout`/`nebi-checker`'s 10–11k startup context (`CLAUDE.md:75`, `single-loop/PLAN.md:19`) and injects rules that directly contradict sub-agent contracts (`✅ Done` vs `DONE`, HTML Artifacts on read-only agents, writing `failure-log.md` outside `nebi-builder`'s write scope). Separately, `nebi-checker.md:9` omits `NEEDS_CONTEXT` / `BLOCKED` even though it lacks `Bash` to run `git diff` if the lead forgets to supply the diff.
- **Smallest concrete change:** Add one scoping sentence in `CLAUDE.md` preamble (`"This doctrine governs the lead session; custom sub-agents follow their own system prompt and the lead's brief."`), add `NEEDS_CONTEXT` / `BLOCKED` to `nebi-checker.md:9`, and benchmark `omitClaudeMd: true` on `nebi-scout` and `nebi-checker` in `single-loop`.
- **What could break:** The preamble line and `nebi-checker` exit codes have negligible risk. Setting `omitClaudeMd: true` also omits **project** `CLAUDE.md` files, so leads must point scouts/checkers at a repo's `CLAUDE.md` when repo conventions matter—hence benchmark it before enabling.

### F08. `nebi-mod-verify` scripts have destructive `--out` deletion, wrong-account `settings.json` restore, and three silently unchecked failure modes
- **Location:** `claude-home/skills/nebi-mod-verify/scripts/capture.mjs:52,74,79,83,99,251,255`, `check.mjs:18,40-44,69,73-76`, `pty_bridge.py:21,25`, `render.mjs:146,150`
- **Quote:**
  - `capture.mjs:52,79`: `const OUT = resolve(opts.out || join(CACHE, 'runs', LABEL))` / `rmSync(OUT, { recursive: true, force: true })`
  - `capture.mjs:83,99`: `for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_')) delete env[k]` / `const SETTINGS = snapshotSettings(settingsFiles(os.homedir()))`
  - `capture.mjs:251,255`: `writeFileSync(join(OUT, 'session.full.txt'), fullText(term))` / `execFileSync('pgrep', ['-fl', DEMO], ...)`
  - `check.mjs:18,40-44,69`: `const SCENES = ['turn-end', 'mid-turn']` / `export function enabledNebiMods(settingsFile) { try { ... } catch { return [] } }` / `enabledNebiMods(join(meta.configDir ?? join(process.env.HOME, '.claude'), 'settings.json'))`
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** Five verified defects compound here:
  1. Passing `--out .`, `--out /tmp`, or `--label ..` recursively wipes an arbitrary directory (violating `reliability-checklist.md` R10); shared `DEMO` and `chrome-profile` (`render.mjs:146`) also collide if baseline and after run in parallel.
  2. `capture.mjs:83` strips `CLAUDE_CONFIG_DIR` from the child, yet line 99 calls `settingsFiles(os.homedir())` without passing `env`, so it snapshots the parent's `CLAUDE_CONFIG_DIR/settings.json` (Account B) and can non-atomically overwrite legitimate Account B edits made during the capture; `process.on('exit')` also misses `SIGINT`/`SIGTERM`.
  3. `check.mjs` never reads `session.full.txt` (leaving turn-2 finish clutter unchecked despite `SKILL.md:34`), never fails on `meta.exit.newBeaconsStillPresent` / `leftoverProcs` / `forcedKill`, and swallows `settings.json` parse errors as `[]` (passing with 0 mods checked) while crashing if `process.env.HOME` is unset.
  4. `pty_bridge.py` `chdir`s to `DEMO` and `execvp`s `claude`, so `DEMO` is never in `claude`'s argv—making `pgrep -fl DEMO` blind to orphaned `claude` processes, which `capture.mjs:247` creates when `SIGKILL` kills only `pty_bridge.py` (`pty_bridge.py:25` signals `pid`, not process group `-pid`).
  5. `guards.mjs:57` keeps only line 1 of a multi-line dialog header in `title`, which can mis-handle a two-line Bypass Permissions warning, and `render.mjs:150` lacks `chrome.on('error')`.
- **Smallest concrete change:** Validate `LABEL` (`^[A-Za-z0-9._-]+$`), restrict `rmSync(OUT)` to `CACHE/runs` or folders containing `meta.json`, allocate per-run temp dirs for `DEMO`/`chrome-profile`, pass `env` to `settingsFiles(os.homedir(), env)` with atomic restore + `SIGINT`/`SIGTERM` handlers, assert `session.full.txt` and `meta.exit` in `check.mjs` (using `os.homedir()` and failing on unreadable `settings.json` when `!safeMode`), signal `os.killpg(pid, sig)` in `pty_bridge.py`, and `pgrep -fl SESSION_ID`.
- **What could break:** Passing `--out` to a non-empty folder without `meta.json`, or runs that leak a turn-2 clutter string or force-kill `/exit`, will now fail explicitly instead of silently passing.

### F09. `nebi-red-button` violates `mods/CONTRACT.md` by ignoring `NEBI_VERIFY=1`
- **Location:** `mods/nebi-red-button/hooks/register.tsx:177,179` vs `mods/CONTRACT.md:37`
- **Quote:**
  - `mods/CONTRACT.md:37`: `Verification sessions (env NEBI_VERIFY=1, launched by nebi-mod-verify with pushes and Remote Control off) never push and never write a beacon or hold file; they still draw.`
  - `mods/nebi-red-button/hooks/register.tsx:177,179`: `file = await writeHoldFile($, risk)` / `if (isPushOn) void $.tool.call({ tool: 'PushNotification', message: clean(\`Claude needs approval: ${risk.short}\`, 190), status: 'proactive' }).catch(() => undefined)`
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** `NEBI_VERIFY` is respected by `nebi-beacon` and `verify-before-stop.mjs`, but is never checked anywhere in `nebi-red-button`. Any hold during a `nebi-mod-verify` session writes `<sessionId>.hold.json` (tripping live peer statuslines/toasts) and sends a push.
- **Smallest concrete change:** Add a memoised `isVerify($)` helper (matching `nebi-beacon/hooks/register.tsx:72-76`) and skip `writeHoldFile` and `PushNotification` when `NEBI_VERIFY === '1'`.
- **What could break:** Nothing; add a regression test in `mods/nebi-red-button/tests/red-button.test.ts`.

### F10. Cross-skill contradictions on browser routing and sub-agent tabs
- **Location:** `claude-home/skills/nebi-orchestration/SKILL.md:58` vs `claude-home/skills/codex-browser/SKILL.md:8`; `claude-home/skills/nebi-maintenance/references/capability-routing.md:26` vs `:28`
- **Quote:**
  - `nebi-orchestration/SKILL.md:58`: `Sub-agents never open terminals, tabs, windows or interactive sessions, and never pair or switch a browser. A lane that needs one returns that need to the lead.`
  - `codex-browser/SKILL.md:8`: `so every session and sub-agent can use it at the same time, each with its own tabs`
  - `capability-routing.md:26`: `Use \`select_browser\` with the route's \`deviceId\`; ... When the route names another account (\`mismatch: true\`), stop and ask for the project to be restarted under that account's launcher.`
  - `capability-routing.md:28`: `In Claude Code, \`codex-browser\` is the default controller: ... so it is not tied to a Claude account and needs no \`select_browser\`; pick the browser by \`metadata.extensionInstanceId\`.`
- **Severity:** high | **Confidence:** high | **Type:** verified fact
- **Detail:** `nebi-orchestration:58` bans sub-agents from opening `"tabs"` right next to `"browser"`, directly contradicting `codex-browser` (whose trigger eval explicitly tests three parallel sub-agents opening browser tabs). Meanwhile `capability-routing.md:26` states the Claude in Chrome `select_browser` and `mismatch: true` restart-stop rules unconditionally right before paragraph `:28` makes account-independent `codex-browser` the default (and `codex-browser/evals/evals.json:8` requires no restart and no `select_browser`).
- **Smallest concrete change:** Change `nebi-orchestration/SKILL.md:58` to `"Sub-agents never open terminal tabs, windows, or interactive CLI sessions, and never pair or switch a browser (browser tabs via codex-browser are allowed, with one writer per logged-in account)."` In `capability-routing.md`, lead "Browser ownership" with `codex-browser` as default and scope the `select_browser` / `mismatch: true` stop rule explicitly under `"When using Claude in Chrome"`.
- **What could break:** Scoping `:26` must keep the mismatch stop intact when the user explicitly requests Claude in Chrome.

### F11. `rules/writing.md` fires product-copy/CTA/`stop-slop` rules on every `.md`, `.html`, and `.txt` file while missing code-embedded copy
- **Location:** `claude-home/rules/writing.md:2-4,11,23` vs `claude-home/CLAUDE.md:97,145,163`
- **Quote:**
  - `rules/writing.md:2-4`: `paths:\n  - "**/*.{md,mdx,html,htm,txt}"\n  - "**/{content,copy,marketing,landing}/**"`
  - `rules/writing.md:11,23`: `Any text that goes into my product must not read as AI-generated, and it must have **balance**.` / `apply the \`stop-slop\` skill.`
- **Severity:** medium | **Confidence:** high | **Type:** verified fact
- **Detail:** Because nearly every session reads a `.md`, `.html`, or `.txt` file (`README.md`, `SKILL.md`, `PLAN.md`, HTML Artifacts, test fixtures), this 2,611-char marketing/CTA rule loads near-unconditionally and paired with `CLAUDE.md:163` nudges models to load `stop-slop` on internal engineering files. Conversely, actual product copy in `.tsx`, `.jsx`, `.liquid`, `.vue`, `.svelte`, or i18n `.json` outside folders literally named `content|copy|marketing|landing` never loads `writing.md`.
- **Smallest concrete change:** Narrow `paths:` to content/copy/page/storefront directories (`**/{content,copy,marketing,landing,pages,sections,templates,locales}/**` plus `**/*.mdx`) and add one exclusion line in line 11 (`"Skip this file for internal engineering docs, prompts, handoffs, and HTML reports."`).
- **What could break:** A root-level marketing `index.html` or `copy.md` outside those directories will rely on `CLAUDE.md` §8/§10 instead of auto-loading `writing.md`.

### F12. Logic bugs in `nebi-receipt`, `nebi-model-lock`, and `nebi-red-button` classifiers
- **Location:** `mods/nebi-receipt/hooks/parts.ts:35-36`, `mods/nebi-model-lock/hooks/register.tsx:44,77`, `mods/nebi-red-button/hooks/classify.ts:389,399,641,669`
- **Quote:**
  - `nebi-receipt/hooks/parts.ts:35-36`: `const CHECK = /(?<![\w./-])(test|tests|vitest|jest|pytest|tsc|lint|eslint|validate|build|verify)(?![\w./-])|cargo test|go test|plugin test|\bnode\b[^|;&\n]*\s--test(?![\w-])/`
  - `nebi-model-lock/hooks/register.tsx:44,77`: `return current[roleOf(e.subagentType)] ?? current.all` / `if (hasLock(named)) await setLock($, current => ({ ...current, ...named }))`
  - `nebi-red-button/hooks/classify.ts:389,399,641,669`: `i += option === '-C' || option === '-c' ? 2 : 1` / `const spec = positional[1] ?? ''` / `if (!/^[A-Za-z0-9._-]+$/.test(first) || first === '.' || first === '..' || ROOT_FOLDERS.has(first)) return target` / `const name = (match[2] ?? '').toLowerCase().replace(/-/g, '_')`
- **Severity:** medium | **Confidence:** high | **Type:** verified fact
- **Detail:** All six defects were reproduced live in Node:
  1. `nebi-receipt`: `node scripts/verify.mjs` and `node deploy.mjs --verify` both return `false` from `CHECK` because `(?<![\w./-])` / `(?![\w./-])` reject adjacent `.` and `-`—so this repo's own verification commands print `no check since the last edit` (`ruff check .` and `mypy src/` also miss).
  2. `nebi-model-lock`: saying `"sonnet scouts"` followed later by `"all agents on opus"` leaves `{ scout: 'sonnet', all: 'opus' }`, and `lockedFor` returns `'sonnet'` for `nebi-scout`, silently ignoring `"all agents on opus"`. Also, `lock` does not clear on `session.end` (`/clear`), and `parse.ts:12` omits `mythos`.
  3. `nebi-red-button`: `git push origin main :secret-branch` (only `positional[1]` checked), `git --git-dir /repo/.git push --force` (`--git-dir` not skipped with value), `mcp__gmail__sendEmail` (`.toLowerCase()` runs before splitting camelCase), and `d=$(mktemp -d); rm -rf "$d/foo/.."` (`settled()` checks only the first path segment, not `..` in `rest`) all return `null`.
- **Smallest concrete change:**
  1. Allow script/flag forms in `nebi-receipt` `CHECK` (for example `scripts/verify\.\w+`, `--verify`, `\bruff\b`, `\bmypy\b`, `\bbiome\b`, `\boxlint\b`).
  2. In `nebi-model-lock/hooks/register.tsx:77`, when `named.all` is present without role overrides in the same prompt, replace `current` with `named` (clearing older role-specific locks), and clear `lock` on `session.end` when `e.reason === 'clear'`.
  3. In `nebi-red-button/hooks/classify.ts`, scan `positional.slice(1)` for `+`/`:` refspecs, advance `i += 2` for `--git-dir`/`--work-tree`/`--namespace`/`--config-env`, split camelCase before `.toLowerCase()` in `classifyMcp`, and reject `rest.split('/').includes('..')` in `settled()`.
- **What could break:** Splitting camelCase in `classifyMcp` may start holding camelCase write tools that previously slipped past; clearing role locks on `named.all` changes behavior if someone expects `"all agents on opus"` to preserve an earlier `"sonnet scouts"` override (if they want both, they can say `"all agents on opus, sonnet scouts"` in one prompt, which still works).

### F13. Three-account drift (`claude-team`) and `route.ts` parity gap (`codexBrowserId`)
- **Location:** `claude-home/nebi/route.mjs:12,18,20,50-52`, `mods/nebi-beacon/hooks/route.ts:80-82` (also `nebi-browser`, `nebi-constellation`), `mods/nebi-session-guard/hooks/classify.ts:32`, `claude-home/skills/nebi-sessions/SKILL.md:80`, `deploy.mjs:61`
- **Quote:**
  - `nebi-sessions/SKILL.md:80`: `(\`claude-nebi\` for account a, \`claude-omer\` for b, \`claude-team\` for the Team seat; the project's \`.claude/browser.json\` names its account)`
  - `route.mjs:12,18,20`: `const ACCOUNTS = ['a', 'b'];` / `if (dir.includes('.claude-max2')) return 'b';` / `return path.resolve(expanded) === path.resolve(home, '.claude') ? 'a' : null;`
  - `mods/nebi-beacon/hooks/route.ts:80,82`: `const browser = { label: text(fields.label), chromeProfile: text(fields.chromeProfile), deviceId: text(fields.deviceId) }` / `return browser.label || browser.chromeProfile || browser.deviceId ? browser : null`
  - `nebi-session-guard/hooks/classify.ts:32`: `claude(?:-(?:nebi|omer|profile|a|b))?`
  - `deploy.mjs:61`: `const TARGET_DIR = path.join(HOME, '.claude');`
- **Severity:** medium | **Confidence:** high | **Type:** verified fact
- **Detail:** `CLAUDE.md:42` and `nebi-sessions/SKILL.md:80` document a third Team account (`claude-team`), but routing, statusline, `nebi-session-guard`, and `deploy.mjs` only know accounts `a` and `b` (`~/.claude` and `~/.claude-max2`). On `claude-team`, `currentAccount()` returns `null` (disabling default routes and tripping false mismatches), `nebi-session-guard` misses `"open claude-team"`, and `deploy.mjs` neither deploys to `~/.claude-max2` nor checks `CLAUDE_CONFIG_DIR`. Separately, `route.mjs:50-52` added `codexBrowserId`, but all three mods' `hooks/route.ts` omit it—so a `codexBrowserId`-only `.claude/browser.json` resolves in `route.mjs` and returns `null` in every mod (missed by `tests/route-parity.test.mjs` because `route-vectors.ts` still uses the old fixture).
- **Smallest concrete change:** Add `codexBrowserId` to all three mods' `hooks/route.ts` and `route-vectors.ts`; add `team` to `nebi-session-guard`'s `ASK` regex (`claude-(?:nebi|omer|team|profile|a|b)`); decide and document how `claude-team`'s `CLAUDE_CONFIG_DIR` maps in `route.mjs`/`CONTRACT.md` (and consider `--config-dir` in `deploy.mjs` for non-default accounts).
- **What could break:** Updating `route-vectors.ts` `SHIPPED` fixture requires adding `codexBrowserId` assertions across the 3 mod test suites; adding `team` to `ACCOUNTS` changes `mismatch` behavior for projects explicitly pinned to `a` or `b` when opened from the Team seat.

### F14. `scripts/check-pack.mjs` enforces parked Codex parity and blocks Claude Code skill frontmatter
- **Location:** `scripts/check-pack.mjs:22-23,52-56` vs `claude-home/CLAUDE.md:29,61`
- **Quote:**
  - `CLAUDE.md:29,61`: `Refresh this table and its date when the available models change. Bindings as of **2026-10-03**:` / `**Codex is parked** (no ChatGPT subscription since 2026-10-10). Work Claude-only: ... skip Codex installs, Codex copies and parity checks until I say Codex is back.`
  - `scripts/check-pack.mjs:22-23`: `const entries = fm[1].split(/\r?\n/).filter((line) => line.trim()).map((line) => line.match(/^(name|description): (.+)$/));` / `require(entries.every(Boolean) && entries.length === 2, ...)`
  - `scripts/check-pack.mjs:52-56`: `const cores = ['claude-home/CLAUDE.md', 'codex-home/AGENTS.md']...` / `require(dates.every(Boolean) && new Set(dates).size === 1, 'Harness binding review dates differ or are missing');` / `require(new Set(headings).size === 1, 'Harness core section IDs differ');`
- **Severity:** medium | **Confidence:** high | **Type:** verified fact
- **Detail:** `check-pack.mjs` (run by CI on every `node scripts/verify.mjs`) enforces date and section parity against parked `codex-home/AGENTS.md`—directly violating `CLAUDE.md:61`. That is why `CLAUDE.md:29` still claims `Bindings as of 2026-10-03` even though five of six model rows changed after Oct 3 (`report.md:11,72`). Meanwhile, lines 22–23 reject any skill frontmatter beyond `name` and `description`, preventing skills from using Claude Code's native `disable-model-invocation`, `allowed-tools`, `paths`, `context: fork`, `effort`, or `user-invocable`.
- **Smallest concrete change:** Gate the Codex parity checks in `check-pack.mjs:52-56` (and `deploy.mjs` `reportBindingsParity`) behind a flag or skip them while `CLAUDE.md` marks Codex parked, bump `CLAUDE.md:29`'s date (and add a 1-line `PARKED` banner to `codex-home/AGENTS.md`), and extend `check-pack.mjs:22` to accept Claude Code's documented optional skill frontmatter fields.
- **What could break:** `tests/pack.test.mjs` asserts the current date/section parity and 2-key frontmatter rejection; update those test cases alongside `check-pack.mjs`.

### F15. Three `AGENT-FAILURES.md` fixes are missing from doctrine/agents, and untracked `.agents/skills/single-agent-loop/SKILL.md` is corrupted
- **Location:** `AGENT-FAILURES.md:59,101,227` vs `claude-home/CLAUDE.md:78,133`, `claude-home/agents/nebi-{builder,checker}.md:9`; `.agents/skills/single-agent-loop/SKILL.md:210,231-236`
- **Quote:**
  - `AGENT-FAILURES.md:59`: `"resume a capped builder at most once" on 11-16`
  - `AGENT-FAILURES.md:101`: `Fix: draft every planned piece before polishing any, then polish on data; the lead looks at real screenshots before a deploy; visible changes get proved at the size I actually use.`
  - `AGENT-FAILURES.md:227`: `A checker re-printed a database password in its report. ... Another screenshotted an open token dialog.`
  - `.agents/skills/single-agent-loop/SKILL.md:210,231,236`: `` `.Codex/hillclimb/<name>/` `` / `` `/Codex-api build-eval` `` / `` `/plugin install skill-creator@Codex-plugins-official` ``
- **Severity:** medium | **Confidence:** high | **Type:** verified fact
- **Detail:** Three fixes logged in `AGENT-FAILURES.md` do not exist in always-loaded doctrine or agent prompts: (1) `"resume a capped builder at most once"` lives only inside optional `nebi-orchestration`, leaving single-builder runs exposed (`single-loop/FINDINGS.md:9` notes all 11 builders past 150 calls were resumed); (2) the 1728px viewport check lives in `reliability-checklist.md` (R8, checker-only), not in `CLAUDE.md:133` for lead-built medium work, and neither file carries `"draft every planned piece before polishing any"`; (3) neither `CLAUDE.md` nor `nebi-{builder,checker,scout}.md` warns agents not to echo or screenshot secrets (Pattern #16, still `open`). Separately, the untracked `.agents/skills/single-agent-loop/SKILL.md` is a duplicate of tracked `.claude/skills/single-agent-loop/SKILL.md` with a broken blind `claude -> Codex` replacement that non-Claude Agent Skills loaders actively load.
- **Smallest concrete change:** Add one sentence each to `CLAUDE.md:78` (resume a capped agent at most once), `CLAUDE.md:133` (inspect screenshots at ~1728px before deploy; draft all planned pieces before polishing one), and `CLAUDE.md` §3b + `nebi-checker.md:9` (never print or screenshot secrets/tokens/passwords); delete `.agents/skills/single-agent-loop/` (or replace it with a tracked symlink to `../../.claude/skills/single-agent-loop`).
- **What could break:** Deleting `.agents/skills/single-agent-loop/` removes discovery for tools scanning only `.agents/skills/` (symlinking avoids that). Adding ~3 lines to `CLAUDE.md` is offset many times over by F17's trim.

### F16. Hook, helper, and deployer reliability bugs (`verify-before-stop`, `steer-channel`, `term.mjs`, `deploy.mjs`)
- **Location:** `claude-home/hooks/verify-before-stop.mjs:218-219,237`; `claude-home/hooks/steer-channel.mjs:29,107-108`; `claude-home/nebi/term.mjs:10,32,46`; `deploy.mjs:297,314,635`
- **Quote:**
  - `verify-before-stop.mjs:219,237`: `const running = countRunning(tasks);` / `if (tasks?.length === 0 && !scheduled && status !== '✅' && status !== '❓') {`
  - `steer-channel.mjs:29,107-108`: `const TRANSCRIPT_TAIL = 1024 * 1024;` / `rmSync(CONSUMED_FILE, { force: true }); renameSync(STEER_FILE, CONSUMED_FILE);`
  - `term.mjs:10,32,46`: `// Example: node ~/.claude/nebi/term.mjs --dir ~/Documents/GitHub/karpet24 -- claude "audit the product pages"` / `const command = sep < 0 ? '' : argv.slice(sep + 1).join(' ');` / `const str = (s) => \`"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\`;`
  - `deploy.mjs:297,314,635`: `fs.writeFileSync(file, expected, 'utf8');` / `const quoted = command.match(/^node\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*$/);` / `['nebi/session-start-sweep.sh', 'nebi/session-start-sweep.ps1', 'hooks/session-start.mjs']`
- **Severity:** medium | **Confidence:** high | **Type:** verified fact
- **Detail:** Four concrete code bugs:
  1. `verify-before-stop.mjs:237` checks `tasks?.length === 0` instead of `tasks !== null && running === 0`; once any background task completes and stays in `background_tasks`, the §3 early-stop nudge stays disabled for the rest of the session.
  2. `steer-channel.mjs` never skips `STEER.md` consumption when `input.agent_id || PLUGIN_SIDECALL` (letting sub-agents/sidecalls steal the lead's steer note), races under parallel tool calls (`rmSync(CONSUMED_FILE)` can delete another call's just-renamed file), and reads only a 1 MB transcript tail (which 1–2 base64 Chrome screenshots overflow, causing `latestOwnPrompt` to return `''`).
  3. `term.mjs:32` joins `argv.slice(sep + 1)` unquoted—breaking its own line-10 header example (`claude audit the product pages` instead of one quoted prompt) and allowing shell metacharacters or `\n`/`\r` (unescaped in `str()`) to inject into Ghostty/AppleScript.
  4. `deploy.mjs:297` overwrites `settings.json` non-atomically in place; `deploy.mjs:314` only recognizes `^node ` commands, so legacy `bash`/`powershell.exe` `session-start-sweep.{sh,ps1}` hooks listed on line 635 are never stripped during upgrades, while dead `session-start-sweep.{sh,ps1}` files still deploy. (Additional smaller bugs found in Lane C: `context.mjs:42,138,184` runs git inside the lock and lets one corrupt `checkpoint.json` crash `show`/`list`; `codex-browser.mjs:60,73` has unguarded `JSON.parse`, deferred `turnId` rotation, and persists `"always"` on zero-field elicitations; `nebi-constellation` leaks its 10s poller on `session.end` and slices unsorted beacons at 64; `nebi-browser:169` permanently opens `accountGate` on any unrelated reply; `feedback-capture.mjs:96-98` misses `/` inside AWS-style secret keys.)
- **Smallest concrete change:** Change `verify-before-stop.mjs:237` to `tasks !== null && running === 0`; guard `STEER.md` with `!input.agent_id && !PLUGIN_SIDECALL` + claim-by-rename (`STEER.claiming.<pid>.md`) and chunked backward transcript scan; POSIX-quote multi-token `term.mjs` args and reject `\r`/`\n`; write `settings.json` via sibling temp + `renameSync` and match legacy `bash`/`powershell` sweep entries in `commandRunsScript()`.
- **What could break:** Quoting multi-token `term.mjs` args would quote raw shell operators if a caller passed `-- echo a \; echo b` across separate tokens rather than one quoted shell string; changing `verify-before-stop.mjs:237` assumes `countRunning` covers every active task status (`running`, and if applicable `pending`/`queued`).

### F17. Architectural gap: `bypassPermissions` lacks native OS Bash sandboxing, credential `permissions.deny`, and exec-form hooks; `CLAUDE.md` and docs carry avoidable bloat/drift
- **Location:** `deploy.mjs:645-679,697-715`; `claude-home/CLAUDE.md:75,93-97,115,159-166`; `README.md:53,116`; `claude-home/nebi/SOURCES.md:41,44`
- **Quote:**
  - `deploy.mjs:645-649`: `// Steer channel must stay cheap — it runs before EVERY tool call (no matcher).`
  - `deploy.mjs:697-715`: `DOCTRINE_SETTINGS` and `DOCTRINE_ENV` set neither `sandbox` nor `permissions.deny` nor `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`.
  - `CLAUDE.md:53-54`: `- Ordinary, well-specified builds: \`medium\`; \`high\` when edge cases or verification matter.` / `- Big builds and code that has to be right: \`xhigh\`.`
  - `README.md:53,116`: `Native scout/checker adapters with inherited model selection` / `eight skills (the seven shared ones plus nebi-mod-verify) ... two native agents`
  - `SOURCES.md:41,44`: `claude-home/hooks/ (five handlers plus shared runtime helper)` / `Native nebi-scout and nebi-checker adapters`
- **Severity:** medium | **Confidence:** medium | **Type:** judgement (grounded in verified file state and official docs)
- **Detail:**
  1. **Security boundary:** Running `bypassPermissions` with regex-only hooks (`kill-guard`, `nebi-red-button`, both bypassed in F01/F02/F12) leaves host credentials (`~/.ssh`, `.env`, `~/.agents/nebi/secrets`) and arbitrary filesystem/network writes exposed. Official Claude Code docs (`sandboxing.md`) and `trailofbits/claude-code-config` pair `--dangerously-skip-permissions` with macOS Seatbelt `sandbox.enabled: true`, `permissions.deny` for secret paths, and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`.
  2. **Hook modernization:** `deploy.mjs` still emits shell-quoted hook strings instead of Claude Code's exec form (`"command": "node", "args": [...]`, avoiding shell tokenization and Windows quoting pitfalls), runs `steer-channel.mjs` on every tool call without an `if` filter (when `AGENT_STOP`/`STEER.md` are rare), and never sets `onFailure: "block"` on `kill-guard.mjs`.
  3. **Context & cost tuning:** `CLAUDE.md` is 19.8k chars (~5k tokens/turn); §3 duplicates `output-styles/nebi.md` (~750 chars), §1/§10 carry ~4.5k chars of dated telemetry, Mythos probe trivia, and occasional skill-hunting prose, and vague effort wording (`"code that has to be right: xhigh"`) drove 156/178 (88%) builder dispatches to `high`/`xhigh` (`single-loop/FINDINGS.md:7`). Also `CLAUDE.md:115` (`"unusual names or terms can be misheard; read for what I meant"`) lacks a guardrail against silently swapping unfamiliar model/tool names (which caused the 11-16 Mythos→Fable error in `AGENT-FAILURES.md:65`), and `rules/code-quality.md:15-16` applies hard Clean Architecture `"Never"` rules to standalone scripts.
  4. **Doc drift:** `README.md` and `SOURCES.md` still document 8 skills, 2 agents with `model: inherit`, and 5 hooks, while `deploy.mjs` deploys 10 skills, 3 agents (no `model: inherit`), and 8 hook files.
- **Smallest concrete change:** Add `permissions.deny` rules for secret paths (`~/.agents/nebi/secrets/**`, `~/.ssh/**`, `**/.env*` where appropriate) and test `sandbox.enabled: true` in one project before global rollout; migrate `deploy.mjs` hook entries to exec form (`command` + `args`); trim ~5k chars of duplicated/occasional prose from `CLAUDE.md` (moving hunting/telemetry to `nebi-maintenance`/`nebi-orchestration`), tighten the `xhigh` criteria and dictation proper-noun guardrail; refresh `README.md:53,116` and `SOURCES.md:37-45`.
- **What could break:** Enabling `sandbox.enabled: true` globally breaks commands that write outside the repo or hit unlisted network domains until `allowWrite`/`allowedDomains` are tuned—pilot per project first. Exec-form hooks require Claude Code versions supporting `args` and updating `tests/deploy.test.mjs` and `commandRunsScript()`.

### F18. Skill hygiene, reachability, and eval-runner gaps
- **Location:** `claude-home/skills/nebi-sessions/SKILL.md:3,70,72`; `claude-home/skills/nebi-maintenance/evals/evals.json:47`; `claude-home/skills/nebi-orchestration/references/reliability-checklist.md:7,81,88`; `claude-home/nebi/run-trigger-evals.mjs:242`; `claude-home/skills/tikhub/SKILL.md:11,36`
- **Quote:**
  - `nebi-sessions/SKILL.md:3,70`: description omits Remote Control / laptop-closed / cloud sessions, while `:70` adds `## When the user wants to walk away`.
  - `nebi-maintenance/evals/evals.json:47`: `"Installs the named upstream pinned, for both clients"` (contradicts `nebi-maintenance/SKILL.md:32` parked-Codex rule).
  - `reliability-checklist.md:7,81,88`: `When \`nebi-maintenance\` triages the failure log, it rewrites or retires items` (not mentioned in `nebi-maintenance/SKILL.md`) / `the time comes from \`date\` in the same command that writes it` (uncheckable from a diff, flags `new Date()`) / `every dispatch passes its model and effort explicitly` (`nebi-orchestration/SKILL.md:9` mentions model, not effort).
  - `run-trigger-evals.mjs:242`: `for (const dir of fs.readdirSync(SKILLS_DIR).filter((name) => name.startsWith('nebi-')))` (silently excludes `codex-browser` and `tikhub` from `--headless` staging, causing 100% ERROR rate on them).
  - `tikhub/SKILL.md:11,36`: `T=~/Documents/GitHub/ecommerce-workspace/tools/tikhub/tikhub.py` (unquoted `$T`, hardcoded external repo, no spend cap before pagination loops) / `th._request(path, params=..., api_key=th._load_api_key())` (couples to private `_` internals).
- **Severity:** low | **Confidence:** high | **Type:** verified fact
- **Smallest concrete change:** Add a walk-away / cloud-session trigger phrase to `nebi-sessions/SKILL.md:3`; update `nebi-maintenance/evals/evals.json` cases 4 & 6 to say active harnesses; wire `reliability-checklist.md` triage into `nebi-maintenance/SKILL.md:37`, add `and effort` to `nebi-orchestration/SKILL.md:9`, and rewrite R14 for runtime clocks; stage all `SKILL.md` directories in `run-trigger-evals.mjs:242`; quote `"$T"` and add an explicit call/spend cap before bulk loops in `tikhub/SKILL.md`.
- **What could break:** Staging `codex-browser` and `tikhub` in `run-trigger-evals.mjs` adds two realistic competitors to headless trigger runs (matching production); editing `nebi-sessions` description requires re-running its trigger suite.

## 5. Keep

- **Empirical failure-to-check discipline (`AGENT-FAILURES.md`, `reliability-checklist.md`, `single-loop/`):** Tracking real incidents, measuring before/after, marking unmeasured fixes honestly as *observed, not measured*, and structuring the checker's checklist by diff-readable trigger + check + incident ID is rare and high-value.
- **`mods/CONTRACT.md` architecture:** Single-owner screen sites, `$.state` atoms for hot-reload resilience, pure-helper separation (`hooks/*.ts` vs `register.tsx`), `NEBI_MODS_OFF` kill switch across all 10 mods, and `tests/route-parity.test.mjs` enforcing identical route implementations.
- **Lean sub-agent tool allowlists (`agents/nebi-{builder,checker,scout}.md`):** Stripping browsers/connectors/sub-agents mechanically cut `nebi-checker` tokens 4.5× (57k vs 258k in `single-loop/PLAN.md:19`) and keeps `nebi-scout`/`nebi-checker` strictly read-only.
- **§0 direct-override rule and §6 evidence tiers (`claude-home/CLAUDE.md`):** Clear hierarchy of proof by change type (docs vs localized code vs release-critical vs numeric vs visible) with explicit `"Stop after decisive evidence"`.
- **Fail-open hook design & deployer preflight (`claude-home/hooks/runtime.mjs`, `deploy.mjs`):** Hooks never crash a session on bad stdin; `deploy.mjs` rejects source symlinks, validates existing JSON shapes before any write, preserves pristine first-run backups, and offers `--check` and `--verify`.
- **Revision-checked project checkpoints (`claude-home/nebi/context.mjs`):** Separating hook-observed repo facts from lead-authored task intent, canonicalizing across git worktrees, and rejecting stale `expectedRevision` writes.
- **Status line (`claude-home/nebi/statusline.mjs`):** Dependency-free, fault-isolated per segment, accurate prompt-cache TTL/hit-rate tracking, and clean light/dark terminal contrast.
- **Offline trigger & behavioral test rigor (`scripts/verify.mjs`, `run-trigger-evals.mjs`, `eval-decide.mjs`):** Refusing to score missing registry entries or truncated streams as negative passes, and running 168 tests across Linux/macOS/Windows in CI.
- **Real-PTY paint verification concept (`nebi-mod-verify`):** Rendering `@xterm/headless` to Ghostty-themed PNGs catches live UI regressions that unit tests miss (worth keeping once F08 is fixed).

## 6. References

Every URL below was opened directly during this review:

- **Official Claude Code Docs**
  - `https://code.claude.com/docs/en/memory.md` — `.claude/rules/` `paths:` conditional loading (F11), native `AGENTS.md` loading, `claudeMdExcludes`, `CLAUDE.md` conciseness, context vs deterministic enforcement (F17).
  - `https://code.claude.com/docs/en/best-practices.md` — "What you can stop doing" table (caps/emphasis overuse, loop scaffolding, sub-agents purely for context protection), keeping `CLAUDE.md` short, deterministic checks vs prose (F05, F17).
  - `https://code.claude.com/docs/en/sub-agents.md` — `omitClaudeMd: true` (F07), `maxTurns`, `autoCompactWindow`, `effort`, `model` precedence including `CLAUDE_CODE_SUBAGENT_MODEL` vs `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` (and the v2.1.251 precedence change).
  - `https://code.claude.com/docs/en/hooks.md` — Exec form (`command` + `args`), `if` permission-rule filters, `onFailure: "block"`, `SessionEnd` 1.5s budget, `Stop` `background_tasks`/`session_crons`/`hookSpecificOutput.additionalContext`, `StopFailure` (F16, F17).
  - `https://code.claude.com/docs/en/skills.md` — Optional skill frontmatter (`disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `paths`, `context: fork`), `${CLAUDE_SKILL_DIR}`, 1,536-char description cap (F14, F18).
  - `https://code.claude.com/docs/en/output-styles.md` — `keep-coding-instructions: true` requirement (validated on `nebi.md`), built-in `Concise` and `Proactive` output styles (F06, F17).
  - `https://code.claude.com/docs/en/sandboxing.md` — Native macOS Seatbelt / Linux bubblewrap Bash sandbox, `filesystem.denyRead`, network domain proxy, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` (F17).
  - `https://code.claude.com/docs/en/model-config.md` — Current model aliases (`fable` → Fable 5.2, `opus` → Opus 5.5, `sonnet` → Sonnet 5.5, `haiku` → Haiku 5.5), per-model `modelSettings`, Ultracode decoupling from `xhigh` (F05, F17).
  - `https://code.claude.com/docs/en/settings-reference.md` — `skillListingBudgetFraction` (default `0.01`), `autoCompactWindow` vs `modelSettings` precedence, `askUserQuestionTimeout` (F17).
  - `https://code.claude.com/docs/en/plugins/mods/reference.md` — `session.start` not firing after `/clear`/`/resume`/`/branch` while `session.end` does; `agent.spawn` firing on resumed runs (`e.resume`, v2.1.299+) (F12, F16).
  - `https://code.claude.com/docs/en/agent-view.md` — Native `claude agents` screen and footer waiting counts (`← N agents`), relevant benchmark for `nebi-beacon`/`nebi-constellation` scope.
  - `https://code.claude.com/docs/en/goal.md` — Native `/goal` fresh-model Stop evaluator for iterative convergence loops.
  - `https://code.claude.com/docs/en/workflows.md` — Dynamic workflows, Ultracode behavior, sibling prompt-cache sharing with `effort` and `subagentPromptCacheTtl`.
  - `https://code.claude.com/docs/en/worktrees.md` & `https://code.claude.com/docs/en/cross-session-messaging.md` — Native `--worktree` / `EnterWorktree` isolation and `@mention` / idle-notice cross-session messaging.
  - `https://code.claude.com/docs/en/features-overview.md` — Official split between `CLAUDE.md` (<200 lines), `.claude/rules/`, skills, output styles, sub-agents, hooks, and workflows (F07, F11, F17).
- **Agent Skills Specification & Anthropic Engineering Blog**
  - `https://agentskills.io/specification.md` — 1,024-char description, <500-line body, 3-tier progressive disclosure, one-level `references/`/`scripts/` layout (F14, F18).
  - `https://www.anthropic.com/research/effective-context-engineering-for-ai-agents` — Context rot, attention budget ("smallest set of high-signal tokens"), just-in-time retrieval (F07, F11, F17).
  - `https://www.anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills` — Progressive disclosure and bundling deterministic scripts in skills (F14, F18).
- **Public Claude Code Setups & Skill Packs**
  - `https://github.com/trailofbits/claude-code-config` — Ghostty + `--dangerously-skip-permissions` paired with native OS sandboxing, credential `permissions.deny` rules, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, and a ~100-line global `CLAUDE.md` backed by path-scoped `rules/` (F11, F17).
  - `https://github.com/trailofbits/skills` — Marketplace plugin distribution, adversarial false-positive refutation (`fp-check`), and wrapping deterministic analyzers (F17).
  - `https://github.com/obra/superpowers` (and `hooks/session-start`) — Process-layer skills (`verification-before-completion`, worktrees) and PATH-independent, EPIPE-safe cross-platform hook engineering (F16).
  - `https://github.com/EveryInc/compound-engineering-plugin` — `plan -> build -> review -> compound` loop writing institutional knowledge into repo docs rather than bloating global `CLAUDE.md` (F17).
  - `https://github.com/garrytan/gstack` — Single-loop role-mode slash commands (`/review`, `/qa`, `/ship`), real browser verification, and `.env`-safety guardrails (F17).
  - `https://github.com/anthropics/skills` & `https://github.com/anthropics/claude-plugins-official` — Official skill-bundle and marketplace packaging conventions (F14).

## 7. Not Checked

- **Live `~/.claude/`, `~/.claude-max2/`, `~/.agents/nebi/secrets`, `.env`, `settings.local.json`:** Skipped per ground rules (read-only, no secrets). Consequently, live `settings.json` values (`model: opus`, installed third-party skills like `stop-slop` and `scrapling-official`, and `claude-team`'s `CLAUDE_CONFIG_DIR`) were checked only via repo files, not live home folders.
- **`mods/retired/`:** Skipped per prompt instructions.
- **`codex-home/` (beyond parity checks with `claude-home/`):** Treated as out of scope because Codex is parked.
- **`claude-home/nebi/benchmarks/*` and `research/2026-09-22-discovery/` / `research/2026-10-03-mods-rework/`:** Not audited line-by-line (historical records, never deployed).
- **Live Claude Code plugin execution (`claude plugin validate`, `claude plugin test`, `tsc -p mods/*`, `nebi-mod-verify`, headless trigger evals):** Not run because this review is strictly offline/read-only and makes no installs or paid model calls.
- **`deploy.mjs` / `deploy.sh` / `deploy.ps1` execution:** Never run per ground rules (audited by static code review and `tests/deploy.test.mjs` via `node scripts/verify.mjs`).

## 8. Run Notes

- **Model:** Gemini (Antigravity Orchestrator, plan/execute split)
- **Harness:** Antigravity IDE (`research` sub-agents + read-only shell/file tools)
- **Parallel lanes:** All four lanes ran in parallel with non-overlapping file scopes:
  - Lane A: doctrine (`CLAUDE.md`), output style, rules, commands, agents, `single-loop/`, `codex-home/AGENTS.md` parity
  - Lane B: all 10 skills under `claude-home/skills/`, `references/`, `evals/`, `nebi-mod-verify/scripts/`, `.agents/skills/` vs `.claude/skills/`
  - Lane C: hooks, `claude-home/nebi/` helpers, `mods/CONTRACT.md`, all 10 active mods under `mods/nebi-*/`, `deploy.{mjs,sh,ps1}`, `scripts/`, `tests/`, `.github/workflows/verify.yml`
  - Lane D: outside references (official Claude Code docs, Anthropic engineering blog, Agent Skills spec, public Claude Code setups), supplemented by direct URL fetches from the coordinator
- **Coordinator verification:** Every finding, line number, quote, and exploit/bug proof (F01, F02, F12) was independently verified against disk and in Node before merging.
- **Last lines of `node scripts/verify.mjs`:**
```text
✔ project locks under lockRoots are checked and one-client installs are flagged (1708.140083ms)
✔ offline mode checks installs only and never touches the network (193.706459ms)
✔ docs normalization strips HTML down to its text and leaves a Markdown export as served (4.08325ms)
✔ index posts: links below the registered folder, feed item links as given (3.77125ms)
✔ docs check reports unchanged, CHANGED, NEW POSTS and ERROR, one status per entry (29.000791ms)
✔ mark-reviewed records date, hash and posts for the chosen entry only (14.949333ms)
✔ --docs CLI: exit 0 with changes to review, --mark-reviewed writes only the docs entry (977.855667ms)
ℹ tests 168
ℹ suites 0
ℹ pass 168
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 24582.167083
```
