# Browsers, accounts and sessions (lane report, 2026-10-03)

Read-only research. Claude Code 2.1.288. Binary strings were extracted to the session scratchpad
(`strings-2.1.288.txt`) and searched with Python; offsets below are byte offsets in that file. Nothing was
installed, edited, navigated or clicked. One read-only call was made: `list_connected_browsers`.

## The short version

- Nebi's "two browsers" are **two Chrome profiles**, not two browser apps. Main Chrome = profile `Default`
  ("nebi", Claude extension device `aaaaaaaa…`). RapidSneakers Chrome = profile `Profile 3` (named
  "Your Chrome", device `bbbbbbbb…`). Comet is installed and has the Claude extension, but was last used 09-30
  and is not part of the daily split.
- Since the dual-account split (1 Oct), **each Claude account only sees one browser**: account A (Nebi,
  `~/.claude`) sees `aaaaaaaa` only, account B (Omer, `~/.claude-max2`) sees `bbbbbbbb` only. Before 1 Oct both
  browsers sat on one account, and sessions spent hundreds of calls listing and picking browsers. So for
  Claude in Chrome, **project → account → browser** already holds, as long as the project is launched with the
  right account. Nothing shows which account a session is on.
- The **artifact "wrong browser"** bug has a different cause. Artifact open goes through Claude Code's URL
  opener: attacher caps → `$BROWSER` → `open <url>`. With no `BROWSER`, macOS hands the URL to Chrome, and Chrome
  opens it in the **last-used profile** (right now `Profile 3`). The fix is a `BROWSER` router script that
  picks the Chrome profile from the project.
- The **"Approve" stops** are not site-permission prompts. CLI sessions run in `bypassPermissions`, which
  sends `skip_all_permission_checks` to the extension. The desktop app has `allowAllBrowserActions: true`.
  The stops come from the model's own safety rules: OAuth "Allow", accepting terms, installing an app,
  typing billing account numbers, creating accounts. 68 of 71 such asks in 21 days were in cnlsneakers.
- **Recommended design**: one small file per project, `.claude/browser.json`. A global `BROWSER` router script
  reads it. The existing SessionStart hook turns it into one line of agent context. The status line shows a
  badge (account and browser). An optional `nebi-browser` mod adds hard guards: `tool.call` on
  `mcp__claude-in-chrome__*`, `$.env.set`, and `prompt.context`. Every part works without mods.

---

## (a) Claude in Chrome: browsers, selection, permissions

### Transport and what counts as "a browser"
- Claude in Chrome connects through an account bridge at `wss://bridge.claudeusercontent.com`, with a native socket
  as fallback. Offset 31496344: `function G(){... return"wss://bridge.claudeusercontent.com"}`, transport
  `"bridge"|"native"`.
- `list_connected_browsers` works only over the bridge. Offset 31436115: "Listing browsers is only available with
  bridge connections." It returned a result here, so the bridge is live:
  `[{"deviceId":"aaaaaaaa-…","name":"Browser 1","osPlatform":"macOS","isLocal":true,"inUse":true}]`.
- Each Chrome **profile** has its own extension instance and its own deviceId. `aaaaaaaa` appears in the extension
  storage of `Google/Chrome/Default`, and `bbbbbbbb` in `Google/Chrome/Profile 3`. Checked by counting byte
  markers in `Local Extension Settings/fcoeoabgfenejglbffodgkkbkcdhcgfn`; no values were printed.
- Chromium forks: the native-host installer knows `chrome, brave, arc, edge, chromium, vivaldi, opera` (offset
  ~18128052, `C=["chrome","brave","arc","edge","chromium","vivaldi","opera"]`). **Comet is not in the list**, and
  `~/Library/Application Support/Comet/NativeMessagingHosts` is empty. The bridge path does not need the native
  host, so a Comet extension that is signed in should still appear over the bridge. That part is unconfirmed: Comet
  was never seen connected.
- `hbe()` (chrome_open_url) opens extension pages with `open -a "<first detected app>"`, which here is Google Chrome.

