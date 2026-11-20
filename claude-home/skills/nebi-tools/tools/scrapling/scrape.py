#!/usr/bin/env python3
"""Fetch a URL with Scrapling and print a JSON summary.

Run with: ~/.agents/nebi/venv/bin/python scrape.py <url> [options]
Modes: plain (Fetcher.get, fast, try first) -> stealth (StealthyFetcher, Cloudflare
solver, ~60-90s) -> dynamic (StealthyFetcher waiting for the network to settle, full browser/JS;
Scrapling 0.5 removed DynamicFetcher). If all three fail, use
the Claude browser tool, then record the URL as blocked. See the nebi-tools catalog.
"""
import argparse
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

MODE_HELP = (
    "plain=Fetcher.get (default, fast, no browser) | stealth=StealthyFetcher "
    "(Chromium, solves Cloudflare Turnstile, ~60-90s) | dynamic=StealthyFetcher, network idle "
    "(full browser automation for JS/interaction)"
)


def parse_args():
    p = argparse.ArgumentParser(
        prog="scrape.py",
        description="Fetch a URL with Scrapling and print a JSON summary.",
        epilog="Fallback ladder: plain -> stealth -> dynamic -> Claude browser tool -> record as blocked.",
    )
    p.add_argument("url", help="URL to fetch")
    p.add_argument("--mode", choices=["plain", "stealth", "dynamic"], default="plain", help=MODE_HELP)
    p.add_argument("--css", help='CSS selector to extract, e.g. "h3 a::attr(title)"')
    p.add_argument("--json", action="store_true", help="parse body as JSON (e.g. Shopify /products.json) and summarize")
    p.add_argument("--out", help="directory to save the raw body under <dir>/raw/")
    args = p.parse_args()
    # Only http(s). Without this, file:// (and ftp://, data:) turn this script into a
    # local-file reader: a page we scrape can instruct an agent to run us against
    # file:///.../.env and the secret comes back on stdout and into --out.
    if urlparse(args.url).scheme not in ("http", "https"):
        p.error(f"url must be http or https, got {urlparse(args.url).scheme or 'no scheme'!r}")
    return args


def fetch(url, mode):
    if mode == "plain":
        from scrapling.fetchers import Fetcher
        return Fetcher.get(url)
    if mode == "stealth":
        from scrapling.fetchers import StealthyFetcher
        return StealthyFetcher.fetch(url, solve_cloudflare=True, headless=True)
    # Scrapling 0.5 folded the dynamic fetcher into the stealthy one: same browser, no Cloudflare
    # solve, and it waits until the page's own requests have settled.
    from scrapling.fetchers import StealthyFetcher
    return StealthyFetcher.fetch(url, headless=True, network_idle=True)


def save_raw(out_dir, url, body, ext):
    host = urlparse(url).netloc.replace(":", "_")
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    raw_dir = Path(out_dir) / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / f"{host}-{ts}.{ext}"
    path.write_bytes(body if isinstance(body, (bytes, bytearray)) else body.encode("utf-8"))
    return str(path)


def summarize_json(data, result):
    if isinstance(data, dict):
        result["json_keys"] = list(data.keys())
        products = data.get("products")
        if isinstance(products, list):
            result["count"] = len(products)
            result["items"] = [
                {"title": pr.get("title"), "price": (pr.get("variants") or [{}])[0].get("price")}
                for pr in products[:5]
            ]
    elif isinstance(data, list):
        result["count"] = len(data)


def main():
    args = parse_args()
    result = {"url": args.url, "mode": args.mode}
    try:
        page = fetch(args.url, args.mode)
    except Exception as exc:
        result.update(status=None, error=str(exc))
        print(json.dumps(result, indent=2))
        sys.exit(1)

    result["status"] = page.status
    body_text = page.body if isinstance(page.body, str) else page.body.decode("utf-8", errors="replace")

    if args.json:
        try:
            summarize_json(json.loads(body_text), result)
        except json.JSONDecodeError as exc:
            result["error"] = f"body is not valid JSON: {exc}"
        if args.out:
            result["saved"] = save_raw(args.out, args.url, body_text, "json")
    elif args.css:
        result["items"] = page.css(args.css).getall()
        if args.out:
            result["saved"] = save_raw(args.out, args.url, body_text, "html")
    else:
        result["text_length"] = len(body_text)
        if args.out:
            result["saved"] = save_raw(args.out, args.url, body_text, "html")

    print(json.dumps(result, indent=2))
    sys.exit(0 if "error" not in result else 1)


if __name__ == "__main__":
    main()
