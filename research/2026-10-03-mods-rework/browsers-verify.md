# Browsers lane: verifier verdicts (2026-10-03)

Fresh, skeptical re-check of the browsers lane's load-bearing claims. Read-only. Binary = `~/.local/share/claude/versions/2.1.288`; offsets below are **byte offsets in the binary itself** (`LC_ALL=C grep -aob … | dd`), not the lane's strings-file offsets. One read-only tool call made: `list_connected_browsers`.

Tally: 15 confirmed, 7 partly, 0 refuted, 0 unverifiable.

| id | verdict | short reason |
|----|---------|--------------|
| browsers-1 | confirmed | Local State + extension-store byte markers match |
| browsers-2 | confirmed | re-scan of `list_connected_browsers` results matches; a third device existed briefly 09-28 |
| browsers-3 | partly | mechanism confirmed; `profile.last_used` is now `Default`, not `Profile 3` |
| browsers-4 | confirmed | execa without shell, cwd = session cwd; also awaited up to 10 min |
| browsers-5 | confirmed | `JRt`/`Mt` read directly; explicit open uses the same gate |
| browsers-6 | confirmed | settings env → process.env; BROWSER is not in the project-scope drop list |
| browsers-7 | confirmed | `Nco` writes `process.env` with no denylist; opener reads BROWSER live |
| browsers-9 | confirmed | `onExtensionPaired` writes global config |
| browsers-10 | confirmed | `ckr` → global → env order read directly |
| browsers-11 | confirmed | `hrn` read directly; the ask text forces AskUserQuestion |
| browsers-14 | confirmed | regex, exact host, all sources; deny also checks the target tab's host |
| browsers-15 | partly | mechanism confirmed, but it's gate-dependent; re-count gives 49 sessions, not 57 |
| browsers-16 | partly | counts reproduced; "no setting removes them" is wrong for one source: the project playbook rule |
| browsers-19 | confirmed | bridge URL plus account check; live listing shows 1 device |
| browsers-21 | confirmed | launcher read whole |
| browsers-22 | partly | the shared/not-shared lists are incomplete |
| browsers-23 | confirmed | status-line JSON has no account field |
| browsers-24 | confirmed | types lines match; matchers use literals/RegExp, not `*` |
| browsers-25 | confirmed | hook lines match |
| browsers-26 | partly | design is viable but the router has gotchas; repo count is 8 files, not 9 |
| browsers-28 | confirmed | schema + live beacons; account-B beacons present |

## Receipts per claim

**browsers-1: confirmed.** `~/Library/Application Support/Google/Chrome/Local State` info_cache: Default='nebi' (active 10-03 14:22), Profile 3='Your Chrome' with no gaia user (10-03 14:55), Profile 4='paarline.com' (09-29), Profiles 1/2='space' (06-02). Extension store `Local Extension Settings/fcoeoabgfenejglbffodgkkbkcdhcgfn`: `aaaaaaaa` found in Default only, `bbbbbbbb` in Profile 3 only, neither in Comet/Default. Profiles 1, 2 and 4 have no Claude extension directory. Comet Local State: Default 'n', active 09-30 13:26. Playbook `cnlsneakers/growth/b-tiktok/playbook.md` ~l.13-16 has the rule, as quoted.

**browsers-2: confirmed.** Session files: `~/.claude/sessions` cwd = nebi-skill / ecommerce-workspace only; `~/.claude-max2/sessions` = cnlsneakers only (all `entrypoint: cli`). Pairing: `~/.claude.json` chromeExtension.pairedDeviceId=aaaaaaaa…; `~/.claude-max2/.claude.json` = bbbbbbbb…. The two accounts have different accountUuid values and different email domains. My own re-scan of `list_connected_browsers` tool results (tool_use_id → name mapping, 25 days) gives: 10-01..10-03 cnlsneakers → ('bbbbbbbb',) only; ecommerce-workspace/nebi-skill and subfolders → ('aaaaaaaa',) only; 09-21..09-29 mostly both. Additions: on 09-28 a **third device `3b6b6288`** appeared (25 listings). It is in no current Chrome or Comet extension store. A few 09-25/09-27 listings show only bbbbbbbb.

