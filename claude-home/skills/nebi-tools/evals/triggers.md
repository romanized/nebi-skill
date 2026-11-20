# Trigger evals — nebi-tools

Must fire (positives):
1. "Where's the TikHub API key? I need it in this project."
2. "Crawl every page under their /docs and save it as markdown."
3. "This site sits behind Cloudflare and WebFetch gets a 403. Get me the product list."
4. "Is search interest in wool rugs rising in the Netherlands?"
5. "Their mobile app clearly has an API. Can we call it from a script?"
6. "Spin up a separate browser for each of these five sub-agents so they don't collide."
7. "Add this scraper repo to our tools so we remember it, but don't install it yet."

Must NOT fire (near-misses):
1. "Log into our Shopify admin and change the theme." (codex-browser, account work)
2. "What are people saying about Claude Code on X this week?" (tikhub)
3. "Look up how the Stripe Checkout Sessions API handles tax." (nebi-research)
4. "Run Lighthouse on our homepage." (chrome-devtools)
5. "Generate a product photo of this rug in a living room." (Higgsfield)
6. "Write Playwright tests for the checkout flow." (playwright-best-practices)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-tools --report /tmp/nebi-tools-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
