//go:build darwin

package main

import (
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

// "Check for Updates…" cannot live in the app menu: AppMenuRole is expanded
// natively in ObjC and takes no custom items. It must therefore be reachable from
// a top-level submenu, or macOS users lose the menu entry point entirely.
func TestAppMenuHasCheckForUpdates(t *testing.T) {
	m := appMenu(&App{})

	for _, it := range m.Items {
		if it.SubMenu == nil {
			continue
		}
		for _, sub := range it.SubMenu.Items {
			if sub.Label == "Check for Updates…" {
				if sub.Click == nil {
					t.Fatal(`"Check for Updates…" has no click handler`)
				}
				return
			}
		}
	}
	t.Fatal(`no submenu offers "Check for Updates…"`)
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
