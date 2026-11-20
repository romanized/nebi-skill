#!/bin/sh
# Switch the TikHub MCP servers on or off for the current folder only (Claude Code local scope).
# Global servers list every tool name in every session (all 16 measured +33k tokens), so they stay off
# by default; the tikhub skill's REST helper reaches the same API at no standing cost.
# Usage: tikhub-mcp.sh on [platform ...]   default: instagram linkedin twitter reddit threads others tikhub
#        tikhub-mcp.sh off [platform ...]  default: every TikHub server in this folder
#        tikhub-mcp.sh list
# Platforms: tiktok douyin instagram xiaohongshu weibo others bilibili youtube kuaishou zhihu linkedin
#            reddit tikhub wechat twitter threads
# Restart Claude Code in the folder after switching. `on` copies TIKHUB_API_KEY from tools.env into this
# folder's server entries in ~/.claude.json (mode 600): Claude Code skips headersHelper for folders whose
# trust prompt was never accepted (bypass mode never shows it), and the servers then fail with a 404 on
# OAuth registration. After rotating the key, run `on` again.
set -eu
KEY=$(sed -n 's/^TIKHUB_API_KEY=//p' "$HOME/.agents/nebi/secrets/tools.env" | head -n 1)
ALL="tiktok douyin instagram xiaohongshu weibo others bilibili youtube kuaishou zhihu linkedin reddit tikhub wechat twitter threads"
DEFAULT="instagram linkedin twitter reddit threads others tikhub"
cmd=${1:-list}
[ $# -gt 0 ] && shift
case "$cmd" in
  on)
    [ -n "$KEY" ] || { echo "tikhub-mcp.sh: no TIKHUB_API_KEY in tools.env" >&2; exit 1; }
    for p in ${*:-$DEFAULT}; do
      case " $ALL " in *" $p "*) ;; *) echo "tikhub-mcp.sh: unknown platform '$p'" >&2; exit 1 ;; esac
      claude mcp remove -s local "tikhub-$p" >/dev/null 2>&1 || true
      claude mcp add -s local --transport http "tikhub-$p" "https://mcp.tikhub.io/$p/mcp" --header "Authorization: Bearer $KEY" >/dev/null
      echo "on: tikhub-$p"
    done
    echo "Restart Claude Code in $(pwd) to load them." ;;
  off)
    for p in ${*:-$ALL}; do
      claude mcp remove -s local "tikhub-$p" >/dev/null 2>&1 && echo "off: tikhub-$p"
    done
    true ;;
  list)
    claude mcp list 2>/dev/null | grep '^tikhub-' || echo "no TikHub MCP servers in $(pwd)" ;;
  *)
    echo "usage: tikhub-mcp.sh on|off|list [platform ...]" >&2; exit 1 ;;
esac
