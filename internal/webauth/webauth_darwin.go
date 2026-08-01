//go:build darwin

package webauth

/*
#cgo darwin CFLAGS: -fobjc-arc
#cgo darwin LDFLAGS: -framework Cocoa -framework WebKit
#include <stdlib.h>
#include "webauth_darwin.h"
*/
import "C"

import (
	"errors"
	"log"
	"sync"
	"time"
	"unsafe"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
	shared "github.com/angelmsger/openobserve-cli/pkg/webauth"
)

// bindingName is the global function the injected script calls with its JSON
// payload. It is scoped with an unlikely prefix so it cannot collide with
// anything in the sign-in page.
const bindingName = "__o3Probe"

// probeScript is what gets injected into the sign-in page: the shared capture
// script, prefixed with a shim binding its delivery function to o3's WebKit
// message handler. The shared script hands the delivery function a JSON STRING
// (the DevTools binding the CLI uses accepts only one string argument), while
// the Objective-C handler expects an object, so the shim parses it.
//
// host scopes the capture to the OpenObserve instance. WKUserScript runs in
// every frame and every document, so without it a full-page or iframed identity
// provider that sends its own Authorization header would have that header
// captured and stored as the user's OpenObserve credential.
func probeScript(host string) string {
	shim := "window." + bindingName +
		"=function(s){try{window.webkit.messageHandlers.o3.postMessage(JSON.parse(s));}catch(e){}};"
	return shim + shared.ProbeJS(bindingName, host)
}

type captureResult struct {
	session pkgauth.Session
	err     error
}

// Capture state. captureCh is the channel the CURRENT capture is waiting on;
// each new Capture supersedes any previous one (unblocking it) so a missed
// window-close can never permanently wedge the flow. captureTracker owns the
// success policy (assemble -> replayable -> verify-once) shared with the CLI.
var (
	captureMu      sync.Mutex
	captureCh      chan captureResult
	captureTracker *shared.Tracker
)

// deliver sends a result to ch only if it is still the active channel, exactly
// once, and clears the active channel. Non-blocking (buffered/superseded sends
// are dropped) so callbacks never stall the main thread.
func deliver(ch chan captureResult, res captureResult) {
	captureMu.Lock()
	if captureCh == ch {
		captureCh = nil
	}
	captureMu.Unlock()
	select {
	case ch <- res:
	default:
	}
}

// Capture opens the native login window for loginURL, blocks until login is
// detected or the user closes the window, and returns the captured session.
// host scopes which cookies are kept. Safe to call from any goroutine; the
// AppKit work is marshalled onto the main thread. Reopening supersedes any
// prior window rather than failing.
func Capture(loginURL, host string, verify shared.VerifyFunc) (pkgauth.Session, error) {
	ch := make(chan captureResult, 1)
	captureMu.Lock()
	if prev := captureCh; prev != nil {
		// Unblock a still-waiting previous Capture; its native window is closed
		// by o3StartWebAuth's supersede path.
		select {
		case prev <- captureResult{err: errors.New("browser sign-in restarted")}:
		default:
		}
	}
	captureCh = ch
	captureTracker = shared.NewTracker(host, verify)
	captureMu.Unlock()

	log.Printf("[webauth] Capture start host=%s url=%s", host, loginURL)
	cURL := C.CString(loginURL)
	cJS := C.CString(probeScript(host))
	C.o3StartWebAuth(cURL, cJS)
	C.free(unsafe.Pointer(cURL))
	C.free(unsafe.Pointer(cJS))

	var res captureResult
	select {
	case res = <-ch:
	case <-time.After(10 * time.Minute):
		deliver(ch, captureResult{err: errors.New("browser sign-in timed out")})
		res = captureResult{err: errors.New("browser sign-in timed out")}
	}
	log.Printf("[webauth] Capture done err=%v", res.err)
	return res.session, res.err
}

//export webauthProbe
func webauthProbe(cjson *C.char) C.int {
	data := []byte(C.GoString(cjson))
	captureMu.Lock()
	ch, tracker := captureCh, captureTracker
	captureMu.Unlock()
	if ch == nil || tracker == nil {
		return 0
	}
	cookies, currentURL, authz, email, err := parseProbe(data)
	if err != nil {
		return 0
	}
	// The shared Tracker owns the success policy: assemble, require something
	// replayable, and confirm with an authenticated API probe at most once per
	// distinct state. That probe makes a network request and this callback runs
	// on the AppKit main thread, so it MUST stay on a goroutine; on success the
	// goroutine closes the window itself rather than returning 1.
	go func() {
		sess, ok := tracker.Observe(cookies, currentURL, authz, email)
		if !ok {
			return
		}
		captureMu.Lock()
		active := captureCh == ch
		captureMu.Unlock()
		if active {
			log.Printf("[webauth] probe success email=%q url=%s", email, currentURL)
			deliver(ch, captureResult{session: sess})
			C.o3FinishWebAuth()
		}
	}()
	return 0
}

//export webauthClosed
func webauthClosed() {
	captureMu.Lock()
	ch := captureCh
	captureMu.Unlock()
	log.Printf("[webauth] window closed (active=%v)", ch != nil)
	if ch != nil {
		deliver(ch, captureResult{err: errors.New("browser sign-in was cancelled")})
	}
}
