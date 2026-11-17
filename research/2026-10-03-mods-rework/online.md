# Online and social: what the world is building with Claude Code mods

Lane: online + social. Researched 2026-10-03 (access date for every URL below unless noted). Claude Code under study: 2.1.288.
Method: nebi-research skill. Primary sources first (docs, changelog, binary, GitHub source), then GitHub repos and catalogues, then X / Reddit / YouTube / TikTok through TikHub. Treat every social claim as a claim, not a fact.

## The short version

1. **Mods shipped on 2026-10-01 in 2.1.287, on by default, and 2.1.288 followed on 2026-10-02.** One day in, there are already 1,017 public mods (catalogue scan, 2026-10-03). Most draw something new: 424 draw in the band above the prompt and 361 open a pane. Only 4 to 58 mods touch each of the built-in status sites that matter for decluttering.
2. **Decluttering by mod is proven and simple.** Return an empty or `display: "none"` Box for the site and keep errors visible. `calm`, `firstmate-calm` (7.4k-star repo), `quiet-bash`, `quiet-spinner` and `clawdify` all do it today.
3. **Some clutter cannot be reached by any mod.** Anthropic does not let a mod drop the answer options in the AskUserQuestion dialog. Rows like "Stop hook feedback" and "Background command … completed" emit no render event (measured on 2.1.273). Neither do the mid-turn "summary" narration rows (measured on 2.1.288). Fix those at the source: the Stop hook, the output style and Nebi's own mods.
4. **The "shift+tab to cycle" text sits in `PromptHint.hint`** (props captured by a mod author), so a PromptHint hook can rewrite it. No setting can hide it: three upstream issues asking for one are still open.
5. **Attention is the theme people talk about most.** It came up again and again in replies to Anthropic's own "You should know" launch, e.g. "I run 5 Claude Code projects in parallel… my attention is [the bottleneck]". The best community answers are quiet ones. `needs-you` pings only as loudly as needed. `your-move` outlines just the line that needs you. `fleet` and `agent-watch` read `~/.claude/sessions/*.json` to show which sessions are waiting. `receipts` and `ship-check` flag "done" claims that nothing has verified.
6. **The built-in "You should know" mod puts answer buttons in front of you** (1 Understood / 2 Chat in main session / 0 Dismiss, confirmed in the binary). It needs telemetry on, and critics say it costs tokens on every turn. It fits Nebi's "missed things" pain but breaks his "don't tell me what to answer" rule.
7. **Browser handoff already has a working pattern.** `chrome-switch` steers Claude in Chrome to `select_browser(deviceId)`, which needs no approval click, instead of `switch_browser`, which broadcasts a pairing request someone has to click. `browser-guard` pairs the active Claude account with a Chrome profile and blocks a mismatch. Both fit Nebi's two-browser, two-account setup.
8. **Risk:** mods can be served off remotely by a rollout switch even on 2.1.288 (issue #99130, 2026-10-03). The desktop app also has open bugs with mod render sites. Every mod needs a no-mod fallback.

## 1. What Anthropic shipped (primary sources)

| Claim | Receipt |
|---|---|
| 2.1.287 changelog: "Added Claude Mods: plugins may now modify deeper behavior" and "Added You should know, a built-in mod where a side agent watches your back…" | `gh api repos/anthropics/claude-code/contents/CHANGELOG.md`, lines 95-96 of the decoded file |
| 2.1.287 published 2026-10-01T18:00Z (GitHub release), npm 16:59Z; 2.1.288 on 2026-10-02 | `gh api repos/anthropics/claude-code/releases`; `npm view @anthropic-ai/claude-code time` |
| 2.1.288 added `$.ui.selection()` and fixed a mod button running the wrong action, plus a crash with mod rows above the prompt | CHANGELOG lines 3, 22, 31 |
| Docs: "Mods require Claude Code v2.1.287 or later, and they're on by default"; `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is ignored from 2.1.287 | https://code.claude.com/docs/en/plugins/mods/overview.md lines 97, 112 |
| Built-ins: cc-plugin-agents-md, -diff, -plugin-authoring, -sec-default, -telemetry, -you-should-know (off by default) | overview.md lines 228-233 |
| `disableAllHooks`, `--bare` and `--safe-mode` do not stop built-in mods | overview.md line 235 |
| Mods run in the CLI and the desktop Code tab, but not in the VS Code chat panel UI, `claude -p` UI or cloud session UI | overview.md lines 25, 195-198 |
| Samples in claude-code-playground: token-weather, blast-radius, replay-theater, all added in one commit on 2026-10-01 | overview.md lines 52-56; the earlier run's `gh api` commit listing |
| Blog "Getting started with Claude Code mods", Addy Osmani, 2026-10-01 | https://claude.dev/blog/getting-started-with-claude-code-mods/ |
| Launch post, 2026-10-01: examples are /diff, a CI status sidebar, production guards, audit logging | https://claude.com/blog/claude-code-mods |
| Community mod: next-steps by Thariq (Anthropic), up to three next prompts above the input, number keys draft one | https://github.com/anthropics/claude-plugins-community/tree/main/next-steps |
| Announcement tweet @ClaudeDevs, 2026-10-01, about 20k likes and 4.1M views | https://x.com/ClaudeDevs/status/2105721434807083061 |
| "You should know" announcement @ClaudeDevs, 2026-10-02, about 12k likes | https://x.com/ClaudeDevs/status/2106118517447876618 |
| Design thread: "Our intent is to take further extant features as they exist in CC today and migrate them to mod form" (241 comments) | https://github.com/anthropics/claude-code/issues/91870 (body, Sep 9 update) |
| Thariq: "I'm still working on making plan mode into a mod". Asked to make AskUserQuestion a mod: "Oh yeah good idea" | https://x.com/trq212/status/2105734200724983996 (2026-10-01); https://x.com/trq212/status/2106147440814608869 (2026-10-02) |

### Docs facts a build rests on

- **Render sites (15):** Pane, AbovePrompt, UserMessage, AssistantMessage, ToolUse, ToolResult, ToolGroup, CommandOutput, AskUserQuestion, ToolProgress (terminal only), Spinner, TurnDuration (terminal only), InfoNotice (terminal only), SessionMode, PromptHint. Source: https://code.claude.com/docs/en/plugins/mods/reference.md "Render sites".
- **A hook can change a detail, replace the drawing or leave it alone.** Change a detail with `next({...e, props})`. Replace it by returning a tree. Leave it alone with `next(e)`. Source: interface.md, "Change what Claude Code already draws".
- **The permission prompt is not a render site.** A mod's AskUserQuestion tree "has to hold the reference exactly once, with your elements above it. Otherwise, Claude Code draws its own dialog." So a mod cannot remove the options from that dialog. Source: interface.md, the paragraph after the Spinner example.
- **Limits:** `$.ui.toast` shows for 4 s by default. A pane that opens without the user asking is placed only from 144 columns wide (110 after the user has opened it once). Redraws are throttled to 10 a second. Source: reference.md "Limits".

## 2. What people built (counts and categories)

- **Catalogue size:** karanb192/awesome-claude-code-mods scans GitHub nightly. As of 2026-10-03 it lists 1,017 mods in 872 repos, scanned against 2.1.288. 409 run host processes, 322 see every tool call and 28 fail to validate. Sources: https://github.com/karanb192/awesome-claude-code-mods/blob/main/catalogue.md (stats block) and `data/mods.json` (generated 2026-10-03T06:11Z).
- **Where mods draw** (my count over `data/mods.json`): AbovePrompt 424, Pane 361, PromptHint 58, Spinner 55, AssistantMessage 47, SessionMode 40, ToolUse 37, UserMessage 29, ToolResult 24, ToolGroup 24, TurnDuration 21, CommandOutput 10, AskUserQuestion 6, InfoNotice 4, ToolProgress 2. **Most mods add UI; very few remove it.**
- **Categories** (curated lists lycfyi, karanb192 and whyashthakker, all 2026-10-02/03): usage and context meters (the largest group), cache-TTL timers, while-you-wait games and pets, PR/CI trackers, safety guards (blast-radius, launch-codes, merge-gate), secret redaction, subagent panes, memory, and transcript skins.
- **Top YouTube videos this week** (TikHub YouTube search, 2026-10-03): Chase AI "Claude Mods Is The Biggest Claude Code Upgrade Since Skills" (132k views, 1 day). Nate Herk "Set Up These 5 NOW" (71k, 14 h). Mark Kashef "10 Worth Stealing" (23k, 16 h). Jack Roberts "Claude Mods Just Dropped" (19k, 15 h). The video IDs are in the ledger below.
- **The same advice in three videos and one viral post:** have Claude read your own session logs first and rank the recurring problems, then decide whether each needs a mod, a hook, a skill or a setting. Sources: Nate Herk transcript (9hetShMMp2s); Chase AI ("Read my last 30 sessions", Rn4nmFRPe0s); Jack Roberts (moOBIaIb4a8); @Av1dlive, 2026-10-01, https://x.com/Av1dlive/status/2105757532790903192. A mod built for exactly this exists: mod-scout (LeeHigma0201/claude-code-mods) "reads your last two weeks of sessions and ranks the mods you'd actually use".
- **Nate Herk, about his own screen:** "I'm sure you guys are noticing a bunch of other elements here in my UI… it might be a little bit overwhelming." Even the promoters say the UI gets crowded. (Transcript, 9hetShMMp2s.)

## 3. Decluttering: what exists, how it works, and what can't be reached

### Working techniques (read in source)

| Mod | What it hides | How | Receipt |
|---|---|---|---|
| calm (joshhornby) | Tool rows, tool results, tool groups, turn duration ("zen" mode); shows one live status line via `$.ui.status` | Returns `<Box />` for ToolUse, ToolResult and ToolGroup, skips errored or interrupted rows, and hides TurnDuration in zen mode | https://github.com/joshhornby/dotfiles/blob/main/.claude/marketplace/plugins/calm/hooks/calm.tsx |
| firstmate-calm (kunchenguid/firstmate, 7,466 stars) | Tool rows, mid-turn narration ("working notes"), operational user messages; keeps final replies | `Box({ display: "none" })`; classifies text blocks in `turn.step` as working note or final reply | https://github.com/kunchenguid/firstmate/blob/main/.claude/mods/firstmate-calm/hooks/register.ts lines 366-369, 421-502 |
| quiet-spinner (schreibse) | "Baked for…" wording | `next({...e, props:{...e.props, word:'Took'}})` on TurnDuration | https://github.com/schreibse/claude-code-mods/tree/main/quiet-spinner |
| quiet-bash (schreibse) | Bash rows cut to one line; `/quiet` toggles | ToolUse, ToolResult, ToolGroup, CommandOutput | catalogue row (mods.json) |
| clawdify (viik2k) | "hide the startup notices"; rewrites the hint line and footer | `<Box display="none" />` on InfoNotice; rewrites PromptHint; appends to SessionMode `modes` | https://github.com/viik2k/clawdify hooks/register.tsx lines 403-503 |
| roof-mod / reminder-trim | Model-facing nags (todo_reminder, task_reminder, …), not screen clutter | `prompt.attachment` returns `{ text: null }` | https://github.com/kagamiurayama/claude-code-roof-mod ; https://github.com/mark-liu/cc-mods/tree/main/plugins/reminder-trim |
| wipers (DJPalefaceSD) | Hides the bands above the prompt with one key press; another press brings them back | catalogue row (stub) | catalogue |
| statusline-anywhere (NathanAB) | Not a hider: draws your `statusLine` command in the desktop app, which doesn't draw custom status lines (issue #41456, open) | AbovePrompt, only when not in a terminal | https://github.com/NathanAB/statusline-anywhere (2026-10-02) |

### Gaps a mod cannot reach (measured by mod authors)

- **Task-notification rows** ("Stop hook feedback", "Background command … completed") emit no `ui.render` event. The author captured 99 consecutive events, and all 3 UserMessage events were typed prompts. Measured on 2.1.273 by kunchenguid on 2026-09-16: https://github.com/anthropics/claude-code/issues/91870 (comment). **So the repeated "Stop hook feedback: N background tasks still running" must be fixed in Nebi's Stop hook, not hidden by a mod.** Not re-measured on 2.1.288.
- **PromptHint props seen live** (same comment): `"(shift+tab to cycle)"`, `"(shift+tab to cycle) · ← for agents"`, `"1 shell · ← for agents"`. The "(ctrl+b to run in background)" pill is not in it and has no site.
- **Mid-turn "· summary" narration rows** are not a render site on 2.1.288. A catch-all hook saw only 9 sites. Helban, 2026-10-02, issue #91870 comment.
- **A hooked PromptHint** can flash the engine's own hint for one frame on each redraw. konsta95, 2.1.280, issue #91870 comment, 2026-09-23.
- **A band shows a `[-]` collapse mark the mod can't hide or observe**: issue #98986 (2026-10-02). Blank line between the band and the prompt: Reddit, cesargar, 2026-10-02, https://www.reddit.com/r/ClaudeCode/comments/1wvz855/claude_code_mods_are_cool/
- **Effort switching leaves `/effort` rows** in the transcript with no fix: issue #98935.

### Upstream asks for settings (still open, so no setting exists)

- Hide the permission-mode line or hint: #89126 (2026-08-24; a commenter quotes "⏵⏵ bypass permissions on (shift+tab to cycle)" as a permanent second footer row on 2.1.283), #91221 (2026-09-01), #93803 (2026-09-12).
- Silence "Update installed · Restart to update": #88213 (the notice takes over the context-meter slot), #91356 (users want auto-update kept with the notice silenced; "I cannot work with the message there"), #88858.
- Option to disable spinners: #88265. Quiet turns: #93205. The earlier ask to stop "new task? /clear to save" was closed: #60285.

## 4. Attention, "needs you", and done vs not done

| Mod | What it does | Fit for Nebi | Receipt |
|---|---|---|---|
| needs-you "CC Alerts" (ozlar34) | macOS ping when a long turn ends or a dialog blocks. Gets louder only when you're not looking: banner + sound if the host app is in back, banner if it's in front, toast only if you touched it in the last 30 s. One outstanding ping per session, one repeat | Strong: quiet by default, signals only when needed | https://github.com/ozlar34/claude-code-mods/tree/main/needs-you (README, 2026-10-02) |
| your-move (davidtheproduct) | Puts a border on your messages and an outline around the one "Your move:" paragraph. Adds a short system-prompt line asking Claude to use the marker at most once per reply, only when something really needs you. Terminal only | Strong: pairs with Nebi's ❓ status line; no buttons | https://github.com/davidtheproduct/your-move (2026-10-03) |
| robfreshwater's mod | "highlights when Claude needs you to do something or has a question for you. I find it too easy to just skim read and end up missing something." | Same pain in someone else's words | https://x.com/robfreshwater/status/2106360558023016471 (2026-10-03) |
| where-am-i (hamzafer) | A Haiku recap above the prompt: goal, doing now, waiting on you, next | Medium: costs model calls and adds a band | https://github.com/hamzafer/claude-code-mods/tree/main/mods/where-am-i |
| receipts (LorcanChinnock) | "notes when Claude says done with nothing run since its last edit" | Strong for done vs not done | catalogue row; repo created 2026-10-03 |
| ship-check (panyuti-ai) | Board of which tests, builds and type checks really ran and whether they still match the code | Strong for done vs not done | catalogue row |
| loose-ends (fernandomoraes) | Live checklist of unanswered questions, deferred work and caveats | Medium | https://github.com/fernandomoraes/loose-ends |
| leftovers / run-board | Processes Claude left running; a board of background shells and subagents | Matches the "background tasks still running" confusion | catalogue rows |
| You should know (built-in) | Side agent flags things you might miss; a note above the prompt with **buttons "1 Understood / 2 Chat in main session / 0 Dismiss"**; needs telemetry on | Mixed: right pain, wrong UX for Nebi (pushes answers) | Binary strings in 2.1.288 (`grep you-should-know`); overview.md line 233 |

What people say about "You should know" (replies, 2026-10-02/03):
- "I run 5 Claude Code projects in parallel. The code isn't the problem anymore, my attention is." https://x.com/chitodev/status/2106126244081279213
- "The key test is whether alerts are timely, deduplicated, and point to a concrete next action; otherwise they become another feed to ignore." https://x.com/MoLearnAI/status/2106258510602232208
- "Worst feature, force every turn to end in more work for you… send it back to the model to resolve it." https://x.com/DaveAtTidy/status/2106300225417617526
- "I need the claim that has no test, the file it was not allowed to touch, and the assumption it treated as fact." https://x.com/VibeCoderOfek/status/2106194981253734430
- "Most of what I miss lives in tool output: a test run that exited 0 because the file got skipped." https://x.com/iam_defi/status/2106127711999783320
- "It use significant more of your tokens every turns." https://x.com/K7335807334520K/status/2106337356538314991
- Quoting "with telemetry on", a Reddit reply says "no thanks..": https://www.reddit.com/r/ClaudeCode/comments/1wvdj4x/
- "Most mods will add chrome, but the behaviour change worth shipping is the opposite." https://x.com/weirdlyai/status/2105963485179834390

## 5. Many sessions at once

- **The session registry is real and local:** `~/.claude/sessions/<pid>.json` holds `status` (seen: `idle`, `busy`), `name`, `cwd`, `entrypoint`, `sessionId` and `statusUpdatedAt`. Sibling `*.key` files hold tokens and must never be read. Checked locally on 2026-10-03 (field names only). fleet's README says this is an internal file, not an API: https://github.com/Dubbus/claude-fleet
- **fleet (Dubbus)** shows "10 sessions · 2 busy · 1 need you · 6 safe to close" and a `/fleet` pane. **agent-watch (estruyf)** caps open sessions at 3, warns when you submit at or over the cap, and lists the sessions waiting on you or idle ("forget the one that has been sitting on a permission prompt for twenty minutes"). https://github.com/estruyf/claude-agent-watch-mod
- **session-board (Iskandeur)** is a board for terminal and cloud sessions with WAITING ON YOU / IN PROGRESS / TO DO sections: https://github.com/Iskandeur/session-board (2026-10-02)
- **collision guard (Nate Herk)** asks before an edit when another chat touched the same file in the last 30 minutes. goal-meter shows every chat's /goal progress in one place. https://github.com/nateherkai/claude-code-mods ; video 9hetShMMp2s
- **What people asked for in the design thread:** a tray that shows "which sessions are working, waiting on input, stalled, or finished" (BGPlayz1, 2026-09-04); "better notifications on wait for me… (local mac voice tells me the name of the project waiting for my input)" (lyricalpolymath, 2026-09-03); a Ghostty terminal-id dance via osascript to aim notifications (IARFLOW, 2026-09-04). All in issue #91870.

## 6. Browsers and accounts

- **chrome-switch (yash-gadodia, 2026-09-21):** "Every profile with the extension is already connected at once. What costs a click is switch_browser, which broadcasts a pairing request… select_browser takes a deviceId and… selects 'without broadcasting a pairing request'." It keeps `~/.claude/chrome-browsers.json` (label to deviceId, plus a default), selects the default before the first browser call, and adds context steering the model to select_browser. It found that names don't survive the round trip ("Browser 1/2/3" against "Browser 2/3/4" for the same ids), so it keys on deviceId. https://github.com/yash-gadodia/claude-mods/blob/main/chrome-switch/hooks/register.ts
- **browser-guard (abhibansal60, 2026-10-02):** reads the active Claude account (`cswap status`) and the browser in use, stores account-to-profile pairs in `$.store`, and denies Chrome actions when they don't match. https://github.com/abhibansal60/claude-mods/tree/main/browser-guard
- **quickswitch (Rocha101):** one-click Claude account switching from the hint line (powered by ccswitch). Catalogue row.
- **browser-lanes (hamzafer):** shows whether this session holds a Playwright browser and who else does; `/browser clean`. Catalogue row.
- **A mod can't open the desktop browser pane:** auto mode refuses `$.mcp.call` to `preview_start`. Issue #99214 (2026-10-03).
- **terminal-browser (zenbu-labs):** a browser pane inside Claude Code that the agent can drive. https://github.com/zenbu-labs/terminal-browser

## 7. Coolest ideas, with URL and date

1. Doom (and MW2) lobby where every player is waiting on Claude: @jarrodwatts, 7.4k likes, 2026-10-02, https://x.com/jarrodwatts/status/2105858869482471602 (intermission mod, Ghostty/kitty pane, returns you when Claude finishes or needs input)
2. Plan progress bars with sounds for decision, error and done: @kirillvserditov, 1.7k likes, 2026-10-01, https://x.com/kirillvserditov/status/2105790255144063241 (zycck/claude-mods plan-progress)
3. Live map of what the agent reads and writes (/mission, /radar): hamzafer/claude-code-mods, 2026-10-02
4. Recording mode that masks emails and figures on screen: Nate Herk, 2026-10-03 video
5. Collision guard across chats: Nate Herk, 2026-10-03
6. AFKSwitch tells live sessions you're away and collects their status when you return: https://github.com/augbastos/afkswitch
7. switchboard-notch drops Claude's questions from the Mac notch as a native card: catalogue row (2026-10-02)
8. prompt-rail, a rail of past prompts to jump to: @oikon48, 2026-10-01, https://x.com/oikon48/status/2105807552005218477
9. A voice agent that says out loud what changed and what is still untested: @leopiney, 2026-10-03, https://x.com/leopiney/status/2106225123808399501

## 8. Fit to Nebi's pains

| Nebi's item | Best fit from the field | Mod or source fix |
|---|---|---|
| Misses things / unclear when done | your-move outline + receipts/ship-check "done but unverified" + needs-you loudness tiers | A mod (one owner of the needs-you signal) plus the output style marker |
| "Don't tell me what to answer" | Avoid the YSK and next-steps button pattern; a mod can't strip AskUserQuestion options | Source: output style and own mods |
| Stop hook "N background tasks still running" | Not hideable (no render event) | Source: fix the Stop hook's count |
| "Baked for 1m 23s" | TurnDuration hide or reword (calm, quiet-spinner) | Mod |
| Code previews in Write results | ToolResult → `display:"none"`, errors kept (calm, firstmate-calm) | Mod |
| "shift+tab to cycle" | PromptHint `hint` rewrite (no setting exists) | Mod |
| "bypass permissions on" | SessionMode `modes` (labels) | Mod (check in types) |
| Mod reload / startup notices | InfoNotice → hidden (clawdify) | Mod |
| "Update installed · Restart to update" | No setting except stopping updates; site unknown | Unconfirmed |
| Many sessions | `~/.claude/sessions/*.json` status → one line "2 need you" (fleet, agent-watch) | Mod |
| Browser picked wrong / approval clicks | chrome-switch (select_browser by deviceId) + browser-guard (account to profile) | Mod, or a rule in the browser routing doc |
| Status line in the desktop app | statusline-anywhere pattern | Mod (only if he wants it there) |

## 9. Risks seen in the wild

- **Remote rollout switch:** "hooks modules are turned off for installed plugins in this process: the rollout switch served off" on 2.1.288. Issue #99130 (2026-10-03), confirmed by a second user. Built-ins still load. A user-installed mod can silently not load.
- **Desktop app:** it redraws every mod render site on any state change, which breaks Buttons and restarts animations (#99211). Mod UI doesn't draw in desktop or iOS views of a Remote Control session (#99217). The VS Code extension draws no mod UI (#99045).
- **Security (Pluto Security, 2026-09-22, tested on 2.1.274):** silent secret access, no capability disclosure ("Hooks (0)" in plugin details), UI spoofing by rewriting the AskUserQuestion text, and fetch-then-run code. https://pluto.security/blog/claude-code-function-hooks-security/ The current docs rule that the dialog must keep the engine's reference looks like a response to that.
- **Clutter creep:** most mods add bands and panes. @shakhzod1001: "you can get distracted as well" (2026-10-02). @automadynamics: "Feature slop. We like the terminal because it's the terminal."

## 10. TikHub spend

- **My calls:** 38 (2 YouTube calls failed with HTTP 400). Spend measured by balance: USD balance 4.222 → 4.158 and free credit 1.540 → 1.539, about **$0.065** of the $0.50 cap. The ledger is in the scratchpad (`online/ledger.csv`).
- **Breakdown:** 4 YouTube captions at $0.008, 4 YouTube searches, 1 TikTok search, 13 Reddit calls, 12 X searches and 4 X reply fetches at about $0.001 each.
- **Reused, not re-bought:** 27 X search files that the stopped run had already paid for (2026-10-03 14:36-14:38 local).

## What I could not confirm

- Whether "Update installed · Restart to update", "new task? /clear to save" and the "recap:" lines are drawn through a mod-reachable site (InfoNotice or PromptHint) or outside it. I checked the docs, the issues and the catalogue, but not a live catch-all hook.
- Whether task-notification rows are still unhookable on 2.1.288. The measurement is from 2.1.273.
- What exactly `SessionMode.modes` holds on 2.1.288 (is "bypass permissions on" one label?). The types file only says "The labels the footer shows".
- Whether Nebi's own mods load or are served off by the rollout switch. There are no local `~/.claude/debug/*.txt` logs to check.
- Reddit comment threads are only partly fetched (first page, TOP sort). The HN Algolia request returned 400 and there is no HN thread data.
- Which two browsers Nebi uses. chrome-switch only covers Chrome profiles running the Claude in Chrome extension.
