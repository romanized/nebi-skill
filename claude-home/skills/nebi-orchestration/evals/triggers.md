# Trigger evals — nebi-orchestration

Must fire (positives):
1. "Split this feature across a few sub-agents so they don't collide."
2. "Ultracode: build the auth flow and the billing page in parallel."
3. "Dispatch a scout to map the codebase before we plan."
4. "Two sessions keep merge-conflicting on the same files — fix how we split the work."
5. "Fan out builders for these three modules, then have a checker review the combined result."
6. "Assign the schema and API migration changes to separate agents and keep them out of each other's files."

Must NOT fire (near-misses):
1. "Fix this null-pointer bug in checkout." (debugging)
2. "Hand off this session; I'll continue tomorrow." (sessions)
3. "Rename this variable across the file." (trivial single edit)
4. "Review this diff for logic errors." (single-agent review, no fleet)
5. "Plan the architecture for the new service." (planning, no multi-agent coordination)
6. "Parallelize these three network calls inside the handler." (code-level concurrency, not sub-agents)
7. "Set up a GitHub Actions workflow that runs the tests on every push." (CI config, not a multi-agent fleet)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-orchestration --report /tmp/nebi-orchestration-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
