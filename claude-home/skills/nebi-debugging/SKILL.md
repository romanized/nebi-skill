---
name: nebi-debugging
description: "Read this before attempting a fix, not after it fails. Root-cause-first debugging and recovery without cheap cop-outs. Load it whenever something is broken and a fix is wanted: an error, exception, TypeError, crash, 500, stack trace, failing or flaky test, a regression after a deploy or upgrade, wrong or inconsistent output, or a fix that did not work and is being retried. This applies even when the request is phrased as a direct command to just fix it — load it first, then diagnose. Not for building a new feature, refactoring, writing new tests, wording changes, or designing error handling for a failure that has not happened."

---

# Debugging — root cause, worst case, no cop-outs

The active harness's core §0 override always wins. If Nebi tells you to do something different, do it and do not cite this skill back. This is the default method when you are deciding alone.

## The rule

**Investigate before claiming a fix.** Random patches waste time and create new bugs. During an active incident, authorized reversible containment or rollback may come first: preserve evidence, verify containment, and keep root-cause repair explicitly open. A mitigation is not a completed correction.

Before touching a fix:
1. **Investigate the root cause** — read the full error/stack trace, reproduce it, check what changed recently, trace the bad value *backward* to where it originates. Fix at the source, not where it surfaces.
2. **Find a working example** and compare it against the broken path — what's actually different?
3. **One hypothesis at a time.** "X is the cause because Y." Test with the smallest possible change. Don't stack fixes — you won't know which worked. A cause is confirmed when it explains the numbers and the pattern (why only sometimes, why only here), not just the symptom.
4. **Fix + regression proof** at the right seam. Use a test that fails before the fix and passes after when practical; for configuration, data, or tooling failures, use a focused fixture or direct state check that catches the original failure. For an intermittent failure, repeat the check: it should fail on most runs before the fix and pass on every run after.

**No trace to read? Make the bug visible before hypothesizing:**
- **Reproduce first.** If the user can see it but no check catches it (a recording, a screenshot), build the check that catches it first. Build the smallest repro when possible. For intermittent or production-only failures, bound the attempts and collect traces, changed-state evidence, or instrumentation. State what remains unconfirmed; do not loop indefinitely or hold containment hostage to a local repro.
- **Bisect to localize.** Halve the search space instead of staring: `git bisect` across commits, cut the pipeline mid-stream and inspect the value, shrink the failing input to the smallest case that still fails.
- **Instrument the seam.** Targeted logs/asserts at the suspected boundary, run once, read what actually flowed — then take them out. Evidence over squinting.

## Worst-case first

When something can go wrong, find the **worst-case scenario** and make sure the fix covers *that*, not just the happy path. Add validation at the layers this failure actually passes through — the invariant's owner or the trust boundary — so the bug can't reoccur. Not blanket defensive checks everywhere (§5: no error handling for impossible cases).

## Don't cop out

- When stuck, **look further — don't grab the cheap alternative.** Stay inside our real context (this landing page / game / project); don't swap to an easier substitute just to get unstuck.
- **Never** hide errors, silence failures, add fake success paths, or patch symptoms to make things look green.

## The 3-strike rule

Two failed fixes is the signal to change something before a third, in the core's order (§5). **If you've tried three or more fixes and it's still broken, stop and question the architecture.** The bug may be a design problem, not a code problem. A third attempt that changes nothing is a red flag — escalate, rethink, or hand to a fresh agent. For a stubborn or flaky bug, have separate agents form hypotheses from disjoint evidence (logs, code, data) and put each in front of a refuter; one context tends to favour its own first theory.

Cheaper than strike three: use the active harness's checkpoint or restore mechanism, or git when appropriate, instead of stacking corrections onto polluted context. Preserve unrelated user edits; revert only your identified changes or retry in an isolated worktree. A clean retry usually beats a long session full of failed patches.

## Tests keep their integrity

- A failing test is evidence, not automatically the authority. Check the intended contract: fix the implementation when it violates that contract; repair an obsolete or faulty test when evidence shows its expectation is wrong. Never change a valid assertion merely to obtain green.
- A test passes when it shouldn't? You're testing the wrong thing — fix the test. Never weaken or delete a failing test just to go green.
- Replace arbitrary `sleep`/timeouts in async tests with polling on the actual condition (kills flaky tests).
- A flaky test (it passes and fails on the same code) gets a root cause. Never turn it green with retries, sleeps or a skip. If the cause can't be found, delete it and write down why and what it was meant to protect; that is different from deleting a test that fails.
