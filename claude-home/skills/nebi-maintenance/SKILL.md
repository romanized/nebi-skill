---
name: nebi-maintenance
description: "Audit, update, refresh, or extend the personal agent-operating doctrine, its rules, bindings, and nebi skills. Use when reviewing or improving CLAUDE.md, the doctrine, skills, bindings, or when a doctrine rule was violated; also when installing, integrating, registering, scoping or parking a skill, plugin or tool repo, especially one the user names. Not for project code rules like linter or ESLint configs."
---

# Maintenance: keep the doctrine honest

The active harness's core §0 override always wins. Masters live under `<repo-root>/claude-home/` and `<repo-root>/codex-home/`. Edit masters, not deployed home-directory copies. The source review and change record live at `<repo-root>/claude-home/nebi/SOURCES.md`.

## Refresh rules

- Discovery alone is read-only. An existing request to install, update, or integrate is authorization for that scope; do not ask for it again. Review fit before using it.
- Inspect third-party source, package metadata, and permissions before executing it. `npx`, `uvx`, installers, and even `--help` can fetch or run code; they are not read-only discovery. For an already reviewed, installed CLI, check current `--help` before relying on version-sensitive syntax.
- Filter hard. Prefer tightening or deleting an existing rule over adding another file. Keep each `SKILL.md` to the method that must load when it fires.
- Write for the stronger model: skip what it already does by default, skip fixed numbers and scenario lists unless they encode a measured threshold, prefer judgement to rigid rules, state the goal and constraints rather than every step, and prefer describing the interface over examples, which narrow what it tries. Conflicting or duplicated instructions cost thinking on every request; remove them.
- Give repeatable mechanics a script or helper, with its gotchas in the docstring, instead of prose steps. A guard that would be annoying always-on (blocking destructive commands while touching production) belongs in an on-demand hook inside a skill.
- Before expanding a workflow, freeze representative cases and success criteria, then probe the current skill or a bare baseline. Record what failed before changing text. Correct directly demonstrated contradictions and executable defects without manufacturing a model failure. Distinguish structural repair from measured behavioral improvement.
- Measure source listing characters separately from actual client visibility and context use. Use current client diagnostics where available; record client/version and label unavailable measurements UNMEASURED. Do not infer a shared budget, truncation order, or recall from source size.
- Portable frontmatter: follow the Agent Skills specification (description at most 1,024 characters). Keep the body under 500 lines as a pack convention, not a target; verify current client-specific limits before depending on them.
- After a model upgrade, have the new model read the whole pack for contradictions and stale wording, then subtract before adding: remove scaffolding the stronger model no longer needs.
- What loads at start is paid by every agent on every turn. Before adding a skill, connector or always-on tool, check the listing with `claude -p "/skill-doctor"` and what an agent carries from its first request's tokens; set a skill whose name already says what it does to `name-only`.
- A skill's Gotchas section is its highest-signal content. Grow it from failures seen in use rather than adding general rules.
- Scope by use: a skill for one project installs in that project; one used across several projects installs globally. Say which you picked.
- Adding, folding or retiring a sub-agent type is measured, not argued: run the fleet eval in `<repo-root>/single-loop/` (its `PLAN.md` says how; the repo's project skill `single-agent-loop` holds the method) before and after, one agent per change. A change holds only if no task gets worse and the lead did not swap in another agent. The eval only tests an agent the baseline actually dispatches (today that is the checker): for the scout or builder, add Large tasks first. `single-loop/scripts/traces.py` gives each agent's real traffic from the transcripts.
- `node ~/.claude/nebi/skill-usage.mjs` (also under `~/.codex/nebi/`) shows which skills loaded in real work and which never did. Park or fix the ones that never load, and trim when recall or context load degrades.
- For each outside candidate, review origin, exact revision, license, instructions, scripts, dependencies, permissions, maintenance history and overlap, then record the result in the upstream register (`claude-home/nebi/upstreams.json`). Something the user named is installed from its real upstream, pinned, where it loads in Claude Code (and Codex, once Codex is back). Rewriting it in Nebi's words, borrowing a mechanism or deferring is a deviation the user hears about in the same reply, with the reason: unsafe, broken, missing license, or a clearly better alternative.

For browser/media routing or source refreshes, consult the relevant section of [capability routing](references/capability-routing.md) and the [integration method](references/skill-sources.md). Descriptions route, the skill body supplies the method, and references load only for the current task. Catalog rank and install counts identify candidates; they do not establish safety, compatibility, or model capability. Run `node claude-home/nebi/upstreams.mjs` (deployed as `~/.claude/nebi/upstreams.mjs` and `~/.codex/nebi/upstreams.mjs`) to see what is behind upstream, locally edited, or unregistered; review each upstream diff against its pin before running the register's update command. `--docs` does the same for the official pages the doctrine rests on (changed text, new posts); after acting on a change, record it on the master with `--docs --mark-reviewed <id|all>`. The register is also the library of everything researched, whatever the verdict: `--library --here` lists what it holds for the current project (fields in the integration method).

A machine-wide update (Homebrew, CLIs and runtimes, plugins, skills, MCP servers, project dependencies) follows the [update playbook](references/update-playbook.md): inventory by layer, one owner per area, backup and undo before each change, then a scored audit. The four Claude accounts share settings, skills and plugins through symlinks but keep separate MCP lists, so add or remove a server with `claude-accounts mcp add|add-json|remove ...` and finish with `claude-accounts diff`.

## Keep harnesses in sync

While Codex is parked (core §1), maintain Claude Code only: skip this section's Codex steps, `codex-home` edits and Codex copies of skills, and leave the Codex masters as they are so reviving Codex needs no rebuild.

- Model names belong only in the two harness cores. When bindings change, update `claude-home/CLAUDE.md` and `codex-home/AGENTS.md`, including both dates, in the same change.
- Shared skills must use active-harness wording and stay model-free so deployment needs no generated rewrite.
- In Codex, `codex debug prompt-input` renders what the model sees: prove the core loaded, no `AGENTS.override.md` shadows it, and every skill description is intact. The catalog budget is `skills.max_context_tokens` (default 2% of the context window; explicit values are capped at 10,000). When it overflows, park low-use skills with a `[[skills.config]]` entry set to `enabled = false` whose `path` is the skill's `SKILL.md` file; a folder path is silently ignored, despite the config reference. After deploying changed hooks, trust them in `/hooks`; Codex skips untrusted hooks.
- Compile the active failure log (`~/.claude/nebi/failure-log.md` for Claude Code; `~/.codex/nebi/failure-log.md` for Codex) into focused rule edits. If prose repeatedly fails, convert the behavior to a harness-supported deterministic check or delete the dead rule.
- Also triage the shared feedback inbox (`~/.agents/nebi/feedback/inbox.jsonl`), which hooks fill from both harnesses with the user's complaints, dropped ideas and named repos plus agent concessions (`You're right…`), which usually follow a complaint. Each entry is a lead, not a verdict: read the session around it before acting. Group entries by behavior, drop task-specific noise, check that every named repo is in the library as installed, saved or declined, record what each group became, then move the processed lines to `triaged-<date>.jsonl` beside it.
- Beyond the inbox, mine recent sessions for corrections the user keeps making: cluster them, test each candidate with "would this rule have prevented a real mistake?", and keep only the survivors. For a rule the model keeps missing, check it with one verifier per rule and a skeptic that filters false flags.
- A correction the user states about how the agent should work is an instruction, not a pattern to wait on: apply it in this pass, with the user's words as evidence. No two-session threshold applies. A pointed question or complaint about a deviation, such as asking what was really done, counts as that correction.
- Promote an agent-observed failure (one the user did not state) into a doctrine or skill rule only when it repeats with verbatim evidence from at least two sessions and a check that would have caught it; one-offs stay in the log.

## Validation ladder

Use the cheapest proof that can catch the change:

1. **Body-only prose:** check frontmatter and required structure, read back the changed section, inspect the relevant diff, and run a formatting smoke such as `git diff --check`.
2. **Description edits:** run the affected skill's focused trigger suite, including must-fire and near-miss cases.
3. **Executable changes:** for scripts, hooks, and deploy code, run syntax checks plus the smallest focused fixture or dry run that exercises the affected path.
4. **Broad trigger semantics:** use held-out cases and repeated trials for disputed description improvements; keep tuning cases separate. Revert a change that lifts the tuning cases but not the held-out ones, and fix the cause in the text rather than pasting a failing case into it. Record exact source hashes, model/client, harness settings, denominators, errors, and limits. Invocation, decision probes, and actual task execution are different evidence. Do not turn a timeout, missing registry, or unrun checklist into PASS.

**Claude Code mods** (`<repo-root>/mods/`) are done only at the done bar in `<repo-root>/mods/CONTRACT.md`: `claude plugin validate` exits 0, `claude plugin test` passes over terminal and desktop with a test per behaviour the spec names, `tsc` is clean, the plugin version is bumped, and after install a real session loads every mod with no `refused` or `not loaded` line while the `nebi-mod-verify` paint check shows the promised screen. A green `plugin test` alone never sees the painted screen.

For Codex core edits, run a few frozen cases with `codex exec --ephemeral -o <file> < /dev/null` on the configured model before and after the change, and compare; without closed stdin, `codex exec` waits for input in an agent shell.

From the repository, run `node scripts/check-pack.mjs` and `node --test tests/*.test.mjs`. The source-local `claude-home/nebi/run-trigger-evals.mjs --help` documents trigger staging without deployment. The cross-skill and action-fixture protocol is in `<repo-root>/tests/README.md`; ship fixtures and inspect actions, not just fluent answers.

Deploy only when the task includes deployment. Before any deploy write, preflight every required master; after deployment, verify only the affected harness surfaces.
