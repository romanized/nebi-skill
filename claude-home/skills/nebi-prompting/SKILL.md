---
name: nebi-prompting
description: "Use when the user wants a prompt, brief or plan for another session, agent or tool, or gives rough, spoken, scattered or multi-part instructions or an idea that should become one, including mixed dumps, even if they never say prompt or sharpen. Preserves their wording and intent while a superbrain pass finds gaps and improves the idea (restructure-only when they ask to keep their words), saves the brief to a file, and returns one activation line with launcher, model, effort and ultracode set. Not for ordinary well-scoped execution, prose editing, summaries, image adjustments, questions or implementation about prompting itself, a rough bug report that is executable as-is (nebi-debugging), or resuming prior work (nebi-sessions)."
---

# Briefs: superbrain the idea, save it, hand back one line

The active harness's direct-instruction override always wins.

## What this produces

A **brief**: a saved Markdown file that is the complete task for a fresh executor, plus one **activation line** the user pastes to run it. The brief body stays out of chat unless the user asks to see it.

One brief per session that will run it. A research-then-build chain that one session runs is one brief with ordered stages and a clear hand-over point between them. Work for different sessions, tools or parallel lanes gets one brief each, and a later brief names the earlier output it consumes in the user's own sequencing words.

If this skill loaded for an ordinary action request (rough wording, but the user wants it done now rather than a prompt), organize the instructions internally and do the work: no brief, no gate.

## Superbrain pass (default)

Think it through deeply, the way the user would with a free afternoon: what they actually want and for whom, the scope they intend, what done looks like and how to prove it, what would look done but is not, what is missing, what could go wrong, which installed skills and setup fit (sized per the core). Dictation mishears names and terms; repair them from context. Your own reasoning beats any checklist, so none is given here; these are the boundaries:

- **Live facts.** Check claims about this machine at the live source (the repository, the real config, a quick read-only call), not from notes, memory or earlier briefs, which go stale. Read only what settles a question; never inventory a repository, and read nothing local when the user says not to. Under Context, say which facts you checked.
- **Improve freely, mark it.** Mark each substantive addition `(added)` so the user can strike it. Never override what the user fixed (constraints, exclusions, priorities, sequence, gates, named examples, a model or mode they chose), and never write an approval they did not give. When they ask to keep their wording or add no decisions, restructure only and offer your ideas in chat. Named examples are not the list: keep each one and add a bounded search for better ones, held to their bar or, if none, read at source, maintained, actually used, clearly better than what exists.
- **Defaults, not blockers.** Ask only what only the user can decide, once, each with a recommended answer, and write that answer into the brief as the default so the line works even if they never reply. Hold the line back only when a question has no safe default: an unknown target system or source of truth, or an irreversible or costly choice.
- **Answer what they asked.** When the user's message also asks you something directly (is X legit, is this possible), answer it in chat in a line or two.
- **Fresh read.** Run the helper's `review` with the core's highest-capability binding whenever the brief will run without you watching: a new session, a handoff, a fleet, or any irreversible step. Fold in what would change the work or its proof and drop style notes. Skip it for a small brief you run here and now, or when the user asks for quick.

## Brief shape

```markdown
# <title>
Made <date> · project <path, or none>
Run: model=<m> effort=<level> ultracode=<yes|no> · <why, one line>

## Goal
## Context
## Constraints
## Done when
## First moves
```

- **Goal:** the outcome, for whom, at what scope, with one scope line: deliver what was asked at the intended scope; a bigger win gets one sentence and the work continues.
- **Context:** only what the executor cannot find by reading the repository: decisions and why, preferences, approaches already tried and failed, dated prep findings, and paths to plans, checkpoints and earlier briefs. Point, don't paste.
- **Constraints:** what it may and may not touch, the user's gates and sequence, approvals needed before irreversible steps.
- **Done when:** the runnable check and the observable end state; a `Doesn't count:` line naming the near misses; a budget in turns or time; the rule that the executor may not edit or weaken its own check; when to stop and bring Nebi in (a check still failing after three rounds, a decision only Nebi can make). Leave out generic "verify everything", "double-check" and "keep going" lines; the executor's doctrine carries those, and they cause over-verification.
- **First moves:** the skills to load, the fleet shape when ultracode is on, the first step.

