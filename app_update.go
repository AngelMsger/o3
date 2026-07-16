package main

import (
	"context"
	"runtime"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/angelmsger/o3/internal/apperr"
	"github.com/angelmsger/o3/internal/config"
	"github.com/angelmsger/o3/internal/update"
)

// Events the backend emits to the frontend.
const (
	// EventUpdateAvailable carries an update.Result for a newer release found by
	// the background check.
	EventUpdateAvailable = "update:available"
	// EventUpdateCheckRequested is emitted by the macOS "Check for Updates…" menu
	// item. It carries no payload: the frontend runs the same explicit check the
	// About tab's button does.
	EventUpdateCheckRequested = "update:check-requested"
)

const (
	// updateStartupDelay keeps the check off the critical path of a cold launch.
	updateStartupDelay = 4 * time.Second
	// updateThrottle bounds how often the background check runs. The explicit
	// check ignores it.
	updateThrottle = 24 * time.Hour
	// wailsVersion is shown in the About card. It tracks the wails/v2 version in
	// go.mod; there is no exported constant to read it from.
	wailsVersion = "v2.12.0"
)

// AppInfo describes the running build, for the About card.
type AppInfo struct {
	Version string `json:"version"` // "dev" for local builds
	OS      string `json:"os"`
	Arch    string `json:"arch"`
	Wails   string `json:"wails"`
	IsDev   bool   `json:"isDev"`
}

// AppInfo reports the running version and platform.
func (a *App) AppInfo() AppInfo {
	return AppInfo{
		Version: version,
		OS:      runtime.GOOS,
		Arch:    runtime.GOARCH,
		Wails:   wailsVersion,
		IsDev:   update.IsDev(version),
	}
}

// CheckForUpdates runs the explicit check behind the About button and the macOS
// menu item. Unlike the background check it ignores the 24h throttle and the
// skipped version — the user asked — and it returns errors so the UI can say the
// check failed instead of silently claiming everything is fine.
func (a *App) CheckForUpdates() (update.Result, error) {
	res, err := a.upd.Check(a.ctx)
	if err != nil {
		return update.Result{}, apperr.Wrap(err)
	}
	a.updMu.Lock()
	a.pending = res
	if res.Checked {
		// Stamp the throttle: an explicit check is still a check.
		_ = config.MutatePrefs(func(p *config.Prefs) { p.LastUpdateCheck = nowRFC3339() })
	}
	a.updMu.Unlock()
	return res, nil
}

// PendingUpdate returns the result the background check found, or the zero value
// if it found nothing (or has not run yet).
//
// This exists to close a race: the background goroutine may emit
// EventUpdateAvailable before React has run its EventsOn effect, and Wails drops
// events with no listener. The frontend calls this once on mount, after
// subscribing, so a dropped event cannot lose the notification.
func (a *App) PendingUpdate() update.Result {
	a.updMu.Lock()
	defer a.updMu.Unlock()
	return a.pending
}

// SkipUpdateVersion records a version the user never wants to be prompted about
// again. The explicit check still reports it.
func (a *App) SkipUpdateVersion(v string) error {
	a.updMu.Lock()
	defer a.updMu.Unlock()
	return apperr.Wrap(config.MutatePrefs(func(p *config.Prefs) { p.SkipVersion = v }))
}

// SetAutoUpdateCheck enables or disables the background check on launch.
func (a *App) SetAutoUpdateCheck(on bool) error {
	mode := "off"
	if on {
		mode = "auto"
	}
	a.updMu.Lock()
	defer a.updMu.Unlock()
	return apperr.Wrap(config.MutatePrefs(func(p *config.Prefs) { p.UpdateCheck = mode }))
}

// backgroundUpdateCheck waits out the startup delay, then runs the check.
func (a *App) backgroundUpdateCheck(ctx context.Context) {
	select {
	case <-time.After(updateStartupDelay):
	case <-ctx.Done(): // never hold up a quit
		return
	}
	a.runBackgroundUpdateCheck(ctx)
}

// runBackgroundUpdateCheck is the check itself, split from the delay so tests can
// call it directly. Every failure is silent: a laptop that launched on a plane, a
// rate-limited IP and a GitHub outage must all look like "nothing to report", not
// an error the user has to dismiss. There is no toast system to show one in anyway.
func (a *App) runBackgroundUpdateCheck(ctx context.Context) {
	prefs, err := config.LoadPrefs()
	if err != nil || prefs.UpdateCheck == "off" {
		return
	}
	if last, err := time.Parse(time.RFC3339, prefs.LastUpdateCheck); err == nil &&
		time.Since(last) < updateThrottle {
		return
	}

	res, err := a.upd.Check(ctx)
	if err != nil {
		// Deliberately do NOT stamp LastUpdateCheck: a failed check should be
		// retried on the next launch, not throttled away for a day.
		return
	}
	if !res.Checked {
		return // a dev build
	}

	a.updMu.Lock()
	_ = config.MutatePrefs(func(p *config.Prefs) { p.LastUpdateCheck = nowRFC3339() })
	a.updMu.Unlock()

	// Nothing to report, or the user already told us to drop this version.
	//
	// This gate must come BEFORE a.pending is set, not just before the emit:
	// PendingUpdate() is a second route to the same sheet (it closes the
	// emit-before-listen race), so anything cached here surfaces on mount whether
	// or not the event fired. Filtering only the emit let a skipped version come
	// back through the cache.
	if !res.UpdateAvailable || res.LatestVersion == prefs.SkipVersion {
		return
	}

	a.updMu.Lock()
	a.pending = res
	a.updMu.Unlock()
	a.emitEvent(ctx, EventUpdateAvailable, res)
}

// emitEvent sends a Wails event, going through a.emit when set. Only tests set
// it: wruntime.EventsEmit rejects any context that did not come from a Wails
// lifecycle hook, so a test calling the check body directly cannot use the real
// one.
func (a *App) emitEvent(ctx context.Context, name string, data ...interface{}) {
	if a.emit != nil {
		a.emit(ctx, name, data...)
		return
	}
	wruntime.EventsEmit(ctx, name, data...)
}

func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }
