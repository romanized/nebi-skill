# Lane: modsapi — Claude Code 2.1.288 mods capability map + audit of the 8 nebi mods

Date: 2026-10-03. Build: `claude --version` → `2.1.288 (Claude Code)`.
Abbreviations used for receipts:
- **T** = `/private/tmp/claude-501/bundled-skills/2.1.288/05c1550b06cfbccd1c30b5b6bff87243/plugin-authoring/types/claude-code.d.ts`
- **R** = `.../plugin-authoring/reference.md` (same folder)
- **B** = binary `/Users/nebi/.local/share/claude/versions/2.1.288`; `B@N` = byte offset found with `LC_ALL=C grep -boa`, read with `dd`.
- **M** = `/Users/nebi/Documents/GitHub/nebi-skill/mods`

Research only: nothing was edited, installed or committed. `claude plugin validate` and `claude plugin test` were run on each mod (both read the folder; `test` may rewrite the gitignored generated `tsconfig.json` and `.claude-plugin/types/`). Note: `git status` shows the whole `mods/` folder as untracked (`?? mods/`), so git cannot show changes inside it.

---

## TL;DR for the build

1. **`$.ui.status` always draws as a warning.** The engine pins it as a notification `⚠ <plugin>: <text>` in the `warning` color; a plugin can set neither glyph nor color. That is the "▲ nebi-constellation: 3 need you" Nebi sees (the glyph is U+26A0 ⚠). Do not use `$.ui.status` for calm state. (B@208184926, B@191136566, B@208686279, B@179520605.)
2. **Mods are on by default** for this account: the rollout flag `tengu_plugin_hooks_modules` defaults to `true`, and `--bare`, safe mode, `allowManagedHooksOnly`, disabled hooks and an untrusted folder turn them off. This session has them loaded (the `mcp__nebi-plan-rail__plan` tool exists). Each mod still needs a no-mod fallback, because the flag is served remotely. (B@186686008, B@186688000.)
3. **Browser handoff has two real levers, neither needs a mod.** Artifact auto-open and ctrl+] go through one function that runs `BROWSER` (or `open`) with the URL as its only argument, and `CLAUDE_CODE_ARTIFACT_AUTO_OPEN` set falsy skips auto-open. A mod can also take over the Artifact tool's `open` action through `tool.call`. It cannot hook the engine's internal open. (B@193344035, B@210297844, B@208683610, B@210597355.)
4. **The NEED YOU card with answer buttons is nebi-beacon.** It runs `$.model.fork` to turn every ask into a card with up to 3 answer options. That is exactly what Nebi dislikes. (M/nebi-beacon/hooks/parts.ts:201-221, register.tsx:447-470.)
5. **Two mods duplicate built-ins.** nebi-aside duplicates `/btw` (B@189717299). nebi-plan-rail duplicates TodoWrite and the task list, and adds a system-prompt section plus a transcript tool row per update.
6. **Tests:** all 8 pass `claude plugin validate`. `claude plugin test` passes for 7. **nebi-red-button fails 6 of 13**: the 0.1.1 PushNotification line went in without a test update. The Esc, interrupt, timeout and concurrency paths have no tests.
7. **nebi-fleet-radar writes state twice per tool call** (register.tsx:223 and :241). It also keeps a 1 s ticker calling `$.agent.list` and `$.session.usage` while the pane is closed.
8. **Renderable levers the current mods do not use:** `TurnDuration` (Baked for …), `ToolResult` (Write previews), `ToolGroup`, `AssistantMessage` (restyle the final status line), `UserMessage` task notifications, `prompt.attachment` (null out reminders), and `turn.complete` returning `{text}` (a line under the answer). A `PromptHint` hint rewrite likely makes the engine draw the mode label without "(shift+tab to cycle)" (inferred, verify on screen).

---

## Part A — Capability map (2.1.288)

### A1. Gating: is the mods API on, and how to force it

