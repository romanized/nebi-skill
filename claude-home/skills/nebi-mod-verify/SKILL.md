---
name: nebi-mod-verify
description: "Read this before calling a Claude Code mod done, not after. Paint check for the nebi mods: runs a real claude session in a pseudo-terminal, renders the screen to PNG, asserts clutter strings absent and promised rows present, compares against a --safe-mode baseline, and checks the debug log that every enabled nebi mod loaded. Use after building, changing, installing or enabling a mod in mods/, after a Claude Code update, when a clutter string such as (1M context), shift+tab to cycle, Churned for or recap: seems back, or when asked to verify, screenshot or prove what the terminal actually shows. Not for fixing a failing claude plugin test or tsc error inside a mod (nebi-debugging), and not for web pages or the desktop app."
---

# Mod verify: check what the screen actually shows

`claude plugin test` checks the tree a hook returns, never the painted screen. This skill runs a real session, captures the screen and the debug log, and checks both. It is step 5 of the done bar in `<repo-root>/mods/CONTRACT.md`.

## Run

Scripts live in this skill's `scripts/` folder (deployed under `~/.claude/skills/nebi-mod-verify/scripts/`).

1. **Paint check, mods as installed:** `node scripts/capture.mjs --label after`. It takes 1 to 3 minutes. The first run installs two pinned npm packages into `~/.cache/nebi-mod-verify` and needs the network once. It recreates a demo git repo there, starts `claude` with `--debug-file` in a 150x46 pseudo-terminal, captures two fixed scenes (turn end on a ❓ ask, and mid-turn during a slow Bash call), exits with `/exit` so SessionEnd hooks run, renders PNGs in Nebi's light Ghostty theme, then runs [check.mjs](scripts/check.mjs). Exit 0 means every check passed.
2. **Stock baseline:** `node scripts/capture.mjs --safe-mode` (label `baseline`). No CLAUDE.md, hooks, status line, skills or installed mods. It is recorded, never asserted.
3. **Compare:** `node scripts/check.mjs <run folder> --baseline <baseline folder>` prints each string as baseline -> run.
4. **Add what the change promises:** `--present "TEXT"` (checked on the final turn-end screen) and `--absent "TEXT"` (screens and scrollback), repeatable, on either script.

Runs land in `~/.cache/nebi-mod-verify/runs/<label>/` unless `--out` says otherwise: `turn-end.png`, `mid-turn.png`, their `.txt` and `.full.txt` text, `debug.log`, `session.cast`, `meta.json` and `checklist.json`. The entry point is [capture.mjs](scripts/capture.mjs); the pty wrapper, renderer and [guards.mjs](scripts/guards.mjs) sit beside it.

## Silenced session

Nobody sits at the pseudo-terminal, so a verification session never pushes, never bridges to Remote Control and never writes a beacon peers can see. capture.mjs launches claude with `--settings '{"agentPushNotifEnabled":false,"inputNeededNotifEnabled":false,"taskCompleteNotifEnabled":false,"remoteControlAtStartup":false}'` (the flag source wins over `~/.claude/settings.json`; only managed policy beats it) and `NEBI_VERIFY=1` in its environment, which `pty_bridge.py` also forces on whatever it launches. Under `NEBI_VERIFY=1`, nebi-beacon still draws its row but sends no push and writes no beacon file, and the Stop hook writes no fallback beacon. Each run gets its own `--session-id`, so the exit check (`meta.json` `exit.newBeaconsStillPresent`) looks only at that session's beacon, never at files other live sessions wrote meanwhile. Never launch a demo session without these.

## Dialog and settings guards

Claude Code draws its own dialogs, such as the auto mode offer, folder trust or a survey. Text typed into one, followed by Enter, picks the highlighted choice and can rewrite the real `~/.claude/settings.json`. That happened once: the harness answered "Make auto mode your default permission mode?" with Yes.

- **Dialogs:** before every keystroke (prompt 2, `/exit`, the retry Enter) and on every wait poll, capture.mjs reads the screen. When a choice block with a `❯` cursor shows, [guards.mjs](scripts/guards.mjs) picks the option that keeps the current setting or declines (`keep`, `Not now`, `Skip`, `No`, `Don't`, never one that starts with Yes or Allow). capture.mjs moves the cursor there with the arrow keys and confirms. With no such option it presses Esc, then waits for the screen to settle and checks again. Folder trust is accepted, and so is the bypass warning, because declining either one exits the session. Enter is pressed only when the input box visibly holds the typed text. A dialog that will not close fails the run, and nothing is typed into it. `meta.json` `dialogs` lists each dialog seen and the choice made.
- **Settings:** `~/.claude/settings.json`, plus the `CLAUDE_CONFIG_DIR` copy when that variable is set, is snapshotted before launch. If `permissions` or `enabledPlugins` changed after the exit, those keys are restored from the snapshot and the run fails with the diff (`meta.json` `settingsGuard`, `FAIL settings:` lines). Other changed top-level keys are reported and left alone, since another live session may have written them.

## What it checks

- **Absent** on both scenes, final screen and scrollback, welcome banner skipped: `(1M context)`, `shift+tab to cycle`, `Baked for`, `Churned for`, `background task`, `recap:`, `new task?`, and a `NEED YOU` row followed by answer keys such as `1: …  0: dismiss`.
- **Present** on the turn-end screen: `❓`, plus the `NEED YOU` badge when nebi-beacon is enabled.
- **Settings untouched:** a changed `permissions` or `enabledPlugins` fails every run, the `--safe-mode` baseline included.
- **Loaded:** every `nebi-*` plugin set to true in `~/.claude/settings.json` has a `hooks module <id> loaded` line in `debug.log`, and no line names a nebi mod with `not loaded`, `did not load`, `failed to load`, `refused` or `does not validate`. A `hooks modules not loaded` or `are turned off` line also fails: that is the rollout switch or `disableAllHooks`, and the no-mod fallbacks are what Nebi sees. The one exception is `hooks modules not loaded until workspace trust is accepted`, which the engine logs before the trust dialog is answered: it passes when every enabled mod has its own loaded line after it.

## Report

Show Nebi the baseline and run PNGs side by side and the `FAIL` lines. Skip the full checklist.

## Gotchas

- The run is a real session: one short pair of turns on the default model. It is silenced (see above), but it still spends usage, so run it when a mod change needs proof, not in a loop.
- It sees only the terminal. The desktop app, OS notifications and the Ghostty tab title are not captured.
- The scenes depend on the model following the scene prompt. Compare the chrome (footer, status line, band, hints), not the reply's wording. If Claude Code renames its spinner, update `BUSY` in capture.mjs.
- Inherited `CLAUDE_*` variables are stripped (Claude Code refuses to nest), so the run uses account a's config.
- A mod that loads but draws nothing passes the load check; the screen strings catch that.
- PNGs need Google Chrome (`NEBI_CHROME` overrides the path). They draw `⏺` as `●`; the `.txt` files keep the real characters.
