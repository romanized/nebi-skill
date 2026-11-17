# Trigger evals — codex-browser

Must fire (positives):
1. "Log into the Karpet24 Shopify admin in my Chrome and check today's orders."
2. "Claude in Chrome is on the other account again, just do it in the browser some other way."
3. "Three sub-agents each need to check a different marketplace dashboard in my browser at the same time."
4. "Upload these product photos to the bol.com partner portal for the new rug."
5. "Use my RapidSneakers Chrome profile to read the Meta Ads Manager campaign list."
6. "Open the Finder window and tell me what's in the Downloads folder." (desktop app)

Must NOT fire (near-misses):
1. "Scrape 500 public product pages from a competitor's site into a CSV." (scrapling-official)
2. "Find the top TikTok videos about rugs this month." (TikHub)
3. "Take a screenshot of my landing page in a headless browser for the PR." (plain headless check)
4. "Search the web for the latest Shopify API changes." (web search)
5. "Write a Playwright test for the checkout flow." (test code, not driving the browser)
6. "Why is Claude in Chrome asking me to pair a browser?" (explanation)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill codex-browser --report /tmp/codex-browser-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
