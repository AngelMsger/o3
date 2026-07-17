package main

import "os"

// nativeUpdater is the seam between App and an OS update framework: Sparkle on
// macOS, WinSparkle on Windows. Release builds compile a real implementation in
// with the "native_updater" build tag; everything else (dev builds, tests, all
// of Linux) gets nil from newNativeUpdater and keeps the custom check-only flow
// in app_update.go. The frameworks own the whole update UX — dialogs, download,
// EdDSA verification, install and relaunch — so App only ever starts them,
// forwards the explicit "check now" gesture, and mirrors the auto-check pref.
type nativeUpdater interface {
	// Start configures and launches the framework. Called once from startup with
	// the persisted auto-check preference; the framework self-schedules its
	// background checks from then on.
	Start(a *App, autoCheck bool)
	// CheckNow runs an explicit, user-visible update check (native dialog).
	CheckNow()
	// SetAutoCheck mirrors the Settings toggle into the framework.
	SetAutoCheck(on bool)
	// Shutdown releases framework resources (WinSparkle requires a Cleanup).
	Shutdown()
}

const (
	// appcastURL is the released update feed. /releases/latest/download resolves
	// to the newest PUBLISHED release, so drafts and prereleases never reach the
	// fleet, and the appcast is exposed atomically with the binaries it points
	// at. Must stay in lockstep with SUFeedURL in build/darwin/Info.plist.
	appcastURL = "https://github.com/AngelMsger/o3/releases/latest/download/appcast.xml"

	// sparkleEdPublicKey verifies the EdDSA signature on every update archive
	// before WinSparkle installs it (macOS reads the same key from SUPublicEDKey
	// in build/darwin/Info.plist — keep the two in lockstep). The builds are not
	// code-signed, so this signature is the ONLY integrity check on an update;
	// an empty key disables the native updater rather than run without it, and
	// the release workflow refuses to ship while this placeholder is empty.
	//
	// Fill in with the public half of the keypair from Sparkle's generate_keys
	// (see docs/auto-update.md).
	sparkleEdPublicKey = ""
)

// appcastFeedURL returns the update feed, honouring the O3_APPCAST_URL override
// (mirroring O3_UPDATE_REPO in internal/update). The override exists for local
// end-to-end testing against a locally served appcast; it cannot smuggle in an
// unsigned build, because the EdDSA check still applies to whatever it serves.
func appcastFeedURL() string {
	if u := os.Getenv("O3_APPCAST_URL"); u != "" {
		return u
	}
	return appcastURL
}
