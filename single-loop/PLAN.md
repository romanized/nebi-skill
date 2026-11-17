# Single loop plan: nebi fleet

Audit date: 2026-11-16. Repo: nebi-skill. Model for every variant: `claude-opus-5-5`. Kit: `.claude/skills/single-agent-loop` (anthropics/single-agent-loop-kit at c437962), following Anthropic's 2026-10-22 article "Building agents: when to fold subagents into your main agent loop". Nebi pre-authorised the whole run, so the kit's check-ins are written here instead of stopping.

## Status

- [x] Verdicts from 30 days of real traffic (`inventory.tsv`, `scripts/traces.py` → `traces.jsonl`).
- [x] Eval built and baseline measured: 13 tasks x 2 reps, 26/26.
- [x] Folds run one at a time (`eval/folds.mjs`, decisions in `results/folds.log`).
- [ ] Large tasks that the doctrine itself routes to the scout and builder (the eval has no signal on those two yet).

## Verdicts

Call counts are from the first `traces.py` run on 2026-11-16. The committed `traces.jsonl` was regenerated after the script began skipping eval folders and counts the review agents run later that day: within 3% (builder 789, checker 523, scout 175, workflow 1,396).

| Agent | Verdict | Why | Evidence | Confidence |
| --- | --- | --- | --- | --- |
| lead | main | every session | 345 sessions in 30 days | high |
| nebi-checker | keep (as-tool) | The one route the eval exercises; denied, the lead swapped in a heavier agent every time | l3 with the checker: 27k-68k input tokens per review (mean 57k), 2-4 model calls, starting at 11k. Denied (v2, v3): nebi-builder or general-purpose at 191k-327k (mean 258k, 4.5x), starting at 34k or 56k. Account-adjusted cost premium about +$0.17 a run (+15%): v2/v3 ran on account a, which costs 1.32x the team account on same-route tasks | medium |
| nebi-builder | keep (as-tool), untested here | Never dispatched in the eval; in real work it runs parallel lanes | 767 calls, 92% overlap another agent; 8% of calls run past 100 model calls and take 33% of its tokens (40 of those 62 in MeiMei-website) | medium |
| nebi-scout | keep (as-tool), untested here | Never dispatched in the eval; cheapest agent per call | 172 calls, 0.8% of sub-agent tokens, 89% overlap | medium |
| general-purpose, fork | flag (built-in) | Heaviest context per call; also what the lead falls back to when a lean agent is denied | median 179k / 286k tokens per model call | medium |
| workflow-subagent | keep (owner opt-in) | Parallel by design | 1,383 calls, 62% of sub-agent tokens, 96% overlap; 1,288 calls before 11-10 and 95 since, because the lean agents replaced it, so the caps were never tested on it | medium |

## Evals

`eval/tasks.json`: s1-s4 research (scout's job), c1-c3 review of a builder's change with one planted bug (checker's job), b1-b3 builds graded by hidden tests (builder's job), l1-l3 chain tasks added after the first baseline showed no sub-agent routes (two-repo audit, three independent builds, build then independent review). Graders are deterministic (`eval/run.mjs`): name recall, regexes with digit-safe numbers and a veto on "no bugs" answers, and hidden `node --test` suites. Totals come from each run's `modelUsage` (every model, sub-agents included); `by_agent` comes from transcripts.

Run: `node eval/run.mjs --variant <name> --work <scratch> --earshot <clone> --te <clone> --reps 2 -j 3 [--deny a,b]`; folds: `node eval/folds.mjs ... [--kept a --last vN --next N]`; regrade stored runs after a grader fix: `node eval/run.mjs --regrade --variant <name> --work <scratch>`. Results: `results/<variant>/results.jsonl`, `compare.txt` (the kit's `compare.py`).

Main metric: tasks complete (pass in both reps). Fold rule: a fold holds only if no task passes in fewer reps, the folded agent was dispatched in the variant it is compared with, and the lead did not swap in another agent.

## Results

| Variant | Account | Denied | Pass | Sub-agent routes | Decision |
| --- | --- | --- | --- | --- | --- |
| baseline | team | none | 26/26 | nebi-checker on l3 (2/2) | — |
| v1 | team | nebi-scout | 26/26 | nebi-checker on l3; web-fetch on s3 (2/2, rep-to-rep variation, also seen in the probe) | NO SIGNAL |
| v2 | a | + nebi-checker | 26/26 | l3: nebi-builder (rep 1), denied checker then general-purpose (rep 2) | REROUTED, checker stays |
| v3 | a | + nebi-builder | 26/26 | l3: general-purpose 2/2 ($1.17, $1.23) | NO SIGNAL (builder never dispatched before; v1 and v3 would not run under the current folds.mjs) |

Total spend $75.22 for 104 graded runs: baseline $16.03, v1 $16.57, v2 $21.20, v3 $21.42 (mean $0.62 on the team account, $0.82 on account a). Latency rose 15-42% on 10 of 13 tasks in v1, including unchanged routes: API load from other live sessions. Account a starts every session with 481 tools (453 claude.ai connector tools; Higgsfield 175, Shopify 48, Canva 43, Roblox Studio 38, Supabase 35) against 82 on the team account, and costs 1.32x on the 11 tasks with no sub-agent: compare costs only within an account.

## Limits

- `claude -p` runs, not interactive sessions; the core still names the denied agents, so a folded variant tests "agent unavailable", not "agent never existed" (v2 rep 2 spent a call on the denied checker).
- At this task size the lead works as a single loop and never chooses the scout or builder, so those folds are untested. Real traffic shows both used heavily in long, parallel sessions.
- Two reps per task; one account switch mid-run (usage limit), so v2 changed both the denial and the account.
- No headroom: every variant passed 26/26, so "stop if a task gets worse" had nothing to catch, and l3 is graded by b1's hidden test, not by whether the review ran or found anything.
- v1 and v3 cost $37.99 on folds the baseline had already shown could not produce a signal; `folds.mjs` now skips a fold whose agent the kept variant never dispatched.

## Next round

- Ask c1-c3 for a final `BUGS: <n>` line and s2/s4 for one `name = value` line per item, and grade those instead of free text (the current regex veto misses "I found no real bugs ..." mid-line).
- Give l3 a spec trap first builds miss in a known share of reps, and grade both the trap and that a fresh-context review ran.
- Add tasks drawn from sessions where the scout and builder really fire, hard enough that the baseline is below 100%.
- Run every variant on one account; record the init event's tool count per run.

## Findings outside the fold question

In `FINDINGS.md`: the lead's own sessions use more tokens per call than the fleet, eleven builders ran past the 150-turn cap after repeated resumes, red-button held `rm -rf "$d"` on a `mktemp -d` folder inside a `for` loop for its full 10 minutes in a headless run, a docs lookup costs twice as much through the web-fetch agent as through `curl` of the `.md` page.
