# nebi-prompting evals

- `triggers.md`: when the skill should and should not fire.
- `evals.json` and `fixtures/`: behavior cases for the brief it writes.
- Quality score: a blind A/B bench scores a changed SKILL.md against earlier versions on five frozen requests. It holds real requests, so it lives outside this public repo at `~/.agents/nebi/bench/nebi-prompting/` (its README has the one-command run). Run it before adopting a change to the skill's method.
