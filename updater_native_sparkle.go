//go:build darwin && native_updater

package main

/*
#include <stdint.h>
void o3_dispatch_main(uintptr_t h);
*/
import "C"

import (
	"runtime/cgo"

	sparkle "github.com/abemedia/go-sparkle"
)

// sparkleUpdater drives Sparkle (https://sparkle-project.org) through the
// go-sparkle binding. Importing that package initialises [SUUpdater
// sharedUpdater] at Go init time; the updater reads its configuration from
// Info.plist (SUFeedURL, SUPublicEDKey, SUEnableAutomaticChecks — see
// build/darwin/Info.plist) and schedules its own background checks. Linking
// requires CGO_LDFLAGS='-Wl,-rpath,@loader_path/../Frameworks' and running
// requires the real Sparkle.framework inside the app bundle
// (scripts/sparkle-framework.sh) — which is why this file only compiles under
// the native_updater tag that release builds set.
type sparkleUpdater struct{}

func newNativeUpdater() nativeUpdater { return &sparkleUpdater{} }

func (s *sparkleUpdater) Start(_ *App, autoCheck bool) {
	feed := appcastFeedURL()
	onMainThread(func() {
		// The o3 pref is the source of truth for the toggle: pushing it on every
		// launch keeps Settings honest without a Sparkle-side getter.
		sparkle.SetAutomaticallyChecksForUpdates(autoCheck)
		if feed != appcastURL { // local e2e override; persists in user defaults
			sparkle.SetFeedURL(feed)
		}
	})
}

func (s *sparkleUpdater) CheckNow() {
	onMainThread(sparkle.CheckForUpdates)
}

func (s *sparkleUpdater) SetAutoCheck(on bool) {
	onMainThread(func() { sparkle.SetAutomaticallyChecksForUpdates(on) })
}

func (s *sparkleUpdater) Shutdown() {}

// onMainThread runs f on the Cocoa main queue. go-sparkle's C shim calls
// SUUpdater on whatever thread invokes it, but SPUUpdater (and the update UI it
// presents) is main-thread-only — and Wails dispatches bound methods on
// arbitrary goroutines. The trampoline hands a cgo.Handle through
// dispatch_async (updater_native_sparkle_dispatch.c) back into Go.
func onMainThread(f func()) {
	C.o3_dispatch_main(C.uintptr_t(cgo.NewHandle(f)))
}

//export o3SparkleTrampoline
func o3SparkleTrampoline(h C.uintptr_t) {
	hh := cgo.Handle(h)
	f := hh.Value().(func())
	hh.Delete()
	f()
}
