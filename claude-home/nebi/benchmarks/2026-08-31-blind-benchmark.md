# Blind old-vs-new benchmark — 2026-08-31 doctrine pass

Human-reviewable record of the evidence behind this pass. Repo-side only; `deploy.mjs` does not ship this directory.

## Method

Each skill's previous master and its new master were copied into two neutrally-named slots. Which slot held which version alternated per skill, and the mapping was withheld from every agent. For each frozen case in `evals/evals.json`, a fresh agent received one unlabelled slot as its operating instructions plus the case prompt — nothing else, no repository access — and answered as it would a real user. A separate blind judge then graded the two sides' responses against that case's `expectations`, seeing neither version identity nor any file path, with side A/B order alternating per case. Judges were told to prefer "tie" and to fail any side that gained format while losing fidelity.

## Run 1 — full sweep

- 32 frozen cases across all six skills.
- 100 responder runs: 2 trials per side for `nebi-prompting` and `nebi-orchestration`, 1 trial per side for the other four.
- 32 blind judges. All agents Fable 5. 0 errors.

| Skill | Cases | New wins | Baseline wins | Ties | Mean new / baseline |
|---|---|---|---|---|---|
| nebi-prompting | 9 | 3 | 2 | 4 | 7.89 / 7.72 |
| nebi-orchestration | 9 | 0 | 1 | 8 | 8.89 / 9.00 |
| nebi-research | 3 | 0 | 0 | 3 | 8.67 / 8.67 |
| nebi-sessions | 4 | 2 | 0 | 2 | 9.00 / 8.12 |
| nebi-debugging (null control) | 4 | 0 | 0 | 4 | 9.00 / 9.00 |
| nebi-maintenance | 3 | 1 | 0 | 2 | 9.00 / 8.67 |
| **Total** | **32** | **6** | **3** | **23** | **8.62 / 8.47** |

Expectation-level, **all six skills combined**: new met 135 of 145 graded expectations fully, baseline 132 of 145. **On the two priority skills alone the baseline was slightly ahead**: prompting+orchestration new 87 of 96 versus baseline 89 of 96 (prompting 49/57 vs 50/57; orchestration 38/39 vs 39/39). The case-level result and the expectation-level result therefore disagree in sign for prompting and orchestration, and both are reported here rather than only the flattering one.

**Null control.** `nebi-debugging`'s master was byte-identical in both slots. The judges returned 4 ties at 9.0/9.0 — evidence they were not manufacturing differences.

## Trigger discrimination

76 trigger rows (36 must-fire, 40 must-not-fire) drawn from all six suites, shuffled into 8 mixed batches so no batch was single-skill. Each batch was routed twice against the old description set and twice against the new one, by an agent given only the six frontmatter descriptions.

| Description set | Rows passed | Must-fire | Must-not-fire |
|---|---|---|---|
| Previous | 152 / 152 (100%) | 72 / 72 | 80 / 80 |
| Current | 152 / 152 (100%) | 72 / 72 | 80 / 80 |

No trigger regression, and no measurable trigger gain either — both description sets route this corpus perfectly. This is a description-only routing proxy, **not** the live skill loader.

## Live loader run (added after the pass — this supersedes the proxy above)

The real `run-trigger-evals.mjs --headless` was run against the deployed skills on the claude CLI. Each row spawns a real session; a row PASSes when the harness's own `Skill` tool fires (or correctly does not).

| Skill | Result | Must-fire | Must-not-fire |
|---|---|---|---|
| nebi-prompting (description changed this pass) | 13/14, 1 timeout error | 6/6 | 7/7 |
| nebi-orchestration (description changed this pass) | 8/13 | 1/6 | 7/7 |
| nebi-research (description unchanged, 3-row spot check) | 0/3 | 0/3 | not run |

**No regression from this pass.** Only two of the six descriptions changed. For `nebi-orchestration` the identical 13 prompts were re-run against the pre-pass description with only the deployed `SKILL.md` swapped: **8/13, failing the same five rows** — the recall gap is pre-existing, not caused by this work. `nebi-research`'s description is byte-identical to pre-pass, so its miss is pre-existing by construction. The two carve-outs added to `nebi-prompting` this pass both behave as designed: a rough-but-executable bug report does not fire it, and "pick up yesterday's work" routes to `nebi-sessions`.

**The open defect this exposed, which is the pack's and not this pass's:** must-fire recall is weak for procedural skills. `nebi-orchestration` fires on 1 of 6 prompts it should fire on; `nebi-research` on 0 of 3. Precision is meanwhile perfect — 14 of 14 must-not-fire rows across both skills behaved correctly, so nothing is over-firing. Two causes were tested and **ruled out**: denying web tools during the run (changed nothing except making runs ~2x slower) and skill-listing truncation (all six descriptions confirmed visible in a 55-skill listing). What remains is that the model reads a procedural skill's description and judges it does not need the methodology. Fixing that is a description-rewrite job for a future maintenance pass, tracked here rather than silently patched.

