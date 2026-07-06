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
	"sync"
	"time"
	"unsafe"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
)

type captureResult struct {
	session pkgauth.Session
	err     error
}

// Single-flight capture state. Only one login window is open at a time; the
// native callbacks read host and deliver exactly once on ch.
var (
	captureMu   sync.Mutex
	captureHost string
	captureCh   chan captureResult
	captureDone bool
)

// Capture opens the native login window for loginURL, blocks until login is
// detected or the user closes the window, and returns the captured session.
// host scopes which cookies are kept. Safe to call from any goroutine; the
// AppKit work is marshalled onto the main thread.
func Capture(loginURL, host string) (pkgauth.Session, error) {
	captureMu.Lock()
	if captureCh != nil {
		captureMu.Unlock()
		return pkgauth.Session{}, errors.New("a sign-in window is already open")
	}
	ch := make(chan captureResult, 1)
	captureCh = ch
	captureHost = host
	captureDone = false
	captureMu.Unlock()

	cURL := C.CString(loginURL)
	C.o3StartWebAuth(cURL)
	C.free(unsafe.Pointer(cURL))

	var res captureResult
	select {
	case res = <-ch:
	case <-time.After(10 * time.Minute):
		res = captureResult{err: errors.New("browser sign-in timed out")}
	}

	captureMu.Lock()
	captureCh = nil
	captureHost = ""
	captureMu.Unlock()
	return res.session, res.err
}

//export webauthProbe
func webauthProbe(cjson *C.char) C.int {
	data := []byte(C.GoString(cjson))
	captureMu.Lock()
	host, done, ch := captureHost, captureDone, captureCh
	captureMu.Unlock()
	if done || ch == nil {
		return 0
	}
	cookies, currentURL, authz, email, err := parseProbe(data)
	if err != nil || !LoginSucceeded(currentURL, host, cookies) {
		return 0
	}
	sess := AssembleSession(cookies, host, authz, email)
	captureMu.Lock()
	if !captureDone {
		captureDone = true
		ch <- captureResult{session: sess}
	}
	captureMu.Unlock()
	return 1
}

//export webauthClosed
func webauthClosed() {
	captureMu.Lock()
	defer captureMu.Unlock()
	if captureDone || captureCh == nil {
		return
	}
	captureDone = true
	captureCh <- captureResult{err: errors.New("browser sign-in was cancelled")}
}
