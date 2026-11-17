# Design: quiet first (2026-10-03)

Lane: DESIGNER. Built only on digest findings marked confirmed or partly (corrected claims used), plus my own read-only receipts (R1–R17 below). Anything else is listed under "Unverified dependencies" at the end.

## The angle in one paragraph

The screen is busy because many things talk at once and most of them say nothing Nebi acts on. The fix is mostly subtraction with existing levers: settings, the status-line script, the Stop hook and the output style. After that, exactly **one** element gets color and a row of its own: a yellow `❓ NEED YOU` row, shown only while Claude waits on him. "Done" stops being a guess because each reply's final status line gets a colored badge in place, which adds no rows. Everything else either shrinks (Write previews, workflow trees, the shift+tab hint) or works without drawing anything (browser guard, tab guard, model lock, dictation fixes). Ten mods, but six of them draw nothing at rest.

### Screen at rest, before and after

Before (his list):

```
⏺ …long reply, mid-turn narration, re-listed options…
  ❓ Need you — pick the .si name
✻ Baked for 1m 23s
⎿ Stop hook feedback: 2 background tasks still running — wait for them…
※ recap: goal … current task … next action … ⏳ Working
⚠ nebi-constellation: 3 need you
┌ ❓ NEED YOU  pick the .si name · why … · reply with …   [1] … [2] … [3] … [0] dismiss ┐
>
  ⏵⏵ bypass permissions on (shift+tab to cycle)              new task? /clear to save 120k tokens
  Opus 5.5 (1M context)  |  ctx 45% (1M)  |  eff:xhigh  |  5h:30%  |  ⎇ master
  Update installed · Restart to update
```

After:

```
⏺ …final answer only (mid-turn "Let me check…" lines hidden)…
  ❓ Need you — pick the .si name for trigger.si: I'd take trigger.si (cheapest)
[❓ NEED YOU] pick the .si name for trigger.si             ← only row with color; only while waiting
>
  ⏵⏵ bypass permissions on                                   ⌁ cnlsneakers needs you & 🔒 sonnet
  Opus 5.5 · ctx 45% · xhigh · 5h 30% · wk 41% · ⎇ master · nebi
```

A finished turn that edited files ends like this instead, with no band row:

```
  [✅ DONE] statusline shows the weekly limit; next: your call on the theme
  changed statusline.mjs · checked node --test ✓            ← receipt, dim, only on turns that edited
```

