# Mods rework: fleet + browser design

Designer lane, 2026-10-03. Built only on findings marked confirmed or partly in the verified digest (ids like `clutter-6` point there). Where a finding was "partly", the corrected claim is used. Claims from my own reads carry a file:line receipt.

## Angle

Nebi runs a fleet: a median of 2 and up to 9 Ghostty CLI sessions (usage-7, usage-8), two Claude accounts (usage-10, usage-11), and two Chrome profiles tied one-to-one to those accounts (usage-13, browsers-1, browsers-19). The asks he misses are the ones that come up while he is somewhere else: a turn started by a background task or a peer session ends on ❓ while he is in another tab (usage-4), or the decision sits on a page he never opens (usage-1). So the design does four things:

1. **One state signal per session**, drawn by one owner, that always matches the reply's own status line. No answer menus.
2. **One quiet fleet signal in every session**: which other session is waiting on him, and for how long. It works across both accounts because the beacon folder is shared (browsers-28; usage digest missedByLane on the symlinked `nebi/` dir).
3. **One source of truth per project for account and browser** (`<project>/.claude/browser.json`). It feeds the URL opener, the session context, the footer label and the Chrome-tool guards. Every piece has a no-mod fallback.
4. **Approvals that don't stall the fleet.** Sub-agents are never held. Pairing clicks are avoided. Hand-offs are batched into one ask up front. A hold that times out tells the model to carry on with the rest of the work.

Most of the clutter goes away in settings, the status line, the Stop hook and the output style before any mod code is written (clutter summary; the earlier Fable opinion). The mods do the rest, and each one has a fallback, because installed mods can be switched off remotely (online-2, modsapi-2).

Live state at design time: `~/.claude/settings.json` (mtime Oct 3 15:19) has `nebi-beacon@nebi-mods: false` and `nebi-constellation@nebi-mods: false`. The beacon card and the constellation warning are therefore already off in new sessions, and so are the beacon files the fleet view needs. The rework turns beacon back on and retires constellation.

---

## 1. Declutter plan

Do these in this order. Rows 1–12 need no mod code.

| # | Item | Lever | Owner | Rests on |
|---|---|---|---|---|
| 1 | "(1M context)" after the model name | `statusline.mjs:16`: strip `/\s*\(1M context\)$/` from `model.display_name`. The model stays `opus[1m]`. Do **not** use `CLAUDE_CODE_DISABLE_1M_CONTEXT`. | statusline | clutter-11, usage-26 |
| 2 | "(1M)" after ctx % | `statusline.mjs:30`: delete the `win` suffix. | statusline | clutter-11 |
| 3 | /usage typed 74× because the line shows only 5h | Add `7d:NN%` from `rate_limits.seven_day.used_percentage` next to `5h:`. | statusline | usage-25 (partly), usage digest missedByLane |
| 4 | "Stop hook feedback: N background tasks still running" on every stop | `verify-before-stop.mjs:51-55,86-94`: before counting, drop tasks whose `description` matches `/^(live updates for\|presence on) artifact /`. Apply the same filtered list to the early-stop test at `:105`. Do not drop every `type==='monitor'`. This also brings back the §3 early-stop and §6 proof checks, which never ran while a watcher was armed. | stop hook | clutter-1, clutter-2 (corrected), clutter-3, usage-5, online-6 (no mod can hide this row) |
| 5 | NEED YOU card with numbered answers | nebi-beacon rework: no `$.model.fork`, no option Buttons, no "reply with". The band shows the reply's own ❓ text. | mod:nebi-beacon | clutter-6, modsapi-5, usage-20 |
| 6 | Option menus inside the replies themselves | Output style line 23: drop "the options"; restate the decision plus a recommendation in 1–2 lines, no numbered menus. | output style | clutter-26, usage digest missedByLane (menu shown twice) |
| 7 | "You should know" note with 1/2/0 buttons | `enabledPlugins["cc-plugin-you-should-know@builtin"]: false` | settings | online-8, online digest missedByLane |
| 8 | "▲ nebi-constellation: 3 need you" drawn as a warning | Ban `$.ui.status` in every mod. The fleet count becomes a dim SessionMode label owned by nebi-fleet. | mod:nebi-fleet (+ CONTRACT) | clutter-4, clutter-5, modsapi-1 |
| 9 | "recap:" lines (they also repeat the status line) | `awaySummaryEnabled: false`. The beacon band replaces them, so do this only once beacon is back on. | settings | clutter-13, clutter-33 |
| 10 | "Baked for 1m 23s" | `showTurnDuration: false`. This also hides "Waiting for N agents"; the beacon band shows the running agent count instead. | settings | clutter-14 (partly) |
| 11 | "new task? /clear to save …" | env `CLAUDE_CODE_IDLE_THRESHOLD_MINUTES=100000000`, in settings `env` and also in `~/.zshenv` (it is unconfirmed whether settings env lands before the engine snapshots env). | settings | clutter-15 |
| 12 | "Update installed · Restart to update" | env `DISABLE_AUTOUPDATER=1`, plus an out-of-band daily `claude update` from `session-start-sweep.sh`. This also stops plugin auto-update and its "Plugins updated … reloaded" toast. | settings | clutter-16, clutter-18 |
| 13 | "bypass permissions on (shift+tab to cycle)" | No setting exists (online-5). nebi-beacon owns PromptHint and rewrites `hint` to drop "(shift+tab to cycle)" and "? for shortcuts". After a rewrite the engine redraws the mode pill without its cycle-hint child. Needs a screenshot to confirm. | mod:nebi-beacon | clutter-7, clutter-8, online-4 (partly), clutter-30 |
| 14 | Code previews in Write/Edit results | nebi-calm ToolResult hook: one line, `Created path · 120 lines` or `Edited path +12 −3`. Errored rows pass through. | mod:nebi-calm | clutter-19, online-3 |
| 15 | Workflow progress inside the transcript | nebi-calm ToolUse hook: `tool==='Workflow' && isRunning` draws one line. | mod:nebi-calm | clutter-20(a) |
| 16 | Ghostty's native tab progress bar (OSC 9;4) | **Keep it.** It is the only cross-tab "this tab is working" cue (clutter-33). If he wants it gone: `terminalProgressBarEnabled: false`. Taste call, his. | settings (unchanged) | clutter-20(b), clutter-33 |
| 17 | "(ctrl+b to run in background)" pill | nebi-calm ToolProgress hook: `hint: ''`. Terminal only. | mod:nebi-calm | clutter-24, online-4 |
| 18 | Mod reload notices | Mostly limited to the mod-building session (clutter-17). Row 12 removes the auto-update toast. nebi-calm hides InfoNotice lines that match reload text. Do mod building in one dedicated session. | settings + mod:nebi-calm | clutter-17 (partly), modsapi-21 (partly) |
| 19 | Bash file-diff previews | `bashEditDiffEnabled: false` | settings | clutter-22 |
| 20 | Dark palette on his light Ghostty | `theme: "auto"` | settings | clutter-34 |
| 21 | Beacon's scanner sweep, spoken lines, extra pushes | Beacon userConfig `motion: off`, `speak: off` by default. Push only for ❓ asks that land while he is likely away. | mod:nebi-beacon | modsapi-19, modsapi-20 |
| 22 | Toast per sub-agent spawn (model-lock), two toasts per prompt (wispr) | Lock moves to a SessionMode label. Wispr shows one toast, only when it actually rewrote his words. | mod:nebi-model-lock, mod:nebi-wispr | clutter-32, modsapi-13, modsapi-28 |
| 23 | Plan-rail tool rows and its system-prompt section | Rework to observe TodoWrite/TaskCreate/TaskUpdate; drop its own tool. | mod:nebi-plan-rail | modsapi-10 |
| 24 | Chat bloat: file lists, watcher explanations, recaps | Output style: no file lists (nebi-receipt shows them), no plumbing narration. nebi-receipt adds one dim line under answers that changed files. | output style + mod:nebi-receipt | usage-5, usage-28 (partly), clutter-26 |
| 25 | Prompt suggestions, spinner tips | Already off (`promptSuggestionEnabled: false`, `spinnerTipsEnabled: false` in settings.json). No change. | settings | clutter-21, clutter-23 |

