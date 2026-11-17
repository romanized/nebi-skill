# Design: attention first (mods rework, 2026-10-03)

Designer lane. Goal: Nebi can tell **done / working / needs you** at a glance in every session, on the terminal and in the desktop Code tab, and everything else gets quieter. Done looks like: one row above the prompt for this session, one segment in the status line for the other sessions, the reply's own status line stamped in the same colors, and nothing else on screen that moves, speaks or offers him answers.

Built only on digest findings marked confirmed or partly (corrected claims used), plus my own checks, which carry their own receipts. Anything else is listed under "Unverified dependencies" at the end.

Receipt notation: `[usage-3]` is a digest finding id. `d.ts:NNNN` is the 2.1.288 types file (`/private/tmp/claude-501/bundled-skills/2.1.288/05c1550b06cfbccd1c30b5b6bff87243/plugin-authoring/types/claude-code.d.ts`). `bin:"…"` is a string found in `strings -n 12` of `/Users/nebi/.local/share/claude/versions/2.1.288`. Repo paths are relative to `/Users/nebi/Documents/GitHub/nebi-skill`.

---

## 0. State at the time of writing (new facts, not in the digest)

| # | Fact | Receipt |
|---|---|---|
| S1 | **nebi-beacon and nebi-constellation are disabled right now.** The helm session disabled both at 13:19:16Z, together with `spinnerTipsEnabled:false` and `promptSuggestionEnabled:false`, right after Nebi wrote at 13:18:49Z: "with this big indicator of what it's doing right now, it keeps on giving me suggestions and whatever. It's very annoying. I'm so confused. We need to declutter and optimize it." | `~/.claude/settings.json` `enabledPlugins` (`nebi-beacon@nebi-mods: false`, `nebi-constellation@nebi-mods: false`); transcript `~/.claude/projects/-Users-nebi-Documents-GitHub-nebi-skill/5376e9a8-8102-404b-ac9c-d05e6a128916.jsonl` records 397 (prompt) and 408 (the `claude plugin disable` command), 0-based |
| S2 | Still enabled: aside, fleet-radar, model-lock, plan-rail, red-button, wispr, and the built-in `cc-plugin-you-should-know@builtin`. | `~/.claude/settings.json` `enabledPlugins` |
| S3 | One settings file serves both accounts: `~/.claude-max2/settings.json` is a symlink to `~/.claude/settings.json`. | `ls -la ~/.claude-max2/settings.json` |
| S4 | Settings now: `model:"opus[1m]"`, `theme:"dark"`, `effortLevel:"xhigh"`, `remoteControlAtStartup:true`, `agentPushNotifEnabled:true`, `permissions.defaultMode:"bypassPermissions"`, no `env` block, `showTurnDuration`/`awaySummaryEnabled`/`terminalProgressBarEnabled` unset. | `~/.claude/settings.json` |
| S5 | `statusLine.refreshInterval` exists: "Re-run the status line command every N seconds in addition to event-driven updates". A status line can therefore show other sessions while this one is idle. | bin:`refreshInterval:C().min(1).optional()…describe("Re-run the status line command every N seconds…")` |
| S6 | The status-line payload carries `rate_limits:{five_hour, seven_day, spend_limit}`, `session_name`, `model.display_name`, and spreads the base hook envelope (`session_id`, `cwd`). | bin:`...Xe&&{session_name:Xe},model:{id:Pe,display_name:Fo(Pe)}…(Qe.five_hour\|\|Qe.seven_day\|\|Qe.spend_limit)&&{rate_limits:Qe}`; envelope bin:`N=f(()=>u({session_id:o(),transcript_path:o(),cwd:o()…` |
| S7 | `theme:"auto"` is a valid value. | bin:`nZr=["dark","light",…],ntt=["auto",...nZr]` |
| S8 | `inputNeededNotifEnabled` exists ("Push to mobile when a permission prompt or question is waiting"), default off. | bin:`inputNeededNotifEnabled:()=>H().optional().describe("Push to mobile when a permission prompt or question is waiting")`, `inputNeededNotifEnabled??!1` |
| S9 | A built-in task panel exists (`todoFeatureEnabled`), and `viewMode` takes `default`/`verbose`/`focus`. `askUserQuestionTimeout` defaults to never (keep it: auto-continue would hide asks). | bin:`todoFeatureEnabled:()=>…"Enable the todo / task tracking panel"`, `viewMode:()=>j(["default","verbose","focus"])`, `askUserQuestionTimeout…"Defaults to never"` |
| S10 | The launcher builds the child env and `execvpe`s claude, so it can inject `BROWSER` per account. Account A pops `CLAUDE_CONFIG_DIR`; B sets it to `~/.claude-max2`. It has no master in the repo. | `~/.local/bin/claude-profile:43-44, 64-69, 86` |
| S11 | Doctrine tells agents to open terminals: CLAUDE.md "To open one for a task … use `node ~/.claude/nebi/term.mjs`". Same line in the Codex master. | `claude-home/CLAUDE.md:135`, `codex-home/AGENTS.md:152` |
| S12 | `deploy.mjs` merges only statusLine, outputStyle, hooks, one claudeMdExcludes entry and skillListingBudgetFraction into settings. Display keys are hand-set today. | `deploy.mjs:9-13, 667-675` |
| S13 | `tests/hooks.test.mjs` already exercises the Stop hook (background tasks, early stop) and the status line, so the hook fixes below get tests in an existing file. | `tests/hooks.test.mjs:116, 135-153, 176` |

S1 changes the brief: the "big indicator" is gone only because the signal is gone. The rework must bring the signal back **smaller** than before, never bigger.

---

## 1. The attention model

### 1.1 Three states, one place per scope

