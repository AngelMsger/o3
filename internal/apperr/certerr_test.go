package apperr

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"testing"

	cerr "github.com/angelmsger/openobserve-cli/pkg/errors"
)

func TestCertFailureUnknownAuthority(t *testing.T) {
	msg, hint, ok := certFailure(x509.UnknownAuthorityError{})
	if !ok {
		t.Fatal("certFailure did not classify UnknownAuthorityError as a certificate failure")
	}
	if !strings.Contains(msg, "not trusted") {
		t.Fatalf("Message = %q, want it to say the certificate is not trusted", msg)
	}
	if !strings.Contains(hint, "self-signed") {
		t.Fatalf("Hint = %q, want it to name self-signed certificates", hint)
	}
}

func TestCertFailureExpired(t *testing.T) {
	msg, hint, ok := certFailure(x509.CertificateInvalidError{Reason: x509.Expired})
	if !ok {
		t.Fatal("certFailure did not classify an expired certificate")
	}
	if !strings.Contains(msg, "expired") {
		t.Fatalf("Message = %q, want it to say the certificate expired", msg)
	}
	if !strings.Contains(hint, "Renew") {
		t.Fatalf("Hint = %q, want it to suggest renewing the certificate", hint)
	}
}

func TestCertFailureHostnameMismatch(t *testing.T) {
	msg, _, ok := certFailure(x509.HostnameError{Host: "o2.internal"})
	if !ok {
		t.Fatal("certFailure did not classify a hostname mismatch")
	}
	if !strings.Contains(msg, "o2.internal") {
		t.Fatalf("Message = %q, want it to name the host that was asked for", msg)
	}
}

// The real failure arrives buried: transport wraps it in *url.Error, crypto/tls
// wraps the x509 error, and apiclient wraps that in a CLIError whose own message
// says nothing about certificates. Detection has to reach through all of it.
func TestCertFailureThroughTheRealWrapChain(t *testing.T) {
	deep := cerr.Wrap(
		&url.Error{
			Op:  "Get",
			URL: "https://o2.internal:5080/api/_meta",
			Err: &tls.CertificateVerificationError{Err: x509.UnknownAuthorityError{}},
		},
		cerr.CategoryNetwork, "NETWORK", "request to /api/_meta failed",
	)
	if _, _, ok := certFailure(deep); !ok {
		t.Fatal("certFailure did not reach the x509 cause through url.Error/tls/CLIError")
	}
}

// Some platform verifiers report trust failures without the typed x509 errors,
// so the text of the chain is a fallback — but only for unambiguous markers.
func TestCertFailureTextFallback(t *testing.T) {
	err := fmt.Errorf("Get %q: %w", "https://o2.internal",
		errors.New("tls: failed to verify certificate: x509: certificate signed by unknown authority"))
	if _, _, ok := certFailure(err); !ok {
		t.Fatal("certFailure did not recognise an x509 trust failure by its text")
	}
}

func TestCertFailureIgnoresNonCertErrors(t *testing.T) {
	// The network category's stock hint mentions TLS in passing. Matching on the
	// bare word would misreport every refused connection as a bad certificate.
	cases := []error{
		nil,
		errors.New("dial tcp 127.0.0.1:5080: connect: connection refused"),
		errors.New("context deadline exceeded"),
		cerr.New(cerr.CategoryNetwork, "NETWORK", "request to /api/_meta failed"),
		cerr.New(cerr.CategoryAuth, "AUTH", "unauthorized"),
	}
	for _, err := range cases {
		if _, _, ok := certFailure(err); ok {
			t.Fatalf("certFailure(%v) = true, want false", err)
		}
	}
}

// Wrap is the single boundary every Wails-bound method funnels errors through,
// so classifying there covers Test Connection, queries and sign-in alike.
func TestWrapSurfacesCertificateFailure(t *testing.T) {
	src := cerr.Wrap(
		&tls.CertificateVerificationError{Err: x509.UnknownAuthorityError{}},
		cerr.CategoryNetwork, "NETWORK", "request to /api/_meta failed",
	)
	var ae AppError
	if !errors.As(Wrap(src), &ae) {
		t.Fatal("Wrap did not produce an AppError")
	}
	if ae.Category != "network" {
		t.Fatalf("Category = %q, want %q — a cert failure is still a network failure", ae.Category, "network")
	}
	if !strings.Contains(ae.Message, "not trusted") {
		t.Fatalf("Message = %q, want the certificate explanation, not %q", ae.Message, "request to /api/_meta failed")
	}
	if !strings.Contains(ae.Hint, "self-signed") {
		t.Fatalf("Hint = %q, want it to name self-signed certificates", ae.Hint)
	}
}