Not touched: the "Ran N stop hooks" row itself. It has no render site, so row 4 removes its cause (online-6). The AskUserQuestion dialog keeps its built-in options; a mod cannot remove them (online-7), so the output style avoids menus instead.

Optional trial, his call: the built-in focus view (`/focus`, `viewMode: focus`, fullscreen renderer only). It shows only the prompt, a summary and the reply (skills-10). Try it for a day before adding any more hiding.

---

## 2. The ten mods

Build order: CONTRACT.md first, then beacon, calm, browser, fleet, red-button, model-lock, wispr, plan-rail, session-guard, receipt. Each mod is one pass for an Opus builder. None depends on another being loaded.

### 1. nebi-beacon (reworked, from nebi-beacon)

**Does:** Owns the status surface of the session it runs in.
- **Band.** One row above the prompt: a colored badge plus the reply's own status-line text.
  - Working: `⏳ WORKING "prompt…" · 1m 12s · 2 agents`
  - Done: `✅ DONE <text>`, or `✅ DONE · unproven` when files changed after the last check.
  - Needs him: `❓ NEED YOU <what>`, wrapping to at most two rows.
  - When the turn was not started by him, it adds `· after background task` or `· from <peer project>`, using `prompt.submit` `origin.kind`.
- **Removed from the old beacon:** the model fork, the option Buttons and hotkeys, the "why · reply with" row, the scanner animation (userConfig `motion`, default off) and speech (userConfig `speak`, default off).
- **Spinner** narration is kept.
- **PromptHint** is owned here alone: the `hint` rewrite strips "(shift+tab to cycle)" and "? for shortcuts".
- **Beacon file v2** adds `account` ("a" or "b", from `$.env.get('CLAUDE_CONFIG_DIR')`), `origin`, `askedAt` and `lastPersonAt`.
- **Phone push** goes out on ❓ when the turn was not started by him or ran 60 s or more, and only if the model did not push itself in that turn.
- **/clear fix:** the heartbeat keeps running after `/clear`.

**How Nebi notices:** one colored row that always says the same thing as the reply's last line; a yellow ❓ row when a session needs him; a footer that reads "bypass permissions on" with no hint; a phone buzz only when a ❓ lands while he's away.

**Surfaces:** AbovePrompt, Spinner, PromptHint, beacon file, PushNotification (via `$.tool.call`).
**Events:** session.start, session.end, prompt.submit (observe origin), turn.start, tool.call (observe), turn.complete, ui.render AbovePrompt/Spinner/PromptHint.
**Pains:** answer menus pushed at him; shift+tab hint; unclear when done; asks lost above the fold; recap replacement; needs-you while away.

