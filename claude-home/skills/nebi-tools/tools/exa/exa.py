#!/usr/bin/env python3
"""Exa API with a spend ledger and a hard budget. Run with:
  ~/.agents/nebi/venv/bin/python exa.py <subcommand> ...

Subcommands:
  search "<query>" [--n N] [--type auto|lite|deep-lite|deep] [--category company|people|news|...]
                   [--include-domains a.com,b.com] [--exclude-domains ...] [--text N | --no-highlights]
                   [--extra '<json merged into the body>'] [--out <dir>]
  contents <url> [<url> ...] [--text N] [--subpages N] [--subpage-target a,b] [--extra '<json>'] [--out <dir>]
  agent "<query>" [--effort auto|low|medium|high|xhigh|ultra|minimal] [--max-cost USD]
                  [--schema <file.json>] [--exclude <file.json>] [--data <file.json>] [--previous <run_id>]
                  [--wait-seconds N] [--out <dir>]
  agent-status <run_id> [--wait-seconds N] [--out <dir>]   polls a run you already started; no new spend
  ledger                                                   spend so far, by tag

Every response is printed as JSON on stdout; --out also saves it. Exa reports the real price
of each call in `costDollars`, and that number is what the ledger records.

Environment:
  EXA_API_KEY     read from the environment, else from ~/.agents/nebi/secrets/tools.env
  EXA_LEDGER      ledger file (JSONL), default ~/.agents/nebi/exa/ledger.jsonl. Point each job at its own.
  EXA_BUDGET_USD  hard cap for this ledger. New calls are refused once spend reaches it.
  EXA_TAG_BUDGET_USD  per-lane cap: calls are refused once this tag's own spend reaches it, so
                  parallel lanes can share one ledger (and its EXA_BUDGET_USD) with a cap each.
  EXA_SOFT_USD    soft cap: past it every call prints a warning on stderr. Only a warning; the
                  stops are EXA_BUDGET_USD and EXA_TAG_BUDGET_USD.
  EXA_TAG         label for the ledger rows (a lane or agent name); `--tag` overrides it and goes
                  before the subcommand: exa.py --tag lane-a search "..."

Gotchas:
  - The cap is checked before each call, so parallel agents can overshoot it by the calls
    already in flight: about a cent per search, up to --max-cost per agent run.
  - An agent run is booked at its --max-cost when it starts and settled at its real cost when
    it ends. If this process dies while waiting, run `agent-status <run_id>` to settle it;
    until then the ledger counts the full reservation.
  - --max-cost applies only to the `auto` and `ultra` efforts (Exa's rule, $1 to $100).
    Fixed efforts bill a flat price, so the tool only checks the cap is not already reached.
  - Calls made through the Exa MCP server never reach this ledger; they show only on
    dashboard.exa.ai.
  - Websets are deprecated by Exa; list-building goes through `agent`. /findSimilar is
    deprecated too: run `contents` on the seed page, then `search` with what you learned.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://api.exa.ai"
API_HOST = "api.exa.ai"
ENV_PATH = os.path.expanduser("~/.agents/nebi/secrets/tools.env")
DEFAULT_LEDGER = os.path.expanduser("~/.agents/nebi/exa/ledger.jsonl")
TERMINAL = {"completed", "failed", "cancelled"}


class _NoCrossHostRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse a redirect that would carry the x-api-key header off API_HOST."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlparse(newurl).hostname != API_HOST:
            raise urllib.error.URLError(f"refusing cross-host redirect to {urllib.parse.urlparse(newurl).hostname}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_NoCrossHostRedirect)


def _die(msg, code=1):
    print(f"exa.py: {msg}", file=sys.stderr)
    sys.exit(code)


def _load_api_key():
    key = os.environ.get("EXA_API_KEY", "").strip()
    if key:
        return key
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH) as fh:
            for line in fh:
                if line.startswith("EXA_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    _die(f"no EXA_API_KEY in the environment or {ENV_PATH}")


# ---------- ledger ----------

def _ledger_path():
    return os.path.expanduser(os.environ.get("EXA_LEDGER", DEFAULT_LEDGER))


def _read_ledger():
    path = _ledger_path()
    rows = []
    if os.path.exists(path):
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return rows


def _spent(rows=None, tag=None):
    """Settled costs, plus the reservation of every agent run not yet settled. tag limits it to one lane."""
    rows = _read_ledger() if rows is None else rows
    settled = {r["run_id"] for r in rows if r.get("kind") == "agent-settle" and r.get("run_id")}
    total = 0.0
    for r in rows:
        if tag is not None and (r.get("tag") or "") != tag:
            continue
        if r.get("kind") == "agent-reserve":
            if r.get("run_id") not in settled:
                total += float(r.get("cost", 0))
        else:
            total += float(r.get("cost", 0))
    return round(total, 4)


def _append(row):
    path = _ledger_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    row = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), **row}
    # One short line per write with O_APPEND, so parallel agents do not interleave rows.
    with open(path, "a") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def _budget():
    raw = os.environ.get("EXA_BUDGET_USD", "").strip()
    return float(raw) if raw else None


def _check_budget(tag=""):
    """Refuse when the ledger cap or this lane's cap is reached. Returns dollars left under the
    tighter of the two, or None when no cap is set."""
    rows = _read_ledger()
    spent = _spent(rows)
    hard = _budget()
    left = None
    if hard is not None:
        if spent >= hard - 1e-9:
            _die(f"budget reached: ${spent:.3f} spent of ${hard:.3f} (EXA_BUDGET_USD, ledger {_ledger_path()}). "
                 "Raise the cap only with the user's yes.", code=3)
        left = hard - spent
    tag_cap = os.environ.get("EXA_TAG_BUDGET_USD", "").strip()
    if tag_cap and tag:
        tag_spent = _spent(rows, tag)
        if tag_spent >= float(tag_cap) - 1e-9:
            _die(f"lane budget reached: tag '{tag}' spent ${tag_spent:.3f} of ${float(tag_cap):.3f} "
                 "(EXA_TAG_BUDGET_USD). Report back to the lead instead of working around it.", code=3)
        tag_left = float(tag_cap) - tag_spent
        left = tag_left if left is None else min(left, tag_left)
    soft = os.environ.get("EXA_SOFT_USD", "").strip()
    if soft and spent >= float(soft):
        print(f"exa.py: warning: ${spent:.3f} spent, past the soft cap ${float(soft):.2f}", file=sys.stderr)
    return left


def _cost_of(resp):
    c = resp.get("costDollars") if isinstance(resp, dict) else None
    if isinstance(c, dict):
        return float(c.get("total", 0) or 0)
    if isinstance(c, (int, float)):
        return float(c)
    return 0.0


# ---------- http ----------

def _request(method, path, body=None):
    url = BASE_URL + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "x-api-key": _load_api_key(),
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "nebi-tools-exa/1.0",
    })
    try:
        with _OPENER.open(req, timeout=120) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:800]
        _die(f"HTTP {e.code} on {method} {path}: {detail}", code=2)
    except urllib.error.URLError as e:
        _die(f"network error on {method} {path}: {e.reason}", code=2)


def _emit(resp, out_dir, name):
    text = json.dumps(resp, ensure_ascii=False, indent=1)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f"{time.strftime('%Y%m%d-%H%M%S')}-{name}.json")
        with open(path, "w") as fh:
            fh.write(text)
        print(f"exa.py: saved {path}", file=sys.stderr)
    print(text)


def _tag(args):
    return args.tag or os.environ.get("EXA_TAG", "")


def _extra(args):
    if not getattr(args, "extra", None):
        return {}
    try:
        return json.loads(args.extra)
    except json.JSONDecodeError as e:
        _die(f"--extra is not JSON: {e}")


def _load_json_file(path):
    with open(path) as fh:
        return json.load(fh)


# ---------- commands ----------

def cmd_search(args):
    _check_budget(_tag(args))
    body = {"query": args.query, "type": args.type}
    if args.n:
        body["numResults"] = args.n
    if args.category:
        body["category"] = args.category
    if args.include_domains:
        body["includeDomains"] = [d.strip() for d in args.include_domains.split(",") if d.strip()]
    if args.exclude_domains:
        body["excludeDomains"] = [d.strip() for d in args.exclude_domains.split(",") if d.strip()]
    if args.text:
        body["contents"] = {"text": {"maxCharacters": args.text}}
    elif not args.no_highlights:
        body["contents"] = {"highlights": True}
    body.update(_extra(args))
    resp = _request("POST", "/search", body)
    _append({"kind": "search", "tag": _tag(args), "cost": _cost_of(resp), "query": args.query[:200],
             "results": len(resp.get("results", []))})
    _emit(resp, args.out, "search")


def cmd_contents(args):
    _check_budget(_tag(args))
    body = {"urls": args.urls}
    if args.text:
        body["text"] = {"maxCharacters": args.text}
    else:
        body["highlights"] = True
    if args.subpages:
        body["subpages"] = args.subpages
    if args.subpage_target:
        body["subpageTarget"] = [t.strip() for t in args.subpage_target.split(",") if t.strip()]
    body.update(_extra(args))
    resp = _request("POST", "/contents", body)
    _append({"kind": "contents", "tag": _tag(args), "cost": _cost_of(resp), "urls": args.urls[:5],
             "results": len(resp.get("results", []))})
    _emit(resp, args.out, "contents")


def _wait(run_id, wait_seconds):
    deadline = time.time() + wait_seconds
    run = _request("GET", f"/agent/runs/{run_id}")
    while run.get("status") not in TERMINAL and time.time() < deadline:
        time.sleep(5)
        run = _request("GET", f"/agent/runs/{run_id}")
    return run


def _settle(run, tag):
    if run.get("status") in TERMINAL:
        rows = _read_ledger()
        if not any(r.get("kind") == "agent-settle" and r.get("run_id") == run.get("id") for r in rows):
            _append({"kind": "agent-settle", "tag": tag, "run_id": run.get("id"), "cost": _cost_of(run),
                     "status": run.get("status"), "stopReason": run.get("stopReason")})
    else:
        print(f"exa.py: run {run.get('id')} still {run.get('status')}; settle it later with "
              f"`exa.py agent-status {run.get('id')}`", file=sys.stderr)


def cmd_agent(args):
    metered = args.effort in ("auto", "ultra")
    reserve = 0.0
    body = {"query": args.query, "effort": args.effort}
    if metered:
        left = _check_budget(_tag(args))
        cap = args.max_cost if left is None else min(args.max_cost, left)
        if cap < 1:
            _die(f"only ${max(cap, 0):.2f} left under the budget; an auto/ultra run needs at least $1", code=3)
        body["budget"] = {"maxCostDollars": round(cap, 2)}
        reserve = round(cap, 2)
    else:
        _check_budget(_tag(args))
    if args.schema:
        body["outputSchema"] = _load_json_file(args.schema)
    if args.exclude or args.data:
        body["input"] = {}
        if args.data:
            body["input"]["data"] = _load_json_file(args.data)
        if args.exclude:
            body["input"]["exclusion"] = _load_json_file(args.exclude)
    if args.previous:
        body["previousRunId"] = args.previous
    run = _request("POST", "/agent/runs", body)
    run_id = run.get("id")
    if not run_id:
        _die(f"no run id in the create response: {json.dumps(run)[:500]}", code=2)
    _append({"kind": "agent-reserve", "tag": _tag(args), "run_id": run_id, "cost": reserve,
             "effort": args.effort, "query": args.query[:200]})
    print(f"exa.py: started {run_id} (reserved ${reserve:.2f})", file=sys.stderr)
    run = _wait(run_id, args.wait_seconds)
    _settle(run, _tag(args))
    _emit(run, args.out, f"agent-{run_id}")


def cmd_agent_status(args):
    run = _wait(args.run_id, args.wait_seconds)
    _settle(run, _tag(args))
    _emit(run, args.out, f"agent-{args.run_id}")


def cmd_ledger(args):
    rows = _read_ledger()
    by_tag = {}
    settled = {r["run_id"] for r in rows if r.get("kind") == "agent-settle"}
    for r in rows:
        if r.get("kind") == "agent-reserve" and r.get("run_id") in settled:
            continue
        t = r.get("tag") or "(none)"
        by_tag[t] = round(by_tag.get(t, 0.0) + float(r.get("cost", 0)), 4)
    open_runs = [r["run_id"] for r in rows if r.get("kind") == "agent-reserve" and r.get("run_id") not in settled]
    print(json.dumps({"ledger": _ledger_path(), "spent": _spent(rows), "budget": _budget(),
                      "soft": os.environ.get("EXA_SOFT_USD") or None, "calls": len(rows),
                      "by_tag": by_tag, "unsettled_runs": open_runs}, indent=1))


def main():
    p = argparse.ArgumentParser(description="Exa API with a spend ledger and a hard budget.")
    p.add_argument("--tag", help="ledger label for this call (default $EXA_TAG)")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("search")
    s.add_argument("query")
    s.add_argument("--n", type=int)
    s.add_argument("--type", default="auto", choices=["auto", "lite", "deep-lite", "deep"])
    s.add_argument("--category")
    s.add_argument("--include-domains")
    s.add_argument("--exclude-domains")
    s.add_argument("--text", type=int, metavar="MAX_CHARS", help="full text capped at MAX_CHARS instead of highlights")
    s.add_argument("--no-highlights", action="store_true")
    s.add_argument("--extra")
    s.add_argument("--out")

    c = sub.add_parser("contents")
    c.add_argument("urls", nargs="+")
    c.add_argument("--text", type=int, metavar="MAX_CHARS")
    c.add_argument("--subpages", type=int)
    c.add_argument("--subpage-target")
    c.add_argument("--extra")
    c.add_argument("--out")

    a = sub.add_parser("agent")
    a.add_argument("query")
    a.add_argument("--effort", default="auto", choices=["minimal", "low", "medium", "high", "xhigh", "auto", "ultra"])
    a.add_argument("--max-cost", type=float, default=1.0, help="USD ceiling for auto/ultra runs (default 1, Exa's minimum)")
    a.add_argument("--schema")
    a.add_argument("--exclude")
    a.add_argument("--data")
    a.add_argument("--previous")
    a.add_argument("--wait-seconds", type=int, default=900)
    a.add_argument("--out")

    st = sub.add_parser("agent-status")
    st.add_argument("run_id")
    st.add_argument("--wait-seconds", type=int, default=0)
    st.add_argument("--out")

    sub.add_parser("ledger")

    args = p.parse_args()
    {"search": cmd_search, "contents": cmd_contents, "agent": cmd_agent,
     "agent-status": cmd_agent_status, "ledger": cmd_ledger}[args.command](args)


if __name__ == "__main__":
    main()