- Flag: `var oZ="tengu_plugin_hooks_modules";var bIe=!0;var cK=()=>!Lt()&&T(oZ,bIe);var Rje=()=>cK()&&!Vr("hooks")&&!Sr();var nwn=()=>Rje()&&!vb()&&!ry();` (B@186686008). The default is **true**.
- Flag source labels (B@186688000): `override` "from a local override", `payload` (GrowthBook this session), `disk` (cache of an earlier session), `disabled` "from the default (GrowthBook is off for this session: a third-party provider, or telemetry opted out)", `fallback` "from the default (a cold GrowthBook cache…)". With telemetry off or a 3P provider, the default (on) applies.
- Off causes: "the rollout switch served off", or "saved off by an earlier session and is not refreshed yet" (B@186688000).
- Local override: GrowthBook client `readEnvironmentOverrides:()=>a.CLAUDE_INTERNAL_FC_OVERRIDES` (B@181921707). That is an internal env var; its format is unconfirmed, so do not build on it.
- Hot-reload refusals list (B, "dev mods: mod hot-reloading is off here"): `managed_hooks_only` (policy `allowManagedHooksOnly`), `hooks_disabled_in_settings`, `safe_mode` (`Sr`), `bare_mode` (`Vr("hooks")`), `untrusted`. That maps `Rje` = flag && not `--bare` && not safe mode. B also has "Skipping plugin hooks - safe mode disables installed plugins…" (B@188710122).
- With the switch off: a `claude -p` run names a `--plugin-dir` module that did not load on stderr, "the switch being off included" (R:74). An interactive session sends that line to the debug log only. Settings (classic) hooks still run, so the **no-mod fallback = settings hooks + output style + statusline script**.
- Live proof: this session lists the MCP server "nebi-plan-rail: Tools registered by the nebi-plan-rail plugin through $.tool.register", so mods are loaded for Nebi today.

### A2. Events a productivity mod would use (T:3732-4212, op events T:6405-6740)

| Event | Input / result (short) | Use |
|---|---|---|
| `session.start` | `{cwd}`, observe; first one awaited before prompt 1 | register tools/commands, start timers (T:3732+ "Fires once per process for each loaded plugin"). Note: **no `session.start` after `/clear`** (R:27). |
| `session.end` | `reason` (exit, clear, resume…), short shared wall-clock bound `next.budget` | clean up beacon files |
| `prompt.submit` | `text`, `origin`, `context`; rewrite with `next({...e,text})`, stop with `{drop}` | wispr, aside, model-lock |
| `prompt.compose` | `{sections}`; append/replace/drop | plan-rail adds a section |
| `prompt.attachment` | `{text}`; `{text:null}` drops a reminder (e.g. `todo_reminder`) | cut model-side noise |
| `prompt.suggest` | `{isShown:false}` drops the dim suggestion | debloat |
| `tool.call` | tool input + `agentId`; `{deny}` / `{result}` / `next` | red-button holds; Artifact `open` takeover |
| `tool.check` | permission verdict | auto-allow things Nebi would approve anyway (browser-approval friction) |
| `agent.spawn` | `{model}`; rewrite `model` or `{deny}` | model-lock |
| `turn.start` / `turn.complete` | `turnId`; complete has `reason`, `answer`, `durationMs`, `usage`, `isAborted`; returning `{text}` "shows it beneath the answer" | done/need detection; a one-line done marker |
| `turn.step` (stream) | model request; can switch `model`/`effort` | not needed |
| `session.measure` | pushed context/rate-limit/cost changes | quota line without polling |
| `session.receive` | deliveries (peer msgs, relay events); `{consumed}` | mute noise from peers |
| `classic.<Event>` | the settings-hook events as hookable chain, e.g. `classic.Stop` (has `background_tasks[]` with `type`, `server`, `tool`), `classic.Notification` (`message`, `title`, `notification_type`), `classic.MessageDisplay` (`displayContent`) | T:1068-1220, T:642-673, T:6276, T:5737 |
| `ui.render` | `component`, `surface`, `props`, `viewport`, `requestId` | draw / rewrite components |
| `ui.open` / `ui.close` (op events) | `ui.close.origin.kind`: `plugin`, `person`, `unload` | red-button Esc |
| `command.run` / `command.describe` | `{text}`; `isHidden` | own slash commands; hide commands from typeahead |
| `config.describe` | `isHidden` per /config row | declutter /config |

There is **no dedicated notification event** beyond `classic.Notification`, whose result is only `block`/`preventContinuation`/`stopReason` (T:1213 ClassicResultOf). Whether it can stop the OS notification is unconfirmed.

