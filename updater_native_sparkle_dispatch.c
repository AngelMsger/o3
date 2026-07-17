//go:build darwin && native_updater

// The C half of onMainThread in updater_native_sparkle.go: hop onto the Cocoa
// main queue, then re-enter Go through the cgo-exported trampoline. Lives in
// its own file because a Go file with //export directives may only declare —
// not define — C functions in its preamble.

#include <stdint.h>
#include <dispatch/dispatch.h>
#include "_cgo_export.h"

void o3_dispatch_main(uintptr_t h) {
	dispatch_async(dispatch_get_main_queue(), ^{ o3SparkleTrampoline(h); });
}
