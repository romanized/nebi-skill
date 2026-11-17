# 2026-09-24 usage and cleanup pass

Closes the four open tasks from the 2026-09-24 handoff: a source watch for official docs, evidence-based de-clutter, the shared AGENTS.md body question, and the Cursor harness.

## Decisions

| Task | Outcome | Evidence |
|---|---|---|
| Source watch | `upstreams.mjs --docs` hashes six official pages and lists new posts on the claude.dev blog, the Codex docs map (`llms.txt`) and the Codex changelog RSS; `--mark-reviewed <id\|all>` records a review on the master | Two consecutive live runs: all `unchanged`, exit 0. The OpenAI `.md` pages are byte-identical to the copies read on 2026-09-23. A GPT-5.6 guidance entry was added, then dropped at the user's request: the GPT-6 family has replaced it |
| Shared AGENTS.md body | Not built (user agreed) | Only 19 blocks (2.2 KB of about 14 KB) are identical between the Claude and Codex cores. The rest carries the same policy in wording tuned to each vendor's prompting guidance, plus harness-only lines. `check-pack` already enforces matching section IDs and binding dates. A composed body would flatten one vendor's wording for little drift protection |
| Cursor | Retired (user chose full retirement): `cursor-home/`, the deploy steps, tests and parity checks removed; installed `~/.cursor` Nebi files cleaned | Staged deploy writes no Cursor path; the tests pass |
| De-clutter | Roblox trio parked; three zero-load imported skills disabled in Codex; one unsourced range removed from `nebi-maintenance`; the live detector now ignores reads of repo masters | Usage table below |

## Usage in real work, last 30 days

Method: [2026-09-24-usage-backfill.mjs](2026-09-24-usage-backfill.mjs) scanned 2,835 transcript files, counting sessions (subagent threads count separately) in which a skill loaded. Claude: Skill calls and slash commands. Codex: reads of an installed `SKILL.md` (flags such as `nl -ba` or `cat -n` allowed), including code-mode `exec` calls. Excluded: reads of repo masters, Codex sessions in this repo, and probe or eval folders. The live log (`skill-usage.jsonl`) only started on 2026-09-23, so it could not answer this yet.

| Skill | Claude | Codex | Projects | Reading |
|---|---|---|---|---|
| nebi-research | 71 | 92 | 25 | core |
| verification-before-completion | 0 | 146 | 13 | Codex loads it at most task ends; Claude never does (core §6 and the Stop hook) |
| nebi-orchestration | 44 | 49 | 17 | core |
| nebi-sessions | 20 | 57 | 14 | core |
| nebi-debugging | 2 | 46 | 11 | Claude rarely picks it |
| nebi-prompting | 20 | 17 | 15 | the "96 lines of gating" hypothesis is refuted: it is used |
| nebi-maintenance | 5 | 11 | 9 | expected |
| nebi-hillclimb | 0 | 0 | 0 | installed 2026-09-23; too new to judge |

Zero loads in 30 days: `luau-best-practices`, `luau-type-expert`, `rojo-pro`, the five `canva-*` skills, `security-review`, `security-threat-model`, `supabase-postgres-best-practices`, `vercel-react-best-practices`, `ai-seo`, `higgsfield-marketplace-cards`, `higgsfield-websites`, `higgsfield-youtube-thumbnail`, and Codex's imported `deep-research`, `import-memory` and `morning`.

Park rule applied: zero loads **and** no activity in the skill's domain. A zero-load skill in an active domain is an explicit-ask skill and stays (`security-review` while `security-and-hardening` loaded 18 times; `ai-seo` while `seo-audit` loaded 11 times; the Higgsfield bundle while three of its skills loaded). Canva had one tool call in 30 days, in this repo, but core §10 names Canva, so it stays.

