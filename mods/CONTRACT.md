# Nebi mods: shared contract (v2, 2026-10-03)

Every mod in this folder loads into the same Claude Code session as the others. These rules keep them from fighting over the screen, the events and the files. The lead owns this file; a builder who needs a change asks the lead. The research behind it is in `research/2026-10-03-mods-rework/` (spec: `spec-draft.md`); where the spec and this file disagree, this file wins.

## The one rule

A mod either makes **done / working / needs you** clearer or makes something **quieter**. At rest the whole set adds at most one band row (an open ask) and one receipt row (a turn that edited files). No animation, no sound, no speech, no answer options.

## Screen sites: one owner each

| Site | Owner | Rule |
|---|---|---|
| Status line | `claude-home/nebi/statusline.mjs` (no mod) | Other sessions waiting on Nebi, model, context, limits, account/browser, branch. |
| `AbovePrompt` band | `nebi-beacon` and `nebi-red-button`, exclusive by state | Beacon: one row, only while an ask is open or the turn died on an error, and only when `!e.props.isWorking`. Red Button: its hold row, only while it holds a call. Both `const below = await next(e)` first, stack their row with `below` (skip it when null or empty) and return `below` unchanged on `e.props.hasSurvey` or when there is nothing to show. |
| `PromptHint`, `ToolProgress`, `ToolResult`, `ToolUse`, `InfoNotice` | `nebi-quiet` | Errored and interrupted rows always pass through untouched. |
| `AssistantMessage` | `nebi-replies` | The final reply is never hidden. |
| `turn.complete` `{ text }` | `nebi-receipt` | The only mod that returns text there. |
| `SessionMode` labels | `nebi-model-lock`, `nebi-browser`, `nebi-constellation` | Append to `e.props.modes`, never remove others. At most one label per mod, 20 cells max (an emoji counts two cells). Never repeat a fact the terminal status line already shows: such labels draw only when `e.surface !== 'terminal'`. The browser-clash label shows only while this session and at least one other live session resolve to the same Chrome device and both have a `browserActiveAt` within the last 10 minutes; it is quiet at rest. |
| Panes | `nebi-red-button` (`/redbutton`) only | Opened only by the `/redbutton` command Nebi typed; a hold never opens one. |
| `Spinner`, `TurnDuration`, `UserMessage`, `ToolGroup`, `AskUserQuestion`, `CommandOutput` of another mod | nobody | Leave them to the engine (settings handle `TurnDuration` and tips). |

`PromptHint` `tail` is retired for every mod: `nebi-quiet` rewrites `hint`, and a rewritten hint drops any tail.

## Banned

- `$.ui.status` (the engine draws it as `⚠ <plugin>:` in warning colour).
- `$.audio.speak` and `$.audio.play`: no speech and no sounds, not even behind a setting.
- Buttons, hotkeys or prompt fills that offer Nebi answers; `$.model.fork` to write UI text.
- `prompt.compose` system-prompt sections and `$.tool.register` model tools (the session-start hook carries per-project context instead).
- Panes or bands opened unasked; features reachable only through a command.
- Hooking a site this table gives to another mod.

## Toasts and pushes

