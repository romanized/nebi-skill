# Online lane: verification (2026-10-03)

Fresh, skeptical re-check of the online lane's load-bearing claims against primary sources: the 2.1.288 binary (`/Users/nebi/.local/share/claude/versions/2.1.288`), the bundled types file (`claude-code.d.ts`), the live docs (curl of `code.claude.com/docs/en/plugins/mods/*.md`), `gh api` on the cited issues/repos, and local read-only checks. Read-only; no edits other than this file.

Note: `grep` on this machine is ugrep and refuses long context regexes; binary context was pulled with a small Python script (`re.finditer` over the binary bytes).

## Verdicts

| id | status | one-line |
|----|--------|----------|
| online-1 | confirmed | 2.1.287 = 2026-10-01T18:00:22Z, 2.1.288 = 2026-10-02T20:19:57Z; docs say on by default and env var ignored |
| online-2 | confirmed | rollout-switch strings and gate code are in the 2.1.288 binary; Nebi's own process currently loads installed mods |
| online-3 | confirmed | both repos do exactly that; `display:'none'` is a typed Box prop. TurnDuration is terminal-only |
| online-4 | partly | shift+tab part is correct; the ctrl+b pill **does** have a render site on 2.1.288 (`ToolProgress`) |
| online-5 | confirmed | binary has only `hideVimModeIndicator`; a PromptHint mod removes the hint but the engine keeps the mode label |
| online-6 | partly | "Stop hook feedback" row really has no render site, but task-notification rows **do** raise `UserMessage` on 2.1.288 |
| online-7 | confirmed | docs interface.md:292; options are schema `min(2).max(4)` so a rewrite can't drop them |
| online-8 | confirmed | buttons verbatim in binary; off by default per docs. **Nebi has it enabled** |
| online-9 | partly | fields confirmed; lane missed `status:"waiting"` + `waitingFor`, desktop sessions also register; `.key` content unverified |
| online-10 | confirmed | live tool descriptions confirm select vs switch; repo header matches |
| online-22 | partly | issues exist as described, but #99211 is Windows/2.1.286 and #99217 is Remote Control viewing, not Code-tab hosting |

## Details and receipts