Row budget: working, 0 extra rows (the engine spinner already shows the current task's `activeForm`, R6). Done, 0 extra rows, plus 1 receipt row on turns that edited files. Need you, 1 row.

## Receipts I took myself (read-only)

- **R1** `~/.claude/settings.json` (mtime 2026-10-03 15:19): `nebi-beacon@nebi-mods: false`, `nebi-constellation@nebi-mods: false` (**beacon and constellation are already switched off live**, so today he has no needs-you light at all), `cc-plugin-you-should-know@builtin: true`, `spinnerTipsEnabled: false`, `promptSuggestionEnabled: false`, `theme: "dark"`, `model: "opus[1m]"`, `effortLevel: "xhigh"`, no `env` block.
- **R2** `claude-home/nebi/statusline.mjs:16-17` prints `model.display_name` as is; `:30` adds ` (1M)`; `:39-40` shows only the 5h window; `:53` joins with `"  |  "`.
- **R3** `claude-home/hooks/verify-before-stop.mjs:86-94`: any `status==='running'` task returns early with the nudge. `:105`: the §3 early-stop check needs `tasks.length === 0`.
- **R4** `claude-home/output-styles/nebi.md:23` "Re-ask … the options, and your recommendation"; `:21` (uncommitted) requires a PushNotification on ❓.
- **R5** types `claude-code.d.ts:9524-9540` SessionMode: "A hook adds a mode by rewriting `modes`, removes one by filtering, or draws its own tree", terminal and desktop. `:9541+` PromptHint: "A rewritten `hint` replaces the line, `tail` with it". AbovePrompt carries `hasSurvey` and `isWorking`.
- **R6** types `:15618`, `:15641` (TaskCreate/TaskUpdate `activeForm`: "Present continuous form shown in spinner when in_progress") and `:15654` (TodoWrite `activeForm`): the engine already puts the current step in the spinner.
- **R7** types `:4186-4190` "Return `{ text }` … to show it beneath the answer; the transcript's record is never rewritten"; `TurnCompleteFields` carries `answer`, `durationMs`, `isAborted`, `agentId`, `reason`.
- **R8** types `:3590` `Markdown` element on every surface.
- **R9** types: UserMessage has `origin`, `isExpanded`, `task`; AssistantMessage has `text`, `isFirstOfReply`, `onScreen`; ToolResult has no `isExpanded`; ToolProgress `hint: ""` draws nothing (terminal only); TurnDuration and InfoNotice are terminal only.
- **R10** `ls -la ~/.claude-max2`: `settings.json`, `plugins`, `nebi`, `hooks`, `output-styles` are symlinks to `~/.claude`. One settings change covers both accounts.
- **R11** `~/.claude.json` `chromeExtension.pairedDeviceId = aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`; `~/.claude-max2/.claude.json` `= bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`; both are named `Browser 1`.
- **R12** `grep BROWSER ~/.zshenv ~/.zshrc`: no match. Nothing routes URLs today.
- **R13** `mods/nebi-red-button/hooks/classify.ts:430-470`: MCP holds key on send/publish/delete/... verbs. No `mcp__claude-in-chrome__*` tool name matches, so Red Button and a browser guard never touch the same call.
- **R14** Toasts and status today: `nebi-model-lock/hooks/register.tsx:52,66`, `nebi-wispr/hooks/register.tsx:39,52`, `nebi-red-button/hooks/register.tsx:61,69` (toasts), `:151` (`$.ui.status`), `:153` (PushNotification).
- **R15** `deploy.mjs:667-674` merges only `statusLine`, `outputStyle`, `hooks`, `claudeMdExcludes` and `skillListingBudgetFraction` into settings.json. Every other quiet key is hand-set today and not mastered in the repo.
- **R16** `mods/CONTRACT.md:10` (PromptHint: append to `tail`), `:11` (Spinner owned by beacon), `:13` (`$.ui.status` and toasts "free to use").
- **R17** `mods/nebi-beacon/hooks/register.tsx:1-7,41-45`: a fork-made ask card, a scanner sweep at `FRAME_MS=100`, and speech after `SPEAK_AFTER_MS=60_000`.

---

## (1) Declutter plan, item by item

| # | What he sees | Lever | Owner | Rests on |
|---|---|---|---|---|
| 1 | `Opus 5.5 (1M context)` | Strip `/\s*\(1M context\)$/` from `display_name`. The model and the 1M window stay. Do **not** use `CLAUDE_CODE_DISABLE_1M_CONTEXT`. | statusline | clutter-11, usage-26, skills-26, R2 |
| 2 | `ctx 45% (1M)` | Delete the ` (1M)` suffix (`statusline.mjs:30`) | statusline | clutter-11, skills-26, R2 |
| 3 | Status line too wide | Separator `·` instead of `  \|  `. `xhigh` instead of `eff:xhigh`. `5h 30% · wk 41%`, the weekly figure from `rate_limits.seven_day.used_percentage` (he typed /usage 74x). Account word (`nebi`/`omer`) and, when the project has `.claude/browser.json`, its browser label. A red `wrong account → claude-b` badge on a mismatch. | statusline | usage-25, browsers-23, usage-13, R2 |
| 4 | `(shift+tab to cycle)`, `? for shortcuts` | No setting exists. nebi-beacon's PromptHint hook removes **only those substrings** from `hint`. Live pills (`1 shell · ← for agents`) and the mode pill stay. | mod:nebi-beacon | clutter-7, clutter-8, clutter-9, online-4, online-5 |
| 5 | Big NEED YOU card with numbered answers | Beacon rework: no `$.model.fork`, no Buttons/hotkeys, no "reply with". One row with the status line's own words. | mod:nebi-beacon | clutter-6, modsapi-5, usage-20 |
| 6 | "You should know" note with 1/2/0 buttons | `enabledPlugins["cc-plugin-you-should-know@builtin"]: false` | settings | online-8, R1 |
| 7 | Option menus in replies, the same menu twice | Rewrite output-style line 23: one plain question each, recommendation in a clause, no answer lists | output style | clutter-26, usage-20, R4 |
| 8 | `⚠ nebi-constellation: 3 need you` drawn as a warning | Stop calling `$.ui.status` (the engine always draws it as ⚠ in warning color). Add one SessionMode label instead. | mod:nebi-constellation | clutter-4, clutter-5, modsapi-1 |
| 9 | `recap:` lines (each with its own status line) | `awaySummaryEnabled: false`, **only after** beacon v0.3 ships, so the need-you light exists before the recap goes | settings | clutter-13, clutter-33 |
| 10 | `Stop hook feedback: N background tasks still running` repeated | In `verify-before-stop.mjs`: (a) drop tasks whose `description` matches `/^(live updates for\|presence on) artifact /` before **both** the running count and the §3 check (filter by description, not by type, per clutter-2); (b) while real tasks run, nudge only when the reply claims `✅`. That is the nudge's stated purpose ("before claiming done"), so a correct `⏳` ending gets no row. (c) File the ambient-flag leak upstream with /feedback. | stop hook | clutter-1, clutter-2, clutter-3, usage-5, modsapi-24, online-6, R3 |
| 11 | `Baked for 1m 23s` (also hides "Waiting for N agents") | `showTurnDuration: false`. The "still running" information moves to the reply's blue ⏳ badge (item 21). | settings | clutter-14, clutter-33 |
| 12 | `new task? /clear to save …` | `env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES="100000000"` and `env.CLAUDE_CODE_IDLE_TOKEN_THRESHOLD="1000000000000"`, also exported in `~/.zshenv` (env timing unverified) | settings | clutter-15 |
| 13 | `Update installed · Restart to update`, `Plugins updated … reloaded` | `env.DISABLE_AUTOUPDATER="1"` plus a daily launchd job at 05:30 running `claude update` (he works 08:00–01:00). After a mod change, deploy runs `/reload-plugins` itself. | settings | clutter-16, modsapi-21 |
| 14 | Mod reload notices | They appear only in the mod-building session (clutter-17), plus the autoupdate toast, which item 13 removes. Keep hot reload in the build session: it is the point of that session. | settings | clutter-17, modsapi-21 |
| 15 | Code previews in Write results, long Edit diffs | nebi-quiet: Write becomes `wrote 120 lines · src/app.ts`, Edit becomes `edited src/app.ts (+4 −2)` (userConfig `diffs: hide\|show`, default hide). Errored rows untouched. | mod:nebi-quiet | clutter-19, online-3, clutter-10 |
| 16 | Workflow progress tree in the transcript | nebi-quiet: a running `Workflow` ToolUse row becomes one line, `workflow running · <name>`. The finished row is untouched. | mod:nebi-quiet | clutter-20 |
| 17 | Ghostty tab progress bar (OSC 9;4) | **Kept**: the tab bar shows which sessions are working and replaces the cues removed in items 9 and 11. If this is the bar he meant: `terminalProgressBarEnabled: false`. | settings (his call) | clutter-20, clutter-33 |
| 18 | `(ctrl+b to run in background)` pill | nebi-quiet: ToolProgress `hint: ""` (terminal only) | mod:nebi-quiet | online-4, R9 |
| 19 | Startup notice lines under the logo | nebi-quiet: InfoNotice drawn as `Box({display:'none'})` (terminal only) | mod:nebi-quiet | clutter-27, R9 |
| 20 | Mid-turn narration ("Let me check…") between tool calls | nebi-replies hides short text blocks of steps that stopped to call tools. The final reply always shows, and ctrl+o shows everything. Step 0: try the built-in `/focus` view first (it needs the fullscreen renderer). | mod:nebi-replies + output style | skills-8, skills-10 |
| 21 | "Is it done?" | nebi-replies draws the reply's final `✅`/`⏳` line as a colored badge, in place. `❓` lines stay plain because the yellow band row carries that signal. | mod:nebi-replies | usage-3, clutter-33 |
| 22 | Long replies, recaps, closers, file lists, explanations of the watcher | Output style: answer first, under about 8 lines, no recap or closer, what changed in plain words (the receipt lists the files), never explain tooling noise | output style | usage-28, usage-21, usage-5, clutter-26 |
| 23 | Beacon scanner sweep, spinner narration, spoken lines | Removed in the beacon rework. The engine spinner already shows the task `activeForm` (R6). | mod:nebi-beacon | R17, R6 |
| 24 | Plan-rail tool rows and its per-request system-prompt section | Drop nebi-plan-rail; the built-in task list and spinner cover it | dropped | modsapi-10, R6 |
| 25 | Toasts from model-lock, wispr and red-button; red-button's ⚠ status line | Contract: no `$.ui.status`; toasts only as the reply to a command he just typed | mod:* (contract) | clutter-4, modsapi-1, R14 |
| 26 | Dim footer text unreadable in light Ghostty | `theme: "auto"` (Ghostty switches Latte/Mocha with macOS) | settings | R1; clutter-34 is not load-bearing, so this is unverified |
| 27 | Bash "what this command changed" diffs | `bashEditDiffEnabled: false` | settings | clutter-22 is not load-bearing, so this is unverified |
| 28 | "Which browser?" AskUserQuestion card, pairing clicks | nebi-browser denies `switch_browser` and any other device. Since 10-01 each account sees one browser. | mod:nebi-browser | browsers-11, online-10, usage-13 |
| 29 | Ghostty windows and sessions he never asked for | Doctrine §10: only when asked. nebi-tab-guard enforces it. | mod:nebi-tab-guard + CLAUDE.md | usage-23 |

Already done in live settings (R1): `spinnerTipsEnabled:false` and `promptSuggestionEnabled:false`. Repo gap (R15): deploy.mjs should master every key in this table so a redeploy doesn't lose them.

---

## (2) The ten mods

Status legend: reworked = existing mod with changed behaviour; new = written from scratch. Two of the five reworks keep most of their code (model-lock, wispr). The other three lose their noisy parts (beacon, constellation, red-button).

### 1. nebi-beacon (reworked, from nebi-beacon 0.2.1): the need-you light and the footer owner

- **Does:** writes the per-session beacon file (schema v2, see the contract). At `turn.complete` (main loop only) it parses the final status line.
  - `❓`: draws **one** band row: a yellow badge `❓ NEED YOU` with black text, followed by the status line's words after `Need you —` (cleaned, fitted to `bodyColumns`). The row stays until he submits a prompt. It sends one PushNotification, skipped if the model already called PushNotification this turn.
  - `reason === 'error'`: a red `✖ STOPPED — <error>` row.
  - `✅`, `⏳`, aborted or no status line: draws nothing.
  - While AskUserQuestion is pending, it writes `kind: need` to the beacon file so other sessions see the wait. The band draws nothing then, because a turn is running.
  - Owns PromptHint: strips `(shift+tab to cycle)` and `? for shortcuts` and keeps everything else.
  - Removed: the `$.model.fork` ask card, Buttons and hotkeys, the scanner sweep, the Spinner hook, speech (userConfig `speak`, default `off`), and the DONE·unproven flag (it moves to nebi-receipt).
  - Restarts the heartbeat on `turn.start` after a `/clear`, which raises no `session.start`.
- **He notices:** nothing above the prompt while Claude works or after it's done. When Claude waits on him, a single yellow row says exactly what for, and his phone buzzes once if he's away. The footer reads `⏵⏵ bypass permissions on` with no hint.
- **Surfaces:** AbovePrompt (1 row, need/error only), PromptHint, beacon file, PushNotification.
- **Events:** session.start, session.end, turn.start, prompt.submit, tool.call (observe AskUserQuestion, PushNotification), turn.complete, ui.render AbovePrompt, ui.render PromptHint.
- **Pains:** big NEED YOU card; being told what to answer; missing what he must do; the shift+tab hint; phone visibility from school.
- **Tests (`claude plugin test`, terminal and desktop):**
  1. `❓ Need you — pick the .si name` gives a band tree with one row containing `NEED YOU` and `pick the .si name`, and zero Button elements.
  2. `✅`/`⏳` endings return `below` unchanged.
  3. `prompt.submit` clears the row.
  4. `hasSurvey` returns `below` unchanged.
  5. `reason:'error'` draws a red STOPPED row.
  6. PromptHint: `bypass permissions on (shift+tab to cycle)` keeps `bypass` and loses `shift+tab`; `? for shortcuts` gives `""`; `1 shell · ← for agents` survives.
  7. Spies: `$.model.fork`, `$.ui.status`, `$.ui.toast` and `$.audio.speak` are never called with default options.
  8. Exactly one PushNotification per ask, zero when the model pushed in that turn.
  9. The beacon file has `account` (`CLAUDE_CONFIG_DIR` unset gives `nebi`, `~/.claude-max2` gives `omer`) and `browser`.
  10. The heartbeat resumes on `turn.start` after `session.end`.
  11. Escape sequences are stripped.
  12. Live: nebi-mod-verify capture shows no `shift+tab to cycle` in the footer.
- **Depends on:** clutter-6, modsapi-5, usage-20, clutter-7, clutter-8, clutter-9, online-4, online-5, clutter-27, modsapi-14, usage-1, usage-3, usage-4, browsers-23, browsers-28.
- **Risk:** the exact bypass-mode hint string is unverified, so a screenshot is needed. A hint rewrite drops other mods' tails, which the contract handles by banning tails. A one-row band could still be missed; the yellow badge and the phone push cover that. Desktop drawing of PromptHint is unmeasured.

### 2. nebi-constellation (reworked, from nebi-constellation 0.1.0): other sessions, one quiet label

- **Does:** reads the other sessions' beacon files. Both accounts share `~/.claude/nebi/beacons` through the `nebi` symlink (R10). It appends **one** SessionMode label: `⌁ cnlsneakers needs you` for one, `⌁ 3 need you` for several, nothing otherwise. It ignores its own id, stale heartbeats (over 90 s) and files that don't parse. It polls every 10 s (it was 3 s). No `$.ui.status`, no toasts, no pane, no pulse. `/sessions` (typed only) prints a plain list: project · account · state · what.
- **He notices:** a short label at the right end of the footer names the project that needs him, and it disappears once he answers there.
- **Surfaces:** SessionMode, CommandOutput (/sessions).
- **Events:** session.start, `$.clock.every`, ui.render SessionMode, command.run sessions.
- **Pains:** needs-you arriving while he's in another session (78 notification-started and 68 peer-started turns ended ❓); the line drawn like a warning; many sessions on two accounts.
- **Tests:**
  1. One `need` peer: exactly one label added, containing the project.
  2. Three `need` peers: `3 need you`.
  3. No peers in need: `modes` unchanged.
  4. Own id, stale heartbeats and malformed files are excluded.
  5. Spies: `$.ui.status` and `$.ui.toast` are never called.
  6. Other mods' labels (`🔒 …`) are preserved in order.
  7. `/sessions` lists the account per peer and strips escapes.
  8. No Pane is ever opened.
- **Depends on:** clutter-4, clutter-5, modsapi-1, usage-4, browsers-28, clutter-27.
- **Risk:** dim SessionMode text in a light terminal (item 26 helps). The label is cut in narrow splits. Polling cost is small (≤ 9 small files every 10 s).

### 3. nebi-quiet (new): shrinks built-in rows he doesn't read

- **Does:** owns these transcript sites:
  - ToolResult `Write` (not errored): `wrote N lines · <relative path>`.
  - ToolResult `Edit`/`MultiEdit`: `edited <path> (+a −b)` (userConfig `diffs`, default `hide`).
  - ToolUse `Workflow` while `isRunning`: `workflow running · <name>`.
  - ToolProgress `background_hint`: `hint: ""`.
  - InfoNotice: hidden.
  - UserMessage with `origin.kind === 'task-notification'` and `!isExpanded`: `↳ <task description> finished`.
  - `isErrored` and `isInterrupted` rows always pass through untouched. Wherever `isExpanded` exists and is true, it passes too.
  - Each site draws its own small tree (no `output` rewrite, so nothing has to fit the tool schema).
- **He notices:** a Write takes one line instead of a code block, a workflow takes one line instead of a progress tree, the ctrl+b pill and the startup notices are gone.
- **Surfaces:** ToolResult, ToolUse, ToolProgress, InfoNotice, UserMessage.
- **Events:** ui.render on those five components.
- **Pains:** code previews in Write results; workflow progress bars; "collapsed code that isn't relevant to him"; "it's all very big".
- **Tests:**
  1. Write result gives one line with the path and no file-content lines.
  2. Write `isErrored` passes through.
  3. Edit is one line by default; `{options:{diffs:'show'}}` passes through.
  4. Workflow running gives one line; finished or interrupted passes through.
  5. ToolProgress `hint` becomes `""`.
  6. InfoNotice gets `display:'none'`.
  7. Task notification not expanded gives one line; expanded passes through; prompt rows are untouched.
  8. Tests run on terminal and desktop.
  9. Live: a capture of a real Write shows one row.
- **Depends on:** clutter-19, clutter-20, clutter-10, online-3, online-6, modsapi-11, modsapi-14, clutter-27, skills-8.
- **Risk:** ToolResult has no `isExpanded`, so ctrl+o also shows the compact Write (the file itself holds the content). The Workflow ToolUse props may not carry progress, hence the generic line. Task-row compaction is not measured live.

### 4. nebi-replies (new): the reply's state badge and less narration

- **Does:** owns AssistantMessage.
  - (a) When a block's last line matches `^[\s>*_\`]*(✅|⏳)`, it draws the block's body unchanged (`Markdown` element, R8), then the status line as a badge with black text: green `✅ DONE` or blue `⏳ WORKING`, followed by the line's words. `❓` lines stay as they are, because the band carries need-you, so the same text never shows twice in color.
  - (b) A `turn.step` hook marks the text blocks of steps that stopped to call tools (the firstmate-calm classifier). Such a block is hidden (`display:'none'`) when it is under 240 chars, has no newline, no `?` and no status glyph. The final reply always shows.
  - userConfig `narration: hide|show`, default `hide`. If he keeps `/focus` after step 0, set it to `show` (focus already does this).
- **He notices:** every reply ends in a colored DONE/WORKING badge, and the "Let me check X" lines between tool calls are gone.
- **Surfaces:** AssistantMessage (every surface).
- **Events:** ui.render AssistantMessage, turn.step (observe only).
- **Pains:** unclear when something is done; debloating chat responses; walls of words.
- **Tests:**
  1. Block ending `✅ Done — X`: body intact plus a green badge with `X`.
  2. `⏳` gives a blue badge.
  3. `❓` passes through.
  4. A block with no status line, not classified, passes through.
  5. A classified working note under 240 chars gets `display:none`; one containing `?` shows.
  6. `{narration:'show'}` passes through.
  7. The status regex matches the Stop hook's `STATUS_RE` (`verify-before-stop.mjs:30`).
  8. Tests run on terminal and desktop.
- **Depends on:** skills-8, skills-10, usage-3, clutter-33, clutter-27.
- **Risk:** the turn.step classifier comes from firstmate-calm, verified only through 2.1.284 and gated on an env flag that must be removed. If the port doesn't land in one pass, ship (a) alone and keep (b) as the follow-up. Hiding model text can hide something useful; ctrl+o keeps everything.

### 5. nebi-receipt (new; takes over beacon's DONE·unproven idea): what changed, mechanically

- **Does:** watches main-loop and sub-agent `tool.call` results during a main turn: files written by Write/Edit/MultiEdit/NotebookEdit, and Bash commands that look like checks (beacon's `isCheck`, `parts.ts:118`) with their outcome. At `turn.complete` for a main-loop turn that edited files, it returns `{text}` as one line:
  - `changed a.ts, b.ts +2 · checked npm test ✓`
  - `changed a.ts · no check since the last edit`
  - `… checked npm test ✗`
  - It uses the Stop hook's rule (the latest check after the latest edit must have passed), so the Stop hook and the receipt never disagree. Turns with no edits, aborted turns and sub-agent turns get no line.
- **He notices:** one dim line under replies that changed something: which files, and whether anything checked them.
- **Surfaces:** the turn.complete text line (transcript, under the answer).
- **Events:** turn.start, tool.call (observe), turn.complete.
- **Pains:** "what changed" (15–40 prompts); unclear done; §6 proof visible to him, not only to the model.
- **Tests:**
  1. Write + Edit, then `npm test` exit 0: the text has both names and `✓`.
  2. An edit after the check gives `no check since the last edit`.
  3. A failing check gives `✗`.
  4. No edits returns `next(e)` unchanged.
  5. More than 3 files shows `+N`.
  6. Paths are relative to cwd; escapes are stripped.
  7. `agentId` set gives no text.
  8. `isAborted` gives no text.
- **Depends on:** usage-22, usage-3, clutter-3, R7.
- **Risk:** one extra row per editing turn. "Check" is a command-order heuristic, like the Stop hook.

### 6. nebi-red-button (reworked, from nebi-red-button 0.1.1): holds, without the noise

- **Does:** unchanged safety core. Irreversible or outward main-loop calls are held with Allow / Block / Allow-for-session buttons in the band, shown only while holding. Sub-agent risky calls are denied at once with a reason (the reason shows in the tool row; no toast).
  - Removed: `$.ui.status` (R14 `:151`) and the toasts (`:61,69`).
  - One PushNotification per hold (userConfig `push`, default on). No speech.
  - Fixes: copy `[3]` → `[a]`. On an unload-origin close, deny at once instead of waiting 10 minutes.
- **He notices:** only when Claude tries something irreversible: a short hold row with the command and three keys.
- **Surfaces:** AbovePrompt (while holding only), PushNotification, CommandOutput (/redbutton).
- **Events:** tool.call (hold/deny), ui.render AbovePrompt, ui.close, command.run redbutton.
- **Pains:** safety with less noise; the "drawn like a warning" status line.
- **Tests:**
  1. Fix the 6 red tests: the stub expects `PushNotification` first.
  2. Add the modsapi-7 list: Esc via `$.ui.close` with person origin denies and cleans up; Esc after a press records the first choice only; a plugin-origin close records nothing; an unload-origin close denies at once; interrupt while held and while queued (export `holdCall`, AbortController); timeout via `mock.clock`; two concurrent holds with a stale-id press; reload clears a dead hold; one push per hold; sub-agents denied at once.
  3. Spies: `$.ui.status`, `$.ui.toast` and `$.audio.speak` are never called.
  4. Tests run on terminal and desktop.
- **Depends on:** modsapi-6, modsapi-7, modsapi-1, modsapi-18, clutter-4, R13, R14.
- **Risk:** low. Band sharing with beacon is mutually exclusive by state (holds only exist while a turn runs; beacon only draws when none runs). Test 2 checks it with `isWorking`.

### 7. nebi-model-lock (reworked lightly, from nebi-model-lock 0.1.0)

- **Does:** unchanged enforcement of doctrine §0 (`agent.spawn` sets the Agent call's `model` when he named one). The lock label moves from the PromptHint `tail` to one SessionMode label, `🔒 sonnet scouts`, shown while a lock is on. No toasts. `/lock` prints the current lock as text.
- **He notices:** a small `🔒 …` at the right of the footer while a lock holds, and sub-agents run on the model he named.
- **Surfaces:** SessionMode, CommandOutput (/lock).
- **Events:** prompt.submit, agent.spawn, ui.render SessionMode, command.run lock.
- **Pains:** "a named model wins" without chatter; the tail collision.
- **Tests:**
  1. The existing 3 still pass.
  2. `$.ui.toast` is never called.
  3. The SessionMode label is added once; other labels are kept.
  4. No PromptHint hook is registered.
  5. Tests run on terminal and desktop.
- **Depends on:** clutter-9, clutter-5, modsapi-13, clutter-27.
- **Risk:** the label is cut in narrow footers.

### 8. nebi-wispr (reworked lightly, from nebi-wispr 0.1.0)

- **Does:** unchanged glossary corrections at `prompt.submit` and sound-alike hints added as model context. Both toasts are removed (R14 `:39,52`). `/wispr` lists this session's corrections and guesses, and adds entries. Its answer is CommandOutput text, not a toast.
- **He notices:** he doesn't, apart from Claude getting "Scrapling" right. `/wispr` shows what it fixed.
- **Surfaces:** none at rest; CommandOutput on /wispr.
- **Events:** prompt.submit, command.run wispr.
- **Pains:** misheard dictation (CLAUDE.md §4); toast clutter.
- **Tests:**
  1. The existing 9 still pass.
  2. `$.ui.toast` is never called.
  3. Corrections are recorded in `$.state` and listed by `/wispr`.
  4. A leading `??` is no longer special-cased (aside is gone), and the text is otherwise intact.
- **Depends on:** modsapi-16.
- **Risk:** none new.

### 9. nebi-browser (new): the right Chrome, mechanically

- **Does:** finds `.claude/browser.json` by walking up from the cwd (schema in section 6).
  - At `session.start`, it sets `BROWSER` to the router with `$.env.set` when unset. This is belt and braces; the settings env is the main path.
  - `tool.call` on `{ tool: /^mcp__claude-in-chrome__/ }`:
    - Denies `switch_browser`, with a reason: "use select_browser with deviceId <id>; switch_browser makes Nebi click a pairing prompt".
    - Denies `select_browser` with any other `deviceId`.
    - Denies page actions when the session account (`CLAUDE_CONFIG_DIR`) differs from `claudeAccount`: "this project runs on omer; restart it with claude-b".
  - Allows a switch for the rest of the turn when his prompt names the other browser or says "other/switch browser" (§0: his word wins).
  - Read-only tab listing always passes. With no `browser.json`, everything passes.
- **He notices:** browser work and artifact pages land in the project's Chrome profile. A session on the wrong account says so in one tool row instead of driving the wrong browser.
- **Surfaces:** none (deny reasons in tool rows).
- **Events:** session.start, prompt.submit (observe), tool.call (deny).
- **Pains:** wrong browser (13x, both projects); silent profile drift; artifact opened in the wrong browser; pairing "approve" clicks.
- **Tests:**
  1. No `browser.json`: all calls pass.
  2. `switch_browser` is denied and the reason contains the deviceId.
  3. `select_browser` with the wrong id is denied; the right id passes.
  4. Account mismatch denies `navigate`/`computer`; a match passes; `tabs_context_mcp` passes either way.
  5. His prompt "use the other browser" lets `switch_browser` through for that turn.
  6. `BROWSER` is set when unset and left alone when set.
  7. Malformed `browser.json` passes everything through, silently.
  8. Sub-agent calls get the same rules.
- **Depends on:** usage-13, usage-14, usage-15, usage-16, browsers-1, browsers-3, browsers-7, browsers-9, browsers-10, browsers-19, browsers-23, browsers-24, online-10, modsapi-3, R11, R13.
- **Risk:** a stale deviceId after an extension reinstall (re-read R11 values then). Whether `$.env.set('BROWSER')` reaches the opener is rated confirmed/medium by one lane and unconfirmed by another, so the settings env plus `~/.zshenv` is primary.

### 10. nebi-tab-guard (new): no surprise windows

- **Does:** denies Bash calls that open terminals, windows or sessions: `node …/term.mjs`, `open (-n)?a Ghostty`, `osascript` aimed at Ghostty, `ghostty +new-window`. They pass only when his current prompt asked for one (terminal / tab / window / split / new session). The deny reason: "Nebi opens sessions himself: print a paste-ready prompt in a code block instead." Sub-agents are always denied. It does not touch `open https://…` (nebi-browser's domain) or headless `claude -p`.
- **He notices:** no Ghostty windows he didn't ask for; a paste-ready prompt instead.
- **Surfaces:** none.
- **Events:** prompt.submit (observe), tool.call (Bash, deny).
- **Pains:** "are you the one that opened so many different terminals", "don't do it, just give me a prompt"; handoffs (54x).
- **Tests:**
  1. A `term.mjs` call with no ask is denied with the reason.
  2. Prompt "open a new terminal for the build": passes.
  3. Sub-agent: denied even when asked.
  4. Unrelated Bash passes untouched.
  5. The `open -na Ghostty` and osascript variants are caught.
  6. `open https://x` is not matched.
- **Depends on:** usage-23.
- **Risk:** a regex can miss an exotic launch path. A false deny when his ask was indirect: the reason tells the model to ask or print the prompt.

---

## (3) Dropped

- **nebi-aside**: built-in `/btw` does the same (modsapi-9). Used 0 times since it landed (usage-18).
- **nebi-fleet-radar**: `/fleet` used 0 times (usage-18). It writes state twice per tool call and runs a 1 s ticker even when closed (modsapi-8). Its PromptHint viewport read collides with a single footer owner. The built-in agents view already counts needs-input and working sessions (modsapi-17).
- **nebi-plan-rail**: duplicates the built-in task list, whose `activeForm` already shows in the spinner (R6). Its own MCP tool rows and per-request system-prompt section are noise (modsapi-10). Nobody asked for it; only the model calls it (usage-19).

---

## (4) mods/CONTRACT.md changes

Replace the surfaces table, voice section, beacon schema and shared events as follows.

**Quiet rule (new, top of the file).** A mod draws only what Nebi acts on now. At rest the whole nebi set adds at most one band row (need-you) and one receipt row (editing turns). No animation, no sound.

**Surfaces**

| Surface | Owner / rule |
|---|---|
| Status line (`statusline.mjs`) | Not a mod surface. The doctrine owns it. |
| AbovePrompt band | Two writers, mutually exclusive by state. `nebi-beacon` draws at most 1 row, only when no turn runs and the last reply ended `❓` (or an API error stopped it). `nebi-red-button` draws only while it holds a call, which happens only during a turn. Both call `const below = await next(e)` first, stack below it, and return `below` when idle or when `hasSurvey`. No other mod hooks the band. |
| PromptHint | `nebi-beacon` alone. It rewrites `hint` (stripping `(shift+tab to cycle)` and `? for shortcuts`), which drops `tail`, so **no mod uses `tail`**. |
| SessionMode | Shared and additive. A mod may append at most one label of 24 cells or fewer, built from its own state. It never filters or replaces another mod's label and never draws a tree. Writers: `nebi-constellation`, `nebi-model-lock`. |
| Spinner | No nebi mod. The engine shows the task `activeForm`. |
| ToolUse, ToolResult, ToolProgress, InfoNotice, UserMessage | `nebi-quiet` alone. It never hides `isErrored`/`isInterrupted` rows, and passes when `isExpanded` is true. |
| AssistantMessage | `nebi-replies` alone, with the same pass rules. |
| `turn.complete` `{text}` | `nebi-receipt` alone. Every other `turn.complete` hook returns `await next(e)` unchanged. |
| Panes | None open unasked. Only a command he typed opens one. |
| `$.ui.status` | **Banned.** The engine always draws it as `⚠ <plugin>:` in warning color. |
| Toasts | Only as the direct reply to a command he typed this moment. Never for background events. |

**Voice, sound, push.** No speech by default (`speak` userConfig, default off, beacon only). No sounds. PushNotification: beacon sends at most one per ask, skipped when the model pushed that turn; red-button sends one per hold.

**Beacon file v2** (same folder, write and stale rules):

```json
{ "version": 2, "sessionId": "…", "project": "nebi-skill", "cwd": "…",
  "account": "nebi | omer", "browser": "Main Chrome | RapidSneakers Chrome | null",
  "kind": "idle | working | done | need | background | stopped | error | missing",
  "text": "the status line's words", "ask": { "what": "…" },
  "startedAt": 0, "updatedAt": 0, "heartbeatAt": 0 }
```

`ask.why` and `ask.reply` are removed: there are no answer suggestions any more. Readers accept v1 and v2. The heartbeat restarts on `turn.start` (after `/clear`).

**Shared events**

- `prompt.submit`: `nebi-wispr` may rewrite. `nebi-beacon`, `nebi-browser`, `nebi-tab-guard` and `nebi-model-lock` only read `e.text.trimStart()`. The `??` rule is removed.
- `agent.spawn`: only `nebi-model-lock` may rewrite `model`.
- `tool.call`: deniers have disjoint match sets. `nebi-red-button` takes destructive/outward Bash and MCP send/publish/delete. `nebi-browser` takes `mcp__claude-in-chrome__*`. `nebi-tab-guard` takes terminal-opening Bash. Everyone else observes and always passes the call on. Every deny carries one sentence telling the model what to do instead.
- `turn.complete`: `nebi-receipt` owns `text`. `nebi-beacon` reads `answer`.

**Shared rules**

- One status regex, the Stop hook's `^[\s>*_`]*(✅|⏳|❓)`. One proof rule: the latest check after the latest edit passed (the Stop hook's §6).
- Kill switch: every mod reads `NEBI_MODS_OFF` (`all` or a comma list) at load and becomes pass-through. This allows before/after screenshots without `--safe-mode`, which would also drop his settings hooks.
- No-mod fallback: each mod's README names what still works with mods off (status line, Stop hook, output style, SessionStart line, BROWSER router).

**Done bar**

- `claude plugin validate`.
- `claude plugin test` over terminal and desktop.
- `tsc` when installed (it isn't today, modsapi-16).
- **A live screen check through the nebi-mod-verify skill:** the asserted strings are absent from a real terminal capture, and the band and footer read as specified. `plugin test` never sees the painted screen (skills-3).

**Colors.** Unchanged: badge backgrounds with black text, readable in light and dark.

---

## (5) Doctrine changes so skills and mods work as one

**Output style** (`claude-home/output-styles/nebi.md`). Keep the status-line block and the self-contained rule (lines 13–21). Replace line 23 and add:

> - Answer first. Then only what changed, what's next, and whether you need him. No recap of the conversation and no closing summary.
> - Under about 8 lines unless he asked for depth. If he'd have to scroll, put it in a page and give the link.
> - Between tool calls, at most one short line per phase. Don't narrate what you're about to do.
> - Say what changed in plain words (what it does now), not a file list.
> - Don't explain tooling noise (watchers, hooks, reloads).
> - **Questions.** Ask in chat; pages are for reading. If a decision truly needs a page, the ❓ line names the decision and the link. Put each open question in one plain sentence, numbered if there are several, with your recommendation in a short clause ("I'd take X: it's cheaper"). Never list answer options for him to pick. For a blocking either/or, the AskUserQuestion card is fine: one question, at most 3 short options, recommendation first, and don't repeat its options in prose. Re-ask still-open questions this way just above the status line, and never point at them by count.

The PushNotification sentence stays as the no-mod fallback; beacon skips its own push when the model pushed. (Rests on clutter-26, usage-20, usage-2, usage-1, usage-21, usage-28. The 9-of-28 typed pushbacks, "What do you recommend", are why the recommendation stays and the menu goes.)

**Statusline** (`claude-home/nebi/statusline.mjs`): items 1–3 above. Layout: `Opus 5.5 · ctx 45% · xhigh · 5h 30% · wk 41% · ⎇ master · nebi [· RapidSneakers Chrome]`. A red mismatch badge appears when the account differs from `browser.json` `claudeAccount`. Ship the account part only after the inheritance check (see Unverified).

**Hooks**

- `verify-before-stop.mjs`: item 10, parts (a) and (b). Node test: a payload with only a `live updates for artifact …` task and a reply ending `⏳` must emit the §3 soft check, not the background nudge. A payload with a real `workflow` task and a reply ending `⏳` must emit nothing. The same payload with `✅` must emit the background nudge.
- `session-start.mjs`: add one line from `.claude/browser.json`: `Browser for this project: RapidSneakers Chrome (Chrome "Profile 3", device bbbbbbbb-…). Claude account: omer. Use select_browser with that device; never switch_browser.` (browsers-25).
- `feedback-capture.mjs` (optional, cheap): skip cross-session peer messages so the complaint inbox holds only his words (usage-34; not load-bearing).

**Settings** (`~/.claude/settings.json`, shared by both accounts per R10). Teach deploy.mjs to master these keys (R15):

```json
{
  "theme": "auto",
  "showTurnDuration": false,
  "awaySummaryEnabled": false,
  "bashEditDiffEnabled": false,
  "spinnerTipsEnabled": false,
  "promptSuggestionEnabled": false,
  "env": {
    "CLAUDE_CODE_IDLE_THRESHOLD_MINUTES": "100000000",
    "CLAUDE_CODE_IDLE_TOKEN_THRESHOLD": "1000000000000",
    "DISABLE_AUTOUPDATER": "1",
    "BROWSER": "/Users/nebi/.claude/nebi/bin/open-url"
  },
  "enabledPlugins": {
    "cc-plugin-you-should-know@builtin": false,
    "nebi-beacon@nebi-mods": true,
    "nebi-constellation@nebi-mods": true,
    "nebi-aside@nebi-mods": false,
    "nebi-fleet-radar@nebi-mods": false,
    "nebi-plan-rail@nebi-mods": false
  }
}
```

Two of these keys have conditions. `awaySummaryEnabled: false` lands only after beacon v0.3 ships. `terminalProgressBarEnabled` stays at its default unless he says the Ghostty bar is the one he meant. Plus a launchd job `com.nebi.claude-update` running `claude update` daily at 05:30.

**Skills and CLAUDE.md**

- CLAUDE.md §10, Ghostty line: "Open a terminal with term.mjs **only when Nebi asks**; otherwise print a paste-ready prompt." (usage-23; nebi-tab-guard enforces it.)
- `nebi-sessions`: a handoff is a paste-ready prompt block. Never open a session or terminal to hand off.
- `nebi-maintenance` `references/capability-routing.md`, browser section: `.claude/browser.json` is the source of truth; select by deviceId, never `switch_browser`; the router handles artifact and CLI pops.
- **New `nebi-mod-verify` skill** (the §10 "verification skill"). It drives a real terminal: `screen -dm` plus `hardcopy` today (both installed, skills-7), with tmux or microsoft/tui-test on the shortlist for his yes (skills-4). It takes a `--safe-mode` baseline (skills-5) and checks the debug log for "hooks module loaded" vs "rollout switch served off" (skills-6). It asserts that the strings `(1M context)`, `shift+tab to cycle`, `Baked for`, `background task`, `recap:` and `new task?` are absent, and that a Write shows one row. It saves before/after captures for him.
- Project change in cnlsneakers (his call): delete the BROWSER-LOCK ritual repeated in 8 docs once browser.json lands. Batch OAuth/terms/install "yes" up front so he only types credentials, 2FA and payment (browsers-16, browsers-27).

**Combo map.**

- The output style's status line feeds the beacon band, the replies badge, the Stop hook §3, the constellation label (through beacon files) and the phone push.
- tool-ledger plus the Stop hook §6 nudge the model; nebi-receipt shows Nebi the same rule.
- nebi-orchestration names models; model-lock enforces them.
- nebi-sessions handoffs and §10 are enforced by tab-guard.
- browser.json feeds the router, the SessionStart line, the status line and nebi-browser.

---

## (6) Per-project browser setup

1. **One source of truth per project: `.claude/browser.json`** (committed). With no file, the project uses the main Chrome on account nebi.
   - `cnlsneakers/.claude/browser.json`:
     `{ "label": "RapidSneakers Chrome", "app": "Google Chrome", "profile": "Profile 3", "chromeDevice": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "claudeAccount": "omer" }`
   - `ecommerce-workspace/.claude/browser.json` and `nebi-skill/.claude/browser.json`:
     `{ "label": "Main Chrome", "app": "Google Chrome", "profile": "Default", "chromeDevice": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "claudeAccount": "nebi" }` (device ids from R11; profiles from usage-13 and browsers-1).
2. **Router `~/.claude/nebi/bin/open-url`** (master in `claude-home/nebi/bin/`, deployed). It is set as `BROWSER` in settings env (both accounts via R10) **and** exported in `~/.zshenv` (none today, R12), so attached sessions, whose attacher's BROWSER wins, route too (modsapi-3, browsers-8). The router:
   - walks up from its cwd (the opener runs in the session cwd) to `browser.json`;
   - runs `open -na "Google Chrome" --args --profile-directory="<profile>" "$1"` detached;
   - **exits 0 fast**, because the opener waits up to 10 min and treats a non-zero exit as failure (browsers-4);
   - with no file, uses the Default profile.
   This covers artifact auto-open, explicit open, ctrl+], clicked transcript links and CLI pops from Bash.
3. **Keep artifact auto-open on.** `CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0` would also kill the explicit open action (modsapi-3), and the router already fixes the wrong-profile cause.
4. **Agents know without reading docs.** The SessionStart line from browser.json (section 5) replaces the "list then select bbbbbbbb" ritual.
5. **Mechanical guard: nebi-browser** (mod 9). It denies `switch_browser`, any other device and account mismatches. With mods off, steps 1–4 still work.
6. **He sees which is which.** The status line ends `omer · RapidSneakers Chrome`, or turns red on a mismatch.
7. **His one-time clicks** (suggested, not agent work): rename Chrome Profile 3 from "Your Chrome" to "RapidSneakers" and give it a color matching the status-line badge. Name the two extension connections once through `switch_browser` ("Main Chrome", "RapidSneakers Chrome"), since both are "Browser 1" today (R11).
8. **Optional:** `claude-profile` picks the account from `browser.json` `claudeAccount` when none is given, or warns. That way a project can't start on the wrong account.

---

## Build order (one Opus pass each)

0. Config pass, no mods: statusline (items 1–3, without the account part), Stop hook (item 10, with its node test), settings items 6, 11, 12, 13, 26, 27, output style. Before/after captures. Try `/focus` once with him.
1. nebi-beacon v0.3. Then flip `awaySummaryEnabled: false`.
2. nebi-constellation v0.2.
3. nebi-quiet.
4. nebi-replies (badge first; narration second, if the port lands).
5. nebi-receipt.
6. nebi-red-button fixes.
7. model-lock and wispr quieting.
8. browser.json, router, SessionStart line, statusline account part (after the inheritance check), then nebi-browser.
9. nebi-tab-guard, plus the §10 doctrine line.
10. Remove aside, fleet-radar and plan-rail from the marketplace and enabledPlugins. Commit `mods/` (it is untracked today, modsapi missedByLane).

## Unverified dependencies (say so before building on them)

- The exact PromptHint hint string in bypass mode, and that a rewrite visibly drops `(shift+tab to cycle)`. Confirm with a screenshot first (clutter and modsapi unconfirmed lists).
- Whether the status-line child process inherits `CLAUDE_CONFIG_DIR`. The account word and the mismatch badge depend on it. Check by printing it once under `claude-b`.
- Whether `open -na "Google Chrome" --args --profile-directory=… <url>` opens cleanly in the running Chrome. Not run: it opens windows.
- Whether settings `env` applies before the engine snapshots the `CLAUDE_CODE_IDLE_*` vars. The design exports them in `~/.zshenv` too.
- Whether directory-marketplace plugins auto-update. With `DISABLE_AUTOUPDATER`, deploy must `/reload-plugins`.
- How the desktop Code tab draws PromptHint, SessionMode and the band (online-22). It is rarely used (usage-8).
- Whether an empty tree from InfoNotice takes zero rows.
- ctrl+o shows the compact Write too, since ToolResult has no `isExpanded`.
- The firstmate-calm `turn.step` classifier on 2.1.288. It was verified only through 2.1.284 and is env-gated.
- What the Workflow ToolUse props carry (progress or not).
- Whether a mod's own `$.tool.call('PushNotification')` draws a transcript row.
- `$.env.set('BROWSER')` reaching the opener: browsers-7 rates it confirmed/medium, modsapi lists it as unconfirmed. Settings env plus zshenv is primary.
- `theme: "auto"` readability (clutter-34) and `bashEditDiffEnabled` (clutter-22) are not-load-bearing findings.
- Which "Approve" he meant (extension site permission vs artifact approval pages).
- A remote rollout switch can serve mods off (online-2). Every mod has a no-mod fallback above.
- `tsc` is not installed (modsapi-16). The done bar uses it only when present.
