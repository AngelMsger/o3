# Self-signed certificates: remove the dead toggle, say so plainly

Date: 2026-07-31

## Problem

The Setup Wizard carried a "Trust Self-Signed Certificate" toggle that did
nothing. `selfSigned` was local React state in `App.tsx`, passed to `SetupWizard`
only to colour the switch. No Wails-bound method ever received it: neither
`handleTestContext` nor `handleSaveContext` included it, and the Go side has no
TLS handling at all — `buildClient` passes only BaseURL/Org/AuthDecorator/
Timeout/MaxRetries into `api.Build`, and `apiclient.BuildParams` in the sibling
`openobserve-cli` module has no TLS field. `transport.New` builds a plain
`&http.Client{Timeout: ...}` on the default transport.

So the app promised an exception it has never made. Worse, the toggle was hidden
for browser sign-in (`{!isSession && ...}`), which is the path where an untrusted
certificate bites hardest: WKWebView rejects one on its own.

## Decision: remove it (option b)

Wiring it for real would mean adding a TLS-skip field to the shared config
schema, threading it through a sibling module that ships as a CLI, and adding a
`didReceiveAuthenticationChallenge` delegate to `webauth_darwin.m` so browser
sign-in could reach such an instance too. That is a cross-module feature with a
real security surface — and it was already ruled out on the record:

> `selfSigned` / TLS-skip-verify wiring. The toggle stays UI-only (it was never
> wired in M2, and the CLI config schema has no field for it).
> — `2026-06-26-openobserve-desktop-shared-config-contexts-design.md`, Non-goals

That non-goal stands. What changes is that the UI now matches it. Supporting
self-signed instances remains open as its own decision; it is not a side effect
of fixing dead UI.

## What the user sees instead

**A note where the toggle was.** Shown only when the URL will actually use TLS,
and shown for every auth method including browser sign-in: this server's
certificate must be trusted by your system; self-signed certificates are not
supported; add the issuing CA to your system trust store, or serve a publicly
trusted certificate.

**An explained failure.** Previously a rejected certificate surfaced as
`request to /api/_meta failed` with the stock network hint — `apiclient` replaces
the message when it wraps a transport error, and only `{category, message, hint}`
cross the Wails boundary, so the `x509` detail was lost. The cause chain does
survive (`CLIError.Unwrap`), so `apperr.Wrap` now classifies it and substitutes
the certificate explanation. Category stays `network`; a cert failure is still a
network failure.

## Components

| Unit | Purpose |
| --- | --- |
| `internal/apperr/certerr.go` — `certFailure(err)` | Pure. Classifies a TLS trust failure into (message, hint, ok). Typed detection via `errors.As` on `x509.UnknownAuthorityError` / `HostnameError` / `CertificateInvalidError`, with an unambiguous-text fallback for platform verifiers that report trust failures without the typed errors. |
| `internal/apperr/apperr.go` — `Wrap` | The single boundary every Wails-bound method funnels errors through, so classifying there covers Test Connection, queries and sign-in alike. |
| `frontend/src/lib/tls.ts` — `usesTLS(url)` | Pure. Whether a context URL will be reached over TLS, so the note never appears for `http://localhost`. A scheme-less URL counts as TLS, mirroring `normalizeURL` in `app.go`, which prepends `https://`. |
| `ConnTest` error variant | Gains an optional `hint`. `connTestLabel` still returns the message alone; the hint renders on its own line. |

Three hints, because the fix differs: unknown authority (the self-signed case) →
install the CA; expired → renew it; hostname mismatch → use the name it was
issued for. Each states that o3 cannot skip the check.

## Testing

- `internal/apperr/certerr_test.go` — each x509 error kind; the real wrap chain
  (`CLIError` → `url.Error` → `tls.CertificateVerificationError` → x509); the
  text fallback; and non-cert errors, including a `CategoryNetwork` error whose
  stock hint mentions TLS in passing (matching the bare word would blame the
  certificate for every refused connection).
- `app_tls_test.go` — an `httptest.NewTLSServer` (self-signed by construction)
  driven through the real `buildClient` → `Ping` → `apperr.Wrap` path. Pins both
  halves: refused, and explained.
- `frontend/src/lib/tls.test.ts` — https / http / scheme-less / case and
  whitespace / empty.
