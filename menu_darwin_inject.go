//go:build darwin

package main

/*
#cgo LDFLAGS: -framework Cocoa
void o3_install_update_menu_item(void);
*/
import "C"

// menuApp is the App behind the injected app-menu item. The ObjC action has no
// way to carry a Go pointer, so the callback reads this package var; it is set
// exactly once, from startup, before the item is installed.
var menuApp *App

// installUpdateMenuItem puts "Check for Updates…" into the macOS app menu
// (o3 ▸ right after "About o3"), where macOS convention — and every
// Sparkle-carrying app — keeps it. Wails expands the AppMenuRole natively and
// offers no way to add items to it, so the item is inserted into the live
// NSMenu from ObjC after launch (menu_darwin_inject.m); the click lands back
// in Go via the exported callback below. Runs in every darwin build, not just
// native_updater ones — RequestUpdateCheck routes to whichever update flow the
// build carries.
func (a *App) installUpdateMenuItem() {
	menuApp = a
	C.o3_install_update_menu_item()
}

//export o3MenuCheckForUpdates
func o3MenuCheckForUpdates() {
	if menuApp != nil {
		menuApp.RequestUpdateCheck()
	}
}