### online-1: confirmed
- `gh api repos/anthropics/claude-code/releases`: `v2.1.288 2026-10-02T20:19:57Z`, `v2.1.287 2026-10-01T18:00:22Z`.
- CHANGELOG.md (fetched via `gh api .../contents/CHANGELOG.md`): "Added Claude Mods" and "Added You should know" sit at **lines 97-98** today (lane said 95-96; the file has grown).
- `mods/overview.md` line 97: "Mods require Claude Code v2.1.287 or later, and they're on by default." Line 112: v2.1.287+ ignores `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, so `0` doesn't keep mods off.
- Binary: the env var appears 3 times, all inside env-name allowlists; no code reads it.

### online-2: confirmed (with a local note)
- Issue #99130 (open, 2026-10-03T03:04:52Z, labels bug/macos/plugins) quotes the debug line; one comment (2026-10-03T07:55Z) reports the same on Linux Mint.
- Binary 2.1.288: `var xje={served:"the rollout switch served off",saved:"the rollout switch was saved off by an earlier session and is not refreshed yet"}` and gate `lHt(...)`: `if(g)return "hooks modules are turned off for installed plugins in this process: ${t3r()}; built-in plugins load regardless"`.
- Changelog 2.1.288 line 93: "Fixed `claude plugin test` reporting mods as turned off remotely when it had only read an out-of-date saved setting".
- **Local**: this very session exposes `mcp__nebi-plan-rail__plan`, described as "registered by the nebi-plan-rail plugin through $.tool.register", so installed mods are loading for Nebi right now. `~/.claude/debug/` holds no logs to confirm further. The switch is server-side and can still flip, so the fallback rule stands.

### online-3: confirmed
- `joshhornby/dotfiles .../calm/hooks/calm.tsx` lines 94-122: ToolUse returns `<Box />` (zen or while running) unless `isErrored || isInterrupted`. ToolResult returns `<Box />` in **any** non-off mode unless errored. ToolGroup and TurnDuration do the same in zen.
- `kunchenguid/firstmate .../firstmate-calm/hooks/register.ts` ~lines 365-369: `hiddenRow` = `Box({ display: "none" })`.
- Types: `display?: 'flex' | 'none'` (claude-code.d.ts:829).
- Caveats: (a) `TurnDuration` is "Raised on the terminal surface only" (d.ts:9466-9468; binary surface table `TurnDuration:["terminal"]`), so "Baked for…" hiding does nothing in the desktop Code tab, which draws its own footer. (b) That Write's code preview is the `ToolResult` row is consistent with the types (d.ts:9270 "result block drawn under a standalone tool row") but was not run here.

### online-4: partly
- Confirmed: binary `Ok.read()` (`Wse`) takes the drawn footer text, removes `"<mode label> on"` and a leading ` · `, and returns the rest as `hint`. So `hint` holds `(shift+tab to cycle)` and not "bypass permissions on". Types d.ts:9530-9580 say a rewrite replaces the line and `tail` draws only on the terminal. PromptHint is raised on terminal and desktop.
- Confirmed by binary: when a hook redraws, the engine still prints the mode label (`BM`/`vx` with `mode`) followed by `" · "` before the hook's drawing. So "bypass permissions on" stays, which is what Nebi wants. Unconfirmed by running: hint `""` may leave a trailing ` · `.
- Build note: the captured values include `1 shell · ← for agents`, so strip only the `(shift+tab to cycle)` substring. Replacing the whole hint would also drop live pills.
- **Refuted part**: "the (ctrl+b to run in background) pill … has no render site". On 2.1.288 it is the `ToolProgress` render site (`kind:'background_hint'`, `hint: '(ctrl+b to run in background)'`; d.ts:9405-9430: "`""` draws nothing"). It is terminal only (binary `ToolProgress:["terminal"]`; `useRenderInput("ToolProgress",…)` present). The #91870 measurement was taken on 2.1.273.

### online-5: confirmed
- Binary: the only `hide*Mode/Hint/Indicator/Footer` setting is `hideVimModeIndicator` (5 hits). No permission-mode hide setting exists.
- #89126 (open), #91221 (open) and #93803 (open) are all enhancement requests. A comment on #89126 (2026-09-27, derwells) says "no setting, env var or flag to hide it as of 2.1.283".
- Nuance: the mod route removes only the hint. The engine keeps drawing the mode label (see online-4).

### online-6: partly
- Confirmed (stronger than the lane's receipt): "Stop hook feedback: …" is drawn by binary function `Cg` (the stop-hook summary row "Ran N stop hooks" + `EO()` = "⎿ Stop hook feedback: <additionalContext>"). `Cg` never calls `hc.useRenderInput`. The 12 `useRenderInput("…")` literals in the binary are AskUserQuestion, AssistantMessage, CommandOutput, InfoNotice, PromptHint, SessionMode, Spinner, ToolGroup, ToolProgress, ToolResult, ToolUse×2 and TurnDuration, plus UserMessage through `BO("UserMessage",…)`. So no mod can hide this row, and the fix belongs in `~/.claude/hooks/verify-before-stop.mjs` lines 86-93: it emits `additionalContext` on every stop while any `background_tasks[].status === 'running'`.
- **Refuted part**: "task-notification rows such as 'Background command … completed' emit no ui.render event" is outdated. On 2.1.288, `UserMessage` covers "a background task's notification" (d.ts:9133-9172; `PromptOrigin.kind:'task-notification'` d.ts:8266; optional `task` prop). The binary's `useUserMessageSite` passes `task` into `BO("UserMessage", …)`. Those rows are hookable now.

### online-7: confirmed
- `mods/interface.md` line 292: "The permission prompt isn't a render site … `AskUserQuestion` … A tree for the dialog has to hold the reference exactly once, with your elements above it. Otherwise, Claude Code draws its own dialog."
- RenderComponent union (d.ts:8712) has no permission component.
- AskUserQuestion props rewrite "must still fit the tool's schema" (d.ts:9117-9121), and the schema in the binary is `options:k(e).min(2).max(4)`. So options cannot be removed, only relabeled.
- Pluto Security post not re-fetched.

### online-8: confirmed
- Binary: `ee(e,[{hotkey:"1",label:"Understood",…},{hotkey:"2",label:"Chat in main session",…},{hotkey:"0",label:"Dismiss",…,role:"dismiss"}])`.
- overview.md:233 says "Disabled by default". Changelog line 98 says "(for first-party sessions with telemetry on)".
- The X post's token-cost criticism was not re-fetched; treat it as unverified.
- **Local, important**: `~/.claude/settings.json` has `"cc-plugin-you-should-know@builtin": true`, and no telemetry-disabling env key is set. Nebi has it ON, so its numbered-button note is likely one of the "answer options pushed at him".

### online-9: partly
- Local, keys only: 5 `*.json` + 5 `*.key` in `~/.claude/sessions/`. Keys: pid, sessionId, cwd, startedAt, procStart, version, peerProtocol, peerFeatures, kind, entrypoint, pidDomain, messagingSocketPath, name, nameSource, nameSince, status, updatedAt, statusUpdatedAt, bridgeSessionId. Statuses seen: idle×2, busy×3. All `entrypoint: cli`.
- Binary adds what the lane missed:
  - status map `{running:"busy",requires_action:"waiting",idle:"idle"}` and `Zhe()` → `{status:"waiting",waitingFor:…}`, where `waitingFor` is "input needed" | "permission prompt" | "worker request" | "sandbox request" | top dialog.
  - The reader also parses optional `state`, `detail`, `tempo` (active|idle|blocked) and `needs`.
  - `Nn()` maps `entrypoint` `claude-desktop`/`claude-desktop-3p`/`local-agent` to "desktop", so Code-tab sessions also register.
  - Caveat: "waiting" covers dialogs only. A reply that ends "❓ Need you" leaves the session `idle`.
- Repos: Dubbus/claude-fleet (created 2026-10-01, 1 star) README lines 136-138 and 155. estruyf/claude-agent-watch-mod (created 2026-10-02, 0 stars) README shows working/waiting/idle.
- Unverified: that `.key` files hold tokens (not read, by rule). The JSON files carry no token-named field, contrary to fleet's "other fields … include auth tokens" wording.

### online-10: confirmed
- `yash-gadodia/claude-mods/chrome-switch/hooks/register.ts` (repo created 2026-09-21, 1 star):
  - header lines 1-19 match the claim (deviceId map in `~/.claude/chrome-browsers.json`, names don't survive the round trip, measured 17-09-2026);
  - the `tool.call` hook on `/^mcp__claude-in-chrome__/` selects the default before the first non-steering call;
  - it adds context telling the model to call select_browser rather than switch_browser.
- Live tool schemas in this session:
  - `select_browser`: "without broadcasting a pairing request";
  - `switch_browser`: "Send a connection request to every Chrome browser … wait … for the user to click 'Connect'".
- Caveat: the built-in `list_connected_browsers` description tells the model to ask with AskUserQuestion when several browsers are connected and "Never pick one yourself". Model-side steering fights that. A plugin-side select (what chrome-switch does) avoids it.

### online-22: partly
- #99211 exists (open, 2026-10-03), but the report is from desktop 1.40609.1.0 on **Windows** (MSIX) with CC 2.1.286. Mechanism: the desktop drops the `instances` list in `ui_invalidate` and rebuilds every site. Buttons break only in sites that read fast-changing state (`ui_press not handled`). Not shown on macOS.
- #99217 (open) is about desktop/iOS **viewing a terminal-hosted session through Remote Control**. It does not cover the desktop Code tab hosting its own session.
- #99045 (open) VS Code extension 2.1.287: zero `ui_render`/`ui_attach` occurrences in extension.js/webview; confirmed as reported.
- So "desktop-app mod rendering is shaky" is a plausible risk, not a measured fact for Nebi's macOS Code tab.

## Missed by the lane
1. "You should know" is enabled in Nebi's settings (`cc-plugin-you-should-know@builtin: true`). Its 1/2/0 button note is a likely source of the "answer options" he dislikes. Disabling it is a one-line config fix, no mod needed.
2. On 2.1.288 the ctrl+b pill is a `ToolProgress` render site (terminal only); a hint `""` hides it.
3. On 2.1.288 task-notification rows raise `UserMessage` (`origin.kind 'task-notification'`, `task`). Only the stop-hook summary row ("Ran N stop hooks / Stop hook feedback") is unhookable.
4. The session registry writes `status:"waiting"` plus `waitingFor` for permission prompts and input dialogs, and desktop Code-tab sessions register too (entrypoint `claude-desktop`). A cross-session "needs you" signal can key on that, plus idle-with-❓ for replies that ask him something.
5. Installed mods are loading for Nebi right now (nebi-plan-rail's `$.tool.register` tool is live in this session). The rollout-off bug is a fallback concern, not his current state.
6. PromptHint rewrites keep the engine's mode label and separator. Strip only `(shift+tab to cycle)` so live pills (`1 shell`, `← for agents`) survive.
7. `TurnDuration`, `InfoNotice` and `ToolProgress` are terminal-only. In the desktop Code tab those hides do nothing.
8. The 2.1.288 changelog fixed "Claude in Chrome asking before every screenshot and page read on a site you allowed when auto mode is unavailable"; typing, navigation and JS still ask. Some of Nebi's "approve" clicks may be site-permission prompts, not the pairing broadcast that chrome-switch solves.
9. AskUserQuestion can be suppressed outside mods (a PreToolUse hook deny, or a permissions deny rule; unconfirmed by running). But `list_connected_browsers` tells the model to use AskUserQuestion for picking a browser, so a blanket deny interacts with the browser flow.