**Tests** (`claude plugin test`, looped over terminal and desktop):
- ✅/⏳/❓ answers each draw one badge row with the parsed text, and no Button element.
- A ❓ turn never calls `$.model.fork` (spy) and draws no "reply with" text.
- Edit, then answer ✅ with no check in between → `DONE · unproven`. Edit, `npm test` OK, ✅ → plain DONE.
- A turn whose prompt.submit origin is `task-notification` and ends ❓ → band suffix present and PushNotification called once. A composer turn under 60 s ending ❓ → no push. A turn where the model called PushNotification → beacon sends none.
- PromptHint `"bypass permissions on (shift+tab to cycle) · ? for shortcuts"` → rewritten without both phrases. A hint without them → the hook passes `e` through untouched.
- session.end `reason:'clear'` → a beacon file is written again within 30 s on the mock clock.
- Stubbing `CLAUDE_CONFIG_DIR=…/.claude-max2` → beacon file has `account:"b"`.
- With default options, `$.audio.speak` is never called. `hasSurvey` → returns `below` unchanged.

**Depends on:** clutter-6, modsapi-5, usage-20, usage-21, clutter-7, clutter-8, online-4, clutter-13, clutter-33, usage-4, browsers-23, browsers-28, modsapi-14, clutter-27.
**Risk:** the PromptHint effect is inferred from minified code and needs a screenshot. Nebi can collapse the band (`[-]`). If the engine thinks he's away while he's at his desk, the push may buzz.

### 2. nebi-fleet (merged, from nebi-constellation + nebi-fleet-radar)

**Does:** Reads `~/.claude/nebi/beacons/*.json` every 5 s, which covers both accounts because the folder is shared. It skips itself and any file whose heartbeat is older than 90 s.
- **Waiting label.** When other sessions wait on him, it appends one dim SessionMode label: `❓ cnlsneakers 12m +1`, naming the session that has waited longest.
- **Browser clash label.** When two live sessions resolve to the same Chrome device, it appends `⚠ 2 on RapidSneakers`, resolving each peer's browser from its `cwd` plus `account`. This replaces the hand-edited BROWSER-LOCK.md.
- **/fleet** opens a pane on demand. It lists every session, longest wait first: badge · project · account · browser · state text · wait · origin. This session's agents and workflows appear under it, polled only while the pane is open.
- No `$.ui.status`, no toasts, no speech, no peer-send feature.

**How Nebi notices:** the right side of the footer, in every session, names the session that is waiting and for how long, with no warning triangle and no toasts. `/fleet` shows the whole board when he wants it.

**Surfaces:** SessionMode, Pane `nebi-fleet:board`.
**Events:** session.start, session.end, ui.render SessionMode, command.run `fleet`, ui.render Pane, ui.close.
**Pains:** constellation drawn as a warning; asks missed in other sessions; many sessions across two accounts; no fleet view; two sessions fighting over one Chrome.

**Tests:**
- Two peers in `need` → label `❓ <oldest> <wait> +1`. No needing peers → `modes` passed through unchanged. Self and stale files are excluded. An unparsable file is skipped.
- The existing engine mode label (`focus`) survives: append only.
- A spy shows `$.ui.status` and `$.ui.toast` are never called.
- Two live peers with the same resolved deviceId → `⚠ 2 on <label>`.
- Pane closed: advancing the mock clock 10 s makes 0 `$.agent.list` calls. Pane open: polling runs and stops on ui.close.
- A peer with `account:"b"` and no browser.json resolves to the account-B default.

**Depends on:** clutter-4, clutter-5, modsapi-1, modsapi-18, modsapi-8, browsers-28, usage-4, usage-6, usage-7, usage-8, usage-9, modsapi-17, usage-18.
**Risk:** SessionMode is dim. If he still misses it, the needing session's own phone push is the backstop. Every session reads up to 64 small files every 5 s.

### 3. nebi-browser (new)

**Does:** At session.start it resolves this session's route: `<git root>/.claude/browser.json`, else the account default in `~/.claude/nebi/browsers.json`. The account comes from `$.env.get('CLAUDE_CONFIG_DIR')`: unset means A, `~/.claude-max2` means B.
- **BROWSER.** If BROWSER is unset, it sets it to `~/.claude/nebi/browser-open` with `$.env.set`. The opener reads it live.
- **Label.** Appends SessionMode `B · RapidSneakers` (always shown: account plus Chrome).
- **Chrome guards** (`tool.call { tool: /^mcp__claude-in-chrome__/ }`):
  - `select_browser` naming a different device → deny, naming the project's label and device.
  - `switch_browser` → deny. It broadcasts a pairing request Nebi has to click; the deny points to `select_browser(<device>)`. It is allowed when his prompt this turn asks to pair, switch or name a browser.
  - Account mismatch (browser.json says B, the session is on A) → label `⚠ use claude-omer`, and the first Chrome call is denied with a reason the model must relay in its ❓ line.
- **Sub-agents** get the same guards.

**How Nebi notices:** the footer always says which account and which Chrome the session uses. Agents stop drifting into the other Chrome. Artifacts and links open in the right profile. No pairing popups.

