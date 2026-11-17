# Whole-pack improvement pass — 2026-09-08

## Scope and starting state

Inspected all six skill masters and their trigger/decision corpora; three harness cores; deployment and wrappers; all hooks, sweeps, status line and Cursor injection; rules, command, style, source history, and the prior benchmark. Git began clean on `master` at `bf92572`. Reviewed eight recent commits plus relevant Claude/Codex runtime failure logs. The unrelated saved-work note was not used or overwritten.

The lead used independent skill and evidence audits, two isolated implementation worktrees, two fresh action-test workers, and a fresh reviewer. The lead reconciled the changed-file union and reran integrated proof. No live deployment, global skill installation, commit, or push was performed.

## Findings and implementation

| Finding | Change and reason |
|---|---|
| Debugging description contained an unquoted colon; Ruby Psych rejected its YAML | JSON-quoted all descriptions without changing semantic text. Added an offline frontmatter/structure/reference checker. |
| Maintenance taught a client-specific 1,536-character cap and an assumed 1% listing budget | Applied the portable 1,024-character description specification; distinguish source characters, runtime visibility, and unmeasured recall. |
| Discovery instructions could execute unfamiliar installers merely to read help | Inspect source/metadata first; preserve already granted integration authority; record revision, license, dependencies, permissions and fit. |
| Debugging absolutes could obstruct containment or protect an obsolete test | Separate authorized containment from correction, bound repro attempts, preserve the intended contract, and use appropriate regression evidence. |
| Foreign state and fixed compaction assumptions caused friction | Follow the user-resolved source of truth, keep another project's state intact, avoid universal retention claims, preserve trailing notes and unknown Git states. |
| Prompt-artifact rules could conflict with ordinary execution | Explicitly scope artifact/Go? rules to artifact requests; ordinary authorized work proceeds. Rechecked both routes after the final clarification. |
| Orchestration had ambiguous checker/capacity/steering rules | Keep one owner for related edits, use available capacity, and stop or redirect superseded lanes. |
| Core wording encouraged speculative reuse and duplicated uncertain skill-discovery assumptions | Align quality/proof/discovery invariants across the three cores; preserve model bindings and dates. |
| Deployment could discard malformed nested hooks, remove unrelated filename matches, or mishandle quoted paths | Preflight merge shapes, match exact known paths, quote POSIX paths, validate suffixes, verify generated JSON, propagate wrapper exit codes, and add no-write check plus isolated home. |
| Supporting skill resources could be silently omitted | Recursively deploy resources only inside the six curated skills; retain explicit other-master manifests, mandatory corpora, and symlink rejection. |
| Evidence hook was a weak heuristic with incomplete success/failure handling | Handle documented PostToolUse and PostToolUseFailure payloads, wire both events, prevent earlier success masking later failure, and explain that command relevance/shell writes remain outside its proof. |
| Trigger runner could grade quoted JSON, incomplete sessions, missing skills, or unavailable CLI as valid results | Structured invocation detection, explicit terminal/registry/schema requirements, ERROR separation, namespaced temporary plugin loading, answer-free staging, bounded runs and reproducible reports. |
| Trigger cases did not measure composition; most behavior cases only asked for decisions | Added same-session required/forbidden co-fire cases, eight decision cases, six executable action fixtures, and the missing two-turn SQLite fixture. |
| No persistent local executable test entry point or CI | Added dependency-free verification and fixture suites, with pinned read-only CI jobs. Hosted jobs remain unrun locally. |

## Outside material

