//go:build !darwin

package main

import "github.com/wailsapp/wails/v2/pkg/menu"

// appMenu returns no menu on Windows and Linux: there, a Wails menu renders as an
// in-window menu bar, which would sit on top of o3's custom title bar. Both
// platforms reach the update check through Settings → About instead.
func appMenu(*App) *menu.Menu { return nil }

// installUpdateMenuItem is macOS-only (the injected app-menu item); Windows and
// Linux reach updates from Settings ▸ About.
func (a *App) installUpdateMenuItem() {}