- Toast allowlist: `nebi-constellation` (a peer session flips into need, batched within 10 s), `nebi-wispr` (at most one per prompt, only when it actually changed his words), `nebi-red-button` (a sub-agent's risky call was stopped). Otherwise a toast only answers a command Nebi typed.
- Push (`$.tool.call('PushNotification', …)`): `nebi-beacon` at most once per open ask, skipped when the model already pushed that turn; `nebi-red-button` once per hold. The output style tells the model to push only the first time it asks a given question.
- Verification sessions (env `NEBI_VERIFY=1`, launched by `nebi-mod-verify` with pushes and Remote Control off) never push and never write a beacon or hold file; they still draw. The engine skips a push while Nebi is active in that terminal, which is the "only when needed" behaviour; never work around it.

## Status line text and the proof rule

- One status regex, shared with the Stop hook (`claude-home/hooks/verify-before-stop.mjs`): `/^[\s>*_`]*(✅|⏳|❓)/u`, matched per line; the last matching line of the reply counts.
- One proof rule: an edit is proven when the latest check-like command run after the latest file edit passed. `nebi-receipt` owns the check-like heuristic (`node --test`, test runners, linters, type checks; a `cd` part is not a check). The Stop hook still reads the latest Bash of any kind, a known gap.

## Session beacon files (v2)

`nebi-beacon` writes one file per session; the Stop hook writes a fallback only when no fresh mod file exists; `nebi-constellation` and `statusline.mjs` only read them.

- Folder: `<HOME>/.claude/nebi/beacons/` (HOME from `$.env.get('HOME')`). Both accounts share it (`~/.claude-max2/nebi` is a symlink to `~/.claude/nebi`).
- File: `<sessionId>.json`, `sessionId` from `await $.session.id()`. Written at `session.start`, on every state change, and at least every 30 s (heartbeat, restarted on `turn.start` after a `/clear`). Deleted on every `session.end`.
- Written whole but not atomically: readers skip a file that does not parse and retry on the next poll. Readers accept v1 and v2.
- Gone when: `writer: "mod"` and `heartbeatAt` older than 90 s; `writer: "hook"` and `updatedAt` older than 12 h.

```json
{
  "version": 2,
  "writer": "mod | hook",
  "sessionId": "a409cdf5-…",
  "project": "nebi-skill",
  "cwd": "/Users/nebi/Documents/GitHub/nebi-skill",
  "account": "a | b | null",
  "browser": { "deviceId": "aaaaaaaa-…", "label": "Main Chrome" },
  "kind": "idle | working | done | need | background | stopped | error | missing",
  "text": "the status line's words, or the prompt while working",
  "ask": { "what": "…" },
  "origin": "composer | bridge | task-notification | peer | … (PromptOrigin kind of the prompt that started the last turn)",
  "askedAt": 1790930012000,
  "browserActiveAt": 1790930011000,
  "startedAt": 1790930000000,
  "updatedAt": 1790930012000,
  "heartbeatAt": 1790930030000
}
```

`browserActiveAt` is the time of this session's last `mcp__claude-in-chrome__*` call (main loop or sub-agent), absent if it never used the browser. `ask` and `askedAt` are present only while an ask is open. An ask opens when a main-loop turn ends on a ❓ status line or while an `AskUserQuestion` call is pending. It survives later turns started by a task notification or a peer, whatever they end on, and clears only on a prompt whose origin kind is `composer` or `bridge`.

**Hold file.** `nebi-red-button` writes `<sessionId>.hold.json` in the same folder while it holds a call and deletes it on every exit path (and at `session.start` when no hold is live): `{ "version": 1, "sessionId", "project" (cwd basename), "cwd", "account", "what", "heldAt" }`. Readers count it as need; it is gone when `heldAt` is older than 15 minutes.

## Route: which Chrome and which Claude account a project uses

- Project file, wins: `<git root>/.claude/browser.json` = `{ "version": 1, "label": "RapidSneakers Chrome", "chromeProfile": "Profile 3", "deviceId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "codexBrowserId": "a2ecff6d-98ef-462e-b499-5e053713a0e3", "claudeAccount": "b" }`. `codexBrowserId` is the ChatGPT extension instance in that profile, which the codex-browser skill selects; it is optional.
- Account defaults: `~/.claude/nebi/browsers.json` = `{ "version": 1, "accounts": { "a": { "label", "chromeProfile", "deviceId", "codexBrowserId" }, "b": { … } } }`.
- Current account: `CLAUDE_CONFIG_DIR` unset or `~/.claude` → `"a"`; a path containing `.claude-max2` → `"b"`; anything else → `null`.
- The Team account (`claude-team`) has no browser route on purpose: its account is `null`, so it gets no account default, and browser work there falls back to codex-browser.
- Resolution: the project file if present, else the current account's default, else no route (everything passes). `mismatch` is true when the project file names a `claudeAccount` other than the current account.
- Mods follow `route.mjs` step for step (same git-root walk, same validity checks, same fallback to the account default when the project file is missing or invalid, no `<cwd>/.claude/browser.json` lookup outside a repo).
- Node consumers import `claude-home/nebi/route.mjs` (deployed to `~/.claude/nebi/route.mjs`): `resolveRoute({ cwd, env = process.env, home = os.homedir() })` returns `{ label, chromeProfile, deviceId, codexBrowserId?, claudeAccount, account, source: 'project' | 'account', mismatch }` or `null`; `codexBrowserId` is present only when the file names one. Mods cannot import it; they implement the same steps with `$.fs` and `$.env`.
- Known devices: account a = Default profile `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` ("Main Chrome"); account b = Profile 3 `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` ("RapidSneakers Chrome").

## Shared events

- `prompt.submit`: rewritten only by `nebi-wispr`; observed by `nebi-beacon`, `nebi-browser`, `nebi-session-guard`, `nebi-model-lock`. Observers must work whichever order they run in.
- `tool.call` deniers have disjoint sets: `nebi-red-button` (destructive or outward Bash and MCP send/publish/delete), `nebi-browser` (`mcp__claude-in-chrome__*`), `nebi-session-guard` (Bash that opens terminals, windows or interactive sessions). Every deny carries one sentence telling the model what to do instead. Every other mod only observes and always passes the call on.
- `agent.spawn`: rewritten only by `nebi-model-lock`.
- `turn.complete`: hooked only by `nebi-receipt` (the engine groups every plugin hooking an event into one hop and labels its text with all their names joined by `+`). `nebi-beacon` reads the turn's end from the last main-loop `turn.step` instead.
- Nothing may rely on plugin hook order.

## Kill switch and fallbacks

- Every mod reads `NEBI_MODS_OFF` (`all`, or a comma list of mod names) with `$.env.get` on its first hook (memoised per load; `register()` gets no `$`) and, when named, every hook passes straight through and it registers no command.
- Every mod's header comment names its no-mod fallback (the status line, the Stop hook, the output style or a settings key).
- Noise switches are `userConfig` fields with quiet defaults.

## Quality bar for every mod

- Text from a model, a tool or another session is untrusted: strip escape sequences and control characters before drawing it.
- Colours read on a light terminal and a dark one. Nebi's Ghostty is light. State colours go on badge backgrounds with black text; never rely on dim grey alone.
- Values a drawing reads live in `$.state`, declared in the mod's `types/index.d.ts`. A hot reload restarts module variables; the exception is a value a long-held hook waits on (a Red Button decision), which stays a module variable.
- A mod works when the other nebi mods are absent.
- Claude Code writes `tsconfig.json` and `.claude-plugin/types/` into a mod folder each time it loads the mod; they are regenerated and ignored by `.gitignore`.
- The validator refuses passing `$` into a function imported from another file: code that calls `$` lives in `register.tsx`; helper files hold pure logic.
- A kill-switch test needs its own test file, because module state is shared across the tests in one file.
- Red Button holds only the main loop; a sub-agent's risky call is denied at once with a reason.

## Done bar for every mod

1. `claude plugin validate <mod>` exits 0.
2. `claude plugin test <mod>` passes over `terminal` and `desktop`, with at least one test per behaviour the spec names.
3. `tsc -p <mod>` is clean (`npx -y -p typescript tsc -p <mod>`; for a mod the engine has not loaded yet, use the tsconfig from the types file's header, kept outside the mod folder).
4. The version in `.claude-plugin/plugin.json` is bumped.
5. After install, a real session loads every mod with no `refused` or `does not load` line in the debug log, and the paint check (`nebi-mod-verify`) shows the screen the spec promises.
