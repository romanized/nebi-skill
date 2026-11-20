#!/usr/bin/env python3
"""Google Trends CLI, free and no key. Run with:
  ~/.agents/nebi/venv/bin/python trends.py <subcommand> ...
Subcommands: interest <kw> [--geo NL] [--timeframe "today 12-m"]
             related <kw> [--geo NL]
             trending [--geo NL]
             rss [--geo NL]
Uses the unofficial trendspy library for interest/related/trending, and a
stdlib fetch of the public daily-trends RSS feed for rss. See the nebi-tools catalog for
what each command answers and its limits.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

REFERER_HEADERS = {"referer": "https://www.google.com/"}
RSS_URL = "https://trends.google.com/trending/rss?geo={geo}"
CHROME_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
RETRY_WAIT_SECONDS = 20


def _save(out_dir, name, text, ext="json"):
    raw_dir = Path(out_dir) / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    path = raw_dir / f"{name}-{ts}.{ext}"
    path.write_text(text)
    print(f"saved: {path}", file=sys.stderr)


def _with_retry(fn, label):
    """Run fn(); on a quota/429-shaped error wait once then retry, else fail clearly."""
    try:
        return fn()
    except Exception as exc:
        if "429" not in str(exc) and "quota" not in str(exc).lower():
            raise
        print(f"{label}: quota/429 hit, waiting {RETRY_WAIT_SECONDS}s then retrying once ({exc})", file=sys.stderr)
        time.sleep(RETRY_WAIT_SECONDS)
        try:
            return fn()
        except Exception as exc2:
            print(
                f"{label} failed twice: {exc2}\n"
                "trendspy is an unofficial scraper; Google may be rate-limiting this IP. "
                "See the nebi-tools catalog for the SerpApi paid fallback.",
                file=sys.stderr,
            )
            sys.exit(1)


def cmd_interest(args):
    from trendspy import Trends

    df = _with_retry(
        lambda: Trends().interest_over_time(args.keyword, geo=args.geo, timeframe=args.timeframe, headers=REFERER_HEADERS),
        "interest_over_time",
    )
    rows = json.loads(df.reset_index().to_json(orient="records", date_format="iso"))
    result = {"keyword": args.keyword, "geo": args.geo, "timeframe": args.timeframe, "row_count": len(rows), "rows": rows}
    out = json.dumps(result, indent=2, default=str)
    print(out)
    if args.out:
        _save(args.out, "interest", out)


def cmd_related(args):
    from trendspy import Trends

    data = _with_retry(lambda: Trends().related_queries(args.keyword, geo=args.geo, headers=REFERER_HEADERS), "related_queries")
    result = {"keyword": args.keyword, "geo": args.geo}
    for key in ("top", "rising"):
        df = data.get(key)
        result[key] = json.loads(df.to_json(orient="records")) if df is not None else []
    out = json.dumps(result, indent=2, default=str)
    print(out)
    if args.out:
        _save(args.out, "related", out)


def cmd_trending(args):
    from trendspy import Trends

    trends = _with_retry(lambda: Trends().trending_now(geo=args.geo), "trending_now")
    items = [str(t) for t in trends]
    out = json.dumps({"geo": args.geo, "row_count": len(items), "items": items}, indent=2)
    print(out)
    if args.out:
        _save(args.out, "trending", out)


def cmd_rss(args):
    url = RSS_URL.format(geo=args.geo)
    req = urllib.request.Request(url, headers={"User-Agent": CHROME_UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status, body = resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        print(f"rss fetch failed: HTTP {e.code}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"rss fetch failed: {e.reason}", file=sys.stderr)
        sys.exit(1)

    ns = {"ht": "https://trends.google.com/trending/rss"}
    items = []
    for item in ET.fromstring(body).findall(".//item"):
        items.append({
            "title": item.findtext("title") or "",
            "approx_traffic": item.findtext("ht:approx_traffic", default="", namespaces=ns),
            "pub_date": item.findtext("pubDate") or "",
        })
    out = json.dumps({"geo": args.geo, "status": status, "row_count": len(items), "items": items}, indent=2)
    print(out)
    if args.out:
        _save(args.out, f"rss-{args.geo}", body, ext="xml")


def main():
    parser = argparse.ArgumentParser(description="Google Trends CLI (free, no key)")
    sub = parser.add_subparsers(dest="command", required=True)

    p1 = sub.add_parser("interest", help="interest-over-time for one keyword")
    p1.add_argument("keyword")
    p1.add_argument("--geo", default="", help="ISO-2 country code, e.g. NL, US (default: worldwide)")
    p1.add_argument("--timeframe", default="today 12-m", help='e.g. "today 12-m", "now 7-d"')
    p1.add_argument("--out", help="save raw JSON under <dir>/raw/")

    p2 = sub.add_parser("related", help="related queries (top + rising) for one keyword")
    p2.add_argument("keyword")
    p2.add_argument("--geo", default="", help="ISO-2 country code, e.g. NL, US")
    p2.add_argument("--out", help="save raw JSON under <dir>/raw/")

    p3 = sub.add_parser("trending", help="realtime trending-now terms")
    p3.add_argument("--geo", default="US", help="ISO-2 country code, e.g. NL, US")
    p3.add_argument("--out", help="save raw JSON under <dir>/raw/")

    p4 = sub.add_parser("rss", help="daily trends RSS feed, no library, stdlib only")
    p4.add_argument("--geo", default="US", help="ISO-2 country code, e.g. NL, US")
    p4.add_argument("--out", help="save raw XML under <dir>/raw/")

    args = parser.parse_args()
    {"interest": cmd_interest, "related": cmd_related, "trending": cmd_trending, "rss": cmd_rss}[args.command](args)


if __name__ == "__main__":
    main()
