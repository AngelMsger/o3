package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

// version is the application version. It defaults to "dev" for local builds and
// is overridden at release time via the linker:
//
//	go build -ldflags "-X main.version=1.2.3"
//
// (the release workflow injects the git tag). Kept as a package-level var so it
// is available for surfacing in-app or in logs without changing call sites.
var version = "dev"

func main() {
	println("o3", version)

	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:    "o3",
		Width:    1280,
		Height:   832,
		MinWidth: 920,
		// Native macOS chrome: real traffic lights, inset over full-size content,
		// rounded window corners (no frameless black border). The title bar is made
		// draggable via the CSS property below (see .oo-drag in tokens.css).
		CSSDragProperty: "--wails-draggable",
		CSSDragValue:    "drag",
		Mac: &mac.Options{
			TitleBar: mac.TitleBarHiddenInset(),
			// Appearance is intentionally NOT pinned here. Pinning it to DarkAqua
			// forces the WKWebView's prefers-color-scheme to dark forever, so the
			// "System" theme preference could never resolve to light. Instead the
			// app follows the OS at startup, and the frontend drives the native
			// appearance at runtime via App.SetAppearance (see internal/branding).
			// Opaque window. A translucent NSVisualEffectView backing made the CSS
			// backdrop-filter flicker during window drags, and gave the chrome
			// nothing in-page to blur (the vibrancy sits behind the webview, so the
			// blur was a no-op — it read as a flat tint). With an opaque webview,
			// backdrop-filter blurs real page content: a controllable, flicker-free
			// frosted-glass effect on the chrome and overlays.
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		// macOS only (nil elsewhere): the standard app + edit menus, plus a Help
		// menu carrying "Check for Updates…". See menu_darwin.go.
		Menu:             appMenu(app),
		BackgroundColour: &options.RGBA{R: 5, G: 6, B: 8, A: 1}, // #050608 opaque
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
