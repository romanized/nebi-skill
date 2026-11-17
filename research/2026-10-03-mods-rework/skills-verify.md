# Skills lane: verification (2026-10-03)

Verifier: fresh context, read-only. Every verdict below was rechecked against a primary source myself; nothing is carried over from the lane's receipts.

Paths used:
- `PA` = `/private/tmp/claude-501/bundled-skills/2.1.288/05c1550b06cfbccd1c30b5b6bff87243/plugin-authoring`
- `BIN` = `/Users/nebi/.local/share/claude/versions/2.1.288` (strings extracted with `strings -n 6`, then searched with Python because ugrep hit its complexity limits)
- firstmate files fetched with `gh api repos/kunchenguid/firstmate/contents/<path>?ref=1f3e769616fdf9f31f85f4c3e6a9f71606634238`

| id | verdict | short reason |
|---|---|---|
| skills-1 | partly | Mostly right for DannyMac180, BeLazy167 and tomada1114. karanb192 was rebuilt today for 2.1.287+/2.1.288 and covers `$.state` |
| skills-3 | confirmed | reference.md:75, docs test.md:314 and CONTRACT.md:58 all match |
| skills-4 | confirmed | Facts check out. Install needs a brew tap, not core brew |
| skills-5 | partly | Harness details match, but its flag-off baseline uses an env var that 2.1.287+ ignores. It uses tmux, not a raw pty |
| skills-6 | confirmed | The strings exist. The flag now defaults to on, and `claude plugin test` is a simpler documented detector |
| skills-7 | partly | The named tools are missing, but `/usr/bin/screen` 4.00.03 and `/usr/bin/expect` 5.45 are present |
| skills-8 | confirmed | register.ts and calm.md match. The mod is also self-gated on `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` |
| skills-9 | partly | The fix-in-hook conclusion holds (Nebi's hook emits the text). Not hookable is consistent with the 2.1.288 types but not live-tested |
| skills-10 | confirmed | Binary strings match. /focus is terminal-only, and `viewMode: "focus"` also needs fullscreen |
| skills-13 | partly | 4 MiB and config-dir location are right. The two accounts DO share the store on this machine (symlink) |
| skills-14 | confirmed | reference.md:62 and the telemetry README match |
| skills-17 | confirmed (+resolved) | BROWSER opener confirmed. Artifact auto-open and the open action also call the same opener |
| skills-26 | confirmed | statusline.mjs:16 and :30 match. The live copy equals the master |

## Details

### skills-1: partly
- Gate change, checked in the binary: 2.1.284 has `var Hce=()=>a.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS??x(Kut,xpn())` with `xpn=()=>!1`. 2.1.287 has `var mUt=!0`. 2.1.288 has `var oZ="tengu_plugin_hooks_modules";var bIe=!0;var cK=()=>!Lt()&&T(oZ,bIe);`. In 2.1.288 the env var appears only in env-name allowlists.
- Docs: code.claude.com/docs/en/plugins/mods/overview.md (fetched 2026-10-03), lines 97 and 112: "Mods require Claude Code v2.1.287 or later, and they're on by default" and "Claude Code v2.1.287 and later ignores it [CLAUDE_CODE_ENABLE_FUNCTION_HOOKS]".
- DannyMac180/skills claude-mod-builder: 535 stars, last commit to the file 2026-09-15 (3816a16). The SKILL.md asks for `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (lines 24-25, 154). Confirmed.
- BeLazy167 (5 stars) mentions the env var once, and tomada1114 (5 stars) mentions it 6 times and pins 2.1.272/2.1.273. Neither mentions `$.state`. Confirmed.
- jamubc/toolbox (0 stars) and japan-da-man (0 stars) do not mention the env var.
- **karanb192/claude-code-mods** mod-builder (33 stars, MIT): commit 10617a9 at 2026-10-03T13:11Z, "Rebuild mod-builder for Claude Code 2.1.287 and later". Its SKILL.md line 8 says "Mods need Claude Code 2.1.287 or later, are on by default, and the old early-access flag is ignored [checked 2.1.288]". It covers `$.state` and `$.store`, and ships gate, footprint and prove scripts. Prove runs a child `claude` with its own config dir and uses tmux for interactive proof. The lane's claim is therefore stale for karanb192.
- ruvnet/ruflo create-mod also knows that mods are on by default from 2.1.287.
- The built-in skill is still the only one shipped with types for this exact build, but karanb192 now adds a verification harness that the built-in skill lacks.

### skills-3: confirmed
- `PA/reference.md:75` ends: "The kit exercises the plugin's hooks and the description they return under each surface's rules, not any surface's paint."
- `curl https://code.claude.com/docs/en/plugins/mods/test.md` returned 200. Line 314: "It doesn't check how the app paints it, so look at a new layout in a real session as well."
- `mods/CONTRACT.md:58`: "Done means: `claude plugin validate <mod>` passes, `claude plugin test <mod>` passes over `terminal` and `desktop`, and `tsc` is clean."

### skills-4: confirmed
- `gh api repos/microsoft/tui-test`: 277 stars, MIT, pushed 2026-10-01T20:02Z. HEAD 067b963cab9d. Latest release 0.1.0-beta.5 (2026-09-19, prerelease).
- README:18 says it "is undergoing a major rewrite", README:69 shows `tui-test screenshot -o result.svg`, README:376-377 list `skill` and `skill --add`.
- SKILL.md:78 has `get_by_style()` / `getByStyle()`, and SKILL.md:87 covers "Visible or hidden text".
- Caveats: `brew info tui-test` finds no formula, so it needs `brew tap microsoft/tui-test https://github.com/microsoft/tui-test` (README:27). It is a Rust rewrite (crates/) and does not need tmux. "Best base" is a judgment call; karanb192's prove harness is a competing base (see missed).

### skills-5: partly
- `tests/fm-calm-claude-mod-live-e2e.test.sh` @1f3e769:
  - :65-70 `unset_inherited` strips `CLAUDECODE|CLAUDE_CODE_*|CLAUDE_CONFIG_DIR`.
  - :72-79 `launch` runs `--model haiku --dangerously-skip-permissions --debug-file`.
  - :81-83 `screen` is `tmux capture-pane`.
  - :106-118 `answer_trust_dialog`, and :122-145 `wait_screen` polls every 0.25s.
- Verified versions per `docs/calm-mode-feasibility.md`: 2.1.272, 2.1.280, 2.1.282, 2.1.283 and 2.1.284 (lines 781-893). calm.md:285 says the same.
- Corrections:
  - It uses a tmux session, not a raw pty, and tmux is not installed here.
  - Its flag-off baseline is "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS unset" (:75). On 2.1.288 that env var is ignored and mods load by default, so that baseline no longer turns mods off. Use `--safe-mode` or `disableAllHooks` instead (overview.md "Turn mods on or off").
  - Stripping `CLAUDE_CONFIG_DIR` puts the child on account A's `~/.claude` unless the harness sets an isolated one.

### skills-6: confirmed
- In BIN:
  - `installed plugins' hooks modules not loaded: rollout flag (${oZ}) is off, ...; built-in plugins load regardless`
  - `hooks modules not loaded until workspace trust is accepted:`
  - `hooks module ${Un.label} loaded (${Un.hopKey.kind}, environment ${Un.environmentId}, tier ${Un.tier}); events:`
  - `oZ="tengu_plugin_hooks_modules"`
- Context the claim lacks:
  - The flag defaults to on (`bIe=!0`), so "flag off" now means Anthropic turned it off remotely.
  - The documented detector is simpler. Running `claude plugin test` from an empty folder printed: `...: no hooks module to load; there is no hooks/hooks.json naming one in "modules"`, which per troubleshoot.md means mods can load. The command exits 1 even in this healthy case, so a smoke check has to parse the message, not the exit code.
  - troubleshoot.md maps `hooks modules are turned off here` to disableAllHooks or policy, and `hooks modules are turned off in this process` to Anthropic's remote off switch.

### skills-7: partly
- Checked with `command -v`: tmux, vhs, freeze, asciinema, ttyd and tui-test are all not found.
- `brew info`: tmux stable 3.7c is not installed, and vhs stable 0.12.1 is not installed.
- BIN has the run skill's tmux recipe: "The skill must show how to wrap them in `tmux`" and `tmux new-session -d -s app -x 120 -y 40 './myapp'`.
- Correction: "no TUI driver" goes too far. `/usr/bin/screen` (Screen version 4.00.03, 2006) and `/usr/bin/expect` (5.45) are present. `screen -dm` plus `screen -X hardcopy` can drive a TUI and capture its text. This is weak (old, no colour capture), but it needs no install.

### skills-8: confirmed
- register.ts @1f3e769:
  - :366-369 `hiddenRow` returns `Box({ display: "none" })`.
  - :470-504 hooks ToolUse, ToolResult, ToolGroup, UserMessage (operational rows) and AssistantMessage (working notes that are not final replies).
  - :394-400 the toggle answers with `$.ui.toast("Calm on"/"Calm off")`.
  - :206-208 `$.ui.invalidate("ui.render")`.
- calm.md:17-25 holds the 240-char/no-newline rule, and calm.md:204 says "rows drawn before the toggle hide or restore retroactively" (the Claude Code section; :144 is the Pi section).
- Repo: 7466 stars, MIT, pushed 2026-10-03T10:19Z.
- Must know: `isActivated` (register.ts:130-137) only turns Calm on when `$.env.get("CLAUDE_CODE_ENABLE_FUNCTION_HOOKS") === "1"`. On 2.1.288, without that env var set, the mod loads and does nothing. Any copy must drop that gate.

### skills-9: partly
- The conclusion holds. `~/.claude/hooks/verify-before-stop.mjs:86-93` counts every `background_tasks` entry with status `running` and emits "N background task(s) still running ..." as Stop `additionalContext`. The fix belongs in this hook.
- Not hookable: the 2.1.288 `RenderComponent` union (`claude-code.d.ts:8712`) has no hook-feedback component. `UserMessage` (:9123-9139) covers prompts, task notifications and peer messages only. This agrees with firstmate's 2.1.284 finding, but it is not live-tested on 2.1.288.
- Lever: in BIN, `background_tasks` items carry `type` ("e.g. 'shell', 'subagent', 'monitor', 'workflow'") plus `description`, `server` and `tool`. The hook can skip the artifact comment watcher by type or description. The watcher's exact type is unconfirmed.

### skills-10: confirmed
- In BIN, the command is `{type:"local-jsx",name:"focus",description:"Toggle focus view: just your prompt, summary, and response",...,terminalOriented:!0`.
- Without fullscreen it returns "Focus view needs the fullscreen renderer. Run /tui fullscreen ... or set CLAUDE_CODE_NO_FLICKER=1 and restart."
- If settings already hold `viewMode: "focus"`, it says: `Focus view is set by "viewMode": "focus" in settings.json — remove it there ...` plus the same fullscreen requirement.
- The settings schema has `viewMode: ["default","verbose","focus"]`, and the `view_mode` description says "the model is told the user sees only its final message per turn".
- `~/.claude/settings.json` has no `viewMode` and no `tui` key.
- It is terminal-oriented. Desktop Code tab behaviour is unconfirmed (clients get `view_mode` and "may collapse").

### skills-13: partly
- `claude-code.d.ts:3136-3156`: "A JSON file of the plugin's own under the user's Claude Code configuration directory" and "a store over 4 MiB of JSON text in all". On disk the files are `~/.claude/plugins/store/<plugin>_<source>-<hash>.json`.
- Correction: the second account is `CLAUDE_CONFIG_DIR=~/.claude-max2`, set in `~/.local/bin/claude-profile:65-69`. `~/.claude-max2/plugins` is a symlink to `/Users/nebi/.claude/plugins` (`ls -la`). So both accounts share one `$.store` file per plugin.
- `settings.json`, `hooks`, `nebi` and `output-styles` are symlinked too.
- Store files are keyed per install source: `nebi-wispr_inline-…` and `nebi-wispr_nebi-mods-…` are separate files.

### skills-14: confirmed
- `PA/reference.md:62` has the noun contract and the `dependencies` text.
- anthropics/claude-code `mods/telemetry/README.md:8-10`: "On an engine that has no `$.telemetry` of its own the same step adds the noun". Its plugin.json has `"types": "./types/index.d.ts"`.
- Caveat: a noun only governs mods. The status line command, the Stop hook output and the output style still write to the screen outside it.

### skills-17: confirmed, and the open question is resolved
- In BIN:
  - The opener: `async function m(r){try{let e=eu()?.browser,o=e!==void 0?e??void 0:a.BROWSER,...return y(await Ke(o||"open",[r],f))`, exported as `bxr`/`os`.
  - Artifact auto-open, function `JRt`: `return bxr(v).then((_)=>{if(!_.ok)t(\`[artifact] auto-open failed ...\`)`. The Artifact `open` action reaches it through `JRt(...)` (the "Opened the Artifact at ..." path). The ctrl+] `app:openArtifact` handler calls `os(mFe(X))`.
  - So Artifact opens use the same BROWSER-aware opener. This rests on matching minified export names.