### How a session picks a browser
- `hrn()` (offset 31436115 module):
  1. The persisted/selected device if it is connected.
  2. Else the only connected device.
  3. Else the one live local device.
  4. Else **ask**.
- On "ask", the tool description makes the model pop an **AskUserQuestion with one numbered option per browser**:
  "Never pick one yourself". That is exactly the "being told what to answer" pattern.
- **Where the persisted device lives:** `getPersistedDeviceId: ()=>ckr(()=>le().chromeExtension?.pairedDeviceId||D)`
  (offset 31500252). `ckr` = `browserHints.preferredDeviceId ?? …`. So the order is: host hint, then the global
  config `chromeExtension.pairedDeviceId` (in `<CLAUDE_CONFIG_DIR>/.claude.json`), then env
  `CLAUDE_CHROME_PAIRED_DEVICE_ID`.
- **`select_browser` writes the global config.** `selectExtensionById → onExtensionPaired → chromeExtension:{pairedDeviceId,pairedDeviceName}`
  (offsets 31437986, 31450594). One session's pick therefore becomes every later session's default on that
  account: last pick wins, across projects.
- `CLAUDE_CHROME_PAIRED_DEVICE_ID` (offset 31497110) is only a **fallback**. After any `select_browser`, the
  global config shadows it. It is not a reliable per-project pin.
- Persisted names are useless: both accounts store `pairedDeviceName: "Browser 1"`. The name falls back to
  `Browser ${index+1}` when the extension has no name (`function ge`), so it changes with list order.
- Browsers can be named. `switch_browser`: "The user can name the browser when they connect." Transcripts show
  names "Macbook chrome" and "Second browser" in use.
- Other env knobs found: `CLAUDE_CHROME_PERMISSION_MODE` (`ask|skip_all_permission_checks|follow_a_plan`) and
  `CLAUDE_CHROME_TAB_GROUP_KEY` (`chat:<uuid>`).

### Site permissions
- Domain rules are permission rules named **`ClaudeInChromeDomain(<host>)`**, matched by the regex
  `^ClaudeInChromeDomain\(([^)]+)\)$`. The host is lowercased and loses `www.`. Matching is exact host (also tried
  without the port); there are **no wildcards**. They are read from `alwaysAllowRules` / `alwaysDenyRules` of
  every settings source (`fHt`, `function a`). So they can be pre-granted per project in
  `.claude/settings.json` → `permissions.allow`, and blocked per project with `permissions.deny`.
- Per-call mode (offset 53407616). `bypassPermissions` (or auto mode once classified) sends
  `skip_all_permission_checks`. A resolved host sends `follow_a_plan` plus `allowedDomains`. Otherwise `ask`.
  A cross-site navigation can raise "cross-site navigation pending" when the navigation classifier is on and the
  session is not in bypass.
- Nebi's state:
  - `~/.claude/settings.json` has `permissions.defaultMode: "bypassPermissions"` and
    `skipDangerousModePermissionPrompt: true`.
  - The launcher `~/.local/bin/claude-profile` adds `--dangerously-skip-permissions`.
  - All 57 Chrome-using main sessions in 21 days were `entrypoint: cli`: 56 in `bypassPermissions`, 1 in `auto`.
  - Desktop prefs (`claude_desktop_config.json` → `preferences`): `allowAllBrowserActions: true`,
    `coworkPreferredBrowser: "chrome"`, `dispatchCodeTasksPermissionMode: "bypassPermissions"`.
  - So site prompts are not what stops him.

## (b) Desktop built-in browser (`mcp__Claude_Browser__*`)
- From the `anthropic-skills:built-in-browser` skill:
  - It is a pane inside the desktop app with its **own persistent profile**, shared across desktop sessions.
  - It shares the side panel with artifacts, and shows only while the pane is visible (Cmd+Shift+B).
  - Approvals depend on the app's approval settings. `request_access` exists only on the remote-devices prefix.
  - It cannot open `file://`, or `localhost` servers that Claude started where the shell runs elsewhere.
- **Usage: 0 calls in 21 days.** 14,583 browser tool calls, all `mcp__claude-in-chrome__*` (scan of 4,500
  transcripts). The tool names appear in 3,200 files only as deferred-tool listings. It is not in this CLI
  session's tool list either.
