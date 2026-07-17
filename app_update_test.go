package main

import (
	"context"
	"errors"
	"testing"

	"github.com/angelmsger/o3/internal/config"
	"github.com/angelmsger/o3/internal/update"
)

// newUpdateApp isolates the prefs file (via $HOME / $XDG_CONFIG_HOME, the two
// inputs to os.UserConfigDir) and injects a stub release fetcher, so the update
// methods can be exercised without touching the real config or the network.
func newUpdateApp(t *testing.T, current string, rel update.Release, fetchErr error) *App {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	fetch := func(context.Context) (update.Release, error) { return rel, fetchErr }
	return &App{
		ctx: context.Background(),
		upd: update.New(current, fetch, "darwin", "arm64"),
		// Swallow events: the real emitter rejects a non-Wails context.
		emit: func(context.Context, string, ...interface{}) {},
	}
}

func newerRelease() update.Release {
	return update.Release{
		TagName: "v1.3.0",
		Name:    "o3 v1.3.0",
		Body:    "## What's Changed\n* feat: thing",
		HTMLURL: "https://github.com/AngelMsger/o3/releases/tag/v1.3.0",
		Assets: []update.Asset{
			{Name: "o3-1.3.0-universal.dmg", BrowserDownloadURL: "https://dl/dmg"},
		},
	}
}

func TestCheckForUpdatesReportsWithoutPopulatingBackgroundCache(t *testing.T) {
	a := newUpdateApp(t, "1.2.0", newerRelease(), nil)

	res, err := a.CheckForUpdates()
	if err != nil {
		t.Fatalf("CheckForUpdates() error = %v", err)
	}
	if !res.UpdateAvailable || res.LatestVersion != "1.3.0" {
		t.Fatalf("got %+v, want an update to 1.3.0", res)
	}
	// Explicit checks return their result directly to the caller. PendingUpdate
	// is only the background event-race cache; putting an explicit result there
	// makes a version reappear after the user skips it and the frontend remounts.
	if got := a.PendingUpdate(); got.UpdateAvailable {
		t.Errorf("PendingUpdate() = %+v after explicit check, want empty background cache", got)
	}
	// An explicit check is still a check: it stamps the throttle.
	p, err := config.LoadPrefs()
	if err != nil {
		t.Fatal(err)
	}
	if p.LastUpdateCheck == "" {
		t.Error("LastUpdateCheck not stamped by an explicit check")
	}
}

// The explicit check must surface failures — unlike the background one, the user
// is watching and deserves to know the check did not happen.
func TestCheckForUpdatesReturnsErrors(t *testing.T) {
	a := newUpdateApp(t, "1.2.0", update.Release{}, errors.New("network is down"))

	if _, err := a.CheckForUpdates(); err == nil {
		t.Fatal("CheckForUpdates() error = nil, want the fetch failure")
	}
	p, _ := config.LoadPrefs()
	if p.LastUpdateCheck != "" {
		t.Error("a failed check stamped the throttle; it must be retried next launch")
	}
}

func TestSkipUpdateVersion(t *testing.T) {
	a := newUpdateApp(t, "1.2.0", newerRelease(), nil)

	if err := a.SkipUpdateVersion("1.3.0"); err != nil {
		t.Fatal(err)
	}
	p, err := config.LoadPrefs()
	if err != nil {
		t.Fatal(err)
	}
	if p.SkipVersion != "1.3.0" {
		t.Fatalf("SkipVersion = %q, want 1.3.0", p.SkipVersion)
	}
}

func TestSetAutoUpdateCheck(t *testing.T) {
	a := newUpdateApp(t, "1.2.0", newerRelease(), nil)

	// The default is on.
	if p, _ := config.LoadPrefs(); p.UpdateCheck != "auto" {
		t.Fatalf("default UpdateCheck = %q, want auto", p.UpdateCheck)
	}
	if err := a.SetAutoUpdateCheck(false); err != nil {
		t.Fatal(err)
	}
	if p, _ := config.LoadPrefs(); p.UpdateCheck != "off" {
		t.Fatalf("UpdateCheck = %q, want off", p.UpdateCheck)
	}
	if err := a.SetAutoUpdateCheck(true); err != nil {
		t.Fatal(err)
	}
	if p, _ := config.LoadPrefs(); p.UpdateCheck != "auto" {
		t.Fatalf("UpdateCheck = %q, want auto", p.UpdateCheck)
	}
}

