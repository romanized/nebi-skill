# Reliability checklist

Each item is a failure that already happened (see `AGENT-FAILURES.md` in the nebi-skill repo), written as a trigger you can read from a diff and a check that would have caught it.

How a checker uses it: read the diff, apply only the items whose trigger matches (usually a handful), and cite the item ID in each finding. An item that matches but passes needs no mention.

How items change: add one when a failure happened at least twice, or once with real damage, and its trigger shows in a diff. When `nebi-maintenance` triages the failure log, it rewrites or retires items that no longer catch anything.

## Code and tests

**R1. Entry point compares a URL with a raw path.**
- **Trigger:** `import.meta.url` compared with `process.argv[1]`, or a `file://` string built from a path.
- **Check:** `path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)`.
- **Behind it:** a string-built URL never matches on Windows or on a path with a space. The kill guard silently never ran (2026-11-17).

**R2. Path equality built two ways.**
- **Trigger:** two paths compared where one side uses `path.join`, string concatenation or `~` and the other `path.resolve`.
- **Check:** both sides go through the same normalizer.
- **Behind it:** the account check in `route.mjs` returned nothing on Windows because only one side got a drive letter (2026-11-17).

**R3. A test changed together with the code it judges.**
- **Trigger:** one diff edits a test, grader, eval or hook check and also the code that check covers.
- **Check:** the proof shows the changed check failing on the old code, or the diff explains why the old expectation was wrong.
- **Behind it:** a change that can edit its own check has no check. Graders were rewritten mid-eval (2026-11-16).

**R4. Platform-only behaviour in a cross-platform suite.**
- **Trigger:** tests that run a script through its shebang, use exec bits, POSIX shell shims or `HOME`, or that add a platform skip.
- **Check:** the skip keeps the file loadable, so hooks such as `test.after` still exist on the skipped platform, and CI covers every platform the matrix lists.
- **Behind it:** a Windows skip wrapper crashed the whole test file on load (2026-11-17).

**R5. Runtime floor.**
- **Trigger:** an extensionless ESM script, a `.ts` import, or a newer Node API.
- **Check:** the README floor and the CI matrix both support it.
- **Behind it:** Node 18 could not load either, and CI stayed red (2026-11-17).

**R6. Flaky fix.**
- **Trigger:** a retry, sleep, longer timeout or skip added to a test.
- **Check:** the diff names the root cause, or deletes the test and says why. A retry that turns a test green is not a fix.

## Claims and proof

**R7. "Tests pass" without the runner's summary.**
- **Trigger:** a commit message, report or handoff claims tests pass, or a script pipes a test run through `tail`, `head` or `grep`.
- **Check:** the evidence shows the runner's own pass/fail counts and exit code, and more than zero tests ran.
- **Behind it:** "52 tests passing" was written after `tail -3` cut off the summary, and the tree was red (2026-08-22). A dry run with 0 tests was counted as proof (2026-11-10).

**R8. A visible change proved off-screen.**
- **Trigger:** CSS, layout, animation or visual component changes.
- **Check:** the proof includes the owner's own window (about 1728 CSS px at DPR 2 on desktop) and a phone width, and motion is shown moving. Use the repo's `verify` skill where one exists.
- **Behind it:** a change was proved at 390 and 1440 px with motion as stills. Every gate passed, and the owner called the live site ruined (2026-11-13).

**R9. Measurement compared across setups.**
- **Trigger:** a report compares tokens, cost or latency between runs.
- **Check:** same account and configuration, totals from the usage record, and runs that cannot produce a signal skipped rather than paid for.
- **Behind it:** a 90× output-token undercount, a cross-account cost comparison, and $37.99 spent on two runs that could not answer anything (2026-11-16).

## Commands and state

**R10. Process kills and deletes.**
- **Trigger:** `pkill`, `killall`, `kill $(pgrep …)`, `rm -rf`, or deleting environment variables or records.
- **Check:** only the script's own PID; `rm -rf` only on a folder the same script just created; a variable deleted only after a grep shows nothing reads it.
- **Behind it:** a misordered `pkill` killed every other session and the owner's browser tabs (2026-10-12). Seven hosting variables were deleted and had to be restored from a backup.

**R11. Install or deploy writes onto user-owned files.**
- **Trigger:** deploy or install code that copies over a path the user may have edited.
- **Check:** a differing existing file is backed up once, or the file is only seeded when absent.
- **Behind it:** deploy overwrote a newcomer's own `CLAUDE.md` without a backup (2026-11-17).

**R12. Machine-specific identifiers or secrets.**
- **Trigger:** account, org or device IDs, emails, tokens or passwords, or a log line that prints environment variables.
- **Check:** placeholders in the repo, the real values in a gitignored or seeded local file, and secrets masked in any output.
- **Behind it:** account and device IDs reached a public repo's history, which then had to be squashed (2026-11-17). A checker re-printed a database password (2026-10-09).

**R13. Commits while other sessions write.**
- **Trigger:** `git add -A`, `git commit -a`, or a commit in a tree other sessions share.
- **Check:** the commit lists only its own paths (`git commit -- <paths>`).
- **Behind it:** commits swept in another session's half-written files (2026-08-22 onward).

**R14. Timestamps written into logs or records.**
- **Trigger:** a time written into a log, checkpoint or report.
- **Check:** the time comes from `date` in the same command that writes it.
- **Behind it:** 9 guessed times were written as fact between 2026-09-28 and 2026-10-14.

## Agents and gates

**R15. Sub-agent dispatch without model or effort.**
- **Trigger:** a workflow script or brief that dispatches agents.
- **Check:** every dispatch passes its model and effort explicitly, and a model the owner named goes on the dispatch tool's own parameter.
- **Behind it:** dispatches ran on a model the owner had ruled out, and every scout copied the session's highest effort (2026-09-25 to 2026-11-16).

**R16. A new or changed blocking gate.**
- **Trigger:** a hook, mod or rule that can block, hold or prompt.
- **Check:** the gate starts in observe mode, or its tests replay real past commands including known false positives, and it never prompts under bypass permissions without saying why.
- **Behind it:** gates that changed under the agent: a classifier that started refusing one Saturday, and a safety hook that held a harmless temp-folder cleanup for 10 minutes (2026-10-03 to 2026-11-16).
