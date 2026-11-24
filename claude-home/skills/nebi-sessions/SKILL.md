---
name: nebi-sessions
description: "Read this before resuming or handing off work, not after. AI work-session context hygiene, session-start survey, honest status classification, and handoffs. Load it whenever the user picks up, resumes, or continues earlier work; asks what is actually done versus still open; starts a work session or wants the repo state surveyed first; hands off to another session or agent; is running low on context; or is deciding whether to start fresh. This applies even when the request is phrased as a direct command to carry on — load it first, then continue. Not for debugging a failure (nebi-debugging), and not about user login or auth sessions in application code."

---

# Context and sessions: protect the thinker, know where we are

The active harness's core §0 override always wins. This is the default posture when you are deciding alone.

## Session start — survey before acting

At the start of substantial work, use the current request, the selected task checkpoint when resuming, and the hot files or diff. Simple questions need no state ceremony. Dispatch a scout only when the reading is genuinely heavy, independent, and worth isolating. For a run long enough to compact, keep its task list in the checkpoint or a file, tick items as they finish, and read that list rather than the scrollback.

## Select context by project and task

- The shared store is `~/.agents/nebi/projects/<project-id>/tasks/<task-id>/`. Git common-directory identity groups a repository and its worktrees; the checkpoint retains its checkout/branch. Different clones and same-named folders stay separate. Without Git, the explicit working directory identifies the project.
- The startup hook supplies this project's context and native session id. Use `node ~/.codex/nebi/context.mjs show --cwd <directory> --session <id>` in Codex, or `~/.claude/nebi/context.mjs` in Claude Code. `show` is read-only and returns the selected checkpoint, revision, handoff directory, Git differences and up to five other unfinished tasks in this project.
- A new session gets a separate task by default. For a resume, match the user's intent to the task's goal and evidence; use `select --cwd <directory> --session <id> --task <task-id>` only for the intended task. Never adopt the most recent note automatically. Ask one narrow question only when several tasks still fit and the user has not resolved the choice.
- The same task can be resumed from either harness. Selection belongs to the individual session, not the project. Other sessions keep their own task. If a session id is unavailable, use an explicit task id; never invent a global active task.
- Use `list --all` only for a requested cross-project overview, then summarize by project, goal, status, last update and next step. For ordinary work, stay inside the current project's context. Done/cancelled/superseded tasks remain in the overview but are not offered as unfinished resume candidates.
- Legacy `~/.claude/nebi/current-work.md`, `~/.codex/nebi/current-work.md` and old handoff directories are archives, not default context. `migrate` copies legacy intent as unverified without changing the original; names without a verifiable path go to an unassigned inbox rather than being guessed.

The survey (reuse this skeleton):
- **Goal** — what are we actually trying to do?
- **Current progress** — what's built/working so far.
- **What worked** — keep doing.
- **What didn't work** — approaches already tried and failed. *Do not re-tread these.* (This is the whole point.)
- **Next steps** — the first unfinished thing.

For ongoing work in a git repo, check `git status` and the few recent commits needed to detect drift. A checkpoint's timestamp or matching HEAD is not proof that its claims remain true. If repository evidence conflicts with saved state, flag the mismatch before building on it. If the user already resolved it, proceed from that source of truth without asking again. Other projects' and tasks' checkpoints are not yours to rewrite.

## Returning after a break

“Nebi resume” means this procedure, not a separate memory store. In the same conversation, keep the user's latest goal and corrections; an idle interval alone does not justify restarting discovery or changing the plan. In a new conversation, use the project/task selection above. Native conversation resume restores conversation history; prompt caching concerns reuse of prompt computation, not which task to select. Native memory, including configured subagent memory, is secondary context rather than task-selection authority.

Read the selected checkpoint and only the evidence needed for the next unfinished step. Re-observe live browser tabs and check existing remote job IDs before reusing an old element reference or submitting work again. If a checkpoint is absent, recover from available conversation history and relevant artifacts, label remaining gaps, and ask only when task identity or a consequential decision is unresolved. Never reconstruct intent from the newest unrelated note.

## Classify status honestly — don't trust, verify

(This session-status vocabulary differs from the dispatch reporting contract in `nebi-orchestration`.)

When reporting or resuming, put every task in one bucket, and **re-verify prior claims against git/files** rather than trusting a previous "done":
- **DONE** — completed and verified against the requested scope. Label cancelled or superseded work separately; it is not evidence of completion.
- **PARTIALLY DONE** — started but missing implementation, tests, review, or confirmation.
- **NOT DONE** — not started, or only discussed.

Continue from the **first unfinished step.** Don't repeat completed work. Follow the established approach unless it's broken.

## Context hygiene — don't rot the thinker

