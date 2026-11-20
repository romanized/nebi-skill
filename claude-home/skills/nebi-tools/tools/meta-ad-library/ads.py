#!/usr/bin/env python3
"""Meta Ad Library CLI, free and no key. Run with:
  ~/.agents/nebi/venv/bin/python ads.py search <keyword> [--country NL] [--limit 10] [--out <dir>]
Fetches the public Ad Library search page with Scrapling's StealthyFetcher
(plain curl gets a 403 JS challenge, see the nebi-tools catalog) and pulls ad cards out of
the JSON embedded in the page HTML with regex — the page is too large and
irregular to fully json.loads(), so this reads only the fields listed below.
If Meta changes the page's internal structure, this script will start
returning zero ads even on a 200 status; check the nebi-tools catalog's fallback ladder.
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

SEARCH_URL = (
    "https://www.facebook.com/ads/library/?active_status={status}&ad_type=all"
    "&country={country}&is_targeted_country=false&media_type=all&q={q}&search_type=keyword_unordered"
)
AD_SPLIT_RE = re.compile(r'"ad_archive_id":"(\d+)"')
FIELD_RES = {
    "page_name": re.compile(r'"page_name":"((?:[^"\\]|\\.)*)"'),
    "page_id": re.compile(r'"page_id":"(\d+)"'),
    "is_active": re.compile(r'"is_active":(true|false)'),
    "start_date": re.compile(r'"start_date":(\d+)'),
    "cta_text": re.compile(r'"cta_text":"((?:[^"\\]|\\.)*)"'),
    "link_url": re.compile(r'"link_url":"((?:[^"\\]|\\.)*)"'),
    "title": re.compile(r'"title":"((?:[^"\\]|\\.)*)"'),
    "display_format": re.compile(r'"display_format":"((?:[^"\\]|\\.)*)"'),
}
PLATFORM_RE = re.compile(r'"publisher_platform":\[((?:"[A-Z_]+",?)+)\]')
COUNT_RE = re.compile(r'"search_results_connection":\{"count":(\d+)')


def _unescape(s):
    if s is None:
        return None
    try:
        return json.loads('"' + s + '"')
    except (json.JSONDecodeError, ValueError):
        return s.replace('\\/', '/')


def fetch_html(url):
    from scrapling.fetchers import StealthyFetcher

    page = StealthyFetcher.fetch(url, solve_cloudflare=True, headless=True)
    body = page.body if isinstance(page.body, str) else page.body.decode("utf-8", errors="replace")
    return page.status, body


def parse_ads(html, limit):
    ids = list(AD_SPLIT_RE.finditer(html))
    ads = []
    for i, m in enumerate(ids[:limit]):
        start = m.start()
        end = ids[i + 1].start() if i + 1 < len(ids) else min(len(html), start + 6000)
        chunk = html[start:end]
        ad = {"ad_archive_id": m.group(1)}
        for field, rx in FIELD_RES.items():
            fm = rx.search(chunk)
            ad[field] = _unescape(fm.group(1)) if fm else None
        if ad["is_active"] is not None:
            ad["is_active"] = ad["is_active"] == "true"
        if ad["start_date"]:
            ad["start_date"] = time.strftime("%Y-%m-%d", time.gmtime(int(ad["start_date"])))
        pm = PLATFORM_RE.search(chunk)
        ad["publisher_platforms"] = re.findall(r'"([A-Z_]+)"', pm.group(1)) if pm else []
        ads.append(ad)
    return ads


def cmd_search(args):
    url = SEARCH_URL.format(
        status=args.active_status,
        country=args.country,
        q=urllib.parse.quote(args.keyword),
    )
    status, html = fetch_html(url)
    count_m = COUNT_RE.search(html)
    ads = parse_ads(html, args.limit)
    result = {
        "url": url,
        "status": status,
        "total_results": int(count_m.group(1)) if count_m else None,
        "returned": len(ads),
        "ads": ads,
    }
    print(json.dumps(result, indent=2))
    if args.out:
        raw_dir = Path(args.out) / "raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        (raw_dir / f"meta-ads-{args.country}-{ts}.html").write_text(html)
        (raw_dir / f"meta-ads-{args.country}-{ts}.json").write_text(json.dumps(result, indent=2))
        print(f"saved: {raw_dir}/meta-ads-{args.country}-{ts}.html and .json", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Meta Ad Library CLI (free, no key, stealth-fetched)")
    sub = parser.add_subparsers(dest="command", required=True)

    p1 = sub.add_parser("search", help="keyword search across active/inactive ads in one country")
    p1.add_argument("keyword")
    p1.add_argument("--country", default="US", help="ISO-2 code, or ALL")
    p1.add_argument("--active-status", default="active", choices=["active", "inactive", "all"])
    p1.add_argument("--limit", type=int, default=10, help="max ad cards to parse out of the page")
    p1.add_argument("--out", help="save raw HTML+JSON under <dir>/raw/")

    args = parser.parse_args()
    {"search": cmd_search}[args.command](args)


if __name__ == "__main__":
    main()
