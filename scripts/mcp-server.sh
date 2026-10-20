#!/usr/bin/env bash
#
# Launch an MCP server for OpenCode.
#
#   scripts/mcp-server.sh playwright
#   scripts/mcp-server.sh context7
#
# Why this exists: both servers were configured as `npx -y <package>@latest`.
# That makes every session start pay for an npm resolution, a download and a
# cold install before the server says hello, and OpenCode gives the
# handshake a fixed number of seconds. On a cold cache the client gave up
# first, and the servers came up as "failed: Request timed out" -- the tools
# were never broken, they were late. The log showed the late reply
# arriving as "Received a response for an unknown message ID" after the
# client had already abandoned the request.
#
# So the packages are installed locally and this script runs the local
# binary when there is one, falling back to npx with a pinned version when
# there is not. Pinned, not @latest: an MCP server that changes between
# sessions is a moving target, and the EAS CLI and the Vercel CLI have both
# already broken a build here by moving under a pinned expectation.
#
# The local copies live in .opencode/node_modules, which is machine-local
# on purpose (.opencode/.gitignore). To install them:
#
#   cd .opencode && npm install --save-exact --save-dev \
#     @playwright/mcp@0.0.83 @upstash/context7-mcp@4.4.4
#
# The Playwright server also needs a browser. Without one it connects and
# then fails every navigation:
#
#   cd .opencode && npx playwright install chromium

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/.opencode/node_modules/.bin"

server="${1:-}"
if [ $# -gt 0 ]; then shift; fi

case "$server" in
  playwright)
    if [ -x "$BIN/playwright-mcp" ]; then
      exec "$BIN/playwright-mcp" "$@"
    fi
    exec npx -y @playwright/mcp@0.0.83 "$@"
    ;;
  context7)
    if [ -x "$BIN/context7-mcp" ]; then
      exec "$BIN/context7-mcp" "$@"
    fi
    exec npx -y @upstash/context7-mcp@4.4.4 "$@"
    ;;
  *)
    echo "usage: $0 {playwright|context7}" >&2
    exit 2
    ;;
esac
