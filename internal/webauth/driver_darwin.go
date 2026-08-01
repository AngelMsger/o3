//go:build darwin

package webauth

import (
	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
	shared "github.com/angelmsger/openobserve-cli/pkg/webauth"
)

// nativeDriver adapts the WKWebView capture in webauth_darwin.go to the shared
// Driver interface. macOS keeps the native window rather than launching an
// external browser: it is the in-app experience o3 shipped with, and it needs
// no Chromium installed.
type nativeDriver struct{}

func (nativeDriver) Capture(loginURL, host string, verify shared.VerifyFunc) (pkgauth.Session, error) {
	return Capture(loginURL, host, verify)
}

// driverForPlatform ignores profileDir: the native WebView uses its own
// non-persistent data store so account switching can never recapture a prior
// user's session.
func driverForPlatform(_ string) shared.Driver { return nativeDriver{} }