### A3. `$` nouns that matter (T:2132-3440)

- `$.ui.status(text)`: "Pins `text` as this plugin's status line under the prompt… One per plugin" (T:2132+). **In the terminal:** `status:(v,M)=>{…X=\`plugin-status-${v}\`…addNotification({key:X,kind:"event",text:g9e(v,M),priority:"low",pinned:!0})}` (B@208184926). `g9e(e,n)` = `` `${mre(e)}: ${F$e(n)}` `` (B@191136566). Pinned notices draw via `tre`: `r(n,{color:v.color??"warning",…children:[KS," ",v.text]})` (B@208686279), `KS="⚠"` (B@179520605). **Result: `⚠ <plugin>: <text>` in the warning color, with no plugin control over either.** In SDK/desktop hosts it goes out as `{type:"system",subtype:"ui_status",plugin,text}` (B@206148047). How the desktop app draws that is unconfirmed.
- `$.ui.toast(text,{timeoutMs})`: "a small box on the stack of plugin toasts over the transcript's top right corner"; in scrollback mode, one line on the notification bar; default 4000 ms (T). B also holds a 2000 ms per-plugin toast throttle ("within 2000ms of the last; dropped", B@188035937). Which surfaces it wraps is unconfirmed.
- `$.ui.open/close/panes/focus/scroll`: panes. "Asked … placed at any width; unasked, from 144 columns, 110 for one once asked" (T). A `ui.close` of origin `unload` "drops a pane nothing draws any more (its plugin unloaded, or its drawing threw)… its opener's hooks do not run" (T:6915).
- `$.ui.log(text,{to})`: dim transcript line or debug log.
- `$.ui.ask(question, options)`: the engine's AskUserQuestion dialog.
- `$.audio.play({asset})` (afplay) and `$.audio.speak(text)` (`say`).
- `$.state` (per-session, survives hot reload, render reads subscribe) and `$.store` (per-plugin JSON file across sessions, 4 MiB).
- `$.fs.read/write/list/exists/stat/ancestors`: 4 MiB per read/write.
- `$.process.run(argv,{cwd,env,stdin,timeoutMs})` runs a host command with no shell, default timeout 30 s, max 10 min, "CLI only" (T). **So `$.process.run(['open','-a','Safari',url])` works from a mod in the CLI.** On desktop it is unconfirmed (the session runs a local CLI, but "CLI only" is stated). `$.process.spawn` streams.
- `$.env.get/set(name)`: names must be string literals; `set` changes "this process and everything it starts after" (T). Whether the engine's own later `BROWSER` read sees a runtime `set` is unconfirmed: the env schema is typed accessors (`zC=M.str()`, B@179233359) and no live-read was proven.
- `$.clock.now/sleep/after/every`: timers die on hot reload.
- `$.tool.register` / `$.tool.call` / `$.tool.list` / `$.tool.check`: a registered tool is `mcp__<plugin>__<name>`.
- `$.command.register` (built-in names refused) and `$.command.run`.
- `$.agent.spawn/list/register`; `$.model.complete/fork/classify` (fork reuses the session cache).
- `$.session.id/cwd/root/model/usage/messages/send/append/surfaces/version`.
- `$.turn.abort({turnId})`; `$.prompt.submit/read/fill/suggest/compose`; `$.settings.read` (read-only); `$.mcp.call/connect`; `$.http.fetch`.
- Limits: "no DOM, no Node", ES modules only, "A module holding `import()` does not load" (T header; R:14). Hook budget: `$`/`next` calls in flight are free, `$.clock.sleep` is not (R:124). `$.ui.invalidate` is rate-capped (10/s; 30/s for terminal panes, band and hint).

### A4. Render components and surfaces (T:9097-9700)