**Surfaces:** SessionMode, tool.call deny, env BROWSER.
**Events:** session.start, tool.call (Chrome matcher), prompt.submit (observe his intent), ui.render SessionMode.
**Pains:** wrong browser for artifacts and Chrome tools; which account am I on; two browsers per project; Approve/pairing clicks; the "which browser?" AskUserQuestion.

**Tests:**
- browser.json at the git root, cwd in a subfolder → route found. No file, env unset → A default. Env `~/.claude-max2` → B default.
- BROWSER unset → `$.env.set('BROWSER', <router>)` called once. BROWSER already set → untouched.
- `select_browser` with another deviceId → deny whose reason names label and device. Same device (prefix match) → passes.
- `switch_browser` → deny. With a prompt this turn saying "pair the rapidsneakers browser" → passes.
- Account mismatch → label contains `claude-omer`. The first Chrome call is denied, the second passes (once per session).
- A sub-agent's `select_browser` is guarded the same way. Garbled JSON → no guards and label `A · ?`, with no throw.

**Depends on:** usage-13, usage-14, usage-15, usage-16, browsers-1, browsers-3, browsers-4, browsers-7, browsers-9, browsers-10, browsers-11, browsers-19, browsers-23, browsers-24, browsers-25, online-10, modsapi-3, usage-12.
**Risk:** it is unconfirmed whether a device id is stored whole or as a prefix (match by prefix). If the project's browser is offline, the model could loop on denies, so the deny says: "if it isn't connected, stop and ask Nebi to open <label>".

### 4. nebi-calm (new)

**Does:** Shrinks the transcript rows he doesn't read.
- **Write/Edit/MultiEdit/NotebookEdit results** draw one line: `Created mods/x.ts · 120 lines` or `Edited statusline.mjs +3 −2`. The counts come from the Write result's `type`, `filePath` and `content`, and from `structuredPatch` (claude-code.d.ts:20165-20180).
- **A running Workflow** draws one line, `Workflow · <meta name> · running`. The engine's row comes back once it finishes.
- **The ctrl+b pill** draws nothing.
- **InfoNotice lines** that match reload/plugins-changed text are hidden.
- Errored and interrupted rows always pass through.
- userConfig `code: compact|full`, default compact.

**How Nebi notices:** no code blocks after file writes, and workflows are one line while they run.

**Surfaces:** ToolResult, ToolUse, ToolProgress, InfoNotice.
**Events:** ui.render on those four.
**Pains:** collapsed code that isn't relevant to him; workflow progress bars; reload notices; "it's all very big".

**Tests** (terminal and desktop where raised):
- Write OK → one Text containing the basename and line count. `isErrored` → `next(e)` unchanged.
- Edit result → `+a −r` from structuredPatch. Option `code:'full'` → pass through.
- Workflow ToolUse: `isRunning` → one row; finished → unchanged; `isInterrupted`/`isErrored` → unchanged.
- ToolProgress `background_hint` → `hint:''`.
- InfoNotice with reload text → empty Box; any other notice → unchanged.

**Depends on:** clutter-19, clutter-20, clutter-24, clutter-10, online-3, modsapi-11, modsapi-14, clutter-27, clutter-17, modsapi-21, online-4.
**Risk:** ToolResult has no `isExpanded`, so ctrl+o also shows the compact line, and the full diff is then only in git. That is why the option exists. Reload notices may not draw through InfoNotice at all.

### 5. nebi-red-button (reworked, from nebi-red-button)

**Does:** Still holds a risky main-loop Bash call for his r/b/a choice and denies sub-agents at once.
- Drops `$.ui.status` (register.tsx:151,169), which drew the warning look. The band row with its r/b/a buttons stays; it is an approval gate, not an answer menu.
- Fixes the red test suite and the `[3]` copy.
- The 10-minute timeout (register.tsx:21) now denies with: "Nebi didn't answer in 10 min. Skip this step, carry on with the rest, and put the exact command in your ❓ line." The fleet keeps moving.
- userConfig `speak` defaults to off; `push` defaults to on.

**How Nebi notices:** a destructive command waits for one key press and buzzes his phone if he's away. It never shows a yellow warning line, and if he doesn't answer, the session keeps working.

**Surfaces:** AbovePrompt (only while holding), Pane `/redbutton`, PushNotification.
**Events:** session.start, tool.call, ui.render AbovePrompt/Pane, ui.close, command.run `redbutton`.
**Pains:** approvals that stall; the warning look; noise.

**Tests:**
- Fix the 6 failing tests: stub PushNotification or expect it.
- Esc via `$.ui.close({origin:{kind:'person'}})` → deny plus full cleanup. Esc after a press → only the first choice counts. A plugin-origin close → nothing recorded. An unload-origin close → deny at once, not after 10 min.
- Interrupt while held and while queued (export `holdCall`, AbortController). Timeout via `mock.clock` → deny reason contains "carry on".
- Two concurrent holds, with a press on a stale id. Reload clears a dead hold.
- Status is never called; push fires once per hold. A sub-agent call is denied immediately. The listing says `[a]`.

**Depends on:** modsapi-6, modsapi-7, modsapi-1, modsapi-18, modsapi-16, modsapi-25.
**Risk:** a hold still pauses that one session for up to 10 min, by design.

### 6. nebi-model-lock (kept, quieter)

