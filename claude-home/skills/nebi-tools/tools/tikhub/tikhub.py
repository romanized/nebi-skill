#!/usr/bin/env python3
"""TikHub REST helper. Run with:
  ~/.agents/nebi/venv/bin/python tikhub.py <subcommand> ...
Subcommands: whoami | price <endpoint-path> | get <endpoint-path> [--param k=v ...] [--out <dir>]
Reads TIKHUB_API_KEY from the environment, or from ~/.agents/nebi/secrets/tools.env.
Renew an expired/rejected key at https://user.tikhub.io
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://api.tikhub.io"
API_HOST = "api.tikhub.io"
RENEW_URL = "https://user.tikhub.io"


class _NoCrossHostRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse a redirect that would carry the Authorization header off API_HOST.

    urllib re-sends headers on redirect, so without this a TikHub-side 302 (or a
    crafted path) would hand the bearer token to whatever host it points at."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlparse(newurl).hostname != API_HOST:
            raise urllib.error.URLError(f"refusing cross-host redirect to {urllib.parse.urlparse(newurl).hostname}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_NoCrossHostRedirect)
# The global key file (nebi-tools). Every project reads the same one.
ENV_PATH = os.path.expanduser("~/.agents/nebi/secrets/tools.env")

def _load_api_key():
    key = os.environ.get("TIKHUB_API_KEY", "").strip()
    if key:
        return key
    if os.path.isfile(ENV_PATH):
        with open(ENV_PATH, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, _, value = line.partition("=")
                if name.strip() == "TIKHUB_API_KEY":
                    return value.strip().strip('"').strip("'")
    return ""

def _strip_headers(obj):
    """Drop any 'headers'/'authorization' field at any depth. TikHub error
    bodies echo the request headers (including the bearer) back; nothing
    that could carry the key may reach stdout, logs, or saved files."""
    if isinstance(obj, dict):
        return {k: _strip_headers(v) for k, v in obj.items()
                if k.lower() not in ("headers", "authorization")}
    if isinstance(obj, list):
        return [_strip_headers(v) for v in obj]
    return obj

def _request(path, params=None, api_key=None, body=None):
    """GET by default; pass body (a dict) to POST it as JSON.

    The /api/v1/tiktok/ads/ family (TikTok Creative Center data: trending hashtags,
    top ads, ad search) is POST-only — a GET there returns 405 Method Not Allowed."""
    url = BASE_URL + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    # `path` is caller-supplied (the `get` subcommand takes any endpoint), so a value
    # like ".evil.com/x" would build a URL on someone else's host and we would attach
    # the bearer token to it. Pin the host before the header goes on.
    if urllib.parse.urlparse(url).hostname != API_HOST:
        print(f"Refusing to send the API key to {urllib.parse.urlparse(url).hostname!r}; only {API_HOST} is allowed.")
        sys.exit(2)
    # TikHub sits behind Cloudflare, which blocks the default Python urllib
    # User-Agent (returns a plain-text "error code: 1010", not JSON) — send a
    # normal-looking one so the request reaches the actual API.
    headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "Mozilla/5.0 (compatible; tikhub.py/1.0)",
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, headers=headers, data=data)
    try:
        with _OPENER.open(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            body = {}
        return e.code, body

def _handle_error(status, body):
    safe = _strip_headers(body)
    detail = safe.get("detail") if isinstance(safe, dict) else None
    message = detail.get("message") if isinstance(detail, dict) else None
    if status in (401, 403):
        print(f"TikHub key rejected: {message or 'unauthorized'}. Renew at {RENEW_URL}")
    else:
        print(f"TikHub request failed ({status}): {json.dumps(detail if detail is not None else safe)}")
    sys.exit(1)

def cmd_whoami(args, api_key):
    status, body = _request("/api/v1/tikhub/user/get_user_info", api_key=api_key)
    if status != 200:
        _handle_error(status, body)
        return
    user = body.get("user_data", {})
    key_data = body.get("api_key_data", {})
    print(json.dumps({
        "balance_usd": user.get("balance"),
        "free_credit_usd": user.get("free_credit"),
        "api_key_scopes": key_data.get("api_key_scopes"),
        "expires_at": key_data.get("expires_at"),
        "api_key_status": key_data.get("api_key_status"),
    }, indent=2))

def cmd_price(args, api_key):
    status, body = _request(
        "/api/v1/tikhub/user/get_endpoint_info",
        params={"endpoint": args.endpoint},
        api_key=api_key,
    )
    if status != 200:
        _handle_error(status, body)
        return
    print(json.dumps(body.get("data", body), indent=2))

def cmd_get(args, api_key):
    params = {}
    for p in args.param or []:
        if "=" not in p:
            print(f"--param must be k=v, got: {p}")
            sys.exit(2)
        k, _, v = p.partition("=")
        params[k] = v
    status, body = _request(args.endpoint, params=params, api_key=api_key)
    if status != 200:
        _handle_error(status, body)
        return
    print(json.dumps(body, indent=2))
    if args.out:
        raw_dir = os.path.join(args.out, "raw")
        os.makedirs(raw_dir, exist_ok=True)
        slug = args.endpoint.strip("/").replace("/", "_")
        out_path = os.path.join(raw_dir, f"{slug}-{int(time.time())}.json")
        with open(out_path, "w") as f:
            json.dump(body, f, indent=2)
        print(f"saved: {out_path}", file=sys.stderr)

def cmd_post(args, api_key):
    """POST a JSON body. Needed for /api/v1/tiktok/ads/* — the Creative Center family."""
    body = {}
    for p in args.param or []:
        if "=" not in p:
            print(f"--param must be k=v, got: {p}")
            sys.exit(2)
        k, _, v = p.partition("=")
        # The ads endpoints type-check their body: country_code is a string but
        # page/limit/time_range are integers, and a quoted "20" is rejected.
        if v.lstrip("-").isdigit():
            body[k] = int(v)
        elif v.lower() in ("true", "false"):
            body[k] = v.lower() == "true"
        else:
            body[k] = v
    status, resp = _request(args.endpoint, api_key=api_key, body=body)
    if status != 200:
        _handle_error(status, resp)
        return
    print(json.dumps(resp, indent=2))
    if args.out:
        raw_dir = os.path.join(args.out, "raw")
        os.makedirs(raw_dir, exist_ok=True)
        slug = args.endpoint.strip("/").replace("/", "_")
        out_path = os.path.join(raw_dir, f"{slug}-{int(time.time())}.json")
        with open(out_path, "w") as f:
            json.dump(resp, f, indent=2)
        print(f"saved: {out_path}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="TikHub REST helper")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("whoami", help="balance + scopes + expiry for the current key")

    p_price = sub.add_parser("price", help="listed cost for one endpoint")
    p_price.add_argument("endpoint", help="e.g. /api/v1/tiktok/app/v3/fetch_video_search_result")

    p_get = sub.add_parser("get", help="generic GET against any TikHub endpoint")
    p_get.add_argument("endpoint")
    p_get.add_argument("--param", action="append", help="k=v, repeatable")
    p_get.add_argument("--out", help="save raw JSON under <dir>/raw/")

    p_post = sub.add_parser("post", help="POST against a TikHub endpoint (needed for /tiktok/ads/*)")
    p_post.add_argument("endpoint")
    p_post.add_argument("--param", action="append", help="k=v, repeatable; digits become ints")
    p_post.add_argument("--out", help="save raw JSON under <dir>/raw/")

    args = parser.parse_args()
    api_key = _load_api_key()
    if not api_key:
        print(f"No TIKHUB_API_KEY found (env or {ENV_PATH}). Get one at {RENEW_URL}")
        sys.exit(1)

    {"whoami": cmd_whoami, "price": cmd_price, "get": cmd_get, "post": cmd_post}[args.command](args, api_key)

if __name__ == "__main__":
    main()
