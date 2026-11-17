# Prompt audit: nebi-skill against Claude Opus 5.5 (2026-10-03)

## Assumptions (Step 0)

- **Scope:** the repository's prompt surface:
  - `claude-home/CLAUDE.md`, `claude-home/output-styles/nebi.md`, `claude-home/rules/*.md`, `claude-home/commands/sharpen.md`
  - every `claude-home/skills/nebi-*` SKILL.md with its references
  - `claude-home/agents/nebi-{scout,checker}.md`
  - text the model reads from `claude-home/hooks/*.mjs`: session-start context, Stop-hook nudges, tool-call deny reasons and the steer note
  - deny and context strings the model reads in `mods/nebi-*/hooks/*`
- **Target model:** Claude Opus 5.5 for `claude-home/` and `mods/`. Both agent files pin `model: inherit`, so they are audited against the session model. Their dispatch bindings (Fable 5.1 for the checker, Sonnet 5 for the scout) change no finding.
- **codex-home/** is a non-Anthropic target, audited for Group 2 only.
- **Blast radius:** `claude-home/` is the master for `~/.claude/`. Once deploy.mjs runs, edits reach every project.
- **Not read, on purpose:** settings files, settings hook definitions, credential files and `.mcp.json`. So the `model: opus` claim at CLAUDE.md:31 is unchecked. External skills (stop-slop, find-skills, skills.sh) were not read.
- **Provenance:** `git blame` on HEAD `900c138`. Lines the lanes reported as uncommitted are now in `714df84` (2026-10-03). Where two of them conflict, history still cannot order them.

## Summary

**1. A session-start line overrides the user on browser switching.** The SessionStart hook says "never switch_browser" with no exception (session-start.mjs:23). capability-routing.md:22, the hook guard (steer-channel.mjs:76-78) and the nebi-browser mod all allow it when the user asks that turn. Opus 5.5 reads instructions literally, so every session starts primed to refuse a direct user request, which is the §0 failure. Flagged, not diffed: the fix loosens a prohibition and both lines come from `714df84`.

**2. The §6 proof nudge asks for checks the doctrine says are unnecessary.** The nudge (verify-before-stop.mjs:267-271) fires after every docs or prompt edit proved by reading the file back, because Read never reaches the ledger. It then demands a command and suggests a fresh checker sub-agent. CLAUDE.md:100-107 says reading back is proof for docs and that the hook is "a backstop, not a reason to run more checks". The migration guide documents "use a subagent to verify" as causing over-verification. M13 rewrites it.

**3. Two clamps push an already quiet model toward silence.** The output style says "at most one short line per phase" and bans any closing summary (nebi.md:25). CLAUDE.md:67 ends with "Nothing else", which read literally bans the §3b deviation notes. Opus 5.5 already says little, and its notes between tool calls come back as thinking blocks. That works against the user's #1 pain (CLAUDE.md §3). M5 and M2 rewrite them. Both are the user's own rules, so the user may decline.

**Counts:** 44 raw findings came in: 40 kept, 2 dropped, 2 pairs merged, and 2 of the kept findings downgraded to low.

| Group | Findings | In diff |
|---|---|---|
| 1 Dated prompt text | 16 | 7 |
| 2 Brittle skill and config files | 13 | 5 |
| 3 Tool descriptions, deny and nudge text, routing text | 9 | 3 |
| 4 Request config and architecture | 2 | 0 |

Group 4 covers the hooks as prompt-assembly code; the roster check found no redundant agents.

**Dropped:**
- The master-vs-deployed CLAUDE.md finding. The deployed copy now matches the master.
- The Codex Stop-nudge channel (verify-before-stop.mjs:54-63). It is outside the Group 2 scope set for Codex.

**Merged:**
- The two orchestration:24 clauses became M11.
- The §6 nudge wording and its checker sentence became M13. They share a line, so they could not be separate hunks.

**Downgraded to low:**
- debugging:43-44. The two copies agree and guard a real failure (keep-list 5 and 8).
- session-start.mjs:46. No documented row matches cleanly.

**Proof:**
- `git apply --check` passes.
- The diff applied to a copy of HEAD passes `node --test tests/hooks.test.mjs tests/codex-runtime.test.mjs tests/pack.test.mjs` at 22/22.
- `node --check` is clean on the three changed hooks.

## Findings

### F1. session-start.mjs:23 vs capability-routing.md:22
- **Location:** `claude-home/hooks/session-start.mjs:23`; `claude-home/skills/nebi-maintenance/references/capability-routing.md:22`
- **Evidence:** Hook: "Use select_browser with this device; never switch_browser; never ask which browser." Routing: "never `switch_browser` unless the user asks this turn to pair or switch".
- **Pattern:** Group 2, instruction files that contradict each other. Also Group 1e: no reason sits next to the prohibition.
- **Why obsolete:** The routing file, the hook guard (ASKS_TO_PAIR) and the nebi-browser mod all allow the call when the user asks. This line, injected at every session start, forbids it. The reason (a pairing pop-up in every Chrome) appears only in the deny text. Both lines come from `714df84` and the fix loosens a prohibition.
- **Confidence:** High
- **Action:** flag. Suggested: `Use select_browser with this device. Call switch_browser only when the user asks this turn to pair or switch browsers, because it sends a pairing request to every Chrome. Don't ask which browser to use.` tests/hooks.test.mjs:310 asserts the current string and needs the same edit.

### F2. nebi-sessions:71 vs CLAUDE.md:135 (and codex-home/AGENTS.md:153)
- **Evidence:** Sessions: "Never open the session yourself: no terminal, tab, window or interactive `claude` launch. The user pastes it." CLAUDE.md: "Open a terminal, tab or session only when I ask in that message; otherwise put a paste-ready prompt in your reply."
- **Pattern:** Group 2, instruction files that contradict each other.
- **Why obsolete:** Both harness cores and nebi-session-guard's MAIN_DENY allow opening a tab when the user asks. The skill bans it outright and gives no reason that would make it a task-scoped override. All three lines come from `714df84`, and the skill line is a prohibition.
- **Confidence:** High
- **Action:** flag. Suggested: "Open the session yourself only when the user asks for it in that message, using the core's terminal helper; otherwise do not open a terminal, tab, window or interactive `claude` launch. The user pastes it."

### M1. Scout binding still on Sonnet 5
- **Location:** `claude-home/CLAUDE.md:34`, with the date on :27; date parity at `codex-home/AGENTS.md:26`
- **Evidence:** "| Scout / online research | Sonnet 5 | no |" and "Bindings as of **2026-09-23**:"
- **Pattern:** Group 2, volatile specifics and pinned model names.
- **Why obsolete:** The migration guide calls `claude-sonnet-5-5` "The current Sonnet", at the same prices. The table's own refresh rule applies. This row (`ffb9903`) was skipped when `648ab8f` updated the other rows.
- **Confidence:** Medium. That the Claude Code model picker offers Sonnet 5.5 was not verified.
- **Action:** rewrite. Change the row to `Sonnet 5.5`. Bump the date to 2026-10-03 in both cores, because `deploy.mjs` `reportBindingsParity` warns when the dates differ. The Codex table itself is unchanged.

### M2. "Nothing else" contradicts the doctrine's disclosure rules
- **Location:** `claude-home/CLAUDE.md:67`
- **Evidence:** "- Say what changed, what's next, and whether you need me. Nothing else."
- **Pattern:** Group 1f cut-the-detail clamp and Group 1d update suppressor. Also a contradiction inside the same file.
- **Why obsolete:** Read literally, it bans the notes the file requires: §3b:74-76, §4:85 and :87, and §10:129. Opus 5.5 under-narrates when suppressors are present. Line 66 already sets the length goal. Blame: `e010826` (2026-07-03).
- **Confidence:** Medium
- **Action:** rewrite to: `- Say what changed, what's next, and whether you need me, plus any deviation or one-line note this doctrine asks for (§3b, §4, §10).`

### M3. Effort rule phrased as a diff against Opus 5
- **Location:** `claude-home/CLAUDE.md:38`
- **Evidence:** "Opus 5.5's default `medium` matches Opus 5 at `high`, so the helm and default builder run at `medium`;"
- **Pattern:** Group 1d, migration-relative phrasing.
- **Why obsolete:** It justifies a migration that is already done. It also misquotes the source: medium *exceeds* Opus 5 at high.
- **Confidence:** Medium
- **Action:** rewrite the opening to: `**Effort:** the helm and default builder run at `medium`, Opus 5.5's default;` The rest of the line is unchanged.

### M4. Unconditional plan-before-acting rule
- **Location:** `claude-home/CLAUDE.md:58`
- **Evidence:** "Before implementing, state the goal, what "done" looks like, and a short plan."
- **Pattern:** Group 1b, plan before acting. It is in tension with §1:48 (trivial work handled inline) and the output style's "Answer first".
- **Why obsolete:** Current models plan unprompted, and an unconditional rule leads to over-planning on one-line edits. The rewrite keeps the user-facing plan for non-trivial work.
- **Confidence:** Medium
- **Action:** rewrite to: `Before implementing anything past a trivial change, state the goal, what "done" looks like, and a short plan, then build. The `nebi-orchestration` skill has the fleet rules.`

### M5. Narration ceiling and closing-summary ban
- **Location:** `claude-home/output-styles/nebi.md:25`
- **Evidence:** "**Answer first.** No recap of earlier steps and no closing summary. Between tool calls, at most one short line per phase."
- **Pattern:** Group 1d update suppressor and Group 1f numeric ceiling.
- **Why obsolete:** Opus 5.5 already says little between tool calls, and its longer notes come back as thinking blocks. The guide says to state *when* text is wanted instead. This is the user's own rule from `714df84` (SOURCES.md:187), so they may decline.
- **Confidence:** Medium
- **Action:** rewrite to: `**Answer first.** Open with the outcome (what you found or changed, and what it means for the user), with no recap of the steps that got you there and no summary tacked on after it. Between tool calls, write one short line when you start a new phase or find something that changes the plan.` The rest of the line is kept. `codex-home/AGENTS.md:75` mirrors the old wording and is not edited, because it serves a different target; mirror it if you want the harnesses identical.

### M6. Code-quality rule predates the doctrine's qualifier
- **Location:** `claude-home/rules/code-quality.md:11` vs `claude-home/CLAUDE.md:111` (§7) and §5
- **Evidence:** "Structure for that from the start." vs §7 "without speculative abstraction" and §5 "Match the existing style."
- **Pattern:** Group 2, conflict. The older passage (`e010826`, 2026-07-03) is rewritten to match the newer one (`e075adf`, 2026-09-08).
- **Why obsolete:** The rule loads on every code file, and the unqualified wording pushes layers into small scripts and existing repos. The replacement is narrowed to what §7 and §5 actually say, so the prohibitions on lines 15-16 stay as they are.
- **Confidence:** Medium
- **Action:** rewrite to: `Structure new systems for that from the start, without speculative abstraction; in an existing codebase, match its structure.`

### M7. Higgsfield schema lookup names a missing tool
- **Location:** `claude-home/skills/nebi-maintenance/references/capability-routing.md:32`
- **Evidence:** "(for example `models_get` or the installed CLI's `model get` after checking current help)"
- **Pattern:** Group 2, volatile specifics.
- **Why obsolete:** The live connector has no `models_get`. `models_explore` takes `action: "get"` ("use get for model constraints"), confirmed from its schema this session. The evidence comes from an installed tool, not the repo, hence medium.
- **Confidence:** Medium
- **Action:** rewrite to: `(for example the connector's `models_explore` with `action: "get"`, or the installed CLI's `model get` after checking current help)`

### M8. BrowserSkill trial narrative inside a routing rule
- **Location:** `claude-home/skills/nebi-maintenance/references/capability-routing.md:24`
- **Evidence:** "Tencent BrowserSkill (`bsk`) was tried and removed on 2026-09-23 because these controllers cover the user's work; ... `bsk doctor` must pass with the extension connected."
- **Pattern:** Group 2, history narrative.
- **Why obsolete:** The dated trial adds nothing to the current rule. Its last clause reads as a live check for a tool that is not installed. upstreams.json:971-989 holds the decision and the reinstall steps.
- **Confidence:** Medium
- **Action:** rewrite to: `Keep the current native browser controller when it covers the task; for a terminal-only or recurring scripted browser need, the upstream register keeps reinstall steps for Tencent BrowserSkill (`bsk`). Do not invoke a second controller on a tab owned by another session, change the user's profile settings to remove confirmation, or assume installing a skill makes the runtime available: its own doctor check (`bsk doctor` for BrowserSkill) must pass with the extension connected.`

### M9. Caps STOP in a skill body
- **Location:** `claude-home/skills/nebi-debugging/SKILL.md:37`
- **Evidence:** "**If you've tried 3+ fixes and it's still broken: STOP and question the architecture.**"
- **Pattern:** Group 1a, pressure language in behaviour text.
- **Why obsolete:** The caps date from v1 (`e010826`). Current models over-apply caps, and the reason already sits next to the rule.
- **Confidence:** Medium
- **Action:** rewrite to: `**If you've tried three or more fixes and it's still broken, stop and question the architecture.**`

### M10. Read-limit behaviour in nebi-prompting's routing description
- **Location:** `claude-home/skills/nebi-prompting/SKILL.md:3`
- **Evidence:** "During sharpening, do not scan or search a repository unless ... an exact source file the user supplied or named."
- **Pattern:** Group 3, trigger/behaviour split. Also Group 2, the same rule kept in two places.
- **Why obsolete:** The body (lines 16-23) rules on this in more detail, so the model reconciles two wordings of one rule on every request. Routing is fully covered by the first sentence and the "Not for" list.
- **Confidence:** Medium
- **Action:** rewrite (move) by dropping the two sentences. Re-run the trigger suite (14/14 at `f0e6563`) and the 12 evals first. `evals/evals.json:110` checks behaviour, not this text. If repo scanning before the skill loads returns, restore only the first clause.

### M11. Opus 5-era trait number and blanket verifier clause
- **Location:** `claude-home/skills/nebi-orchestration/SKILL.md:24`, vs :86 and CLAUDE.md §1
- **Evidence:** "many similar items (it stops at 35 of 50), ...; judging its own work, so verification goes to a fresh agent;"
- **Pattern:** Group 1a trait claim and Group 1d model workaround. Also Group 1c, two wordings of one rule.
- **Why obsolete:** "35 of 50" comes from a 2026-06-02 post written before Opus 5.5. The self-judging clause is broader than :86 ("Two related edits by one owner do not alone require a checker"), and "use a subagent to verify" causes over-verification.
- **Confidence:** Medium
- **Action:** rewrite to: `many similar items, so give each item or batch its own agent and loop until none remain rather than trusting one long context to reach the end of the list; judging its own work where a checker is required (see the Reconcile section below), so verification goes to a fresh agent;` This matches `evals/evals.json:128`.

### M12. Early-stop nudge leaves out the valid ending
- **Location:** `claude-home/hooks/verify-before-stop.mjs:238-240`
- **Evidence:** "If the next step needs nothing from the user, take it now; otherwise end with ❓ Need you and the one thing you need."
- **Pattern:** Group 3 precision rubric. Also in tension with output-styles/nebi.md:15-19.
- **Why obsolete:** The nudge also fires on a reply with no status line at all. A finished, verified turn that forgot its line gets pushed into extra work or a needless question, against §4.
- **Confidence:** Medium
- **Action:** rewrite: insert "If the work is finished and verified, end with ✅ Done." before "If the next step". The regex at tests/hooks.test.mjs:138 still matches.

### M13. Proof nudge ignores read-backs and pushes a verifier sub-agent
- **Location:** `claude-home/hooks/verify-before-stop.mjs:267-271`
- **Evidence:** "this reply claims done ... run the relevant proving command ... dispatch one small fresh checker rather than self-certifying."
- **Pattern:** Group 1d verification scaffolding (Opus 5 migration: delete it at no cost). Also the Group 3 precision rubric.
- **Why obsolete:** `LEDGER_TOOLS` excludes Read, so reading a file back (CLAUDE.md:100's proof for docs) always trips the nudge. It then asks for an extra command, against :105 and :107. `DONE_RE` only guesses at a done-claim. §1 Checkers already governs when a checker runs. Blame: `e075adf`.
- **Confidence:** Medium
- **Action:** rewrite to: `Soft check (§6): this reply reads as a done-claim, but the command-order heuristic found no known-successful Bash result after the latest tracked edit. It cannot see Read-tool read-backs, judge whether a command was relevant, or track shell-side writes. If proof for this change is still missing, run the command that observes the changed behaviour and read its output before claiming done; if the proof was a read-back or an earlier relevant check, name it instead of running another command.` The tests match only `command-order heuristic`, which is kept.

### M14. AGENT_STOP deny invites deleting the kill switch
- **Location:** `claude-home/hooks/steer-channel.mjs:90`
- **Evidence:** "AGENT_STOP file present — owner halted the run; remove ${STOP_FILE} to resume"
- **Pattern:** Group 3: the deny gives no "do this instead" (mods/CONTRACT.md:91).
- **Why obsolete:** "remove ... to resume" reads as addressed to the model, and nothing says to stop calling tools. The rewrite is stricter, not looser.
- **Confidence:** Medium
- **Action:** rewrite to: ``deny(`Nebi halted every tool call with ${STOP_FILE}. Make no more tool calls this turn; end with ❓ Need you and say the run is paused until Nebi removes that file.`);`` Tests check only `permissionDecision`.

### M15. Context helper given as a non-executable bare path
- **Location:** `claude-home/hooks/session-start.mjs:60`
- **Evidence:** "Context helper: ${helper}. Use show --cwd <directory> --session <id> for this task; list --all only for a requested cross-project overview."
- **Pattern:** Group 2, volatile specifics (command form).
- **Why obsolete:** `deploy.mjs:159` makes only `nebi/browser-open` executable, and the deployed context.mjs is mode 644. context.mjs:248 and nebi-sessions:18 both use `node … context.mjs`.
- **Confidence:** Medium
- **Action:** rewrite to: `` `Context helper: run node ${helper} show --cwd <directory> --session <id> for this task; node ${helper} list --all only for a requested cross-project overview.` `` No test matches this string.

### F3. Mods done bar restated with drifting failure strings
- **Location:** `claude-home/skills/nebi-maintenance/SKILL.md:48` vs `mods/CONTRACT.md:119` (and nebi-mod-verify:37)
- **Evidence:** Maintenance: "no `refused` or `not loaded` line". Contract: "no `refused` or `does not load` line in the debug log".
- **Pattern:** Group 2, duplicated information that has drifted.
- **Why obsolete:** Both lines come from `714df84`, so history cannot order them. check.mjs covers both strings today.
- **Confidence:** Medium
- **Action:** flag. Suggested: point the maintenance line at the CONTRACT done bar instead of restating it.

## Low-confidence flags (report only)

| # | Location | Evidence | Pattern | Note |
|---|---|---|---|---|
| L1 | CLAUDE.md:33, :36 | "Fable 5.1" on the audit and checker rows | G2 volatile binding | The request relayed for this run said "i dont want fable 5.1 agents ... a bit more opus agents". If that is a standing preference: `Opus 5.5 (Fable 5.1 when I name it)`, with the date bumped in both cores. The user decides. |
| L2 | CLAUDE.md:38 | "heavy builder, audit and checker work runs at `high`" | G1d unenforced | Only nebi-checker sets `effort: high`. Add agent definitions, or say that `high` applies only to the checker and to sessions started at `high`. |
| L3 | CLAUDE.md:105, :107 | "Stop after decisive evidence" / "backstop, not a reason to run more checks" | G1d re-test candidates | Keep. Test removal on evals. |
| L4 | CLAUDE.md:49, :119 | "No automatic scout or checker" / "do not dispatch one for a few local files" | G1d re-test candidates | Keep. They fit the cost posture. |
| L5 | CLAUDE.md:107 | "Perfect!," or "Done!" | G1e tic list | Possible: "name what is still unverified instead of hedging or celebrating". |
| L6 | CLAUDE.md:64 | "**Lead with the state.** Every reply ends with..." | G2 label vs body | "**End with the state.**" |
| L7 | CLAUDE.md:84 | "ask ONCE" | G1a caps | "ask once". |
| L8 | rules/writing.md:27 | "robust, comprehensive, ... stunning" | G1e ban list | Has a real reason. Optional retune of ordinary words. |
| L9 | rules/code-quality.md:15-16, :31 | bold "**not**", "**Never**", "**does not**" | G1a | Optional: drop the bold. |
| L10 | commands/sharpen.md:1 | no frontmatter ("sharpen: Sharpen") | G3 vague one-liner | Add a `description:`, or `disable-model-invocation: true`. |
| L11 | nebi-maintenance:32 | Codex config defaults and caps | G2 unverified facts | Add a source and date in SOURCES.md. |
| L12 | capability-routing.md:16 | "(doctor 42/42 on 2026-09-23)" | G2 history receipt | Already in upstreams.json:644. |
| L13 | nebi-debugging:45 | sleep → polling | G2 known to the model | Optional removal. |
| L14 | nebi-debugging:43-44 (downgraded) | two "never ... to go green" lines | G1c repetition | They agree and guard a real failure. If you consolidate, fold "or delete" into :43. |
| L15 | agents/nebi-scout.md | no `effort` field | G4 thinking config | It inherits `xhigh` under Ultracode. `effort: medium` is a cost call. |
| L16 | nebi-prompting:18-19 | literal phrase lists | G1d patch accretion | Trial removal only with the 12 evals re-run. |
| L17 | verify-before-stop.mjs:225 | "wait for it ... before claiming done." | G3 precision | Possible: ", or end with ⏳ Working and name what is still running." |
| L18 | steer-channel.mjs:84 (mirrors nebi-browser register.tsx:119) | "Call select_browser ... instead." | G3 no route to what the user wants | Possible: "if the user wants to pair or switch browsers, ask them to say so in their next message". Edit both copies and their tests. |
| L19 | session-start.mjs:27 | "restart it with" | G3 ambiguous referent | "restart this session with". |
| L20 | session-start.mjs:46 (downgraded) | "Read the active core for role bindings" | G3 undefined term | "Role bindings are in §1 of the loaded CLAUDE.md/AGENTS.md". tests/codex-runtime.test.mjs:89 is unaffected. |
| L21 | steer-channel.mjs:101-116 | no `agent_id` check; "Operator" names no author | G4 harness architecture | A sub-agent can consume the lead's steer note. Naming an author raises the injection trade-off. The user decides. |
| L22 | mods/nebi-session-guard register.tsx:18-19 | "only when he asks you to open it, run ... term.mjs --tab" | G3 contract mismatch | Unconfirmed: a missed ASK match may invite a retry that is denied again. Test before rewording. |

## Kept on purpose

The lanes' keep lists were spot-checked and stand:
- the §0 obedience emphasis
- the dated bindings table, which deploy checks for date parity
- the routing descriptions' calibrated urgency, measured by the trigger suites
- the §6 evidence tiers
- the fragile command contracts (context.mjs, upstreams.mjs, the mod-verify scripts)
- the REPOSITORY DATA and SAVED CONTEXT DATA delimiters
- the red-button, browser and session-guard denies that already say what to do instead
- the nebi-checker "would block the merge" bar
- copies that agree with each other: the §0 preamble and the named-upstream rule (keep-list 8)