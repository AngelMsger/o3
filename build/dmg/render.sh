#!/usr/bin/env bash
# Render the o3 .dmg install-window assets:
#   - background.tiff  a Retina (1x + 2x) background for the drag-to-install window
#   - volume.icns      the mounted-disk icon (the retuned app icon)
#
# The background is rendered by headless Chrome from a self-contained HTML (same
# approach as build/icon/render.sh, so the JetBrains Mono wordmark renders
# faithfully). volume.icns is built from build/appicon.png with iconutil. Both
# outputs are committed so the release CI only needs dmgbuild, not Chrome.
#
#   ./render.sh              # regenerate background.tiff + volume.icns in build/dmg
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
FONT_URL="https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-ExtraBold.ttf"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# ---- background.tiff (1x + 2x) --------------------------------------------
curl -sL --max-time 30 -o "$TMP/jbmono.ttf" "$FONT_URL"
python3 "$DIR/gen_bg_html.py" "$TMP/jbmono.ttf" "$TMP"
# 2x render (1320x880), then downscale to the 1x variant (660x440) so the two
# reps are pixel-aligned.
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1320,880 --virtual-time-budget=3000 \
  --screenshot="$DIR/background@2x.png" "file://$TMP/bg.html" >/dev/null 2>&1
sips -z 440 660 "$DIR/background@2x.png" --out "$DIR/background.png" >/dev/null
tiffutil -cathidpicheck "$DIR/background.png" "$DIR/background@2x.png" -out "$DIR/background.tiff" >/dev/null
rm -f "$DIR/background.png" "$DIR/background@2x.png"

# ---- volume.icns (from the retuned app icon) ------------------------------
ICONSET="$TMP/volume.iconset"; mkdir -p "$ICONSET"
SRC="$ROOT/build/appicon.png"
for sz in 16 32 128 256 512; do
  sips -z "$sz" "$sz" "$SRC" --out "$ICONSET/icon_${sz}x${sz}.png" >/dev/null
  d=$((sz*2))
  sips -z "$d" "$d" "$SRC" --out "$ICONSET/icon_${sz}x${sz}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$DIR/volume.icns"

echo "wrote background.tiff, volume.icns to $DIR"