- Read the smallest set of files that can answer the next decision. Do not map a whole codebase for one local question.
- Use a scout-to-brief handoff for genuinely heavy or independent reading. The scout returns a compact artifact with receipts; the planner or builder consumes that artifact rather than the raw transcript.
- Watch the active harness's context signal and the work still ahead. Hand off when earlier detail is displacing current facts, reasoning quality is slipping, or the next phase will not fit cleanly. There is no universal fixed window percentage.
- A compaction or summary must carry forward identifiers, decisions, constraints, error codes, per-task status, and the next action. One bad fact in a summary poisons everything downstream, so uncertain facts stay labeled UNVERIFIED.
- After compaction, do not assume earlier skill instructions remain available. Reload what the work still needs and re-fetch authoritative detail by path or identifier; retention differs by harness and version.

## Save useful progress and handoffs

The lead saves a checkpoint at meaningful boundaries: a substantial verified result, a pause/blocker, or a handoff. Do not turn every reply into bookkeeping. Workers return receipts to the lead instead of editing shared intent.

Use the same helper's `save` command with JSON on stdin: `expectedRevision` from `show` (`null` for a new task), `goal`, `lastState`, `nextStep`, and optional `notes`/`status`. Status is explicit: active, blocked, done, cancelled, superseded or unverified. Put decisions, failed approaches, evidence pointers and unverified claims in notes. Avoid transcripts and generic advice. A stale revision is rejected: reload, reconcile, and retry; do not bypass the guard with direct writes. Previous checkpoint versions are retained under that task's `history/`.

For substantial ongoing work, save before yielding after a meaningful result even when the user has not announced a break. Include the latest scope correction, accepted choices, output paths, pending job IDs and the next executable action when applicable; omit credentials. A sudden quit can lose intent since the last save, so hooks recording Git facts must never be described as saving all conversation decisions.

For a multi-step plan that may span sessions, keep its progress in these same checkpoint notes or the task handoff: the plan path, completed step identifiers with proof pointers, and the next unfinished step. When execution reveals a plan defect, record the adjustment, reason and consequence if wrong; preserve accepted user decisions and the existing authorization boundary. On resume, reconcile these entries with current evidence rather than replaying completed steps or silently changing the plan. This is not a second ledger or a requirement for small tasks.

Hooks update separate session observations containing repository facts. They cannot infer intent or proof, and never overwrite the checkpoint's goal, decisions, status or next step.

## When the user wants to walk away

A local session stops when the Mac sleeps or loses its connection. Remote Control only steers that local session from a phone; it does not keep it running. Work that must continue with the laptop closed needs a cloud session, so say which of the two the user is getting before they leave.

- **Cloud:** push the branch, then start it from the repository with the brief helper's `activate --cloud`, which inlines the saved brief into `claude --cloud` (it clones the GitHub remote at the current branch). Write the brief to stand alone: what is wrong, what done looks like, how to prove it. The user follows and steers it in the Claude app's Code tab, and `claude --teleport` brings it back to a terminal with a clean tree.
- **What a cloud session lacks:** it reads the repository's own `.claude/` and `CLAUDE.md`, not `~/.claude`, so this doctrine, the hooks, personal skills and mods are absent unless the repository carries them. It has no logged-in browser, no local database and no local-only credentials. Idle machines are reclaimed, so tell it to commit as it goes. It draws on the same plan limits, and a Team organisation may need cloud sessions switched on.
- **Stay local** when the task needs any of those, and say plainly that the laptop has to stay awake.
- Never report a run as "in the cloud" from the dispatch call alone: check where it ran (session list, or the result's working path) first.

When handing to another session:
- **The handoff is a brief, and it reaches the user as one activation line.** Write it with nebi-prompting (its superbrain pass, fresh read and brief shape) and save it with that skill's helper using `--kind handoff`; the helper's `activate` prints the line with the project folder, the account's launcher (from the project's `.claude/browser.json`, else the current account), model, effort and `ultracode` when a fleet is needed. The brief body stays out of chat. Open the session yourself only when the user asks for it in that message, using the core's terminal helper; otherwise do not open a terminal, tab, window or interactive `claude` launch. The user pastes the line.
- **Point, do not duplicate.** Reference existing plans, ADRs, commits, and diffs by path or URL instead of pasting them.
- Include the next session's purpose, relevant context, suggested next moves, artifact pointers, and each abandoned approach with one-line reasoning.
- Name the skills the next session should invoke for its first moves.
- Carry an explicit **Not verified** section — claims and states the handoff passes on without fresh evidence.
- **Check facts at their source before they go into a handoff.** Numbers, statuses and open items come from the files, data or code they describe, not from the conversation or a compaction summary, which go stale after corrections. Whatever you could not check goes under **Not verified**.
- **Don't hand the user work that is already done.** Before listing something as the user's to-do, look in the workspace for evidence it was completed (files, configs, notes) and mark it done if so.
- The helper saves handoffs in the task-specific `handoffs` directory that `show` returns, outside the repository and accessible to both harnesses. Reference that path in the checkpoint notes. Redact secrets and personal data; never commit runtime context.
