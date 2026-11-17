# Usage lane: how Nebi actually uses Claude Code, and the moments he misses

Research date: 2026-10-03. Window: last 10 days (2026-09-23 00:00 CEST to 2026-10-03 ~15:00). Read-only.

Scripts (node, in the helm scratchpad `.../5376e9a8-.../scratchpad/usage/`): `hist.js` (typed prompts from `~/.claude/history.jsonl`), `scan.js` (sessions, tools, commands), `turns.js` and `next.js` (turn-end status and what follows it), `ask2.js` (Ask card answers), `watch.js` (stop-hook and watcher noise), `conc2.js` (concurrency), `chrome.js` (browser tool errors). Every number below comes from one of them unless another receipt is given.

Data base: 636 typed prompts in `history.jsonl` (both accounts write to it: `~/.claude-max2/history.jsonl` is a symlink to `~/.claude/history.jsonl`); 99 transcript files active in the window, of which 76 are interactive CLI sessions, 22 `sdk-cli` test probes and 1 desktop session.

## Summary

1. **The asks he misses are the ones that send him somewhere else.** A `❓ Need you` that points to an artifact page waits a median 14.8 min for a reply (p90 183 min; 15 of 40 waited over 30 min). A `❓ Need you` answered in the chat waits 3.9 min (p90 37 min). The native AskUserQuestion card waits 2.9 min (max 15.7 min, none over 30). The worst case on record: "Been a whole day. Unfortunately I did not manage to answer" after an approval page.
2. **Done is rarely said.** Of the turns he starts, 47% end `⏳ Working`, 32% `❓ Need you`, 18% `✅ Done`. Background work then finishes on its own and starts 381 new turns; 99 of those end in a new `❓ Need you` that arrives while he is in another session.
3. **The Stop hook makes "is it done?" worse.** It fired "N background tasks still running" 788 times in 63 sessions, and 98 of 915 turn-ends (11%) spend words explaining that the "task" is only an artifact page's live-update watcher.
4. **He runs 2 to 9 sessions at once, all in Ghostty.** Median 2 CLI sessions producing output per 15 minutes, p90 4, max 9. Right now 10 live CLI sessions: 5 on account A (Karpet24 + nebi-skill), 5 on account B (RapidSneakers). The Claude desktop Code tab has one empty session in the window.
5. **None of the mod commands are used by him.** Zero `/fleet`, `/sessions`, `/aside`, `??`, `/lock`, `/redbutton`, `/wispr` in history or transcripts since the mods landed (2026-10-02 ~11:00). The only "use" is passive: the plan rail tool is called by the model (23 calls in 5 real sessions), beacon cards, constellation band, wispr glossary, four Red Button denials.
6. **Two browsers = two Chrome profiles bound to two Claude accounts.** Default profile ("main", deviceId aaaaaaaa, Karpet24/CNL) and Profile 3 ("Your Chrome", deviceId bbbbbbbb, RapidSneakers). Device labels swap, the extension silently falls back to the other profile, and macOS opens every URL in the last-used Chrome profile.
7. **What he repeats:** `/usage` 74 times, "handoff" 54, "be clear / what do you mean" 43, "what changed / where are you" 27, `/effort Ultracode` 33 plus "Ultracode" in 71 prompts, session naming 12, "context % / new session?" 36.

---

## 1. The moments he misses or misreads

### M1. Asks parked on an artifact page (the biggest miss)

- Reply delay after a turn ending `❓ Need you`, split by where the answer goes (`turns.js`, 179 need-you turns he answered):

  | Where the ask points | n | median | p90 | waited >30 min |
  |---|---|---|---|---|
  | artifact page ("on the page", claude.ai/artifact link) | 40 | 14.8 min | 183.5 min | 15 (38%) |
  | answer in the chat | 139 | 3.9 min | 37.3 min | 15 (11%) |
  | native AskUserQuestion card (`ask2.js`, 32 calls / 72 questions) | 32 | 2.9 min | n/a | 0 (max 15.7 min) |

  Caveat: page asks tend to be bigger decisions, so part of the gap is review time.
