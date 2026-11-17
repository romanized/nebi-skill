---
name: nebi-hillclimb
description: "Read this before trying to make something measurably better, not after. Measure-first improvement loop for any engineering property with a number: page speed, load or response time, Lighthouse or Core Web Vitals, bundle or image size, frame rate, jank or layout shift, memory, build time, API latency, token or hosting cost. Use when asked to make something faster, lighter, smoother or cheaper; to optimize, speed up, tune performance, or cut cost; or when a numeric target is set, such as 'under one second' or 'Lighthouse 95'. This applies even when the request is a direct command to start optimizing — load it first, then measure. Not for fixing something broken or a sudden regression (nebi-debugging), an SEO audit or search ranking (seo-audit), conversion-rate or copy work (cro, copywriting), or refactoring without a measurable goal."
---

# Hill-climb: measure, climb, lock it in

The active harness's core §0 override always wins. This is the default method when you are deciding alone.

Once there is a number that tracks what users feel, improving it becomes tractable. Most of the leverage is in finding the right things to measure, so measuring is step one of the climb, not a chore before it.

## 1. Pick what matters, then measure it

- Start from the few journeys or outcomes users spend most of their time in (use analytics or field data when it exists), not from whatever is easiest to measure.
- Make runs comparable: each measurement starts at a user action, ends when the result is usable, and separates client from server time where both exist.
- Take a baseline before changing anything. Estimate each candidate change's gain in the target unit (ms, KB, euros), rank by estimated gain, and set the target from the sum. Leave room for opportunities you find on the way.

## 2. Make the number fast and trustworthy

- Wall-clock and field numbers are what users feel, but they are noisy and slow to arrive. Iterate on a deterministic lab proxy: instruction or call counts, renders per interaction, layout and style recalculations, DOM mutations, bytes shipped, requests made, frames over budget under a fixed frame clock.
- Prove a proxy before climbing it: improve it on one or two paths and show the real number follows. Drop a proxy that is flaky or does not track the user number rather than climb the wrong hill.
- For web pages, Lighthouse and lab traces are proxies; field Core Web Vitals are what users feel.
- When the user can see a problem no metric catches (a recording of jank, a jump after load), add a metric for it, broken down by region and phase, before climbing.

## 3. The loop

1. Take one slow stretch of one journey. Trace it, then find or build a benchmark that shows the problem.
2. Pin current behaviour with tests before optimizing it.
3. Change in pieces sized for review. Put anything risky and user-visible behind a flag or a staged rollout where the platform allows (an unpublished theme preview, internal users first, then a small percentage).
4. Prove the gain: the benchmark moves and the real number follows. For a noisy signal, compare repeated runs before and after.
5. Lock the win with a ratchet: a check that fails when the number gets worse, whose ceiling drops whenever the number improves. A check too slow for CI runs on a schedule and opens a new lane when it regresses. Brittle wins get their own guardrails, such as a drift test or a pixel comparison across viewports.
6. After release, read the field data. Improved: keep the ratchet. Not improved: turn the flag off and iterate.
7. Take the next slow spot. Fix causes as a named batch; when the batch is gone, measure again for the next one.

Classify each flag as a kill switch or a ramp and retire it once its change is safe.

## 4. Steering

- **Ambition.** When targets fall, ask what has not been measured yet and propose bolder ideas with estimated gains.
- **Taste.** Typical calls for the user here: when a skeleton appears, whether an animation is worth its frame cost, progressive or complete reveal.
- **Direction.** Keep each lane to one metric or journey. Close a lane when its gains flatten. With several lanes, merge the ones that step on each other; opportunities found mid-lane become new lanes that the lead opens.

## Gotchas

- Aggregate scores can hide visible problems: many small layout shifts pass a "good" CLS. Measure per region and phase.
- Headless browsers default to 60 Hz and have no browser UI, so frame-budget and viewport bugs that depend on real browser chrome need a fixed frame clock or a field check.
- A single non-Latin-1 character (an em dash, a curly quote) makes V8 store the whole string as UTF-16, which puts regex-heavy code such as syntax highlighting on a slower path.
- One broad `:has()` selector near the root can add a style recalculation cost to every DOM change.

## Report

Per metric: baseline, result, and the proof that the proxy tracks the user number. Then the ratchets added, flags still open, and what was not measured.