| Component | Surfaces | Relevant clutter |
|---|---|---|
| AskUserQuestion | all | rewrite `questions` (must fit schema) |
| UserMessage | all | task-notification rows (`origin.kind`), peer messages; compact rows (pass through when `isExpanded`) |
| AssistantMessage | all | restyle a reply block, e.g. render the final `✅/⏳/❓` line as a badge |
| ToolUse / ToolResult | all | **Write/Edit code previews** = ToolResult `output`; returning a short tree hides them (stored result untouched) |
| ToolGroup | all | "Read 3 files…" fold line |
| CommandOutput | all | slash-command output rows |
| ToolProgress | **terminal only** | "(ctrl+b to run in background)" pill; `hint:""` draws nothing |
| Spinner | terminal + desktop | word/message/suffix |
| TurnDuration | **terminal only** | "Baked for 1m 23s" |
| InfoNotice | **terminal only** | dim lines under the logo |
| SessionMode | terminal + desktop | right-side footer mode labels |
| PromptHint | terminal + desktop | `hint`, `tail`. **`tail` is drawn by the terminal only: "no other surface draws it yet"** |
| AbovePrompt | terminal + desktop | the shared band |
| Pane | all | plugin panes |

Elements per surface: terminal has `Raster`/`Image` and no `Svg`; mobile has no `Input`/`Select`/`Client`; vscode has no `Client` (R:93).

Not reachable as components: the statusLine (a settings command), the notification bar (update notice, "/clear to …" tips, pinned notices), workflow progress, and the permission-mode label.

**Permission-mode label ("bypass permissions on (shift+tab to cycle)"):**
- Modes table: `bypassPermissions:{…indicator:"bypass permissions",symbol:Det,color:"error"}` (B@179522700).
- The plugin-facing `hint` has the mode text cut out: `Wse(...)`: `he=N?WF(v):\`${xL(v)} on\`` … `{...M,hint:Me}` (B@~208746000, region base 202686279+6059831).
- The engine's own row draws `vx` with the "(shift+tab to cycle)" child only when `Gn&&_s`. `_s=ur<2&&!(width checks)` and `ur=(Oo||Gn?1:0)+(ts?1:0)`, so the hint shows when the footer has room. There is no setting for it.
- When a plugin's PromptHint answer stands in for the engine line, the engine draws `vx` **without** the cycle child: `Ne&&r(n,{children:[St?e(BM,{mode:X}):e(vx,{mode:X}),e(n,{dimColor:!0,children:" · "})]}),e(VF.PromptHintSite,…)` (base+6063762).
- Inference, verify on screen: a PromptHint hook that rewrites `hint` removes the cycle hint and keeps "⏵⏵ bypass permissions on".

### A5. Browser / Artifact handoff

- The engine URL opener: `async function m(r){…let e=eu()?.browser,o=e!==void 0?e??void 0:a.BROWSER…return y(await Ke(o||"open",[r],f))}` (B@193344035). `eu()` = `surfaceCapabilities.attacherCaps()` (B@179047600), which carries `browser:a.BROWSER??null` from an attaching terminal (B@193116597). So it runs **`$BROWSER <url>`** (a single executable, the URL as its only argument, so a wrapper script is needed for `open -a X`), else `open <url>`.
- Artifact auto-open: `function JRt(...)` skips on redeploy, on remote control, and when `_s(a.CLAUDE_CODE_ARTIFACT_AUTO_OPEN)` ("auto_open_skipped_env"); otherwise it calls `bxr(v)` → `m()` (B@210297844).
- ctrl+] (`app:openArtifact`) calls `os(mFe(X))` → `m()` (B@208683610).
- The Artifact tool's `open` action is a normal built-in `tool.call` (`if(n.action==="open")…`, B@210597355). A mod hook on `{tool:'Artifact'}` sees `action` and `url` and may answer `{result}` itself after `$.process.run(['open','-a',App,url])`.
- A mod **cannot** hook the engine's internal `os()`/`m()` opens: op events like `process.run` are raised only for plugins' own `$` calls (op events list, T:6405).
- Practical design: one wrapper per browser, chosen per project through the project's `.claude/settings.local.json` `env.BROWSER` (applied at start). Optionally `CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0` plus a mod that opens in the project's browser. That is for the browser lane to finalize. The exact falsy spellings `_s` accepts are unconfirmed.
- Built-in session registry (relevant to constellation/beacon): `claude agents --json` printed 6 sessions with `cwd, kind, name, pid, sessionId, startedAt, status` (status `busy|idle`). Files are `~/.claude/sessions/<pid>.json` with `peerFeatures ['notify_idle', …]`, `messagingSocketPath`, `statusUpdatedAt` (ran it 2026-10-03). It has no "needs you" state, which the beacon files add.

