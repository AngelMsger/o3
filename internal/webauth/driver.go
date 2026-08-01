package webauth

import (
	shared "github.com/angelmsger/openobserve-cli/pkg/webauth"
)

// Driver returns the browser sign-in transport for this platform. macOS uses
// the native WKWebView window (see webauth_darwin.go); every other platform
// drives a Chromium-family browser over the DevTools Protocol, which is why
// sign-in is no longer macOS-only.
//
// profileDir is the persistent browser profile the CDP driver should use. It is
// ignored on macOS, where the native WebView keeps its own (deliberately
// non-persistent) data store.
func Driver(profileDir string) shared.Driver {
	return driverForPlatform(profileDir)
}