- Difference that matters for Nebi: the built-in pane cannot reuse his Chrome sign-ins (Shopify, Meta, TikTok).
  That is why everything runs through Claude in Chrome.

## (c) Artifact open and other "open in browser" paths
- `JRt()` (offset 43730216) handles both auto-open after publish and the explicit `open` action. It skips when
  `Mt()` returns `bg | teammate | remote | desktop | vscode`, when a remote-control client is attached, when it is a
  redeploy, or when `CLAUDE_CODE_ARTIFACT_AUTO_OPEN` is falsy. Otherwise it calls `bxr(url+"?via=auto_preview")`.
  - **In the desktop app the artifact shows in the side pane** (`KPr()` → `"desktop_pane"`), not an OS browser.
  - **Only terminal sessions hit the OS browser.**
- The opener (offset 339874 line): `m(r){ let e=eu()?.browser, o = e!==void 0 ? e??void 0 : a.BROWSER; … Ke(o||"open",[r],{useCwd:!0}) }`.
  `eu()` = `surfaceCapabilities.attacherCaps()`.
  - The attaching terminal sends `browser: a.BROWSER??null` in its caps (offset 26555378, `fn()`).
  - For an **attached background session**, the attacher's `BROWSER` wins. If the attacher has none, the session's
    own `BROWSER` is deleted and `open` is used (`handleAttacherCaps`, offset 40497639).
- `Ke` = execFile with no shell, run in the **session cwd** (`cwd: n.useCwd ? oe() : void 0`). So `BROWSER` must be
  **one executable path with no arguments**. `BROWSER="open -a Comet"` would fail as `opener_missing`.
- Settings `env` is applied to `process.env` for every settings source: user, project, local
  (`Object.assign(process.env, this.filterSettingsEnv(ge(E)?.env,E))`, offset 16107442). Project/local `env.BROWSER`
  therefore reaches the opener in trusted folders.
  - Caveat: `BROWSER` is on Claude Code's list of code-execution env names (offsets 19495132, 39975158), and
    folders nobody trusted have such keys withheld (`asFromAFolderNobodyTrusted`). Not tested end to end.
- With no `BROWSER`, `open <url>` goes to the LaunchServices default. That is
  `LSHandlerRoleAll = "com.google.chrome"` for http/https
  (`defaults read com.apple.LaunchServices/com.apple.launchservices.secure`). Chrome then opens the URL in its
  **last-used profile**: `Local State` → `profile.last_used = "Profile 3"` right now. This is the
  "opened the artifact in the wrong browser" bug (cnlsneakers 10-01, and 09-27 "you opened the wrong browser").
- The same applies to any CLI that opens a browser from the session's Bash tool. Example: cnlsneakers
  transcript, "A tab with this link may pop up by itself in your normal browser. Ignore it and close it."
  That was a Shopify device-login page. CLIs that honour `BROWSER` (Python `webbrowser`, many others) would follow a
  router. Whether the Shopify CLI honours it is unconfirmed.
- Ways to steer it:
  1. A `BROWSER` router script.
  2. `$.env.set('BROWSER', …)` from a mod: it "sets the variable for this process and everything it starts after"
     (types line 3392).
  3. `CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0` to stop pops entirely. It also stops the explicit `open` action, since
     both go through `JRt`.

## (d) Which browsers, per project
- Installed: `Google Chrome.app`, `Comet.app`, `Safari.app` (`ls /Applications`). The default handler is Chrome.
- Chrome profiles (`Local State`):

  | Profile | Name | Signed in | Last active | Claude extension |
  |---|---|---|---|---|
  | `Default` | nebi | yes | 10-03 14:22 | yes, `aaaaaaaa` |
  | `Profile 3` | Your Chrome | no | 10-03 14:55 | yes, `bbbbbbbb` |
  | `Profile 4` | paarline.com | yes | 09-29 | no |
  | `Profile 1` | space | yes | 06-02 | no |
  | `Profile 2` | space | yes | 06-02 | no |

  Comet `Default` ("n", no sign-in, last active 09-30) has Claude ext 1.0.97, but no paired device was found in
  its storage.
