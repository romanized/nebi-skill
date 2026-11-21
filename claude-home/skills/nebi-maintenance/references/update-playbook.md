# Update playbook: the whole machine, one pass

The first full pass ran on 2026-11-21, a bit rushed, and it worked. It brought Homebrew, runtimes, Claude Code, plugins, skills, MCP servers on four accounts, sixteen project repos and the tool catalog up to date in one day without breaking a live site. This page records how, what went wrong, and the better plan for next time. Add to the changelog at the bottom after every run.

## How the first run worked

The work was split by layer, and each layer had exactly one owner. Two agents never wrote to the same file, config or repo, so nothing collided. The lead kept the shared surfaces itself: `~/.claude/settings.json`, MCP registrations, commits and merges.

1. **Inventory by layer.** Machine and apps (`brew outdated --greedy`, `softwareupdate -l`), CLIs and languages (`npm outdated -g`, `uv tool list`, `rustup check`), Claude (`claude --version`, `claude plugin list`, `node ~/.claude/nebi/upstreams.mjs`, `claude-accounts diff`, `claude mcp list`), project dependencies (`npm outdated` per repo), then a coverage audit of every tool in use against free or local alternatives.
2. **Backup and undo before any change.** Each lane wrote its backups first (`~/.agents/nebi/backups/<area>-<date>/`, `config.bak-<date>`, a `defaults export`) and put a one-line undo for every change in its report.
3. **Change on branches, not on main.** Dependency updates went to `deps-<date>` branches. A separate merge agent re-ran every check on a clean clone and merged only what passed, then checked the live site after each deploy.
4. **Verify with real evidence.** Exit codes, version read-backs, live HTTP checks and diffs. A check that did not run is reported as not run.
5. **Register decisions.** Every skill or tool looked at went into the upstream register with its pin and a verdict, including the ones declined.
6. **Audit last.** A fresh-context sweep re-ran the inventory, fixed loose ends, updated these docs and scored the result.

## Adding something new

The layers make the pass grow without a redesign. A new tool, language, workflow or architecture is a new row in one layer, and these questions place it:

- **Which layer owns it?** Machine and apps, CLIs and runtimes, Claude (plugins, skills, MCP, accounts), project dependencies, or tooling. If none fits, add a layer with its own owner and its own row in the score.
- **How do we see its version and the latest one?** One read-only command that prints both. Without that it cannot be in the inventory.
- **How is it updated and undone?** The update command goes in the register's `update` field and the undo in the lane report.
- **What proves it still works?** A smoke command that exercises it (`<tool> --version` alone proves the binary starts, nothing more).
- **Who else depends on it?** Node and other shared libraries break everything above them, so they update alone and first.
- **Where is it written down?** The register for third-party code, the nebi-tools catalog for tools, capability routing when it changes which tool answers a request.
- **Which risk tier is it?** See the v2 plan.

## What went wrong or was rushed

- **zsh does not word-split unquoted variables.** `brew upgrade --cask $CASKS` passed one argument with spaces in it and the upgrade failed. Use an array, `${=CASKS}`, or one cask per call.
- **Homebrew removed Granola** because its cask had been dropped upstream. Check `brew info` for deprecated or disabled casks before `upgrade` and `cleanup`. Granola is back on a current cask and updates itself.
- **Node broke halfway through `brew upgrade`** when a library it links against upgraded underneath it, and every Node-based helper failed until it finished. Upgrade `node` on its own first, check `node -v`, then the rest.
- **Vercel's Homebrew formula was dead.** Vercel moved to a cask, so `brew outdated` never flagged the formula. Look for formulae whose upstream moved.
- **Skill pins need the full 40-character SHA.** Short SHAs fail in `npx skills add` and in the register check.
- **Agents ran into the 150-turn cap** and the lead had to resume them. Lanes were too big.
- **Agents refused account config and commit steps** without Nebi's own say-so, correctly: an agent message is not consent. Those steps queued up for the lead.
- **`sudo` needs a terminal,** so passwordless sudo was switched on for the day (KTX pkg, macOS). That is a risk to remove, not a pattern.
- **GitHub Actions ran out of budget** (a spike in one repo), so no branch had CI evidence and every check was local.
- **Lean agents have no MCP.** The shell helpers (`blendtool.py`, `claude-accounts`) carried the work.
- **`defaults write` with old-style `{ enabled = 0; }` syntax stores strings,** and the Spotlight shortcut stayed on until it was rewritten as typed XML. Raycast 2 keeps its settings in an encrypted database, so its hotkey is set in Raycast itself.
- **The register edit in the audit added two duplicate entries** because a `grep | head` cut off the existing ones. A test now fails on duplicate register names.

