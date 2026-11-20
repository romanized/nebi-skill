#!/usr/bin/env python3
"""Read-only bol Retailer API helper.

Reads BOL_CLIENT_ID and BOL_CLIENT_SECRET from the environment, or from
~/.agents/nebi/secrets/tools.env. Credentials and tokens are never printed.

Usage:
  bolapi.py check                          fetch an OAuth token only (free; proves the keys work)
  bolapi.py get <path> [--out FILE]        GET https://api.bol.com<path> (v10 JSON)
  bolapi.py export-offers <OUTFILE.csv>    request the offers export, wait for it, save the CSV
"""
import base64, json, os, sys, time, urllib.error, urllib.request

# The global key file (nebi-tools). Every project reads the same one.
ENV_PATH = os.path.expanduser('~/.agents/nebi/secrets/tools.env')
NAMES = ('BOL_CLIENT_ID', 'BOL_CLIENT_SECRET')
API = 'https://api.bol.com'
V10_JSON = 'application/vnd.retailer.v10+json'
V10_CSV = 'application/vnd.retailer.v10+csv'


def creds():
    env = {n: os.environ.get(n, '').strip() for n in NAMES}
    if not all(env.values()) and os.path.isfile(ENV_PATH):
        for line in open(ENV_PATH):
            name, sep, value = line.strip().partition('=')
            if sep and name.strip() in NAMES and not env[name.strip()]:
                env[name.strip()] = value.strip().strip('"').strip("'")
    if not all(env.values()):
        sys.exit(f'No BOL_CLIENT_ID / BOL_CLIENT_SECRET found (env or {ENV_PATH}).')
    return env['BOL_CLIENT_ID'], env['BOL_CLIENT_SECRET']


def token():
    cid, sec = creds()
    auth = base64.b64encode(f'{cid}:{sec}'.encode()).decode()
    req = urllib.request.Request('https://login.bol.com/token?grant_type=client_credentials', method='POST', data=b'',
                                 headers={'Authorization': 'Basic ' + auth, 'Accept': 'application/json',
                                          'Content-Type': 'application/x-www-form-urlencoded'})
    return json.loads(_OPENER.open(req, timeout=30).read())['access_token']


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """urllib re-sends Authorization on a redirect to any host; bol never needs one, so refuse it."""
    def redirect_request(self, *args, **kwargs):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def call(method, path, tok, accept=V10_JSON, body=None):
    headers = {'Authorization': 'Bearer ' + tok, 'Accept': accept}
    data = None
    if body is not None:
        headers['Content-Type'] = V10_JSON
        data = json.dumps(body).encode()
    if not path.startswith('/'):
        # a path like '@evil.com/x' would move the bearer token to another host
        sys.exit('path must start with /')
    req = urllib.request.Request(API + path, method=method, headers=headers, data=data)
    try:
        r = _OPENER.open(req, timeout=60)
        return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        # bol error bodies are problem+json without credentials; keep them short
        return e.code, e.read().decode('utf-8', 'replace')[:1500]


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ('-h', '--help'):
        print(__doc__); sys.exit(0)
    if len(sys.argv) == 2 and sys.argv[1] == 'check':
        token()
        print('bol token ok'); sys.exit(0)
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    cmd = sys.argv[1]
    tok = token()
    if cmd == 'get':
        status, text = call('GET', sys.argv[2], tok)
        out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
        if out:
            open(out, 'w').write(text)
            print(f'HTTP {status}, {len(text)} bytes saved to {out}')
        else:
            print(f'HTTP {status}'); print(text)
    elif cmd == 'export-offers':
        status, text = call('POST', '/retailer/offers/export', tok, body={'format': 'CSV'})
        print('export request HTTP', status)
        if status >= 300:
            print(text); sys.exit(1)
        pid = json.loads(text)['processStatusId']
        for _ in range(60):
            time.sleep(5)
            s, t = call('GET', f'/shared/process-status/{pid}', tok)
            d = json.loads(t)
            if d.get('status') == 'SUCCESS':
                rid = d['entityId']; break
            if d.get('status') in ('FAILURE', 'TIMEOUT'):
                print('export failed:', d.get('status'), d.get('errorMessage')); sys.exit(1)
        else:
            print('export still pending after 5 min'); sys.exit(1)
        s, csv = call('GET', f'/retailer/offers/export/{rid}', tok, accept=V10_CSV)
        open(sys.argv[2], 'w').write(csv)
        print(f'HTTP {s}, offers CSV saved to {sys.argv[2]} ({csv.count(chr(10))} lines)')
    else:
        print('read-only helper: only check, get and export-offers'); sys.exit(2)


if __name__ == '__main__':
    main()