- Quotes after page asks:
  - cnlsneakers d87ecab4, after "your answers on the approval page; the final fix round keeps running meanwhile": "Been a whole day. Unfortunately I did not manage to answer. Are we able to continue? ... I'm pretty sure there were a lot of questions I haven't answered or things that I did not manage to finish."
  - ecommerce 3cdfa29b, 1,507 min after "your go on the €350 launch plan (https://claude.ai/artifact/AEa9o2SC6nBGwQyVup312o)": "Still don't get the points. You're being so useless and cluttered." (also `ecommerce-workspace/LESSONS.md:145` W30).
  - ecommerce 7220f0d2, 54 min after "answers to 1–7 on the review page": "All right, I got cut off. Don't do anything. I want you to write a handoff for tomorrow ... I forgot about this."
- Live receipt at 2026-10-03 12:58Z (`~/.claude/nebi/beacons/*.json`): cnlsneakers 51cec88e in `need` for 97 min, cnlsneakers b7c547c8 in `need` for 60 min, Karpet24 boss 3c0d8d73 in `need` for 4 min (deadline today per `ecommerce-workspace/HANDOFF-2026-10-03-boss.md:56`).

### M2. Done vs not done: most turns end "still working"

- Turn-end status of turns he started (`next.js`): `⏳ Working` 244 (47%), `❓ Need you` 165 (32%), `✅ Done` 93 (18%), none 15.
- After a `⏳ Working` end, the next event was a background task-notification 262 times and his own prompt 107 times. Turns started by task-notifications: 381, ending `⏳` 222, `❓` 99, `✅` 36. So most "done" or "need you" moments are produced by background work finishing, not in reply to him.
- His status checks while work runs (replies to `⏳` turns, `turns.json`): "It's been almost 3 hours, can you update me on the process, how much longer, is everything going smooth" (twice, 59 and 97 min after); "What exactly are you waiting on and why does it take so long?" (`history.jsonl` L1368, 10-02 00:46); "Unfortunately it's been a day later. I did not manage to finish."
- Recaps duplicate the status: each `away_summary` ends with its own ✅/⏳/❓ line (130 recaps in the window; sample f84bfc32 10-03 10:33Z to 11:32Z, four recaps in one hour).

### M3. The Stop hook's "background tasks still running" echo

- `stop_hook_summary` records carrying "N background task(s) still running — wait for them and use their results before claiming done": 788 in 63 sessions (`watch.js`). Source: `~/.claude/hooks/verify-before-stop.mjs:86-91`.
- 98 of 915 turn-ends (10.7%) explain it away, e.g. 019d4385: "Nothing of mine is still running; the one task the system lists is the report page's background live-update link, not work in progress." and 06a43041: "The hook's count most likely includes the comparison page's live-update connection, which isn't a job."
- Visible in his screenshot (transcript a409cdf5, user image 2026-10-03T12:27:51Z): "Stop hook feedback: 2 background tasks still running — wait for them and use their results before claiming done." beside "Waiting for 1 dynamic workflow to finish".

### M4. Questions buried above the fold or pointed at by count

- `history.jsonl` L1113 (09-27 19:42, nebi-skill): "it's very annoying that you can see it comes back saying, 'I have a couple of questions. Answer yes or no.' Because he answered it a couple of minutes ago, and then a lot of work has been done in the meanwhile, I don't see it ... I always have to ask, 'Be more clear and stuff.'"
- L1115 (09-27 19:45, ecommerce): "be clear about the yes/no that are open i dont see the questions".
- L1421 (10-02 10:55): "very unclear happens a lot 'do this this' while explained at the top and i have no context it tells me clear what to do but the decison / clarification short is not there".
- `~/.claude/nebi/failure-log.md:65`: status line said "two small yes/no's from you still open" without restating them; fixed by the output-style rule "Re-ask open questions in full" (`~/.claude/output-styles/nebi.md:23`, commit f61179c 09-27).
- 44 of 462 non-slash prompts answer numbered lists ("1. ... 2. ... 3. what do you mean"), the shape that forces him to map answers back to questions he can no longer see.

### M5. Coming back cold: no memory of what was done

