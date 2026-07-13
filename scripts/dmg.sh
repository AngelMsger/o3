#!/usr/bin/env bash
#
# Package the macOS build of o3 into a distributable .dmg with a drag-to-install
# Applications shortcut. Uses hdiutil (built into macOS) — no extra tooling, and
# reliable in headless CI (unlike AppleScript-driven layout tools).
#
# Prerequisites:
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

STAGING="build/darwin/dmg-staging"
OUTPUT="build/bin/${APP}-${VERSION}-universal.dmg"

rm -rf "${STAGING}" "${OUTPUT}"
mkdir -p "${STAGING}"
cp -R "${APP_BUNDLE}" "${STAGING}/"
ln -s /Applications "${STAGING}/Applications"

hdiutil create \
  -volname "${APP}" \
  -srcfolder "${STAGING}" \
  -fs HFS+ \
  -format UDZO \
  -ov \
  "${OUTPUT}"

rm -rf "${STAGING}"
echo "Built ${OUTPUT}"