**Does:** Rewrites the sub-agent `model` on agent.spawn to the model Nebi named, which is the doctrine §0 enforcement. Changes: no toast per spawn or per prompt, and no PromptHint tail. The lock shows as a SessionMode label `🔒 sonnet`, which is also drawn on desktop; the tail was terminal-only. `/lock` still answers with its own command output.
**How Nebi notices:** `🔒 sonnet` in the footer while a lock is on; nothing else.
**Surfaces:** SessionMode, CommandOutput.
**Events:** session.start, prompt.submit, agent.spawn, command.run `lock`, ui.render SessionMode.
**Pains:** a model he chose being re-asserted silently; toast noise.
**Tests:** locked → label appended, engine modes kept. Unlocked → modes unchanged. A spawn rewrite calls no toast. No PromptHint hook is registered (introspect `$.plugin` hooks, or assert that a PromptHint render passes untouched).
**Depends on:** modsapi-13, clutter-5, clutter-9, modsapi-29.
**Risk:** low.

### 7. nebi-wispr (kept, quieter)

**Does:** Still fixes misheard words from his glossary. It shows exactly one toast per prompt, only when it actually changed his words, so he knows (§3b). Sound-alike guesses no longer toast; they go to `e.context` as one line the model reads ("possibly misheard: X = Y?"), which matches doctrine §4 (read for what he meant).
**How Nebi notices:** a single `Wispr: Clod → Claude` toast when his words were changed; otherwise nothing.
**Surfaces:** toast (one per rewritten prompt).
**Events:** session.start, prompt.submit, command.run `wispr`.
**Pains:** toast noise; dictation errors.
**Tests:** rewrite only → 1 toast. Guess only → 0 toasts, and `e.context` contains the guess line. Both → 1 toast plus the context line. A leading `??` is no longer special (aside is gone).
**Depends on:** clutter-32, modsapi-28.
**Risk:** low.

### 8. nebi-plan-rail (reworked, from nebi-plan-rail)

**Does:** Drops its own `mcp__nebi-plan-rail__plan` tool, its prompt.compose section and its sound. It watches the built-in TodoWrite `todos[]` and TaskCreate/TaskUpdate (claude-code.d.ts:15613-15660) in the main loop. While a plan is active it appends a SessionMode label `3/7 ▸ run tests` (at most 20 cells). It shows `7/7 ✓` until the next turn starts, then clears. `/rail` opens the full list as a pane on demand.
**How Nebi notices:** the footer says how far through the plan the session is, and the transcript has no extra tool rows.
**Surfaces:** SessionMode, Pane.
**Events:** tool.call (observe TodoWrite/TaskCreate/TaskUpdate), turn.start, ui.render SessionMode/Pane, command.run.
**Pains:** "is it still working / how much longer"; tool-row noise; a system-prompt section on every request.
**Tests:** TodoWrite with 7 items, 3 completed, 1 in progress → `3/7 ▸ <activeForm>` cut to 20 cells. All completed → `7/7 ✓`, then cleared on turn.start. No `$.tool.register` call, no prompt.compose/section hook. TaskCreate×3 plus TaskUpdate completed×1 → `1/3`. A sub-agent's TodoWrite is ignored.
**Depends on:** modsapi-10, modsapi-18, clutter-5, modsapi-30.
**Risk:** if the model rarely uses TodoWrite, the label rarely shows. That is acceptable.

### 9. nebi-session-guard (new)

**Does:** Stops agents opening terminals, windows or new Claude sessions he didn't ask for. It denies Bash commands that run `term.mjs`, use `open -a/-na` or `osascript` with Ghostty/Terminal/iTerm, run `ghostty +new-window`, or start an interactive `claude`/`claude-profile`/`claude-nebi`/`claude-omer`.
- **Allowed:** headless `claude -p` and administrative subcommands (plugin, mcp, agents, update, doctor, --version), following the launcher's list at `~/.local/bin/claude-profile:48-53`.
- **Allowed when he asked:** if this turn's composer or bridge prompt asks to open or start a terminal, tab, window or session.
- **Sub-agents** are always denied.
- **Deny reason:** "Nebi didn't ask for a new terminal or session. Give him a paste-ready prompt in one fenced block with the launch line (`claude-nebi` or `claude-omer`, and the folder), and say so in one line."

**How Nebi notices:** no surprise Ghostty windows. Replies hand him a prompt to paste instead.

**Surfaces:** none drawn; tool.call deny only.
**Events:** prompt.submit (observe origin and text), tool.call `{ tool: 'Bash' }`.
**Pains:** unasked sessions; handoffs (54×) as paste-ready prompts; staying on point.
**Tests:**
- Prompt "fix the bug" plus Bash `node ~/.claude/nebi/term.mjs …` → deny. Prompt "open a new terminal for cnlsneakers" → pass.
- A sub-agent with the same command → deny, even when he asked.
- `claude -p "…"`, `claude plugin validate x` and `open https://…` → pass. `osascript -e 'tell application "Ghostty" …'` → deny.
- A task-notification-origin turn → deny.

**Depends on:** usage-23, usage-10.
**Risk:** false positives on unusual commands. The deny is soft, because the model can ask him.

### 10. nebi-receipt (new)

**Does:** Under each main-loop answer whose turn changed files, it returns `{ text }` from turn.complete. The types say this is drawn beneath the answer and never rewrites the record (claude-code.d.ts:4183-4188). It is one dim line:
- `Changed 3 files: statusline.mjs, nebi.md +1 · checked: node --test passed after the last edit`
- or `· no check since the last edit`
- or `· check failed: npm test`

