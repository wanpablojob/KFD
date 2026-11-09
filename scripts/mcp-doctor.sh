#!/usr/bin/env bash
#
# Diagnose the MCP servers OpenCode starts, in one command.
#
#   scripts/mcp-doctor.sh
#
# Why this exists: a session start once reported github, supabase, vercel and
# firebase as failed, all with `getaddrinfo ENOTFOUND` in the same second. That
# is not four broken servers and four broken tokens -- it is one DNS outage,
# most often the phone hotspot (resolver 172.20.10.1) dropping for a moment.
# Reading that out of `~/.local/share/opencode/log/opencode.log` takes minutes;
# this takes three seconds and says which layer broke:
#
#   DNS     the hostname does not resolve      -> network, not config
#   HTTP    resolves but the request fails     -> endpoint down or firewall
#   AUTH    HTTP 401/407                       -> expected; OpenCode holds the token
#   BIN     a local server binary is missing   -> run the npm install in
#                                                 scripts/mcp-server.sh
#
# Deliberately NOT part of scripts/verify.sh: it needs the network, and CI must
# stay deterministic. A gate that goes red because a hotspot blinked trains
# people to ignore the gate.
#
# Exit code is 1 when a layer is broken, so it can be used in a `if`.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/.opencode/node_modules/.bin"

FAILED=0
ok()   { printf '\033[32m  ok   \033[0m %s\n' "$1"; }
bad()  { FAILED=$((FAILED + 1)); printf '\033[31m  fail \033[0m %s\n' "$1"; shift; for l in "$@"; do printf '         %s\n' "$l"; done; }
info() { printf '\033[33m  note \033[0m %s\n' "$1"; }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Remote servers: name -> URL. Keep in step with the `mcp.servers` entries in
# .opencode/opencode.json and ~/.config/opencode/opencode.jsonc.
check_remote() {
  local name="$1" url="$2" host code
  host=$(printf '%s' "$url" | sed -E 's#^https?://##; s#/.*$##')
  if ! dscacheutil -q host -a name "$host" 2>/dev/null | grep -q '^name:'; then
    bad "$name -> DNS: $host does not resolve" \
        "The network is down or the resolver is not answering." \
        "Every remote MCP fails together when this happens; config is fine."
    return
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 -X POST "$url" \
           -H 'Content-Type: application/json' \
           -H 'Accept: application/json, text/event-stream' \
           -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"doctor","version":"1"}}}' 2>/dev/null)
  case "$code" in
    000) bad "$name -> HTTP: $url did not answer" "Resolves, so this is the endpoint or a firewall." ;;
    200|400|401|403|405|406) ok "$name -> $url ($code, reachable)" ;;
    *) bad "$name -> HTTP: $url returned $code" "Unexpected for an MCP handshake; check the endpoint." ;;
  esac
}

# Local servers: name -> argument to scripts/mcp-server.sh
check_local() {
  local name="$1" arg="$2" out
  out=$(printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"doctor","version":"1"}}}' \
        | "$ROOT/scripts/mcp-server.sh" "$arg" 2>/dev/null | head -c 400)
  if printf '%s' "$out" | grep -q '"result"'; then
    ok "$name -> answered initialize"
  else
    bad "$name -> did not answer initialize" \
        "If the binary below is missing, install the local copies:" \
        "  cd .opencode && npm install --save-exact --save-dev <package>" \
        "Otherwise the fallback ran 'npx', which needs the network."
  fi
}

section "Remote MCP servers (needs the network)"
check_remote github   https://api.githubcopilot.com/mcp/
check_remote supabase https://mcp.supabase.com/mcp
check_remote vercel   https://mcp.vercel.com
check_remote context7 https://mcp.context7.com/mcp

section "Local MCP servers (must work offline)"
for b in playwright-mcp context7-mcp firebase resend-mcp; do
  if [ -x "$BIN/$b" ]; then ok "binary $b"; else info "binary $b missing (falls back to npx, needs network)"; fi
done
check_local playwright playwright
check_local context7  context7

section "Verdict"
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32mAll reachable.\033[0m If OpenCode still shows a server as failed, run\n'
  printf '\033[1mopencode reload\033[0m -- the tool catalog is built at connect time, so a server\n'
  printf 'that failed during startup stays missing until the config is reloaded.\n'
else
  printf '\033[31m%s check(s) failed.\033[0m See the layer named above before editing any\n' "$FAILED"
  printf 'config -- a DNS failure is not a configuration failure.\n'
fi

exit $(( FAILED > 0 ))
