---
name: nebi-prompting
description: "Use when the user gives rough, spoken, scattered, or multi-part instructions that need restructuring into an executable prompt or task brief, including mixed dumps, even if they never say prompt or sharpen. Preserve their wording and intent. Not for ordinary well-scoped execution, prose editing, summaries, image adjustments, questions or implementation about prompting itself, a rough bug report that is executable as-is (nebi-debugging), or resuming prior work (nebi-sessions)."
---

# Prompt sharpening: preserve the voice

The active harness's direct-instruction override always wins.

## Choose the requested outcome

An explicit prompt, sharpen, split-into-prompts, or review-before-execution request uses the artifact and gate below. If this skill loads for an ordinary action request, organize the instructions internally and carry out authorized work; rough wording alone does not create a `Go?` gate. Preserve any actual ambiguity or approval boundary.

## Bound the context

Choose the local-primer mode before reading anything:

- **General sharpening:** read no local state. References such as `our skill`, `our project`, or `our two Nebi skills` remain General unless paired with explicit prior-work language; they do not authorize any local read. Words such as `attached`, `supplied`, `provided`, `local`, `working directory`, or `current directory` describe inputs the future executor receives and also remain General on their own.
- **Ongoing local work:** activated only by an explicit reference to prior joint work on this machine, such as “this repo” or “we're already working in”; a bug or prior-progress mention alone stays General. When active, do both allowed checks before drafting when available: read only the selected task checkpoint identified by the startup context or explicitly supplied by the user, and if the current directory is a git repo, run `git status --short --branch`. If no checkpoint is selected, use the user's words; do not search other tasks or fall back to a global work note. Reduce each check to at most one relevant context line. From git status, carry only repo identity, branch, and clean/dirty state—never filenames or a repository inventory.

In either mode, an exact source file the user explicitly supplied or named is the only additional read allowed. Do not follow references from it. If a named file cannot be read, build the artifact from the user's own description of it and state the failed read in one line outside the artifact; it never becomes a claim about what the repository contains or a material question.

If the user explicitly asks you to investigate something so the prompt carries real facts, do that investigation: their instruction outranks these read limits. Put what you found under Context as dated prep findings the executor must re-verify. Without such a request, never enumerate, glob, or search the repository, and never report on repository contents or on whether a file exists. Do not open or read the files git status lists, and do not infer scope, technology, acceptance, or intent from local state. Compare the note's project with the active directory/repo; if allowed primer facts conflict and the user has not already resolved the source of truth, ask about the mismatch outside the artifact. An explicit instruction to use the active repo and ignore a foreign note resolves it; leave that note unchanged.

## Separate control from the target task

- Current-turn controls—sharpen or split, return a prompt, run or do not run now, and evaluation-only instructions—govern artifact structure and the gate. Keep them out of the artifact unless the user explicitly states them as constraints for the future executor.
- Instruct the target agent to perform the underlying task. Never instruct it to create another prompt unless the user explicitly requests recursive prompt generation.

Canonical example: `Sharpen this; do not inspect local files; return a prompt, not the result` means obey those controls now, omit them from the artifact, and tell the target to perform the underlying task.

## Sharpen faithfully

- Reorganize the user's input; preserve their voice and reuse their phrases where they work.
- Make the smallest clarity edits needed. Remove repetition, not meaning.
- Every substantive phrase must trace to the user's input, an exact user-supplied source, the bounded primer above, or a listed addition below.
- Improve, don't invent. Add something only when the user's own goal clearly needs it and it is reversible: widen named examples (next rule), add the proof step a change needs, or name an input the executor must fetch. Put each addition in the artifact and list them once after all artifacts as `What I added:` so the user can strike any. Never add roles, technologies, vendors, deadlines, install decisions or delegation the user did not ask for.
- Named examples are not the list. When the user names skills, tools, sites or sources as examples of a category, keep every named item as a must-include and add one bounded step to look for better ones in that category and the areas the user works in, held to the user's quality bar or, if none is given, to: read at the source, maintained, actually used, clearly better than what exists.
- Preserve explicit constraints, priorities, exclusions, sequence, success conditions, and stop or approval gates.
- Keep a reusable prompt at the scope the user asked for. Do not narrow it to whatever store, account, connector or example happens to be active in this session; name those as optional inputs or examples instead.
- Make the deliverable concrete from supplied specifics; do not replace them with vague phrases such as “as needed” or “appropriately.”
- Ask only material questions whose answers could change the scope, source of truth, deliverable, safety, or execution. Ask them together once, each with a recommended answer the user can accept as-is; never guess. If missing acceptance is not material, leave it unstated.
- Files or content the future executor is expected to receive are not material questions unless their absence prevents defining scope; a named input's absence or unreadability is never material, because the future executor will encounter the same file. Preserve non-material naming ambiguity with the user's own labels instead of asking.
- Missing task identity is material: an unnamed API, integration, target system, or source of truth that prevents defining the requested work must be asked before any execution. Do not search a repository to guess what an unspecified label means.
- Executor mechanics are not material when the outcome and constraints are already supplied. Do not ask the user to choose examples, implementation mechanics, direct edit versus proposal, or a comparison baseline that a named source naturally provides; leave those decisions to the future executor. A missing environment or authority for destructive live action remains material unless the user scopes execution to a disposable or test target.