Sub-agent edits are counted and deduplicated by path. Read-only turns get no line. The check regex is copied from `nebi-beacon/hooks/parts.ts:118` and shares a test vector with it.

**How Nebi notices:** every turn that touched files ends with one line saying what changed and whether it was proven. Done becomes obvious, and the reply above it can be shorter.

**Surfaces:** the turn.complete text line.
**Events:** turn.start, tool.call (observe Edit/Write/MultiEdit/NotebookEdit/Bash), turn.complete.
**Pains:** unclear when something is done; "what changed" (27×); chat bloat (the output style drops file lists).
**Tests:**
- Write plus Edit, then Bash `npm test` OK → line has 2 files and "checked: npm test passed".
- Edit after the test → "no check since the last edit". Failing check → "check failed".
- Read-only turn → next's result returned unchanged. More than 3 files → `+N`. Same file twice → counted once. Aborted turn → no line.

**Depends on:** usage-3, usage-22, usage-28, clutter-26.
**Risk:** it is unconfirmed whether the desktop draws turn.complete text. The line could feel like clutter on trivial edits; if so, show it only on turns with at least 2 edits.

---

## 3. Existing mods dropped

- **nebi-aside**: dropped. It duplicates the built-in `/btw` (modsapi-9), and `??` was used 0 times (usage-18).
- **nebi-constellation**: retired as its own plugin and merged into nebi-fleet. It drew through `$.ui.status` (warning look, clutter-4), toasted in every session at once and polled every 3 s (modsapi-27). It is already disabled in settings.json.
- **nebi-fleet-radar**: retired as its own plugin and merged into nebi-fleet. It wrote state twice per tool call, ran a 1 s ticker while its pane was closed (modsapi-8), hooked PromptHint only to read the viewport, and `/fleet` was typed 0 times (usage-18).

All three come out of `enabledPlugins` and the nebi-mods marketplace folder. The `/fleet` name moves to nebi-fleet.

---

## 4. mods/CONTRACT.md changes

Replace the surface table and the voice section with the following.

