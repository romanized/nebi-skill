# Codex second opinion — 2026-09-22

## Verdict

The Opus pass fixed the main “take inspiration” failure: real upstream skills now appear in both clients, the Claude `AGENTS.md` leak was addressed, and the discovery reached beyond the four named examples. The register and complaint inbox are useful, and the handoff correctly marked Codex as unverified; the live check now exposes a broken CLI default. I would fix that blocker and the small capture defects, then **subtract overlapping global skills** before adding more harness machinery.

## Findings, ranked

1. **High — Codex CLI default cannot start. Verified.** `~/.codex/config.toml:6` sets `gpt-6-sol`, echoed as the helm binding in `codex-home/AGENTS.md:26-39`. `codex exec --ephemeral -s read-only -C <repo> 'Reply with exactly OK. Do not use tools.'` exited **1**: `The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account.` The CLI also reported unknown model metadata. **Fix:** set a tested account-supported CLI default and update the binding table; a separate ephemeral probe with `-m gpt-5.6-sol` exited **0**. Do not infer the remaining GPT-6 role bindings from model names.

2. **High — “every upstream skill pinned to a commit” remains false. Verified.** Fourteen installed skill entries have neither a source nor skill `pin` in `claude-home/nebi/upstreams.json`; examples are `security-review` at lines 437-452 and `security-threat-model` at 745-760. Their `tree` hashes track content, but do not identify the reviewed commit. **Fix:** record the commit for each installed source or mark a clear, counted exception; retain tree hashes for local-byte comparison.

3. **Medium — capture misses exactly the kind of named repo in this request. Verified.** `claude-home/hooks/feedback-capture.mjs:49-50,67-75` recognizes GitHub URLs, not `owner/repo`: `classify('Please integrate kajisho5/ffmpeg-skill.')` returned `null`. For a 619-character prompt ending in a GitHub URL, classification returned `named`, but `redact()` truncated the stored text at line 92 before `append()` extracted links at 109-110; the stored excerpt contained **zero** links. Lines 95-103 also discard identical consecutive complaints even across sessions. **Fix:** extract validated links and bounded `owner/repo` names from the original user text before truncation, and dedupe only within a session and short interval. Keep the excerpt short.

4. **Medium — one Superpowers “clear win” adds a gate the user did not ask for. Verified conflict; opinion on removal.** The register says `finishing-a-development-branch` has “no Nebi overlap” (`upstreams.json:738-742`), but its source requires the **full** test suite and an exact merge/PR/keep menu that waits for an answer (`~/.agents/skills/finishing-a-development-branch/SKILL.md:14-18,53-82`). That conflicts with proportional proof in `codex-home/AGENTS.md:101-105` and the request for less friction. **Fix:** remove its global trigger or scope it to explicit branch-integration requests; keep the useful `receiving-code-review` skill.

5. **Low — the prompting skill advertises an absolute rule its body now qualifies. Verified.** Its frontmatter says “never scan or search a repository,” while line 23 permits a user-requested investigation (`claude-home/skills/nebi-prompting/SKILL.md:3,23`). **Fix:** align the description and run its focused trigger cases.

## Discovery and simplification

**Verified strength:** `claude-home/nebi/benchmarks/2026-09-22-integration-pass.md:63-84` covers marketing, Shopify, ads, media, browser, design, React, Supabase, Roblox, Railway, connectors and both harnesses. I found no major domain it skipped. The named BrowserSkill is present in ecommerce-workspace for both clients; its project scope and permission rationale are defensible (`integration-pass.md:98-101`).

**Opinion:** drop or park the Codex-global `shopify-expert`, `ui-ux-pro-max` and perhaps `impeccable` before installing another frontend or Shopify skill. Their overlap is already recorded in `upstreams.json:600-613,691-704,763-776`; the installed official Shopify toolkit and `frontend-design` are better defaults for the same work. No new outside candidate cleared the source, maintenance, use and nonduplication bar in this review. Shopify’s [official Liquid skills](https://github.com/Shopify/liquid-skills) include an accessibility skill, but their repo currently shows 26 stars and no releases; treat it as a candidate, not a clear win (source accessed 2026-09-22; no dated release).

**Opinion:** keep the operational register focused on installed, pinned sources. Parked/reference candidates inflate `upstreams.json` to 1,038 lines without affecting update status. Also prune off-domain global skills before spending a permanent 2% of Claude’s context on listings; the report’s copy recall is only 1/2 probes (`integration-pass.md:34,55`).

## Codex live check

- **Verified:** this app session lists all eight requested global skills (`ffmpeg-skill`, `copywriting`, `product-marketing`, `cro`, `receiving-code-review`, `supabase`, `vercel-react-best-practices`, `shopify-shopifyql`) and all six `nebi-*` skills. Their deployed `SKILL.md` files are readable; I loaded `nebi-research`, `nebi-orchestration`, `nebi-sessions` and `nebi-maintenance`. With a tested CLI model override, an ephemeral Codex session counted six `nebi-*` skills. The three ecommerce project skills have Codex files and Claude symlinks, but are not listed in this home-directory session.
- **Verified:** deployed `~/.codex/AGENTS.md` matches `codex-home/AGENTS.md` byte for byte (`cmp` exit 0). `node ~/.codex/nebi/upstreams.mjs --offline` exits 0. The 13 nested `.claude/skills` inside `ffmpeg-skill` are absent from this session’s skill listing. CLI startup warned that some descriptions were shortened to fit its skill budget; this is not proof of failed triggers.
- **Not verified:** `UserPromptSubmit` is configured in `~/.codex/hooks.json:59-66` but has no trust entry under `~/.codex/config.toml` `[hooks.state]`; I did not grant trust or write a complaint to the inbox under this read-only brief. The Codex Stop payload’s `last_assistant_message` and trigger recall were not proven.

The two review scouts ran as GPT-6 Sol at medium effort through sub-agent dispatch. The live CLI success probe used GPT-5.6 Sol because the configured GPT-6 Sol failed.
