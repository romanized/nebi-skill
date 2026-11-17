# Native runtime integration — 2026-09-08

## Starting point and scope

The repository already contained the uncommitted whole-pack pass on top of `bf92572`. It was preserved and treated as the starting state. That report explicitly had no live deployment. This pass audits the installed Codex and Claude setup, finishes deployment, and adds native integration. Token optimization, model/default-permission changes, third-party blanket installs, and unrelated project work are excluded.

Installed versions at audit: Codex CLI 0.153.0, Claude Code 2.1.263, Node 26.5.1 on macOS. A bounded research scout checked official docs, GitHub and skills.sh. The lead owns all changes; a separate fresh checker reviews the integrated runtime/deployment delta. Public source and adoption receipts are in [SOURCES.md](../SOURCES.md#2026-09-08-native-runtime-integration).

## Implemented source

- The pending six-skill corrections, deploy hardening and tests remain intact.
- Shared hook masters now determine their runtime directory from their installation. Three fixture failures reproduced the previous Codex-to-Claude steering/state leakage and missing Codex patch ledger before the repair.
- Codex tracks `apply_patch`; failed Bash payloads are not treated as success. Native unified-exec text stays unknown. Codex Stop uses supported advisory `systemMessage`; Claude retains supported soft Stop feedback. SessionEnd uses Codex's native three-second cap and bounded Git calls.
- Both clients use the shared Node startup handler, exposing current repository facts and a pointer to the correct saved-work note without rewriting intent. Old Bash/PowerShell sweeps remain manual compatibility tools, no longer registered by deployment.
- Native `nebi-scout` and `nebi-checker` adapters load per client and inherit dispatched models. Claude uses tool allowlists. Codex uses a read-only filesystem sandbox plus an instruction against external mutations; inherited MCP permissions are not claimed to be sandboxed by that filesystem policy.
- The deployer owns Codex hook definitions and both clients' adapters, preserves unrelated settings/hooks and runtime state, and adds read-only `--verify` drift detection. `scripts/codex-hooks.mjs` uses native loader hashes for explicit Nebi-only trust activation after installed-source verification.
- Claude core clarifies auto memory as cached stable knowledge; explicit current-work/handoff intent stays authoritative. No extra memory store was created.

## Verification and activation receipts

Live deployment and activation completed on 2026-09-08. Existing sessions retain their loaded instructions; new sessions load the deployed core, skills and native roles. Native Claude loading and both installed startup handlers were exercised after deployment.

| Check | Observed result |
|---|---|
| Original source baseline | 29/29 offline tests passed. |
| New Codex regressions before repair | All three failed for the expected cross-client state/steering and missing-ledger reasons. |
| Integrated offline checks | 35/35 passed; native script syntax and pack structure passed. |
| Isolated deployment | Succeeded; installed byte/config check passed. |
| Staged native Codex trust | All five hooks accepted by Codex 0.153.0 and reported enabled/trusted. |
| Native trust preservation fixtures | Unrelated trust and model setting preserved; an explicitly disabled owned hook caused activation to refuse without changing state. |
| Fresh independent review | Initial Sol checker could not run due to usage limit; disclosed replacement Terra reviewer found no material issue in deploy, trust helper and runtime-directory handling. Other handlers have the focused regression proof above. |
| Live deployment | `node deploy.mjs nebi-20260908-runtime`: 71 deployed files matched masters byte-for-byte; dedicated settings/hook/core backups created or preserved. |
| Installed verification | `node deploy.mjs --verify`: all 71 files plus three clients' Nebi hook configurations matched. |
| Live Codex activation | Native `hooks/list` reports all five current Nebi hooks enabled and trusted. Only owned hook trust was updated by the activation helper. |
| Installed startup execution | Both `.claude` and `.codex` startup handlers returned valid native context naming the correct runtime. |
| Claude native registry and read | Claude 2.1.263 loaded both native roles and all six Nebi skills; scout tool list was exactly Read, WebFetch, WebSearch, Grep and Glob. A direct Read returned the private fixture marker `NEBI_NATIVE_7391`. |
| Codex native smoke | A restricted ephemeral Codex run using the staged profile returned the same exact fixture marker. This does not establish broad native-agent reliability. |
| State/config preservation | Both current-work files and failure logs retained their pre-deploy hashes; unrelated Claude settings and existing unrelated Codex hook trust were preserved. |

The first Claude subprocess probe inherited its parent script on stdin and answered that script rather than the intended read task. It was not counted as a successful action test. The corrected invocation detached stdin and directly observed the fixture marker. Its first init stream still established the native role/skill registry and tool allowlist.

Other global Codex preferences changed during the session (including model/effort/service tier and a new project entry). Their origin was not established and they were left intact. The deployer does not write `config.toml`; the native activation fixture separately verified that its writes preserve non-hook configuration. This pass does not claim the full global config stayed byte-identical throughout a concurrently used app.

After the preservation check, one audit-correction line was intentionally appended to the Codex failure log: the lead initially inferred installed hook absence from the source deployer, then corrected that claim after reading the live hook files. Existing log content was preserved. The temporary authentication link used by the isolated native smoke was removed.

## Limits

- The hook ledger is a command-order heuristic, not semantic proof. Codex's native plain-text hook payload cannot establish command exit status; the lead reads the full tool result. Shell-side writes and external tools are outside its edit coverage.
- Role adapters do not trigger a mandatory fleet, override model preferences, or supply an isolation guarantee for external MCP mutations.
- The prior mixed-skill recall findings remain separate from this integration. No broad cross-model recall or reliability gain is claimed.
- The native Codex smoke reported shortened skill descriptions in its loaded catalog. No skills were disabled or trimmed because token optimization was explicitly out of scope; full-catalog trigger recall remains unmeasured.
- Hosted CI and real Windows/PowerShell/Cursor execution have not been observed in this pass. No CLI or desktop upgrade was performed.
- The deployer is preflighted and verified, not transactional. Existing source work remains uncommitted; no push or publication is part of this task.