| Surface | Owner | Rule |
|---|---|---|
| AbovePrompt band | nebi-beacon (1 row; 2 when a ❓ wraps); nebi-red-button only while holding | Nobody else draws here. Both stack with `below` as before. |
| Spinner | nebi-beacon | Unchanged. |
| PromptHint | nebi-beacon only | It rewrites `hint`. A rewrite discards every `tail`, so **no other mod hooks PromptHint**, not even to read it (clutter-9). |
| SessionMode (dim labels at the footer's right) | Shared, append-only | Each mod appends at most one label of at most 20 cells, only when it has something non-default to say. Never filter or reorder labels you didn't add. Current owners: browser (always), fleet (waiting count, browser clash), model-lock (while locked), plan-rail (while a plan is active). |
| Transcript rows: ToolUse, ToolResult, ToolGroup, ToolProgress, InfoNotice, TurnDuration | nebi-calm only | Errored and interrupted rows always pass through. |
| AssistantMessage, AskUserQuestion, UserMessage | Nobody | |
| turn.complete `{ text }` | nebi-receipt only | Every other hook returns next's result unchanged. |
| `$.ui.status` | **Banned** | It always draws `⚠ <plugin>:` in the warning color (modsapi-1). |
| Toasts | Limited | Only as the answer to the person's own action (a command, a button), or wispr's one-per-rewritten-prompt notice. At most one per prompt per mod. |
| Speech | nebi-beacon only | Default off (userConfig). |
| Phone push (`$.tool.call PushNotification`) | nebi-beacon (❓ while likely away), nebi-red-button (holds) | Beacon skips a turn where the model or red-button already pushed. |
| Panes | `/fleet` (nebi-fleet), `/redbutton` (nebi-red-button), `/rail` (nebi-plan-rail) | Open only when asked. Ids are prefixed with the mod name. |
| System prompt (prompt.section, prompt.compose, prompt.context) | Nobody | The browser line comes from the SessionStart hook, so there is one source. |
| prompt.submit | nebi-wispr may rewrite and add one context line; everyone else observes | |
| tool.call | Deny-only mods: nebi-browser (Chrome tools), nebi-session-guard (terminal/session spawns). nebi-red-button alone may hold. Everyone else observes and passes on. | A deny mod returns `{ deny }` without calling next and never holds. Matchers stay narrow: browser `/^mcp__claude-in-chrome__/`, guard and red-button `Bash`. |
| agent.spawn | nebi-model-lock rewrites `model`; everyone else observes | |

New sections:
- **Beacon file v2.** Add `account` ("a" or "b"), `origin` (the PromptOrigin kind of the turn's prompt), `askedAt`, `lastPersonAt`. `version: 2`. Readers accept v1. nebi-beacon writes; nebi-fleet reads. No browser field: fleet resolves it from `cwd` plus `account` with the same rules as nebi-browser, so routing logic has one documented spec in this file.
- **Route resolution spec.** Walk up from cwd to the git root and read `.claude/browser.json` `{version, label, chromeProfile, deviceId, claudeAccount}`. Otherwise use `~/.claude/nebi/browsers.json` keyed by account. The account is `CLAUDE_CONFIG_DIR` unset → "a", containing `.claude-max2` → "b". Match device ids by prefix.
- **Kill switch.** Each mod reads `$.env.get('NEBI_MODS_OFF')` (`all` or a comma list of mod names) at session.start and registers nothing visible when listed. This is for chasing collisions.
- **Noise switches.** speak, push, motion and code compactness are userConfig fields with quiet defaults.
- **No-mod fallback, named per mod.** beacon → output style status line plus push line; fleet → `claude agents` (dialog waits only); browser → `BROWSER` router plus SessionStart line plus steer-channel deny; calm → settings rows; red-button → none (bypass); model-lock → doctrine §0 in the prompt; plan-rail → none; session-guard → output-style rule; receipt → Stop hook §6.
- **Done bar.** `claude plugin validate` and `claude plugin test` over terminal and desktop, plus:
  - (a) a paint smoke check: `screen -dm` plus `screen -X hardcopy` of a scratch session, asserting the text present or hidden, because plugin test checks only returned trees (skills-3, skills-7);
  - (b) a debug log showing "hooks module loaded" (skills-6);
  - (c) a no-mod baseline with `--safe-mode` (skills-5, corrected).
  
  `tsc` runs when installed. It isn't installed today (modsapi-16).
- Delete the `??`/aside rule and the fleet-radar observer lines.

---

## 5. Doctrine changes (one combo with the mods)

**Output style** (`claude-home/output-styles/nebi.md`):
- Line 23 becomes: "**Re-ask open questions, briefly.** If a question is still open, restate it just above the status line in one or two lines: what to decide and what you recommend. No numbered option menus, no 'reply with' scripts; he answers in his own words. Never point at a question by count."
- Add: "**Decisions live in chat.** A page can hold detail, but the ❓ line carries the decision itself." Page-only asks wait about 2.5× longer at the median (usage-1, corrected).
- Add: "**Don't narrate plumbing.** No list of changed files (the receipt line has it), no explaining background watchers or hooks, no recap of earlier turns."
- Add: "**Browser.** Use the project browser named in session context: `select_browser` with its device, never `switch_browser`, never ask which browser. Before a browser run, batch every click or consent it will need into one ❓." For OAuth grants, terms and installs an explicit chat yes is enough; only typing credentials or account numbers is his (browsers-16, partly; which rule text applies is unconfirmed).
- Add: "**No new terminals or sessions unless he asked this turn.** Give a paste-ready prompt with the launch line."
- Keep the three status lines and the push line. The push line is the no-mod fallback, and beacon skips if the model pushed.

**Status line** (`claude-home/nebi/statusline.mjs`): strip "(1M context)"; drop "(1M)"; add `7d:NN%`; add `A` or `B` from `process.env.CLAUDE_CONFIG_DIR` (unverified that the child process inherits it; the SessionMode label from nebi-browser is the verified path).

**Hooks:**
- `verify-before-stop.mjs`: the artifact-watcher filter (declutter row 4). Also file `/feedback` upstream: Gqt leaks `ambient` watchers (clutter digest missedByLane).
- `session-start.mjs`: emit one browser line (label, Chrome profile, device) and one account line, using the route spec. It already emits `additionalContext` at `:36` (browsers-25).
- `steer-channel.mjs`: deny `switch_browser` and wrong-device `select_browser` (the fallback for when nebi-browser is off; a double deny is harmless) (browsers-25).
- `session-start-sweep.sh`: a daily background `claude update` (pairs with `DISABLE_AUTOUPDATER`).
- Optional: `feedback-capture.mjs` skips peer and meta prompts (usage-34, not load-bearing).

**Settings** (`~/.claude/settings.json`, via deploy.mjs):
- `awaySummaryEnabled:false`, `showTurnDuration:false`, `bashEditDiffEnabled:false`, `theme:"auto"`.
- `env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES="100000000"`, `env.DISABLE_AUTOUPDATER="1"`.
- `enabledPlugins`: beacon true; fleet, browser, calm, session-guard and receipt true; aside, constellation, fleet-radar and cc-plugin-you-should-know removed or false.
- `pluginConfigs`: beacon `{speak:"off", motion:"off", push:"away"}`, red-button `{speak:"off", push:"on"}`, calm `{code:"compact"}`.
- Account B shares this settings.json through a symlink, so per-account differences live in env and the route spec, never in settings (skills digest missedByLane).

**CLAUDE.md:** amend the §10 bullet on `term.mjs` to "only when I ask for a new terminal in that message; otherwise hand me a paste-ready prompt". That removes the clash with usage-23. In §3 add one line: "The band above the prompt mirrors your status line; the receipt line says what changed. Keep both honest."

**Skills:**
- nebi-sessions: a handoff is one fenced, paste-ready prompt plus the launch line (account command and folder). Never open the session yourself.
- nebi-orchestration: sub-agents never open terminals or pair browsers. Browser work follows the project route. Red Button denies risky sub-agent calls at once, so briefs say "report the command to the lead".
- nebi-maintenance: the mod done bar (CONTRACT); the capability-routing browser section points at `browser.json` as the routing source.
- Repo hygiene: `mods/` is untracked (`?? mods/`), so commit it.

---

## 6. Per-project browser setup

**Source of truth: `<project>/.claude/browser.json`**
```json
{ "version": 1, "label": "RapidSneakers Chrome", "chromeProfile": "Profile 3", "deviceId": "bbbbbbbb", "claudeAccount": "b" }
```
- cnlsneakers → the file above.
- nebi-skill, Karpet24, ecommerce-workspace → `{ "label": "Main Chrome", "chromeProfile": "Default", "deviceId": "aaaaaaaa", "claudeAccount": "a" }`.

Account defaults, shared by both accounts through the symlinked `nebi/` dir: `claude-home/nebi/browsers.json` = `{ "a": {Main Chrome, Default, aaaaaaaa}, "b": {RapidSneakers Chrome, Profile 3, bbbbbbbb} }` (usage-13, browsers-1).

**URL opener: `claude-home/nebi/browser-open`**, an executable node script with no arguments besides the URL. Claude Code runs `$BROWSER <url>` with no shell, in the session cwd, and waits for it with a 10-minute timeout; a non-zero exit counts as a failure (browsers-4, modsapi-3). The script:
1. Walks up from cwd for browser.json, else takes the account default from `CLAUDE_CONFIG_DIR`.
2. Runs `open -na "Google Chrome" --args --profile-directory="<profile>" "<url>"` and exits 0 at once.
3. If that call fails, falls back to `open <url>`.

This routes artifact auto-open, the Artifact `open` action, ctrl+] and clicked transcript links (modsapi-3, skills digest missedByLane).

**Where BROWSER is set:**
- Export it in `~/.zshenv`. That covers plain `claude` (browsers-21), the launcher, and Ghostty-attached sessions, where the attacher's BROWSER wins (browsers-8).
- nebi-browser's `$.env.set` is the fallback when it is unset (browsers-7).
- Leave `CLAUDE_CODE_ARTIFACT_AUTO_OPEN` alone: turning it off also kills the explicit open action (modsapi-3).
- CLIs started from the Bash tool inherit it too (browsers-31; whether Shopify CLI honors it is unconfirmed).

**Claude in Chrome:** there is no per-project pin env var. `CLAUDE_CHROME_PAIRED_DEVICE_ID` is only a fallback (browsers-10), and `select_browser` writes a per-account global (browsers-9). Since the split, each account sees only its own Chrome, so auto-selection picks it without asking (browsers-11; usage-17 partly). The guards stop the drift that remains: wrong-device select, pairing broadcasts, wrong-account sessions. The SessionStart line tells the model the device up front.

**Account clarity:**
- The footer label `A · Main Chrome` or `B · RapidSneakers` (nebi-browser) and `A`/`B` in the status line.
- `claude-profile` with no account argument reads `claudeAccount` from browser.json, and warns when an explicit account disagrees (browsers-30). The launcher lives at `~/.local/bin/claude-profile`, outside this repo.
- The launcher can also set `CLAUDE_CODE_ENABLE_CFC=1` for B so Chrome tools load without `--chrome` (usage digest missedByLane).

**Nebi's one-time clicks:**
- Rename Chrome Profile 3 from "Your Chrome" to "RapidSneakers" and give it a color.
- Name both extension connections ("Main Chrome", "RapidSneakers Chrome") by saying "pair/name the browser", which nebi-browser allows (browsers-35, browsers-13).

**Project cleanup (his call):** retire cnlsneakers' BROWSER-LOCK.md and the "list_connected_browsers then select_browser bbbbbbbb" ritual repeated in 8 docs (browsers-27). The fleet's `⚠ 2 on RapidSneakers` label replaces the lock. Edit the playbook's "Nebi makes the last click on … terms" line into "batch hand-offs into one ❓" (browsers-16, partly).

**Approvals that don't stall:**
- Pairing clicks: switch_browser is denied.
- Site-permission prompts: bypass already sends `skip_all_permission_checks`, but a gate can flip that (browsers-15, partly).
- Model-rule clicks: batched into one ❓ up front.
- Page approvals: the decision goes in the chat ❓.
- Red Button: sub-agents are denied at once, and a timeout tells the model to carry on.

---

## Unverified dependencies (check before relying on them)

1. `open -na "Google Chrome" --args --profile-directory=…` opens the URL in the running Chrome's right profile (browsers-26). It needs one test that opens a window; Nebi should allow that.
2. Whether `env.BROWSER` from settings.json reaches the opener (modsapi-3 (5)). Hence `~/.zshenv`.
3. Whether the status-line child inherits `CLAUDE_CONFIG_DIR` (browsers lane, unconfirmed).
4. That a PromptHint `hint` rewrite visibly drops "(shift+tab to cycle)" and doesn't leave a stray ` · ` (modsapi-12, online-4). Needs a screenshot.
5. Plugin hook order on SessionMode and PromptHint (clutter-9). The design avoids depending on it: append-only labels and a single PromptHint owner.
6. Whether turn.complete `{ text }` draws on the desktop surface.
7. Whether reload notices draw through InfoNotice (clutter digest unconfirmed; online-18).
8. Whether settings `env` applies before the engine snapshots `CLAUDE_CODE_IDLE_*` and `DISABLE_AUTOUPDATER`. Mirror them in `~/.zshenv`.
9. Whether `aaaaaaaa` and `bbbbbbbb` are full device ids or prefixes. The guards match by prefix.
10. Which safety-rule text governs OAuth, terms and install clicks (browsers-16, partly).
11. Whether mods load in desktop Code-tab sessions (browsers lane). He barely uses it (usage-8).
12. Whether the 'Plugins changed / updated' notices fire for the nebi-mods directory marketplace (modsapi-21, clutter-18).
