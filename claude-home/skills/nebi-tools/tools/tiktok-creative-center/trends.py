#!/usr/bin/env python3
"""TikTok Creative Center CLI, free and no key. Run with:
  ~/.agents/nebi/venv/bin/python trends.py <subcommand> ...
Subcommands: hashtags --region US --period 7
             videos --region US --period 7
Reads the SSR-embedded __MODERN_ROUTER_DATA__ JSON out of the public Trends
page HTML with a plain HTTP GET (urllib, Chrome UA). This route is real but
flaky under repeat requests (soft rate limit) — see the nebi-tools catalog for the
fallback ladder (browser tool -> scrape.py --mode dynamic) when it goes empty.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "https://ads.tiktok.com/creative/creativeCenter/trends/{tab}?region={region}&period={period}"
CHROME_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
RETRY_WAIT_SECONDS = 15
EMPTY_MESSAGE = "empty (soft rate limit) - use the browser route in the nebi-tools catalog"
ROUTER_DATA_RE = re.compile(
    r'<script type="application/json" id="__MODERN_ROUTER_DATA__">(.*?)</script>', re.S
)


def _fetch_html(url):
    req = urllib.request.Request(url, headers={"User-Agent": CHROME_UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, resp.read().decode("utf-8")


def _extract_queries(html):
    m = ROUTER_DATA_RE.search(html)
    if not m:
        return None
    obj = json.loads(m.group(1))
    page = obj.get("loaderData", {}).get("creativeCenter/trends/(tab)/page", {})
    return page.get("dehydratedState", {}).get("queries", [])


def _find_items(queries, key_substring):
    for q in queries or []:
        key = q.get("queryKey", [])
        if any(key_substring in str(part) for part in key):
            pages = q.get("state", {}).get("data", {}).get("pages", [])
            items = []
            for p in pages:
                items.extend(p.get("data", []) or [])
            return items
    return []


def _run(tab, key_substring, args):
    url = BASE_URL.format(tab=tab, region=args.region, period=args.period)
    for attempt in (1, 2):
        try:
            status, html = _fetch_html(url)
        except urllib.error.HTTPError as e:
            print(f"fetch failed: HTTP {e.code}", file=sys.stderr)
            sys.exit(1)
        except urllib.error.URLError as e:
            print(f"fetch failed: {e.reason}", file=sys.stderr)
            sys.exit(1)

        queries = _extract_queries(html)
        items = _find_items(queries, key_substring) if queries is not None else []
        if items:
            result = {"region": args.region, "period": args.period, "status": status, "row_count": len(items), "items": items}
            out = json.dumps(result, indent=2)
            print(out)
            if args.out:
                _save(args.out, tab, html, out)
            return

        if attempt == 1:
            print(f"attempt 1: no items, waiting {RETRY_WAIT_SECONDS}s then retrying once", file=sys.stderr)
            time.sleep(RETRY_WAIT_SECONDS)

    print(EMPTY_MESSAGE)
    if args.out:
        _save(args.out, tab, html, json.dumps({"region": args.region, "period": args.period, "status": status, "row_count": 0, "message": EMPTY_MESSAGE}, indent=2))


def _save(out_dir, tab, html, summary_json):
    raw_dir = Path(out_dir) / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    (raw_dir / f"{tab}-{ts}.html").write_text(html)
    (raw_dir / f"{tab}-{ts}.json").write_text(summary_json)
    print(f"saved: {raw_dir}/{tab}-{ts}.html and .json", file=sys.stderr)


def cmd_hashtags(args):
    _run("hashtag", "hashtag", args)


def cmd_videos(args):
    _run("video", "video", args)


def main():
    parser = argparse.ArgumentParser(description="TikTok Creative Center CLI (free, no key)")
    sub = parser.add_subparsers(dest="command", required=True)

    p1 = sub.add_parser("hashtags", help="trending hashtags for a region/period")
    p1.add_argument("--region", default="US", help="ISO-2 code; NL not supported, falls back to geo-IP (see the nebi-tools catalog)")
    p1.add_argument("--period", default="7", choices=["7", "30"])
    p1.add_argument("--out", help="save raw HTML+JSON under <dir>/raw/")

    p2 = sub.add_parser("videos", help="trending videos for a region/period")
    p2.add_argument("--region", default="US", help="ISO-2 code; NL not supported, falls back to geo-IP (see the nebi-tools catalog)")
    p2.add_argument("--period", default="7", choices=["7", "30"])
    p2.add_argument("--out", help="save raw HTML+JSON under <dir>/raw/")

    args = parser.parse_args()
    {"hashtags": cmd_hashtags, "videos": cmd_videos}[args.command](args)


if __name__ == "__main__":
    main()