**browsers-3: partly.** Opener at binary 193344391: `async function m(r){…let e=eu()?.browser,o=e!==void 0?e??void 0:a.BROWSER…return y(await Ke(o||"open",[r],f))}`, `var f={useCwd:!0,useToolMemoryCgroup:!1}`. `defaults read com.apple.LaunchServices/com.apple.launchservices.secure`: http and https → `com.google.chrome`. My shell has BROWSER unset. **Correction:** Chrome `profile.last_used` reads **`Default`** right now, not `Profile 3`; it flips with whichever profile window was focused last. That flip is the mechanism, but "currently Profile 3" is stale. The claim that Chrome opens external URLs in the last-active profile is Chromium behaviour; I did not verify it from source. History quotes exist: 10-01 16:48 cnlsneakers ("when you opened the artifact you opened it in the wrong browser") and 09-27 13:37. The 09-27 quote ("I just logged into karpet24 as you opened the wrong browser") may be about Claude in Chrome picking the wrong device, not the artifact opener.

**browsers-4: confirmed.** `Ke` (180937850) → `Je(e,r,{…cwd:n.cwd??(n.useCwd?oe():void 0)…})`. It passes no `shell`, so `Je` → `Ptt(v,Le,{…shell:l…})` runs with shell undefined. Error mapper `y()`: `code===127||e.includes("ENOENT")` → `opener_missing`. **Extra:** `f` passes no timeout, so `Je`'s default `10*60*1000` ms applies. The opener **waits for the BROWSER process to exit**, and a non-zero exit becomes `nonzero_exit`. A router must exit 0 fast. The child gets the full `process.env` (CLAUDE_CONFIG_DIR included).

**browsers-5: confirmed.** 210297259: `Mt(){return It()?"bg":hl()?"teammate":F0()?"remote":_d()?"desktop":Cu()==="claude-vscode"?"vscode":null}`. `JRt` skip order: `redeploy` → `auto_open_skipped_${Mt()}` → remote-control client → `_s(a.CLAUDE_CODE_ARTIFACT_AUTO_OPEN)`. Then `bxr(url+?via=auto_preview)`. `_s` = `["0","false","no","off"]` (178928061). `_d()` = CLAUDE_CODE_ENTRYPOINT ∈ {claude-desktop, claude-desktop-3p, local-agent} (179261624). The explicit `open` action calls the same `JRt` (210598350). **Extras:** subagents (`agentId`) and non-interactive sessions never open. An `open` on an artifact already shown is treated as a redeploy and skipped unless the last open failed.

**browsers-6: confirmed (medium).** `applyConfigEnvironmentVariables` (≈182666991): `for(let A of Qo())Object.assign(process.env,this.filterSettingsEnv(ge(A)?.env,A))`. The pre-trust pass (`applySafeConfigEnvironmentVariables`) applies project keys only through the safe filter `Twt`. Project-scope drop `P()` uses `j()` = `RQn` set + prefixes; BROWSER is **not** in `RQn` (the visible list, plus `JZe`/`zTn`). BROWSER is in the code-execution env lists at 186054155 and 206542066. `asFromAFolderNobodyTrusted` keeps only keys passing `AJo` when `ETn(source)` is true; I did not trace `AJo`'s list end to end. The opener's `a.BROWSER` is a live getter over `process.env` (`Ntt`, and BROWSER is a declared key).

**browsers-7: confirmed.** Types `claude-code.d.ts:3392-3401` doc as quoted. Engine: `"env.set":{check:Gxt,run:Nco}`. `Nco(e){… process.env[e.name]=e.value}` (≈188202816). `Gxt` checks only name/value shape (no '=', no NUL); there is no name denylist. Chain check `Et` refuses only a changed name. The opener reads `a.BROWSER` live, so a mid-session `$.env.set("BROWSER",…)` reaches artifact open. The name must be a string literal (`claude plugin validate` lists it).

**browsers-9: confirmed.** select_browser handler `Gn` (≈198001945) → `t.selectExtensionById(r,ge(o,c))`. `selectExtensionById` → `this.context.onExtensionPaired?.(e,n)`. `onExtensionPaired:(o,s)=>{…lkr(o),Ae((g)=>({...g,chromeExtension:{pairedDeviceId:o,pairedDeviceName:s}}),c)…}` (198063964). The file is `~/.claude.json` for account A (CLAUDE_CONFIG_DIR unset) and `~/.claude-max2/.claude.json` for B, so "last pick wins" holds **per account**.

**browsers-10: confirmed.** `getPersistedDeviceId:()=>ckr(()=>le().chromeExtension?.pairedDeviceId||D)`; `ckr(e){return nd().browserHints?.preferredDeviceId??e()}` (198043277). `D` comes from `r?.CLAUDE_CHROME_PAIRED_DEVICE_ID??a.CLAUDE_CHROME_PAIRED_DEVICE_ID` (198061085), validated by regex.

