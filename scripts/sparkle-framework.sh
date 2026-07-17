#!/usr/bin/env bash
#
# Embed Sparkle.framework into the macOS app bundle after `wails build`.
#
# The native_updater build links against go-sparkle's stripped stub framework,
# with an @rpath install name resolved at launch via
#     CGO_LDFLAGS='-Wl,-rpath,@loader_path/../Frameworks'
# so the REAL framework must sit at o3.app/Contents/Frameworks — that is this
# script's whole job. Run it between `wails build -tags native_updater` and
# scripts/dmg.sh (the Makefile's NATIVE_UPDATER knob and the release workflow
# both do).
#
# Prerequisites:
#   - The app bundle already built at build/bin/o3.app
#   - curl or wget
#
# Usage:
#   scripts/sparkle-framework.sh
#
# Supply chain: the archive is verified against the pinned SHA-256 before
# anything is extracted, matching scripts/appimage.sh. Sparkle tags immutable
# releases, so unlike the "continuous" pins there this one only changes when
# SPARKLE_VERSION is bumped deliberately. Bump note: go-sparkle drives Sparkle
# through the SUUpdater compatibility shim, which exists throughout Sparkle 2.x
# but is slated for removal in Sparkle 3 — revisit the binding before ever
# moving this pin to a 3.x release.
set -euo pipefail

SPARKLE_VERSION="2.9.4"
SPARKLE_URL="https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE_VERSION}/Sparkle-${SPARKLE_VERSION}.tar.xz"
SPARKLE_SHA="ce89daf967db1e1893ed3ebd67575ed82d3902563e3191ca92aaec9164fbdef9"

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
    rm -f "${dest}"
    exit 1
  fi
}

# Resolve repo root from this script's location so it works from anywhere.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

APP="build/bin/o3.app"
if [[ ! -d "${APP}" ]]; then
  echo "error: ${APP} not found. Build it first:" >&2
  echo "  CGO_LDFLAGS='-Wl,-rpath,@loader_path/../Frameworks' wails build -platform darwin/universal -tags native_updater" >&2
  exit 1
fi

# A build that embeds Sparkle must also carry the EdDSA public key, or the
# framework would happily check the feed and then fail every install (and an
# app without the key pinned would trust whatever key a feed claims). Refuse
# to package until the one-time key setup (docs/auto-update.md) is done.
if ! grep -A1 '<key>SUPublicEDKey</key>' build/darwin/Info.plist | grep -q '<string>..*</string>'; then
  echo "error: SUPublicEDKey in build/darwin/Info.plist is empty." >&2
  echo "  Run the one-time key setup in docs/auto-update.md before shipping" >&2
  echo "  a Sparkle-enabled build." >&2
  exit 1
fi

TOOLS="build/darwin/tools"
mkdir -p "${TOOLS}"
ARCHIVE="${TOOLS}/Sparkle-${SPARKLE_VERSION}.tar.xz"
EXTRACTED="${TOOLS}/Sparkle-${SPARKLE_VERSION}"

fetch_verified "${SPARKLE_URL}" "${ARCHIVE}" "${SPARKLE_SHA}"
if [[ ! -d "${EXTRACTED}/Sparkle.framework" ]]; then
  rm -rf "${EXTRACTED}"
  mkdir -p "${EXTRACTED}"
  tar -xf "${ARCHIVE}" -C "${EXTRACTED}"
fi

# cp -R preserves the Versions/B symlink structure the install name points at.
#
# Deliberately NOT re-signed: the framework ships signed by the Sparkle project
# (its Autoupdate helper and XPC services individually), and a `codesign
# --force --deep -s -` here would strip those inner signatures. Adding a
# framework does not invalidate the main binary's own ad-hoc signature. Escape
# hatch, only if the bundled XPC services misbehave at runtime:
#   codesign --force --deep -s - build/bin/o3.app
mkdir -p "${APP}/Contents/Frameworks"
rm -rf "${APP}/Contents/Frameworks/Sparkle.framework"
cp -R "${EXTRACTED}/Sparkle.framework" "${APP}/Contents/Frameworks/"

echo "Embedded Sparkle ${SPARKLE_VERSION} into ${APP}"
