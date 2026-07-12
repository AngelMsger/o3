#!/usr/bin/env bash
#
# Package the Linux build of o3 into a portable AppImage.
#
# Prerequisites:
#   - The Linux binary already built by Wails at build/bin/o3, e.g.
#         wails build -platform linux/amd64 -tags webkit2_41
#   - Run on Linux (x86_64) with the GTK/WebKit runtime present:
#         libgtk-3-0 libwebkit2gtk-4.1-0   (dev packages for building)
#   - wget, and FUSE not required (we self-extract the tools).
#
# Usage:
#   VERSION=1.2.3 scripts/appimage.sh
#   scripts/appimage.sh 1.2.3
#
# Output:
#   build/bin/o3-<version>-x86_64.AppImage
#
set -euo pipefail

APP="o3"
VERSION="${VERSION:-${1:-0.0.0}}"

# Resolve repo root from this script's location so it works from anywhere.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

BIN="build/bin/${APP}"
if [[ ! -x "${BIN}" ]]; then
  echo "error: ${BIN} not found. Build it first:" >&2
  echo "  wails build -platform linux/amd64 -tags webkit2_41" >&2
  exit 1
fi

WORK="build/linux/appimage"
APPDIR="${WORK}/AppDir"
TOOLS="build/linux/tools"

rm -rf "${WORK}"
mkdir -p \
  "${APPDIR}/usr/bin" \
  "${APPDIR}/usr/share/applications" \
  "${APPDIR}/usr/share/icons/hicolor/512x512/apps" \
  "${TOOLS}"

# Stage binary, desktop entry and icon into the AppDir.
cp "${BIN}" "${APPDIR}/usr/bin/${APP}"
cp "build/linux/${APP}.desktop" "${APPDIR}/usr/share/applications/${APP}.desktop"
cp "build/appicon.png" "${APPDIR}/usr/share/icons/hicolor/512x512/apps/${APP}.png"

# Fetch linuxdeploy + the GTK plugin (cached across runs in build/linux/tools).
LD="${TOOLS}/linuxdeploy-x86_64.AppImage"
LD_GTK="${TOOLS}/linuxdeploy-plugin-gtk.sh"
if [[ ! -f "${LD}" ]]; then
  wget -q -O "${LD}" \
    "https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage"
fi
if [[ ! -f "${LD_GTK}" ]]; then
  wget -q -O "${LD_GTK}" \
    "https://github.com/linuxdeploy/linuxdeploy-plugin-gtk/releases/download/continuous/linuxdeploy-plugin-gtk.sh"
fi
chmod +x "${LD}" "${LD_GTK}"

# CI runners have no FUSE, so run the AppImage tools via self-extraction.
export APPIMAGE_EXTRACT_AND_RUN=1
# The GTK plugin must know which major GTK the app links (webkit2gtk => GTK 3).
export DEPLOY_GTK_VERSION=3
# Final artifact name.
export OUTPUT="build/bin/${APP}-${VERSION}-x86_64.AppImage"

# linuxdeploy needs the plugin on PATH as `linuxdeploy-plugin-gtk`.
export PATH="${ROOT}/${TOOLS}:${PATH}"
ln -sf "linuxdeploy-plugin-gtk.sh" "${TOOLS}/linuxdeploy-plugin-gtk"

"${LD}" \
  --appdir "${APPDIR}" \
  --plugin gtk \
  --desktop-file "${APPDIR}/usr/share/applications/${APP}.desktop" \
  --icon-file "${APPDIR}/usr/share/icons/hicolor/512x512/apps/${APP}.png" \
  --executable "${APPDIR}/usr/bin/${APP}" \
  --output appimage

echo "Built ${OUTPUT}"
