# Skills, workflow and continuation refresh — 2026-09-22

## Scope and source of truth

The user authorized discovery, review and useful integration across Codex/Claude, including BrowserSkill, ffmpeg-skill, Linkly, the remembered Cursor skills list, current official workflow guidance and better resume behavior. They explicitly prefer capable research models over cheap weak ones. Three bounded read-only scouts supplied source receipts; the lead owns all edits. A fresh checker reviews the integrated result separately.

Source baseline: `00f204d7343bf478d250d2db8028e9bdab1e6114`, initially clean. The maintained clone is `Documents/GitHub/nebi-skill`; the older home-level `nebi-skill` clone is at `6451ef3` and was left intact. Installed core/skill bytes matched the maintained baseline. Runtime checkpoints stay outside Git.

## Decisions implemented

- Keep the existing six shared workflow skills. Add three maintenance references: a capability route, a narrow local-media method and a source/provenance register. The three harness cores point to the route only for relevant browser/media tasks.
- Make research quality explicit in all cores and the research skill. Preserve existing model bindings and dates: no runtime model setting changed. The configured capable scout is selected explicitly; small mechanical work is a separate role.
- Clarify “Nebi resume”: preserve same-conversation corrections, select new-conversation tasks by identity, re-observe browser state and check pending media jobs before resubmitting. Checkpoint accepted intent at meaningful boundaries. No promise to recover unsaved decisions after a sudden quit or to preserve a provider's prompt cache.
- Clarify that a finished worker can receive a bounded follow-up through a supported native continuation. Cross-harness memory transfer is never assumed.
- Adapt the FFmpeg package's probe-first and output-verification mechanisms in original wording using the existing local FFmpeg binary. Do not install its broad skill trigger, 42-tool runtime or MCP server.
- Defer BrowserSkill runtime installation because the native browser already covers this task. Its CLI/daemon/extension remains a documented candidate for a client with a demonstrated gap. No browser settings or account access changed.
- Keep Higgsfield CLI/connector ownership separate. Route prompt-only work without generating, check live model constraints, and load only the selected workflow. The inspected upstream generate entrypoint has newer defaults; the explainer entrypoint matches locally. This partial review does not authorize an unreviewed whole-pack update.
- Fix installed verification to compare parsed JSON structurally, ignoring object key order while retaining array order and value checks. Reordering a Claude hook object's `matcher`/`hooks` keys previously caused a false configuration-drift failure.

The [source register](../../skills/nebi-maintenance/references/skill-sources.md) contains pinned BrowserSkill, FFmpeg and Higgsfield revisions, license/surface review, catalogs and official documentation. Cursor Team Kit is the strongest candidate for the missing list: official current README lists 18 skills; no primary-source ranked top-20 list was found. The identification remains an inference.

## Evidence

| Check | Observed result | Limits |
|---|---|---|
| Baseline `node scripts/check-pack.mjs` | Pass; six skills, 3,774 name/description characters | Source measurement, not actual client loading or recall |
| Baseline `node --test tests/*.test.mjs` | 41/42 passed; session-state fixture failed because its observation directory was absent | Same fixture passed alone; initial transient failure retained here, not relabeled as a baseline pass. Root cause of that transient was not established. |
| JSON key-order regression | New focused test failed on baseline and passed after `isDeepStrictEqual` change | Also checks changed timeout still fails and verification is read-only |
| `node scripts/verify.mjs` after integration | Exit 0; syntax/pack checks and 43/43 tests passed | Offline executable/structural evidence, not live model-quality measurement |
| `git diff --check` | Exit 0 | Formatting only |
| Native browser | Opened and inspected Linkly's rankings with the active Chrome browser tool | Confirms native browser operation for this read-only task; not a browser benchmark |
| Linkly `llms.txt` | HTTP 200, `text/plain`, read as public data; page displayed 2026-09-21 UTC ranking date | No installer executed, no local documents uploaded, no assertion that listed packages are safe |
| Local FFmpeg 8.1.2 adaptation | Synthetic 320×240, 1.2-second H.264/AAC source → 160×120, 0.6-second H.264/AAC output; output decoded successfully; input hash unchanged; overwrite refused | Uses installed FFmpeg, not the upstream ffmpeg-skill wrapper; no creative-quality or audio-listening claim |

The media smoke initially expected a nonzero exit for `-n` refusing overwrite. This build returned 0 with explicit refusal/error stderr while preserving output bytes. The final check observes unchanged bytes plus refusal stderr; the guide records why a zero exit alone cannot certify a new deliverable. All media tests used generated temporary files, not user assets.

Five new decision cases cover idle resume, stale browser references, redundant browser integration, prompt-only media routing and capable research selection. They are checked for structure but have not been run as a model benchmark. Skill descriptions are unchanged; no claim of improved trigger recall, cache hit rate, response speed or reasoning accuracy is made.

## Deployment and review

- `node deploy.mjs --check`: exit 0; required sources and all configuration targets passed preflight without writes.
- `node deploy.mjs nebi-skills-20260922`: exit 0; 79 deployed files matched source bytes. Existing settings/core backups use the named suffix. Unrelated settings and hooks were preserved; no runtime model configuration changed.
- `node deploy.mjs --verify`: exit 0; all 79 files and three harness hook configurations matched after deployment.
- `node scripts/codex-hooks.mjs`: exit 0; all five Codex events enabled and trusted, with the existing timeouts. No trust change was needed. This is native loader evidence, not a new-task model behavior test.
- Fresh read-only checker inspected the integrated change and raw 43/43 test receipt. It found no material code/routing issue; its request to add deployment and legacy-migration receipts is addressed here.

The same pass found an unmanaged `~/AGENTS.md` containing the July doctrine, obsolete model table and old fixed skill ceiling alongside the maintained `~/.codex/AGENTS.md`. Its exact original bytes were saved to `~/AGENTS.md.nebi-legacy-20260922-bak` (SHA256 `cc2216a3d3761dcabcedf95af9736fb5435e248db17487d1e09a9eeb8133f540`) before atomic replacement. The new home file is byte-identical to `codex-home/legacy-home-AGENTS.md`, a five-line pointer to the maintained Codex core. The backup was verified byte-for-byte and the checker independently confirmed both hashes/content. More specific project instructions retain their scope.

This is a manual one-time legacy cleanup. The template is intentionally outside the normal deployment manifest, which does not acquire ownership of arbitrary `~/AGENTS.md` or project instruction files. The obsolete repository clone is preserved rather than deleted or silently synchronized.

Existing hooks and their trust definitions are unchanged; the only executable source edit is the read-only deployment verifier. No external candidate installer, updater, daemon or service is introduced. No automatic update schedule was requested or created. Updated cores and skills load in new tasks/sessions; startup reload and live behavioral benchmarks were not forced into the user's running clients. This report records the local deployment phase; subsequent publication is recorded in the repository history.
