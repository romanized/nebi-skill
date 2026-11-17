# Trigger evals — nebi-mod-verify

Must fire (positives):
1. "I rebuilt nebi-quiet; check that the footer no longer says shift+tab to cycle in a real session."
2. "Before we call the beacon mod done, prove the NEED YOU row actually paints and has no answer keys."
3. "Claude Code updated overnight. Make sure all the nebi mods still load and nothing is refused."
4. "Take before and after screenshots of the terminal with the new mods versus stock Claude Code."
5. "The (1M context) label seems to be back in my status line, verify what the screen shows."
6. "I just enabled nebi-receipt and nebi-replies; confirm they loaded and the screen looks right."

Must NOT fire (near-misses):
1. "claude plugin test fails on nebi-red-button with a TypeError in register.tsx, fix it." (debugging)
2. "Screenshot the landing page on mobile and check the hero layout." (browser work, not the terminal)
3. "Split the ten mods across builders so they don't collide." (orchestration)
4. "Install the cc-plugin-you-should-know plugin from the official marketplace." (maintenance)
5. "Write a new mod that shows a toast when a peer session needs me." (building, not verifying)
6. "Run node --test and tell me what fails." (plain test run)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-mod-verify --report /tmp/nebi-mod-verify-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
