package apperr

import (
	"crypto/x509"
	"errors"
	"fmt"
	"strings"
)

// o3 talks to the instance through the shared CLI client, which uses Go's
// default transport — the system trust store, no InsecureSkipVerify anywhere.
// An instance behind a self-signed certificate is therefore unreachable, and
// that is a deliberate product decision rather than a gap: see
// docs/superpowers/specs/2026-06-26-openobserve-desktop-shared-config-contexts-design.md.
//
// The failure used to surface as a bare "request to /api/_meta failed", because
// apiclient replaces the message when it wraps a transport error and only
// {category, message, hint} cross the Wails boundary. The x509 cause survives in
// the wrap chain, though, so classifying it here turns an opaque network error
// into an explanation the user can act on — and into the one place that says
// plainly which certificates o3 will and will not accept.

const (
	// selfSignedHint is the advice for a certificate no root in the system store
	// vouches for — the self-signed case, and the only one where installing a CA
	// is the fix. It names the limitation instead of implying a missing setting.
	selfSignedHint = "o3 does not support self-signed certificates. Add the issuing CA to your system trust store (Keychain Access on macOS), or serve a publicly trusted certificate."
	expiredHint    = "Renew the certificate on the server. o3 cannot skip certificate checks."
	hostnameHint   = "Connect using the hostname the certificate was issued for, or reissue it for this address. o3 cannot skip certificate checks."
)

// certFailure reports whether err was caused by a TLS certificate the system
// does not accept, and returns the message and hint to show for it. It is pure:
// the classification depends only on err, so it is exercised directly by tests
// rather than through a live TLS handshake.
func certFailure(err error) (msg, hint string, ok bool) {
	if err == nil {
		return "", "", false
	}

	// Typed detection first — it reaches through *url.Error,
	// *tls.CertificateVerificationError and the CLI's *CLIError alike, since all
	// of them implement Unwrap.
	var unknownAuthority x509.UnknownAuthorityError
	if errors.As(err, &unknownAuthority) {
		return "the server's TLS certificate is not trusted", selfSignedHint, true
	}

	var hostname x509.HostnameError
	if errors.As(err, &hostname) {
		return fmt.Sprintf("the server's TLS certificate is not valid for %s", hostname.Host), hostnameHint, true
	}

	var invalid x509.CertificateInvalidError
	if errors.As(err, &invalid) {
		if invalid.Reason == x509.Expired {
			return "the server's TLS certificate has expired", expiredHint, true
		}
		return "the server's TLS certificate is not trusted", selfSignedHint, true
	}

	// Fallback for platform verifiers that report trust failures as plain text.
	// The markers must be unambiguous: the network category's stock hint mentions
	// "TLS" in passing, and matching that would blame the certificate for every
	// refused connection.
	text := strings.ToLower(err.Error())
	switch {
	case strings.Contains(text, "certificate has expired"),
		strings.Contains(text, "certificate is expired"):
		return "the server's TLS certificate has expired", expiredHint, true
	case strings.Contains(text, "x509:"),
		strings.Contains(text, "tls: failed to verify certificate"),
		strings.Contains(text, "certificate is not trusted"):
		return "the server's TLS certificate is not trusted", selfSignedHint, true
	}

	return "", "", false
}
