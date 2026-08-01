//go:build !darwin

package webauth

import (
	shared "github.com/angelmsger/openobserve-cli/pkg/webauth"
	"github.com/angelmsger/openobserve-cli/pkg/webauth/cdp"
)

// driverForPlatform selects the shared DevTools-Protocol driver off macOS. This
// replaces the stub that used to refuse with "browser sign-in is only supported
// on macOS": Windows and Linux now get a real sign-in flow in the user's own
// Chromium-family browser.
func driverForPlatform(profileDir string) shared.Driver {
	return cdp.New(cdp.Options{ProfileDir: profileDir})
}
