#!/usr/bin/env bash
# Launch the local test browser (custom Chromium build) with the flags it needs:
# - a WebGL domain policy file + sha (the build refuses to start without one)
# - no proxy (the VM's egress proxy must not touch localhost)
# - remote debugging for the CDP driver
# Usage: bash tests/chrome.sh [port]   (default 9227), then run the CDP tests
# with CDP_PORT set to the same port.
set -e
PORT="${1:-9227}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
POLICY="$ROOT/tests/webgl-policy.txt"
SHA="$(sha256sum "$POLICY" | cut -d' ' -f1)"
exec /opt/meta-chromium/chrome --headless=new --no-sandbox --disable-gpu --no-proxy-server \
  --remote-debugging-port="$PORT" --user-data-dir="$HOME/workspace/.chrome-tokenradar-$PORT" \
  --hatch-webgl-allowed-domains-file="$POLICY" --hatch-webgl-allowed-domains-sha256="$SHA" \
  --window-size=1280,800
