//go:build !darwin

package branding

// SetDock is a no-op on non-darwin platforms (o3 is a macOS app; the Dock-icon
// swap has no analogue elsewhere).
func SetDock(dark bool) {}

// SetAppearance is a no-op on non-darwin platforms (NSAppearance is macOS-only).
func SetAppearance(pref string) {}
