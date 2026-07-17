//go:build darwin

package main

import (
	"context"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/menu"
)

// Setting options.App.Menu replaces the default macOS menu Wails would otherwise
// install. AppMenu carries About/Hide/Services/Quit and EditMenu carries
// Cmd+C/V/Z — dropping either silently breaks copy/paste in the query editor,
// which is easy to do and easy to miss.
func TestAppMenuKeepsTheNativeRoles(t *testing.T) {
	m := appMenu(&App{})

	var roles []menu.Role
	for _, it := range m.Items {
		if it.Role != 0 {
			roles = append(roles, it.Role)
		}
	}
	want := map[menu.Role]string{
		menu.AppMenuRole:  "AppMenu (About/Hide/Quit)",
		menu.EditMenuRole: "EditMenu (Cmd+C/V/Z in the query editor)",
	}
	for role, why := range want {
		found := false
		for _, got := range roles {
			if got == role {
				found = true
			}
		}
		if !found {
			t.Errorf("the menu is missing the %s role — %s", roleName(role), why)
		}
	}
}

// "Check for Updates…" moved into the native app menu (injected after launch,
// see menu_darwin_inject.go) — the Wails-built menus must not carry a second
// copy, or macOS users get the same command in two places.
func TestWailsMenusCarryNoCheckForUpdates(t *testing.T) {
	m := appMenu(&App{})

	for _, it := range m.Items {
		if it.SubMenu == nil {
			continue
		}
		for _, sub := range it.SubMenu.Items {
			if sub.Label == "Check for Updates…" {
				t.Fatal(`"Check for Updates…" is still in a Wails submenu; it lives in the injected app menu now`)
			}
		}
	}
}

// The injected NSMenuItem's action lands here. It must route into the same
// explicit-check path as everything else, and must tolerate firing before
// startup has registered the App (menuApp nil) or set a context.
func TestMenuCheckForUpdatesCallbackRoutes(t *testing.T) {
	defer func(prev *App) { menuApp = prev }(menuApp)

	menuApp = nil
	o3MenuCheckForUpdates() // must not panic

	var events []string
	menuApp = &App{
		ctx:  t.Context(),
		emit: func(_ context.Context, name string, _ ...interface{}) { events = append(events, name) },
	}
	o3MenuCheckForUpdates()
	if len(events) != 1 || events[0] != EventUpdateCheckRequested {
		t.Fatalf("emitted %v, want exactly [%s]", events, EventUpdateCheckRequested)
	}
}

// A click before startup finishes would emit against a nil context.
func TestMenuCallbacksTolerateANilContext(t *testing.T) {
	m := appMenu(&App{}) // ctx is nil

	for _, it := range m.Items {
		if it.SubMenu == nil {
			continue
		}
		for _, sub := range it.SubMenu.Items {
			if sub.Click != nil {
				sub.Click(&menu.CallbackData{MenuItem: sub}) // must not panic
			}
		}
	}
}

func roleName(r menu.Role) string {
	switch r {
	case menu.AppMenuRole:
		return "AppMenu"
	case menu.EditMenuRole:
		return "EditMenu"
	}
	return "unknown"
}
