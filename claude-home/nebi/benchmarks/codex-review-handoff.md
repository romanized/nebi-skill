# Codex review handoff — integration pass (2026-09-22)

You are reviewing, not editing. Nebi brings your feedback back to Claude, which checks each point against the repo, keeps what holds and rejects what doesn't with a reason. Be specific (file:line, command, observed output) and say how sure you are.

## What Nebi asked

1. Judge the previous update, commit `2aef4f9`.
2. Fix the recurring roadblock: when Nebi names a skill or repo, agents "take inspiration" and it never shows up later. Named items must be installed, recorded with their source, easy to update, and visible in new sessions of both Claude Code and Codex. Fix the doctrine and skills that push toward adapt/defer, not just this instance.
3. Named skills are examples, not the list: integrate them and find better ones for the user's areas and tools, under a no-BS bar.
4. One register for every upstream skill and source with a cheap behind-upstream check and no auto-update.
5. Smart complaint capture, after finding out why `failure-log.md` went quiet.
6. Both harnesses, surgical edits, no over-building, prove it.

## What to review

- Base `2aef4f9`, review commit `648ab8f`: `git diff 2aef4f9 648ab8f`. This handoff is the next commit; it changes nothing else.
- Full report with receipts: `claude-home/nebi/benchmarks/2026-09-22-integration-pass.md` (verdict, root cause, changes and proof, discovery by area, register, capture, deviations, checker findings and their disposition, not verified). A fresh-context Opus checker already reviewed this diff; §8 of the report lists what it found and what changed.
- Machine state changed outside the repo (installed skills, `~/.zshenv`, `~/.local/bin/bsk`, ecommerce-workspace skills) is listed in report §3 "Installs". Backup of everything replaced: `~/.agents/nebi/backups/integration-20260922/`.

## Changes in one line each

- Cores §4/§10 (Claude, Codex, Cursor): examples are starting points; named items get installed pinned for both clients, deviations announced; find bar; scope by use; one register; use installed skills.
- `nebi-maintenance`: integrate-first method, user corrections apply without a second-session wait, feedback inbox triage. `nebi-prompting`: labeled `What I added:` improvements, named examples widened into a bounded search, requested investigation allowed. Evals updated (maintenance 6 rewritten, 8 new; prompting 11 and 12 new).
- `claude-home/nebi/upstreams.json` + `upstreams.mjs` (deployed to `~/.claude/nebi/` and `~/.codex/nebi/`): curated register plus automatic reading of every skills-CLI lock (global and 15 project locks); read-only status.
- `claude-home/hooks/feedback-capture.mjs` (UserPromptSubmit, both clients) and concession capture in `verify-before-stop.mjs`; replay over 470 real Claude user turns captured 37, about 84% judged real.
- `deploy.mjs`: wires the new hook for both clients; Claude settings gain `claudeMdExcludes` for `~/AGENTS.md` and a default `skillListingBudgetFraction` of 0.02.
- `context.mjs`: git identity timeout 400 → 1500 ms and a shared 700 ms fact budget (root cause of the intermittent test; stays inside Codex's 3 s SessionEnd cap).
- Model bindings refreshed (Codex rows partly inferred, see questions).

## Verified (fresh evidence in the report)

`node scripts/verify.mjs` 58/58; deploy and `--verify` (83 files, 3 hook configs); register status against every upstream and project lock; fresh headless Claude Code sessions (skills listed, ffmpeg-skill chosen for a video edit, `~/AGENTS.md` absent in the lead and a spawned sub-agent, capture hooks write the inbox, ffmpeg-skill's nested dev skills not listed); `/skill-doctor` before/after.

## Not verified — please check the Codex side live

1. In a new Codex session (any repo), are these listed: `ffmpeg-skill`, `copywriting`, `product-marketing`, `cro`, `receiving-code-review`, `supabase`, `vercel-react-best-practices`, `shopify-shopifyql`? In ecommerce-workspace also `attribution`, `offers`, `browser-skill`?
2. The new UserPromptSubmit hook is **not trusted yet** (Claude did not run `codex app-server`). Is it listed in `/hooks`? After Nebi trusts it (`node scripts/codex-hooks.mjs --trust` or `/hooks`), does a complaint-style prompt add a line to `~/.agents/nebi/feedback/inbox.jsonl` with `"harness":"codex"`? Does Codex's Stop payload carry `last_assistant_message` so concessions are captured?
3. `node ~/.codex/nebi/upstreams.mjs --offline` runs from the Codex copy.
4. Codex bindings table in `codex-home/AGENTS.md`: the helm row follows `config.toml` (`gpt-6-sol`). The other rows map GPT-5.6 Sol/Luna to GPT-6 Sol/Luna by name and keep GPT-5.6 Terra because no GPT-6 Terra exists. Where does GPT-6 Astra belong? Correct any row that is wrong.
5. Codex skill listing budget: 2% of context per the docs. With about 45 global skills now, does Codex shorten descriptions or drop any?
6. `~/.agents/skills/ffmpeg-skill/.claude/skills/` holds 13 upstream dev skills (code-review, git-hygiene…). Claude does not list them; confirm Codex skips that hidden folder too.

## Where a second opinion helps most

- **Scope calls:** marketing, Shopify, Supabase, React and Luau skills went global because several projects use them; `browser-skill` stayed project-local. Too broad or too narrow?
- **The listing budget change** (0.02 = about 20k tokens at 1M context): right trade, or should rarely used plugin skills (Stripe 13, Remotion 13) move to project scope instead?
- **Capture precision:** the patterns in `feedback-capture.mjs` come from the user's transcripts. Anything that will flood the inbox, or obvious complaint phrasings it misses?
- **`upstreams.mjs`:** correctness of the file-level comparison (`localFiles`/`upstreamFiles`, CLI exclusions), the blobless cache, and Windows behavior.
- **"Use what's installed" rule:** copy recall went 0/1 → 1/2 and design 0/1 → 2/2 on small samples. Better lever?
- **Anything that reads like new over-building** for a solo user.
- **`nebi-prompting` description** still says "never scan or search a repository" while the body now allows an investigation the user asks for. Worth a description change (needs a trigger-suite run)?
- **Project installs backlog** (113 Codex-only, 148 stale or edited across 15 project locks): fix per project, or move widely used ones global?

## Open decisions for Nebi (not for the reviewer to decide)

Canva OAuth in Claude (`/mcp`) and enabling the Canva plugin in Codex; installing the bsk Chrome extension (dedicated profile advised); `brew install ffmpeg-full`; the shortlist in report §4; whether to fix the `.Codex/product-marketing.md` typo inside the user's edited ad-creative; whether ecommerce-workspace should commit the new skill links.