**browsers-11: confirmed.** `hrn` (197983750): persisted → `only` → single `live` local → `ask`. Ask text `C2n`: "you MUST call … with a question listing EVERY connected browser as a separate option … do not pick one yourself", plus a final "Open a confirmation screen…" option. `list_connected_browsers` description: "Never pick one yourself."

**browsers-14: confirmed.** `qG="ClaudeInChromeDomain"`; `p=new RegExp(`^${qG}\\(([^)]+)\\)$`)`. `yq()` lowercases, strips trailing dots, strips `www.`. `nct` also matches with the port stripped. `fHt` walks `alwaysDenyRules` then `alwaysAllowRules` across every source key. There are no wildcards. Deny returns `Claude in Chrome is denied on <host>.` **Extras:** the local wrapper `_kr` also resolves the **target tab's URL** (`L(tabId)`) for non-navigate tools, so deny covers acting on and reading a tab at that host, not just navigation. Tools in `bne` (tabs_context/create/close, shortcuts_list/execute, resize_window, switch_browser, list_connected_browsers, gif_creator) are allowed before the deny check. Rules are host-only; there is no per-device scope.

**browsers-15: partly.** Call path (≈219978058): `b=AM(v,a)`, `S=b==="bypassPermissions"||(b==="auto"&&…)`, then `skip_all_permission_checks` / `follow_a_plan`+allowedDomains / `ask`, as claimed. **Caveat:** `AM` (179521990) turns bypass into `auto` or `default` for Chrome tools when `chromeClassifierFloorEnabled` is set. That value is `CLAUDE_CHROME_CLASSIFIER_FLOOR ?? gate tengu_cowork_chrome_automode_default (default false)` (194326115). It also turns bypass for any tool with `excludedFromModeBypassAllow`; the non-builtin wrapper `pon` sets that flag, while the builtin wrapper `_kr` does not. Today, CLI bypass → skip_all. `~/.claude/settings.json` defaultMode=bypassPermissions ✓. `claude-profile` l.62-63 appends `--dangerously-skip-permissions` ✓. **Counts:** my re-scan of top-level transcripts from the last 21 days found **49** Chrome-using sessions, all `entrypoint cli` + `bypassPermissions`. I did not reproduce 57/56/1.

**browsers-16: partly.** Re-count of assistant text over 21 days (regex click/press/tap/hit + verb): install 41, allow 11, save 8, approve 4, confirm 3, agree 2, continue 2, connect 1, publish 1, accept 1. Projects: cnlsneakers 65 + its `google` subfolder 3 = 68. Both quotes found (cnlsneakers; cnlsneakers/…/google). **Correction:** "no setting removes them" is too strong. Some handoffs are written into the project itself: `cnlsneakers/growth/b-tiktok/playbook.md` browser rule says "Nebi makes the last click on anything that pays, verifies identity, accepts terms or needs 2FA". That is an editable doc. Under the agent safety rules in this session, OAuth grants, accepting terms and installs need an explicit chat "yes" before the agent acts; they are not banned outright. Only typing account numbers or credentials is barred. So one batched up-front yes is a second lever next to staging. I did not verify which rule text those sessions carried.

**browsers-19: confirmed.** 198060583 `return"wss://bridge.claudeusercontent.com"`. `bridgeConfig.getUserId` uses `le().oauthAccount?.accountUuid` / the token account. The warning text is as quoted. Live `list_connected_browsers` from this account-A session: one device `aaaaaaaa…`, `inUse:true`. Per-profile deviceIds: see browsers-1.

**browsers-21: confirmed.** `~/.local/bin/claude-profile` (96 lines, read whole). Symlinks claude-a/claude-nebi/claude-b/claude-omer. B sets `CLAUDE_CONFIG_DIR=~/.claude-max2` (l.69) and `--mcp-config shared-mcp.json` built from A's `mcpServers` (l.72-83). A pops CLAUDE_CONFIG_DIR (l.44). The name is printed only `if sys.stderr.isatty()` (l.84-85). `claude-profile nebi|omer|a|b` also works (l.22-24). Plain `claude` (symlink to the binary) also runs account A. No claude lines in ~/.zshrc, .zprofile, .zshenv, .profile, .bashrc or .bash_profile.

