# 2026-09-23 dev-log pass: coverage ledger

Base: `f95fad7`. Lead: Claude Code on Opus 5.5 (1M). Discovery: five read-only Sonnet 5 scouts (claude.dev, OpenAI, Cursor/Google/GitHub, open-seo, ecommerce-workspace). The lead read all eight claude.dev posts in full and verified every quote below at the source on 2026-09-23. A first pass landed four core lines; the user judged that too thin, so this ledger accounts for every practice in the posts.

Status key: **added** (this pass, with location), **covered** (already in the pack), **n/a** (reason).

## How we made claude.ai 3x faster in two weeks — 2026-09-23

| Practice | Status |
|---|---|
| Standing brief with responsibilities and an autonomy goal | covered: the core is the standing brief |
| Pick the few journeys that carry most usage, from data; comparable start/end measurements with client and server split | added: `nebi-hillclimb` §1 |
| Baseline first; estimate each project's gain in the target unit and set targets from the sum; leave room for new workstreams | added: `nebi-hillclimb` §1 |
| "What have we not explored? Open to wacky ideas" refresh once targets fall | added: `nebi-hillclimb` §4 Ambition |
| Deterministic lab proxies (instruction counts, React commits, style recalcs, DOM mutations) | added: `nebi-hillclimb` §2 |
| Prove a proxy moves wall-clock before climbing it; unship benchmarks that can't | added: `nebi-hillclimb` §2; core §6 numeric goals |
| Ratchets: CI fails on regression, ceiling lowered when the count drops | added: `nebi-hillclimb` loop step 5; core §6 |
| Measurement is step one of the climb, not step zero | added: `nebi-hillclimb` intro |
| The thread loop: trace → benchmark → PRs sized for review, flags → watch deploy → ratchet or flag off → next spot | added: `nebi-hillclimb` §3 |
| Build telemetry when the user sees what metrics miss (layout shift per region and phase) | added: `nebi-hillclimb` §2 (metric), `nebi-debugging` reproduce-first (check) |
| Red 20/20 on main, green 20/20 on the PR | added: `nebi-debugging` step 4 |
| Fix named causes in batches, then find the next batch | added: `nebi-hillclimb` loop step 7 |
| Keep going after the original request; open new threads for found opportunities | added: `nebi-hillclimb` §4 Direction (lead opens lanes); core §3 keep-going already covered |
| Many narrow threads at once | covered: `nebi-orchestration` lanes and sizing |
| Unit tests before optimizations | added: `nebi-hillclimb` loop step 2 |
| Automated review plus human approval per PR | partly: the user is the human approval; a fresh checker stays on request or for high-risk work per core §1 |
| User-visible risk behind short-lived flags; classify kill switch vs ramp; retire when safe | added: `nebi-hillclimb` loop step 3 and flag line |
| Protect brittle wins with dedicated guardrails | added: `nebi-hillclimb` loop step 5 |
| Incremental rollout: internal, then 1%, then everyone | added: `nebi-hillclimb` loop step 3 (theme preview, internal, percentage) |
| Quantitative explanation of an anomaly (56 px × 0.18 ≈ 10 px; new-tab only) | added: `nebi-debugging` step 3 |
| Ambition: Claude hedges and pads by default; "targets are not the stopping point" | added: core §5 bold-not-bloated; `nebi-hillclimb` §4 adds the what-have-we-not-measured refresh |
| Taste: a named human rules on user-perceptible changes from before/after | added: core §6 visible changes; `nebi-hillclimb` §4 lists the typical perf taste calls |
| Direction: narrow threads, merge colliding ones, close at diminishing returns, gavel complexity | added: `nebi-hillclimb` §4 lanes; core §5 complexity stop |
| Deterministic 120 Hz rig via DevTools begin-frame control; nightly regression job | added: `nebi-hillclimb` §2 fixed frame clock, Gotchas; loop step 5 scheduled check that opens a new lane |
| Gotchas found: em dash forces UTF-16 regex path, `:root:has()` cost, CLS hiding visible shifts, headless 60 Hz | added: `nebi-hillclimb` Gotchas |
| One Slack channel; other teams bring changes for review | n/a: team workflow, not a solo operator's doctrine |

## New rules of context engineering for Claude 5 — 2026-07-24

| Practice | Status |
|---|---|
| Removed over 80% of Claude Code's system prompt with no measured loss | added: `nebi-maintenance` write-for-the-stronger-model; subtraction pass proposed to the user |
| Rules give way to judgement | added: `nebi-maintenance` |
| Conflicting instructions cost thinking | added: `nebi-maintenance` |
| Examples narrow exploration; design the interface instead | added: `nebi-maintenance` |
| Progressive disclosure for CLAUDE.md and skills | covered: thin-router design, references |
| Simple tool descriptions, no repetition | covered: "one copy of each instruction" (OpenAI record) |
| Auto-memory instead of CLAUDE.md memory | covered: core §9 |
| Rich references (HTML, code, test suites, rubrics) | added: `nebi-orchestration` dispatch contract, references as code |
| CLAUDE.md lightweight, tokens spent on gotchas | partly: Gotchas line added; core weight left to the proposed subtraction pass |

## Lessons from building Claude Code: how we use skills — 2026-06-03