The full source/revision/license/permission receipts are in [SOURCES.md](../SOURCES.md#2026-09-08-reviewed-inputs-and-decisions).

- Adapted the held-out/repeated evaluation method from Anthropic skill-creator; imported no code and ran no optimizer.
- Rejected installing Obra verification-before-completion: it duplicates existing Nebi proof rules. Kept the existing mechanism and clarified evidence-to-property fit.
- Rejected Microsoft SkillOpt: its installers, hooks, state mutation and dependencies would introduce a second maintenance framework.
- Rejected global doubt-driven-development: mandatory cross-model interactions would overrule proportional review.
- Installed/removed/merged no third-party skill package. The useful additions are local verification capabilities, not another global skill. Discovery used local catalogs, skills.sh, GitHub metadata/source, and primary specifications.

## Verification receipts

Source measurements: six name/description entries total 3,772 characters; bodies range from 27 to 95 lines; 76 trigger rows and 40 decision cases. These are source measurements, not runtime listing-budget or recall estimates.

Local environment: macOS, Node `v26.5.1`, Claude CLI `2.1.263`. Dates in JSON are UTC; this report uses Europe/Amsterdam.

| Check | Actual result |
|---|---|
| `node scripts/verify.mjs` | 29 tests passed; 0 failed, skipped, or cancelled. All repository `.mjs` syntax checks and pack structural checks passed. |
| Independent final review | No remaining material implementation defect after repairs; the outstanding report-file omission was closed by this document. |
| Ruby Psych parsing of six frontmatters | All six parsed. Before the repair, debugging failed with `mapping values are not allowed in this context`. |
| `bash -n deploy.sh claude-home/nebi/session-start-sweep.sh` | Passed. PowerShell runtime execution was unavailable. |
| Isolated `deploy.mjs --check --home` | Passed with no target writes. |
| Isolated full `deploy.mjs --home` | 63 copied/seeded files matched masters byte-for-byte; generated JSON readback passed; new prompting fixture reached shared skills. |
| SQLite setup fixture | Two source rows, empty target table, target-only reader/query log, and refusal to clobber a nonempty destination verified. The full two-turn migration was not rerun. |
| `git diff --check` | Passed. |

Eight pre-change decision probes were run by a fresh worker before editing skill bodies. They exposed the stale listing cap and a route toward invoking untrusted installer help. The other probes largely succeeded despite conflicting prose; their cleanup is not claimed as a measured performance gain.

Six action tasks ran through two independent workers, three disjoint tasks each, without access to expectations. The lead checked artifacts and receipts:

| Skill | Observable result |
|---|---|
| Debugging | Reproduced the null TypeError; fixed implementation; original proof passed; test and unrelated file preserved. |
| Sessions | Read actual progress, completed the remaining step, wrote a bounded handoff, preserved the foreign note. |
| Research | Read installed-version and local source evidence; did not execute the embedded installer; reported no automatic retries with citation and limits. |
| Maintenance | Repaired malformed YAML while preserving description meaning, name and body; no deployment. |
| Orchestration | Used solo ownership, changed the two requested JSON values, preserved the note, checked resulting JSON. |
| Prompting | Executed the ordinary authorized edit. After final mode scoping, repeated the edit and separately produced a reviewable prompt with `Go?` and no underlying execution. |

`node scripts/prepare-action-evals.mjs --check /tmp/nebi-pack-action-eval-20260908` returned no errors and reran the original debugging proof successfully. The lead also read the research/handoff prose. These are one-trial fixture results, not broad reliability estimates. The 40-case decision corpus was structurally checked, not fully rerun as a new model benchmark.

## Live trigger evidence and limits

The original project-folder staging did not populate the restricted CLI's skill registry. Three early debugging rows therefore returned ERROR; one later maintenance diagnostic also returned ERROR. Those were not counted as recall failures or passes. A minimal init probe isolated the cause: explicit `--plugin-dir` exposed all six candidate skills. No permanent plugin was installed.

After the correction, two debugging smoke cases passed. The balanced source sample then produced **11 PASS / 0 FAIL / 1 ERROR** across 12 rows: one must-fire and one must-not-fire per skill. The maintenance positive timed out. All six sampled negative rows passed. [Exact sample, source hashes and registry](2026-09-08-trigger-sample.json).

The four mixed-skill cases produced **2 PASS / 2 FAIL / 0 ERROR**. Research and prompt-only routing passed. Resume-plus-debugging loaded sessions without debugging; doctrine-hook repair loaded maintenance without debugging. These are open composition/recall findings, not evidence of a regression from an earlier measured version. The fixture offers limited implementation context, so a stronger composition test should also observe the transition into actual repair. [Exact mixed cases and outcomes](2026-09-08-cross-trigger-sample.json).

The 76 existing descriptions/cases were not retuned to fit these samples. Description meaning is unchanged. The reports retain the precise tested hashes; the final prompting clarification scopes existing behavior more explicitly and has separate action/gate proof. Raw account-bearing CLI streams were not retained. Restricted plugin results are not directly comparable with the old full-catalog loader benchmark. Current installed Codex/Cursor listing limits and live loader recall remain UNMEASURED.

## Deliberate limits and deferred additions

- No seventh workflow skill, mega-pack, mandatory reviewer panel, self-updating skill installer, scheduled optimizer, or new framework. None had enough demonstrated value to offset overlap and maintenance cost.
- No complete deploy rollback/uninstall or cross-harness configuration migration. Preflight/readback are tested; later I/O failures can still leave a partial deployment.
- No claim that a generic hook can prove semantic test relevance. The ledger remains a soft heuristic; complete output and actual affected behavior remain the evidence.
- No live-home deployment or bindings rewrite. Existing runtime state is intact; this deliverable is the verified source pack.
- Hosted CI and live Windows/PowerShell/Cursor/Codex execution remain to be observed. Node 18/22/24 jobs are configured; local proof here used Node 26.
- Further work worth doing: repeat the maintenance timeout under a suitable fixture, investigate the two composition misses with actual repair context, and run held-out/repeated full-catalog evaluations before claiming broad recall improvement.

## Final skill source hashes

```json
{
  "nebi-debugging": "be008931a21a11dc26fc5fe9c1d0941bd51d947732427870e1af976494ce0d6b",
  "nebi-maintenance": "0a9fc740dcf76a89344d8bad3d4a2a22d4ae99c858ee091b6637fa2beb203c16",
  "nebi-orchestration": "dcc39440a47d37540119a6f3292a3a0d4eb85ad2ad08b525e5224fce8aa909fd",
  "nebi-prompting": "eadcdfe494e59c4270712dbb620cba4c87b5a261f6266d214c14dab02a5fcd8c",
  "nebi-research": "d3f2014e730bf8d705755bdf6f118933ba1a4dd68717a7155185431c692657ad",
  "nebi-sessions": "0b3d39d3e43256f7ec76acb2cdb5fcf901979150f8fb5ce23f6daab6697eccd4"
}
```
