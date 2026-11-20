# nebi-tools catalog

Every tool and repo Nebi has saved, whether or not it is installed. Add a row when something new is installed or worth remembering; mark a row declined instead of deleting it, so the reason stays on record. Pins and update commands for third-party entries are in `~/.claude/nebi/upstreams.json`. Last full pass: 2026-11-20.

`PY` below is `~/.agents/nebi/venv/bin/python` and `T` is `~/.claude/skills/nebi-tools/tools`.

## Installed

| Tool | What it answers | Run | Key | Cost |
|---|---|---|---|---|
| Scrapling wrapper | One page through plain HTTP, a Cloudflare-solving stealth browser, or full JS | `PY T/scrapling/scrape.py <url> [--mode plain\|stealth\|dynamic] [--css <sel>] [--json] [--out <dir>]` | none | free |
| Google Trends | Interest over time, related queries, trending and daily RSS terms | `PY T/google-trends/trends.py interest\|related\|trending\|rss <kw> --geo NL` | none | free; 429s are normal, it retries once |
| TikTok Creative Center | Trending hashtags and videos per region | `PY T/tiktok-creative-center/trends.py hashtags\|videos --region US --period 7` | none | free; soft rate limit, then go through a browser |
| Meta Ad Library | Live and past ads by keyword and country | `PY T/meta-ad-library/ads.py search <kw> --country NL --limit 10` | none | free |
| meta-ads-collector 1.7.2 | Meta ads with EU reach per ad, age and gender reach, HD video URLs | `~/.agents/nebi/venv/bin/meta-ads-collector -q <kw> -c NL -n 5 --enrich --no-download-media --delay 2` | none | free; one pull at a time |
| TikHub REST | Social posts, replies, trends across X, Reddit, TikTok, Instagram and more | `tikhub` skill; `PY T/tikhub/tikhub.py whoami\|price\|get\|post` | `TIKHUB_API_KEY` | about $0.001 per call, Instagram about $0.008 |
| Firecrawl CLI 1.30.0 + 13 skills | Site maps, crawls, downloads, structured extraction, change monitors, local file parsing | `firecrawl --status`, then `firecrawl <command> --help`; load the `firecrawl` skill | CLI login, done 2026-11-20 on Nebi's business account (`firecrawl login --browser` to redo) | free 1,000 credits a month; scrape 1 credit a page. To claim later: Firecrawl credits through the Claude for Startups perk (Nebi). |
| Firecrawl Local 0.1.1 | Firecrawl's own engine on this Mac: scrape, crawl, map, document parsing; serves the Firecrawl v2 API on localhost:3002 | `firecrawl-local scrape <url> --markdown`, `crawl <url> --limit 50 --out <dir>`, `map <url>`, `serve` | none | free; `FIRECRAWL_CLOUD=off` in settings keeps it fully local (no search, no cloud fallback for blocked pages) |
| Crawl4AI 0.9.5 | Free local crawling: one page or a whole site to markdown or JSON, deep crawl (BFS, DFS, best-first) | `crwl crawl <url> -o md`; site: `--deep-crawl bfs --max-pages 20` | none | free; runs a local browser, so heavy crawls load this Mac |
| reverse-api-engineer 0.16.0 + skill | Turns a site's private HTTP API into a typed client by watching a browser do the task | `reverse-api-engineer agent -p "<goal>" -u <url> --dry-run`, then without `--dry-run` | none by default (logged-in Claude Code) | free tool; the model run uses plan usage |
| Playwright CLI 0.1.25 + skill | A clean, named browser per agent; can attach to the user's Chrome as a tab group | `playwright-cli open <url> --session=<name>`, `snapshot`, `click e12`, `close` | none | free |
| Tilion MCP | Hosted cloud Chrome: anti-bot recovery, CAPTCHAs, residential proxies, saved logins, plain-English data collection | MCP server `tilion` (user scope, every account); `profile_list` is free; `read_page` needs `create_browser_session` first | OAuth through `/mcp` (main account signed in 2026-11-20; the others ask on first use) | free plan $5 one-time credit; then per minute while a session is open |
| exa MCP | Search with date, domain and category filters; page fetch | MCP tools `web_search_exa`, `web_fetch_exa` | none | free tier, rate-limited |
| chrome-devtools MCP | Lighthouse, network and console in its own temporary Chrome | MCP tools | none | free |
| codex-browser | The user's real logged-in Chrome, any Claude account | `codex-browser` skill | none | free |
| fal.ai through `genmedia` | Image and video generation on fal models | `genmedia --help` | `FAL_KEY`; `FAL_ADMIN_KEY` for billing reads only | per call, varies by model |
| ElevenLabs REST | Speech, voices, sound effects outside the connector | REST with the key | `ELEVENLABS_API_KEY` | ElevenLabs credits |
| yt-dlp | Views, likes and upload date for a video URL (`-J --skip-download`) | `yt-dlp -J --skip-download <url>` | none | free; no TikTok keyword search |
| whisper.cpp | Local transcription with word timing | `whisper-cli -m /opt/homebrew/share/whisper.cpp/ggml-small.bin -ml 1 -sow <wav>` | none | free |
| earshot | Judge audio you cannot hear | `earshot` skill | none | free |

