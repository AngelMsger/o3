//go:build darwin

package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// appMenu builds the macOS menu bar.
//
// "Check for Updates…" is NOT here: it lives where macOS convention puts it,
// inside the app menu under About. menu.AppMenu() is a role (AppMenuRole) the
// darwin backend expands natively in ObjC and Wails cannot add items to it —
// and hand-rolling the app menu from custom items would lose the native
// hide:/unhideAllApplications: selectors only the role can wire up. So the item
// is injected into the live NSMenu after launch instead: see
// installUpdateMenuItem in menu_darwin_inject.go.
//
// AppMenu and EditMenu must both be included: setting Menu at all replaces the
// default macOS menu Wails would otherwise install, and dropping EditMenu takes
// Cmd+C/V/Z in the query editor down with it.
func appMenu(a *App) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.AppMenu())
	m.Append(menu.EditMenu())

	help := m.AddSubmenu("Help")
	help.AddText("Documentation", nil, func(*menu.CallbackData) {
		a.openURL("https://angelmsger.github.io/o3")
	})
	help.AddText("Release Notes", nil, func(*menu.CallbackData) {
		a.openURL("https://github.com/AngelMsger/o3/releases")
	})
	help.AddText("Report an Issue", nil, func(*menu.CallbackData) {
		a.openURL("https://github.com/AngelMsger/o3/issues/new")
	})
	return m
}

func (a *App) openURL(url string) {
	if a.ctx == nil {
		return
	}
	wruntime.BrowserOpenURL(a.ctx, url)
}
