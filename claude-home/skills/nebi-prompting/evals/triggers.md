# Trigger evals

## Must fire

1. `Sharpen this: I need an agent to look at the checkout, figure out why people drop off, and fix the important parts without turning it into a redesign.`
2. `Can you reword and structure this prompt without changing how I said it? I want research first, then a plan, then build only after I approve it.`
3. `Okay so we're rebuilding onboarding and I want it way less generic, probably keep the existing account flow, but research competitors first, don't break subscriptions, remember that mobile bug from yesterday, and I need the whole thing production-ready, maybe split the work up because it's a lot.`
4. `Turn this rambly voice note into the best working prompt, but keep my words: the game needs more tension, the loop is too flat, maybe progression or risk, just don't make it grindy.`
5. `I have three things mixed together here: audit what exists, work out the smallest real fix, and then tell me what should be delegated. Structure this before we start.`
6. `These are scattered instructions for another agent; turn them into one executable brief without adding decisions.`

## Must not fire

1. `Fix the failing auth refresh test in src/auth.ts and run the focused test suite.` (well-scoped execution)
2. `Rewrite this homepage headline so it sounds less corporate.` (prose editing)
3. `How does prompt caching work in Claude?` (question about prompting itself)
4. `Summarize the last three commits in five bullets.` (summary)
5. `Sharpen the contrast in this product photo and keep the label readable.` (image adjustment)
6. `Improve the prompt-caching implementation and add a regression test.` (implementation about prompting)
7. `The checkout keeps throwing a 500 after login, probably that session token thing again, can you dig into why and fix it.` (rough but executable as-is: nebi-debugging, not prompting)
8. `Let's pick up yesterday's onboarding work where we left off and keep going.` (resume request: nebi-sessions, not prompting)

## How to run

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-prompting --report /tmp/nebi-prompting-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.

Output smoke cases: `evals/evals.json` is the single behavioral source of truth. This file keeps only the trigger rows above.