### A6. userConfig, hot reload, `claude plugin test`

- userConfig: values come from settings `pluginConfigs[<plugin>].options` (sensitive ones in secure storage), validated before load; a `string` field with `options` becomes a `/config` picker; a change reloads the module (T:7183-7197, R:70). **None of the 8 mods declares `userConfig`**, and `~/.claude/settings.json` has no `pluginConfigs` (checked). userConfig is the right switch for "speech on/off", "toasts on/off" and so on.
- Hot reload: watched folders are the session mods folder after "Enable for this session", `--plugin-dir`, `CLAUDE_CODE_PLUGIN_DIRS` folders (env or user settings `env`) and skills-folder plugins (R:68). Reload lines go to the transcript **only while the session hot-reloads a plugin folder**; otherwise to the debug log (R:73-74). Nebi's mods are installed from the directory marketplace `nebi-mods` → cache `~/.claude/plugins/cache/nebi-mods/<name>/<version>` (settings `extraKnownMarketplaces.nebi-mods.source.path = …/nebi-skill/mods`; all 8 `enabledPlugins …@nebi-mods: true`). Cache copies match the repo's latest versions (diff clean for beacon 0.2.1 and red-button 0.1.1). The **mod reload notices he sees therefore come from sessions with dev-mod hot reload on or plugin-dir loading, not from the installed copies**. A repo edit does not reach running sessions until reinstall plus restart.
- `claude plugin test <dir>`: runs `*.test.ts(x)` against the engine; the test `$` is "the engine's own"; `mock.clock/store/env`; `$.ui.mount({plugin,surface,component,props})` on `terminal|desktop|vscode|mobile` (never assumed); `press/input/select` act as a person; `key/pointer` reach only a `Client`; `$.classic.<Event>` raises classic events (T:13900+, R:75). The kit "exercises the plugin's hooks… not any surface's paint". The test `$`'s nouns take "the event's input whole" (T: `EngineCall`), so a test can raise `ui.close` with `origin:{kind:'person'}`. The test `$.tool.call` takes **no AbortSignal** (`ToolCallOverloads`, T:11967).

---

## Part B — Audit of the 8 mods

### Validate / test results (run 2026-10-03, 2.1.288)

| Mod | version | `plugin validate` | `plugin test` | Hooks (from validate) |
|---|---|---|---|---|
| nebi-aside | 0.1.0 | ✔ passed | 6 pass / 0 fail | session.start, prompt.submit, command.run{aside}, ui.render{Pane} |
| nebi-beacon | 0.2.1 | ✔ passed | 18 / 0 | session.start, session.end, turn.start, tool.call, turn.complete, ui.render{Spinner}, ui.render{AbovePrompt} |
| nebi-constellation | 0.1.0 | ✔ passed | 2 / 0 | session.start, turn.start, command.run{sessions}, ui.close, ui.render{Pane} |
| nebi-fleet-radar | 0.1.0 | ✔ passed | 2 / 0 | session.start, turn.start, turn.complete, tool.call, agent.spawn, command.run{fleet}, ui.render{PromptHint}, ui.render{Pane} |
| nebi-model-lock | 0.1.0 | ✔ passed | 3 / 0 | session.start, prompt.submit, agent.spawn, command.run{lock}, ui.render{PromptHint} |
| nebi-plan-rail | 0.1.0 | ✔ passed | 16 / 0 | session.start, prompt.compose, tool.call{mcp__nebi-plan-rail__plan}, turn.start, turn.complete, command.run{plan-rail}, ui.render{AbovePrompt}, ui.render{Pane} |
| **nebi-red-button** | 0.1.1 | ✔ passed | **7 pass / 6 fail** | session.start, tool.call, ui.close, ui.render{Pane}, ui.render{AbovePrompt}, command.run{redbutton} |
| nebi-wispr | 0.1.0 | ✔ passed | 9 / 0 | session.start, prompt.submit, command.run{wispr} |

`tsc` is not installed (`which tsc` → not found), so CONTRACT's third gate ("tsc is clean") was not checked.

### Screen space and side effects per mod

