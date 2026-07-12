#!/usr/bin/env bash
#
# Package the Linux build of o3 into a portable AppImage.
#
# Prerequisites:
#   - The Linux binary already built by Wails at build/bin/o3, e.g.
#         wails build -platform linux/amd64
#   - Run on Linux (x86_64) with the GTK/WebKit runtime present:
#         libgtk-3-0 libwebkit2gtk-4.0-37   (dev packages for building)
#   - curl/wget, and FUSE not required (we self-extract the tools).
#
# Usage:
#   VERSION=1.2.3 scripts/appimage.sh
#   scripts/appimage.sh 1.2.3
#
# Output:
#   build/bin/o3-<version>-x86_64.AppImage
#
# Supply chain: every downloaded tool is verified against a pinned SHA-256 below
# before it is executed, and appimagetool is supplied locally so linuxdeploy does
# not fetch it unverified at runtime. linuxdeploy / appimagetool ship only a
# rolling "continuous" release, so if a pin fails after an upstream refresh,
# re-download the asset, review it, and update the hash here deliberately.
set -euo pipefail

APP="o3"
VERSION="${VERSION:-${1:-0.0.0}}"

# --- Pinned build tools (URL + SHA-256) -------------------------------------
LINUXDEPLOY_URL="https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage"
LINUXDEPLOY_SHA="e87ee0815d109282fdda73e34c2361d64d02b0ffaea3674b18f1fd1f6a687dcf"
APPIMAGETOOL_URL="https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
APPIMAGETOOL_SHA="a6d71e2b6cd66f8e8d16c37ad164658985e0cf5fcaa950c90a482890cb9d13e0"
# The GTK plugin has no release asset — pin the raw script at an immutable commit.
GTK_PLUGIN_COMMIT="7a3fbc31a9e5075073ff8790f26effbac5f84453"
GTK_PLUGIN_URL="https://raw.githubusercontent.com/linuxdeploy/linuxdeploy-plugin-gtk/${GTK_PLUGIN_COMMIT}/linuxdeploy-plugin-gtk.sh"
GTK_PLUGIN_SHA="b0f4cbc684a0103a9651f0955b635eaea0096b3a66c0f5a2c2aa337960375171"

# Download <url> to <dest> and abort unless it matches the pinned <sha256>.
sha256_of() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
fetch_verified() {
  local url="$1" dest="$2" want="$3" got
  if [[ ! -f "${dest}" ]]; then
    curl -fsSL -o "${dest}" "${url}" || wget -q -O "${dest}" "${url}"
  fi
  got="$(sha256_of "${dest}")"
  if [[ "${got}" != "${want}" ]]; then
    echo "error: checksum mismatch for ${dest}" >&2
    echo "  expected ${want}" >&2
    echo "  got      ${got}" >&2
    echo "  upstream 'continuous' asset may have changed — review and update the pin." >&2
    rm -f "${dest}"
    exit 1
  fi
}

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

# Fetch + verify the build tools (cached across runs in build/linux/tools).
LD="${TOOLS}/linuxdeploy-x86_64.AppImage"
LD_GTK="${TOOLS}/linuxdeploy-plugin-gtk"
APPIMAGETOOL="${TOOLS}/appimagetool"
fetch_verified "${LINUXDEPLOY_URL}" "${LD}"          "${LINUXDEPLOY_SHA}"
fetch_verified "${GTK_PLUGIN_URL}"   "${LD_GTK}"     "${GTK_PLUGIN_SHA}"
fetch_verified "${APPIMAGETOOL_URL}" "${APPIMAGETOOL}" "${APPIMAGETOOL_SHA}"
chmod +x "${LD}" "${LD_GTK}" "${APPIMAGETOOL}"

# CI runners have no FUSE, so run the AppImage tools via self-extraction.
export APPIMAGE_EXTRACT_AND_RUN=1
# The GTK plugin must know which major GTK the app links (webkit2gtk => GTK 3).
export DEPLOY_GTK_VERSION=3
# Final artifact name.
export OUTPUT="build/bin/${APP}-${VERSION}-x86_64.AppImage"

# Put the tools on PATH so linuxdeploy finds the plugin (linuxdeploy-plugin-gtk)
# and uses OUR verified appimagetool instead of fetching one at runtime.
export PATH="${ROOT}/${TOOLS}:${PATH}"

"${LD}" \
  --appdir "${APPDIR}" \
  --plugin gtk \
  --desktop-file "${APPDIR}/usr/share/applications/${APP}.desktop" \
  --icon-file "${APPDIR}/usr/share/icons/hicolor/512x512/apps/${APP}.png" \
  --executable "${APPDIR}/usr/bin/${APP}" \
  --output appimage

echo "Built ${OUTPUT}"
