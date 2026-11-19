import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { classify, redact } from '../claude-home/hooks/feedback-capture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nebi-feedback-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function submit(home, prompt, env = {}, session = 's1') {
  const target = pathToFileURL(path.join(root, 'claude-home/hooks/feedback-capture.mjs')).href;
  const bootstrap = [
    "import os from 'node:os';",
    "import { syncBuiltinESMExports } from 'node:module';",
    `os.homedir = () => ${JSON.stringify(home)};`,
    'syncBuiltinESMExports();',
    `process.argv[1] = ${JSON.stringify(fileURLToPath(target))};`,
    `await import(${JSON.stringify(target)});`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', bootstrap], {
    input: JSON.stringify({ session_id: session, cwd: '/work/shop', prompt }), encoding: 'utf8',
    env: { ...process.env, NEBI_FEEDBACK_CAPTURE: '', ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', 'capture must add nothing to the model context');
}

test('catches complaints about agent behavior and dropped ideas', () => {
  for (const text of [
    'why did you take inspiration instead of installing it?',
    'I already told you to use the marketingskills repo',
    "that's not what I asked",
    'you keep ignoring the skill I named',
    'still not fixed, same bug',
    'waarom heb je dat niet geïnstalleerd',
    'what have you really updated from the skills on the inspiration',
    'you ruined the layout, it was better before',
    'stop asking me, do it yourself',
    'this reads like AI slop again',
  ]) assert.equal(classify(text), 'complaint', text);
  assert.equal(classify('install this https://github.com/kajisho5/ffmpeg-skill please'), 'named');
  assert.equal(classify('Please integrate kajisho5/ffmpeg-skill.'), 'named');
  assert.equal(classify('add src/components to the page'), null);
  assert.equal(classify('install the deps listed in src/app.ts'), null);
  assert.equal(classify(`${'thinking out loud about the store '.repeat(60)}\nand again you ignored the skill I named`), 'complaint');
  for (const text of ['idea: a dashboard for skill freshness', 'it would be nice if the statusline showed the register']) {
    assert.equal(classify(text), 'idea', text);
  }
});

test('ignores ordinary instructions, commands, quotes and pasted briefs', () => {
  for (const text of [
    'add a hero section to the landing page',
    'run the tests again',
    '/sharpen make this better',
    'wtf is shopify doing with this api',
    'read https://github.com/some/repo and summarize the readme',
    'make sure you never commit .env',
    'you keep the header as it is',
    'why do you think the build fails?',
    'run it one more time',
    'still not sure which color fits',
    'write the launch copy, and no AI slop in it',
    '## Goal\nFix six issues; the text is too much text right now\n## Constraints\nkeep the theme',
    `## Brief\n${'context '.repeat(120)}\nwhy did you pick this vendor last year\n${'details '.repeat(120)}`,
    '> why did you do this\nthat was the old reviewer comment, summarize it',
    '```\nError: why did you fail\n```\nfix this',
  ]) assert.equal(classify(text), null, text);
});

test('writes one redacted inbox line per complaint and skips an immediate repeat', () => {
  const home = path.join(temp, 'home');
  submit(home, 'why did you skip it? my key is sk-abcdefghijklmnop1234 and mail me@example.com');
  submit(home, 'why did you skip it? my key is sk-abcdefghijklmnop1234 and mail me@example.com');
  submit(home, 'deploy the theme');
  const inbox = path.join(home, '.agents/nebi/feedback/inbox.jsonl');
  const lines = fs.readFileSync(inbox, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'complaint');
  assert.equal(lines[0].harness, 'claude');
  assert.equal(lines[0].cwd, '/work/shop');
  assert.match(lines[0].text, /\[secret\]/);
  assert.match(lines[0].text, /\[email\]/);
  assert.doesNotMatch(lines[0].text, /sk-abcdef|me@example/);
});

test('the Stop hook records agent concessions once, and nothing for ordinary replies', () => {
  const home = path.join(temp, 'stop-home');
  const stop = pathToFileURL(path.join(root, 'claude-home/hooks/verify-before-stop.mjs')).href;
  const runStop = (message) => {
    const bootstrap = [
      "import os from 'node:os';",
      "import { syncBuiltinESMExports } from 'node:module';",
      `os.homedir = () => ${JSON.stringify(home)};`,
      'syncBuiltinESMExports();',
      'process.exit = (code = 0) => { process.exitCode = code; };',
      `await import(${JSON.stringify(stop)});`,
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', bootstrap], {
      input: JSON.stringify({ session_id: 's2', cwd: '/work/site', last_assistant_message: message }), encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  };
  runStop("You're right — I skipped the skill you named. Installing it now.\nMore detail.");
  runStop('Here is the updated hero section.');
  const lines = fs.readFileSync(path.join(home, '.agents/nebi/feedback/inbox.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map((l) => [l.kind, l.text]), [['concession', "You're right — I skipped the skill you named. Installing it now."]]);
});

test('redaction keeps repo links whole and masks keys and phone numbers, not dates', () => {
  const text = redact('integrate https://github.com/coreyhaines31/marketingskills and skills.sh/anthropics/skills today 2026-09-22; key AKIAABCDEFGHIJKLMNOP; call +31 6 12345678 or 0612345678');
  assert.match(text, /https:\/\/github\.com\/coreyhaines31\/marketingskills/);
  assert.match(text, /skills\.sh\/anthropics\/skills/);
  assert.match(text, /2026-09-22/);
  assert.doesNotMatch(text, /AKIA|12345678/);
});

test('named repos keep their links, the inbox is owner-only, and the opt-out writes nothing', () => {
  const home = path.join(temp, 'links-home');
  submit(home, 'please install https://github.com/coreyhaines31/marketingskills for the stores');
  const inbox = path.join(home, '.agents/nebi/feedback/inbox.jsonl');
  const [line] = fs.readFileSync(inbox, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(line.kind, 'named');
  assert.deepEqual(line.links, ['https://github.com/coreyhaines31/marketingskills']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(inbox).mode & 0o777, 0o600);
  const quiet = path.join(temp, 'quiet-home');
  submit(quiet, 'why did you skip it?', { NEBI_FEEDBACK_CAPTURE: 'off' });
  assert.equal(fs.existsSync(path.join(quiet, '.agents/nebi/feedback/inbox.jsonl')), false);
});

test('links survive truncation, bare repos are kept, and only same-session repeats are dropped', () => {
  const home = path.join(temp, 'long-home');
  const long = `${'We talked about the store setup and what the landing page needs. '.repeat(9)}Please integrate kajisho5/ffmpeg-skill and https://github.com/coreyhaines31/marketingskills`;
  assert.ok(long.length > 600);
  submit(home, long);
  submit(home, 'why did you skip it?');
  submit(home, 'why did you skip it?');
  submit(home, 'why did you skip it?', {}, 'other-session');
  const lines = fs.readFileSync(path.join(home, '.agents/nebi/feedback/inbox.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines[0].links, ['https://github.com/coreyhaines31/marketingskills', 'kajisho5/ffmpeg-skill']);
  assert.equal(lines.filter((l) => l.text === 'why did you skip it?').length, 2);
});

test('a plugin sidecall (TE_SIDECALL=1) captures nothing', () => {
  const home = path.join(temp, 'sidecall');
  submit(home, "that's not what I asked", { TE_SIDECALL: '1' });
  assert.equal(fs.existsSync(path.join(home, '.agents/nebi/feedback/inbox.jsonl')), false);
});

test('harness-injected notifications and reminders are not the user\'s words', () => {
  const note = '<task-notification>\n<status>completed</status>\n<result>You didn\'t run the tests; why did you skip them?</result>\n</task-notification>';
  const reminder = '<system-reminder>that\'s not what I asked, still broken</system-reminder>';
  assert.equal(classify(note), null);
  assert.equal(classify(`${note}\n${reminder}`), null);
  assert.equal(classify(`${note}\nI already told you to keep the header`), 'complaint');
  const home = path.join(temp, 'notification-home');
  submit(home, note);
  const inbox = path.join(home, '.agents/nebi/feedback/inbox.jsonl');
  assert.equal(fs.existsSync(inbox), false, 'a pure notification is never captured');
  submit(home, `${note}\nI already told you to keep the header`);
  const [line] = fs.readFileSync(inbox, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(line.text, 'I already told you to keep the header');
});
