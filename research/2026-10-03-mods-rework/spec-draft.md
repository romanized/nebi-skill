# Mods rework: final spec draft (2026-10-03)

Judge synthesis of three designs (`design-attention.md`, `design-quiet.md`, `design-fleet.md`) against the verified research digest. Read-only research. Nothing here is applied yet.

## 1. Verdict

| Design | Missed moments / done (30%) | Declutter (25%) | 10 mods (20%) | Buildable (15%) | Browser / accounts / sessions (10%) | Score |
|---|---|---|---|---|---|---|
| **Quiet first** (`design-quiet.md`) | 8 | 9 | 8.5 | 8 | 8 | **8.4** |
| Attention (`design-attention.md`) | 9 | 8.5 | 7 | 8 | 7.5 | 8.2 |
| Fleet and browser (`design-fleet.md`) | 8 | 8 | 6.5 | 7.5 | 9 | 7.7 |

**Winner: Quiet first.** It has the cleanest screen ownership: one writer per site, the band shared only by state-exclusive writers, one `turn.complete` owner and one `AssistantMessage` owner. It never shows the same status twice in color: ❓ goes in the band, ✅/⏳ get a badge in the reply. It also covers the most clutter items with verified levers. Its weak spot is the cross-session signal: a dim SessionMode label that vanishes when mods are off. Two grafts fix that.

- **From Attention:** a no-mod, colored "other sessions" segment in the status line (refreshInterval verified, both accounts); a hook-written fallback beacon; red-button hold files counted as need; an open ask that survives background-started turns; footer capture before the hint rewrite; the "no repeated facts on the terminal" SessionMode rule.
- **From Fleet:** one route-resolution spec with account defaults; a browser clash label replacing BROWSER-LOCK.md; an origin suffix on the need row; a red-button timeout that tells the model to carry on; the launcher's admin allowlist for the session guard; BROWSER exported in `~/.zshenv`.

## 2. Goal and done

**Goal.** In any session Nebi can tell at a glance whether it is done, working or needs him. Across sessions and both accounts, a waiting session is named and timed. Everything on his clutter list is gone or shortened. Nothing pushes answer options at him. Browser work and artifact opens land in the project's Chrome profile.

**Done means** each mod passes `claude plugin validate` and `claude plugin test` over the terminal and desktop loops, red-button's suite included. tsc runs too, once installed (it is not today, modsapi-16). A live screen check shows each listed clutter string absent and the need row present, with before/after captures, because `plugin test` never sees the painted screen (skills-3). Every no-mod fallback works with `--safe-mode`.

## 3. Judge's own receipts (judge-N, cited below)

