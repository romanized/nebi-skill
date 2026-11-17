# Integration pass — 2026-09-22

Base: `2aef4f9`. Lead: Claude Code 2.1.280 on Opus 5.5 (1M). Fleet: 4 read-only Opus 5.5 discovery lanes (transcript evidence, named examples, commerce/media, dev/harness plus social scrape), 1 fresh-context Opus checker, and 1 read-only scout for a follow-up topic the user raised mid-pass (not part of this commit). Every dispatch passed `model: opus`; all lane transcripts report `claude-opus-5-5`.

## 1. Verdict on 2aef4f9

| Helped | Didn't help | Changed now |
|---|---|---|
| `isDeepStrictEqual` fix for JSON key order in `--verify` (real bug, tested) | Wrote the inspiration pattern into policy: BrowserSkill "defer", ffmpeg-skill and superpowers "adapt, nothing installed" | Named examples installed from pinned upstreams; eval 6 that rewarded "defer" rewritten |
| `higgsfield-generate` updated to a pinned upstream with byte receipts | Capability routing lived in a `nebi-maintenance` reference that media and browser tasks never load, behind a vague path | Routing rewritten (Canva, ffmpeg-skill, bsk added); cores point at the absolute path |
| Resume guidance (same-conversation corrections, job IDs, stale tabs) | `local-media.md` rewrote ffmpeg-skill "in original wording" | Deleted; the real `ffmpeg-skill` replaces it |
| Research-model quality line | The new `~/AGENTS.md` Codex pointer leaks the Codex core and GPT bindings into Claude sessions without a CLAUDE.md (seen in this session's own context) | `claudeMdExcludes` merged by deploy; a fresh session now loads only `~/.claude/CLAUDE.md` |
| | Left the intermittent session-state test "root cause not established" | Root cause found (400 ms git identity budget under load) and fixed with a regression test |
| | Recorded the user's 09-22 complaint as "one-session report, not promoted" | Maintenance now applies user-stated corrections without the two-session wait |

Net: small real fixes, but the pass reinforced the roadblock it was asked to fix. Most of its 327 added lines are prose and eval cases recording decisions not to install.

## 2. Why named skills kept disappearing (evidence)

- **Mechanical:** installs landed only in `.agents/skills` (Codex) without `-a claude-code`, so Claude Code never saw them. Before this pass Claude Code could not see any global design, marketing, Shopify, Luau or security skill. The user asked for Emil's skills in 4 projects (evidence lane, 25 sessions with this pattern).
- **Listing budget:** `/skill-doctor` showed Claude's skill listing already past its default budget (1% of context), with about 30 skills cut to bare names. New skills start at 0 uses, get the lowest priority and would have shown as names only (budget logic read from the 2.1.280 binary: `context × 4 × fraction`, priority mode drops descriptions).
- **Policy:** doctrine §10 said "discuss it, we decide together" and "keep domain skills project-local"; `nebi-maintenance` said "adapt the smallest useful mechanism… defer copying"; the capability route said "take the smallest useful part"; an eval rewarded deferring.
- **Literal reading:** `nebi-prompting` said "do not add scope", which treated named examples as the full list (logged twice on 09-22; 6 sessions show the literal/intent mismatch in both directions).

## 3. Applied changes and proof

| Change | Fixes | Proof |
|---|---|---|
| Cores §4: "my examples are starting points, not the list"; §10: "what I name gets integrated", a find bar, scope by use, one register, "use what's installed" (Claude, Codex, Cursor) | Inspiration pattern, literal reading, unused skills | Read back; `check-pack` passes; fresh-session probes below |
| `nebi-maintenance`: install named upstreams pinned for both clients, deviations announced; user corrections apply without a second session; inbox triage | Same, at the method level | Evals 6 (rewritten) and 8 (new) |
| `nebi-prompting`: "improve, don't invent" with a `What I added:` line; named examples widened into a bounded search; a user-requested investigation is allowed (body only; the routing description is unchanged) | §4 vs "do not add scope"; the 09-22 prep-session collision | Evals 11 and 12 (new, structure-checked only) |
| `upstreams.json` (40 curated sources, 77 skill entries, plus every project lock under `~/Documents/GitHub`) + `upstreams.mjs` status (deployed to both clients) | Tracking spread over 17 lock files; no way to see what is behind upstream or visible to one client only | 7 unit tests; live run against every upstream (see §5) |
| `feedback-capture.mjs` (UserPromptSubmit, both clients) + concession capture in the Stop hook | Complaints never had a logging path | 6 tests; live headless probes captured a complaint, a named repo and a concession; replay over 470 real Claude user turns captured 37, about 84% judged real by hand (§6) |
| Deploy: `claudeMdExcludes` += `~/AGENTS.md`; `skillListingBudgetFraction` 0.02 unless set | Codex doctrine leak; installed skills shown as bare names | Deploy test; a fresh session and a sub-agent it spawned load only `~/.claude/CLAUDE.md`; `/skill-doctor` shows full descriptions (copywriting ~260 tokens, stripe-projects ~320 instead of `< 20`). Cost: the listing may now use up to 2% of context each turn (about 20k tokens at 1M; the measured catalog is about 64k characters, roughly 16k tokens). 200k-context sessions get 16k characters and still fall back to names for the least-used skills |
| `context.mjs` identity timeout 400 → 1500 ms; the three fact reads share 700 ms | Session context dropped when git is slow under load (the "flaky" test); keeps SessionEnd inside Codex's 3 s cap | Regression test fails on the old code and passes on the new; full suite passed 3 consecutive runs |
| Model bindings: Claude Opus 5.5 / Fable 5.1; Codex GPT-6 Sol (helm) with other rows marked `*` inferred; Cursor date only | Stale 08-31 tables | `config.toml` model `gpt-6-sol` (effort now `medium`); this session's environment lists Opus 5.5 and Fable 5.1. Codex rows other than the helm are inferred and marked |

Full verification after the checker fixes: `node scripts/verify.mjs` exit 0, 58/58 tests; `git diff --check` clean; deploy exit 0; `node deploy.mjs --verify` exit 0: 83 source files and three hook configurations match.

### Installs (backup: `~/.agents/nebi/backups/integration-20260922/`)

Global, both clients unless noted, via `skills@1.7.0` pinned refs:
- **Named:** `ffmpeg-skill` @62c7953; marketingskills @5b2c000 (`product-marketing`, `copywriting`, `cro`, `seo-audit`, `ai-seo`, `analytics`, `schema`); superpowers @5bf4e78 (`receiving-code-review`, plus the existing `verification-before-completion` linked for Claude; `finishing-a-development-branch` was installed and then removed after the Codex review, see §10); Canva skills @b56291e (5, Claude only, `--copy`).
- **Clear wins:** `frontend-design` @34040c9 (newer anti-template guidance); `emil-design-eng` @85e8e23; `stop-slop` reinstalled @8da1f03 (the July install lacked its `references/`); `supabase` + `supabase-postgres-best-practices` @8331f91; `vercel-react-best-practices` @063bee9; Shopify toolkit @57e293b (`shopify-admin`, `shopify-liquid` updated; `shopify-custom-data`, `shopify-shopifyql`, `shopify-use-shopify-cli` added) with the telemetry opt-out file.
- **Made visible to Claude (symlinks, no content change):** `luau-best-practices`, `luau-type-expert`, `rojo-pro`, `shopify-liquid-themes`, `liquid-theme-standards`, `security-and-hardening`, `security-review`, `security-threat-model`, `verification-before-completion`.

Project `ecommerce-workspace` (both clients): `attribution`, `emails`, `offers` @5b2c000; Claude now links the same `ads`, `customer-research` and edited `ad-creative` that Codex uses; `browser-skill` @75e2c64 (release v0.3.0) with `bsk` 0.3.0 in `~/.local/bin` (sha256 matches the GitHub asset digest). `~/.zshenv` gains `FFMPEG_SKILL_NO_OVERWRITE=1` and `BSK_AUTO_UPDATE=off`.

### Fresh-session checks (headless Claude Code, Opus 5.5, read-only tools)

| Probe | Before | After |
|---|---|---|
| Registry in ecommerce-workspace | 83 skills; copywriting, ads, customer-research, cro absent | 123; all expected skills present |
| "Make a 9:16 Reels copy of clip.mov, don't run" | — | Loaded `ffmpeg-skill`, not Higgsfield; probe-first commands |
| Instruction files in nebi-skill (no CLAUDE.md) | `~/AGENTS.md` loaded (this session) | Only `~/.claude/CLAUDE.md` |
| Rug product copy | no skill (0/1) | with "use what's installed": copywriting 1/2 |
| Premium hero improvements | no skill (0/1) | with the rule: emil-design-eng + frontend-design 2/2 |

Small samples. Copy recall improved but is not reliable yet.

`ffmpeg-skill` doctor: 39/42 tools usable on Homebrew FFmpeg 8.1.2; caption, graphics and stabilize need `ffmpeg-full`.

## 4. Discovery by area

| Area | Have now | Verdict |
|---|---|---|
| Marketing/SEO/ads | marketingskills (now current, both clients) | Installed (7 global, 6 project). Skipped image/video/B2B/social skills (overlap or off-domain) |
| Shopify | toolkit 1.16 skills, liquid skills | Installed updates + 3 skills + telemetry opt-out. Shortlist: official Shopify/liquid-skills + liquid-theme-a11y, liquid-lsp plugin. Skip: Shopify Dev MCP (the connector already covers it) |
| Paid ads / analytics | browser sessions, ShopifyQL | Shortlist: Meta Ads MCP (official, reporting-only rules before the 09-25 read), GA4 MCP, Merchant API MCP. Skip: Google Ads MCP (no spend yet), Klaviyo (not used), windsor.ai |
| AI media | Higgsfield (current), fal (current), ElevenLabs connector, Remotion plugin 4.0.512 | Shortlist: Remotion update to 4.0.527, ElevenLabs project copies refresh, rembg or Apple Vision cut-outs, `ffmpeg-full` |
| Image/design editing | Canva connector unauthenticated | Installed Canva skills; auth and the Codex plugin are user steps |
| Video | ffmpeg-skill | Installed (named) |
| Browser | Claude in Chrome, Codex browser | bsk installed project-local (deviation below) |
| Design/frontend | frontend-design, emil, impeccable, ui-ux-pro-max, gsap-framer, taste-skill copies | Updated frontend-design and emil for both. Shortlist: park ui-ux-pro-max and gsap-framer-scroll-animation, impeccable per project, official gsap-skills per GSAP repo, GoogleChrome/modern-web-guidance, vercel-react-view-transitions |
| React/Next | none | Installed vercel-react-best-practices. Skip: Next.js skills (bundled in Next 16.3 docs) |
| Supabase | MCP only | Installed supabase/agent-skills |
| Roblox/Luau | dig1t skills (now both clients) | Nothing better found |
| Railway | use-railway (current) | Nothing to do; shortlist name-only if it mis-triggers |
| Gmail/Drive | connectors | Shortlist: Anthropic small-business inbox-manager and ticket-deflector for ecommerce-workspace |
| Harness (Claude) | hooks, statusline, evals | Adopted: AGENTS.md exclusion, listing budget, /skill-doctor in routing. Shortlist: sessionTitle from SessionStart, `omitClaudeMd` for nebi-scout, `bashEditDiff` in the ledger (needs a noise check), `claude plugin eval` pilot, Stripe/Remotion plugins to project scope |
| Harness (Codex) | hooks, skills | Shortlist: decide on the external-agent import sync (it imports Claude plugins and 325 transcripts); `[[skills.config]]` for off-domain globals |
| Cross-model review | nebi-checker (same family) | Shortlist: `codex review --uncommitted` as a different-family checker (you run it) |

Social scrape (TikHub, $4.952 → $4.926, 26 calls = **$0.026**; raw pulls under `research/2026-09-22-discovery/raw/`, not committed). Traced leads: Claude reads AGENTS.md when no CLAUDE.md exists (confirmed; drove the exclusion); MCP skills-discovery standard SEP-2640 is real but no client ships it; plugin4shell (plugin SHA pins bypassed by branch names) is patched in the installed versions; the official claude-code-setup plugin overlaps `nebi-maintenance`; RTK/caveman token savers mislead the agent per users (skip).

## 5. Register and update command

`node ~/.claude/nebi/upstreams.mjs` (or `~/.codex/nebi/upstreams.mjs`; `--offline`, `--json`, `--all`). It uses blobless git caches under `~/.agents/nebi/cache/upstreams/` and takes about 2 minutes cold. It checks the 40 curated sources, requires every global-lock skill to be registered, and reads every project `skills-lock.json` one or two levels under `~/Documents/GitHub` (written by the skills CLI on install, so records stay complete without an agent remembering). Per skill it reports current / changed upstream / removed upstream / unpinned, then matches pin / local edits (named files) / differs from HEAD (behind or edited, when unpinned) / missing / parked, plus "Codex only" when a project skill has no `.claude/skills` link. It prints each flagged source's pinned update command and never updates. It ignores what the skills CLI never copies (`metadata.json`, `__pycache__`, `.git`) and plugin `.in_use` markers.

Final run (receipt): 63 registered rows `current; matches pin`. Behind upstream: `security-and-hardening`, `ui-ux-pro-max`, `impeccable`, `browser-skill`, and the Remotion plugin; the unpinned claude-security plugin cache differs from upstream HEAD. Local edits: only the user's `ad-creative` (1 file). Project installs: 346 skills in 15 other project locks; 108 clean; 148 differ from upstream HEAD; 113 visible to Codex only; 24 in a lock but not installed; 7 removed or renamed upstream. The categories overlap. These project installs were not changed: they are the backlog for per-project decisions.

## 6. Complaint capture

Why `failure-log.md` went quiet: 20 of its 28 entries were §6 items prompted by the Stop hook. On 2026-08-31 `nebi-maintenance` lost "one log line in the moment", and on 2026-09-08 the Stop hook text lost "add one line to failure-log.md". User complaints never had a logging path: a regex estimate finds 38 complaint turns in about 36 Claude sessions between 08-31 and 09-22, none logged, while agents conceded 45 times in 26 sessions.

New: the UserPromptSubmit hook writes complaints, ideas and named repo links (kept whole in a `links` field) to `~/.agents/nebi/feedback/inbox.jsonl`; the Stop hook adds agent concessions. It is silent (no model context), deduped, owner-only (0600), masks common secret/key/email/phone shapes, reads only the opening and closing words of long messages, and ignores quotes, code, slash commands and sharpened `## Goal` briefs. `NEBI_FEEDBACK_CAPTURE=off` disables it; the trigger-eval runner already disables all hooks. Replay over the 470 retained Claude user turns: 37 captured; by hand about 31 are real complaints, ideas or named repos (for example "Stop asking me, reconnect and fix it, do it yourself", "you are so unclear", "why are you using Haiku sub-agents", "fix whatever you broke"); the misses are mostly "I told you" inside long instruction dumps. `nebi-maintenance` triages the inbox and treats each entry as a lead, reading the session before acting. On Codex it starts working once Nebi trusts the hook.

## 7. Deviations (§3b)

- **BrowserSkill** (update 2026-09-23: removed at the user's request after the extension step; the register keeps it as a reference with reinstall steps) was project-local in ecommerce-workspace, not global: a global "drive my browser" skill would compete with Claude in Chrome and the Codex browser in every session, and the extension has debugger + all-URLs access. The extension install is a user step.
- **superpowers** is a 2-skill subset plus the existing verification skill, not the plugin: its bootstrap hook and brainstorming/TDD/debugging skills conflict with §4, §6 and the nebi skills.
- **Canva** needs your OAuth; I cannot finish it. Codex gets Canva from its official plugin, which you enable.
- **Codex hook trust** for the new UserPromptSubmit hook is not done: the helper launches `codex app-server`, and you said not to run Codex.
- **Cursor bindings:** date updated with a "not re-verified" note; names unchanged (no local model list).
- **`ffmpeg-full`**: on its own it would upgrade x265 and break `ffmpeg` 8.1.2 (`libx265.216` → `.217`). The permission system refused the upgrade for the sub-agent, so the user ran `brew upgrade ffmpeg` (9.0.2) and `brew install ffmpeg-full` (9.0.2). Its bin folder is now first on PATH via `~/.zshenv` and, after `brew shellenv`, `~/.zprofile` (both backed up). ffmpeg-skill doctor: 42/42 in normal and login shells; a 1080x1920 caption burn-in rendered correctly (frame checked); yt-dlp finds ffmpeg 9.0.2.
- **`bashEditDiff`** not wired: test runs that write files would count as edits and trigger false Stop nudges.
- **`nebi-prompting` description** unchanged: its body now allows a requested investigation, but the routing text still says "never scan"; changing it needs a trigger-suite run.
- **Project installs** in the 15 other project locks were reported, not changed (113 Codex-only, 148 stale or edited): fixing them touches other repos.

## 8. Checker review and what changed

A fresh-context Opus checker reviewed the full diff and proof files (15 findings). Accepted and fixed: register missed 15 project locks (now read automatically); named-repo capture turned URLs into `[secret]` (links kept whole, tested); `SOURCES.md` still said "project-local" and "harvest ideas" (rewritten, deploy contract updated); capture false positives such as "you never commit .env" (patterns tightened, replay measured); prompting line 85 and eval 12; maintenance evals 3 and 4 still rewarded adapting; budget cost unstated (stated above); ffmpeg-skill's bundled dev skills (checked: not in Claude's registry); Codex capture described as active (now "once trusted"); SessionEnd budget (facts share 700 ms); Codex binding citation and unmarked guesses; file-level comparison gaps (`-z`, tree-only pins, pin-fetch message); missing receipts (added here); inbox permissions and redaction. Rejected: that the discovery installs were self-authorized; the user asked to install clear wins and name each one.

## 9. Not verified

- Codex side live: skill listing and budget, trigger behavior, the new hook (untrusted until reviewed), and whether Codex skips ffmpeg-skill's hidden `.claude/skills` folder (Codex source says it skips hidden folders).
- `bsk doctor` with the extension connected; Canva tools after auth.
- Copy-skill recall beyond 2 runs; no repeated trials for other domains.
- Codex binding rows other than the helm (inferred from model names).

Receipts not stored in the repo (local scratch, this session): full suite logs, deploy logs, fresh-session JSON, `/skill-doctor` output, capture replay, register run. Reproduce with `node scripts/verify.mjs`, `node deploy.mjs --verify`, `node ~/.claude/nebi/upstreams.mjs`, and `claude -p "/skill-doctor"` in a project.

## 10. Codex review: kept and rejected

Codex (GPT-6 Sol, read-only) reviewed `2aef4f9..648ab8f`; its notes are in `codex-review-feedback.md`. Each point was checked against the repo and the machine before acting.

| Codex point | Verdict | What changed |
|---|---|---|
| 1. `gpt-6-sol` CLI default fails on a ChatGPT account | **Kept, narrower cause.** Codex's model list was fetched by client 0.155 (the app) and lists GPT-6 Sol with max/ultra efforts; the terminal CLI is 0.153, which matches its "unknown model metadata" warning. The app works; the old CLI does not. | With the user's go-ahead, `codex update` moved the CLI from 0.153.0 to 0.156.0 (official installer, checksum-verified); a one-line `codex exec` smoke on the configured `gpt-6-sol` then exited 0 with `OK`. `config.toml` was not changed. The helm row records the minimum CLI version; inferred rows stay marked. |
| 2. 14 installed skills had no commit pin | **Kept.** | Walked each upstream's history: all 13 tree-only skills resolved to the exact commit whose folder equals the installed bytes (for example `security-review` → `24361e7`, `impeccable` → `b0594c7`). Tree hashes kept. One counted exception: the claude-security plugin cache records no commit. |
| 3. Capture misses bare `owner/repo`, loses links after truncation, dedupes across sessions | **Kept, all three.** | Links and bare repos are taken from the full text before truncation; a bare `owner/repo` counts only with install/integrate in the preceding 80 characters and never when it looks like a file; only same-session repeats are dropped. Replay: 38 of 468 real turns captured (35 complaints, 1 idea, 2 named repos); the file-path noise a looser rule produced is gone. |
| 4. `finishing-a-development-branch` adds a gate | **Kept.** Its text fires on "implementation is complete", demands the full suite and waits on a merge/PR/keep menu. | Uninstalled from both clients and the lock; the register records it as removed with its pin. `receiving-code-review` stays. |
| 5. Prompting description still says "never scan" | **Kept.** | Description now allows a requested investigation; the 14-case trigger suite, run headless on Opus 5.5 against the source pack: 14/14 pass (6 must fire, 8 must not). |
| Park `shopify-expert`, `ui-ux-pro-max`, maybe `impeccable` | **Agreed;** the user approved parking. | Moved `shopify-expert`, `ui-ux-pro-max`, `impeccable` and `gsap-framer-scroll-animation` from `~/.agents/skills` to `~/.agents/skills-project-packs` (backup kept); register and the packs README record why. Project copies are untouched. |
| Drop parked and reference entries from the register | **Rejected:** the user asked for one register of every source "we use or reference"; parked and reference rows are that record and cost no status time. | None. |
| Prune off-domain globals before paying the 2% listing budget | **Partly kept:** 2% is a cap, not a fixed spend (measured catalog about 16k tokens); Codex also reported shortened descriptions in its own listing, which supports the same parking question. | Folded into the parking question. |
| Official Shopify liquid-skills is a candidate, not a clear win | **Agreed;** it already sat on the shortlist. | None. |

Codex's live check confirmed the Codex side: all eight requested global skills and six `nebi-*` skills listed, deployed `AGENTS.md` byte-identical, `upstreams.mjs --offline` works from the Codex copy, and ffmpeg-skill's nested dev skills are not listed. Still open: trusting the Codex UserPromptSubmit hook and confirming the Stop payload for concessions.