**Calibration note on the proxy:** the description-routing proxy above scored 152/152 for both description sets and completely missed this recall gap, because asking an agent "which skill would you load?" is a different question from whether it spontaneously loads one mid-task. Trust the live runner over the proxy.

## Recall repair (after the live-loader run above)

The recall gap the live run exposed was then fixed, in two measured steps, on the live loader.

**Step 1 — descriptions rewritten as preconditions.** The diagnosis was not a missing keyword: `Ultracode`, `scout`, `builder` and `checker` were already in the orchestration description. The pattern was that every miss was an *executable command* while the one row that passed was a *problem statement* — given a command, the model starts executing instead of pausing to load methodology. Both descriptions were reframed to open with "Read this before … , not after" and to close with "This applies even when the request is phrased as a direct command — load it first, then dispatch/research."

**Step 2 — runner fixture.** The runner executed every prompt in a bare empty temp dir, so prompts naming concrete project nouns ("these three modules", "this app") made the model glob for the missing thing instead of loading a skill. Verified directly: orchestration row 5 fails in the empty dir and fires correctly when cwd is a real repo. The runner now seeds an inert project skeleton (package.json, README, empty src/ dirs; nothing installed or executed).

| Measurement | nebi-orchestration | nebi-research |
|---|---|---|
| Original descriptions, empty-dir runner | 8/13 — must-fire **1/6** | 0/3 spot check — must-fire **0/3** |
| Rewritten descriptions, empty-dir runner | 10/13 — must-fire **3/6** | 8/12 — must-fire **2/6** |
| Rewritten descriptions, fixture runner | **11/13** — must-fire **4/6** | **11/12** — must-fire **5/6** |
| Must-not-fire (precision) at every step | **7/7** | **6/6** |

Precision never degraded at any step, which was the risk of a more assertive description: nothing began over-firing. Two orchestration rows still miss (`Ultracode: build the auth flow and the billing page in parallel`, and the fan-out row, which is flaky — it fires in a real repo). Those are left recorded rather than chased, because the remaining fix is prompt-specific rather than doctrinal.

## Final live-loader state, all six skills (2026-09-01)

Every skill measured against the real Claude Code loader via `run-trigger-evals.mjs --headless`.

| Skill | Score | Must-fire | Must-not-fire |
|---|---|---|---|
| nebi-debugging | **13/13** | 6/6 | 7/7 |
| nebi-sessions | **12/12** | 6/6 | 6/6 |
| nebi-prompting | 13/14 | 6/6 | 7/7 (1 row timed out at the 90s cap, not a failure) |
| nebi-maintenance | 11/12 | 5/6 | 6/6 (1 row timed out at the 90s cap) |
| nebi-orchestration | 11/13 | 4/6 | 7/7 |
| nebi-research | 8–11/12 across runs | 2–5/6 | 6/6 |

**Precision is perfect across the whole pack.** No skill fires on a prompt it should not, including the `nebi-sessions` leak found and closed this round (it had co-fired with `nebi-debugging` on "Debug why the build fails on CI").

### What worked, and what backfired

The winning change was reframing a description as a **precondition** rather than a topic — opening "Read this before …, not after" and stating that it applies even when the request is phrased as a direct command. Applied to `nebi-debugging` it took recall from 3/6 to 6/6; applied to `nebi-sessions` it reached 6/6 and closed the precision leak at the same time.

A **second, longer round of edits on `nebi-orchestration` and `nebi-research` made both worse** — orchestration 11/13 → 9/13 and research 11/12 → 9/12 — by adding more trigger clauses. Both were reverted to the shorter wording. The lesson is recorded because it is counter-intuitive: past a point, more trigger keywords dilute rather than sharpen.

### Honest limits on these numbers

- **One run per cell, and the run-to-run variance is real:** ±1–2 rows. Orchestration failed rows 2 and 5 in one run and rows 3 and 5 in the next with identical text. `nebi-research` scored 11/12, then 9/12, then 8/12 across runs spanning two wordings, so its true value is unresolved and its remaining misses should not be attributed to wording.
- **Two ERROR rows are timeouts**, not failures: they exceeded a 90s per-prompt cap that was passed explicitly. The runner's own default is 180s.
- Remaining orchestration misses are borderline rows that flip between runs; they were left alone rather than chased, since the only lever left was lengthening the description, which measurably backfires.

## Regressions found, and what happened to them

| # | Case | Finding | Resolution |
|---|---|---|---|
| 1 | `nebi-prompting--1` | New version never emitted the literal `Go?`, and one trial closed `✅ Done` while actually holding for the user. Cause: the reordered gate section buried the default no-go-ahead path at position 5 of 6. | Gate section reordered so the default path is first and explicit. **Re-verified: 3/3 trials emit `Go?` outside the fence and end `❓ Need you`** (was 0/2). |
| 2 | `nebi-prompting--7` | New version, one trial: turned a failed read of a named file into a claim about repository contents, then raised a blocking question that stopped an explicit `run it`. Cause: the named-file read permission said nothing about a failed read. | Added a bounded failed-read clause and narrowed materiality; the `Questions override run it` precedence was left untouched. **Re-verified: 3/3 trials make no repository claim, raise no blocking question, and proceed to execution.** |
| 3 | `nebi-orchestration--8` | One trial of the new version declined a work-map update on replan. | **Not fixed — no defect found.** The graded sentence is byte-identical between the two versions, so this is single-trial variance, not a text regression. Recorded rather than papered over. |

