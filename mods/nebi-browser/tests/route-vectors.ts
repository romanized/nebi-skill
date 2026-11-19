// route.mjs's test cases (tests/route.test.mjs), written as data so the mod's
// tests run every one through the mod. A case here that route.mjs would answer
// differently is a drift: fix the mod, not the case. Pure data, no imports,
// so node can load it too: each case holds for claude-home/nebi/route.mjs
// when its paths are materialised under a temp folder.

export type VectorRoute = {
  label: string | null
  chromeProfile: string | null
  deviceId: string | null
  // Present only when the file names one.
  codexBrowserId?: string
  claudeAccount: 'a' | 'b' | null
  account: 'a' | 'b' | null
  source: 'project' | 'account'
  mismatch: boolean
}

export type RouteVector = {
  name: string
  // HOME; every other path in the case is absolute too.
  home: string
  // CLAUDE_CONFIG_DIR, left out when unset.
  configDir?: string
  cwd: string
  // Folders holding a `.git` folder, and folders holding a `.git` file (a worktree).
  gitDirs: string[]
  gitFiles?: string[]
  // File path to its exact text.
  files: Record<string, string>
  expected: VectorRoute | null
}

export const HOME = '/w/home'
const DEFAULTS = `${HOME}/.claude/nebi/browsers.json`
const MAIN = { label: 'Main Chrome', chromeProfile: 'Default', deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
const RAPID = { label: 'RapidSneakers Chrome', chromeProfile: 'Profile 3', deviceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
// claude-home/nebi/browsers.json as shipped.
const SHIPPED = JSON.stringify({ version: 1, accounts: { a: MAIN, b: RAPID } })
const PROJECT_B = JSON.stringify({ version: 1, ...RAPID, claudeAccount: 'b' })
const SHOP = '/w/repos/cnlsneakers'
const CODEX_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const onDefault = (account: 'a' | 'b'): VectorRoute => ({ ...(account === 'a' ? MAIN : RAPID), claudeAccount: account, account, source: 'account', mismatch: false })
const fromShop = (account: 'a' | 'b' | null): VectorRoute => ({ ...RAPID, claudeAccount: 'b', account, source: 'project', mismatch: account !== 'b' })
const shop = (name: string, cwd: string, configDir: string | undefined, expected: VectorRoute | null): RouteVector => ({
  name,
  home: HOME,
  ...(configDir === undefined ? {} : { configDir }),
  cwd,
  gitDirs: [SHOP],
  files: { [`${SHOP}/.claude/browser.json`]: PROJECT_B, [DEFAULTS]: SHIPPED },
  expected,
})
const plain = (name: string, configDir: string | undefined, files: Record<string, string>, expected: VectorRoute | null): RouteVector => ({
  name,
  home: HOME,
  ...(configDir === undefined ? {} : { configDir }),
  cwd: '/w/repos/plain',
  gitDirs: ['/w/repos/plain'],
  files,
  expected,
})
const brokenProject = (bad: string, i: number): RouteVector => ({
  name: `broken project file ${JSON.stringify(bad)} counts as no file`,
  home: HOME,
  cwd: `/w/repos/bad${i}`,
  gitDirs: [`/w/repos/bad${i}`],
  files: { [`/w/repos/bad${i}/.claude/browser.json`]: bad, [DEFAULTS]: SHIPPED },
  expected: onDefault('a'),
})

/** currentAccount: [CLAUDE_CONFIG_DIR or undefined for unset, the account], HOME /Users/someone. */
export const ACCOUNT_HOME = '/Users/someone'
export const ACCOUNT_VECTORS: readonly [string | undefined, 'a' | 'b' | null][] = [
  [undefined, 'a'],
  ['', 'a'],
  ['/Users/someone/.claude', 'a'],
  ['/Users/someone/.claude/', 'a'],
  ['~/.claude', 'a'],
  ['/Users/someone/.claude-max2', 'b'],
  ['~/.claude-max2', 'b'],
  ['/Volumes/x/.claude-max2/', 'b'],
  ['/Users/someone/.claude-work', null],
  ['/Users/other/.claude', null],
  ['/Users/someone/x/../.claude', 'a'],
]

export const ROUTE_VECTORS: readonly RouteVector[] = [
  shop('the project file wins over the account default', SHOP, `${HOME}/.claude-max2`, fromShop('b')),
  plain('no project file gives account a with CLAUDE_CONFIG_DIR unset', undefined, { [DEFAULTS]: SHIPPED }, onDefault('a')),
  plain('no project file gives account a with CLAUDE_CONFIG_DIR at ~/.claude', `${HOME}/.claude`, { [DEFAULTS]: SHIPPED }, onDefault('a')),
  plain('no project file gives account b under .claude-max2', `${HOME}/.claude-max2`, { [DEFAULTS]: SHIPPED }, onDefault('b')),
  plain('an unknown config dir with no project file has no route', '/tmp/some-other-claude', { [DEFAULTS]: SHIPPED }, null),
  shop('a project file naming the other account is a mismatch, and its browser still wins', SHOP, undefined, fromShop('a')),
  shop('an unknown account is not account b', SHOP, '/tmp/some-other-claude', fromShop(null)),
  {
    name: 'a project file without claudeAccount never mismatches',
    home: HOME,
    cwd: '/w/repos/loose',
    gitDirs: ['/w/repos/loose'],
    files: { '/w/repos/loose/.claude/browser.json': JSON.stringify({ version: 1, ...RAPID }), [DEFAULTS]: SHIPPED },
    expected: { ...RAPID, claudeAccount: null, account: 'a', source: 'project', mismatch: false },
  },
  plain('no project file and no browsers.json means no route on a', undefined, {}, null),
  plain('no project file and no browsers.json means no route on b', `${HOME}/.claude-max2`, {}, null),
  ...['{ "label": "Main', '', '[]', 'null', '"text"', '{}', '{"label": 7}'].map(brokenProject),
  plain('a broken browsers.json means no route', undefined, { [DEFAULTS]: '{ "accounts": ' }, null),
  plain('an account entry that is not an object means no route', undefined, { [DEFAULTS]: JSON.stringify({ version: 1, accounts: { a: 'Main' } }) }, null),
  shop('a nested cwd finds the browser.json at its git root', `${SHOP}/growth/b-tiktok/raw`, '~/.claude-max2', fromShop('b')),
  shop('a cwd that does not exist yet still walks up', `${SHOP}/not/made/yet`, undefined, fromShop('a')),
  {
    name: 'the nearest .git is the root: a nested repo does not borrow the outer file',
    home: HOME,
    cwd: '/w/repos/outer/vendor/inner/src',
    gitDirs: ['/w/repos/outer', '/w/repos/outer/vendor/inner'],
    files: { '/w/repos/outer/.claude/browser.json': PROJECT_B, [DEFAULTS]: SHIPPED },
    expected: onDefault('a'),
  },
  {
    name: 'a .git file marks a root too (a worktree)',
    home: HOME,
    cwd: '/w/repos/outer/wt',
    gitDirs: ['/w/repos/outer'],
    gitFiles: ['/w/repos/outer/wt'],
    files: { '/w/repos/outer/wt/.claude/browser.json': PROJECT_B, [DEFAULTS]: SHIPPED },
    expected: fromShop('a'),
  },
  {
    name: 'a cwd outside any repo uses the account default, even beside a .claude/browser.json',
    home: HOME,
    cwd: '/w/loose-folder',
    gitDirs: [],
    files: { '/w/loose-folder/.claude/browser.json': PROJECT_B, [DEFAULTS]: SHIPPED },
    expected: onDefault('a'),
  },
  {
    name: 'an empty cwd uses the account default',
    home: HOME,
    cwd: '',
    gitDirs: [],
    files: { [DEFAULTS]: SHIPPED },
    expected: onDefault('a'),
  },
  {
    name: 'a project file with one browser field is a route; the others are null',
    home: HOME,
    cwd: '/w/repos/label-only',
    gitDirs: ['/w/repos/label-only'],
    files: { '/w/repos/label-only/.claude/browser.json': JSON.stringify({ label: 'Work Chrome', deviceId: '', claudeAccount: 'c' }), [DEFAULTS]: SHIPPED },
    expected: { label: 'Work Chrome', chromeProfile: null, deviceId: null, claudeAccount: null, account: 'a', source: 'project', mismatch: false },
  },
  {
    name: 'a project file carries its codexBrowserId',
    home: HOME,
    cwd: '/w/repos/codex',
    gitDirs: ['/w/repos/codex'],
    files: { '/w/repos/codex/.claude/browser.json': JSON.stringify({ version: 1, ...RAPID, codexBrowserId: CODEX_ID, claudeAccount: 'b' }), [DEFAULTS]: SHIPPED },
    expected: { ...RAPID, codexBrowserId: CODEX_ID, claudeAccount: 'b', account: 'a', source: 'project', mismatch: true },
  },
  {
    name: 'a project file naming only a codexBrowserId is a route',
    home: HOME,
    cwd: '/w/repos/codex-only',
    gitDirs: ['/w/repos/codex-only'],
    files: { '/w/repos/codex-only/.claude/browser.json': JSON.stringify({ codexBrowserId: CODEX_ID, deviceId: 7 }), [DEFAULTS]: SHIPPED },
    expected: { label: null, chromeProfile: null, deviceId: null, codexBrowserId: CODEX_ID, claudeAccount: null, account: 'a', source: 'project', mismatch: false },
  },
  plain('an account default carries its codexBrowserId; an empty one is left out', `${HOME}/.claude-max2`,
    { [DEFAULTS]: JSON.stringify({ version: 1, accounts: { a: { ...MAIN, codexBrowserId: '' }, b: { ...RAPID, codexBrowserId: CODEX_ID } } }) },
    { ...RAPID, codexBrowserId: CODEX_ID, claudeAccount: 'b', account: 'b', source: 'account', mismatch: false }),
  plain('an empty codexBrowserId is left out of the route', undefined,
    { [DEFAULTS]: JSON.stringify({ version: 1, accounts: { a: { ...MAIN, codexBrowserId: '' } } }) }, onDefault('a')),
]
