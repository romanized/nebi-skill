#!/usr/bin/env python3
"""Turn Claude Code sub-agent transcripts into traces for the single-agent-loop kit.

Usage:
    python3 traces.py [--days 30] [--projects ~/.claude/projects] [--out traces.jsonl]

Writes one JSON row per sub-agent call (trace_id = parent session id, timestamp,
agent = agentType from the sibling .meta.json) in the shape the kit's
coupling_map.py and chain_coverage.py read, plus a per-agent summary on stdout:
calls, sessions, model calls, effective input tokens (input + cache read + cache
write), output tokens and wall time.

Gotchas:
- ~/.claude-team/projects and ~/.claude-max2/projects symlink to ~/.claude/projects
  on this Mac, so one root covers every account. `find` without -L misses them.
- Model calls are counted by distinct message.id: one API response is split over
  several JSONL lines when it carries several content blocks.
- A transcript without a .meta.json (very old Claude Code) is reported as "unknown".
- Workflow agents sit deeper, under subagents/workflows/<run>/; they are included
  and show up under whatever agentType the workflow dispatched.
- Folders containing "-scratchpad-" are eval or test sessions and are skipped.
- Workflow agents' meta has no effort field, so effort is only meaningful on the
  agent-tool route (`route`).
- "in tok" is effective input summed over every model call of that agent, so it is
  dominated by cache reads (calls x context size), not by what the agent read once.
"""
import argparse
import json
import os
import statistics
import sys
import time
from collections import defaultdict
from datetime import datetime


def parse_ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def read_agent(path):
    meta_path = path[: -len(".jsonl")] + ".meta.json"
    meta = {}
    if os.path.exists(meta_path):
        try:
            meta = json.load(open(meta_path))
        except Exception:
            pass
    ids, first, last, session = {}, None, None, None
    for line in open(path, errors="replace"):
        try:
            d = json.loads(line)
        except Exception:
            continue
        ts = parse_ts(d.get("timestamp", "")) if d.get("timestamp") else None
        if ts:
            first = ts if first is None else min(first, ts)
            last = ts if last is None else max(last, ts)
        session = session or d.get("sessionId")
        m = d.get("message")
        if d.get("type") == "assistant" and isinstance(m, dict) and m.get("usage"):
            ids[m.get("id") or d.get("uuid")] = m["usage"]
    inp = sum(u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0)
              + u.get("cache_creation_input_tokens", 0) for u in ids.values())
    out = sum(u.get("output_tokens", 0) for u in ids.values())
    return {
        "trace_id": session,
        "timestamp": datetime.fromtimestamp(first).isoformat() if first else None,
        "agent": meta.get("agentType", "unknown"),
        "model": meta.get("model"),
        "effort": meta.get("effort"),
        "model_calls": len(ids),
        "input_tokens": inp,
        "output_tokens": out,
        "wall_s": round(last - first, 1) if first and last else None,
        "project": path.split("/projects/")[1].split("/")[0] if "/projects/" in path else None,
        "route": "workflow" if "/workflows/" in path else "agent-tool",
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=float, default=30)
    ap.add_argument("--projects", default=os.path.expanduser("~/.claude/projects"))
    ap.add_argument("--out", default="traces.jsonl")
    a = ap.parse_args()
    cutoff = time.time() - a.days * 86400

    rows, main_sessions = [], 0
    for root, dirs, files in os.walk(a.projects, followlinks=False):
        if "-scratchpad-" in root:
            continue
        for f in files:
            if not f.endswith(".jsonl"):
                continue
            p = os.path.join(root, f)
            if os.path.getmtime(p) < cutoff:
                continue
            if "/subagents/" in p:
                if f.startswith("agent-"):
                    rows.append(read_agent(p))
            else:
                main_sessions += 1

    rows.sort(key=lambda r: (r["trace_id"] or "", r["timestamp"] or ""))
    with open(a.out, "w") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")

    by = defaultdict(list)
    for r in rows:
        by[r["agent"]].append(r)
    total_in = sum(r["input_tokens"] for r in rows) or 1
    print(f"window {a.days:g} days | main sessions {main_sessions} | sub-agent calls {len(rows)} | sessions using any sub-agent {len({r['trace_id'] for r in rows})}")
    print(f"{'agent':<34}{'calls':>7}{'sess':>6}{'calls/agent med':>16}{'p90':>6}{'in tok med':>12}{'share of in':>12}{'>100 calls':>11}")
    for agent, rs in sorted(by.items(), key=lambda kv: -sum(r["input_tokens"] for r in kv[1])):
        mc = sorted(r["model_calls"] for r in rs)
        it = sorted(r["input_tokens"] for r in rs)
        p90 = mc[int(0.9 * (len(mc) - 1))]
        share = sum(it) / total_in
        runaway = sum(1 for r in rs if r["model_calls"] > 100)
        print(f"{agent[:33]:<34}{len(rs):>7}{len({r['trace_id'] for r in rs}):>6}{statistics.median(mc):>16.0f}{p90:>6}{statistics.median(it):>12,.0f}{share:>12.1%}{runaway:>11}")
    print(f"traces written to {a.out}")


if __name__ == "__main__":
    sys.exit(main())
