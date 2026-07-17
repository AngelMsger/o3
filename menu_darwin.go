//go:build darwin

package main

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// appMenu builds the macOS menu bar.
//
// "Check for Updates…" cannot go where macOS convention puts it — inside the app
// menu, under About. menu.AppMenu() is a role (AppMenuRole) that the darwin
// backend expands natively in ObjC (WailsMenu.m, appendRole:), building
// About/Hide/Show All/Quit itself; Wails offers no way to inject an item into it,
// and hand-rolling the app menu from custom items would lose the native
// hide:/unhideAllApplications: selectors, which only the role can wire up. So it
// lives in a top-level submenu instead.
//
// AppMenu and EditMenu must both be included: setting Menu at all replaces the
// default macOS menu Wails would otherwise install, and dropping EditMenu takes
// Cmd+C/V/Z in the query editor down with it.
func appMenu(a *App) *menu.Menu {
	m := menu.NewMenu()
	m.Append(menu.AppMenu())
	m.Append(menu.EditMenu())

	help := m.AddSubmenu("Help")
	help.AddText("Check for Updates…", nil, func(*menu.CallbackData) {
		a.RequestUpdateCheck()
	})
	help.AddSeparator()
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