- "what is this for again ... i cant even remember my original requests from today and yesterday" (L893, 09-23); "you probaly lost your cache, no need to read everything, just look at the image this is the last message, sumarize it ... so that i can approve" (Karpet24 0ff54348, 2,542 min after a need-you); "What was your job this whole time, from days ago and stuff? What have you changed?" (inbox #21, 10-01); "What have you done exactly again? You made some changes, right?" (inbox #26, 10-03).
- Pattern count: "what did you do / change / where are you / what happened / what's next" in 27 prompts.

### M6. Sessions and terminals he did not open

- L1106 (09-27): "are you the one that opened so many different terminals, what is happening there let me know"; ecommerce 9e7e12f5 reply: "were you the one that opened a new instance of ghostly ... some need answers or stopped, if it wasnt you tell me now and dont do anything".
- L1339 (10-01): "That you opening a new session? If so don't do it. I want you to just give me a prompt so that I can open it here".
- L1373 (10-02): "whenever you want to make a new session you prepare but let me know first so i can make the tap organized here with the name you want".

## 2. Sessions at once, projects, desktop vs Ghostty

- **Concurrency** (`conc2.js`, CLI only, 15-min buckets with assistant output): 1 session 96 buckets, 2: 80, 3: 48, 4: 19, 5: 8, 6: 13, 7: 4, 9: 1. Median 2, p90 4, max 9. Distinct CLI sessions per day: 7 to 15. He typed into a median 3 sessions per hour (max 8).
- **Peak** 2026-10-02 10:45: rs-growth-browser, rs-boss, rs-ads, rs-worker, rs-website-update (cnlsneakers), k24-bol, karpet24-boss, k24-content (ecommerce-workspace), a409cdf5 (nebi-skill).
- **Live right now** (`~/.claude/sessions/*.json`, `~/.claude-max2/sessions/*.json`, pids alive): A: domain sniper, nebi-skill-e5 (nebi-skill); k24-bol, karpet24-boss-2, k24-content (ecommerce-workspace). B: rs-growth-browser, rs-website, rs-worker, rs-ads, rs-boss (cnlsneakers). All `entrypoint: cli`. Each file carries `name`, `cwd`, `status` busy/idle and `bridgeSessionId`.
- **Projects** by typed prompts: ecommerce-workspace (Karpet24) 279, cnlsneakers (RapidSneakers) 257, nebi-skill 83, bugs_bunny_project_alpha 6, Karpet24 4, MeiMei-website 2. CLI sessions: ecommerce-workspace 35, cnlsneakers 27, nebi-skill 10.
- **Roles**: 25 named CLI sessions follow a boss/worker scheme (rs-boss, rs-worker-1..3, karpet24-boss, k24-*). 338 SendMessage calls, 208 cross-session messages received.
- **Desktop vs Ghostty**: 76 CLI sessions vs 1 `claude-desktop` session (untitled, scratch workspace, created 2026-09-24T11:16Z, no activity; `~/Library/Application Support/Claude/claude-code-sessions/.../local_609409b7-....json`). 56 of 76 CLI sessions carry `bridge-session` records because `remoteControlAtStartup: true` (`~/.claude/settings.json`), so they are visible in claude.ai and the desktop app. Whether he reads or answers them there is unconfirmed: typed prompts carry no remote marker (`promptSource` typed 401, queued 11; `origin.kind` human 414).
- **"Desktop app" in his words likely includes Codex Desktop**: 180 of 229 Codex session files since 09-23 have `"originator":"Codex Desktop"` (`~/.codex/sessions`; subagent threads count separately). The inbox shows Codex in-app browser use on localhost review pages (#15-#18).
- **Terminal**: Ghostty, 2 tabs x 2 splits in his screenshot; config `~/.config/ghostty/config:5` follows macOS light/dark (Catppuccin Latte/Mocha). Note `~/.claude/settings.json` has `theme: "dark"` while Ghostty is light by day.
- **Hours**: prompts from 08:00 to 01:00, with 35 between 00:00 and 01:59; "getting late / tomorrow" in 23 prompts. He also works from school on a phone hotspot (L948 09-25; HANDOFF-2026-10-03-boss.md:62).

## 3. Complaints: UI noise, being told what to answer, verbosity

- The brief, verbatim (L1453, 10-03 14:27): "indicating the model is good but why add 1m context, removing the indication that says shift + tab to cycle ... including in the chat right now with the responses"; "the overall look of the terminals and stuff all looks very cluttered. I don't know what's going on. It is very unclear as a developer to know what's going on. I don't like it telling me what kind of things I should answer. It's very big."; "We start with the clutter: remove whatever I don't need to see, the things that are running that I don't like, and things that are collapsed, like code that's not relevant for me. I miss a lot of the things that I need to do and it's unclear when something is done and when it's not done."
- **Told what to answer**: the `❓ NEED YOU` card with numbered options comes from nebi-beacon: `mods/nebi-beacon/hooks/register.tsx:55` (badge), `:184` (a model fork writes the card), `:449-467` (options + dismiss); `mods/nebi-beacon/hooks/parts.ts:201-220` ("options: up to 3 concrete answers they could send as is"). The screenshot shows the reply already listing "1. (Recommended) ... 2. ... 3." and then the card repeating them as "1: I'll send it via Partner Service 2: Chrome session, you send it 3: Leave the colour groups as is 0: dismiss".
- Data that cuts the other way: on the native AskUserQuestion card he picked an option for 44 of 72 questions (37 the "Recommended" one) and typed his own answer for 28 (39%), often overriding the options ("Do whatever you recommend but why are you even using GPt image 2 use 2.5"). Blocking cards get fast answers; the complaint is about pushed answer menus, not about being asked.
- **Verbosity**: "toooooo much text just tell me what is the verdict" (L1062, 09-26); "Still don't get the points. You're being so useless and cluttered" (10-03); handoff rule "Nebi got lost in long messages on 2 Oct: lead with what you need from him, one decision at a time, recommendation first" (`HANDOFF-2026-10-03-boss.md:41`); memory `ecommerce-workspace/memory/answer-questions-first-plainly.md:13-16` quotes "It's small but unclear. When it's not unclear, it's too much. You have to pick a balance." Final assistant message length: median 284 chars, p90 2,254.
- **"be clear / what do you mean / i don't get"** appears in 43 of 636 prompts; "too much text / clutter / in short" in 14.
- **Status line / mods**: after the first mod build: "in short what did you add how do i notice" (L1424, 10-02 13:25) and "Whatever we have right now is a bit mid" (L1453). No complaint names the plan rail specifically (unconfirmed either way).
- **Clutter visible in his screenshot** (a409cdf5 image, 10-03): "Opus 5.5 (1M context) | ctx 45% (1M) | eff:xhigh | 5h:8% | ⌥ theme-revamp"; "▶▶ bypass permissions on (shift+tab to cycle)"; "▲ nebi-constellation: ⌁ 3 need you · 1 working" on every split; "nebi-beacon: plugin.json changed — reloaded (modules: ... 6 hooks ...)"; "recap: ... (disable recaps in /config)"; "Baked for 1m 23s · done 1:57 PM"; "new task? /clear to save 445.8k tokens"; "✓ Update installed · Restart to update" (twice); Write preview with "… +89 lines"; workflow bar "○ bol-dev-round ████ 16/17 · 2h49m · ↓ 1.8m tokens".
- The "(1M)" after the ctx figure is drawn by Nebi's own script: `~/.claude/nebi/statusline.mjs:30` (`size >= 1000000 ? " (1M)"`). The model label comes from the status-line payload.

## 4. Browser complaints

- **Which two browsers**: both are Google Chrome profiles. Chrome `Local State`: Default "nebi" and Profile 3 "Your Chrome" are the only profiles with the Claude extension (fcoeoabgfenejglbffodgkkbkcdhcgfn); Profile 4 "paarline.com" has none. Memory `cnlsneakers/memory/chrome-browser-rules.md:29-31`: RapidSneakers Chrome = Profile 3 = deviceId bbbbbbbb; Default = Nebi's main = aaaaaaaa. Comet and Safari are installed too but no evidence they are used for agent work.
- **His words**: "open it in the other main browser this is the one rapidsneakers is where you opened everything" (L861, 09-23); "do not work in the main chrome browser there is one that is specifically already loged in and made for rapidsneakers" (L994, 09-25); "i dont get why you are working in the rapidsneakers browser and not the main one" (L1085, 09-27); "open it in the right browser i think i just logged into karpet24 as you opened the wrong browser" (L1089, 09-27); "when you opened the artifact you opened it in the wrong browser" (L1331, 10-01); "I'm switching between two browsers depending on what project I am on ... more organized ... (for me and for the agents themselves)" (L1455, 10-03).
- **Why it goes wrong (receipts)**:
  - Device labels swap: aaaaaaaa showed as "Browser 2", then "Macbook chrome", then "Browser 1" (`ecommerce-workspace/memory/karpet24-browser-is-browser-2.md:15`).
  - Silent fallback on reconnect: aaaaaaaa dropped and the session moved to bbbbbbbb (27 Sep 13:25; `failure-log.md:64`; same memory file line 17; `LESSONS.md:121` W5, three receipts).
  - Parallel select + tabs call opened a tab in the wrong Chrome (`failure-log.md:68`); sub-agents drove the main Chrome (`failure-log.md:58`).
  - macOS default browser is Chrome (`LSHandlers` http/https = com.google.chrome) and Chrome's `last_used` profile is Default, so any `open <url>` or auto-opened artifact lands in the main profile regardless of project (inference from these two settings; the Artifact tool's open path was not traced). Memory `chrome-browser-rules.md:20-24`: "a CLI device-login link auto-opened in his default browser got approved as [the CNL account]".
  - `list_connected_browsers` returns [] when the extension is signed in to a different Claude account than the session (`chrome-browser-rules.md:37-39`).
  - Account B starts without browser tools unless `--chrome`: `claudeInChromeDefaultEnabled` is true in `~/.claude.json` and absent in `~/.claude-max2/.claude.json`; session d430ea12 10-01 14:48Z found "No matching deferred tools" for the browser.
- **Scale**: 11,262 Claude-in-Chrome tool calls in the window (main + subagents); select_browser 54x to aaaaaaaa and 27x to bbbbbbbb. About 475 error-ish results: extension disconnected mid-call ~28, "not connected" 12, tab not in group / group gone ~22, timeouts ~18, auto-mode classifier denials (Real-World Transactions, Modify Shared Resources) ~20, "Permission denied for this action on this domain" 6.
- **Approve clicks**: the explicit site-permission ask appears in his prompts as "how do i allowed ur extension on that" and "it says 'no approved sites yet' ... no button for this" (L1035-L1036, 09-26), with the agent asking him to click "Always allow actions on this site" (ecommerce 09-26 15:59). The other "Approve" he meets is the agent-built approval page (screenshot: "open the approval page, Approve or Not now on the 8 items ... press Save answers"). Which one his "Approve button that I would agree with anyway" means is unconfirmed; both stop work for a click.
- **Drifting off point**: "who told you to research about potential ads to make" (L1433, 10-02; `failure-log.md:80`); "stop getting ahead of yourself with big task" (L901, 09-24; memory `late-night-small-steps.md`); "we are going out of bounds again" (L893); W28 "one session takes on 30 different tasks ... getting to 70% context window and then delivering trash AI slop" (`LESSONS.md:142`); 10-03: asked for a prompt, the session ran the work and split it into two prompts (`failure-log.md:81`, L1458 "You gave me two prompts for some reason. Where am I supposed to launch these?").

## 5. Two Claude accounts

- Launcher `~/.local/bin/claude-profile` (python, 2026-10-01) with symlinks `claude-nebi`/`claude-a` (account A) and `claude-omer`/`claude-b` (account B). A runs the default `~/.claude`. B sets `CLAUDE_CONFIG_DIR=~/.claude-max2` and passes `--mcp-config ~/.claude-max2/shared-mcp.json` copied from A's MCP servers. Both add `--dangerously-skip-permissions` unless a mode is given. It prints "Claude Max: Nebi" or "Claude Max: Omer".
- No `CLAUDE_CONFIG_DIR` or claude alias in `~/.zshrc`, `~/.zprofile`, `~/.zshenv` (read 10-03). Agents start B sessions through `node ~/.claude/nebi/term.mjs --tab -- 'CLAUDE_CONFIG_DIR=$HOME/.claude-max2 ... --chrome --name <name>'` (`chrome-browser-rules.md:32-36`).
- Accounts: A and B are two Max 20x accounts in separate organizations, each with its own Chrome pairing (account, organization, domain and device IDs redacted; read from each config dir's `.claude.json`).
- Shared through symlinks in `~/.claude-max2`: settings.json, CLAUDE.md, hooks, skills, plugins, projects, history.jsonl, output-styles, nebi (so `~/.claude/nebi/beacons/` holds beacons of both accounts). Not shared: `.claude.json`, `sessions/` (so ListAgents/SendMessage cannot see the other account; `chrome-browser-rules.md:35-36`), `chrome/`.
- Project split (transcript `ownerAccountUuid`): B owns cnlsneakers (10 sessions, plus 6 mixed); A owns ecommerce-workspace (25), Karpet24 (7), nebi-skill (7), MeiMei (2).

## 6. Mods and commands he actually uses (counts)

| Thing | Count in window | Receipt |
|---|---|---|
| `/fleet`, `/sessions`, `/aside`, `??` prompt, `/lock`, `/redbutton`, `/wispr` typed by him | 0 each | history.jsonl and `<command-name>` in transcripts |
| `/plugin enable cc-plugin-you-should-know@builtin`, `/reload-plugins` | 1 each | L1452; transcript cmds |
| Plan rail tool `mcp__nebi-plan-rail__plan` (called by the model) | 23 calls in 5 sessions (f84bfc32 6, a409cdf5 6, b8afeb91 5, a961e5fc 4, 3c0d8d73 2), plus 3 in the helm session | grep of transcripts |
| Red Button denials of sub-agent `rm` | 4 | "Nebi's Red Button blocks sub-agents from rm" |
| Mod reload notices in transcripts | 14 | "nebi-*: plugin.json changed — reloaded" |
| Beacon files live now | 8 (3 real `need`) | `~/.claude/nebi/beacons/` |
| Wispr glossary entries | 8 (scapling, ultra code, cloud code, tick hub, nebby ...) | `~/.claude/plugins/store/nebi-wispr_nebi-mods-*.json` |
| PushNotification since 10-02 14:00 | 10 calls vs 31 need-you turn-ends | transcripts; rule is in the uncommitted `claude-home/output-styles/nebi.md` diff |
| Built-in commands: `/usage` 74, `/effort` 33 (Ultracode), `/new` 32, `/clear` 32, `/rename`+`/name` 12, `/add-dir` 4, `/mcp` 4 | | history.jsonl |

Mods were created 2026-10-02 11:04-12:03 (file birth times in `mods/*/hooks/register.tsx`), so the window for mod use is about 28 hours. All eight are enabled user-wide (`enabledPlugins` in `~/.claude/settings.json`).

## 7. Requests he repeats that a mod could serve

| Repeated request | Count | What could serve it |
|---|---|---|
| `/usage` (checks limits) and talk of "weekly limit" | 74 + 98 prompts mention limit/usage/weekly | Status line shows only 5h (`statusline.mjs:38-40`); add the weekly figure there |
| `/effort Ultracode` plus "Ultracode" in the first prompt | 33 + 71 | Binary says "Ultracode on (this session only)"; a session-start default would remove the ritual (persistent setting unconfirmed) |
| "Make a handoff" | 54 | One-key handoff that writes the checkpoint and gives one paste-ready prompt (L1458 wants exactly one) |
| "Be clear / what do you mean / I don't see the questions" | 43 | One pinned open-asks list per session, restated in full, no answer menu |
| "What did you change / where are you / what's next" | 27 | A per-session "since you left" line built from the turn-end statuses |
| "Context is X%, new session?" | 36 | Context nudge only near a real threshold; the "new task? /clear to save 445.8k tokens" hint is not it |
| "Is it still working / how much longer" | 34 replies to `⏳` turns | Background job list with names and ETA, and a done signal when the last one ends |
| "Which session opened this terminal / don't open sessions" | 52 prompts mention other sessions/terminals/tabs | Fleet view that names who launched what; ask before opening a Ghostty tab |
| "Right browser" | 13 | Per-project browser binding (profile + deviceId + account) checked before every browser step and every artifact open |
| `/rename` or `/name` | 12 | Auto-name sessions from the handoff role (rs-boss, k24-bol) |

## Build implications (for the helm)

- The signal to protect is "this session needs you, here is the one question in full". Data favours a blocking, in-terminal question with no pushed options; it disfavours sending him to a page. If a page is needed, the in-terminal ask should still carry the question.
- One cross-session list of open asks matters more than any per-session decoration: at any moment 2-3 sessions are in `need` while he types in another one.
- Fix the Stop hook's count so artifact watchers do not count as work (`verify-before-stop.mjs:86-91`), or every "done" stays ambiguous.
- Browser identity must be per project and survive reconnects; artifact opens must target the project's Chrome profile (and account).
- The mods' own commands are unused, so value has to be passive and visible without learning a command.

## Unconfirmed

- Whether he reads or answers bridged sessions in the Claude desktop app or on the phone (no remote marker on prompts; `origin.kind:"remote"` in the binary belongs to remote tool calls, not prompts).
- Whether `??` prompts dropped by nebi-aside are still written to history.jsonl (if not, `??` use could be undercounted; nebi-aside itself keeps no persistent log that I found).
- Which "Approve" he meant in the brief (extension site permission vs agent approval page).
- How the Artifact tool opens a page (system `open` vs another path); the wrong-profile mechanism above is inferred from the default-browser and Chrome last-used settings.
- Whether a persistent Ultracode default exists (only `ultracode*` state keys found in the binary).
- Discovery folder `research/2026-09-22-discovery/raw/` holds Reddit/X scrapes of other people's posts, not Nebi's usage; not used here.
