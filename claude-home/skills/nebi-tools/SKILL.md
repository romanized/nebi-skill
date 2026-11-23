---
name: nebi-tools
description: "Nebi's global toolbox: the tools, API keys and saved repos every project can use. Use when a task needs an outside data source or utility (scraping or crawling a site, social-media, trend or ad-library data, a site's private API, a browser for an agent to drive) or an API key, before writing a one-off script or asking where a key lives."
---

# nebi-tools

One home for the tools and keys that used to sit in ecommerce-workspace. Nothing here belongs to one project.

| What | Where |
|---|---|
| Scripts | `~/.claude/skills/nebi-tools/tools/<tool>/`. Master: nebi-skill `claude-home/skills/nebi-tools/`, a public repo, so no keys, account IDs or emails go in it. |
| Python for the scripts | `~/.agents/nebi/venv/bin/python`. Build or refresh: `bash ~/.claude/skills/nebi-tools/setup.sh` |
| API keys | `~/.agents/nebi/secrets/tools.env` (mode 600). Railway: `railway.env` in the same folder, one workspace token per Railway workspace (its header says which workspace holds what and how to call it). The other files in that folder are per-shop credentials. |
| Every tool and saved repo, installed or not | [references/catalog.md](references/catalog.md) |
| Pins and update commands for third-party tools | `~/.claude/nebi/upstreams.json` |

## Pick the tool

| Job | First route | Next |
|---|---|---|
| Read one public page | WebFetch or exa `web_fetch_exa` | `scrapling/scrape.py` (plain, then stealth) or `firecrawl-local scrape <url> --markdown`, then `firecrawl scrape` (credits) |
| A page behind Cloudflare or another bot wall | `scrape.py --mode stealth` | Tilion `read_page`: cloud browser, solves CAPTCHAs, spends credits |
| A whole site or section: crawl it to markdown | `crwl crawl <url> --deep-crawl bfs --max-pages N -o md` (Crawl4AI) or `firecrawl-local crawl <url> --limit N --out <dir>`; both free and local | `firecrawl crawl` or `x download` (cloud credits) when blocked or too big for this Mac |
| List a site's URLs | `firecrawl-local map <url>` (free, local) | `firecrawl map` (1 credit) |
| Structured records across many pages | `firecrawl agent` or Tilion `collect_data` | reverse-api-engineer when it will be pulled again |
| Paid semantic search or a company list from open criteria, on a budget | `exa/exa.py search` or `exa/exa.py agent` with `EXA_LEDGER` and `EXA_BUDGET_USD` set | the exa MCP for quick lookups (unmetered by the ledger) |
| Call a site from code when it has no public API | `reverse-api-engineer` skill and CLI | |
| Watch a page for changes | `firecrawl monitor` | |
| Social posts and replies (X, Reddit, TikTok, Instagram and more) | `tikhub` skill | |
| Search interest and trending searches | `google-trends/trends.py` | |
| TikTok Creative Center trends | `tiktok-creative-center/trends.py` | the browser route in the catalog |
| Competitor ads on Meta | `meta-ad-library/ads.py`; EU reach per ad: `~/.agents/nebi/venv/bin/meta-ads-collector` | |
| Generated images, video or voice | nebi-maintenance capability routing (Higgsfield, ElevenLabs, fal) | |

## Pick the browser

| Need | Use |
|---|---|
| The user's logged-in Chrome | `codex-browser` skill; Claude in Chrome when the user wants to watch in its side panel |
| A clean browser per agent, many at once (sub-agents, flows, tests) | `playwright-cli` skill with one `--session=<agent-or-task>` each, closed when done. `attach --extension=chrome --session=<name>` works inside the user's Chrome as its own tab group. |
| Bot walls, CAPTCHAs, residential IPs, hosted parallel browsers | Tilion MCP: `create_browser_session`, then always `close_browser_session` |
| Lighthouse, network, console | `chrome-devtools` MCP |

## Keys

Scripts read their key from the environment first, then from `tools.env`. To hand a CLI the keys, load them in that command's own shell: `set -a; . ~/.agents/nebi/secrets/tools.env; set +a; <command>`. Never print a value, cat the file, or copy a key into a project file, commit or report. A new key goes in as `NAME=value`, and its name goes in the catalog.

## Add a tool or save a repo

- **A script:** put it in the master under `tools/<name>/` (stdlib plus what `requirements.txt` pins, JSON to stdout, `--out <dir>` for raw data). Pin any new dependency in `requirements.txt`, deploy (`node deploy.mjs` in nebi-skill), re-run `setup.sh`, and smoke-test it from a folder outside nebi-skill.
- **A third-party tool:** review and register it the nebi-maintenance way, then add its catalog row.
- **A repo worth remembering but not installing:** a row under **Saved** in the catalog, with when to reach for it and its install command. That row is how it gets used later without anyone naming it.

## Gotchas

- Two Firecrawls: `firecrawl-local` runs on this Mac and is free (`FIRECRAWL_CLOUD=off` is set globally, so it never hands a page to the cloud); `firecrawl` is the cloud CLI and spends the 1,000 free monthly credits (`firecrawl --status` shows what is left). Firecrawl's 13 skills describe the cloud CLI and are name-only, because their descriptions claim all web research; load the `firecrawl` skill when a route above picks the cloud.
- Tilion costs money: the $5 sign-up credit, then a paid plan. Use it only after the free routes (WebFetch, Scrapling, Crawl4AI, Firecrawl Local) fail on a page, close every session you open (it bills per minute until `close_browser_session`), and tell Nebi what the run used. Firecrawl Cloud spends the free 1,000 monthly credits first; Firecrawl Local and the rest are free.
- reverse-api-engineer runs on the logged-in Claude Code by default. Use `--headless` for public data; driving the user's real Chrome (`chrome-mcp`) needs their yes.
- Meta: one pull at a time, with `--delay 2` or more. Six parallel pulls emptied every Meta route from this Mac for over 40 minutes (2026-11-18).
- Scrapling stealth takes 60 to 90 seconds. Try plain first.
- TikHub bills per call. Check `price` before a loop.