- Project mapping, with evidence:
  - **cnlsneakers (RapidSneakers) → Profile 3 / `bbbbbbbb`, account B (Omer).** Live sessions in
    `~/.claude-max2/sessions` are all cnlsneakers. `cnlsneakers/growth/BROWSER-LOCK.md` and 8 other project docs
    repeat the rule "Chrome Profile 3, extension deviceId bbbbbbbb … never aaaaaaaa". History: "the separate
    browser that is specifically made for rapid sneakers".
  - **ecommerce-workspace, Karpet24, nebi-skill → main Chrome / `aaaaaaaa`, account A.** Live sessions in
    `~/.claude/sessions` are ecommerce-workspace and nebi-skill. History 09-27: "this is the right browser with the
    bookmarks and meta + tiktok open"; "i dont get why you are working in the rapidsneakers browser and not the
    main one".
- The user's own words describe the main Chrome as "the MAIN google browser" and the other as the "RapidSneakers
  Chrome".

## (e) Drift and stalls in the browser agent
- **Browser-selection churn** (before the split):
  - 513 `list_connected_browsers` and 53 `select_browser` calls in ecommerce-workspace in 30 days, plus 49 and 35
    in cnlsneakers.
  - 74 of 103 transcripts with listing calls are sub-agents; one sub-agent made 59 calls. This is driven by
    project docs saying "before any page action call list_connected_browsers then select_browser".
  - Listings showed generic names: "Browser 1, Browser 2" ×410 and "Browser 1, Browser 2, Browser 3" ×25.
  - 15 AskUserQuestion prompts were about which browser. One model wrote: "Both your profiles now have the Claude
    extension, and the names don't say which is which."
- **After the split** (Oct 1–3), every listing shows exactly one device per account (scan6). The churn is
  structurally gone, but the docs still prescribe the ritual.
- **"Approve" stops = model safety rules.** In 21 days, assistant texts asked him to click: install ×41,
  allow ×11, save ×8, approve ×4, agree ×2, continue ×2, connect ×1, confirm ×1, publish ×1. 68 of these were in
  cnlsneakers. Examples:
  - "entering an account number that carries billing isn't something I'll type for you"
  - "This creates the account and accepts TikTok's seller terms, so the helper won't do it for you"
  - Google OAuth "Allow"
  - Shopify `accounts.shopify.com/activate` device codes

  These match the session safety rules (account numbers and account creation are prohibited; terms and OAuth
  grants need explicit permission per action). No config turns them off.
- **Wrong tab/browser episodes:** "No stop this is wrong tab, again give me the prompt…" (09-28 ecommerce), plus
  the 09-27 and 10-01 wrong-browser lines above.
- Tool errors are rare: 15× "Browser extension is not connected", plus 1 auto-mode classifier timeout.
- Instructions that already reduce drift: the Chrome skill's "stay on task; stop after 2–3 failed attempts; own
  new tab; fresh tab context". The cnlsneakers rule "prove the account on the page before acting" is the strongest
  project-level guard seen.
- What would reduce drift mechanically:
  - (1) A pinned browser per project, so there is no choice to make.
  - (2) A per-project deny list as `ClaudeInChromeDomain(...)` rules. Example: cnlsneakers forbids facebook.com in
    Profile 3 per BROWSER-LOCK.md.
  - (3) One batched "your clicks" list for the human-only steps, staged in the right browser.

## (f) Per-project browser options, each checked