// The frontend sends SavePrefs({theme, accent, density}) on every theme change.
// If that overwrote the whole struct it would wipe the skipped version and the
// check throttle every time the user touched the accent color.
func TestSavePrefsDoesNotClobberUpdateFields(t *testing.T) {
	a := newUpdateApp(t, "1.2.0", newerRelease(), nil)

	if err := a.SkipUpdateVersion("1.3.0"); err != nil {
		t.Fatal(err)
	}
	if err := a.SetAutoUpdateCheck(false); err != nil {
		t.Fatal(err)
	}

	// A UI-only save, exactly as App.tsx sends it.
	if err := a.SavePrefs(config.Prefs{Theme: "light", Accent: "#ff0000", Density: "cozy"}); err != nil {
		t.Fatal(err)
	}

	p, err := config.LoadPrefs()
	if err != nil {
		t.Fatal(err)
	}
	if p.Theme != "light" || p.Accent != "#ff0000" || p.Density != "cozy" {
		t.Errorf("UI fields not saved: %+v", p)
	}
	if p.SkipVersion != "1.3.0" {
		t.Errorf("SkipVersion = %q, want it preserved as 1.3.0", p.SkipVersion)
	}
	if p.UpdateCheck != "off" {
		t.Errorf("UpdateCheck = %q, want it preserved as off", p.UpdateCheck)
	}
}

func TestAppInfo(t *testing.T) {
	a := &App{}
	info := a.AppInfo()
	if info.Version != version {
		t.Errorf("Version = %q, want %q", info.Version, version)
	}
	// The test binary is built without the release ldflag, so it is a dev build.
	if !info.IsDev {
		t.Errorf("IsDev = false for version %q, want true", info.Version)
	}
	if info.OS == "" || info.Arch == "" || info.Wails == "" {
		t.Errorf("AppInfo() = %+v, want the platform populated", info)
	}
}

// A version the user skipped must not come back through PendingUpdate. The event
// path and the PendingUpdate path both open the sheet, so filtering only the
// event let the cache smuggle a dismissed release onto the screen at mount.
func TestBackgroundCheckDoesNotCacheASkippedVersion(t *testing.T) {
	a := newUpdateApp(t, "1.2.0", newerRelease(), nil) // the release is v1.3.0
	if err := a.SkipUpdateVersion("1.3.0"); err != nil {
		t.Fatal(err)
	}

	a.runBackgroundUpdateCheck(context.Background())

	if got := a.PendingUpdate(); got.UpdateAvailable {
		t.Fatalf("PendingUpdate() = %q, want nothing: the user skipped that version", got.LatestVersion)
	}
}

// The ordinary case still caches, otherwise the race fix does nothing.
func TestBackgroundCheckCachesAnUnskippedVersion(t *testing.T) {
	a := newUpdateApp(t, "1.2.0", newerRelease(), nil)

	a.runBackgroundUpdateCheck(context.Background())

	got := a.PendingUpdate()
	if !got.UpdateAvailable || got.LatestVersion != "1.3.0" {
		t.Fatalf("PendingUpdate() = %+v, want the 1.3.0 update cached for mount", got)
	}
}

func TestSkippingCachedVersionClearsPendingUpdate(t *testing.T) {
	a := newUpdateApp(t, "1.2.0", newerRelease(), nil)
	a.runBackgroundUpdateCheck(context.Background())
	if !a.PendingUpdate().UpdateAvailable {
		t.Fatal("background result was not cached")
	}

	if err := a.SkipUpdateVersion("1.3.0"); err != nil {
		t.Fatal(err)
	}
	if got := a.PendingUpdate(); got.UpdateAvailable {
		t.Fatalf("PendingUpdate() = %+v after skip, want cache cleared", got)
	}
}