## Copy-ready artifact

In explicit-artifact mode, always show the artifact before executing the underlying task. Produce one artifact per independently executable job or paste target, in the user's execution order, unless the user explicitly asks for one combined prompt. A research-then-implementation chain is two artifacts because the settled research is a handoff, not one blended job. When prompts are dependent, each later prompt names which earlier prompt's settled output it consumes, in the user's own sequencing words. Use this literal shape:

````markdown
Prompt 1 — [paste target]
```text
## Goal
[faithful goal]

## Context
[only supplied or bounded context]

## Constraints
[preserved constraints and gates]

## Deliverable
[specific requested output]
```
````

Replace every bracketed field. If a required section has no source material, write `Not supplied.` rather than inventing it. Keep the descriptive label outside the fence. Inside each fence, use only the four headings shown, in that order, plus their content. Keep commentary, questions, sequencing notes, `Go?`, and status outside every fence. Preserve stated success and stop conditions under the existing headings; do not add `Success` or `Stop` headings.

If you made additions, list them in one unfenced `What I added:` line after all artifacts. If material questions remain, append exactly one unfenced block after that, deduplicated across artifacts:

Questions for Nebi (not part of the prompt)

1. [material question] — recommended: [default answer]

Omit that block when there are no material questions.

## Echo and execution gate

This gate applies to explicit-artifact mode only. Ordinary authorized action uses the execution route above.

- **Default — without `run it`:** show the artifact(s), ask the literal question `Go?` outside every fence, and stop. End that reply with the waiting status `❓ Need you`, never `⏳ Working` or `✅ Done`.
- With no questions, `run it` skips only `Go?`: show the artifact(s), then execute them. It never skips scope, safety, or authority checks. A clear execution go-ahead in the user's own words counts the same as the literal `run it`, including one given in an answer message.
- Questions override `run it`: show the draft artifact(s), ask the single questions block, then stop with no `Go?` and no execution.
- After answers, update and show the artifact(s) again; if the answers raise new material questions, ask them the same way before any `Go?` or execution. If the triggering request said `run it`, execute only after that echo; otherwise ask `Go?` and stop.
- Before execution, decide material questions from the user's words and the allowed primer/source reads only. Do not run a repository search or other task tool to discover missing scope during sharpening, unless the user asked for that investigation (see Bound the context).
- After approval, execute the shown artifact without sharpening it again. Execute dependent artifacts in order. If an exact named file cannot be read, complete any earlier unblocked research artifact first, then report the edit/test stage as blocked without inventing a file, widening scope, or turning the failed read into a pre-execution question.

## Pre-send QA

- **Labels:** every artifact has one descriptive external label.
- **Fences:** every label is followed by one closed `text` fence; no prompt content leaks outside.
- **Headings:** each fence has exactly Goal, Context, Constraints, Deliverable in order.
- **Placeholders:** every required section with no source material reads exactly `Not supplied.`; paraphrases such as `No context was supplied.` fail this check.
- **Artifact count:** each independently executable job has its own artifact; research and the implementation that consumes it are separate.
- **Fidelity:** every substantive phrase is traceable to the user, an allowed read, or a `What I added` item; named examples survive and are widened into a bounded search rather than treated as the full list; wrapper controls stay out; the target performs the underlying task without accidental prompt recursion; supplied specifics and gates survive; nothing material was invented.
- **Contradictions:** conflicts between the user's own instructions are surfaced as material questions, never silently reconciled in the artifact.
- **Questions:** delete questions that merely request inputs the future executor will receive, ask for names already present as user labels, or delegate ordinary executor choices back to the user. Category labels already in the input, such as prompting and orchestration, count as names; do not ask for formal skill names. Conversely, an unnamed API or integration that leaves the task itself undefined must be asked before execution. A primer-mismatch question may name only the saved project/branch and the active repo/branch/clean-or-dirty state; strip filenames, file counts, commit inventories, and other repository contents.
- **Run-it readiness:** unresolved material questions mean zero task tools and zero execution; show the artifacts, ask once, and stop.
- **Status:** questions, `Go?`, execution, and the active harness's final status agree with the real state and stay outside fences. When waiting for answers or `Go?`, the final status is `❓ Need you`, never `⏳ Working` or `✅ Done`.
