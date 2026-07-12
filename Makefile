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

# Numeric-only version for the Windows .exe / NSIS resources (they reject a
# -prerelease suffix like 0.0.0-dev). Strips everything from the first "-".
WIN_VERSION := $(firstword $(subst -, ,$(VERSION)))

# Linux webkit binding tag. Empty is correct for webkit2gtk-4.0 (Ubuntu 22.04,
# the CI/release base). On webkit2gtk-4.1-only systems (Ubuntu 24.04+) build with:
#   make appimage LINUX_TAGS=webkit2_41
LINUX_TAGS ?=

.PHONY: help stamp stamp-win dev \
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

# Stamp the version into wails.json so it flows into Info.plist / installer.
stamp:
	node scripts/set-version.mjs $(VERSION)

# Windows needs a numeric version in the .exe / NSIS resources.
stamp-win:
	node scripts/set-version.mjs $(WIN_VERSION)

dev:
	wails dev

# ---- macOS -----------------------------------------------------------------
build-mac: stamp
	wails build -platform darwin/universal -clean -ldflags "$(LDFLAGS)"

dmg: build-mac
	VERSION=$(VERSION) scripts/dmg.sh

# ---- Windows (cross-compiles from any host; NSIS needs makensis) -----------
build-windows: stamp-win
	wails build -platform windows/amd64 -nsis -clean -ldflags "$(LDFLAGS)"

installer: build-windows
	@echo "Installer at build/bin/o3-amd64-installer.exe"

# ---- Linux (build on Linux with libgtk-3-dev + libwebkit2gtk-4.0-dev) ------
build-linux: stamp
	wails build -platform linux/amd64 $(if $(LINUX_TAGS),-tags $(LINUX_TAGS)) -clean -ldflags "$(LDFLAGS)"

appimage: build-linux
	VERSION=$(VERSION) scripts/appimage.sh

clean:
	rm -rf build/bin