// The preferences used after a slow network call must be current, not the
// snapshot taken before the call. Otherwise a manual check can skip a release
// while the startup check is in flight, only for the startup check to emit and
// cache that same release a moment later.
func TestBackgroundCheckHonorsSkipChangedWhileRequestIsInFlight(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	started := make(chan struct{})
	release := make(chan struct{})
	fetch := func(context.Context) (update.Release, error) {
		close(started)
		<-release
		return newerRelease(), nil
	}
	a := &App{
		ctx:  context.Background(),
		upd:  update.New("1.2.0", fetch, "darwin", "arm64"),
		emit: func(context.Context, string, ...interface{}) { t.Error("skipped release was emitted") },
	}
	done := make(chan struct{})
	go func() {
		a.runBackgroundUpdateCheck(context.Background())
		close(done)
	}()
	<-started
	if err := a.SkipUpdateVersion("1.3.0"); err != nil {
		t.Fatal(err)
	}
	close(release)
	<-done

	if got := a.PendingUpdate(); got.UpdateAvailable {
		t.Fatalf("PendingUpdate() = %+v, want in-flight skipped release suppressed", got)
	}
}

// "off" means off: no cache, no event.
func TestBackgroundCheckRespectsAutoCheckOff(t *testing.T) {
	a := newUpdateApp(t, "1.2.0", newerRelease(), nil)
	if err := a.SetAutoUpdateCheck(false); err != nil {
		t.Fatal(err)
	}

	a.runBackgroundUpdateCheck(context.Background())

	if got := a.PendingUpdate(); got.UpdateAvailable {
		t.Fatal("PendingUpdate() returned a result with the background check disabled")
	}
}

// fakeNative records calls so the native-mode dispatch in App can be tested
// without a real framework (which only links inside a packaged release build).
type fakeNative struct {
	checks int
	auto   []bool
}

func (f *fakeNative) Start(*App, bool)     {}
func (f *fakeNative) CheckNow()            { f.checks++ }
func (f *fakeNative) SetAutoCheck(on bool) { f.auto = append(f.auto, on) }
func (f *fakeNative) Shutdown()            {}

// Without the native_updater tag every build is custom mode, and the About tab
// keys its whole update UI off this field.
func TestAppInfoUpdateModeReflectsNativeUpdater(t *testing.T) {
	if got := (&App{}).AppInfo().UpdateMode; got != "custom" {
		t.Errorf("UpdateMode = %q without a native updater, want custom", got)
	}
	a := &App{native: &fakeNative{}}
	if got := a.AppInfo().UpdateMode; got != "native" {
		t.Errorf("UpdateMode = %q with a native updater, want native", got)
	}
}

// In custom mode the explicit-check gesture pokes the frontend, which owns the
// update sheet; the menu item and the About button both route through here.
func TestRequestUpdateCheckEmitsInCustomMode(t *testing.T) {
	var events []string
	a := &App{
		ctx:  context.Background(),
		emit: func(_ context.Context, name string, _ ...interface{}) { events = append(events, name) },
	}
	a.RequestUpdateCheck()
	if len(events) != 1 || events[0] != EventUpdateCheckRequested {
		t.Fatalf("emitted %v, want exactly [%s]", events, EventUpdateCheckRequested)
	}

	// Before startup there is no Wails context to emit into; the click is dropped.
	early := &App{emit: func(context.Context, string, ...interface{}) { t.Error("emitted with nil ctx") }}
	early.RequestUpdateCheck()
}

// In native mode the same gesture hands control to the framework instead.
func TestRequestUpdateCheckDelegatesToNativeUpdater(t *testing.T) {
	fake := &fakeNative{}
	a := &App{native: fake, emit: func(context.Context, string, ...interface{}) {
		t.Error("native mode must not emit the custom-flow event")
	}}
	a.RequestUpdateCheck()
	if fake.checks != 1 {
		t.Fatalf("CheckNow called %d times, want 1", fake.checks)
	}
}

// The pref stays the source of truth; native mode additionally mirrors the
// toggle into the framework so its self-scheduled checks obey it.
func TestSetAutoUpdateCheckMirrorsIntoNativeUpdater(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	fake := &fakeNative{}
	a := &App{native: fake}

	if err := a.SetAutoUpdateCheck(false); err != nil {
		t.Fatal(err)
	}
	if err := a.SetAutoUpdateCheck(true); err != nil {
		t.Fatal(err)
	}
	if p, _ := config.LoadPrefs(); p.UpdateCheck != "auto" {
		t.Errorf("UpdateCheck = %q, want auto persisted", p.UpdateCheck)
	}
	if len(fake.auto) != 2 || fake.auto[0] != false || fake.auto[1] != true {
		t.Errorf("SetAutoCheck saw %v, want [false true]", fake.auto)
	}
}
