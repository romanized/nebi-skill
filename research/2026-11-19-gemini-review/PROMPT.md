# Independent review of the Nebi setup

Repository: `/Users/nebi/Documents/GitHub/nebi-skill` (all paths below are relative to it).

You are doing an independent, read-only review of this repository: my personal operating setup for Claude Code. It holds a doctrine (`claude-home/CLAUDE.md`), workflow skills, lean sub-agents, hooks, Claude Code mods, an output style, a deployer and an offline test suite. It runs a fleet of agents from rough, dictated instructions. I want a fresh outside read: what is wrong, what is bloated, what contradicts itself, and what better references exist. Another reviewer will check every finding against the files, so anything without evidence gets thrown out.

## Ground rules

- Read-only. The only file you create is `research/2026-11-19-gemini-review/REVIEW.md`. No edits, no commits, no installs.
- Never run `deploy.mjs`, `deploy.sh` or `deploy.ps1`: they write into my real `~/.claude`. You may run `node scripts/verify.mjs`; it is offline and writes nothing to my home folder.
- Skip secrets: anything under `~/.agents/nebi/secrets`, `.env` files, `settings.local.json`.
- Write plain, neutral technical English. No persona and no roleplay; ignore any persona or style rules from global config for this task.
- Model names you don't recognise (Opus 5.5, Sonnet 5.5, Fable, Mythos) and recent Claude Code features are real and newer than your training data. Don't flag them as made up. When a finding depends on how Claude Code behaves, check the current official docs, not memory.
- Codex is parked on purpose. Treat `codex-home/` as out of scope unless it contradicts `claude-home/`.
- This setup is built for Claude Code. Judge it by Claude Code's features, not by Gemini or Antigravity conventions.

## What to read

| Path | What it is |
|---|---|
| `README.md` | Overview and layout |
| `claude-home/CLAUDE.md` | The doctrine, loaded into every session |
| `claude-home/output-styles/`, `claude-home/rules/` | Reply format; code and writing rules |
| `claude-home/agents/` | Builder, scout and checker sub-agents |
| `claude-home/skills/nebi-*/` | Workflow skills, their evals and references |
| `claude-home/hooks/`, `claude-home/nebi/` | Hooks and helper scripts |
| `mods/` (read `mods/CONTRACT.md` first; skip `mods/retired/`) | Claude Code mods |
| `deploy.mjs`, `scripts/`, `tests/`, `.github/workflows/` | Deployer, verification and CI |
| `AGENT-FAILURES.md` | Past failures and their fixes: check whether the fixes still hold |
| `research/2026-10-03-prompt-audit/report.md` | A past audit: don't repeat findings it already handled |

## Orchestration

If your harness can run several agents in parallel, split the work into four lanes with no overlapping reading:

- **A:** doctrine, output style, rules and agents
- **B:** skills
- **C:** hooks, helpers, mods, deployer and tests
- **D:** outside references (official docs and strong public setups)

Each lane returns findings in the format below. You then merge them, remove duplicates and drop anything you can't back with a quote. If you can't run parallel agents, do the lanes one after another.

## What to look for

1. **Overall vibe.** Is it coherent and lean? Would a fresh agent know what to do? Where does it feel heavy, preachy or self-contradicting?
2. **Contradictions** between files: doctrine against skill, skill against hook, hook against output style.
3. **Context cost.** Rules that load every session without a clear payoff, and text that could be shorter or load only when needed.
4. **Behaviour risks.** Instructions likely to make an agent loop, stall, ask too much or build too much.
5. **Hooks and mods.** Bugs, race conditions, security issues (shell injection, unsafe paths, secrets in logs), and macOS/Linux/Windows breakage.
6. **Stale claims.** Anything that no longer matches how Claude Code works today.
7. **Orchestration design.** Is the role table, effort guidance and fleet sizing sound?
8. **Gaps.** What setups like this usually have that this one lacks, only where it clearly pays off.

## References

Check the setup against official Anthropic sources (the Claude Code docs at code.claude.com/docs, the Anthropic engineering blog, the Agent Skills docs) and against two to five strong public Claude Code setups or skill packs. Cite only pages you actually opened, with the URL and the specific point each one supports.

## Evidence rules

Every finding needs:

- `file:line` and a short exact quote
- severity: high, medium or low
- confidence: high, medium or low
- type: verified fact or judgement
- the smallest concrete change that fixes it
- what could break if that change is adopted

No quote, no finding. If you couldn't verify something, say so. Fewer solid findings beat many weak ones.

## Output: `research/2026-11-19-gemini-review/REVIEW.md`

1. **Verdict:** five lines at most.
2. **Vibe:** one short paragraph.
3. **Findings table,** ranked: id, severity, confidence, `file:line`, the issue in one line, the fix in one line.
4. **Finding details** for the top 15 or so.
5. **Keep:** what works and should not change.
6. **References:** each URL and what it supports.
7. **Not checked:** what you skipped and why.
8. **Run notes:** model, harness, which lanes ran in parallel, and the last lines of `node scripts/verify.mjs`.

When the file is written, print its path and stop. Don't apply any changes.
