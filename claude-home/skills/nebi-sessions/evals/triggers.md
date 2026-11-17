# Trigger evals — nebi-sessions

Must fire (positives):
1. "Pick up where we left off yesterday on the landing page."
2. "Context is getting full — hand this off to a fresh session."
3. "What's actually done and what's still open from the last run?"
4. "Starting a work session: survey the repo state before we touch anything."
5. "Write a handoff doc for the next agent."
6. "Yesterday's checkout fix may be half-done; verify the repo and continue from the first unfinished step."

Must NOT fire (near-misses):
1. "Debug why the build fails on CI." (debugging)
2. "Coordinate three builders on this refactor." (orchestration)
3. "Summarize this README for me." (plain summarization)
4. "How big is your context window?" (meta question, no session workflow)
5. "Commit and push what we have." (git operation)
6. "The user's login session expires after 15 minutes — fix it." (app auth session, debugging territory)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-sessions --report /tmp/nebi-sessions-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