A heading with no material reads `Not supplied.` rather than invented content. A handoff brief also carries `Not verified`; nebi-sessions has the handoff content rules. A brief for a tool that is not a Claude session uses the same shape.

Current-turn controls (sharpen, split, don't run yet, return a prompt) govern this reply and stay out of the brief unless the user states them as constraints for the executor. The brief tells the executor to do the underlying task, never to write another prompt unless the user asks for that recursion. Keep a reusable brief at the scope the user asked for: whatever store, account or example happens to be active is an input, not the scope.

## Save and activate

The helper is `scripts/brief.mjs` beside this file (deployed: `~/.claude/skills/nebi-prompting/scripts/brief.mjs`); `--help` lists its flags.

- `save --cwd <project> --session <id> --slug <name> [--kind handoff]` reads the brief on stdin and prints its path in the task's `briefs/` (or `handoffs/`) folder in the shared store, which every Claude account on this Mac can read. With no session or task it falls back to the store's `briefs/`.
- `review <path> --model <id> --cwd <project>` runs the fresh read with read-only tools and no MCP servers.
- `activate <path> --cwd <project> [--cloud | --paste]` prints the line, shaped like `cd ~/Documents/GitHub/app && claude-team -n onboarding --model <m> --effort high 'Run the brief at <path>'`. It reads the settings from the brief's `Run:` header, so they live in one place; its `--model`, `--effort` and `--[no-]ultracode` flags override. The launcher comes from the project's `.claude/browser.json` account, else the current session's account.

Settings come from the core: the model it binds for the job, the effort its list gives for the work (never `max` unless the user names it), and `--ultracode` only for two or more sizeable independent workstreams or when the user asks for it. A model, effort or mode the user named goes in exactly as named.

Where it runs:

- **Here, now:** no line. Ask the user to say go, then run the saved brief as written without sharpening it again. `run it`, or a clear go-ahead in the user's words, skips that wait unless questions are open.
- **New local session** (the default for handoffs, ideas for later, and parallel lanes): the activation line.
- **Laptop closed:** `--cloud` inlines the brief into a cloud session started from the repository. A cloud session has none of `~/.claude` or `~/.agents`, so the brief must stand alone and the branch must be pushed.
- **Another tool:** `--paste` copies the brief to the clipboard.

## Reply shape

Keep chat short; the brief holds the detail. In order: the activation line alone in a code block; one line on what the brief will do; its path; one short line per addition that changes scope or cost (the user approves these without opening the file); direct answers to anything the user asked; questions with their defaults. Status: waiting for go or a no-default answer is `❓ Need you`; a saved brief for a new session is `✅ Done`, naming the line to paste.

## Gotchas

- A handoff that "made sense to me" stalls a fresh agent. Without a next step and a runnable check, the brief is not finished.
- The fresh reader is asked to find problems, so it always finds something; fold in only what changes the work or its proof.
- `claude --bare` needs an API key and fails on OAuth logins; the helper's review uses `--tools` and `--strict-mcp-config` instead. The CLI has no turn cap for `-p`, so the review is bounded by read-only tools, a no-broad-search rule and a timeout; a first trial still tried a disk-wide search.
- The project's `.claude/browser.json` account wins over the current one. When the brief's model exists only on some accounts, check that account has it (the core says how) and set `launcher=` in the `Run:` header if not.
- Whether `claude --cloud` honors `--model` and `--effort` is unverified, so the cloud line carries neither; set them inside the cloud session if they matter.
- `/goal` as the opening argument of an interactive `claude '<prompt>'` is unconfirmed; write the goal condition under Done when instead of in the activation line.
- Briefs live outside repositories. Never commit them, and redact secrets and personal data.
