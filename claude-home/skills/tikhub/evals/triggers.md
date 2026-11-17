# Trigger evals — tikhub

Must fire (positives):
1. "Scrape Twitter for what people say about Claude Code agent teams this month."
2. "What are the top TikTok hooks for rug videos right now?"
3. "Check Reddit for complaints about bol.com seller payouts."
4. "Pull the replies under that viral post about Shopify checkout extensions."
5. "Which hashtags are trending on TikTok in Germany this week?"
6. "Find Instagram posts using #sneakerhead from the last few days."

Must NOT fire (near-misses):
1. "Log into our TikTok Ads Manager and pause the campaign." (codex-browser, account work)
2. "Scrape the product pages of a competitor's webshop." (scrapling-official)
3. "Search the web for the Shopify API changelog." (web search)
4. "Post this video to our TikTok account." (publishing, not data)
5. "Write a tweet announcing the sale." (copywriting)
6. "Look up the Meta Ad Library for our competitor's ads." (ad library tool)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill tikhub --report /tmp/tikhub-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