| Mod | Band (AbovePrompt) | Pane | Footer (PromptHint) | Spinner | `$.ui.status` | Toasts | Sound / push | Background work |
|---|---|---|---|---|---|---|---|---|
| beacon | yes, every non-idle state; 10 fps Raster sweep while working | – | – | rewrites message | – | on prompt-fill failure | `say` after turns ≥60 s; PushNotification on asks | 30 s heartbeat file write; 1 s tick while working; `$.model.fork` per ask |
| constellation | – | /sessions (focus) | – | – | **yes (`⌁ N need you · M working · K idle`) → drawn `⚠ nebi-constellation: …`** | on each flip to need; on send | – | polls `~/.claude/nebi/beacons` every 3 s forever; 10 fps pulse while pane shown |
| aside | – | Aside pane (opens on each `??`) | – | – | – | – | – | `$.model.fork` per question |
| fleet-radar | – | /fleet; **auto-opens unasked** when ≥2 sub-agents in fullscreen | reads viewport only | – | – | – | – | 1 s ticker while anything runs, pane open or not |
| model-lock | – | – | tail `🔒 …` (terminal only) | – | – | on lock; per rewritten spawn | – | – |
| plan-rail | yes, rail + pulse | /plan-rail | – | – | – | – | `tick.wav` per finished step | 1 s ticker during turns; a system-prompt section every request; MCP tool rows in transcript |
| red-button | yes, card when held off-fullscreen | dialog pane when fullscreen | – | – | while holding (warning look is fitting here) | on sub-agent block, on allow | `say` + PushNotification per hold | – |
| wispr | – | – | – | – | – | per glossary fix; per sound-alike guess | – | – |

### Per-mod findings and recommendation

**nebi-beacon: REWORK (keep as the single owner of the session-state surface).**
- It produces the "NEED YOU" card with numbered answers. `askPrompt` asks a fork for `options: up to 3 concrete answers they could send as is` (parts.ts:201-221). The band draws them as hotkey buttons `1..3` plus `0 dismiss` (register.tsx:447-470). That goes straight against "doesn't like being told what to answer". The fork also costs a model call per ask (register.tsx:184).
- Also noisy: a full-width 10 fps scanner sweep while working (register.tsx:404-407, FRAME_MS 100); a 160-char `say` line after any turn ≥60 s (register.tsx:43, 170-172, 332); a PushNotification on asks (register.tsx:176-179, 203).
- Good parts to keep: one badge line `✅ DONE / ⏳ WORKING / ❓ NEED YOU` with the reply's own status text; `DONE · unproven` when edits had no check after them (register.tsx:61, 319). That directly serves "unclear when done".
- It is coupled to the output style's `✅/⏳/❓` last line (parts.ts:84-93). With no status line it shows `⚠ NO STATUS`.
- Bug risk: a `/clear` fires `session.end` (reason clear) and no `session.start` (R:27). Beacon resets state, but the heartbeat timer was stopped (`stopTimers()`, register.tsx:223) and only restarts on the next `syncTimers` (turn.start). So after `/clear` the session has no beacon file until the next prompt, and constellation shows it as gone. Low impact.

**nebi-constellation: REWORK or MERGE into beacon.**
- Its status entry is the "▲ nebi-constellation: 3 need you" complaint: `$.ui.status(statusText(list))` (register.tsx:187-191), drawn by the engine as `⚠ nebi-constellation: ⌁ 3 need you` in warning color (A3).
- Toasts on every flip into need (register.tsx:175), in every session at once.
- The /sessions pane with inline reply is valuable for multi-session work. Keep it.
- Move the count into beacon's band row (e.g. `· 3 other sessions need you`) or the footer tail (terminal only), not `$.ui.status`.
- It polls 64 files every 3 s forever (register.tsx:12, 158-162).
- Consider reading `~/.claude/sessions/*.json` (engine registry: names, busy/idle) alongside beacon files.

**nebi-aside: DROP.**
- Built-in `/btw` exists: `{type:"local-jsx",name:"btw",description:"Ask a quick side question without interrupting the main conversation",immediate:!0}` (B@189717299).
- Aside adds a pane per question and a fork per question. The `??` prefix is its only extra. A 10-line `??` → `/btw` alias via `$.command.run` is possible, but unconfirmed for local-jsx built-ins.

