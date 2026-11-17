# Multi-project context repair — 2026-09-08

## Defect and requested behavior

The user reported agents overwriting or reusing context from one project while working across many projects. The previous integration separated Codex and Claude runtime directories but retained one global `current-work.md` per client. Its foreign-project guard prevented some writes while still directing new sessions to the same unrelated note and leaving other projects without their own durable state.

Before implementation, a fixture started project B with a global note for project A. The real startup hook offered A's note and the regression failed. This pass fixes that storage/selection model, not merely the wording of a warning.

## Implementation

- Shared store: `~/.agents/nebi/projects/<project-id>/tasks/<task-id>/checkpoint.json`. Git common-directory identity groups worktrees; checkout/branch remains in each checkpoint. Same-named repositories and different clones stay distinct. Non-Git work uses its explicit directory.
- Each session gets its own task by default. Selecting an existing task is explicit and affects only that session. Other unfinished tasks are offered only from the current project, with same-checkout tasks first; newest does not mean selected.
- The lead saves goal, state, next step, decisions/evidence and explicit status at meaningful milestones, blockers or handoffs. Simple questions need no authored checkpoint. Hooks record separate session facts and cannot rewrite intent, decisions or completion status. Subagent hook events do not update the lead's session observation.
- Saves require the revision returned by `show`, serialize through an exclusive lock, atomically replace one checkpoint, and retain prior versions. A stale writer must reload and reconcile. A potentially live lock is never broken automatically; after a crashed writer, inspect the recorded PID before recovery.
- Both clients can resume the same task. `list --all` supports a requested cross-project overview; ordinary work does not load all projects. Handoffs have task-specific directories beside their checkpoints.
- Legacy imports preserve original notes and old handoff archives, label copied state unverified, and never guess a project from its name alone. An explicit confirmed project path can map a sparse legacy header; otherwise it goes to an unassigned inbox.
- Updated sessions/prompting guidance and all three cores remove global-note fallback. No extra skill, external dependency, background service, model setting or token optimization was introduced.

## Proof

- Baseline: actual startup fixture failed for the expected foreign-note path.
- `node scripts/verify.mjs`: 42/42 passed. Focused coverage includes cross-project and cross-client isolation, same-name projects, worktrees/subdirectories, explicit resume, stale revision rejection/history, actual simultaneous writers, subagent isolation, and non-destructive/idempotent legacy migration.
- The old hook test was updated to the new contract: legacy note bytes remain unchanged; failed Git reads appear as unknown in the separate session observation rather than being written over authored state.
- Two focused live prompting trigger cases passed: explicit prompt rewriting loaded prompting; a resume near-miss loaded sessions without prompting. [Source hashes and native results](2026-09-08-project-context-triggers.json). This is a two-case smoke, not broad recall evidence.
- Fresh independent Terra review found no material actionable issue and independently ran 18 focused tests successfully. Full reliability and cross-platform behavior are not inferred from this review.

## Deployment

Live deployment completed with `node deploy.mjs nebi-project-context-20260908`; installed verification confirmed 73 master files and the three Nebi hook configurations match. The native Codex loader still reports all five current hooks enabled/trusted. Both installed startup handlers were executed against this repository and returned only its project context, with no global/foreign work-note pointer.

Both legacy work notes were copied into separate unverified checkpoints, with original bytes unchanged. Codex's note supplied an absolute project path; the sparse Claude header was explicitly mapped using the Repo field in its named handoff, corroborated by the Codex note. Old handoff archives were left intact. The shared overview read back two project records, two imported checkpoints and no unassigned imports at this point; that is the initial migration state, not an inventory of every historical project.

Existing sessions retain their loaded instructions; fresh sessions load the new routing. Past native conversation archives are not bulk-imported, and no automatic project-history reconstruction is claimed.
