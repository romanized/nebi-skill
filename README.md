# Nebi operating setup

[![Verify pack](https://github.com/romanized/nebi-skill/actions/workflows/verify.yml/badge.svg)](https://github.com/romanized/nebi-skill/actions/workflows/verify.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![Node 22+](https://img.shields.io/badge/node-22%2B-informational)

## Highlights

- My Claude Code operating setup: a doctrine, workflow skills, lean sub-agents and hooks, deployed from one repo.
- It runs a fleet of agents from rough, dictated instructions and makes them prove their work before they say done.
- **Blind benchmark with a null control:** judges compared old and new skill versions without knowing which was which, and an unchanged skill came out as four ties. [Results](claude-home/nebi/benchmarks/2026-08-31-blind-benchmark.md)
- **168 offline tests in CI** on Linux, macOS and Windows, one command: `node scripts/verify.mjs`.
- **[Agent failure log](AGENT-FAILURES.md):** 19 failure patterns from four months of daily use, how each surfaced and what fixed it. [Patterns at a glance](AGENT-FAILURES.md#patterns)

## Quick start

You need Node.js 22 or newer and Claude Code. The setup targets macOS; the tests and the deployer also run on Linux and Windows.

```sh
git clone https://github.com/romanized/nebi-skill.git
cd nebi-skill
node scripts/verify.mjs                # offline checks, writes nothing to your home
node deploy.mjs --home /tmp/nebi-try   # install into a throwaway folder and look around
node deploy.mjs                        # install into ~/.claude
node deploy.mjs --verify               # confirm the install matches the repo
```

Your first real deploy keeps your own `settings.json` and `CLAUDE.md` as `*.nebi-bak` files beside them, and lists every file it copies. Restart Claude Code to load the setup. There is no uninstaller: to go back, restore those two backups and remove the files the deploy listed.

### Make it yours

`claude-home/CLAUDE.md` is my doctrine, written for my machine. Edit it before you deploy:

- §1: the model table and the Mythos and Codex lines, for the models and accounts you have.
- §10: the terminal line (mine is Ghostty) and any tool you don't use.
- `claude-home/output-styles/nebi.md`, if you don't want every reply to end in a status line.
- `claude-home/nebi/upstreams.json`, which pins my third-party skills.

The first deploy seeds `~/.claude/nebi/browsers.json` with placeholder Chrome devices; put your own profiles and device IDs there, and later deploys leave it alone.

Deploy also turns on the ten Claude Code mods in `mods/`, among them browser routing, a session guard, a model lock and the Red Button hold on risky commands; switch off any you don't want with `/plugin`. Set `NEBI_FEEDBACK_CAPTURE=off` to stop the prompt hook from saving your complaints and ideas to `~/.agents/nebi/feedback/inbox.jsonl`. Codex support is parked, so skip `codex-home/` unless you use Codex.

## How the repo is organised

Portable source for the Nebi operating doctrine across Claude Code and Codex. The pack keeps seven shared workflow skills, five Claude-only skills (`nebi-mod-verify`, `codex-browser`, `tikhub`, `nebi-tools`, `nebi-blender`) and a core for each harness. Edit the masters here; deploy deliberately after verification.

## What belongs where

| Source | Purpose |
|---|---|
| `claude-home/CLAUDE.md`, `codex-home/AGENTS.md` | Standing preferences and harness-specific model bindings |
| `claude-home/skills/*/SKILL.md` | Shared: orchestration, debugging, hill-climbing, sessions, maintenance, prompting, and research. Claude only: mod paint check (`nebi-mod-verify`), any-browser control (`codex-browser`), social search (`tikhub`), the global toolbox (`nebi-tools`) and Blender routing with a shell-only helper (`nebi-blender`) |
| Each skill's `evals/` | Trigger cases, decision cases, and any supporting fixtures |
| `claude-home/hooks/` | Seven handlers plus a shared runtime helper: startup, feedback capture, operator steering, kill guard (Claude only), evidence ledger, completion feedback and state refresh |
| `claude-home/agents/`, `codex-home/agents/` | Claude: native scout, checker and lean builder, with no pinned model (the default-builder binding applies unless a dispatch names one). Codex: scout and checker adapters |
| `claude-home/nebi/` | Shared project/task context helper, session sweeps, status line, trigger runner, account sync (`accounts.mjs`), source record and runtime seeds |
| `claude-home/nebi/benchmarks/` | Historical and current evaluation records; never deployed |
| `claude-home/rules/`, `commands/`, `output-styles/` | Claude rules/style and the shared `/sharpen` command |
| `scripts/`, `tests/`, `.github/workflows/verify.yml` | Offline verification, native Codex hook inspection/activation, disposable action tasks, and CI |
| `deploy.mjs`, `deploy.sh`, `deploy.ps1` | Cross-platform deployment and thin wrappers |

Shared skills stay model-free. Third-party skills install where they are used: one project in that project, several projects globally. Discovery does not install anything. A skill or tool the user names is integrated from its real upstream, pinned and recorded in the [upstream register](claude-home/nebi/upstreams.json); an adaptation or deferral is reported to the user as a deviation with its reason.

The [capability routing guide](claude-home/skills/nebi-maintenance/references/capability-routing.md) picks between browser tools, Canva, Higgsfield, ElevenLabs and FFmpeg without competing global skills. The [upstream register](claude-home/nebi/upstreams.json) lists every third-party skill, pack and tool with its pin, install locations, local edits and update command; `node claude-home/nebi/upstreams.mjs` (deployed to `~/.claude/nebi/` and `~/.codex/nebi/`) reports what is behind upstream, locally edited or unregistered without updating anything. The [integration method](claude-home/skills/nebi-maintenance/references/skill-sources.md) lists catalogs and the install steps. These references deploy with the maintenance skill and load only when relevant. The [September refresh report](claude-home/nebi/benchmarks/2026-09-22-skills-and-continuation.md) records evidence and limits.

`codex-home/legacy-home-AGENTS.md` is a template for a one-time cleanup of an obsolete personal `~/AGENTS.md` that duplicated the Codex doctrine. It is deliberately outside the deploy manifest: normal deployment must not overwrite home-folder or project instructions. The refresh report records the original backup and local migration proof.

## Verify the source pack

Use Node.js 22 or newer (one test imports TypeScript vectors directly); CI runs Node 22 on Linux, macOS and Windows and Node 24 on Linux.

```sh
node scripts/verify.mjs
```

This checks JavaScript syntax, frontmatter and references, eval structure, harness section/date parity, and regression tests in temporary directories. It never deploys to your home. The frontmatter checker deliberately supports this pack's simple format rather than pretending to be a general YAML parser.

Model evaluations are separate from offline tests:

```sh
node claude-home/nebi/run-trigger-evals.mjs --list
node claude-home/nebi/run-trigger-evals.mjs --headless --model opus --skill debugging --report /tmp/debugging-triggers.json
node claude-home/nebi/run-trigger-evals.mjs --headless --model opus --cases tests/cross-skill-triggers.json --report /tmp/cross-triggers.json
```

`--model` is required for headless runs. Choose the authorized model for your harness. `--limit`, `--timeout`, and `--budget` bound a run; the budget is per case. The runner checks CLI capabilities and loads an explicitly named temporary plugin containing the candidate skills and runtime resources, excluding eval answers. It restricts tools, disables hooks/MCP, records model/client/source hashes, and removes its temporary workspace. Built-in skills remain competitors. This is a restricted loader measurement, not a claim about the full installed catalog or task completion. Missing registry entries, failed processes, and incomplete result streams are errors, never passing negative cases.

See [tests/README.md](tests/README.md) for action fixtures, grading boundaries, and reproducible multi-turn setup. Historical benchmark numbers apply to their recorded source versions; [the current improvement record](claude-home/nebi/benchmarks/2026-09-08-whole-pack.md) reports this pass separately.

## Deploy intentionally

Preview validation without target writes:

```sh
node deploy.mjs --check
```

Deploy to the real home, or stage into an explicitly chosen disposable directory:

```sh
node deploy.mjs
node deploy.mjs --home /tmp/nebi-staging
```

`--dry-run` aliases `--check`. Both validate inputs without creating files. They do not promise that a later write cannot fail. `--help` explains options. The wrappers forward arguments and exit status. A positional suffix or `NEBI_BAK_SUFFIX` controls backup names; suffixes cannot contain paths.

After deployment, compare the installation to the current masters and check Codex's native trust state:

```sh
node deploy.mjs --verify
node scripts/codex-hooks.mjs
```

Both checks are read-only. After reviewing a changed Nebi hook implementation, `node scripts/codex-hooks.mjs --trust` verifies the installed files and trusts only the six exact Nebi hook definitions using hashes returned by the installed Codex client. It preserves disabled hooks and unrelated trust entries. It does not approve third-party hooks. All three commands accept `--home` for isolated staging. Starting a new task/session loads the installed core, agents, and skills; native trust alone is not an execution test.

| Harness | Deployment |
|---|---|
| Claude Code | Core, rules, twelve skills (the seven shared ones plus `nebi-mod-verify`, `codex-browser`, `tikhub`, `nebi-tools` and `nebi-blender`) and their resources, three native agents, command, style, hooks, tools, and handoff directory into `~/.claude/`. Merges `statusLine`, `outputStyle`, a `claudeMdExcludes` entry for `~/AGENTS.md` (the Codex pointer), a default `skillListingBudgetFraction` of 0.02, `permissions.deny` rules that keep Claude's tools out of `~/.ssh` and `~/.agents/nebi/secrets`, and Nebi hooks for SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Stop, and SessionEnd. |
| Codex | Core, two native agents, shared hook masters and source record into `~/.codex/`; seven skills and resources into `~/.agents/skills/`. Merges Nebi hooks for SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop and SessionEnd into `~/.codex/hooks.json`. Deployment leaves `config.toml` unchanged; the explicit activation helper only updates Nebi hook trust. |

The deployer preflights required masters, rejects source symlinks, and validates the existing JSON shapes it will merge before any write. Only exact known Nebi script paths are replaced in hook lists. Unrelated hooks and settings survive. Skill resources are discovered recursively; other deployed files use an explicit manifest so stray runtime files are not installed.

Settings, Codex hooks, and an existing Codex core are backed up once per suffix. Existing backups remain intact. Runtime failure logs are seeded only if absent. Legacy `current-work.md` files are preserved, but never newly seeded or updated. Copied/seeded files and generated JSON receive readback verification. A later I/O failure can leave a partial deployment; this is not a transaction or a full uninstall/rollback system. `--verify` detects missing files and drift without repairing them silently.

## Everyday use

- Ask either client to use `nebi-scout` for an independent research question, or `nebi-checker` for a fresh review. The lead still sizes work and supplies scope, evidence and the model binding. These adapters do not start a fleet automatically. Claude restricts the available tools; Codex restricts filesystem writes. Codex MCP permissions remain inherited, so its role instructions also prohibit external mutations.
- Resume work with `nebi-sessions`. Both clients share project/task checkpoints under `~/.agents/nebi/projects/`; each session selects its own task. Claude's native auto memory remains a cache for stable project knowledge, not the current task selector.
- Say “Nebi resume” with the task name when opening a new conversation. In the same conversation, continue from the latest accepted intent. A break does not itself require restarting research. Checkpoints preserve corrections, output paths and pending job IDs at meaningful boundaries; a sudden quit can lose decisions since the last checkpoint.
- Complaints about agent behavior, ideas you drop and repos you name are captured by the UserPromptSubmit hook, and agent concessions by the Stop hook, into `~/.agents/nebi/feedback/inbox.jsonl` (Claude Code now, Codex once its hook is trusted; common secret, key, email and phone shapes are masked, not every kind of personal data; owner-only file; nothing is added to the model's context; `NEBI_FEEDBACK_CAPTURE=off` disables it for probes). `nebi-maintenance` triages that inbox with the failure logs.
- Run `node ~/.claude/nebi/upstreams.mjs` to see which third-party skills are behind upstream, locally edited, missing, unregistered, or visible to only one client (it also reads every project `skills-lock.json` under `~/Documents/GitHub`). It never updates; the register prints the pinned update command for each flagged source.
- Each client uses its own `nebi/STEER.md` for a once-consumed operator note and `nebi/AGENT_STOP` to halt tool calls. Remove that client's stop file to resume. These files affect all sessions in that client; use the native task UI for steering a single task.
- After changing this pack, run source verification, deploy, then `--verify` and the native hook check. The [runtime integration record](claude-home/nebi/benchmarks/2026-09-08-runtime-integration.md) separates source changes, deployment and observed activation.

## Runtime limits

The completion hook is a command-order heuristic. Claude exposes success/failure events; Codex also reports failed Bash calls through PostToolUse, and 0.153.0 unified-exec hooks omit exit status. Those plain-text responses stay unknown and suppress repetitive stop warnings; they are never labeled successful proof. Missing commands or explicit failures can produce a Codex UI/event warning. Claude retains its native soft Stop feedback. Neither proves command relevance, detects arbitrary shell-side writes, or replaces reading test output. The operator's `AGENT_STOP` remains the intentional blocking mechanism.

Session hooks record repository facts separately from task intent and report failed Git reads as unknown. They never mark a task complete or rewrite its checkpoint. Context utilization is a display, not a universal threshold for abandoning a task.

## Context across projects and concurrent tasks

There is no global current-project note. A repository and its worktrees share an identity derived from the canonical Git common directory; checkpoints retain their checkout/branch. Two repositories with the same name remain separate. Non-Git work uses the explicit working directory as its project root.

The layout is `~/.agents/nebi/projects/<project-id>/tasks/<task-id>/checkpoint.json`, with version history and task-specific `handoffs/` beside it. Session observations and selections live separately under that project's `sessions/`. Codex and Claude see the same task history without silently sharing an active task.

The startup hook identifies the current project/session and offers up to five unfinished tasks from that project. It does not select the newest task automatically. For substantial work, the lead saves useful progress at a verified milestone, blocker or handoff. Simple questions create no authored checkpoint.

```sh
# Use ~/.claude/nebi/context.mjs in Claude Code; the session id is in startup context.
node ~/.codex/nebi/context.mjs show --cwd /path/to/repo --session SESSION_ID
node ~/.codex/nebi/context.mjs list --all
node ~/.codex/nebi/context.mjs select --cwd /path/to/repo --session SESSION_ID --task TASK_ID
```

`show` and `list` are read-only. `save` takes JSON on stdin with `expectedRevision` from `show` (`null` only for creation), `goal`, `lastState`, `nextStep`, and optional `notes`/`status`. A changed revision is rejected rather than overwriting another writer. Exclusive locks serialize saves, writes replace one JSON record atomically, and previous versions are retained. After a crashed writer, inspect the PID in its leftover lock before removing it; the helper never breaks a potentially live lock automatically.

`migrate` copies the active harness's old global note into an unverified task and preserves the original. A note without an absolute project path goes into an unassigned inbox; an explicit `--project /path/to/repo` can map it after confirming the identity. Old handoff archives remain intact. Existing conversations and native memory archives are not bulk-imported or guessed into project records.

Ask either assistant “what's open across my projects?” for a grouped overview, or name the task you want to resume. Matching Git facts help detect drift; they do not prove that a saved claim is still true.

Do not commit secrets or machine-specific state. Full source/adoption history lives in [SOURCES.md](claude-home/nebi/SOURCES.md).

## License

MIT, see [LICENSE](LICENSE). `.claude/skills/single-agent-loop/` is Anthropic's single-agent-loop kit and keeps its Apache-2.0 license.