## v2 plan

**One dashboard command.** A read-only script (proposed: `claude-home/nebi/update-status.mjs`) prints current against latest for every layer in one table, with the score below. It wraps the inventory commands above plus the GitHub Actions budget, free disk and pending macOS updates. The pass starts and ends with it, so "before" and "after" use the same instrument.

**Run order.**

0. Preflight: Actions budget, disk, backups, and one batch of owner approvals for every tier-3 step, asked once.
1. Node and the other shared runtimes, alone, then verify.
2. Homebrew formulae, then casks (close the apps first; leave self-updating casks to themselves).
3. Language toolchains and global CLIs.
4. Claude Code, plugins, skills and the register.
5. MCP servers and accounts (`claude-accounts sync`, then `diff`).
6. Project dependencies on branches, then the merge review.
7. Tool discovery and the catalog.
8. macOS, Ghostty and anything else that restarts the session, last.
9. Audit, score, changelog.

**Risk tiers.** T0 is read-only. T1 is reversible and user-space (a formula minor, a uv tool). T2 changes an app or config and needs a backup first (casks, settings, MCP). T3 waits for Nebi: sudo, macOS updates, account config, merges to main, deploys and deletions. Sudo steps run together in one block while Nebi is at the keyboard, so passwordless sudo is never needed.

**Stop conditions.** Stop every lane if a shared runtime breaks (`node -v` fails). Stop a step after two failed attempts and report it. Never start a T3 step without the owner's approval. No CI claims while the Actions budget is spent.

**Agent budget.** About 80 turns per lane, with a progress file at each phase so a resume costs little. One owner per layer. The lead keeps settings, MCP config and commits.

**Schedule.** Run the dashboard monthly from a launchd job in report-only mode, the way `com.nebi.claude-update` runs hourly. Run the full pass when the score drops below 85 or a major runtime ships.

**Score.** Each layer gets 0 to 100 %. 100 % means nothing outdated that we did not choose to hold, the register matches what is installed, and every check ran.

| Layer | Weight | 100 % means |
|---|---|---|
| Machine and apps | 15 | `brew outdated --greedy` empty or only self-updating casks; no macOS update pending |
| CLIs, languages, runtimes | 10 | Everything current, or held with a written reason |
| Claude Code and plugins | 10 | Latest Claude Code, plugins current, updater job green |
| Skills | 15 | Installed copies match their pins, and no pin is behind upstream without a reason |
| MCP and accounts | 15 | No drift, no dead or duplicate servers, nothing waiting on authentication |
| Project dependencies | 15 | Every active repo current or on a reviewed branch with CI evidence |
| Tooling and discovery | 10 | Every catalog row runs as written; the shortlist is decided |
| Docs in nebi-skill | 10 | Every version, path and count in the repo is true, and the work is merged |

## Changelog

- **2026-11-21, first run.** Score about 52 before and 81 after, both reconstructed from the lane reports and the audit (the dashboard does not exist yet). Still open: macOS 26.7.3 and the Ghostty cask (lead, after the audit), seven project repos left for per-project work, MCP servers waiting on authentication, claude.ai connector clean-up that only Nebi can click, Canva's skills moved upstream into `plugins/`, and the dashboard script itself.
