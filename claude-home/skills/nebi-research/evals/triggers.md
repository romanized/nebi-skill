# Trigger evals — nebi-research

Must fire (positives):
1. "Research the current best way to do optimistic updates in this framework."
2. "What changed in the payment provider's API between v3 and v4 — read the changelog."
3. "Compare hosting options for this app and recommend one, with sources."
4. "Find the official way to configure SSR caching here — docs, not blogs."
5. "Is this library still maintained? Check before we depend on it."
6. "The upgrade may have changed the SDK's defaults — check the release notes for breaking changes before we build on it." (version-specific behavior, nothing failing yet)

Must NOT fire (near-misses):
1. "Find me a skill for Three.js." (find-skills)
2. "Fix the failing auth refresh test." (debugging)
3. "Where is rate limiting implemented in our repo?" (codebase question)
4. "Sharpen this prompt before we start." (prompting)
5. "Summarize this article I pasted." (content already given)
6. "App crashes since the upgrade, fix it." (debugging owns the fix)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-research --report /tmp/nebi-research-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
