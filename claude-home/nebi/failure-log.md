# Failure log — one line per doctrine violation

When a doctrine rule gets violated or two rules collide, append **one line** here, in the moment. Maintenance sessions (`nebi-maintenance` skill) compile these into rule edits — repeatedly violated prose becomes a hook or gets deleted (SOURCES.md, maintenance loop step 9).

Format: `date | env | what rule was violated / what collided | one-line context`

Example: `2026-07-19 | claude-code | §6 violated: claimed done without fresh proof | said "tests pass" from memory after a refactor`

---
2026-08-31 | claude-code | must-fire recall gap: nebi-orchestration fires on 1/6 of its own must-fire trigger rows and nebi-research on 0/3, measured with run-trigger-evals.mjs --headless; precision is perfect (14/14 must-not-fire correct). Pre-existing, not from the v4 pass — orchestration scores the same 8/13 on its pre-pass description. Ruled out: web-tool denial, listing truncation. Next: rewrite the two descriptions for recall, then re-measure.
2026-08-31 | claude-code | RESOLVED (same day): recall gap fixed and re-measured — nebi-orchestration 8/13 -> 11/13 (must-fire 1/6 -> 4/6), nebi-research 0/3 -> 11/12 (0/3 -> 5/6), must-not-fire precision unchanged at 7/7 and 6/6. Two levers: descriptions reframed as preconditions, and run-trigger-evals.mjs now seeds an inert project fixture instead of running in a bare empty dir (which caused false FAILs on prompts naming project nouns).
2026-09-01 | claude-code | Trigger recall pass complete. Live-loader scores: debugging 13/13, sessions 12/12 (precision leak closed), prompting 13/14, maintenance 11/12, orchestration 11/13, research 8-11/12 (unstable). Precondition framing ("Read this before X, not after") is the lever that works; a second, longer round of trigger clauses measurably BACKFIRED on orchestration and research and was reverted. Run-to-run variance is +/-2 rows, so single-run deltas under that are noise.
2026-10-03 | claude-code | collision: the output style's re-ask rule (restate each open question with its options in full) vs Nebi's "don't tell me what to answer" | replies re-listed answer options above every status line and the NEED YOU card repeated them; the style now asks once in plain words with a short recommendation and no answer menus
2026-11-25 | claude-code | §3 violated, rule-induced: asks shrank to unexplained answer codes mid-run and were re-posted every turn ("reply "go" (Karpet24 app login and deploy)…"); the style's "say go" example and the core's "rest is optional reading" invited it | rules rewritten so every ask explains itself; Stop hook now nudges a ❓ whose status line names things the reply never explains