| Option | Verified? | Covers | Gaps |
|---|---|---|---|
| Project `.claude/settings.local.json` `env.BROWSER=<script>` | Code path verified (settings env → process.env → opener) | Artifact open, CLIs from the Bash tool | One file per project per account. Attached bg sessions use the attacher's BROWSER. Folder must be trusted |
| **Global `BROWSER` router script** that reads the project file from its cwd | Opener runs with `useCwd:true` → cwd = session cwd (verified in `Ke`) | Same, for every project, both accounts (settings.json is shared by symlink). Also works for attached sessions if Ghostty's shell exports it | Needs one script plus a per-project file |
| Per-project file the agents read (`.claude/browser.json`), injected by the existing SessionStart hook | `session-start.mjs` already emits `hookSpecificOutput.additionalContext` | Agents know the browser and account without reading 8 docs | Advisory only |
| Mod `prompt.context` / `prompt.section` injection | Hooks exist (types 3911, 3923; `PromptContextResult.blocks`) | Same as above, without a classic hook | Mods may be gated; needs a fallback |
| Mod `tool.call` on `mcp__claude-in-chrome__*` | `tool.call` can deny (`{deny}`) or rewrite args. `$.mcp.call(server,tool,args)` exists | Deny `select_browser` with the wrong deviceId. Deny page actions when the account does not match the project | Whether `$.mcp.call('claude-in-chrome','select_browser',…)` works on the in-process server is untested |
| Classic PreToolUse (`steer-channel.mjs` already returns `permissionDecision: deny`) | Verified the hook pattern exists | Same guard, no mods needed | Runs a node process per call |
| `permissions.allow/deny` `ClaudeInChromeDomain(host)` in project settings | Rule syntax verified | Pre-grant sites outside bypass; mechanically forbid off-scope sites | Exact hosts only. That deny is honoured under bypass is inferred, not tested |
| `CLAUDE_CHROME_PAIRED_DEVICE_ID` per project | Verified as a fallback only | — | Shadowed by global `pairedDeviceId` after any select. **Do not rely on it** |
| Status line / band badge | Status-line JSON has `workspace.current_dir` but no account field | Shows "Omer · RapidSneakers Chrome" | Account must come from `CLAUDE_CONFIG_DIR` in env (likely inherited, untested) |

### Recommended design (one source of truth, used by Nebi and agents)
1. **`<project>/.claude/browser.json`** (tiny, committed):
   `{ "label": "[store B] Chrome", "app": "Google Chrome", "profile": "Profile 3", "chromeDevice": "[device B]", "claudeAccount": "b", "pageAccount": "[account B email]", "neverSites": ["facebook.com","business.facebook.com"] }`.
   If a project has no file, it uses the main Chrome (`Default`, account nebi).
2. **`~/.claude/nebi/bin/open-url`**, set as `BROWSER` in `~/.claude/settings.json` `env` (shared by both accounts
   through the symlink) and in `~/.zshenv`. It walks up from its cwd to find `browser.json`, then runs
   `open -na "Google Chrome" --args --profile-directory="<profile>" "$1"`, or `open -a <app>` for a non-Chrome app.
   This fixes artifact and CLI pops with no mod. (The Chrome `--profile-directory` handoff is standard but was not
   run here.)
3. **Agent context:** the existing SessionStart hook prints one line, for example
   "Browser: [store B] Chrome (Profile 3). Claude account: B. Page must show [account B email]."
   That replaces the ritual repeated in 8 cnlsneakers docs.
4. **Badge:** the status line shows `Omer · RapidSneakers Chrome` (short, black text on a color). The colors
   match the Chrome profile colors, so his eye links the terminal to the window.
5. **Optional `nebi-browser` mod, for hard guards only.**
   - `tool.call` on `mcp__claude-in-chrome__select_browser` denies a deviceId other than `chromeDevice`.
   - It denies page actions when `CLAUDE_CONFIG_DIR` does not match `claudeAccount`: "this project runs on Omer;
     restart with claude-omer".
   - `neverSites` becomes `ClaudeInChromeDomain` deny rules.
   - If the mods API is off, steps 1–4 still work.
6. **One-time manual steps for Nebi:**
   - Rename Chrome `Profile 3` from "Your Chrome" to "RapidSneakers" and give it a color.
   - Name both extension connections via `switch_browser` ("Main Chrome", "RapidSneakers Chrome"), so any listing
     is readable.
7. **Optional launcher upgrade:** `claude-profile` picks the account from `browser.json` `claudeAccount` when no
   account is given, so a project can't be started on the wrong account and drive the wrong browser.

