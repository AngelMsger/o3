//go:build windows && native_updater

package main

import (
	winsparkle "github.com/abemedia/go-winsparkle"

	// The dll subpackage go:embeds WinSparkle.dll, extracts it to
	// %TEMP%\WinSparkle-<version>\ at init and prepends that directory to PATH —
	// so neither the NSIS installer nor the portable zip has to ship the DLL.
	// Fallback if that ever misbehaves: drop this import, add WinSparkle.dll
	// beside o3.exe (a File line in build/windows/installer/project.nsi and the
	// 7z step in .github/workflows/release.yml).
	_ "github.com/abemedia/go-winsparkle/dll"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/angelmsger/o3/internal/update"
)

// winSparkleUpdater drives WinSparkle (https://winsparkle.org), the Windows
// port of Sparkle. It consumes the same appcast and the same EdDSA signatures;
// on accepting an update it downloads the -setup.exe enclosure, verifies it,
// asks o3 to quit (SetShutdownRequestCallback), and runs the installer.
type winSparkleUpdater struct {
	started bool
}

func newNativeUpdater() nativeUpdater { return &winSparkleUpdater{} }

func (w *winSparkleUpdater) Start(a *App, autoCheck bool) {
	// The builds are not code-signed, so the EdDSA appcast signature is the only
	// integrity check on an update. Without a key, do not start the updater at
	// all — a checker that would install unverified code is worse than none.
	// The release workflow refuses to ship with the placeholder key empty, so
	// this guard only ever trips on a misconfigured local build.
	if sparkleEdPublicKey == "" {
		println("winsparkle: no EdDSA public key baked in; native updater disabled")
		return
	}
	// The version WinSparkle compares appcast items against. Release packaging
	// strips prerelease suffixes for the .exe metadata, and the appcast's
	// sparkle:version is numeric for the same reason — Numeric keeps all three
	// aligned by construction.
	winsparkle.SetAppDetails("AngelMsger", "o3", update.Numeric(version))
	winsparkle.SetAppcastURL(appcastFeedURL())
	if err := winsparkle.SetEdDSAPublicKey(sparkleEdPublicKey); err != nil {
		println("winsparkle: rejected EdDSA public key:", err.Error())
		return
	}
	winsparkle.SetAutomaticCheckForUpdates(autoCheck)
	winsparkle.SetShutdownRequestCallback(func() {
		// WinSparkle has verified and staged the installer and needs the running
		// app gone. Quit posts to the main loop, so any callback thread is fine.
		if a.ctx != nil {
			wruntime.Quit(a.ctx)
		}
	})
	winsparkle.Init()
	w.started = true
}

func (w *winSparkleUpdater) CheckNow() {
	if !w.started {
		return
	}
	winsparkle.CheckUpdateWithUI()
}

func (w *winSparkleUpdater) SetAutoCheck(on bool) {
	if !w.started {
		return
	}
	winsparkle.SetAutomaticCheckForUpdates(on)
}

func (w *winSparkleUpdater) Shutdown() {
	if !w.started {
		return
	}
	winsparkle.Cleanup()
}
