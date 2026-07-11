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
)

type captureResult struct {
	session pkgauth.Session
	err     error
}

// Capture state. captureCh is the channel the CURRENT capture is waiting on;
// each new Capture supersedes any previous one (unblocking it) so a missed
// window-close can never permanently wedge the flow.
var (
	captureMu     sync.Mutex
	captureHost   string
	captureCh     chan captureResult
	captureVerify VerifyFunc
	verifyBusy    bool   // an API probe is in flight
	verifySig     string // cookie+authz signature of the last probed state
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
func Capture(loginURL, host string, verify VerifyFunc) (pkgauth.Session, error) {
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
	captureHost = host
	captureVerify = verify
	verifyBusy = false
	verifySig = ""
	captureMu.Unlock()

	log.Printf("[webauth] Capture start host=%s url=%s", host, loginURL)
	cURL := C.CString(loginURL)
	C.o3StartWebAuth(cURL)
	C.free(unsafe.Pointer(cURL))

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
	host, ch, verify, busy := captureHost, captureCh, captureVerify, verifyBusy
	captureMu.Unlock()
	if ch == nil {
		return 0
	}
	cookies, currentURL, authz, email, err := parseProbe(data)
	if err != nil {
		return 0
	}
	sess := AssembleSession(cookies, host, authz, email)

	// No verifier (should not happen in the app, but keeps tests and any future
	// caller working): fall back to the pure cookie/URL heuristic and close the
	// window synchronously by returning 1.
	if verify == nil {
		if !LoginSucceeded(currentURL, host, cookies) {
			return 0
		}
		log.Printf("[webauth] probe success (heuristic) email=%q url=%s", email, currentURL)
		deliver(ch, captureResult{session: sess})
		return 1
	}

	// The authenticated API probe is the sole success signal: it confirms the
	// captured cookies actually authenticate, so a benign cookie on the login
	// page or an in-progress external SSO redirect can never be mistaken for a
	// completed login. Only probe when there are host-scoped cookies to replay,
	// and skip while a probe is in flight or the captured state is unchanged
	// (so a static page is not re-probed every timer tick). The probe runs off
	// the main thread; on success the goroutine closes the window itself.
	scoped := FilterForHost(cookies, host)
	if len(scoped) == 0 {
		return 0
	}
	sig := SerializeCookies(scoped) + "\n" + authz
	if busy || sig == verifySig {
		return 0
	}
	captureMu.Lock()
	verifyBusy = true
	verifySig = sig
	captureMu.Unlock()
	go func() {
		ok := verify(sess)
		captureMu.Lock()
		verifyBusy = false
		active := captureCh == ch
		captureMu.Unlock()
		if ok && active {
			log.Printf("[webauth] probe success (verified) email=%q url=%s", email, currentURL)
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