- Caveats:
  - When an attacher caps object is present, its `browser` (even null) overrides the env.
  - The value is spawned as the command with the URL as its only argument, so it should be one executable or script path (shell use is unconfirmed).
  - Whether settings.json `env` reaches this `a.BROWSER` is not traced in the binary.
- Bigger lever: `CLAUDE_CODE_ARTIFACT_AUTO_OPEN` set to 0, false, no or off makes the code take the `auto_open_skipped_env` branch, so it never auto-opens.

### skills-26: confirmed
- `cat -n ~/.claude/nebi/statusline.mjs`: line 16 is `const model = d?.model?.display_name;` and line 30 is `const win = size >= 1000000 ? " (1M)" : "";`.
- `diff` against `claude-home/nebi/statusline.mjs` shows the files are the same.
- settings.json statusLine is `node '/Users/nebi/.claude/nebi/statusline.mjs'`. Because settings.json is symlinked, both accounts get it.

## What the lane missed
1. **Mods are on by default (2.1.287+), and the env var is ignored.** This answers the Fable "flag-gated" risk (overview.md:97,112; binary `bIe=!0`). The remaining off states are `--safe-mode`, `disableAllHooks` (which also stops Nebi's status line and settings hooks), org policy and Anthropic's remote off switch.
2. **`claude plugin test` in an empty folder is the documented check for whether mods can load.** Ran it here: "no hooks module to load", exit 1. Parse the message, not the exit code.
3. **`CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0` stops artifacts auto-opening in the wrong browser.** Auto-open, the open action and ctrl+] all go through the BROWSER-aware opener.
4. **Both accounts share plugins, settings, hooks, nebi and output-styles through symlinks** (`~/.claude-max2/*` points to `~/.claude/*`). One mod set, one store, one status line, one Stop hook. A per-account difference cannot live in settings.json, and many sessions write the same store JSON at once.
5. **The Stop hook can filter `background_tasks` by `type`/`description`** instead of counting every running entry.
6. **karanb192/claude-code-mods mod-builder (2026-10-03, 2.1.288-checked) is a real candidate** for the mod-verify skill. Its prove harness uses an isolated config dir and drives the session through tmux. Review before adopting: commit 9d73de7 "Offer a star invitation once after a useful mod result" adds self-promotion.
7. **ruflo create-mod describes a hybrid `hooks.json`** (classic command hook plus module) as a fallback for when mods don't load.
8. **`TurnDuration` ("Baked for …") and `InfoNotice` are "Raised on the terminal surface only"** (claude-code.d.ts, around lines 9465 and 9490). Hiding them with a mod works in Ghostty, but the desktop Code tab draws its own footer.
9. **firstmate-calm does nothing on 2.1.288 unless `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set** (its own gate).