**nebi-fleet-radar: DROP (or park behind a command, with no auto-open).**
- **Double write confirmed:** `tool.call` calls `update($, loops, …)` before `next(e)` (register.tsx:223-230) and again in `finally` (register.tsx:240-251). Both fire for every tool call of main and of every sub-agent, and each write re-renders the pane if shown.
- `ensureTicker` starts a 1 s ticker that runs `syncAgents` (`$.agent.list`), `refreshQuota` (`$.session.usage`) and `update(now)` even when the pane is closed (register.tsx:137-162). It stops only when no loop is running.
- It auto-opens its pane unasked when 2+ sub-agents run in fullscreen (register.tsx:284-290).
- Span matching by `start` timestamp and kind (register.tsx:221-222) can mis-close parallel same-kind calls started in the same ms.
- Overlaps built-in `/tasks` and `claude agents`. The unique bit (5h quota burn) belongs in `statusline.mjs`.

**nebi-model-lock: KEEP (trim).**
- It enforces doctrine §0 mechanically through `agent.spawn` model rewrite (register.tsx:58-70); nothing else does that.
- Noise: one toast per rewritten spawn (register.tsx:66); drop it or fold into one toast per turn.
- The footer `🔒 …` tail draws only on the terminal (T PromptHint.tail). On desktop the lock is invisible.

**nebi-plan-rail: REWORK (or DROP).**
- It registers its own MCP tool plus a session system-prompt section on every request (register.tsx:405-429). Every plan update is a model tool call that shows as a transcript tool row (no mod hides `ToolUse`; grep found none). That costs tokens and adds the clutter Nebi complains about.
- It duplicates TodoWrite (`todos[{content,status,activeForm}]`, T:15655) and the ctrl+t todo list.
- A leaner version observes `tool.call {tool:'TodoWrite'}` (and TaskCreate/TaskUpdate) and draws one rail line in beacon's band: no extra tool, no prompt section.
- It plays a sound per finished step (register.tsx:376).

**nebi-red-button: KEEP (fix tests and copy).**
- It is Nebi's only guard while running bypass permissions.
- **Test suite red:** 6/13 fail. Every failure is `Received: ["PushNotification", …]` where the test expected only the Bash commands. Cause: 0.1.1 added `void $.tool.call({ tool: 'PushNotification', … })` (register.tsx:153-154; diff vs cache 0.1.0) and the test's tool stub records every tool call into `seen.ran`.
- Stale copy: `/redbutton` listing says "Allowed for this session with [3]" (register.tsx:320), but the button's hotkey is `a` (register.tsx:301).
- Esc in band mode does nothing (Esc returns focus to the prompt, R:101-103). The band hint says so correctly ("ctrl+x tab, then r · b · a").
- If the pane's drawing throws, the engine closes it with origin `unload` and "its opener's hooks do not run" (T:6915). The hold then waits until the 10-minute timeout (register.tsx:21, 157-163).
- **What tests must cover (none exist today for Esc or interrupt):**
  1. **Esc on the dialog pane** → `await $.ui.close({ id: 'nebi-red-button', origin: { kind: 'person' } })` while a call is held. The held `tool.call` resolves `{ deny: 'Nebi blocked this with Red Button (…)' }`; `hold` state goes back to null; `$.ui.status(undefined)` was called; the next risky call holds again (`isBusy` released).
  2. **Esc after a choice:** a press then an Esc records only the first choice (`choices.has` guard, register.tsx:179).
  3. **Plugin-origin close** (the `finally` close, register.tsx:167) records no choice.
  4. **Unload-origin close** (render throws): document that the hold continues to the timeout, or fix it so the hold ends on a closed pane.
  5. **Interrupt while held:** `signal.aborted` → `'interrupted'` → deny text "…the turn was interrupted before Nebi answered…" (register.tsx:185), plus cleanup. The kit's `$.tool.call` has no signal, so export `holdCall` (or a `waitForChoice(signal)`) and test it with an `AbortController`.
  6. **Interrupt while queued** behind another hold (`while (isBusy)`, register.tsx:131-134) → `'interrupted'`, nothing drawn.
  7. **Timeout:** `mock.clock` past 10 min → `'timeout'` deny text (register.tsx:186).
  8. **Two risky calls at once:** the second waits; a press on the old drawing's id never answers the new hold (register.tsx:177-181).
  9. **Reload mid-hold:** `session.start` with `isBusy` false clears a stale `hold` (register.tsx:39).
  10. **Side effects per hold:** status set then cleared, `say` once, PushNotification once. Fix the stub to record PushNotification separately so the 6 current tests pass.
  11. **Sub-agent path:** immediate deny, no hold, no speech, no push.

