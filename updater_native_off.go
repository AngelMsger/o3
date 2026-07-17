//go:build (!darwin && !windows) || !native_updater

package main

// newNativeUpdater returns nil: no OS update framework in this build. Linux has
// none to offer, and dev builds (wails dev, go test) must not link Sparkle —
// the real framework only exists inside a packaged o3.app. nil selects the
// custom check-only flow in app_update.go, and AppInfo reports it as
// UpdateMode "custom" so the frontend mounts its own update UI.
func newNativeUpdater() nativeUpdater { return nil }