| id | Claim | Receipt |
|---|---|---|
| judge-1 | `statusLine.refreshInterval` (seconds, min 1) re-runs the status line on a timer on top of event updates | binary 2.1.288 @179690419 schema text "Re-run the status line command every N seconds in addition to event-driven updates"; timer `#E()` @188155600 |
| judge-2 | Prompt origins are typed: `composer`, `bridge`, `task-notification`, `peer`, `peer-send-message`, `auto-continuation`, … | claude-code.d.ts:8239-8330 |
| judge-3 | UserMessage rows (task notifications included) already draw as one dim line unless `isExpanded`. ToolResult and ToolUse have no `isExpanded` (it exists only at d.ts:9166 and 9340) | d.ts:9158-9170; `grep -n isExpanded` |
| judge-4 | `turn.complete` returning `{ text }` shows that text beneath the answer and never rewrites the record | d.ts:4183-4188 |
| judge-5 | SessionMode = `{ modes: readonly string[] }`. PromptHint = `{ isDraft, isWorking, hint, tail? }`; a rewritten `hint` replaces the line, `tail` with it; `tail` is drawn on the terminal only | d.ts:9524-9570 |
| judge-6 | AssistantMessage props are `text`, `isFirstOfReply`, `onScreen`, with no turn or step id; a rewrite leaves the stored message alone | d.ts:9187-9210 |
| judge-7 | Live settings (mtime Oct 3 15:19): beacon and constellation **false**; aside, fleet-radar, plan-rail, model-lock, red-button and wispr true; `cc-plugin-you-should-know@builtin` true; model `opus[1m]`; theme `dark`; awaySummaryEnabled, showTurnDuration, bashEditDiffEnabled and env unset; spinnerTips and promptSuggestion false | `python3` dump of ~/.claude/settings.json |
| judge-8 | Paired devices: A `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, B `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`, both named "Browser 1" | `chromeExtension` in ~/.claude.json and ~/.claude-max2/.claude.json |
| judge-9 | `~/.claude-max2/sessions` is a real directory with a `sessionId` per entry. `nebi/`, `plugins/` and `settings.json` are symlinks to ~/.claude. A live B process carries `CLAUDE_CONFIG_DIR=/Users/nebi/.claude-max2` | `ls -ld`; `ps -E -p 55719` |
| judge-10 | deploy.mjs masters only statusLine, outputStyle, hooks, claudeMdExcludes and skillListingBudgetFraction | deploy.mjs:9-10, 667-674 |
| judge-11 | `theme: "auto"` is a valid value | binary `ntt=["auto",...]`, theme schema "Color theme for the UI" |
| judge-12 | The launcher's admin list (agents, attach, auth, …, mcp, plugin, update, --version) and its account env handling | ~/.local/bin/claude-profile:43-51, ~67 |
| judge-13 | Task tools' `activeForm` is "shown in spinner when in_progress"; TodoWrite items carry `activeForm` | d.ts:15618, 15641, 15659 |
| judge-14 | Code refs: red-button `$.ui.status` at register.tsx:151,168, "[3]" at :319, HOLD_LIMIT_MS at :21, PushNotification at :153; beacon `$.model.fork` at :184 and push at :178; wispr toasts at :39,:52; model-lock toasts at :52,:66 and tail at :97-99; beacon `isCheck` at parts.ts:118; CONTRACT.md :10 (tail), :11 (Spinner), :13 (`$.ui.status` free); Stop hook STATUS_RE at :30, countRunning at :51-55, running branch at :86-94, early stop at :103-105; statusline.mjs :16, :30, :36, :40, :53; output style :21, :23 | `grep -n` / `cat -n` on each file |

## 4. Layer 0, no mods: config, status line, hooks, output style

This layer ships first and works even when Anthropic's rollout switch serves mods off (online-2).

| Clutter item | Lever | Owner | Depends on |
|---|---|---|---|
| "Opus 5.5 (1M context)" | statusline.mjs:16 strips `/\s*\(1M context\)$/` from `model.display_name`. The model stays `opus[1m]`; never use CLAUDE_CODE_DISABLE_1M_CONTEXT | statusline | clutter-11, usage-26 |
| "ctx 45% (1M)" | delete the `win` suffix at statusline.mjs:30 | statusline | clutter-11 |
| /usage typed 74x (only 5h shown) | add `wk NN%` from `rate_limits.seven_day.used_percentage`; ` · ` separators; `xhigh`, not `eff:xhigh`; branch last | statusline | usage-25, judge-14 |
| Other sessions waiting, invisible here | Leading segment read from `~/.claude/nebi/beacons/*.json` and `*.hold.json`, excluding its own `session_id`. A yellow badge names sessions in need, longest wait first, at most 3, then `+N`. Green names show sessions done within 10 min. Add `refreshInterval: 5` in deploy.mjs `buildStatusLine()` | statusline | usage-4, usage-7, browsers-28, judge-1, judge-9 |
| Which account and browser | `A · Main` / `B · RapidSneakers`, from `CLAUDE_CONFIG_DIR`, else by finding `session_id` in `~/.claude-max2/sessions/*.json`, and the route spec (section 7). Red on mismatch | statusline | browsers-23, judge-9 |
| "Stop hook feedback: N background tasks still running" | verify-before-stop.mjs: drop tasks with `type==='monitor'` whose description matches `/^(live updates for\|presence on) artifact /i`, before countRunning (:86-87) and before the early-stop test (:105). While real tasks run, nudge only when the reply ends ✅. File upstream `/feedback` that the Stop payload leaks ambient watchers | stop hook | clutter-1, clutter-2, clutter-3, usage-5, modsapi-24 |
| Cross-session signal when mods are off | The Stop hook writes a `writer:"hook"` beacon (v2) only when no fresh mod beacon exists; session-end-state.mjs deletes it | stop hook | browsers-28, online-2 |
| Big NEED YOU card / options twice | Output style :23 is replaced (section 9); the card is removed in nebi-beacon | output style | clutter-26, usage-20 |
| "You should know" note with 1/2/0 buttons | `enabledPlugins["cc-plugin-you-should-know@builtin"]: false` | settings | online-8, judge-7 |
| "recap:" lines | `awaySummaryEnabled: false`, flipped only after nebi-beacon v0.3 is enabled | settings | clutter-13, clutter-33 |
| "Baked for 1m 23s" | `showTurnDuration: false` | settings | clutter-14 |
| "new task? /clear to save …" | env `CLAUDE_CODE_IDLE_THRESHOLD_MINUTES=100000000` and `CLAUDE_CODE_IDLE_TOKEN_THRESHOLD=1000000000000` in settings env, mirrored in ~/.zshenv | settings | clutter-15 |
| "Update installed · Restart to update" and the "Plugins updated … reloaded" toast | env `DISABLE_AUTOUPDATER=1` plus a daily 05:30 launchd `claude update`. Deploy runs `/reload-plugins` after mod changes | settings | clutter-16, clutter-18, modsapi-21 |
| Mod reload notices | They appear only in the mod-building session (clutter-17), which keeps hot reload. The autoupdate toast goes with DISABLE_AUTOUPDATER. nebi-quiet filters InfoNotice reload lines if step 0 shows they draw there | settings | clutter-17, modsapi-21 |
| Bash "what this command changed" diffs | `bashEditDiffEnabled: false` | settings | clutter-22 |
| Prompt suggestions, spinner tips | already false (keep) | settings | clutter-21, clutter-23, judge-7 |
| Dim footer unreadable on light Ghostty | `theme: "auto"` (taste call, overrule-able) | settings | clutter-34, judge-11 |
| Ghostty OSC 9;4 tab bar | **Kept** as the cross-tab "working" cue that replaces recap and TurnDuration. Use `terminalProgressBarEnabled:false` if this is the bar he meant | settings | clutter-20, clutter-33 |
| Long replies, recaps, file lists, watcher explanations | output style: answer first, no recap or closer, no changed-file lists (the receipt has them), never explain tooling noise | output style | usage-28, usage-5 |
| deploy.mjs masters none of the new keys | deploy.mjs merges the new keys with `??=` (theme, showTurnDuration, awaySummaryEnabled, bashEditDiffEnabled, env, enabledPlugins, pluginConfigs) | settings | judge-10 |

## 5. Screen ownership (who draws where)

| Site | Owner | Rule |
|---|---|---|
| Status line | statusline.mjs (doctrine, no mod) | Own state, account, browser, other sessions |
| AbovePrompt band | nebi-beacon (need or error, 1 row, only when no turn runs) + nebi-red-button (hold row, only while holding, which happens only during a turn) | Exclusive by state; both call `next(e)` first; return `below` on `hasSurvey` |
| PromptHint, ToolProgress, ToolResult, ToolUse, InfoNotice | nebi-quiet | Errored and interrupted rows always pass through |
| AssistantMessage | nebi-replies | The final reply is never hidden |
| `turn.complete {text}` | nebi-receipt | Every other hook returns `next`'s result |
| SessionMode | shared, append-only, ≤20 cells per label, at most one per mod | Writers: model-lock (while locked), constellation (desktop peers; browser clash anywhere), browser (desktop always; terminal only on mismatch). Never repeat a fact the terminal status line shows |
| Spinner, TurnDuration, UserMessage, ToolGroup, AskUserQuestion | nobody | Engine defaults (judge-3, judge-13) |

## 6. The 10 mods

Dropped: **nebi-aside** (built-in `/btw`, modsapi-9; used 0x, usage-18). **nebi-fleet-radar** (0x; double state writes and a 1 s ticker with its pane closed, modsapi-8; its PromptHint read clashes with the single owner). **nebi-plan-rail** (it duplicates the built-in task list, and the engine shows activeForm in the spinner, judge-13; its MCP tool rows and system-prompt section are noise, modsapi-10; a 4th SessionMode label would crowd the footer).

### 6.1 nebi-beacon: reworked (from nebi-beacon)
- **Does:** Writes this session's beacon file v2: `account`, `browser` (device + label), `origin`, `askedAt`, `writer:"mod"`. It writes on every state change plus a 30 s heartbeat that restarts on `turn.start` after `/clear` (modsapi-26). At main-loop `turn.complete` it parses the last status line with the Stop hook's STATUS_RE. An **open ask** starts on ❓, or while AskUserQuestion is pending (file kind `need`, no row while the card shows). It **survives** later turns started by `task-notification` or `peer` that end ✅/⏳, and clears only on Nebi's own prompt (origin `composer` or `bridge`, judge-2). While an ask is open and no turn runs, the band draws **one row**: a yellow `NEED YOU` badge with black text, the status line's words, `· 12m`, and `· after background task` / `· from <peer>` when his prompt did not start the asking turn. An API-error stop draws a red `STOPPED` row. ✅, ⏳, aborted and missing status draw nothing. It sends one PushNotification per ask unless the model pushed that turn. **Removed:** `$.model.fork` card (register.tsx:184), Buttons and hotkeys, "reply with", scanner sweep, Spinner hook, PromptHint (moved to quiet), `$.ui.status`. Speech is behind userConfig `speak`, default off.
- **Notice:** nothing above the prompt while Claude works or after it finished. When it waits on him, one yellow row says what for and for how long, and it stays even if a background task posts more output afterwards. One phone buzz.
- **Events:** session.start, session.end, turn.start, prompt.submit (observe origin), tool.call (observe AskUserQuestion, PushNotification), turn.complete, ui.render AbovePrompt.
- **Tests:** "❓ Need you — pick the .si name" gives exactly 1 row with NEED YOU, the text and zero Buttons (terminal + desktop loops). ✅/⏳ return `below` unchanged. A task-notification-started turn ending ✅ after an open ask keeps the row. A composer prompt clears it. A bridge prompt clears it. A peer prompt does not. The origin suffix is shown for task-notification and peer. AskUserQuestion pending sets the file kind need and draws no row. Reason `error` gives a red STOPPED row. One push per ask; none when the model pushed. Spies: `$.model.fork`, `$.ui.status` and `$.audio.speak` never called (defaults). The file has account `b` under a stubbed `CLAUDE_CONFIG_DIR=…/.claude-max2` and browser from a stubbed browser.json. The heartbeat resumes after session.end(clear). Escape sequences are stripped.
- **Depends on:** clutter-6, modsapi-5, usage-20, usage-3, usage-4, usage-21, modsapi-14, clutter-27, browsers-23, browsers-28, judge-2.
- **Risk / fallback:** The row is only as honest as the model's status line. A one-row band can be collapsed. Without mods: the reply's own status line, the output style's push sentence, and the status line's other-sessions segment fed by hook beacons.

### 6.2 nebi-constellation: reworked (from nebi-constellation)
- **Does:** Every 10 s (was 3 s) it reads `~/.claude/nebi/beacons/*.json` and `*.hold.json`, covering both accounts through the symlinked `nebi/` (judge-9). It skips itself, mod files older than 90 s and hook files older than 12 h. (a) **One toast** when a peer flips into need: `⌁ cnlsneakers needs you: <what>`, batched within 10 s, behind userConfig `toast`, default on. While he works at the terminal, that peer's own phone push is likely skipped, so this is the active cue. (b) **Browser clash:** when two live sessions resolve to the same Chrome device, it appends `⚠ 2 on RapidSneakers` to SessionMode. This replaces BROWSER-LOCK.md. (c) On non-terminal surfaces only, it appends `❓ cnlsneakers 12m +1`; on the terminal the status line shows this. (d) `/sessions` prints plain text: project · account · browser · state · wait, longest wait first. No `$.ui.status`, pane or speech.
- **Notice:** a small toast the moment another session starts waiting; the status line then keeps that name yellow until he answers there.
- **Events:** session.start, `$.clock.every`, ui.render SessionMode, command.run sessions.
- **Tests:** a peer flipping to need gives exactly 1 toast; two flips within 10 s give 1 toast; its own id, stale and garbled files are ignored; a hold file counts as need; two peers on one device give the clash label and one device gives none; the terminal surface gets no peer label and the desktop gets one; other labels are preserved (append-only); spies: `$.ui.status` never called; `/sessions` lists the account and strips escapes; toast:off gives zero toasts.
- **Depends on:** clutter-4, clutter-5, modsapi-1, browsers-28, browsers-29, usage-4, usage-7, clutter-27, judge-9.
- **Risk / fallback:** The toast throttle wiring is unconfirmed (modsapi-28), and batching covers it. Fallback: the status line segment.

### 6.3 nebi-quiet: new (absorbs Attention's nebi-footer)
- **Does:** It is the single owner of built-in drawings he does not read. **ToolResult:** a Write/Edit/MultiEdit/NotebookEdit that did not error becomes one dim line (`wrote 142 lines · mods/x.ts`, `edited statusline.mjs +3 −2` from structuredPatch); userConfig `edits` compact|full, default compact. **ToolUse:** a running Workflow becomes `workflow · <name> · running`, and a finished, errored or interrupted one stays the engine's; the model's PushNotification row draws nothing unless it errored. **ToolProgress** `background_hint` gets hint `''` (terminal). **PromptHint** strips only `(shift+tab to cycle)`, `? for shortcuts` and a stray ` · `; it passes through untouched when neither is present and never sets `tail`; userConfig `footer` trim|engine. **InfoNotice** hides only lines matching reload / "Plugins changed" / "updated" text, shipped only if step 0 shows they draw there. **Step 0:** a throwaway capture hook logs `hint` in idle, typing and working states under bypass, plus InfoNotice text, with a before/after screen capture.
- **Notice:** writes take one line instead of collapsed code, a workflow is one line, the footer reads `⏵⏵ bypass permissions on · esc to interrupt`, and the ctrl+b pill is gone.
- **Events:** ui.render ToolResult, ToolUse, ToolProgress, PromptHint, InfoNotice.
- **Tests:** a Write gives one Text row with the path and line count and no content; an errored Write gives `next(e)`; Edit compact/full via `test(name,{options})`; a running Workflow gives one row and a finished one gives `next(e)`; PushNotification gives an empty Box and an errored one gives `next(e)`; Read and Bash are untouched; a hint with both substrings loses both, with no dangling ` · `; `1 shell · ← for agents` survives; a hint with neither gives props unchanged; the result never carries `tail`; footer:engine passes through; background_hint gives `''`; InfoNotice with reload text is hidden and other notices are unchanged. Live capture: a real Write shows one row and the footer lacks "shift+tab to cycle".
- **Depends on:** clutter-19, clutter-20, clutter-7, clutter-8, clutter-9, clutter-10, online-3, online-4, online-5, modsapi-11, clutter-27, judge-3, judge-5.
- **Risk / fallback:** The bypass `hint` string is inferred (clutter-8 medium). The compact rows also show in ctrl+o (no `isExpanded`, judge-3); `edits: full` restores them. No setting exists as a fallback.

### 6.4 nebi-replies: new
- **Does:** It is the single owner of AssistantMessage. (a) A block ending in a ✅ or ⏳ line draws its body unchanged, then the line as a black-text badge: green `DONE` or blue `WORKING` plus its words. ❓ passes through (the band holds need). It uses the same STATUS_RE as the Stop hook. (b) This part ships second, after a 2.1.288 port test: mid-turn working notes are hidden when the step went on to call tools, the text is under 240 chars, single line, with no `?` and no status glyph. They are classified in `turn.step` and matched by text (no step id on the props, judge-6), following the firstmate-calm method. The final reply is never hidden. userConfig `notes` hide|show.
- **Notice:** every finished reply ends in a colored DONE or WORKING badge, and the "Let me check X" lines between tool calls are gone.
- **Events:** turn.step (observe), ui.render AssistantMessage.
- **Tests:** "✅ Done — X" gives the body intact plus a green badge with X; ⏳ gives blue; ❓ passes; a block with no status line passes; a classified note is hidden while one containing `?` is shown; text equal to the final answer is shown; notes:show passes; the regex equals verify-before-stop.mjs:30; terminal and desktop loops.
- **Depends on:** skills-8, usage-3, clutter-33, clutter-27, judge-6.
- **Risk / fallback:** If the classifier misfires, `notes: show` or shipping (a) alone covers it. Fallback: the plain status line.

### 6.5 nebi-receipt: new (from beacon's DONE·unproven flag)
- **Does:** It observes `tool.call` in a main turn, sub-agents included: files written by Write/Edit/MultiEdit/NotebookEdit, and check-like Bash (beacon `isCheck`, parts.ts:118) with the outcome. At main-loop `turn.complete` after edits it returns `{text}` (judge-4): `changed statusline.mjs, nebi.md +1 · checked node --test ✓` / `· no check since the last edit` / `· check failed: npm test`. It applies the Stop hook's §6 rule (the latest check after the latest edit passed). Read-only, aborted and sub-agent turns get no line.
- **Notice:** one dim line under replies that changed files: what changed and whether it was proven.
- **Events:** turn.start, tool.call (observe), turn.complete.
- **Tests:** Write+Edit then `npm test` exit 0 gives both names and ✓; an edit after the check gives "no check since the last edit"; a failure gives ✗; a read-only turn gives `next` unchanged; more than 3 files gives `+N`; the same file twice counts once; aborted gives no line; agentId gives no line; paths are relative and escapes stripped; a shared vector with parts.ts isCheck.
- **Depends on:** usage-22, usage-3, clutter-3, judge-4.
- **Risk / fallback:** one row per editing turn; desktop drawing is unconfirmed. Fallback: Stop hook §6.

### 6.6 nebi-browser: new
- **Does:** At session.start it resolves the route with the CONTRACT route spec (section 7). If `BROWSER` is unset it sets it to `~/.claude/nebi/browser-open` (browsers-7). It guards `{ tool: /^mcp__claude-in-chrome__/ }` for main and sub-agents. `select_browser` with another device is denied, naming the label and device. `switch_browser` (a pairing broadcast he must click) is denied and pointed to `select_browser`, unless his prompt this turn asks to pair, switch or name a browser. An account mismatch denies the first page action with "restart this project with claude-omer", which the model relays in its ❓. Tab listing always passes. SessionMode label `B · RapidSneakers` on non-terminal surfaces; on the terminal only on mismatch (`⚠ use claude-omer`). No resolvable route means everything passes.
- **Notice:** pages and artifacts open in the right Chrome, a wrong-browser attempt shows as a refused call naming the right device, and pairing popups stop.
- **Events:** session.start, prompt.submit (observe), tool.call, ui.render SessionMode.
- **Tests:** browser.json at the git root is found from a subfolder; no file with env unset gives the A default, and `.claude-max2` gives the B default; BROWSER unset gives one `$.env.set`, BROWSER set is untouched; a wrong device is denied with the label and full id; the right device passes; switch_browser is denied, and passes after "pair the rapidsneakers browser" this turn; a mismatch denies the first page call and passes `tabs_context_mcp`; sub-agents get the same rules; garbled JSON means no guards and no throw; the terminal gets no label unless mismatched.
- **Depends on:** usage-13, usage-14, usage-15, browsers-1, browsers-3, browsers-4, browsers-7, browsers-9, browsers-10, browsers-11, browsers-19, browsers-23, browsers-24, browsers-25, online-10, modsapi-3, judge-8.
- **Risk / fallback:** If the project browser is offline, the deny reason says to stop and ask him to open that Chrome. Device ids go stale after a reinstall. Fallback: the BROWSER router, the SessionStart line, and the steer-channel deny.

### 6.7 nebi-session-guard: new
- **Does:** It denies Bash that opens terminals, windows or interactive sessions: `term.mjs`, `open -a/-na` Ghostty/Terminal/iTerm, osascript aimed at those, `ghostty +new-window`, interactive `claude`/`claude-profile`/`claude-nebi`/`claude-omer`. Allowed: `claude -p`, and admin subcommands per the launcher list (judge-12). The call is allowed only when this turn's `composer` or `bridge` prompt asks for a terminal, tab, window, split or session; peer and notification turns never count. Sub-agents are always denied. The reason: "Nebi opens sessions himself: give one fenced paste-ready prompt with the launch line (claude-nebi|claude-omer + folder)."
- **Notice:** no Ghostty window he did not ask for; a paste-ready prompt instead.
- **Events:** prompt.submit (observe), tool.call (Bash).
- **Tests:** term.mjs with no ask is denied; "open a new terminal for cnlsneakers" passes that turn only; a sub-agent is denied even when asked; a task-notification turn is denied; `claude -p`, `claude plugin validate`, `open https://…` pass; osascript Ghostty and `open -na Ghostty` are denied; non-Bash is untouched.
- **Depends on:** usage-23, usage-10, judge-2, judge-12.
- **Risk / fallback:** False positives are recoverable (the reason tells the model to ask). Fallback: the CLAUDE.md §10 rule.

### 6.8 nebi-red-button: reworked
- **Does:** The same holds (r/b/a) during a turn; sub-agents are denied at once. It drops `$.ui.status` (register.tsx:151,168). It writes `~/.claude/nebi/beacons/<sessionId>.hold.json` while holding and deletes it on every exit. The 10-min timeout (:21) denies with "Nebi didn't answer in 10 min. Skip this step, carry on with the rest, and put the exact command in your ❓ line." An unload-origin close denies at once. The copy "[3]" becomes "[a]" (:319). One push per hold (`push` default on); speech `speak` default off. The red suite goes green, and the Esc, interrupt, timeout and concurrency tests are added.
- **Notice:** the hold row only while it holds, no yellow warning line, the session keeps going if he doesn't answer, and other sessions' status lines show the hold.
- **Events:** session.start, tool.call, ui.close, ui.render AbovePrompt, ui.render Pane, command.run redbutton.
- **Tests:** fix the 6 failures (the stub expects PushNotification); Esc with person origin gives deny plus cleanup; Esc after a press keeps the first choice; a plugin-origin close records nothing; an unload close denies at once; interrupt while held and while queued (export holdCall, AbortController); a mock.clock timeout reason contains "carry on"; two concurrent holds with a stale-id press; reload clears a dead hold; the hold file is written on hold and removed on run/block/allow/timeout/unload; `$.ui.status` never called; one push; the listing shows [a]; band rows only while working.
- **Depends on:** modsapi-6, modsapi-7, modsapi-1, modsapi-18, clutter-4, judge-14.
- **Risk / fallback:** A crash leaves a hold file, which expires under the 12 h hook-file rule.

### 6.9 nebi-model-lock: reworked
- **Does:** The same §0 enforcement on `agent.spawn`. The lock label moves from the PromptHint tail (:97-99) to one SessionMode label, `🔒 sonnet scouts`, which the desktop also draws and no hint rewrite erases. Both toasts are removed (:52,:66). `/lock` prints the lock as text.
- **Notice:** `🔒 …` at the footer's right while a lock holds.
- **Events:** session.start, prompt.submit, agent.spawn, command.run lock, ui.render SessionMode.
- **Tests:** the existing 3 pass; the label is appended once with others preserved; no PromptHint hook is registered; `$.ui.toast` is never called.
- **Depends on:** modsapi-13, clutter-9, clutter-5, judge-5.
- **Risk:** low.

### 6.10 nebi-wispr: reworked
- **Does:** The same glossary corrections. One toast per prompt, only when it actually changed his words (honesty, §3b). Guesses go to `e.context` only, without the "/wispr add" hint (:52). The `??` aside rule is removed.
- **Notice:** a misheard word arrives fixed with one small toast; nothing else.
- **Events:** session.start, prompt.submit, command.run wispr.
- **Tests:** the existing 9 pass; a correction gives exactly 1 toast; a guess only gives 0 toasts plus a context line; both give 1 toast; a leading `??` is not special.
- **Depends on:** clutter-32, judge-14.
- **Risk:** low.

## 7. Browser and accounts

- **Facts.** The two browsers are two Chrome profiles: Default "nebi" (A, device `aaaaaaaa-…`) and Profile 3 "Your Chrome" (B, device `bbbbbbbb-…`) (usage-13, browsers-1, judge-8). Claude in Chrome follows the account the extension is signed into (browsers-19). Artifact opens and clicked links go through `$BROWSER`, else `open`, which lands in the last-focused profile (browsers-3, modsapi-3). select_browser stores one device per account; `CLAUDE_CHROME_PAIRED_DEVICE_ID` cannot pin a project (browsers-9, browsers-10).
- **Route spec (CONTRACT section).** Walk up to the git root for `.claude/browser.json` = `{version:1, label, chromeProfile, deviceId, claudeAccount}`. Otherwise use `~/.claude/nebi/browsers.json` by account (`CLAUDE_CONFIG_DIR` unset = a, contains `.claude-max2` = b). cnlsneakers = `{RapidSneakers Chrome, Profile 3, bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb, b}`; nebi-skill, ecommerce-workspace and Karpet24 = `{Main Chrome, Default, aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, a}`. Readers: router, SessionStart, steer-channel, statusline, nebi-browser, nebi-constellation.
- **Router.** `claude-home/nebi/browser-open` (executable node). It resolves the route from its cwd, runs `open -na "Google Chrome" --args --profile-directory="<profile>" "<url>"` detached, falls back to `open <url>`, and **exits 0 within ~100 ms**, because Claude Code waits for it and treats non-zero as failure (browsers-4). `BROWSER` is exported in `~/.zshenv`, because an attached client's BROWSER overrides the session's (browsers-8, modsapi-3); nebi-browser's `$.env.set` covers the rest. **Never** set CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0, since it also kills the explicit open (modsapi-3).
- **Agents.** session-start.mjs (:36) adds one line: label, profile, device, account, "select_browser with this device; never switch_browser; never ask which browser". steer-channel.mjs (:26) denies the wrong device and switch_browser when mods are off.
- **Launcher.** `claude-profile` with no account argument takes `claudeAccount` from browser.json and warns on a mismatch (browsers-30). Optional `CLAUDE_CODE_ENABLE_CFC=1` for B.
- **His one-time clicks.** Rename Profile 3 to "RapidSneakers" and give it a color (browsers-35). Optionally name both extension connections through an allowed pairing turn.
- **Approve stops.** These come from the model's safety rules and the cnlsneakers playbook line (browsers-16), not from site permissions in bypass (browsers-15). See open decisions.
- **Proof.** One router run per profile, then a test artifact published from cnlsneakers must land in Profile 3 while Default was last focused.

## 8. Contract changes (mods/CONTRACT.md)

1. **New top rule.** A mod either makes done / working / needs-you clearer or makes something quieter. At rest the set adds at most one band row (need) and one receipt row (editing turns). No animation, no sound.
2. The **ownership table** in section 5 replaces CONTRACT.md:9-13.
3. **PromptHint tail is retired** (a rewrite drops it, clutter-9, judge-5); this replaces :10. Labels go to SessionMode (append-only, ≤20 cells, one per mod, no repeated status-line facts on the terminal).
4. **`$.ui.status` is banned** (modsapi-1); this replaces :13. **Toast allowlist:** constellation (peer flip, batched), wispr (≤1 per rewritten prompt), red-button (sub-agent call stopped). Otherwise only as the reply to a command he typed.
5. **Banned:** answer-option Buttons or prompt fills offered to Nebi; `$.model.fork` for UI text; system-prompt sections or model tools; panes opened unasked; features reachable only through a command.
6. **Voice and push:** speech off by default (beacon and red-button userConfig). Push: beacon once per ask (skipped when the model pushed), red-button once per hold.
7. **Beacon v2:** `ask` keeps only `{what}`; adds `account`, `browser`, `origin`, `askedAt`, `writer`. Readers accept v1 and v2. Staleness: mod files 90 s after heartbeatAt, hook files 12 h after updatedAt. `<id>.hold.json` counts as need.
8. **Shared events:** prompt.submit is rewritten only by wispr; beacon, browser, session-guard and model-lock read it. `tool.call` deniers have disjoint sets: red-button (destructive or outward), browser (Chrome tools), session-guard (terminal and session Bash). agent.spawn is rewritten only by model-lock. Remove the aside and fleet-radar lines. Nothing relies on hook order (unconfirmed, clutter-9).
9. **One status regex and one proof rule**, shared by the Stop hook, beacon, replies and receipt.
10. **The route spec** (section 7).
11. **Kill switch** `NEBI_MODS_OFF` (`all` or a comma list) makes a mod pass-through. Every mod's header names its no-mod fallback.
12. **Done bar:** validate + plugin test (terminal and desktop) + tsc when installed + a debug log showing "hooks module loaded" (skills-6) + a `screen -dm` / `screen -X hardcopy` paint check asserting strings absent or present (skills-7) + a `--safe-mode` baseline (skills-5).

## 9. Doctrine changes

- **Output style** (`claude-home/output-styles/nebi.md`; mirror in `codex-home/AGENTS.md:74`). Commit the pending :21. Replace :23 with: "Ask once, in plain words, in the chat: one question per open decision just above the status line, with your recommendation in a short clause. No answer menus or reply-with scripts; never point at a question by count. A page can hold detail, but the question itself always stays in the chat. Use AskUserQuestion only for a blocking either/or, with the pick marked Recommended and its options not repeated in prose." Add: "Answer first; no recap of earlier steps, no closing summary; at most one short line per phase between tool calls; no changed-file lists; never explain tooling noise (watchers, hooks, reloads)." Keep the push sentence as the no-mod fallback.
- **statusline.mjs and deploy.mjs:** as in section 4, with tests in `tests/hooks.test.mjs`.
- **verify-before-stop.mjs:** the watcher filter, the ✅-only nudge while real tasks run, and the hook beacon. A node test with three payloads (watcher-only + ⏳ gives the §3 soft check; real workflow + ⏳ gives silence; real workflow + ✅ gives the nudge).
- **session-start.mjs / steer-channel.mjs / session-end-state.mjs:** the browser line, the browser deny, and hook-beacon cleanup.
- **CLAUDE.md §10:** "Open a terminal, tab or session only when I ask in that message; otherwise put a paste-ready prompt in your reply." **§3:** "The question itself always stays in the chat." Add one failure-log line: the re-ask rule (options restated) collided with "don't tell me what to answer".
- **Skills:** nebi-sessions makes a handoff a paste-ready prompt (project, account, task, checkpoint) and never opens a session. nebi-orchestration says sub-agents never open terminals or pair browsers, and briefs say "report risky commands to the lead". nebi-maintenance adopts the done bar and points `capability-routing.md` at the route spec. A new **nebi-mod-verify** skill does the screen-hardcopy paint check, the `--safe-mode` baseline and the debug-log load check.
- **Repo:** `mods/` is untracked (`?? mods/`); commit it when Nebi asks. Build mods in one dedicated session.

## 10. Build order

1. Layer 0 (section 4) plus the output style. Prove it by reading back the diff, running `node --test` on the hooks and statusline, and taking one screen capture.
2. The step-0 capture hook (PromptHint `hint` and InfoNotice text in bypass).
3. beacon + replies (a) + receipt + quiet, then flip `awaySummaryEnabled:false`.
4. browser + router + session-guard + constellation.
5. red-button, model-lock and wispr fixes; disable then remove aside, fleet-radar and plan-rail.
6. replies (b) after the port test.

## 11. Unverified dependencies (each has a first check)

- The bypass PromptHint `hint` string, and whether a rewrite drops "(shift+tab to cycle)" (clutter-8 medium, modsapi-12 low). Check: step-0 capture.
- Whether the status-line child inherits `CLAUDE_CONFIG_DIR`. The claude process has it (judge-9). Fallback: `session_id` lookup in `~/.claude-max2/sessions`; whether the payload always carries `session_id` is unverified (docs list it).
- Whether `open -na "Google Chrome" --args --profile-directory=…` lands cleanly in the running Chrome (browsers-26).
- Whether settings env applies before the engine reads `CLAUDE_CODE_IDLE_*` and `DISABLE_AUTOUPDATER` (mirrored in ~/.zshenv).
- Whether mods load and draw in the desktop Code tab (barely used, usage-8), and whether the desktop draws `turn.complete {text}`.
- Whether reload notices draw through InfoNotice (online-18; step-0 capture).
- The firstmate-calm `turn.step` classifier on 2.1.288 (verified only to 2.1.284).
- Whether ctrl+o shows the original AssistantMessage (judge-6 wording suggests the stored message).
- The 2000 ms per-plugin toast throttle (modsapi-28).
- Whether a plugin's own `$.tool.call('PushNotification')` draws a transcript row.
- Whether directory marketplaces take part in plugin auto-update (clutter-18, modsapi-21).
- Status-line load at `refreshInterval: 5` across up to 9 sessions (not measured).
- Which "Approve" he meant (usage-31). The setup covers both.

## 12. Decisions only Nebi can make

1. **cnlsneakers consent rule.** Replace "Nebi makes the last click on anything that pays, verifies identity, accepts terms or needs 2FA" with one batched up-front yes per browser run for OAuth grants, terms and installs. He still types credentials, 2FA and payments himself. Also retire BROWSER-LOCK.md and the list-then-select ritual in 8 docs once browser.json lands.
2. **Paint-check tool.** Install `tmux` or microsoft/tui-test (beta) for a color-capable screen check, or stay on `/usr/bin/screen` hardcopy (works today, no color).
