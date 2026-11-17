# Evaluation and regression checks

Run `node scripts/verify.mjs` from the repository. No dependencies or model calls are installed by that command. Tests use disposable targets, preserve real home state, and remove their fixtures. Platform-specific shell checks are explicitly skipped where unavailable; CI configuration is not evidence that those jobs have already passed.

## Four different evidence types

| Type | What it proves | What it does not prove |
|---|---|---|
| Structural check | Valid pack frontmatter, references, case structure, core section/date parity | Semantic doctrine parity or skill recall |
| Executable fixtures | Concrete deploy/hook/runner behavior against controlled inputs | Actual hook delivery in every installed client |
| Trigger loader | The candidate's invocation in a completed restricted CLI session | Successful task execution or recall in another catalog |
| Decision/action probes | Observed choices, reads/writes, and outcome for supplied tasks | Broad reliability from one trial |

Keep those denominators separate. Historical scores in `claude-home/nebi/benchmarks/` refer to their recorded versions and protocols.

## Trigger cases

The source runner reads the adjacent skills by default. `--skills-dir` selects a different reviewed pack without deploying it. Use `--help` for flags. Headless mode requires an explicit model and a compatible installed Claude CLI; it stages a temporary `nebi-eval` plugin because restricted mode on the tested CLI does not register project-folder skills in the init listing. Only that namespace is normalized by the grader. Eval directories are not exposed in the plugin.

`--cases tests/cross-skill-triggers.json` tests overlap. Each row has a target `skill`, `prompt`, `kind` (`fire`/`not`), and optional `requiredSkills` / `forbiddenSkills`. Required co-fires are checked in the same session, not inferred from separate trials. Unknown or contradictory skill names are rejected. Observe all fired skills, not just the target. Reports retain source hashes, exact cases, model/client, registry, and PASS/FAIL/ERROR; raw streams are not retained because they can contain account and task data.

For description tuning, freeze criteria before editing, reserve held-out cases, and repeat borderline cases on both versions with the same setup. Keep the model's evaluator role independent from the author. Do not claim a reliability gain from a single successful trial or a small noisy score change. A hypothetical classifier selecting a skill name is not a live-loader test.

## Disposable action tasks

```sh
node scripts/prepare-action-evals.mjs /tmp/nebi-actions
```

The destination must be empty. The script writes six inert task directories and `tasks.json`, with a real bug/proof pair, a foreign state note, conflicting versioned research sources, an invalid YAML skill, a solo JSON edit, and an ordinary editing request.

Give a fresh worker only its task row, its named skill, and access to that task's directory. Do not show it this checker, expectations, prior reports, or other agents' answers. Record its actual tool sequence and output. After execution:

```sh
node scripts/prepare-action-evals.mjs --check /tmp/nebi-actions
```

The artifact checker reruns the original debugging proof, checks protected inputs and requested edits, and applies narrow checks to the research/handoff artifacts. Independently review the prose and tool order; text matching cannot prove that a source instruction was never executed. Record failed attempts as well as successes. Remove only the disposable directory you created when no longer needed.

The `evals/evals.json` cases remain decision probes unless an evaluator actually performs a fixture task. Send only `prompt`, the selected skill, and setup artifacts to the worker; keep `expected_output` and `expectations` for the judge. A `followup` is a second turn, sent only after the first result, never appended to the initial prompt.

Prompting case 9 now ships `evals/fixtures/analytics/setup.py`. Run it with Python 3 into an empty disposable directory before turn one. Its two-table SQLite fixture reconstructs the earlier benchmark: two old rows, empty target, reader and query log using only the target. After the two-turn migration, inspect row preservation, old-table removal, and the actual checks performed before dropping it. This fixture does not model a production migration.

## Plugin evals: does a skill beat plain Claude?

`node scripts/plugin-eval.mjs <skill> [--runs 6] [--case <glob>]` runs the cases in `tests/plugin-evals/<skill>/` twice through `claude plugin eval`: once with no skill and once with the skill from `claude-home/skills/`, both with the Claude core and Nebi output style appended. `scripts/eval-decide.mjs` then applies the rule fixed before the 2026-09-27 verdict run: one-sided stratified permutation test on run scores, "better" only at p < 0.10 and a gap of at least 20 points. These cases are real failures plain Claude still made with the doctrine loaded; re-run them after editing the skill that owns them. The script's header lists the harness gotchas. Each run costs about $0.25–1.25 at list price on the logged-in account.