## (g) Dual Claude accounts
- Launcher `~/.local/bin/claude-profile` (Python), with symlinks `claude-a`/`claude-nebi` → account A and
  `claude-b`/`claude-omer` → account B.
  - B sets `CLAUDE_CONFIG_DIR=~/.claude-max2` and passes `--mcp-config ~/.claude-max2/shared-mcp.json`, copied from
    A's `mcpServers`.
  - Both add `--dangerously-skip-permissions` unless a mode is given.
  - It prints "Claude Max: Nebi|Omer" once to stderr, then the line scrolls away.
  - There are no aliases in `~/.zshrc`; the launchers live in `~/.local/bin`.
- `~/.claude-max2` **symlinks**: `settings.json`, `settings.local.json`, `plugins`, `output-styles`, `hooks`,
  `nebi`, `skills`, `agents`, `commands`, `rules`, `CLAUDE.md`, `projects`, `history.jsonl`, `file-history`,
  `handoffs`, `paste-cache`, `mcp-servers` (`ls -la ~/.claude-max2`). So B gets the same mods (enabledPlugins live
  in the shared settings.json), hooks, status line and output style.
  - Proof that mods run in B: beacon files exist in `~/.claude/nebi/beacons/` for session ids `51cec88e…` and
    `a961e5fc…`, which also appear in `~/.claude-max2/session-env/`.
- **Not shared:** `.claude.json` (OAuth account, `chromeExtension` pairing, per-project trust,
  `claudeInChromeDefaultEnabled`: A `true`, B unset), `sessions/`, `session-env/`, `shell-snapshots/`, `backups/`,
  `cache/`, `chrome/`, `telemetry/`.
- Pairings: A → `aaaaaaaa` (Default profile); B → `bbbbbbbb` (Profile 3). Both named "Browser 1".
- The bridge uses the session's OAuth account (`bridgeConfig.getUserId` → `oauthAccount.accountUuid`, offset
  31500252). An extension shows up only for the account it is signed into. The listings since Oct 1 confirm one
  device per account.
- Showing the account in a session: the status-line JSON has no account field. Read `CLAUDE_CONFIG_DIR` (unset =
  A, `~/.claude-max2` = B) in `statusline.mjs`, or `$.env.get('CLAUDE_CONFIG_DIR')` in a mod. Add `account` to the
  beacon file so constellation can show it.

## (h) Multiple sessions
- Today:
  - `nebi-beacon` writes `~/.claude/nebi/beacons/<sessionId>.json` with `{project,cwd,kind,text,ask,…}`. The path is
    HOME-based, so both accounts share it.
  - `nebi-constellation` polls every 3 s, counts peers in the status line, toasts when a peer flips to `need`, and
    has a `/sessions` pane that can answer a peer via `$.session.send`.
  - Live right now: 8 beacons, 3 of them cnlsneakers (2 × `need`).
- Missing for this lane:
  - The **account** and the **browser/profile** per session.
  - Any **browser lock**: cnlsneakers hand-edits `growth/BROWSER-LOCK.md` "holder:" lines.
  - A way to jump to the session's Ghostty window.
  - A dedupe signal for "two sessions want the same browser".
- Global `chromeExtension.pairedDeviceId` is a shared mutable default per account: last `select_browser` wins. The
  split made this harmless for now, because each account has one browser, but it comes back the moment a second
  profile signs into the same account.

## Unconfirmed
- Whether Chrome `open -na "Google Chrome" --args --profile-directory=…` reuses the running instance cleanly here.
  Not run, to avoid opening windows.
- Whether `BROWSER` from project settings is withheld in any of Nebi's folders (trust state not checked per project).
- Whether the status-line child process inherits `CLAUDE_CONFIG_DIR`.
- Whether `ClaudeInChromeDomain` deny rules are honoured under `bypassPermissions`. Inferred from the tool's
  checkPermissions returning deny; not tested.
- Whether `$.mcp.call` can reach the in-process `claude-in-chrome` server.
- Which device `3b6b6288` was (a third browser seen 09-28 only).
- Whether the Shopify CLI honours `BROWSER`.
- Where the desktop built-in browser stores site approvals (not found in `claude_desktop_config.json`, which
  only has `allowAllBrowserActions`).
