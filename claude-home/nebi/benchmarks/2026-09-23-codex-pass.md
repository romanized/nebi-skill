# 2026-09-23 OpenAI/Codex pass: coverage ledger

Base: `2ece5f7`. Lead: Claude Code on Opus 5.5 (1M). Target: Codex CLI 0.156 running GPT-6 Sol (config effort `high`).

## Method

- **Corpus:** two Sonnet 5 collectors saved every current official page as full text, fetched 2026-09-23: 12 OpenAI model and prompting pages (GPT-6 family guide, "Rethinking skills and prompts for GPT-6 Astra", GPT-5.6 Sol prompt guidance, model selection, reasoning best practices, prompt engineering, tools, function calling, GPT-5.2 and Codex prompting guides) and 37 Codex pages (docs for AGENTS.md, rules, skills, plugins, hooks, memories, subagents, permissions, sandboxing, automations, goal mode, config reference, commands, changelog; OpenAI engineering posts on harness engineering, the agent loop and the harness server; Codex's bundled model prompts at `rust-v0.156.0`). The GPT-6 Sol and Luna launch post returned 403 and is not in the corpus.
- **Workflow:** four Opus readers (one per page group) extracted 399 practices with verbatim quotes and mapped each to the doctrine. Four Fable 5.1 skeptics tried to refute the 155 gap, conflict and config items and kept 37. A Fable critic found what was missed, merged overlapping proposals and caught contradictions between them. A GPT-6 Astra self-audit of the core was planned but the model route was unavailable; live Codex probes replaced it.
- **Lead verification on this machine:** Sol's catalog window is 272k by default and 872k at most, while `config.toml` set 1,000,000 with compaction at 900k. `codex debug prompt-input` rendered the core with no `AGENTS.override.md` and all seven Nebi descriptions intact among 93 listed skills. The docs say custom agent files accept `mcp_servers` keys and that a child re-inherits the parent's live sandbox overrides; the probes below show the MCP part does not hold in practice. A model-only spawn falls back to that model's default effort (medium). "Stop immediately on unexpected changes" appears only in the older codex-model prompts, not in Sol's messages. In the last 200 local sessions, 48 of 970 progress updates ended with ⏳ (the critic's "780 of 1,199" did not reproduce) and 132 of 303 final answers had no status line.

## Landed

| Change | Source | Where |
|---|---|---|
| One stop list, stated once: report-only for questions, reviews and plans; edit and run local checks without asking for change requests; stop only before push, deploy, send, spend, delete, scope growth or a two-way ambiguity; state assumptions for reversible gaps | GPT-5.6 Sol guidance ("state each rule once"; repeated "ask first" causes needless approval requests); GPT-6 guide initiative prompts | Codex §4; the duplicate clause left §3 |
| Status line on the final message only; progress updates carry none; the final message ends the turn, so wait for sub-agents and checks; ⏳ only for work outside the session | Codex commentary/final split; local session count | Codex §3 |
| First update names goal, done and plan, then carry on; trivial work skips it | GPT-6 guide ("do not stop at... proposing a plan"); Sol guidance on preambles | Codex §2 |
| Suggest `/goal` for hours-long work with a checkable done condition | Codex long-running work docs | Codex §3 |
| Name the file and quote the line when a skill or AGENTS.md makes you pause | GPT-6 guide, instruction following | Codex §3b |
| No tests for reversible, low-impact changes that mirror the implementation | GPT-6 guide, testing and verification | Codex §6 |
| Contextual pointers to the code-quality and writing rules instead of always-on text | GPT-6 skills post (contextual doc pointers, not read-before-every-edit) | Codex §7, §8 |
| AGENTS.md loads only from repo root to the start folder; read deeper ones before editing there | Codex AGENTS.md discovery docs | Codex §9 |
| Bindings re-placed on GPT-6 and matched to how the user works (2026-09-24): Sol high by default, xhigh for heavy builds and checks, Astra for big, important tasks, Luna for fast scans, Terra only as fallback; spawn effort passed explicitly | OpenAI model selection; subagents docs on default effort; the user's own effort habit | Codex §1 |
| Install, review, register, scope and park mechanics moved from the core into `nebi-maintenance`; deploy footer replaced by a one-line pointer | GPT-5.6 family guide (leaner prompts scored 10–15% higher with 41–66% fewer tokens in OpenAI's evals); GPT-6 skills post | Codex §10 and footer; `nebi-maintenance` |
| `codex debug prompt-input` as proof of what loads; skill catalog budget and parking; hook trust after deploy; frozen `codex exec` cases for core edits | Codex config reference, hooks and commands docs | `nebi-maintenance` |
| Workers are told whether they may spawn their own agents | Codex subagents docs (children can spawn unless told) | `nebi-orchestration` dispatch contract |

## Config changes (outside the deployer)

`~/.codex/config.toml`, backed up first: `model_context_window` 1,000,000 → 872,000 (Sol's maximum) and `model_auto_compact_token_limit` 900,000 → 780,000 so compaction fires before the real limit; `[agents] default_subagent_reasoning_effort = "high"` so a model-only spawn keeps your effort. At 872k the default skill budget is about 17k tokens against a catalog of about 14.5k, so every description stays intact.

## Considered, not adopted

| Idea | Why not |
|---|---|
| `[tui] notifications` for turn-complete | `notify` already fires on turn completion |
| `web_search = "live"` for read-only children | Trades prompt-injection exposure for freshness with no observed failure |
| "Leave other sessions' edits alone" line in §5 | The stop-on-unexpected-changes rule is not in Sol's prompt |
| Remove preambles and status updates (Codex prompting guide) | Written for `gpt-5.3-codex`; superseded for Sol by the newer guidance |
| Programmatic tool calling, function-calling and verbosity parameters | API-level settings, not agent doctrine |
| Switch off mutating MCP servers in the scout and checker files | Tried and removed. A bare `enabled = false` entry made Codex 0.156 reject both role files (`invalid transport`); with a placeholder transport they loaded, but the spawned scout still listed railway and porkbun. The written guard in `developer_instructions` stays |
| Same core trims in the Claude core | Out of scope for this pass; part of the proposed subtraction pass |

## Open for the user

- Resolved 2026-09-24: of the 15 skills Codex's external-agent import copied into `~/.agents/skills/synced/`, the four that depend only on Claude tools or services (built-in-browser, chrome-browser, computer-use, docs) are disabled in `config.toml` with `[[skills.config]]` (the path must name the `SKILL.md` file; a folder path was silently ignored), taking the rendered catalog from 93 to 89 skills with all seven Nebi skills intact; the rest work in Codex or degrade gracefully and stay. The import itself stays on.

## Proof

Frozen `codex exec --ephemeral` probes on GPT-6 Sol, before and after the change, in a scratch repo:

| Probe | Old core | New core |
|---|---|---|
| "can you rename the function foo to add" | renamed, checked, ✅ Done | renamed, checked, ✅ Done, no questions |
| "what do you think of the naming? just your opinion" | opinion, no edits, ✅ Done | opinion, no edits, ✅ Done |
| spawn `nebi-scout`, list its tools | listed tools incl. railway and porkbun; final message had no status line | first run: role files rejected, Codex stopped with ❓ Need you instead of substituting; after the fix it spawned, and railway/porkbun were still listed (see above) |

`codex debug prompt-input` after deploy: new core loaded, no `AGENTS.override.md`, 93 skills listed with all seven Nebi descriptions intact at the new 872k window. `check-pack` passes and 60/60 tests pass; the deploy byte-matched 89 files; all six Codex hooks remain trusted.