| Practice | Status |
|---|---|
| Nine skill categories; a skill fits one | covered: each Nebi skill owns one method |
| Verification skills have the most measured impact | added: core §10 verification skills pay off most |
| Don't state the obvious | added: `nebi-maintenance` |
| Gotchas section is highest signal | added: `nebi-maintenance`; first one shipped in `nebi-hillclimb` |
| File system and progressive disclosure | covered |
| Avoid railroading: goal and constraints, not steps | added: `nebi-maintenance` |
| Setup via config.json; AskUserQuestion | n/a: no Nebi skill needs per-user setup |
| Descriptions written for the model as triggers | covered: precondition-style descriptions and trigger suites |
| Memory inside skills (append-only logs) | covered: ledgers, checkpoints, feedback inbox |
| Scripts and helpers instead of boilerplate | added: `nebi-maintenance` |
| On-demand hooks (/careful, /freeze) | added: `nebi-maintenance`; a production-guard skill is proposed |
| Measure skill usage with a PreToolUse hook | proposed, not built: live invocation logging via the existing ledger hook |
| Marketplace and sharing | n/a: single user |

## A harness for every task: dynamic workflows — 2026-06-02

| Practice | Status |
|---|---|
| Failure modes of one long context: laziness, self-preferential bias, goal drift | added: `nebi-orchestration` split triggers |
| Classify-and-act | added: `nebi-orchestration` mode |
| Fan-out-and-synthesize | covered: scout mode |
| Adversarial verification | covered: checker role; strengthened in `nebi-debugging` 3-strike |
| Generate-and-filter, tournament, pairwise judgement | added: `nebi-orchestration` generate-and-judge |
| Loop until done | covered: discovery repeats until a round returns nothing new |
| Quarantine: readers of untrusted content never act | added: `nebi-orchestration`, scoped to fleets processing untrusted inbound content |
| Deep verification: one checker per claim | added: `nebi-research` |
| Rule adherence: one verifier per rule plus skeptic; mine sessions for corrections | added: `nebi-maintenance` |
| Root cause from disjoint evidence with refuters | added: `nebi-debugging` 3-strike |
| Parallelism must earn its coordination cost | added: `nebi-orchestration`; covered by core §1 sizing |
| Save repeated workflows as templates in a skill | added: `nebi-orchestration` |
| Token budgets | n/a: wall-clock budgets chosen 2026-09-23; one lever |
| Model routing classifier | added: part of classify-and-act |
| /loop and /goal pairing | n/a: harness features used case by case |

## Getting the most out of Opus 5.5 — 2026-09-22

| Practice | Status |
|---|---|
| Say what done looks like | added: core §2 |
| Delete "think carefully" lines | covered: none in the pack (checked) |
| Keep-going / stop rule in CLAUDE.md | covered: 2026-09-23 first pass |
| Fan out to subagents and check each one's evidence | covered: orchestration receipts |
| Keep the task list in a file on long runs | added: `nebi-sessions` |
| Read what it needs from you first | covered: status line |
| Review prompt: only merge-blocking problems, file and line, how to show it fails | added: `nebi-checker` (Claude and Codex) |
| Mark what you couldn't confirm and where you looked | added: `nebi-research`, `nebi-scout`, orchestration scout brief |
| Name the design styles to leave out | n/a: a tip for the user's own design prompts |
| Settled answers in chat projects; flagged messages; fast mode | n/a: claude.ai product behaviour |

## Prompt caching is everything — 2026-04-30

| Practice | Status |
|---|---|
| Don't switch models mid-session; route through a subagent | added: core §1 |
| Static first, dynamic last; messages for updates; don't change tools mid-session; cache-safe forks | n/a: harness internals; relevant when the user builds on the API (claude-api skill) |

## Seeing like an agent — 2026-04-10

| Practice | Status |
|---|---|
| Revisit tools and scaffolding as models improve | covered: `nebi-maintenance` subtract after upgrades |
| Structured elicitation through a question tool | covered: harness default; core §4 asks once |
| Let the agent build its own context; subagent for doc lookups | covered: core §9 and scouts |

## Using Claude Code: the unreasonable effectiveness of HTML — 2026-05-20

| Practice | Status |
|---|---|
| Long Markdown goes unread; HTML pages for plans, reports, reviews | added: core §3 long output goes in a page |
| Side-by-side option grids for taste | added: core §3 |
| Throwaway editors with a copy-as-prompt export | n/a as a rule; available on request |

## Checker review

A fresh-context Fable 5.1 checker reviewed the posts, the full diff and this ledger. It found stale deployed copies of a dropped first-pass prompting rule, missing seo-audit/cro exclusions and mirrored near-miss rows, duplicated lines between `nebi-hillclimb`, `nebi-debugging` and the core, an over-broad quarantine rule, three ledger rows that overclaimed, a two-sentence dictation line, and a scope ambiguity in bold-not-bloated. All seven were fixed; the redeploy replaced the stale copies. It confirmed harness parity, the seven-skill wiring, and that every other added claim is present.

## Proof

`node scripts/check-pack.mjs` passes; `node --test tests/*.test.mjs` 60/60. Live trigger suites and the checker's review are recorded in `SOURCES.md` under 2026-09-23.
