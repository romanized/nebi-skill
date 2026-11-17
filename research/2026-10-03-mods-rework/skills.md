# Skills hunt: mods, declutter, attention, browser routing, TUI verification

Lane: skills hunt. Date: 2026-10-03. Claude Code 2.1.288. Read-only; nothing installed.

Method: `find-skills` skill loaded, then `npx skills find` (skills CLI 1.7.0) over 33 queries, `gh search repos/code` for mods and SKILL.md files that teach them, the official mods gallery (claude.dev/mods, code.claude.com/docs/en/plugins/mods/*), awesome-claude-code and gked2121/awesome-claude-code-mods, then the source of every candidate. Head start: the stopped run had no skills lane; its "online" lane transcript was mined only for pointers and re-verified.

## Bottom line

1. **Mod authoring: nothing beats the built-in `plugin-authoring` skill.** Third-party "mod builder" skills (DannyMac180 claude-mod-builder, BeLazy167, tomada, karanb192, nogu66, jamubc) were written for pre-launch builds behind `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` and miss 2.1.288 features such as `$.state` subscription redraws. Anthropic's older `plugin-dev` plugin has zero function-hook coverage and was last touched 2025-11-17.
2. **The real skill gap is verification of what actually paints.** `claude plugin test` checks only the tree a hook returns, not the screen (official docs, test page line 314; reference.md line 75). The nebi CONTRACT's "done" bar (validate + plugin test + tsc) therefore never sees the screen Nebi sees. Best tool found: **microsoft/tui-test** (drives a real terminal, text and style locators, `expect` hidden text, SVG screenshots, ships its own agent skill). The pattern to copy is **firstmate's live e2e harness** (real Claude Code under a pty, debug-file check that the module loaded, flag-off baseline run).
3. **Best mod source to learn from: firstmate-calm** (kunchenguid/firstmate, 7.5k stars, MIT). It is a shipped, multi-version-verified declutter mod: it hides tool rows, tool results, tool groups and short mid-turn narration at zero height, keeps the final reply, and redraws retroactively on toggle. Its feasibility doc also lists what a mod cannot hide (the `Stop hook feedback` row, ctrl+o headers).
4. **Best ideas for "he misses what he must do":** tzafrir/human-in-the-loop (Claude assigns tasks only he can do; they wait, counted under the prompt, until he acts) and pourya7 `party` (machine-wide roster, longest wait first, one nag toast after N minutes). Both are a day old, with 0-1 stars, so borrow the design, don't install.
5. **Outside the terminal:** m1ckc3s/claude-status-bar (707 stars, signed, covers Ghostty CLI and the desktop Code tab, multi-session with "awaiting permission never hidden") is the strongest no-mod fallback for the attention signal. cmux (27.6k stars) solves multi-session attention and per-workspace browsers together, but it replaces Ghostty, so it is Nebi's call.
6. **Browser routing:** Finicky (5.1k stars, MIT) routes URLs by rule, opener app and Chrome profile. Claude Code opens URLs with `$BROWSER` when set, else `open` (binary). A per-project `BROWSER` env plus Finicky rules can give "this project's links open in this browser/profile". terminal-browser (3.6k stars) can open HTML inside a mod pane next to the agent. vercel-labs/agent-browser was already declined in the upstream register; don't re-raise it.
7. **Chat debloat:** caveman (109k stars) has three rules worth lifting into the nebi output style: answer first, no recap or closer, bounded status during tool runs. Its fragment grammar conflicts with Nebi's "clear over terse" writing rule, so don't install the voice.

## Shortlist (one line each)

| # | Candidate | Verdict | Reason |
|---|---|---|---|
| 1 | microsoft/tui-test @067b963 (277★, beta.5 2026-09-19, MIT) | **Adopt as the base of a mod-verify skill** | Drives the real TUI. `expect` text present or hidden, `get_by_style` for color checks on a light theme, SVG screenshot for before/after. Needs no tmux, and it ships `tui-test skill --add`. |
| 2 | firstmate live e2e harness (`tests/fm-calm-claude-mod-live-e2e.test.sh` @1f3e769) | **Copy the pattern** | Launch with inherited `CLAUDE_CODE_*` env stripped, `--model haiku`, `--debug-file`. Answer the trust dialog, poll the screen for text, run a flag-off baseline. Mods docs call for a real-session look. |
| 3 | firstmate-calm mod (`.claude/mods/firstmate-calm` @1f3e769) | **Reference for a declutter mod** | Proven zero-height hiding of `ToolUse`/`ToolResult`/`ToolGroup` plus short narration. A preservation rule (under 240 chars and no newline hides) keeps the final reply. Retroactive redraw via `$.ui.invalidate`. |
| 4 | tzafrir/human-in-the-loop @3896b61 (1★, today) | **Borrow the idea** | Registers an `assign_task` tool. Tasks persist per project across compaction, show as a count in `$.ui.status`, and his answer goes back batched. This directly fixes "asks scroll away". |
| 5 | pourya7/claude-code-mods `party` @59ae37b (0★, today) | **Borrow the idea** | Per-session heartbeat in `$.store`. Its waiting-on-you states are bound to the tool call that raised them. Longest wait first, one nag toast per wait. Nearly the same design as nebi-constellation, with tighter rules for when the wait ends. |
| 6 | m1ckc3s/claude-status-bar @dafb0c8 (707★, 2026-09-18) | **Shortlist for Nebi** | Menu-bar state for CLI and desktop Code tab, built on classic hooks. It still works if mods are flag-gated off. It covers permission waits only, not "the reply asks you something". |
| 7 | anthropics `telemetry` built-in mod and reference.md:62 | **Use the pattern** | One mod adds a noun to `$` in `engine.create` and ships a types contract; others list it under `dependencies`. That makes one owner of the status surface a supported shape, not a convention. |
| 8 | johnste/finicky @4a38875 (5.1k★) | **Shortlist for the browser lane** | URL, opener and Chrome-profile routing in `~/.finicky.js`, which pairs with a per-project `$BROWSER`. |
| 9 | zenbu-labs/terminal-browser @2bdf227 (3.6k★) | **Shortlist, experimental** | `/browser` pane inside Claude Code (kitty graphics, which Ghostty supports). Opens HTML plans next to the agent that made them. It depends on function hooks, so it needs the fallback. |
| 10 | manaflow-ai/cmux @1a7d5cd (27.6k★, GPL) | **Nebi's call** | Ghostty-config-compatible terminal with notification rings, an unread jump (Cmd+Shift+U), sidebar with the latest notification text, and in-app browser panes that import Chrome or Arc logins. It replaces Ghostty, which the doctrine names. |
| 11 | JuliusBrussee/caveman @aeb45e2 (109k★) | **Borrow 3 rules, skip the voice** | Answer first, no recap or closer, bounded status during tool runs. Its pre-send check (delete a first sentence that announces, delete a last sentence that recaps). |
| 12 | homieyangg `leftovers` @292b513 | **Idea** | Ledger of what Claude left running (launchd, docker, cron, ssh). This is the inverse of the Stop-hook background-task count, which wrongly includes the artifact watcher. |
| 13 | VedantAndhale/claude-pro-kit `collision-guard`, `output-diet` @3364994 | **Ideas** | Asks before editing a file another session changed in the last 30 minutes (multi-session). Trims long shell output and saves the full text to a file. |
| 14 | charmbracelet/vhs (21k★) | **Alternative to #1** | `.tape` scripts drive `claude` and `Screenshot` PNGs. homieyangg records mods this way with `CLAUDE_CONFIG_DIR=~/.claude-demo`. It needs ttyd and the brew formula, and sleeps are fragile. |

Rejected or already decided:
- **vercel-labs/agent-browser** (43k★): already "not adopted" in `claude-home/nebi/upstreams.json:986-990`. Tencent/BrowserSkill was removed by Nebi on 2026-09-23.
- **Anthropic plugin-dev skills**: no mods coverage.
- **Third-party mod-builder skills**: stale against the built-in skill.
- **agent-pulse** (47.5k installs on a 1★ repo): token analytics, not attention. The install count looks inflated.
- **ccstatusline** (13k★): not needed. Nebi's own `statusline.mjs` has the two offending lines (16 and 30).
- **vibe-notch** (2.5k★): last push 2026-04-20.
- **next-steps** (the official community mod): it pushes numbered prompt suggestions above the input. That is the "being told what to answer" pattern Nebi dislikes; treat it as a counter-example.
- **claudemodz**: empty plan docs only.
- **gked2121/awesome-claude-code-mods**: useful index, nothing new beyond the above.

## Verification: the skill to build

Doctrine §10 says verification skills pay off most. Today's chain:
- `claude plugin validate` lists hooks and `$` calls.
- `claude plugin test` mounts render sites per surface. In the reference's words, "The kit exercises the plugin's hooks and the description they return under each surface's rules, not any surface's paint" (reference.md:75). The official test page says "It doesn't check how the app paints it, so look at a new layout in a real session as well" (docs/en/plugins/mods/test.md:314).
- Nothing checks the real screen.

Proposed `nebi-mod-verify` (built on tui-test, or on tmux if Nebi prefers):
1. Start `claude` in a fresh pty at a fixed size (160x44), with inherited `CLAUDE_CODE_*` and `CLAUDECODE` env stripped (Claude Code refuses to nest) and `--debug-file`.
2. Confirm `hooks module <name> loaded` in the debug log, or catch `hooks modules not loaded: rollout flag (...) is off`. That string is still in 2.1.288, and it is the trigger for the no-mod fallback.
3. Assert visible text: "Need you" present; "(1M context)", "shift+tab to cycle", "new task?" and "Baked for" absent.
4. Use style locators to check that state badges read on a light background.
5. Take before and after SVG screenshots (doctrine §6, visible changes).
6. Run the same script with mods off as a baseline.
7. Clean up the session (gloomberb's tui-testing skill has good cleanup and isolated-profile rules to copy).

Blockers: tmux, vhs and tui-test are not installed (`which` returned nothing). brew is present; tmux 3.7c and vhs 0.12.1 are available as formulae. The built-in `run` skill's TUI recipe assumes tmux (binary strings), so it fails on this machine today.

## Mod ideas found along the way

- **Calm transcript** (firstmate): zero-height `Box({display:'none'})` for tool rows, results and groups, plus mid-turn narration under 240 chars with no newline. The final reply stays. Toggle with a toast, not a transcript row. Restored sessions stay hidden because every hook awaits one cached preference load.
- **Built-in alternative to a calm mod**: `/focus` ("just your prompt, summary, and response") and the `viewMode: "focus"` setting. It needs the fullscreen renderer (`/tui fullscreen` or `CLAUDE_CODE_NO_FLICKER=1`), and when on, the model is told the user sees only its final message (binary). Try this before writing a calm mod.
- **Task inbox for the human** (human-in-the-loop): a tool the model calls instead of burying an ask in prose. It stays open until done, answered or rejected. The count goes in the status entry, not a big card. At most 5 open; duplicates merge; only the main agent assigns.
- **Wait-bound "needs you" state** (party): the wait belongs to the tool call that raised it and ends only when that call returns. A parallel call finishing doesn't clear it. One nag per wait after N minutes.
- **Single owner of the status surface** (telemetry pattern): a `nebi-surface` mod adds `$.nebi.signal({ kind, text })` in `engine.create` with a types contract. Beacon, constellation, plan-rail and red-button call it instead of each drawing, and the owner decides the one line Nebi sees.
- **Leftovers ledger** (homieyangg): record processes Claude started that outlive the turn. Fix the Stop hook so the artifact comment watcher is excluded from its count.
- **Collision guard** (claude-pro-kit): ask before an edit to a file another live session touched recently.
- **Browser per project**: Claude Code opens links with `$BROWSER` when set, else `open` (binary). Set it per project in that project's `.claude/settings.json` env, or route with Finicky by opener and URL. terminal-browser shows the in-pane variant via a custom `browser.open` event.
- **Menu-bar "who needs me" with no new app**: a SwiftBar (4.6k★, v2.1.1 2026-08-11) plugin script that reads `~/.claude/nebi/beacons/*.json`. This is an idea only, not built. It works for terminal and desktop sessions if both run nebi-beacon.

## Levers spotted outside this lane (for the clutter, browser and modsapi lanes to confirm)

- `statusline.mjs:16` prints `model.display_name` ("Opus 5.5 (1M context)"), and `:30` appends " (1M)". Both are Nebi's own lines.
- The binary's settings list includes `showTurnDuration`, `terminalProgressBarEnabled`, `spinnerTipsEnabled`, `promptSuggestionEnabled`, `awaySummaryEnabled` and `viewMode`; all are unset in `~/.claude/settings.json`.
- "new task? /clear to save N tokens" is an idle-return notification (`tengu_idle_return_action`, kind `contextual`, binary).
- `cc-plugin-you-should-know@builtin` is enabled in Nebi's settings. It is a side agent that adds "heads up / you should know" notes, so it is a candidate source of things running that he didn't ask for.
- `~/.claude/settings.json` has `"theme": "dark"` while Ghostty is light. Any mod that picks colors by theme (as firstmate does) will choose the dark palette.
- firstmate found that `Stop hook feedback` rows fire no hookable drawing (verified to 2.1.284). The repeated "N background tasks still running" therefore has to be fixed in `verify-before-stop.mjs`, not hidden by a mod. Recheck on 2.1.288.
- Claude Code's notification channel `auto` already resolves to `ghostty` under Ghostty (binary). Mods have no OS-notification call, only `$.ui.toast` and `$.ui.status`.