**nebi-wispr: KEEP (quiet it).**
- Useful for dictation. Two toasts can fire in one `prompt.submit` (register.tsx:39 and :52).
- The binary has a 2000 ms per-plugin toast throttle (B@188035937); if it wraps the terminal path, the second toast is dropped (unconfirmed).
- Make the corrections silent, or one combined toast behind a userConfig switch. Keep the `context` note for Claude (register.tsx:53-55), which Nebi never sees.

### Overlaps and collisions

- **AbovePrompt band:** beacon, plan-rail and red-button all stack there (CONTRACT.md "Band above the prompt… Shared"). Three owners on one surface is what the Fable opinion warned about. Make beacon the one owner; plan line and hold card become rows it draws.
- **Status surface:** the statusline script (`node ~/.claude/nebi/statusline.mjs`) and `$.ui.status` (constellation, red-button) both sit under the prompt; the engine draws `$.ui.status` as warnings.
- **Output style ↔ beacon:** beacon parses the style's last line (parts.ts:84). Debloating the style must keep that line or beacon shows `⚠ NO STATUS`.
- **Stop hook:** `verify-before-stop.mjs` counts every `background_tasks` entry with status running (lines 53, 86-91). A `type:'monitor'` artifact comment watcher keeps it nagging "N background tasks still running". The input carries `type`, `server` and `tool` (T:642-673), so it can be filtered.
- **Voice:** beacon and red-button both `say` and both PushNotification. CONTRACT allows it, but Nebi wants less noise. Put both behind userConfig.
- **CONTRACT.md** says "Status line entry ($.ui.status) and toasts: Free to use". Given A3, that rule should change to "never use `$.ui.status` except for a hold that blocks Claude".

### Keep / rework / merge / drop summary

| Mod | Verdict | One-line reason |
|---|---|---|
| nebi-beacon | **Rework** (owner of the state surface) | Keep the badge, done/unproven and beacon files. Drop answer buttons, fork, sweep and speech by default. |
| nebi-constellation | **Merge into beacon** (keep /sessions pane) | `$.ui.status` renders as ⚠ warning; move the count into beacon's band. |
| nebi-aside | **Drop** | Built-in `/btw` does it. |
| nebi-fleet-radar | **Drop / park** | Double writes, background ticker, unasked pane; built-ins cover it. |
| nebi-model-lock | **Keep (trim toasts)** | Unique doctrine enforcement, low noise. |
| nebi-plan-rail | **Rework into beacon** (read TodoWrite) or drop | Its own tool + prompt section + transcript rows add the noise it should remove. |
| nebi-red-button | **Keep + fix** | Only guard under bypass. Tests red (6/13), Esc/interrupt untested, stale "[3]" text. |
| nebi-wispr | **Keep (silent)** | Useful for dictation; toasts are noise. |

## Unconfirmed (and where I looked)

- How the desktop app draws `ui_status` and `ui_toast` system messages (seen only the SDK/host emit, B@206148047).
- Whether `$.env.set('BROWSER', …)` at runtime changes the engine's later opens (env accessors are schema-typed, B@179233359; live read not proven).
- The exact values `_s(CLAUDE_CODE_ARTIFACT_AUTO_OPEN)` treats as off (B@210297844).
- Whether `$.process.run` works in a desktop-app session ("CLI only" in T).
- Whether the PromptHint stand-in really drops "(shift+tab to cycle)" on screen (code reading at base 202686279+6063762; needs a screenshot).
- Whether the 2000 ms toast throttle wraps the terminal toast path (B@188035937; caller not traced).
- `CLAUDE_INTERNAL_FC_OVERRIDES` format (internal; B@181921707).
- Whether `$.command.run({command:'btw'})` works for a local-jsx built-in.
- `tsc` cleanliness (no tsc installed).
- Whether `classic.Notification` can suppress the OS notification.
