# o3 build & packaging.
#
# These targets mirror the release CI (.github/workflows/release.yml) so a
# maintainer can reproduce any installer locally.
#
# REQUIREMENT: the shared openobserve-cli client must be checked out as a sibling
# at ../oa-cli/src/openobserve-cli (the go.work / go.mod replace directive points
# there). See the README "Getting started" section.
#
# VERSION defaults to the current git tag (without the leading "v"); override it
# explicitly with:  make dmg VERSION=1.2.3

VERSION ?= $(shell git describe --tags 2>/dev/null | sed 's/^v//' || echo 0.0.0-dev)
LDFLAGS := -X main.version=$(VERSION)

# Numeric-only version for the macOS CFBundle* and Windows .exe/NSIS resources
# (they reject a -prerelease / +build suffix like 0.0.0-dev). Strips from the
# first "-" and the first "+".
NUMERIC_VERSION := $(firstword $(subst +, ,$(firstword $(subst -, ,$(VERSION)))))

# Linux webkit binding tag. Empty is correct for webkit2gtk-4.0 (Ubuntu 22.04,
# the CI/release base). On webkit2gtk-4.1-only systems (Ubuntu 24.04+) build with:
#   make appimage LINUX_TAGS=webkit2_41
LINUX_TAGS ?=

# Native auto-update (Sparkle on macOS, WinSparkle on Windows). Off by default:
# plain builds keep the custom check-only updater and never touch the
# frameworks. Release CI and local end-to-end tests build with:
#   make dmg NATIVE_UPDATER=1     /     make installer NATIVE_UPDATER=1
# On macOS this compiles with the native_updater tag, links with an rpath to
# the bundle's Frameworks dir, and embeds Sparkle.framework into the .app
# (scripts/sparkle-framework.sh). On Windows the tag alone suffices — the
# WinSparkle DLL is go:embedded.
NATIVE_UPDATER ?=
ifeq ($(NATIVE_UPDATER),)
UPDATER_TAGS :=
MAC_CGO_LDFLAGS :=
EMBED_SPARKLE := @true
else
UPDATER_TAGS := -tags native_updater
MAC_CGO_LDFLAGS := CGO_LDFLAGS='-Wl,-rpath,@loader_path/../Frameworks'
EMBED_SPARKLE := scripts/sparkle-framework.sh
endif

.PHONY: help stamp stamp-numeric dev \
        build-mac dmg \
        build-windows installer \
        build-linux appimage \
        clean

help:
	@echo "Targets:"
	@echo "  dmg         Build the macOS universal .app and package it as a .dmg"
	@echo "  installer   Build the Windows .exe and NSIS installer"
	@echo "  appimage    Build the Linux binary and package it as an AppImage"
	@echo "  dev         Run 'wails dev'"
	@echo "  clean       Remove build/bin"
	@echo ""
	@echo "VERSION=$(VERSION)"

# Stamp the version into wails.json. Linux uses the full version; macOS and
# Windows use the numeric-only one (their bundle metadata rejects a suffix).
stamp:
	node scripts/set-version.mjs $(VERSION)

stamp-numeric:
	node scripts/set-version.mjs $(NUMERIC_VERSION)

dev:
	wails dev

# ---- macOS -----------------------------------------------------------------
build-mac: stamp-numeric
	$(MAC_CGO_LDFLAGS) wails build -platform darwin/universal $(UPDATER_TAGS) -clean -ldflags "$(LDFLAGS)"
	$(EMBED_SPARKLE)

# Requires dmgbuild (pip install dmgbuild) to lay out the install window. The
# committed background/volume-icon assets are regenerated with build/dmg/render.sh.
dmg: build-mac
	VERSION=$(VERSION) scripts/dmg.sh

# ---- Windows (cross-compiles from any host; NSIS needs makensis) -----------
build-windows: stamp-numeric
	wails build -platform windows/amd64 -nsis $(UPDATER_TAGS) -clean -ldflags "$(LDFLAGS)"

installer: build-windows
	@echo "Installer at build/bin/o3-amd64-installer.exe"

# ---- Linux (build on Linux with libgtk-3-dev + libwebkit2gtk-4.0-dev) ------
build-linux: stamp
	wails build -platform linux/amd64 $(if $(LINUX_TAGS),-tags $(LINUX_TAGS)) -clean -ldflags "$(LDFLAGS)"

appimage: build-linux
	VERSION=$(VERSION) scripts/appimage.sh

clean:
	rm -rf build/bin
