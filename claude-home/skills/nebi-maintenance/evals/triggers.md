# Trigger evals — nebi-maintenance

Must fire (positives):
1. "Audit the doctrine — anything stale after the latest model changes?"
2. "Update the bindings table; a new model came out."
3. "You violated §6 again — log it and tighten the rule."
4. "Refresh the nebi skills against their sources."
5. "Add a rule to CLAUDE.md about test hygiene."
6. "Agents keep claiming completion without running proof; change our standing guidance so that stops."

Must NOT fire (near-misses):
1. "Fix the failing deploy script." (debugging a script, not doctrine review)
2. "Find me a skill for Three.js." (find-skills)
3. "Hand off this session." (sessions)
4. "Tighten this landing-page copy." (writing)
5. "Split the work across sub-agents." (orchestration)
6. "Update the ESLint rules for the TypeScript upgrade." (project linter config, not doctrine)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-maintenance --report /tmp/nebi-maintenance-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
