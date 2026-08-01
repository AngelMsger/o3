//go:build darwin

package webauth

import (
	"strings"
	"testing"
)

// The injected script is a WKUserScript, which WebKit evaluates in every frame
// and every document — including a full-page or iframed identity provider on a
// different origin. Without the host gate, an IdP that sends its own
// Authorization header over XHR or fetch has that header captured and stored as
// the user's OpenObserve credential, then replayed to the OpenObserve instance.
// Pin that o3 passes the instance host through to the shared script.
func TestProbeScriptIsScopedToTheInstanceHost(t *testing.T) {
	js := probeScript("observe.example.com:5080")

	// The delivery shim must still be there and still bind o3's handler.
	if !strings.Contains(js, "window.webkit.messageHandlers.o3.postMessage") {
		t.Fatal("the WebKit delivery shim is missing")
	}
	if !strings.HasPrefix(js, "window."+bindingName+"=") {
		t.Fatalf("the shim must define the binding before the shared script runs: %s", js)
	}

	// location.hostname carries no port, so the gate compares the host without
	// one; otherwise it would reject the very instance it is scoping to.
	if !strings.Contains(js, `var t="observe.example.com";`) {
		t.Fatalf("the shared script is not scoped to the instance host: %s", js)
	}
	if !strings.Contains(js, "location.hostname") {
		t.Fatal("the script does not consult location.hostname")
	}

	// The gate must precede every capture hook.
	gate := strings.Index(js, "{return;}")
	if gate < 0 {
		t.Fatalf("no origin gate in the injected script: %s", js)
	}
	for _, hook := range []string{
		"window.fetch", "XMLHttpRequest.prototype.setRequestHeader", "localStorage",
	} {
		if idx := strings.Index(js, hook); idx < gate {
			t.Errorf("%q is installed at %d, before the origin gate at %d; "+
				"a foreign origin would still be captured", hook, idx, gate)
		}
	}
}