- **Parked:** the Roblox trio. Both Rojo projects (`roblox-combat-surf`, `project-brawl`) have had no file changes since 2026-08-25. The skills now sit in `~/.agents/skills-project-packs/`, replacing the July copies with the pinned install.
- **Disabled in Codex:** `deep-research`, `import-memory` and `morning` from the imported `synced/` folder. Backup: `~/.codex/config.toml.nebi-20260924-park`.
- **Removed from Claude (user decision):** `verification-before-completion`. It had 0 Claude loads and duplicates core §6 and the Stop hook. Codex keeps it. Copies installed inside the `Meta-glasses-apps` and `joshua-nebi-portfolio` repos were left alone, since they belong to those projects.

The fixed-number sweep of the seven Nebi skills found one unsourced figure ("three to five frozen cases", now "a few"). The rest stay: orchestration's sizing bands come from Anthropic's multi-agent research post and the agent-teams docs; debugging's "3+ fixes, stop" and orchestration's default of three replan rounds are working circuit breakers.

## Probes

- Codex CLI 0.156.0, `codex exec --ephemeral` reading `~/.agents/skills/nebi-research/SKILL.md`: the live hook logged `codex / nebi-research`, both with `code_mode` off and with `--enable code_mode`. The probe lines were removed from the log.
- Codex keeps waiting for stdin under `codex exec` unless stdin is closed (`< /dev/null`).

## Fresh-context check

A Fable checker reviewed the combined change (three writers). Fixed: a stale "all three cores" string in the register, the hook counts in SOURCES.md, the parked pack's global reinstall command, and a guard so `--mark-reviewed` refuses to run without `--docs`. The checker also found that the detector missed reads with flags (`nl -ba`, `cat -n`); 101 Codex records used them. After widening the detector and rerunning the scan, every count above is unchanged, because those reads fell in sessions already counted for that skill, so the zero-load list stands. The two OpenAI entries that share a hash are distinct URLs, both served directly with no redirect; `latest-model` is the GPT-6 Astra guide today and they will diverge at the next launch.

## Not verified

- The Codex desktop app itself was not probed. Its sessions run code mode; the CLI probe with `code_mode` enabled logged correctly.
- Codex subagent threads are separate session files, so Codex counts are per agent thread, not per user task.

## Next review (2–4 weeks, from about 2026-10-08)

Run these three and compare with this ledger. Each is read-only.

1. `node ~/.claude/nebi/skill-usage.mjs --days 30` gives sessions per skill from the live log (started 2026-09-23; `session` recorded from 2026-09-24). It uses the same unit as the table above. Codex subagent threads count as their own sessions in both.
2. `node ~/.claude/nebi/upstreams.mjs --docs` lists official pages that changed or gained posts. Act on them, then `--docs --mark-reviewed <id|all>` on the repo master and redeploy.
3. Read `~/.claude/nebi/failure-log.md`, `~/.codex/nebi/failure-log.md` and `~/.agents/nebi/feedback/inbox.jsonl` (triage method in `nebi-maintenance`).

Open questions the data should answer:

- **`nebi-debugging` under-fires in Claude** (2 Claude sessions against 46 in Codex). Check whether Claude debugs without it; if so, run its trigger suite and tighten the description.
- **`verification-before-completion` in Codex** loads in most sessions and repeats Codex core §6. Decide whether it earns that context, for example with frozen `codex exec` cases with and without it.
- **`nebi-hillclimb`** was installed 2026-09-23. Has it fired on any speed, size or cost task?
- **Zero-load watchlist**: the five `canva-*` skills, `security-review`, `security-threat-model`, `supabase-postgres-best-practices`, `vercel-react-best-practices`, `ai-seo`, `higgsfield-marketplace-cards`, `higgsfield-websites`, `higgsfield-youtube-thumbnail`. Still zero with no activity in their domain means park, using the same rule. Canva stays while core §10 names it.
- **Parked Roblox skills**: if either Rojo project wakes up, reinstall into that project (register `update` line) instead of globally.
- **Codex desktop app**: match the live log's Codex `session` ids to files in `~/.codex/sessions` whose `session_meta` says `"originator":"Codex Desktop"`. No match after two weeks of desktop use means the hook does not fire there.