Shop-specific tools stay in their project: bol Retailer API (`ecommerce-workspace/tools/bol-api`, keys `BOL_CLIENT_ID` and `BOL_CLIENT_SECRET` in `tools.env`), Shopify reports, the Karpet24 stock guard and Google Analytics, all under `ecommerce-workspace/tools/`.

## Keys in tools.env (names only)

`TIKHUB_API_KEY`, `FAL_KEY`, `FAL_ADMIN_KEY`, `ELEVENLABS_API_KEY`, `BOL_CLIENT_ID`, `BOL_CLIENT_SECRET`. Firecrawl and Tilion keep their own logins (the Firecrawl CLI's store, Claude Code's MCP OAuth). Per-shop credential files sit next to `tools.env` in `~/.agents/nebi/secrets/`.

## Saved, not installed

Reach for these when the installed route fails or a job needs what only they do. Check the current version before installing.

| Tool | Reach for it when | Install | Notes |
|---|---|---|---|
| Browser Use Cloud + CLI | Tilion is down, too expensive, or blocked on a site | `uv tool install 'browser-use==1.0.6'`, `browser-use skill install --target claude` | $0.06 per browser hour, CAPTCHAs included, home IP $5/GB. Its CLI attaches to the user's own Chrome whenever remote debugging is on: pin `BU_CDP_URL`. |
| Kernel | Cloud browsers that keep logins in persistent profiles, stealth on the free tier | `claude mcp add --transport http kernel https://mcp.onkernel.com/mcp` | Free $5 a month, 5 concurrent. Customer API keys were compromised in a November 2026 incident; read their notice first. |
| Browserbase `browse` CLI | A managed fleet with a local mode | `npm install -g browse && browse skills install` | Free: 3 concurrent, 1 browser hour. Cloudflare-verified browsers only on the Scale plan. |
| Chrome DevTools MCP `--autoConnect` | Logged-in work in the user's Chrome without the ChatGPT extension | add `--autoConnect` to the chrome-devtools MCP args | Needs remote debugging switched on in Chrome (Chrome 144+), which any local process can then use. Chrome asks on every connection. |
| Playwright MCP | An MCP twin of Playwright CLI, for a client that cannot run shell commands | `claude mcp add playwright npx @playwright/mcp@latest -- --isolated` | Same engine as playwright-cli; the CLI is cheaper in context. |
| Camoufox | A local Firefox-based stealth browser when patchright is detected | `pip install -U "camoufox[geoip]" && camoufox fetch` | Prerelease; its own README says it can still be detected. About 1.3 GB. |
| Steel | Self-hosted cloud browser | `steel.dev/docs` | Installer is `curl \| sh`; its MCP stores the key in plain text in `~/.claude.json`. |
| Lightpanda | Very fast headless fetches without rendering | `lightpanda mcp` | AGPL; telemetry on by default (`LIGHTPANDA_DISABLE_TELEMETRY=true`). |
| Tilion Fortress | Tilion's stealth Chromium run locally | Docker image from `github.com/tiliondev/fortress` | Source-available license; prebuilt binaries are Linux only. |
| YouTube Data API v3 | Video search and stats at volume | key from Google Cloud | Free 10,000 quota units a day; `YOUTUBE_API_KEY`. |
| Reddit API | Reddit at volume without TikHub | OAuth "script" app | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`. |
| SerpApi | Paid fallback when Google Trends keeps answering 429 | key from serpapi.com | 250 free searches a month, then $25 for 1,000; `SERPAPI_KEY`. |
| BuiltWith | A site's tech stack | free single lookups on builtwith.com | API key for bulk: `BUILTWITH_API_KEY`. |
| Pinterest Trends, Amazon Best Sellers | Trend and bestseller pages | browser or `scrape.py` | Public pages, no API. |

The ecommerce-specific candidates (Klaviyo, ad-spy tools, Google Shopping, Similarweb, Exploding Topics) and their checks are in `ecommerce-workspace/tools/REGISTRY.md`, section 6.

## Declined

| Tool | Why |
|---|---|
| Vercel `agent-browser` | 2026-10-03: a second browser controller next to Claude in Chrome, codex-browser and bsk. Rechecked 2026-11-20: still strong (52.9k stars), but Playwright CLI fills the same role. |
| Firecrawl Claude plugin | 19 skills that cannot be set to name-only, plus a hosted MCP that duplicates the CLI. |
| Hyperbrowser | No first-party Claude Code route; its MCP was a year stale and failed 100/100 runs on browserarena (2026-11-20). |
| Skyvern, Notte (as drivers) | Each brings its own LLM agent on top of Claude Code. |
| ChatGPT Atlas | Discontinued 2026-08-09. |
| Comet, Dia, Opera Neon | Consumer browsers with no reliable automation route for parallel agents. |
| pytrends | Archived since 2023; use the Google Trends script. |
