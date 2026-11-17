# Usage lane: verifier verdicts

Verifier run: 2026-10-03, 13:05-13:25Z. Read-only. I re-derived each number with my own scripts. I did not re-run the lane's scripts, except where I needed to find which definition a number came from. Scripts are in the helm scratchpad at `.../5376e9a8-.../scratchpad/uverify/`: `v1.py` (turn-ends, Stop hook, need-you gaps), `ask.py` (AskUserQuestion), and `bin.txt` (`strings -n 8` of the 2.1.288 binary). The live sessions keep writing, so I re-ran the counts at the lane's snapshot (12:50-12:52Z) where it mattered.

## Verdict table

| id | verdict | short reason |
|---|---|---|
| usage-1 | partly | Page asks do wait longer, but 14.8/183.5 depends on the definition (the word "page" or "artifact" in the last 220 chars). Other definitions give a median of 8.8-9.4 min. Only 4 of 179 tails contain an actual artifact link. |
| usage-2 | confirmed | Exact: 32 calls, 72 questions, median 2.9 min, max 15.7 min, 0 over 30 min, 44 picked (37 of them Recommended), 28 typed his own answer. |
| usage-3 | partly | The percentages hold (47/32/19), but the counts are inflated. The lane's script drops peer messages (isMeta), so 208 turns started by other sessions are counted as his. |
| usage-4 | partly | 313 turns were started by task-notifications, not 381 (⏳181, ❓78, ✅30, none 24). Separately, 208 turns started by peers ended ❓ 68 times. |
| usage-5 | confirmed (minor count fix) | The binary confirms the mechanism: watchers are monitor_ws "running" tasks, and the hook payload drops the `ambient` flag. The exact message appeared 777 times in 56 sessions at the snapshot (789/59 now). The lane's 788/63 also counted 11 soft-check records. 98 of 931 turn-ends match the lane's watcher regex; precision is about 11 of 12. |
| usage-6 | confirmed | 51cec88e need since 11:20:52Z (97.5 min before 12:58:21Z) and b7c547c8 since 11:57:55Z (60.4 min). 3c0d8d73 has since rewritten its beacon (still need, Woondeals ask). HANDOFF:56 matches. At 13:09Z a 4th need appeared (b8afeb91, trigger.si). |
| usage-7 | confirmed | Median 2, p90 4, max 9, 45 of 269 buckets at 4+. Peak 10-02 10:45 CEST had the same 9 sessions. My counts: 7-14 sessions per day, median 3 typed-into sessions per hour (max 7). |
| usage-8 | confirmed | At the snapshot: cli 76, sdk-cli 22, claude-desktop 1, of which 56 cli bridged. Desktop session createdAt 2026-09-24T11:16:21Z, lastActivity 9 s later. remoteControlAtStartup true. Human-origin records carry no remote marker. |
| usage-9 | confirmed (stale now) | At 13:09Z A has the same 5 sessions. B now has 6: rs-growth was added. Fields name, cwd, status, bridgeSessionId and entrypoint cli are all present. |
| usage-10 | confirmed (nuance) | The launcher adds --dangerously-skip-permissions only when no --permission-mode is given, the command is not administrative, and the session is not --restricted. With an explicit mode it adds --allow-dangerously-skip-permissions instead. B regenerates shared-mcp.json from A's mcpServers on every launch. The rc files have no CLAUDE or alias lines. |
| usage-11 | confirmed | Symlinks as listed, plus CLAUDE.md, agents, commands, rules, file-history, handoffs, paste-cache and mcp-servers. `.claude.json`, sessions/ and chrome/ are real directories. Binary: the session registry is `CLAUDE_CONFIG_DIR ?? ~/.claude` + `/sessions`, so ListAgents only sees its own account. |
| usage-12 | confirmed (nuance) | Orgs, domains and pairings match. The split only holds since 10-01: cnlsneakers has 4 A-only sessions (09-14..09-28) and 6 mixed sessions. |
| usage-13 | confirmed | Local State profiles as stated. The extension is present only in Default and Profile 3. Extension storage holds aaaaaaaa in Default and bbbbbbbb in Profile 3. Both accounts' `chromeExtension.pairedDeviceName` read "Browser 1". |
| usage-14 | confirmed | L861, L994, L1085, L1089, L1331 and L1455 read as quoted. My regex finds 12 prompts. |
| usage-15 | confirmed | karpet24-browser-is-browser-2.md:15 and :17, failure-log :58, :64 and :68, LESSONS:121 W5 all read as quoted. |
| usage-16 | partly (mechanism now traced) | Binary: artifact auto-open calls `bxr(url)`, which runs `$BROWSER url` or `open url` on darwin. LSHandlers http/https point to com.google.chrome. But Chrome chooses the profile, and Profile 3 had a newer active_time than Default when I checked, so "always Default" is unconfirmed. |
| usage-17 | partly | First half confirmed in the binary: an absent `claudeInChromeDefaultEnabled` means off unless `--chrome` or `CLAUDE_CODE_ENABLE_CFC`. The d430ea12 14:48:41Z ToolSearch "No matching deferred tools" is confirmed. The `[]` claim when the extension is signed into the other account rests only on a memory note. |
| usage-18 | confirmed | 0 for /fleet, /sessions, /aside, ??, /lock, /redbutton, /wispr and /plan-rail since 10-02 09:00Z, in both history and transcripts. /plugin 1 and /reload-plugins 1. File birth times 11:04-12:03. |
| usage-20 | confirmed | register.tsx:55, :184 and :449-468, and parts.ts:201-221 read as cited (the live 0.2.1 copy matches the repo). The screenshot shows the card repeating the reply's 3 options plus "0: dismiss". L1453 quote matches. |
| usage-21 | confirmed | L1113, L1115, L1421, failure-log:65 and output-style:23 match, and commit f61179c is dated 2026-09-27 19:52 +0200. |
| usage-22 | partly | Quotes confirmed (L893, inbox #21 dated 10-01, inbox #26 dated 10-03). No saved script backs "27": my regexes give 15 to 40. |
| usage-23 | confirmed | L1106, L1339, L1373 and failure-log:81 read as quoted. |
| usage-25 | partly | /usage 74 is confirmed. The 98 limit/usage/weekly prompts include those 74; only 25 others mention limits. statusline.mjs:38-40 shows only five_hour, while the payload also carries `rate_limits.seven_day` (binary). |
| usage-26 | confirmed (+ root cause) | statusline.mjs:30 adds " (1M)", and :16 prints display_name as is. Root cause of "(1M context)": settings.json `model: "opus[1m]"`. The binary appends "(1M context)" to [1m] model names. |
| usage-28 | partly | L1062, L1456, HANDOFF:41 and the memory file's lines 13-16 confirmed. 284/2254 is the last text block of the 383 turn-ends he replied to. Across all 928 CLI turn-ends it is a 212 median and 1,014 p90. The 43 count is regex-dependent (34 to 49 in my runs). |

## Load-bearing corrections

- **Peer turns.** Other sessions' SendMessage deliveries are `isMeta: true` with `origin.kind: "peer"`, and the lane's `next.js` skips every `isMeta` record. At the snapshot, of 914 CLI turn-ends: 393 were started by him (⏳186, ❓120, ✅77), 313 by task-notifications (⏳181, ❓78, ✅30) and 208 by peer messages (⏳111, ❓68, ✅24). After a ⏳ end, the next event was a task-notification 263 times, a peer message 108 times and his own prompt 107 times.
- **Page vs chat asks.** On the lane's own `turns.json`, `\bpage\b|artifact` on the 220-char tail reproduces n=40, median 14.0 and p90 180.2. `page|artifact` gives n=46, median 9.4 and p90 115.9. My pipeline, counting need-you turns directly followed by his prompt, gives page n=49, median 8.8, p90 116, 15 over 30 min, against chat n=107, median 3.5, p90 28, 10 over 30 min. The direction is stable: page asks wait about 2.5x longer at the median, with about 30% over 30 min against about 10%.
- **Stop hook count.** The exact text "N background task(s) still running — wait" appeared 777 times in 56 sessions at 12:52Z. The lane's `/background task/i` regex also caught 7 "Soft check (§3)" records, 3 others and 1 §6 record.

## Missed by the lane (receipts)

1. **Why the watcher counts as running, and an exact fix.** The Stop hook input is built as `background_tasks: Gqt(h.taskRegistry.all())` (binary offset ~22429160). `Gqt` keeps tasks that pass `hg`: status running or pending, and not foreground (~18143080). It emits `{id, type, status, description}`, adds `server`/`tool` only for monitor_mcp, and never passes `ambient`. Artifact live-update watchers are `type:"monitor_ws", status:"running", ambient:true` (~27266742), and the SDK's own docs call them "not activity ... hosts should exclude them" (~13889746). `f8e` maps monitor_ws to "monitor" (~18142437). So in `verify-before-stop.mjs` a task with `type === 'monitor'` and no `server` field is a watcher and can be skipped.
2. **Artifact auto-open can be turned off or routed.** The artifact surface calls `bxr(url + ?via=auto_preview)`, imported from the one opener module (~43572723). `bxr` runs `$BROWSER <url>`, or `open <url>` on darwin (~26625551). Auto-open is skipped when `CLAUDE_CODE_ARTIFACT_AUTO_OPEN` is `0`/`false`/`no`/`off`, and in desktop, remote, vscode, background or teammate sessions (~43572181). So `BROWSER` set per account in `~/.local/bin/claude-profile` (for example a script running `open -na "Google Chrome" --args --profile-directory="Profile 3"`) would route artifact opens to the right profile. Untested.
3. **Chrome for account B** can be switched on without `--chrome` through `CLAUDE_CODE_ENABLE_CFC=1` (binary `I$t`, ~18994580), which the launcher could set.
4. **"(1M context)"** comes from `model: "opus[1m]"` in `~/.claude/settings.json`. The status-line script can strip it from `display_name` without changing the model.
5. **Typed answers on the Ask card are often confusion, not overrides.** 9 of his 28 typed answers push back on the question itself: "i dont understand this one", "be more clear on this question", "What??? WHat do you recommend".
6. **The output style itself pushes answer menus.** `output-styles/nebi.md:23` requires restating "the options, and your recommendation" above the status line. The beacon card then repeats them, so the menu shows up twice.
7. **The weekly limit is available.** The status-line payload has `rate_limits.seven_day`, and the binary's own statusline help shows a "5h + 7d" example.
8. **Both config dirs label their paired browser "Browser 1"** (`chromeExtension.pairedDeviceName`), so labels collide across accounts.
9. **The live state moved.** At 13:09Z, 4 beacons were in need (b8afeb91 nebi-skill, trigger.si backorder, was added) and account B had 6 live sessions.
