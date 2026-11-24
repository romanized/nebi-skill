---
paths:
  - "**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,java,rb,php,cs,swift,kt,vue,svelte}"
  - "**/{package.json,tsconfig.json,go.mod,Cargo.toml,pyproject.toml}"
---

§0 in `~/.claude/CLAUDE.md` always wins over this file — default posture, not a rule to cite back at me.

# Code quality & modularity — build it to plug in later

The standing requirement: a system I build today as standalone must connect to another of my projects **later, without pain**. Structure new systems for that from the start, without speculative abstraction; in an existing codebase, match its structure. Quality is the logic, how the code reads, AND the surrounding prose — all three.

## Dependencies point inward

- **Source dependencies point inward, toward higher-level policy.** Domain and use-case code must **not** import frameworks, databases, web handlers, queues, external clients, or UI types.
- **Pass plain request/response models across boundaries.** Never pass web requests, ORM rows, framework contexts, or DB-bound structures into or out of core policy. Data crossing a boundary takes the shape most convenient for the *inner* layer — DTOs, not ORM entities.
- **Inner layers own the interfaces they need; outer layers implement them** (dependency inversion).

## Organize by feature, split cleanly

- **Package by feature / business capability before generic technical buckets** ("users/", not "controllers/ + models/ + services/" scattered).
- For splitting a monorepo or carving out a reusable module, the cohesion tests:
  - **REP** — a module should be versionable and releasable as a unit.
  - **CCP** — code that changes together, for the same reason, belongs together.
  - **CRP** — don't force a consumer to depend on things it doesn't use.
  - **No cycles** — no circular dependencies between modules.
- **Composition root ("Main as Plugin"):** wire concrete implementations in one place. That single wiring point is what lets a module drop into a host app.

## Enforce it — a diagram isn't enough

Boundaries are real only if enforced: package structure, dependency rules, build constraints, tests, visibility, narrow public APIs. A service split, a package name, or a shared `common/` folder **does not** enforce a boundary by itself.

## Testing decoupling

Test entities, use cases, and boundary contracts **without** the real framework, DB, network, or external service. If you can't test the core without spinning up infrastructure, the boundaries are wrong.

## UI: the project's own components come first

When a project has its own component library or design system, it outranks generic UI guidance, even though `modern-web-guidance` calls itself mandatory:

1. Anything the library covers (dialogs, toasts, buttons, form fields, popovers) uses its component and conventions. Don't swap one for a native element because a guidance skill prefers native.
2. Where the library stops (scroll effects, disclosure, loading priority, Core Web Vitals), search `modern-web-guidance` before writing the HTML, CSS or client JS, and name the skill in a sub-agent's brief for that work.
3. When the two disagree, apply the guidance only through the props and attributes the component already takes.

Why: in [Chrome's case study with note](https://developer.chrome.com/blog/mwg-with-internal-component) (2026-11-10, 180 runs), naming the skill in the prompt lifted standards adherence from 77–86% to 90–94%, and an unconditional "follow the guidance" made agents replace in-house components with native elements.
