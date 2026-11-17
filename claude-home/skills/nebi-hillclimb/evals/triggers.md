# Trigger evals — nebi-hillclimb

Must fire (positives):
1. "The product page takes almost three seconds to become usable on mobile. Make it faster."
2. "Get our Lighthouse performance score on the landing page above 95."
3. "The JS bundle is 900 KB, cut it down as far as you reasonably can."
4. "Scrolling the feed stutters on older phones, make it smooth."
5. "Our hosting bill doubled with the same traffic; bring the cost down."
6. "Optimize the build, it takes six minutes and should be under two."

Must NOT fire (near-misses):
1. "Checkout throws a 500 since this morning's deploy, fix it." (debugging)
2. "The page got slow right after yesterday's upgrade and an error shows in the console, find what broke." (debugging owns a sudden regression with an error)
3. "Improve the conversion rate on the pricing page." (cro)
4. "Rewrite the hero copy so it converts better." (copywriting)
5. "Refactor the cart module so it's easier to read." (no measurable goal)
6. "Research which image CDN is cheapest for our traffic." (research)
7. "Core Web Vitals fail in Search Console and our rankings dropped; audit the SEO." (seo-audit)
8. "Optimize the landing page so more visitors sign up." (cro)

How to run: from the source repository, `node claude-home/nebi/run-trigger-evals.mjs --headless --model <model> --skill nebi-hillclimb --report /tmp/nebi-hillclimb-triggers.json`. The runner stages the source pack without deployment. `--list` is an offline checklist; an unavailable CLI or ungradable run is an error, never a passing fallback. Test each manual row in a fresh session and record all skills that fire.
PASS = the skill fires on every positive and none of the near-misses; a description edit that flips a row is a regression.
