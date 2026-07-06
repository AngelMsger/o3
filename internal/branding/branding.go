// Package branding holds o3's runtime brand assets and the platform hook for
// swapping the Dock icon to match the active theme. The two icon variants —
// "void" (dark theme) and "signal" (light theme) — are the same log-lines mark
// as the app icon (see build/icon/o3-*.svg and design/Icon.dc.html).
package branding

import _ "embed"

//go:embed void.png
var voidPNG []byte

//go:embed signal.png
var signalPNG []byte
