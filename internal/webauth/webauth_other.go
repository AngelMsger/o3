//go:build !darwin

package webauth

import (
	"errors"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
)

// Capture is unsupported off macOS: o3's browser sign-in relies on a native
// WKWebView. Other platforms fall back to the token/basic auth methods.
func Capture(loginURL, host string, _ VerifyFunc) (pkgauth.Session, error) {
	return pkgauth.Session{}, errors.New("browser sign-in is only supported on macOS")
}