## Confirmation runs

Regression 1 was re-verified from 3 trials per side banked by a confirmation sweep that a session limit cut short after 32 of 70 agents (Fable 5). Regression 2 was re-verified separately with 3 fresh runs of the repaired master (Opus 5), graded by deterministic string assertions rather than a judge.

## Post-repair prompting full sweep: 2026-09-01

A later solo audit closed the coverage gap left by the two focused confirmation runs. Each current `nebi-prompting` case received the exact final master as its operating instructions in a fresh Opus 5 session. Claude Code ran in safe mode, sub-agent tools were disabled, and each case used a new inert Git repository. The auditor reviewed both final text and tool order against the current 63 expectations.

Case 9 used a disposable SQLite fixture with two rows in `analytics_events_old`, an empty `analytics_v2`, one code reader for `analytics_v2`, and a fixture query log that also read only `analytics_v2`. The follow-up was sent only after the first result event. This made the answer-round gate and destructive execution path observable without touching real data.

| Case | Expectations | Result | Decisive evidence |
|---|---:|---:|---|
| standalone no-scan | 6 | 6/6 | No tools; one artifact; literal `Go?`; waiting status |
| ongoing primer bounded | 9 | 9/9 | Only current-work and `git status`; mismatch and mobile questions stayed outside the artifact |
| ambiguous `run it` | 6 | 6/6 | Two artifacts; one question block; zero tools or execution |
| multiple copy targets | 7 | 7/7 | Research and implementation split; named file/test preserved; no execution |
| explicit no-local-context | 8 | 8/8 | No tools; future executor performs the audit; wrapper controls stayed outside |
| real rebuild request | 7 | 7/7 | Research handed off to improvement; supplied vendors, constraints, and old-vs-new check survived |
| fully specified `run it` | 9 | 9/9 | Two artifacts shown first; official-doc research completed; missing file blocked only implementation |
| `Not supplied.` and waiting | 5 | 5/5 | Literal placeholder; no question block; `Go?`; waiting status |
| answer round then execute | 6 | 6/6 | Turn 1 had zero tools; turn 2 echoed before seven tools; two rows migrated; old table dropped after both checks |
| **Total** | **63** | **63/63** | **9/9 cases passed** |

The diagnostic runs found real failures before this final sweep: undefined API/integration labels triggered repository searches, dependent jobs sometimes collapsed into one artifact, primer details leaked, and three fixtures rewarded guessing. The master and fixtures were tightened only at those seams. This result supersedes the earlier statement that the shipped prompting master had never received a full nine-case rerun. It does not replace the historical blind comparison because the current prompting fixtures and expectation set are no longer byte-identical to the Run 1 arena.

## Limitations — read these before citing any number above

- **Small trial counts.** 1–3 trials per cell. These are directional outcome measurements, not reliability measurements; no pass^k was computed.
- **Same-family evaluation.** Responders and judges were Claude models, as was the text under test. Self-evaluation bias is not excluded.
- **The trigger table is a proxy.** It measures whether an agent routes correctly given the descriptions, not what the Claude Code skill loader does at runtime. The real check is `run-trigger-evals.mjs --headless`, which needs a deploy and costs API budget; it was not run in this pass.
- **The four secondary skills were scored on cases written alongside their new text**, which in principle favours the new version. Their results were 6 ties and 3 new wins with a clean null control, but they are the weakest evidence here.
- **The confirmation runs mix models** (Fable 5 for regression 1, Opus 5 for regression 2).
- **These are local cases for Nebi's own contracts.** They say nothing general about any model, vendor, or multi-agent architecture.
- **The Run 1 prompting figures describe the PRE-repair master.** The two regressions below were found by Run 1, so its prompting numbers (3-2-4, mean 7.89) measure text that has since changed. The 2026-09-01 post-repair sweep above covers the exact final master, but its current fixtures and expectations differ from the Run 1 arena, and the frozen arena copy of the benchmarked pre-repair text was overwritten during the repair.
- **The post-repair full sweep has one exact-final trial per case.** It closes the case-coverage gap but does not measure pass^k or cross-model reliability. Opus 5 produced every final-sweep response, and the auditor who repaired the skill graded the transcripts.
- **The expectation denominator is 145, not 148.** The frozen rubrics contain 148 expectations; judges returned graded rows for 145. Three prompting expectation rows were not returned and are silently excluded from the 135/132 figures.
- **One confirmation assertion was initially scored wrong by the author.** The first `Go?` check was a naive substring match that counted the correct narration "so no `Go?` — executing now" as a failure. The corrected check requires a *posed* gate and passes 3/3. The independent checker read the stale artifact and reported a regression that does not exist; the artifact has been corrected and this note records the error rather than deleting it.
- **The independent checker's other findings were adopted**, including a mislabelled expectation figure that had hidden the baseline being ahead on the two priority skills.
