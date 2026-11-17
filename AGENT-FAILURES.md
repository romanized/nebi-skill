# Agent failures

I run Claude Code agents every day on client sites, shops, games and this repo. This file lists what went wrong between July and November 2026, how each failure surfaced, and what changed because of it.

Every entry comes from a dated record: my failure log (177 lines, kept private), the feedback inbox my prompt hook fills (110 lines), 136 session checkpoints, and the benchmark and research notes in this repo. I merged repeats into one entry per pattern and put the most recently seen first. Client, account and machine names are removed. Where nobody counted before and after a fix, the entry says *observed, not measured*.

## Patterns

- **Claiming done without proof is the most common failure:** about 25 times from July to November. A Stop hook catches most cases, but the habit has not gone away.
- **The worst incident was a single command.** A sub-agent's `pkill` killed every other Claude session and my browser tabs. A hook now blocks that command shape.
- **A few long runs drive the token cost.** Over one month, 8.4% of sub-agents ran 100 or more requests and used 40.4% of 24.45B tokens. Turn caps helped, but long builder runs still happen.
- **Agents polish the part they can check while the whole stays broken or unbuilt.** They also prove the detail they tested, not what I will actually look at.
- **Agents trade my instruction for an easier goal.** They write a document about the job instead of doing it, add limits I never set, or ask me what they could look up.
- **The agent's own numbers need an independent check.** In November a fresh-context review found a 90× token undercount and costs compared across two accounts as if they were equal.
- **Permission gates shift under the agent.** A classifier started refusing one Saturday, and a safety hook prompted under bypass mode. I have one dated change and no week-by-week measurement.
- **Writing a rule down did not change a habit.** By 07-23 the log said the done-claim habit "needs a mechanical guard, not just intent". After the seventh repeat (08-17) it concluded that logging was not working as a correction.

