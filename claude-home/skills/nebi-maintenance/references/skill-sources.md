# Integrating upstream skills and tools

The upstream register is `claude-home/nebi/upstreams.json` in the nebi-skill repo, deployed to `~/.claude/nebi/upstreams.json` and `~/.codex/nebi/upstreams.json`. It is the one record of every third-party skill, pack, plugin and tool we use or reference: repo, pin, install locations, local edits, decision and the exact update command. Decisions and receipts from the 2026-09-22 reviews are in `claude-home/nebi/benchmarks/2026-09-22-skills-and-continuation.md`, `2026-09-22-upstream-deltas.md` and `2026-09-22-integration-pass.md`.

## Catalogs to browse

| Source | Useful for | How to read it |
|---|---|---|
| [skills.sh](https://skills.sh/) | Widely installed skills and publisher pages | Installs show adoption, not safety or fit. Open the repository. |
| [Linkly rankings](https://linkly.ai/skills) and [plain-text index](https://linkly.ai/skills/llms.txt) | Cross-registry discovery, trends, official publishers | Rankings are the publisher's heuristic. The [dataset](https://github.com/LinklyAI/best-skills) is CC BY 4.0. |
| [Anthropic skills](https://github.com/anthropics/skills), [OpenAI skills](https://github.com/openai/skills) | Official workflow implementations | Review the selected skill and its license. |
| Vendor repos (Shopify, Stripe, Supabase, Higgsfield, ElevenLabs, Remotion, fal, Canva) | Skills that track the vendor's own API | Prefer these over community rewrites of the same API. |
| [GitHub agent-skills topic](https://github.com/topics/agent-skills), issues, releases, social posts | New candidates and maintenance signals | Leads only: trace each to its repository before it counts. |

## Install something

1. Resolve the repo's current commit (`git ls-remote https://github.com/<owner>/<repo> HEAD`) and read what you would install at that commit: `SKILL.md`, references, scripts, package manifests, hooks, extension manifests and permissions.
2. Decide scope by use: one project installs in that project; several projects install globally. Named by the user means install; a deviation (adapt, defer, partial) is reported to the user in the same reply with its reason.
3. Install with the skills CLI, pinned to that commit: `npx skills add <owner>/<repo>#<sha> --skill <names> -g -a claude-code -y` (global) or the same without `-g` from the project root; add `codex` after `claude-code` once Codex is no longer parked. Set `DISABLE_TELEMETRY=1`. `-a claude-code` creates the `~/.claude/skills` link Claude Code needs; without it only Codex sees a global skill. Plugins use `claude plugin install <plugin>@<marketplace>`; tools with binaries follow their reviewed release steps.
4. Back up any installed copy you replace and diff it first. The register records local edits so an update never silently overwrites them.
5. Add or update the register entry (pin, per-skill folder `tree` or commit, `installed` paths, `localEdits`, `decision`, `update` with `<SHA>` as the placeholder), redeploy, and run `node ~/.claude/nebi/upstreams.mjs` to confirm it reads `current; matches pin`.
6. Prove it loads: the skill appears in a fresh session's skill list for each client that should have it.

## Refresh

Run `node ~/.claude/nebi/upstreams.mjs` (or `--offline` for install checks only). It flags folders changed upstream, local edits, missing installs and lock entries not in the register. It never updates. For each flagged source, read the upstream diff between the pin and HEAD, then run the printed update command, re-pin the entry, and redeploy.

Plugin caches belong to their plugin manager and parked packs in `~/.agents/skills-project-packs/` are archives; neither is a source of truth. No universal skill-count limit is assumed: measure the client's listing budget and trigger recall instead.
