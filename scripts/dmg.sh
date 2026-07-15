#!/usr/bin/env bash
#
# Package the macOS build of o3 into a distributable .dmg with a designed install
# window: a Void-themed background, a drag-to-Applications arrow, fixed icon
# positions, and a custom volume icon.
#
# Uses dmgbuild (pure Python) rather than AppleScript/Finder, so the layout is
# written headlessly and reproducibly in CI. The committed assets it consumes
# (build/dmg/background.tiff, build/dmg/volume.icns) are regenerated with
# build/dmg/render.sh; see the design spec under docs/superpowers/specs/.
#
# Prerequisites:
#   - dmgbuild:  pip install dmgbuild
#   - The .app already built by Wails at build/bin/o3.app, e.g.
#         wails build -platform darwin/universal
#   - Run on macOS.
#
# Usage:
#   VERSION=1.2.3 scripts/dmg.sh
#   scripts/dmg.sh 1.2.3
#
# Output:
#   build/bin/o3-<version>-universal.dmg
#
set -euo pipefail

APP="o3"
VERSION="${VERSION:-${1:-0.0.0}}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

APP_BUNDLE="build/bin/${APP}.app"
if [[ ! -d "${APP_BUNDLE}" ]]; then
  echo "error: ${APP_BUNDLE} not found. Build it first:" >&2
  echo "  wails build -platform darwin/universal" >&2
  exit 1
fi

if ! command -v dmgbuild >/dev/null 2>&1; then
  echo "error: dmgbuild not found. Install it first:" >&2
  echo "  pip install dmgbuild" >&2
  exit 1
fi

OUTPUT="build/bin/${APP}-${VERSION}-universal.dmg"
rm -f "${OUTPUT}"

dmgbuild \
  -s build/dmg/settings.py \
  -D app="${ROOT}/${APP_BUNDLE}" \
  -D volicon="${ROOT}/build/dmg/volume.icns" \
  -D background="${ROOT}/build/dmg/background.tiff" \
  "${APP}" \
  "${OUTPUT}"

echo "Built ${OUTPUT}"
