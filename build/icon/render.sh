#!/usr/bin/env bash
# Render the o3 monogram app-icon variants (Void/Signal) to transparent 1024
# PNGs. The icon is the "o3" wordmark in JetBrains Mono ExtraBold on a
# macOS-standard 824/1024 squircle (100px safe-area padding). Headless Chrome
# renders it (faithful web font + gradients + transparent background);
# ImageMagick/qlmanage cannot render the embedded font, so Chrome is required.
#
#   ./render.sh [outdir]      # writes o3-void.png, o3-signal.png (default: here)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$DIR}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
FONT_URL="https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-ExtraBold.ttf"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -sL --max-time 30 -o "$TMP/jbmono.ttf" "$FONT_URL"
python3 "$DIR/gen_icon_html.py" "$TMP/jbmono.ttf" "$TMP"
for v in void signal; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size=1024,1024 --virtual-time-budget=3000 \
    --screenshot="$OUT/o3-$v.png" "file://$TMP/$v.html" >/dev/null 2>&1
done
echo "wrote o3-void.png, o3-signal.png to $OUT"
