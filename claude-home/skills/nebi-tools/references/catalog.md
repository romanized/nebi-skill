# nebi-tools catalog

Every tool and repo Nebi has saved, whether or not it is installed. Add a row when something new is installed or worth remembering; mark a row declined instead of deleting it, so the reason stays on record. Pins and update commands for third-party entries are in `~/.claude/nebi/upstreams.json`. Last full pass: 2026-11-21.

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
| TikHub MCP, per folder | The same TikHub API as MCP tools (16 platforms), switched on only where wanted, because all 16 globally cost about 33k tokens in every session | `T/tikhub/tikhub-mcp.sh on [platform ...]` in the project folder, restart Claude Code; `off`, `list` | `TIKHUB_API_KEY` (copied into that folder's MCP entry on `on`) | same per-call prices as REST; nothing loads where it's off |
| Parallel (plugin + CLI) | Web search, page extract, FindAll entity lists, Entity Search, deep research, enrichment, monitors; second provider beside Exa | plugin `parallel@parallel-agent-skills` (MCP `parallel-search`, skills `parallel:*`); `parallel-cli search\|extract\|findall\|enrich\|research` | `PARALLEL_API_KEY`; MCP research and `parallel-cli balance` need the owner's OAuth login | search $0.001 to $0.005, extract $0.001 a URL, FindAll $0.25 a run + $0.03 a match; no dollar cost in responses |
| Firecrawl CLI 1.30.0 + 13 skills | Site maps, crawls, downloads, structured extraction, change monitors, local file parsing | `firecrawl --status`, then `firecrawl <command> --help`; load the `firecrawl` skill | CLI login, done 2026-11-20 on Nebi's business account (`firecrawl login --browser` to redo) | free 1,000 credits a month; scrape 1 credit a page. To claim later: Firecrawl credits through the Claude for Startups perk (Nebi). |
| Firecrawl Local 0.1.1 | Firecrawl's own engine on this Mac: scrape, crawl, map, document parsing; serves the Firecrawl v2 API on localhost:3002 | `firecrawl-local scrape <url> --markdown`, `crawl <url> --limit 50 --out <dir>`, `map <url>`, `serve` | none | free; `FIRECRAWL_CLOUD=off` in settings keeps it fully local (no search, no cloud fallback for blocked pages) |
| Crawl4AI 0.9.5 | Free local crawling: one page or a whole site to markdown or JSON, deep crawl (BFS, DFS, best-first) | `crwl crawl <url> -o md`; site: `--deep-crawl bfs --max-pages 20` | none | free; runs a local browser, so heavy crawls load this Mac |
| reverse-api-engineer 0.16.0 + skill | Turns a site's private HTTP API into a typed client by watching a browser do the task | `reverse-api-engineer agent -p "<goal>" -u <url> --dry-run`, then without `--dry-run` | none by default (logged-in Claude Code) | free tool; the model run uses plan usage |
| Playwright CLI 0.1.25 + skill | A clean, named browser per agent; can attach to the user's Chrome as a tab group | `playwright-cli open <url> --session=<name>`, `snapshot`, `click e12`, `close` | none | free |
| Tilion MCP | Hosted cloud Chrome: anti-bot recovery, CAPTCHAs, residential proxies, saved logins, plain-English data collection | MCP server `tilion` (user scope, every account); `profile_list` is free; `read_page` needs `create_browser_session` first | OAuth through `/mcp` (main account signed in 2026-11-20; the others ask on first use) | free plan $5 one-time credit; then per minute while a session is open |
| Exa API with a budget | Semantic search, page contents, and Agent API runs for list-building, each call's real cost logged to a ledger that refuses calls past a cap | `EXA_LEDGER=<job>/exa-ledger.jsonl EXA_BUDGET_USD=20 PY T/exa/exa.py search\|contents\|agent\|agent-status\|ledger`; skills `exa-search`, `exa-contents`, `company-research`, `lead-generation`, `build-with-exa` | `EXA_API_KEY` | about $0.007 a search; agent runs capped by `--max-cost` |
| exa MCP | Quick search and page fetch | user-scope `exa` (anonymous) and the `exa` plugin (OAuth, adds `agent_run`) | none | anonymous is free and rate-limited; plugin spend never reaches the ledger, only dashboard.exa.ai |
| chrome-devtools MCP | Lighthouse, network and console in its own temporary Chrome | MCP tools | none | free |
| codex-browser | The user's real logged-in Chrome, any Claude account | `codex-browser` skill | none | free |
| fal.ai through `genmedia` | Image and video generation on fal models; faithful product-photo upscaling with `fal-ai/aura-sr` (4x, keeps fine texture, verified 2026-09-19) | `genmedia models "<query>" --category <modality> --json` (always pass the category), `genmedia pricing\|schema <id> --json` (free), `genmedia upload <path> --json` (read `cdn_url`), `genmedia run <id> ... --download "<dir>/{request_id}.{ext}" --json`; fallback REST `https://fal.run/<id>` with `Authorization: Key $FAL_KEY` | `FAL_KEY`; `FAL_ADMIN_KEY` for billing reads only | per call, varies by model; trust each model page over `genmedia pricing`. Partner ids have no `fal-ai/` prefix (`topaz/...`, `bria/...`). New accounts get 2 concurrent requests. Never put a creative or generative upscaler on a product: it invents detail the customer will not receive |
| ElevenLabs REST | Speech, voices, sound effects outside the connector | REST with the key | `ELEVENLABS_API_KEY` | ElevenLabs credits |
| bol Retailer API (read-only) | A bol seller account's offers, orders and shared resources: any v10 GET, or the full offers export as CSV | `PY T/bol-api/bolapi.py check` (token only, free), `get <path> [--out FILE]`, `export-offers <out.csv>` | `BOL_CLIENT_ID`, `BOL_CLIENT_SECRET` | free; bol rate limits per endpoint |
| yt-dlp | Views, likes and upload date for a video URL (`-J --skip-download`) | `yt-dlp -J --skip-download <url>` | none | free; no TikTok keyword search |
| whisper.cpp | Local transcription with word timing, Dutch included | `whisper-cli -m ~/.cache/whisper.cpp/ggml-large-v3-turbo.bin -l auto -ml 1 -sow <wav>` (`ggml-base.en.bin` in the same folder is the fast English model) | none | free |
| earshot | Judge audio you cannot hear | `earshot` skill | none | free |
| mlx-audio 0.6.7 (Kokoro-82M) | English voice drafts on this Mac, no credits | `mlx_audio.tts.generate --model mlx-community/Kokoro-82M-bf16 --voice af_heart --lang_code a --text "<text>" --output_path <dir>` | none | free; Kokoro has no Dutch. Dutch placeholders: `say -v Xander -o out.aiff "<text>"`. Final client voice stays with ElevenLabs |
| rembg 2.0.87 | Background removal and product cutouts | `rembg i -m isnet-general-use in.jpg out.png`; a folder: `rembg p in/ out/`; `birefnet-general` for hair-level edges | none | free; about 2 s a photo once the model is cached |
| ocrmac (Apple Vision) | OCR on screenshots, receipts and photos | `uv run --python 3.12 --with ocrmac python -c "from ocrmac import ocrmac;print(ocrmac.OCR('<png>',language_preference=['nl-NL']).recognize())"`; digital PDFs: `pdftotext` | none | free; no model download, nothing installed |
| d2 0.9.0 | Text to diagram for docs and flow images | `d2 --layout=elk in.d2 out.svg` (keep to SVG: PNG export downloads a browser) | none | free |
| KTX-Software 4.4.2 | KTX2 texture compression for web 3D | `ktx create` and `ktx info` (`/usr/local/bin/ktx`); used by the `threejs-asset-pipeline` and blender-* export steps | none | free |
| Blender 5.3 + Blender Lab MCP | 3D modelling, cleanup and export by script or MCP | `nebi-blender` skill (shell-only helper `blendtool.py`) and the blender-* skills; MCP server `blender` on every account | none | free |
| Raycast 2.13 | The Cmd+Space launcher (Spotlight's shortcut is off) | see [Raycast](#raycast) below | Raycast account | free; Pro $10 a month or $96 a year, students 50% off Pro |

Shop-specific tools live in the shop's own private repo, because they carry its store domain and logins: Karpet24's Shopify reports, Google Analytics MCP and stock guard are in `Karpet24/tools/` (`shopify-reports`, `google-analytics`, `k24-voorraadactie`).

## Raycast

Raycast is the launcher on Cmd+Space since 2026-11-21. Spotlight's shortcut (symbolic hotkey 64) is switched off; Cmd+Option+Space still opens Finder search. Raycast 2 keeps its hotkey in an encrypted settings database, so it is set in Raycast itself (Cmd+, > General > Raycast Hotkey), never through `defaults`.

Its local MCP server needs Pro and stays off and unregistered by default. If Nebi turns it on: never allow-list `mcp__raycast__*`, never use it in a session started with `--dangerously-skip-permissions` (the account launchers add that flag), and share only Calculator, Calendar, Snippets, Quicklinks and Notes. Clipboard history and browser tabs can hold passwords and customer data.

Settings checklist:

- Hyper Key on Caps Lock.
- Clipboard history kept for 1 month, with password managers, banking apps and Ghostty excluded.
- File Search limited to `~/Documents/GitHub`, `~/Desktop` and `~/Downloads`, ignoring `**/.next/**`, `**/dist/**`, `**/build/**`, `**/.turbo/**` and `*.blend1`.
- Rectangle keeps window management; Raycast's window commands stay unbound.
- Extensions: GitHub, Brew, Docker, Spotify Player and Granola (unofficial). Skip the Stripe, Supabase and Shopify extensions, which duplicate the CLIs and connectors.

Pro adds Raycast AI chat, Bring Your Own Key, the MCP server and cloud sync. The pricing page lists Pro at $10 a month or $96 a year and says verified students get 50% off Pro through a form, which works out to $48 a year (the page does not print that figure; checked 2026-11-21). Raycast's manual also documents Bring Your Own Subscription: a paid plan can reuse a Claude subscription through the Claude Code login for AI Chat, Quick AI and AI Commands, and that usage counts against the Claude limits.

## Keys in tools.env (names only)

`TIKHUB_API_KEY`, `EXA_API_KEY`, `PARALLEL_API_KEY`, `FAL_KEY`, `FAL_ADMIN_KEY`, `ELEVENLABS_API_KEY`, `BOL_CLIENT_ID`, `BOL_CLIENT_SECRET`. Firecrawl and Tilion keep their own logins (the Firecrawl CLI's store, Claude Code's MCP OAuth). Per-shop credential files sit next to `tools.env` in `~/.agents/nebi/secrets/`. Railway workspace tokens live in `railway.env` there: `RAILWAY_WS1_TOKEN`, `RAILWAY_WS2_TOKEN` and their `_ID`s. They work for GraphQL (`Authorization: Bearer`) and `railway api`; `railway list` and `whoami` need the CLI login.

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
| treg | Paid data we hold no key for, per call instead of a subscription: SEO and backlinks, keyword volume, competitor ad libraries and ad accounts, people or company enrichment; also its ad and growth research workflows (rea-marketing, rea-growth, make-ugc, lead-signals) | `/plugin marketplace add superdesigndev/treg`, then `/plugin install treg@treg` in that project | Hosted at treg.to, prepaid per call, $1 free once; reviewed at `fa99c42`. Never run `treg upload` here: it sends `.env` keys, skills and CLI credentials to its server. Its skill says to reach for it first for any outside data, so install it only in the project that needs it. |

The ecommerce-specific candidates (Klaviyo, ad-spy tools, Google Shopping, Similarweb, Exploding Topics) and their checks are in `ecommerce-workspace/research/tool-candidates.md`.

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
