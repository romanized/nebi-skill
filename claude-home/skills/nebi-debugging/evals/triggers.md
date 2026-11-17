# Trigger evals — nebi-debugging

Must fire (positives):
1. "The checkout form throws a TypeError on submit — fix it."
2. "This test fails intermittently; get to the bottom of it."
3. "The fix didn't work, it's still crashing — try again."
4. "Why does the server 500 after the last deploy?"
5. "The app crashes on startup since the SDK upgrade."
6. "Orders are occasionally one cent off only when tax and coupons combine; trace the first divergence." (silent wrong output, no crash announced)

Must NOT fire (near-misses):
1. "Add a dark-mode toggle to settings." (feature work)
2. "Refactor this module for readability." (quality, nothing broken)
3. "Write tests for the parser." (testing, no failure yet)
4. "This copy sounds too AI — fix the wording." (writing)
5. "Resume yesterday's work on the dashboard." (sessions)
6. "Design error recovery for the new offline-sync feature." (designing handling, nothing failing yet)
7. "What changed between v3 and v4 of the SDK?" (research owns the changelog question)
8. "The homepage works but loads slowly; make it faster." (hillclimb owns measurable improvement with nothing broken)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-debugging --report /tmp/nebi-debugging-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