| Scope | Where Nebi looks | Drawn by | Works without mods? |
|---|---|---|---|
| This session, turn running | the engine spinner, with beacon's one-line "what it is doing" | engine + nebi-beacon (Spinner message rewrite) | spinner yes, message no |
| This session, turn ended | **one row above the prompt**: `✅ DONE` / `⏳ WORKING` / `❓ NEED YOU` badge, the status text, how long ago | nebi-beacon (AbovePrompt) | no; the reply's last line (output style) carries the same text |
| Same, in the transcript | the reply's status line, stamped in the same badge colors | nebi-stamp (AssistantMessage) | plain text line |
| Other sessions (both accounts) | **left end of the status line**: yellow `❓ cnlsneakers · trigger.si`, green `✅ rs-growth` for 10 min after it finished | statusline.mjs reading beacon files, `refreshInterval: 5` | yes, given beacon files (mod or Stop-hook fallback writer) |
| Other sessions, desktop Code tab | appended to beacon's row (the desktop draws no status line) | nebi-beacon | no |
| The moment another session flips to need | one toast, 6 s, naming the project and the ask | nebi-beacon | no |
| Away from the Mac | phone push of the `❓ Need you` line; spoken project name after a long turn | nebi-beacon (+ the model's own push as fallback) | model push only |

Why this split: the questions he misses are the ones that pull him away (page asks wait about 2.5x longer at the median, ~30% over 30 min) [usage-1]; needs arrive while he is in another session (313 notification-started and 208 peer-started turns, 78 and 68 ending ❓) [usage-4]; he runs a median 2 and up to 9 CLI sessions, all in Ghostty [usage-7, usage-8]; and he never typed a single mod command [usage-18]. So every signal must be passive, persistent where it matters, and visible from whichever session he is in. The status line is the one line every terminal session always draws, it can refresh on a timer (S5), and it needs no mods, which also answers the rollout-switch risk [online-2].

### 1.2 Vocabulary and palette (one table, used by every drawer)

| State | Badge text | Background (black text) | When |
|---|---|---|---|
| need | `❓ NEED YOU` | `#ffd23f` | reply ended `❓ Need you`, a ⏳ line that hands him a job, an AskUserQuestion card open, a Red Button hold |
| done | `✅ DONE` | `#7ee2a8` | reply ended `✅ Done` with no unchecked edits |
| done, unproven | `✅ DONE · unproven` | `#ffa94d` | `✅ Done` but files were edited after the last test/build/validate command |
| working | `⏳ WORKING` | `#8ecbff` | reply ended `⏳ Working` (background work); never during a live turn (the spinner covers that) |
| stopped / error / no status | `■ STOPPED` / `✖ ERROR` / `⚠ NO STATUS` | `#c8c8c8` / `#ff8a8a` / `#f0a6ff` | interrupt, API error, reply without a status line |

These are beacon's existing light-and-dark-safe colors (`mods/nebi-beacon/hooks/register.tsx:51-61`). The status line uses the same RGB as 24-bit ANSI backgrounds.

### 1.3 Before and after (terminal, a session that just asked something)

Before (beacon + plan-rail + constellation + you-should-know, all on):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← scanner sweep, 10 fps
 ❓ NEED YOU  Pick which .si domain to back-order
     why: … · reply with "…"
     [1] trigger.si   [2] tri.si   [3] skip   [0] dismiss      ← fork-written answers
 ● ● ○ ○  step 2/4 …                                           ← plan rail
 ⚠ nebi-constellation: 3 need you                              ← warning look
 Opus 5.5 (1M context)  |  ctx 45% (1M)  |  eff:xhigh  |  5h:23%  |  ⎇ master
 ⏵⏵ bypass permissions on (shift+tab to cycle)
```
After:
```
 ❓ NEED YOU  Back-order trigger.si or tri.si in the registrar? I'd take trigger.si     2m ago
 ╭──────────────────────────────────────────────────────────────────────────╮
 │ >                                                                        │
 ╰──────────────────────────────────────────────────────────────────────────╯
 ⏵⏵ bypass permissions on · esc to interrupt                🔒 sonnet scouts & steps ✓ 4/4
 ❓ cnlsneakers · ✅ rs-growth · Opus 5.5 · ctx 45% · xhigh · 5h 23% · wk 61% · A Main · ⎇ master
```
Exact row order of footer and status line is the engine's; the mock shows content, not placement.

---

## 2. Declutter plan, item by item

Owners: `settings`, `statusline`, `stop hook`, `output style`, `mod:<name>`. "Done 13:19Z" means the helm already applied it (S1).

| # | Item | Lever | Owner | Depends on |
|---|---|---|---|---|
| 1 | "(1M context)" after the model name | Strip `/\s*\(1M context\)$/` from `model.display_name` (statusline.mjs:16-17). The model stays `opus[1m]`; never use `CLAUDE_CODE_DISABLE_1M_CONTEXT`. | statusline | clutter-11, usage-26 |
| 2 | "(1M)" after ctx % | Delete the `win` suffix (statusline.mjs:30). | statusline | clutter-11 |
| 3 | "(shift+tab to cycle)" | PromptHint `hint` rewrite; the engine redraws the mode pill without the cycle hint and keeps "bypass permissions on". Capture the real hint string with a debug-log hook first. | mod:nebi-footer | clutter-7, clutter-8, online-4, online-5 |
| 4 | "? for shortcuts" | Same rewrite strips it. | mod:nebi-footer | clutter-8 |
| 5 | Big NEED YOU card with numbered answers | Beacon loses the `$.model.fork` card, the options, the hotkey Buttons and the why/reply row (`register.tsx:181-204, 440-471`, `parts.ts:200-222`). One row remains. | mod:nebi-beacon | clutter-6, modsapi-5, usage-20 |
| 6 | The same menu twice (reply restates options, card repeats them) | Rewrite output style line 23: one plain question plus a one-sentence recommendation, no menu. | output style | clutter-26, usage-20, usage-2 |
| 7 | "You should know" note with 1/2/0 buttons | `enabledPlugins["cc-plugin-you-should-know@builtin"]: false` | settings | online-8 (confirmed in binary), S2 |
| 8 | "▲ nebi-constellation: 3 need you" in warning style | Ban `$.ui.status` in the contract. Other sessions move to the status line (terminal) and beacon's row (desktop). Constellation merges into beacon. | statusline + mod:nebi-beacon | clutter-4, clutter-5, modsapi-1 |
| 9 | "recap:" lines | `awaySummaryEnabled: false`. Beacon's row replaces the recap's "current task / next action" job. | settings | clutter-13, clutter-33 |
| 10 | "Stop hook feedback: N background tasks still running" | Drop tasks with `type==='monitor'` and description `/^(live updates for\|presence on) artifact /i` before **both** the running count and the early-stop test; then nudge at most once per identical running set per session. | stop hook | clutter-1, clutter-2, clutter-3, usage-5 |
| 11 | "Baked for 1m 23s" | `showTurnDuration: false`. It also removes "Waiting for N agents"; beacon's WORKING row shows "2 agents running". | settings | clutter-14 |
| 12 | "new task? /clear to save …" | `env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES = "100000000"` in settings, and the same in the launcher env (settings-env timing is unconfirmed). | settings | clutter-15 |
| 13 | "Update installed · Restart to update" | `env.DISABLE_AUTOUPDATER = "1"` plus a daily out-of-band `claude update`. Needs Nebi's yes: it also stops plugin auto-update. | settings | clutter-16 |
| 14 | Mod reload notices | In the last 3 days only the mod-building session showed them [clutter-17]; "Plugins updated … reloaded" goes with item 13 [modsapi-21]. No other lever without losing hot reload. | settings | clutter-17, modsapi-21 |
| 15 | Code previews in Write results (and Edit diffs) | ToolResult hook draws one line: `Wrote 142 lines → hooks/register.tsx`. Errors keep the engine drawing. | mod:nebi-quiet | clutter-19, online-3 |
| 16 | Workflow progress | ToolUse hook: `tool==='Workflow' && isRunning` → one line. Keep Ghostty's native OSC 9;4 bar (it is the cross-tab "still working" cue) unless Nebi says otherwise. | mod:nebi-quiet + settings | clutter-20, clutter-33 |
| 17 | Spinner tips | `spinnerTipsEnabled: false` | settings | clutter-21 (done 13:19Z) |
| 18 | Prompt suggestions (ghost text telling him what to type) | `promptSuggestionEnabled: false` | settings | clutter-23 (done 13:19Z) |
| 19 | Scanner sweep and "…" dots | Removed from beacon (`register.tsx:404-413`); no animation anywhere (contract). | mod:nebi-beacon | modsapi-19 |
| 20 | Plan rail rows, its MCP tool, its system-prompt section, its tick | Plan-rail rework reads the built-in task tools and shows one dim footer label. | mod:nebi-plan-rail | modsapi-10, modsapi-18 |
| 21 | fleet-radar's 1 s ticker and double state writes | Drop the mod. | — | modsapi-8, usage-18 |
| 22 | Constellation's 3 s poll and pane in every session | Merged: beacon polls every 5 s for the toast and the desktop row; no pane. | mod:nebi-beacon | usage-18, clutter-4 |
| 23 | Two Wispr toasts per prompt | At most one toast per prompt, corrections only. | mod:nebi-wispr | (code: `nebi-wispr/hooks/register.tsx:39, 52`) |
| 24 | Model Lock toast on every rewritten spawn | Toast only when a lock is set or cleared; the lock shows as a footer label. | mod:nebi-model-lock | modsapi-13 |
| 25 | Red Button's ⚠ status line during a hold | Removed; the hold row stays. | mod:nebi-red-button | clutter-4, modsapi-1 |
| 26 | "(ctrl+b to run in background)" pill | ToolProgress `hint: ""` draws nothing (terminal only). | mod:nebi-footer | online-4, d.ts ToolProgress ("`""` draws nothing") |
| 27 | The model's own PushNotification tool row | ToolUse for `PushNotification` draws nothing unless errored; the status line already says it. | mod:nebi-quiet | d.ts:9219 ToolUse props |
| 28 | One-line narration between tool calls ("Let me read the file.") | AssistantMessage draws nothing for mid-turn blocks under 240 chars with no newline; the final reply always shows. | mod:nebi-stamp | skills-8 |
| 29 | Long replies | Output style: answer first, no recap of steps, no closing summary. | output style | usage-28, his words "debloat the chat responses too" |
| 30 | Status-line separators "  \|  " | ` · ` (shorter row). | statusline | his words "it's all very big" |
| 31 | Dark theme on a light terminal (dim footer text unreadable) | `theme: "auto"`. Taste call. | settings | S7 |

---

## 3. The ten mods

Ownership rule for all ten: each render site has exactly one owner, except SessionMode, which takes at most one short label per mod (section 5).

### 3.1 nebi-beacon (merged: nebi-beacon + nebi-constellation)
**Does.** Keeps this session's state from `turn.start` / `turn.complete` and the reply's status line (keeps `parseStatus`, `asksPerson`, `clean`, the edits-since-last-check counter for "unproven"). Draws **one row** in the band, only when `e.props.isWorking` is false and the state is done / need / working / stopped / error / no status; idle draws nothing. Row = badge + status text cut to one line + one right-hand fact ("2m ago", or "2 agents · 6m" for background work). No fork, no options, no Buttons, no animation, no `$.ui.status`, no pane, no command.
- AskUserQuestion open (main loop `tool.call`): state becomes need with the first question as text until the call returns, so other sessions see it.
- Spinner: keeps the "Editing parts.ts / Waiting on 2 agents" message (zero added rows).
- Beacon file v2 (`~/.claude/nebi/beacons/<sessionId>.json`): adds `account` ("A" when `CLAUDE_CONFIG_DIR` is unset, "B" for `~/.claude-max2`), `browser` (label from `<root>/.claude/browser.json`), `writer: "mod"`; drops `ask` (the text already is the ask).
- Other sessions (from constellation): polls the folder every 5 s, skips stale files (mod files 90 s after heartbeat, hook files 12 h), counts `<id>.hold.json` as need. Toasts once per flip into need, batched within 10 s ("cnlsneakers needs you: Approve the TikTok OAuth in RapidSneakers Chrome"). On the desktop surface only, appends "· also ❓ cnlsneakers" to its row (and shows that alone when this session is idle).
- Phone: when a main turn ends need and the model sent no push in that turn, sends `PushNotification` with `<project>: <status text>` (keeps the `pushedIn` dedupe, `register.tsx:76-77, 271`).
- Speech, `userConfig.speech` = `off | need | need-and-done`, default `need`: after a turn of 60 s or more ends need, says "<project> needs you".
- Fix: after `/clear`, re-arm the heartbeat and write the new id's file at once [modsapi-26 noted the gap].

**How Nebi notices.** When the spinner stops there is always one colored row saying which of the three states this session is in, in the same words as the reply's last line. A toast and the status line tell him another session wants him. A long job that ends with a question says its project name out loud.

Surfaces: terminal, desktop (AbovePrompt, Spinner); files are shared across both accounts. Events: `session.start`, `session.end`, `turn.start`, `tool.call` (observe), `turn.complete`, `ui.render AbovePrompt`, `ui.render Spinner`.
Pains: usage-1, usage-3, usage-4, usage-20, usage-21, usage-6/usage-7 (several sessions waiting at once), clutter-4, clutter-6, modsapi-5.
Tests: parseStatus for the three states plus missing; the row is absent while `isWorking`; the tree holds no `Button`, `Raster` or `Svg` at 40/80/160 columns on terminal and desktop; one row only; desktop row lists peers, terminal row does not; AskUserQuestion sets need and restores working on return; toast fires once per flip and batches two flips; hold file counts as need; stale mod and hook files ignored; push sent once when the model did not push, not when it did; speech off / need / need-and-done; `/clear` writes the new id's file; v2 fields (account from mocked `CLAUDE_CONFIG_DIR`, browser from a mocked browser.json); escape sequences in a peer's text are stripped.
Fallback without mods: the reply's status line, the model's own push, and the status line's peer segment from Stop-hook-written beacons.
Risk: the row is only as honest as the model's status line; a missing line shows `⚠ NO STATUS` rather than guessing. Size: the rework deletes ~350 lines (fork, scanner, dots, buttons) and adds ~120; one pass.

### 3.2 nebi-quiet (new) — transcript rows
**Does.** Owns ToolResult and ToolUse.
- ToolResult for `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, not errored → one dim line: `Wrote 142 lines → mods/nebi-beacon/hooks/register.tsx`, `Edited register.tsx`. `userConfig.edits` = `compact | full` (default compact) brings Edit diffs back.
- ToolUse `Workflow` while `isRunning` → one line `⏳ workflow running · <description>`; the finished row is the engine's.
- ToolUse `PushNotification` → nothing, unless errored.
- Errored or interrupted rows are never touched.

**How Nebi notices.** File writes are one line each instead of collapsed code; a running workflow is one line; the phone-push call is gone from the transcript.
Surfaces: every surface (ToolResult and ToolUse are raised everywhere [clutter-27]). Events: `ui.render ToolResult`, `ui.render ToolUse`.
Pains: clutter list items "code previews in Write results", "workflow progress bars"; his words "collapsed code that isn't relevant to him".
Tests: Write not errored → one Text row with path and line count and no file content; Write errored → engine drawing (`next`) unchanged; Edit compact vs full via `test(name, {options})`; Workflow running → one row, finished → `next`; PushNotification → empty Box, errored → `next`; Read/Bash untouched; terminal and desktop loops.
Fallback: none (no setting shortens these rows).
Risk: ToolResult has no `isExpanded`, so ctrl+o probably shows the compact line too [clutter-19]; `edits: full` is the escape hatch, and the file is on disk.

### 3.3 nebi-footer (new) — the line under the prompt
**Does.** Owns PromptHint and ToolProgress. Rewrites `hint` with "(shift+tab to cycle)" and "? for shortcuts" removed and stray ` · ` trimmed; never sets `tail`; passes through untouched when there is nothing to remove. ToolProgress `background_hint` → `hint: ""`.
First build step: a throwaway debug hook logs `e.props.hint` in idle, typing and working states (bypass mode), plus a before/after screen capture, to confirm the cycle hint really drops (the exact string is unconfirmed).

**How Nebi notices.** The footer reads `⏵⏵ bypass permissions on · esc to interrupt`; no ctrl+b pill under running commands.
Surfaces: PromptHint terminal + desktop; ToolProgress terminal only. Events: `ui.render PromptHint`, `ui.render ToolProgress`.
Pains: "remove the shift+tab hint"; "it's all very big".
Tests: hint containing both substrings → both gone, other text intact; hint with neither → `next(e)` with props unchanged; result never carries `tail`; empty result leaves no dangling ` · `; ToolProgress background_hint → hint `""`; terminal and desktop loops.
Fallback: none exists (no setting) [clutter-7].
Risk: a rewritten hint drops every other mod's `tail` [clutter-9]; the contract therefore retires `tail` for all mods.
Why separate from nebi-quiet: different risk (cosmetic text edit with an unconfirmed string vs hiding content), different surfaces, separate kill switch.

### 3.4 nebi-stamp (new) — the reply itself
**Does.** Owns AssistantMessage.
- Status stamp: when a block's last non-empty line matches the status-line pattern, it draws the block without that line, then one row with the state badge (palette 1.2) and the status text. A block that is only the status line becomes only the row.
- Working notes: a block whose step went on to call tools, under 240 characters with no newline, draws nothing. Classified from `turn.step` results (text plus whether the step called tools), re-drawn with `$.ui.invalidate('ui.render')` when the step ends. `userConfig.notes` = `hide | show`, default hide. The last step's text is never hidden.

**How Nebi notices.** Every reply ends in the same colored badge the band shows, so scrolling back he sees which replies asked something; the short "Let me check X" lines between tool calls are gone.
Surfaces: every surface, including Remote Control viewers. Events: `turn.start` (reset), `turn.step` (observe), `ui.render AssistantMessage`.
Pains: usage-3 (done rarely said, now visible when it is), usage-21 (asks lost above the fold), his words "debloat the chat responses too".
Tests: reply ending `❓ Need you — X` → engine drawing of the rest plus one badge row with X; status-only block → one row; block without status → `next(e)` unchanged; a short note followed by a tool call → empty; the same text as a final answer → shown; `notes: show` keeps notes; text with escape sequences cleaned; terminal and desktop loops.
Fallback: plain status line.
Risk: if `turn.step` classification misfires, a useful mid-turn line hides; `notes: show` restores it.

### 3.5 nebi-browser (new) — the right browser, per project
**Does.** Reads `<root>/.claude/browser.json` (section 7) at `session.start`.
- Sets `BROWSER` to the router with `$.env.set` when the env lacks it, so artifact opens and clicked links go to the project's Chrome profile [browsers-7: the opener reads `BROWSER` live].
- Guards Claude in Chrome (`tool.call` with matcher `{ tool: /^mcp__claude-in-chrome__/ }` [browsers-24]): `select_browser` with another `deviceId` → deny, naming the right id; `switch_browser` → deny ("it sends Nebi a pairing click; use select_browser with deviceId bbbbbbbb") [online-10].
- Account check: `CLAUDE_CONFIG_DIR` vs `browser.json.account`; a mismatch gives one toast ("cnlsneakers runs on account B: start it with claude-b").
- SessionMode label on the desktop only, e.g. `B · RapidSneakers` (on the terminal the status line shows it; facts are not repeated).

**How Nebi notices.** Pages open in the right Chrome window; a wrong-browser attempt shows up as a refused tool call that names the right device; the account and browser are named in the status line or footer.
Surfaces: tool.call everywhere; SessionMode terminal + desktop (label drawn on desktop only). Events: `session.start`, `tool.call`, `ui.render SessionMode`.
Pains: usage-14, usage-15, usage-16, browsers-9, browsers-10.
Tests: no browser.json → no env change, no label, no deny; browser.json present → `$.env.set('BROWSER', router)` once; select_browser wrong id → deny with the right id; right id → passes; switch_browser → deny; non-Chrome tool untouched; sub-agent Chrome calls get the same guard; account mismatch → one toast; desktop label appended without dropping other labels, terminal label absent; malformed browser.json → no-op plus a debug log.
Fallback: launcher-exported `BROWSER`, the SessionStart context line and the steer-channel guard (section 6) do the same job without mods.
Risk: Nebi sometimes wants the other browser for a one-off; he says so and the agent edits browser.json, or he disables the mod.

### 3.6 nebi-stay (new) — no sessions he did not ask for
**Does.** `prompt.submit` records whether Nebi's own prompt (origin composer or bridge) asks for a terminal, tab, window, split or new session. `tool.call` on Bash denies, unless asked this turn: `term.mjs`, `open -a/-na Ghostty`, `osascript …Ghostty`, and interactive `claude` / `claude-a|b|nebi|omer` / `claude-profile` launches. It allows `claude -p/--print` and admin subcommands (`plugin`, `mcp`, `update`, `agents`, `--version`, …). Sub-agents are always denied. Deny reason: "Nebi opens sessions himself. Put a paste-ready prompt in your reply instead: one code block, first line names the project and account."

**How Nebi notices.** No Ghostty window or tab appears unless he asked; the reply carries a prompt he can paste.
Surfaces: none drawn. Events: `prompt.submit` (observe), `turn.start` (reset), `tool.call` (Bash).
Pains: usage-23 ("That you opening a new session? If so don't do it. I want you to just give me a prompt").
Tests: term.mjs without an ask → deny; "open a new terminal for the theme work" → allowed that turn only; `claude -p "…"` and `claude plugin validate` → allowed; `open -a Ghostty` and an osascript Ghostty line → deny; sub-agent → deny even when asked; a peer- or notification-started turn never counts as asked; non-Bash untouched.
Fallback: the CLAUDE.md §10 rewrite (section 6).
Risk: a false positive on a command that mentions `claude`; the allowlist and the clear reason keep it recoverable.

### 3.7 nebi-red-button (kept, fixed)
**Does.** Same holds (rm -rf, force push, destructive SQL, sends, deploys) with Run / Block / Allow (r/b/a). Changes: fix the 6 red tests (the stub records the PushNotification call) [modsapi-6]; add the missing tests [modsapi-7]; copy "[3]" becomes "[a]" (`register.tsx:319` vs `:300`); remove `$.ui.status` (`register.tsx:151, 169`); while holding, write `~/.claude/nebi/beacons/<sessionId>.hold.json` `{version:2, sessionId, project, what, since}` and delete it on every exit; an `unload` close (its drawing threw) blocks at once instead of waiting 10 minutes; speak and push once per hold, `userConfig.speech` on/off, default on.

**How Nebi notices.** The hold row is unchanged; the warning line under the prompt is gone; other sessions show this one as needing him while a hold waits.
Surfaces: terminal + desktop (AbovePrompt), Pane only on `/redbutton`. Events: as today minus `$.ui.status`.
Pains: irreversible-action safety (doctrine §0 exception) without the warning look [clutter-4].
Tests: the modsapi-7 list (Esc as person close, first choice wins, plugin-origin close records nothing, unload-origin close blocks, interrupt while held and queued, timeout on the mocked clock, two concurrent holds with a stale-id press, reload clears a dead hold, status/speak/push once, sub-agent immediate deny), plus: hold file written on hold and removed on run/block/allow/timeout/unload; no `$.ui.status` call; copy shows "[a]".

### 3.8 nebi-model-lock (kept, quieter)
**Does.** Unchanged enforcement of doctrine §0 (a named sub-agent model goes on the Agent call's `model` parameter) [modsapi-29]. The `🔒` label moves from PromptHint `tail` (`register.tsx:93-99`) to a SessionMode label, which the desktop also draws [modsapi-13] and which no hint rewrite can erase. Toast when a lock is set or cleared; none per rewritten spawn (`register.tsx:66`).
**How Nebi notices.** `🔒 sonnet scouts` at the right of the footer, in both apps; one toast when he names a model.
Events: `session.start`, `prompt.submit`, `agent.spawn`, `command.run lock`, `ui.render SessionMode`.
Tests: existing 3 plus: label in `modes` on terminal and desktop, keeping labels already there; no PromptHint hook registered; spawn rewrite raises no toast; lock set raises one.

### 3.9 nebi-wispr (kept, quieter)
**Does.** Same glossary fixes and sound-alike notes to Claude. At most one toast per prompt, only when it changed a word ("Wispr: scapling → Scrapling"); guesses go to the model's context only, without the "/wispr add" hint he never uses (`register.tsx:39, 52`).
**How Nebi notices.** A word he dictated wrong arrives fixed, with one small toast; nothing else.
Events: `session.start`, `prompt.submit`, `command.run wispr`.
Tests: existing 9 plus: correction → exactly one toast; guess only → context note and zero toasts; correction plus guess → one toast.

### 3.10 nebi-plan-rail (reworked) — progress, quietly
**Does.** Drops its registered tool, its `prompt.compose` system section, its band rows, its pane and its tick sound (`register.tsx:10, 424, 490, 546`). Observes the built-in `TaskCreate`, `TaskUpdate` and `TodoWrite` calls of the main loop (d.ts:15613, 15634, 15654) and adds one SessionMode label: `steps 3/5` while tasks are open, `steps ✓ 5/5` when all are complete, cleared on the next prompt after that.
**How Nebi notices.** A dim `steps 3/5` at the footer's right answers "how much longer?" without a question; `✓ 5/5` is a second, mechanical done cue next to the model's own claim.
Events: `turn.start`, `tool.call` (observe), `ui.render SessionMode`.
Pains: modsapi-10 (the old rail's model and screen noise), "it's unclear when something is done".
Tests: 5 TaskCreate + 3 TaskUpdate completed → `steps 3/5`; TodoWrite list → counts from the list; `deleted` removes a task; sub-agent task calls ignored; all done → `steps ✓ 5/5`, cleared on the next prompt; no tool registered and no AbovePrompt hook; terminal and desktop loops.
Risk: the built-in task panel (S9) shows the same list while it is open; the label is one dim word.

---

## 4. Dropped

- **nebi-aside**: the built-in `/btw` does the same [modsapi-9]; `??` and `/aside` were used 0 times since 10-02 [usage-18].
- **nebi-fleet-radar**: `/fleet` used 0 times [usage-18]; it writes state twice per tool call and runs a 1 s ticker while its pane is closed [modsapi-8].
- **nebi-constellation** as a separate mod: merged into nebi-beacon (reader and toast); its `/sessions` pane (0 uses) and its `$.ui.status` line are dropped [usage-18, clutter-4].

---

## 5. CONTRACT.md changes (replacement text for the shared rules)

**Attention rule (new, first section).** Nebi must be able to tell done, working or needs-you at a glance in any session. A mod either makes that signal clearer or makes something else quieter. Nothing may compete with the signal.

**Screen owners.**

| Site | Owner | Rule |
|---|---|---|
| AbovePrompt (band) | nebi-beacon (one status row); nebi-red-button (its hold row, only while holding) | No other mod draws here. Both keep `below` and yield to `hasSurvey`. |
| Spinner | nebi-beacon | message rewrite only |
| PromptHint | nebi-footer | rewrites `hint`; **no mod uses `tail`** (a rewrite drops it [clutter-9]) |
| SessionMode | shared | each mod appends at most one label of ≤ 18 cells; never repeats a fact the terminal status line shows (draw such a label only when `e.surface !== 'terminal'`) |
| ToolResult, ToolUse | nebi-quiet | errored and interrupted rows always pass through |
| AssistantMessage | nebi-stamp | the final reply is never hidden |
| ToolProgress | nebi-footer | |
| TurnDuration, InfoNotice, UserMessage, ToolGroup, AskUserQuestion | nobody | settings handle TurnDuration; the rest stay the engine's |
| Pane | opened only when Nebi runs the mod's command | never unasked |

**Banned.** `$.ui.status` (drawn as `⚠ <plugin>:` in warning color [modsapi-1]); animation (Raster or Svg loops, timers under 1 s); answer-option Buttons or prompt fills offered to Nebi; `$.model.fork` to write UI text; registering model tools or system-prompt sections without the lead's sign-off; sounds; panes opened unasked; a feature reachable only through a command.

**Toasts.** Allowed: beacon (a session flipped to need; batched, ≥ 10 s apart), nebi-browser (wrong account, once per session), nebi-model-lock (lock set or cleared), nebi-wispr (≤ 1 per prompt), nebi-red-button (sub-agent call stopped). Nothing else.

**Voice.** nebi-beacon (`speech` config, default need-only, always names the project) and nebi-red-button (one line per hold). Nobody else.

**Beacon files v2.** Folder and file name unchanged. Fields: v1 fields minus `ask`, plus `account` ("A"/"B"), `browser` (label or absent), `writer` ("mod"/"hook"). Readers accept v1 and v2. Staleness: `writer:"mod"` 90 s after `heartbeatAt`; `writer:"hook"` 12 h after `updatedAt`. Hold files `<sessionId>.hold.json` (written by nebi-red-button) count as need. The Stop hook writes a `writer:"hook"` file only when no fresh mod file exists; a mod always overwrites.

**Shared events.** `prompt.submit`: nebi-wispr rewrites text; nebi-stay and nebi-model-lock only read. `tool.call`: nebi-red-button may hold or deny; nebi-stay may deny Bash terminal and session launches; nebi-browser may deny Claude in Chrome calls; their rule sets must not overlap (hook order is unconfirmed); everyone else observes and passes on. `agent.spawn`: nebi-model-lock rewrites `model`.

**Quality bar additions.** Every mod's header names its no-mod fallback. Any noise (speech, toasts, hiding) sits behind a `userConfig` switch. Done means: `claude plugin validate` passes; `claude plugin test` passes over terminal and desktop (nebi-red-button's suite included); `tsc` clean when installed (it is not today [modsapi-16]); **and a screen proof**: a before/after text capture of the real screen, because `claude plugin test` never checks what paints [skills-3]. `/usr/bin/screen -dm` plus `screen -X hardcopy` works today with no install [skills-7]; tui-test is the better tool once Nebi approves installing it [skills-4].

---

## 6. Doctrine changes (so the nebi skills and the mods work as one)

**Output style** (`claude-home/output-styles/nebi.md`; commit the pending line 21 with it):
- Keep the three status lines, "make sense on its own" (line 21) and the `⏳ Working` rule (line 25).
- Replace line 23 with: "Ask once, in plain words, in the chat. Put the open question just above the status line with your recommendation in one sentence; if it is still open from an earlier reply, repeat it the same way. No numbered answer menus in prose, and never 'the two questions above'. If the details live on a page, the chat still carries the question itself. For a real choice between two or three options, use the AskUserQuestion card, mark your pick (Recommended), and word each question so it makes sense alone." Receipts: usage-1, usage-2 (37 of 44 picks were the Recommended one), usage-20, clutter-26, and the usage verifier's note that 9 of 28 typed card answers pushed back on unclear questions.
- Add to the top bullets: "Answer first. No recap of the steps you took and no closing summary unless asked." [usage-28]
- Keep the PushNotification sentence: beacon skips its own push when the model sent one, and it is the push fallback when mods are off.
- Mirror in `codex-home/AGENTS.md:74`.

**CLAUDE.md** (`claude-home/CLAUDE.md`, mirror in `codex-home/AGENTS.md:152`):
- §10 line 135 becomes: "Open a terminal, tab or session only when I ask; otherwise put a paste-ready prompt in your reply. When I ask, use `node ~/.claude/nebi/term.mjs`; never Terminal.app or iTerm." [usage-23, S11]
- §3 "Long output goes in a page": append "The question itself always stays in the chat." [usage-1]
- When this ships, add one line to `~/.claude/nebi/failure-log.md`: the old re-ask rule (options restated) collided with "don't tell me what to answer" (doctrine §3b).

**Status line** (`claude-home/nebi/statusline.mjs`, tests in `tests/hooks.test.mjs`):
- Model: `display_name` without " (1M context)". Context: no " (1M)".
- Add `wk NN%` from `rate_limits.seven_day.used_percentage` next to `5h` (he typed `/usage` 74 times) [usage-25, S6].
- New leading segment from `~/.claude/nebi/beacons/*.json` (+ `.hold.json`), excluding its own `session_id`: yellow badge with the names in need (longest wait first, max 3, then "+N"), green names done within 10 min. Same staleness rules as the contract. Read ≤ 64 files, skip unparsable ones, never throw.
- Account and browser: `A Main` / `B RapidSneakers` from `CLAUDE_CONFIG_DIR` and `<cwd>/.claude/browser.json`; omit the letter when the env is not inherited.
- Separator ` · `; branch last so truncation eats it first.
- `deploy.mjs` `buildStatusLine()` adds `refreshInterval: 5` (S5).

**Stop hook** (`claude-home/hooks/verify-before-stop.mjs`):
- Filter ambient artifact watchers (type `monitor` and the description pattern) before `countRunning` (`:86-87`) and before the early-stop test (`:105`); this also brings the §3 early-stop and §6 proof nudges back to life [clutter-3].
- Nudge once per identical running set per session (signature kept next to the ledger), so a legitimately long workflow does not print "Stop hook feedback" on every stop.
- Fallback beacon: parse the final status (it already does, `finalStatus`) and write `writer:"hook"` `{kind, text, project, cwd, account, updatedAt}` unless a fresh `writer:"mod"` file exists. File an upstream `/feedback` that the Stop payload leaks ambient watchers.
- Tests: an artifact watcher alone → no nudge and the early-stop check runs; a real shell task still nudges, but only once per set; fallback file written without a mod file, skipped with a fresh one.

**Other hooks.**
- `session-end-state.mjs`: delete this session's `writer:"hook"` beacon.
- `session-start.mjs`: when `<cwd>/.claude/browser.json` exists, add one line: "Browser for this project: RapidSneakers Chrome (Chrome device bbbbbbbb, account B). Use select_browser with that deviceId; never call switch_browser." [browsers-25]
- `steer-channel.mjs`: the same select/switch deny as nebi-browser, for sessions where mods are off [browsers-25].

**Settings** (through `deploy.mjs` with `??=`, the way it sets skillListingBudgetFraction, so the repo is the master):
- Apply: `showTurnDuration:false`, `awaySummaryEnabled:false`, `env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES:"100000000"`, `enabledPlugins["cc-plugin-you-should-know@builtin"]:false`, `statusLine.refreshInterval:5`. Already applied 13:19Z: `spinnerTipsEnabled:false`, `promptSuggestionEnabled:false`.
- After the build: enable the new set (beacon, quiet, footer, stamp, browser, stay, red-button, model-lock, wispr, plan-rail); remove aside, fleet-radar and constellation from `enabledPlugins` and the marketplace.
- Nebi's call (section 9): `theme:"auto"`, `DISABLE_AUTOUPDATER` plus an update job, `inputNeededNotifEnabled:true`, `viewMode:"focus"` trial.

**Skills.**
- nebi-sessions: a handoff to another session is a paste-ready prompt (project, account, task, checkpoint path); never open the session yourself unless asked.
- nebi-maintenance: a short "mods" section pointing at `mods/CONTRACT.md` (owners, banned list, screen proof) so any future mod work starts there.
- Shortlist for Nebi (not installed): `microsoft/tui-test` as the base for a nebi-mod-verify skill [skills-4]; `karanb192/claude-code-mods` mod-builder's gate/footprint/prove scripts as a reference, after reviewing its star-request commit [skills-1].

**Launcher** (`~/.local/bin/claude-profile`, no repo master yet; consider adding one): set `env["BROWSER"]` to the router for both accounts and `env["CLAUDE_CODE_IDLE_THRESHOLD_MINUTES"]` (S10); optionally warn when the cwd's browser.json names the other account [browsers-30, idea only].

---

## 7. Per-project browser setup

**The facts.** The two browsers are two Chrome profiles: Default "nebi" (device aaaaaaaa, Karpet24/CNL logins, account A) and Profile 3 "Your Chrome" (device bbbbbbbb, RapidSneakers, account B) [usage-13, browsers-1]. Since the 10-01 launcher, account A runs ecommerce-workspace and nebi-skill and account B runs cnlsneakers [usage-12, browsers summary]. Claude in Chrome binds to the account the extension is signed into, so the right account means the right browser for Chrome tools [browsers-19]. Artifacts and links go through `$BROWSER`, else `open`, and macOS hands them to whichever Chrome profile was focused last, which changes by the hour [usage-16, browsers-3]. `select_browser` writes one device per account, so the last pick wins [browsers-9, browsers-10]; `CLAUDE_CHROME_PAIRED_DEVICE_ID` is only a fallback and cannot pin a project [browsers-10].

**One source of truth per project: `<project>/.claude/browser.json`.**

| Project folder | `account` | `profile` | `device` | `label` / `short` |
|---|---|---|---|---|
| `/Users/nebi/Documents/GitHub/cnlsneakers` | B | `Profile 3` | `bbbbbbbb` | RapidSneakers Chrome / RapidSneakers |
| `/Users/nebi/Documents/GitHub/ecommerce-workspace` | A | `Default` | `aaaaaaaa` | Main Chrome / Main |
| `/Users/nebi/Documents/GitHub/nebi-skill` | A | `Default` | `aaaaaaaa` | Main Chrome / Main |
| any folder without the file | A | `Default` | (auto) | Main Chrome |

```json
{ "account": "B", "profile": "Profile 3", "device": "bbbbbbbb", "label": "RapidSneakers Chrome", "short": "RapidSneakers" }
```

**Readers of that one file.**
1. **Router** `~/.claude/nebi/browser-router.mjs` (master `claude-home/nebi/browser-router.mjs`, executable): walks up from its cwd to the nearest browser.json, runs `open -na "Google Chrome" --args --profile-directory=<profile> <url>` detached, and exits 0 within ~100 ms, because Claude Code waits for the process and treats a non-zero exit as failure [browsers-4]. No file → Default profile. Anything odd → plain `open <url>`.
2. **`BROWSER`** points at the router, set by the launcher for both accounts (S10) and by nebi-browser for sessions started another way. An attached client's own `BROWSER` overrides the session's [modsapi-3], so exporting it in `~/.zshrc` too is Nebi's call (it also reaches other CLIs, which the router serves the same way). Do **not** set `CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0`: it also kills the explicit open action [modsapi-3].
3. **SessionStart line** for agents, **steer-channel** deny as the no-mod guard, **nebi-browser** deny and label with mods.
4. **Status line** label (`B RapidSneakers`) and the **beacon file** `browser` field, so a wrong-account session is visible in every session.

**Nebi's one-time clicks (optional, not agent work).** Rename Chrome Profile 3 from "Your Chrome" to "RapidSneakers" and give it a color [browsers-35]. Naming the extension connections needs `switch_browser`, which sends him a pairing click [online-10], so skip it unless he wants names in listings; the setup keys on device ids.

**The "Approve" stops.** CLI sessions run in bypass, so these are mostly the model's own safety rules and the cnlsneakers playbook line "Nebi makes the last click on anything that pays, verifies identity, accepts terms or needs 2FA" [browsers-16]. Proposed playbook change (in the cnlsneakers repo, Nebi's yes): collect the last clicks of a task into one chat ask; one explicit yes covers OAuth grants and accepting terms; he still types credentials and pays himself. The hand-edited `BROWSER-LOCK.md` and the "list_connected_browsers then select_browser" ritual become redundant once browser.json and the guards exist [browsers-27].

**Proof.** One router run per profile (opens a window, so Nebi's OK first), then publish a test artifact from cnlsneakers and confirm it lands in Profile 3 while Default was the last-focused window.

---

## 8. Build order (one builder pass per item, Opus, today on 2.1.288)

1. **No code, biggest win:** Stop hook filter + dedupe + fallback beacon; status line; settings keys via deploy.mjs; output style and CLAUDE.md lines; you-should-know off. Proof: `node --test tests/hooks.test.mjs`, `node deploy.mjs --check`, read-back of the changed files, a screen capture of the status line.
2. **nebi-beacon** rework (re-enable it after its suite and a screen proof pass).
3. **nebi-footer** (debug capture of the hint string first), **nebi-quiet**, **nebi-stamp**.
4. Router + browser.json files + launcher env + SessionStart/steer-channel lines, then **nebi-browser**; **nebi-stay**.
5. **nebi-red-button** fixes, **nebi-model-lock**, **nebi-wispr**, **nebi-plan-rail**.
6. Remove aside, fleet-radar, constellation; one combined screen proof with all ten loaded, light and dark theme.

---

## 9. Decisions Nebi owns (taste or consent)

1. `DISABLE_AUTOUPDATER` plus a daily `claude update` job: removes "Update installed" but also plugin auto-update.
2. `theme: "auto"` so dim text follows Ghostty's light/dark switch.
3. Keep Ghostty's native progress bar as the "still working" cue across tabs, or turn it off with the other workflow progress.
4. Edit diffs compact (default) or full.
5. Mid-turn notes hidden (default) or shown.
6. Speech: need-only (default), off, or need-and-done.
7. `inputNeededNotifEnabled: true` (engine push when a card or permission prompt waits).
8. A trial of the built-in focus view (`viewMode: "focus"`, needs the fullscreen renderer) before more hiding [skills-10].
9. `BROWSER` exported in `~/.zshrc` as well, and the cnlsneakers "last click" playbook change.

---

## 10. Unverified dependencies

1. The exact PromptHint `hint` string in bypass mode, and whether a rewrite drops "(shift+tab to cycle)" (inferred from minified code) [clutter-8 medium, modsapi-12 low]. nebi-footer starts with a debug capture.
2. Plugin hook order on shared sites (SessionMode label order; band order of beacon vs red-button) [clutter-9]. The design avoids depending on order.
3. Whether mods load in desktop Code tab sessions and how it draws AbovePrompt and SessionMode [browsers unconfirmed list, online-22]. The desktop is nearly unused for Claude Code (1 empty session) [usage-8].
4. That the desktop draws no custom status line (basis for showing peers in beacon's desktop row) [clutter-28 low, online-21].
5. ctrl+o behavior: ToolResult/ToolUse have no `isExpanded`, so compact rows likely show there too [clutter-19]; whether ctrl+o shows the original AssistantMessage is unconfirmed.
6. Classifying mid-turn notes from `turn.step` results and matching them to AssistantMessage text (firstmate-calm's method) [online-20, not load-bearing in the digest].
7. `open -na "Google Chrome" --args --profile-directory=…` opening cleanly in the running Chrome [browsers-26]; a project settings `env.BROWSER` reaching the opener [modsapi-3 point 5].
8. `$.env.set('BROWSER')` mid-session: confirmed medium by the browsers lane [browsers-7], listed unconfirmed by the modsapi lane.
9. Whether the status-line child inherits `CLAUDE_CONFIG_DIR` (account letter) [browsers unconfirmed list]; whether its payload's spread base envelope includes `session_id` in every case (S6 shows the spread, not each field).
10. Whether settings `env` applies before the engine reads `CLAUDE_CODE_IDLE_*` [clutter unconfirmed list]; the launcher env covers it.
11. The engine skipping a push while Nebi is at the terminal (beacon's comment and the output style claim it); whether a plugin's own `$.tool.call` PushNotification draws a transcript row [modsapi unconfirmed].
12. Whether Nebi reads or answers bridged sessions on his phone [usage unconfirmed]; this sets how much the push matters.
13. Whether directory-marketplace plugins auto-update and raise "Plugins updated" [clutter-18, modsapi-21].
14. Status-line cost with `refreshInterval: 5` across up to 9 sessions (the setting exists; the load is not measured).
15. The per-plugin 2000 ms toast throttle [modsapi-28]; beacon batches anyway.
16. Whether a deny on `select_browser` fights the built-in "ask via AskUserQuestion, never pick yourself" instruction when several browsers show [online missedByLane]; the deny reason names the device to use.
17. Which "Approve" Nebi meant (extension site permission or agent-built approval pages) [usage-31]; section 7 covers both.
18. A Ghostty tab title as a cross-session cue: Claude Code sets the terminal title unless `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` (bin:`gSo(){return Tt()||a.CLAUDE_CODE_DISABLE_TERMINAL_TITLE…`), but what it writes and whether a mod can add a state glyph is unknown. Not used.