**browsers-22: partly.** `ls -la ~/.claude-max2`: the symlinks named are right, but the list is incomplete. **Also shared:** history.jsonl, file-history, handoffs, mcp-servers, paste-cache, skills-project-packs. That means prompt history and the projects/ transcripts and auto-memory are shared across accounts. **Also not shared:** backups/, telemetry/, shared-mcp.json, mcp-needs-auth-cache.json, .last-update-result.json, .last-cleanup. Beacons from account B today: b7c547c8, a961e5fc, f7e72c95 (cnlsneakers); their ids are in `~/.claude-max2/session-env/`.

**browsers-23: confirmed (medium).** The status-line builder `aso` (≈188152111) returns model, workspace{current_dir,project_dir,added_dirs,…}, version, output_style, cost, context_window, effort, rate_limits, etc. It has no account or email field. `statusline.mjs:16-31` shows the model and ` (1M)` and nothing about the account. `$.env.get` → `Dco` reads `process.env[name]`, so CLAUDE_CONFIG_DIR is readable from a mod.

**browsers-24: confirmed.** `claude-code.d.ts:11957-11961` reserved `tool`, `tool_use_id`, `agentId`; `ToolCallResult` `{deny}|{result,…}` around 11986-12030. `'mcp.call': {server, tool, args}` at 6436-6443. `PromptContextInput/Result` 7936-7975; `PromptSectionInput/Result` 8360-8380. Note: matchers are literal or RegExp (`d.ts:5484-5527`), so use `{ tool: /^mcp__claude-in-chrome__/ }`, not a `*` glob.

**browsers-25: confirmed.** `session-start.mjs:36` emits `hookSpecificOutput.additionalContext`. `steer-channel.mjs:22-29` emits `permissionDecision:'deny'`. In settings.json, SessionStart and PreToolUse have no matcher (they run on every tool).

**browsers-26: partly (design).** The premises hold (3/4/6/7/23/24/25). Gotchas the lane did not state:
- (a) The router is awaited, with a 10-minute timeout; it must exit 0 quickly.
- (b) `open -a "Google Chrome" --args …` ignores args when Chrome is already running. Use `open -na "Google Chrome" --args --profile-directory="Profile 3" <url>` or the Chrome binary directly. Unverified, because testing it would open a browser window.
- (c) BROWSER in `~/.zshenv` changes every CLI that honours BROWSER, not just Claude Code.
- (d) The router can tell the account from the inherited CLAUDE_CONFIG_DIR.

The repo count is **8** files under `cnlsneakers/growth/` mentioning bbbbbbbb, not 9. Two of them are HANDOFF.md, which repo-aware grep skips.

**browsers-28: confirmed.** `mods/CONTRACT.md:19-44` schema. `nebi-constellation/hooks/register.tsx:131-135` scan of `${home}/.claude/nebi/beacons`. Live beacons: 5 with keys [cwd, heartbeatAt, kind, project, sessionId, startedAt, text, updatedAt, version] and 2 with `ask` added. No account, browser or surface field.

## What the lane missed
1. **The project playbook forces some Approve handoffs.** cnlsneakers' browser rule ("Nebi makes the last click on anything that … accepts terms …") is an editable source of the stops Nebi dislikes. It is not a fixed safety limit.
2. **The opener waits for BROWSER to exit** (10-minute default timeout; non-zero exit = failure). A router that stays in the foreground, or `open -a` with ignored `--args`, will fail or misroute.
3. **Chrome bypass is gate-dependent.** `CLAUDE_CHROME_CLASSIFIER_FLOOR` or gate `tengu_cowork_chrome_automode_default` turns bypass into the auto classifier or default prompts for Chrome tools. If the gate flips, prompts come back.
4. **A third extension device `3b6b6288`** showed up in listings on 09-28 and matches no current Chrome or Comet store. A stray extension instance can bring back the multi-device "ask" card.
5. **Prompt history and transcripts are shared across both accounts** (history.jsonl and projects/ are symlinked). Scans and memory can't tell accounts apart by path.
6. **`profile.last_used` is volatile** (it was Profile 3 for the lane, Default now). Any fix must not depend on it.
7. **Domain deny rules also check the target tab's host**, but tab-management and shortcut tools skip the check. They are per-host and cannot target one Chrome profile; only per-project scoping works.
8. **Explicit open on an artifact already shown is skipped** as a redeploy, and subagents never open artifacts. Re-asking an agent to "open it again" can silently do nothing.
