package main

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/angelmsger/o3/internal/apperr"
	cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"
)

// o3 has no way to skip certificate verification — the Setup Wizard's
// "Trust Self-Signed Certificate" toggle was wired to nothing and has been
// removed. This pins both halves of that decision against a real handshake:
// a self-signed instance is refused, and the refusal explains itself instead of
// surfacing the transport's opaque "request to /api/... failed".
//
// httptest.NewTLSServer serves its own self-signed certificate, which is exactly
// the situation the toggle claimed to handle.
func TestSelfSignedInstanceIsRefusedWithAnExplanation(t *testing.T) {
	srv := httptest.NewTLSServer(nil)
	defer srv.Close()

	client, err := buildClient(srv.URL, "default", "basic", "u@example.com", "pw", cfgshared.Defaults{MaxRetries: 1})
	if err != nil {
		t.Fatalf("buildClient: %v", err)
	}

	_, err = client.Ping(context.Background())
	if err == nil {
		t.Fatal("Ping succeeded against a self-signed instance — o3 must not trust one")
	}

	var ae apperr.AppError
	if !errors.As(apperr.Wrap(err), &ae) {
		t.Fatalf("Wrap did not produce an AppError: %T", err)
	}
	if !strings.Contains(ae.Message, "certificate") {
		t.Fatalf("Message = %q, want it to name the certificate", ae.Message)
	}
	if !strings.Contains(ae.Hint, "self-signed") {
		t.Fatalf("Hint = %q, want it to say self-signed certificates are unsupported", ae.Hint)
	}
}