| # | Pattern | Last seen | Times | Status |
|---|---|---|---|---|
| 1 | [Shaky numbers in its own measurements](#1-shaky-numbers-in-its-own-measurements) | 2026-11-16 | 3 passes | fixed |
| 2 | [Runaway agents burning tokens](#2-runaway-agents-burning-tokens) | 2026-11-16 | measured 3 times | mitigated |
| 3 | [Wrong model or effort](#3-wrong-model-or-effort) | 2026-11-16 | 15 | mitigated |
| 4 | [Confirmation gates that shift week to week](#4-confirmation-gates-that-shift-week-to-week) | 2026-11-16 | 12 | open |
| 5 | [Proving the detail, missing the whole](#5-proving-the-detail-missing-the-whole) | 2026-11-13 | 7 | open |
| 6 | [Swapping my instruction for an easier goal](#6-swapping-my-instruction-for-an-easier-goal) | 2026-11-13 | 16 | mitigated |
| 7 | [Stating facts it had not checked](#7-stating-facts-it-had-not-checked) | 2026-11-13 | about 24 | open |
| 8 | [Mistakes late in long sessions](#8-mistakes-late-in-long-sessions) | 2026-11-13 | 4 | observed |
| 9 | [Asking for what it could find itself](#9-asking-for-what-it-could-find-itself) | 2026-11-12 | 16 | open |
| 10 | [Replies that hide the state](#10-replies-that-hide-the-state) | 2026-11-12 | about 20 | mitigated |
| 11 | [Claiming done without proof](#11-claiming-done-without-proof) | 2026-11-10 | about 25 | mitigated |
| 12 | [Destructive or risky commands](#12-destructive-or-risky-commands) | 2026-11-10 | 13 | mitigated |
| 13 | [Two agents writing one tree](#13-two-agents-writing-one-tree) | 2026-11-10 | 11 | mitigated |
| 14 | [Wrong browser profile or account](#14-wrong-browser-profile-or-account) | 2026-11-10 | 14 | mitigated |
| 15 | [Inventing limits I never set](#15-inventing-limits-i-never-set) | 2026-11-09 | 3 | open |
| 16 | [Secrets in transcripts and logs](#16-secrets-in-transcripts-and-logs) | 2026-10-12 | 4 | open |
| 17 | [Building extras before the basic job](#17-building-extras-before-the-basic-job) | 2026-09-24 | 2 | mitigated |
| 18 | [Complaints that never reached the log](#18-complaints-that-never-reached-the-log) | 2026-09-22 | 38 turns | fixed |
| 19 | [Skipping its own method when I give an order](#19-skipping-its-own-method-when-i-give-an-order) | 2026-09-01 | eval | mitigated |

---

### 1. Shaky numbers in its own measurements

- **Seen:** 2026-09-08, 2026-09-23 and 2026-11-16, once per measurement pass.
- **What the agent did:** In the November sub-agent audit it counted output tokens about 90 times too low and compared costs between two accounts as if they cost the same. It also changed a config default based on a statistic it had misread, and spent $37.99 of a $75.22 eval budget on two runs the baseline had already shown could not answer anything. Earlier passes had a checker find three ledger rows that claimed more than the evidence showed (09-23), and the agent reported hooks missing from source code before reading the live files (09-08).
- **Why it matters:** decisions get built on numbers nobody checked, and money goes to experiments that cannot answer.
- **How it was caught:** two independent review rounds by fresh-context agents (11-16), a checker (09-23), and the agent's own re-read (09-08).
- **Fix:** totals now come from the API's per-run usage record, all 104 eval runs were regraded, the misread default was reverted, and the fold script skips any run whose agent the baseline never used ([single-loop/PLAN.md](single-loop/PLAN.md), [`e2aa3d8`](https://github.com/romanized/nebi-skill/commit/e2aa3d8)). **Measured afterwards:** the regrade, yes. The no-signal guard has not met a new eval yet.
- **Status:** fixed.

### 2. Runaway agents burning tokens

- **Seen:** measured on 2026-10-03 (30 days), 2026-11-10 (31 days) and 2026-11-16 (30 days).
- **What the agent did:** Over 31 days, 274 of 3,260 sub-agents (8.4%) ran 100 or more requests and used 40.4% of 24.45B tokens. The largest ran 542 requests at a 728k-token context. In one project, agents called the browser-listing tool 513 times in 30 days, one sub-agent 59 times, because the project's docs told them to check the browser before each step. In November, 11 builders ran past their 150-turn cap because the lead kept resuming them; the largest made 460 model calls over 5.45 hours and compacted at least three times.
- **Why it matters:** a looping agent re-reads its whole context on every turn, so a handful of long runs sets the bill.
- **How it was caught:** transcript-mining scripts, after the fact. Nothing flags a runaway while it runs.
- **Fix:** turn caps on the lean agents (builder 150, scout 60, checker 80) and a "stop a runaway early" rule on 11-10 ([`39dc073`](https://github.com/romanized/nebi-skill/commit/39dc073)); one browser per account, so there is nothing to choose ([`714df84`](https://github.com/romanized/nebi-skill/commit/714df84)); "resume a capped builder at most once" on 11-16 ([`e2aa3d8`](https://github.com/romanized/nebi-skill/commit/e2aa3d8)). **Measured afterwards:** workflow-agent calls fell from 1,288 to 95 after 11-10, mostly because lean agents replaced them. Over the same 30 days, 62 builders still ran past 100 model calls ([single-loop/FINDINGS.md](single-loop/FINDINGS.md)). Every browser listing now shows one device per account; nobody has recounted the calls.
- **Status:** mitigated. Long builder runs are open.

### 3. Wrong model or effort

- **Seen:** 2026-09-25 to 2026-11-16, 15 times.
- **What the agent did:** It dispatched sub-agents on a model I had ruled out, pinned an effort level without telling me, and let every sub-agent copy the session's effort, so all four scouts of one session ran at the highest level. On 11-12 and 11-13, dispatches that asked for Opus ran on Fable and hit Fable's usage limit. On 11-16 one session read my spoken "Mythos" as a mishearing of "Fable".
- **Why it matters:** the model and effort set both cost and quality, and a silent swap breaks my trust in every report that follows.
- **How it was caught:** me, and transcripts that record which model each agent actually ran.
- **Fix:** settings pin the sub-agent default model (`CLAUDE_CODE_SUBAGENT_MODEL`, 11-10, [`39dc073`](https://github.com/romanized/nebi-skill/commit/39dc073)). The lead now picks an effort per dispatch, and a model I name goes on the dispatch tool's own parameter (doctrine §0 and §1). **Measured afterwards:** since 11-10 the lead set an effort on 178 of 178 builder dispatches made through the Agent tool ([single-loop/FINDINGS.md](single-loop/FINDINGS.md)).
- **Status:** mitigated. On 11-14 the inverse happened: a dispatch that named Fable ran on Opus.

### 4. Confirmation gates that shift week to week

- **Seen:** 2026-09-23 to 2026-11-16, 12 times.
- **What the agent did:**
  - **09-23:** in auto mode, a classifier refused real-world transactions without ever prompting me.
  - **10-03:** a test typed into the "Make auto mode your default?" dialog and switched my default from bypass permissions to auto.
  - **10-04:** the agent told me to change permission mode, but the refusals came from a classifier that had started running on top of it on Saturday 3 October.
  - **10-30:** I wrote "dude bypass permissions is on, stop asking me this".
  - **10-31:** the Red Button safety hook prompted under bypass permissions and blocked me during an overnight run.
  - **11-16:** the same hook held a harmless `rm -rf` on a fresh temp folder for its full 10 minutes in a headless run.
  - My own rule on re-asking open questions changed twice in one week: I added it on 09-27 ([`f61179c`](https://github.com/romanized/nebi-skill/commit/f61179c)) and retired it on 10-03, after it collided with "don't tell me what to answer".
- **Why it matters:** the same request gets a different answer from one week to the next, so neither the agent nor I can plan around it.
- **How it was caught:** me, and the failure log.
- **Fix:** the default mode was set back; a session-guard mod answers the auto-mode offer with "No, keep bypass permissions" (covered by the test suite); Red Button rules say to use fresh folders and no `rm -rf` outside `/tmp`, and it fills in variables the script set before it matches ([`17b32db`](https://github.com/romanized/nebi-skill/commit/17b32db)). **Measured afterwards:** observed, not measured. The only dated change is 3 October.
- **Status:** open. The 11-16 hold shows that Red Button still stops harmless cleanups.

### 5. Proving the detail, missing the whole

- **Seen:** 2026-09-15 to 2026-11-13, 7 times.
- **What the agent did:**
  - **Launch work:** for three days it ran extra checker and polish rounds and wrote legal pages instead of fixing the two things blocking go-live.
  - **Ad project:** it spent 402 of 600 generation credits and about two days polishing the first ad, while ads 4 to 6 of a 12-ad plan never got made.
  - **Website:** it proved a visual change at 390 and 1440 pixels wide, with motion shown as stills, while I review at about 1288 pixels. Every gate passed, and I called the live site ruined.
  - **Sweeps:** they read error lines and walked past the warnings.
  - **Everyday tool:** a session kept polishing a new button instead of fixing the tool I use every day.
  - **Design project:** three passes shipped work I disliked, partly because no lane was allowed to look at its own result. The only proof was the type checker, lint and contract tests.
- **Why it matters:** green checks on the wrong thing turn into false confidence, and the credits and days are gone.
- **How it was caught:** me, every time.
- **Fix:** draft every planned piece before polishing any, then polish on data; the lead looks at real screenshots before a deploy; visible changes get proved at the size I actually use. **Measured afterwards:** observed, not measured.
- **Status:** open. Last seen 11-13.

### 6. Swapping my instruction for an easier goal

- **Seen:** 2026-08-05 to 2026-11-13, 16 times.
- **What the agent did:**
  - **Migration (08-05):** I asked for my projects to be migrated. Three sessions each delivered a reusable prompt instead, and none migrated a project.
  - **A prompt request:** one session ran the whole workflow instead of writing the prompt I asked for.
  - **Named skills (09-22):** I named skills to install, and the agent wrote 327 lines of notes and eval cases about not installing them. The installs it did make landed only in the other harness.
  - **My wording:** a checker reverted it.
  - **A clip (11-13):** a later round added a credit to a clip I had said to use as it is.
  - **A standing rule:** once, the agent declined my direct request because it ranked a standing rule above it.
- **Why it matters:** this is goal drift. The agent replaces my goal with one it finds easier or safer.
- **How it was caught:** me. In the checker case, the lead restored my wording.
- **Fix:** doctrine §0 (my direct instruction wins, silently) and §10 (what I name gets installed from its real source, pinned and recorded) ([`1f0382e`](https://github.com/romanized/nebi-skill/commit/1f0382e)). A prompt hook records each complaint ([`648ab8f`](https://github.com/romanized/nebi-skill/commit/648ab8f)). **Measured afterwards:** in fresh-session probes after the §10 change, the design skill loaded 2 of 2 times (was 0 of 1) and the copy skill 1 of 2 (was 0 of 1). These are small samples ([integration pass](claude-home/nebi/benchmarks/2026-09-22-integration-pass.md)).
- **Status:** mitigated. Still seen in November.

### 7. Stating facts it had not checked

- **Seen:** 2026-08-03 to 2026-11-13, about 15 times, plus 9 guessed timestamps between 2026-09-28 and 2026-10-14.
- **What the agent did:** It told me a hosting CDN does not purge on deploy, which was wrong. It reported a fix as live while the installed version was still the old one, said a job ran in the cloud when it had run in a local worktree, and quoted a price with no source. It also wrote guessed clock times into logs as fact.
- **Why it matters:** I act on what the agent tells me.
- **How it was caught:** me in most cases, and a docs checker for the price.
- **Fix:** the research skill (look it up in primary sources before answering); a sessions rule to say where a job really ran; times come from `date -u` in the same command that writes them. **Measured afterwards:** no.
- **Status:** open. Guessed timestamps have not appeared since 10-14.

### 8. Mistakes late in long sessions

- **Seen:** 2026-10-09 to 2026-11-13, 4 times.
- **What the agent did:** It set a wrong ceiling while its context was high; a sweep after compaction found it. Right after a compaction, it put model names into pushed commits. One session admitted it "reacted to each message instead of planning" as the session grew long.
- **Why it matters:** quality drops late in a session, when the most work is at stake.
- **How it was caught:** a post-compaction audit, and me noticing the drop after a compaction.
- **Fix:** auto-compact at 600k tokens with written compaction instructions ([`a88cc18`](https://github.com/romanized/nebi-skill/commit/a88cc18)). **Measured afterwards:** no.
- **Status:** observed, not measured.

### 9. Asking for what it could find itself

- **Seen:** 2026-09-24 to 2026-11-12, 16 times.
- **What the agent did:** It asked me the same question a third time, asked me to count shelf stock while the stock sheet was already on file, and handed me technical calls that were its job. My reply to one: "why are you asking me you are the head leader".
- **Why it matters:** every needless question parks the work until I come back.
- **How it was caught:** me.
- **Fix:** handoffs list only open questions; memory notes record facts that are already on file; doctrine §4 says to ask once, batched, and only for irreversible or ambiguous calls. **Measured afterwards:** no.
- **Status:** open.

### 10. Replies that hide the state

- **Seen:** about 20 of my messages, 2026-09-27 to 2026-11-12.
- **What the agent did:** It wrote replies where I could not tell whether it was done, still working or waiting on me ("what happened is it done?"). It pointed at questions by count, or moved them onto a separate page.
- **Why it matters:** work stalls while the agent waits for an answer I did not know it needed. Before the fix, a "need you" that pointed to a separate page waited a median 14.8 minutes for my reply (p90 183 minutes; 15 of 40 waited over 30 minutes). A question asked in the chat waited 3.9 minutes, and a native question card 2.9 minutes ([usage research](research/2026-10-03-mods-rework/usage.md)).
- **How it was caught:** me. Transcript mining gave the wait times.
- **Fix:** an output style that ends every reply with one status line and keeps the question in the chat, plus a status-line count of waiting sessions ([`900c138`](https://github.com/romanized/nebi-skill/commit/900c138)). **Measured afterwards:** not re-measured.
- **Status:** mitigated.

### 11. Claiming done without proof

- **Seen:** 2026-07-21 to 2026-11-10, about 25 times. The most common entry in the log.
- **What the agent did:**
  - **Edits:** it claimed done right after editing files, with no fresh check.
  - **A config file:** it called one proven because the file existed.
  - **Tests:** it ran three targeted test files and claimed the suite passed. In a commit message it wrote "52 tests passing" after piping the test run through `tail -3`, which cut off the pass/fail summary. The tree was red.
  - **A dry run:** it counted one as proof when 0 tests had run.
  - **A label:** it said a label "passed both checks" when the code checker had said FAIL.
  - **A worker:** it trusted a worker that reported writing two files that did not exist.
  - **A one-liner:** it shipped a "trivial one-liner" that broke every route of a site for about seven minutes.
- **Why it matters:** a false "done" ends checking, and the bug ships.
- **How it was caught:** mostly the Stop hook, which asks for fresh proof when a reply claims done after edits. Also fresh checkers and a post-compaction audit.
- **Fix:**
  - The Stop hook (July, [`6451ef3`](https://github.com/romanized/nebi-skill/commit/6451ef3)).
  - Gate scripts that fail when the test runner's summary line is missing (11-10).
  - A worker's "written" claim needs a file listing (10-01).
  - Commit messages say "built, proof pending" until the proof has run (10-17).

  **Measured afterwards:** in the blind benchmark, the prompting skill had ended a run with "✅ Done" while it was still waiting for me. After the repair it passed 3 of 3 re-runs, up from 0 of 2 ([blind benchmark](claude-home/nebi/benchmarks/2026-08-31-blind-benchmark.md)).
- **Status:** mitigated, not solved. After the seventh repeat in five weeks (08-17), the log concluded that writing the lesson down was not working.

### 12. Destructive or risky commands

- **Seen:** 2026-09-29 to 2026-11-10, 13 times.
- **What the agent did:** On 10-12 a sub-agent ran `pkill -f` with options after the pattern. macOS read the options as more patterns and killed every other Claude session and my Chrome tabs. Other cases:
  - a machine-wide `pkill -f vitest`
  - a glob that moved a theme's assets folder
  - deleting seven environment variables on a hosting service, which were restored from a backup
  - a probe that locked EUR 38.72 without my yes
  - about 1,000 requests against a live storefront
  - test notifications sent to my phone
- **Why it matters:** one command can wipe out other sessions' work or spend real money.
- **How it was caught:** the damage itself, then the failure log.
- **Fix:**
  - A PreToolUse hook that blocks broad or misordered `pkill` calls, with tests that replay both commands from 10-12 ([`850b250`](https://github.com/romanized/nebi-skill/commit/850b250)).
  - Red Button holds `rm -rf` for review.
  - Rules in every brief: kill only your own PID, and grep the code before deleting a variable.

  **Measured afterwards:** replaying past commands, Red Button's 0.3.0 rules cut 99 holds to 45 ([SOURCES.md](claude-home/nebi/SOURCES.md)). While writing this log I found that the kill guard never ran on Windows, or from any path containing a space: it compared its own URL with a raw path. That is fixed in the same commit as this file.
- **Status:** mitigated.

### 13. Two agents writing one tree

- **Seen:** 2026-08-22 to 2026-11-10, 11 times.
- **What the agent did:** `git add -A` and `commit -a` swept another session's files into its commit. One session overwrote another session's handoff file, which was restored from file history. Messages sent to a finished workflow agent started a second copy of it. Two sessions raced for a browser lock that had no atomic take.
- **Why it matters:** parallel agents corrupt each other's work without noticing.
- **How it was caught:** the failure log. The records do not say who noticed each one.
- **Fix:** commit only your own paths (`git commit -- <paths>`), and give every file one write owner (the orchestration skill). **Measured afterwards:** no.
- **Status:** mitigated.

### 14. Wrong browser profile or account

- **Seen:** 2026-09-25 to 2026-11-10, 14 times.
- **What the agent did:** Agents used my main Chrome or the wrong profile, once against a brief that said no browser tabs at all. On 10-09, a login in the wrong browser re-authorized one Claude profile as my other account. The session noted this without flagging it, and two days of my usage billed to the wrong account.
- **Why it matters:** actions land in the wrong account, and usage lands on the wrong plan.
- **How it was caught:** me ("how am i on the team account here???").
- **Fix:** the launcher prints the signed-in email and warns in red on a mismatch; each project routes to one browser profile, and a guard blocks browser actions on the wrong account ([`714df84`](https://github.com/romanized/nebi-skill/commit/714df84)). **Measured afterwards:** no.
- **Status:** mitigated.

### 15. Inventing limits I never set

- **Seen:** 2026-10-10 to 2026-11-09, 3 times.
- **What the agent did:** It capped a plan at EUR 23 a day on its own, dropped a company from a comparison on its own "same company" judgment, and kept a game's maturity rating at "Mild" as a limit it set for itself. My reply to the first: "WHO AR EYOU TO DECIDE HOW MUCH WE CAN BACK".
- **Why it matters:** scope shrinks without my say. It is goal drift in the other direction.
- **How it was caught:** me.
- **Fix:** none recorded beyond the failure-log lines.
- **Status:** open, observed, not measured.

### 16. Secrets in transcripts and logs

- **Seen:** 2026-10-05 to 2026-10-12, 3 times, plus one found while writing this log.
- **What the agent did:** A checker re-printed a database password in its report. An agent printed base64 fragments of a game-store refresh token. Another screenshotted an open token dialog. While writing this log I found that the feedback hook had stored an app password I pasted, unmasked, in its local inbox.
- **Why it matters:** a secret that reaches a transcript or a log has leaked.
- **How it was caught:** the failure log, and this review.
- **Fix:** the capture hook masks common key, token, email and phone shapes, but not that password format. **Measured afterwards:** no.
- **Status:** open.

### 17. Building extras before the basic job

- **Seen:** 2026-09-15 and 2026-09-24.
- **What the agent did:** A lane named "clean" stripped the sound from my videos, upscaled them, cropped them and shortened them, when the job needed my originals back. In a design project, the third pass added a stamp, a hand-drawn map and a glow effect, which I rejected. The fourth attempt was "deliberately restrained" and deleted two components.
- **Why it matters:** the effort goes into extras while the plain thing I asked for is missing.
- **How it was caught:** me.
- **Fix:** hand back originals untouched, and doctrine §5 (the minimum that solves it, no speculative features). **Measured afterwards:** observed, not measured. The label is mine; the logs never say "overengineering".
- **Status:** mitigated.

### 18. Complaints that never reached the log

- **Seen:** 2026-08-31 to 2026-09-22.
- **What the agent did:** 38 of my complaint turns, across about 36 sessions, went unlogged, while agents admitted a mistake 45 times in 26 sessions. 20 of the log's 28 entries were done-claims the Stop hook had prompted. Two edits had dropped the instruction to add a line to the log.
- **Why it matters:** a failure I complain about never turns into a fix.
- **How it was caught:** a transcript audit on 09-22.
- **Fix:** a prompt hook captures complaints, ideas and named repos into an inbox, and the Stop hook captures the agent's admissions ([`648ab8f`](https://github.com/romanized/nebi-skill/commit/648ab8f)). **Measured afterwards:** replaying old sessions, it captured 37 of 470 turns, about 31 of them real. After review fixes it captured 38 of 468 ([integration pass](claude-home/nebi/benchmarks/2026-09-22-integration-pass.md)).
- **Status:** fixed. While writing this log I found it also tags messages from other sessions and task notifications as my complaints; that is open.

### 19. Skipping its own method when I give an order

- **Seen:** 2026-08-31 to 2026-09-01, in trigger evals on the live skill loader.
- **What the agent did:** When I phrased a request as a direct order, the orchestration skill loaded on 1 of 6 cases where it had to, and the research skill on 0 of 3.
- **Why it matters:** the agent skips the method exactly when I am in a hurry.
- **How it was caught:** trigger evals.
- **Fix:** skill descriptions rewritten as preconditions ("read this before …, not after") ([`b8ac60f`](https://github.com/romanized/nebi-skill/commit/b8ac60f), [`0e971c4`](https://github.com/romanized/nebi-skill/commit/0e971c4)). **Measured afterwards:** orchestration loaded on 4 of 6 must-load cases (11 of 13 overall) and research on 5 of 6 (11 of 12). Neither loaded where it should not (7 of 7 and 6 of 6). A longer second rewrite made both worse (9 of 13, 9 of 12) and was reverted ([blind benchmark](claude-home/nebi/benchmarks/2026-08-31-blind-benchmark.md)).
- **Status:** mitigated.
