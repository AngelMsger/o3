package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
	cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"

	"github.com/angelmsger/o3/internal/config"
	"github.com/angelmsger/o3/internal/webauth"
)

// mockInstance is an httptest server standing in for OpenObserve: the login page
// sets a session cookie, and the org endpoint (which Ping calls) authenticates
// only when that cookie is replayed. This lets the whole capture->store->replay
// chain be exercised without the native WebView.
func mockInstance(t *testing.T) *httptest.Server {
	t.Helper()
	const sessionCookie = "SESSION123"
	mux := http.NewServeMux()
	mux.HandleFunc("/web/login", func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "auth_ext", Value: sessionCookie, Path: "/"})
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("/api/organizations", func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("auth_ext")
		if err != nil || c.Value != sessionCookie {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"message":"unauthorized"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"identifier":"default","name":"Default"}]}`))
	})
	return httptest.NewServer(mux)
}

// hostPort returns the host (with port) for scoping, and the bare hostname a
// real cookie's Domain carries (never a port), mirroring WKHTTPCookieStore.
func hostPort(t *testing.T, raw string) (host, cookieDomain string) {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse %q: %v", raw, err)
	}
	return u.Host, u.Hostname()
}

func TestSessionCaptureStoreReplay(t *testing.T) {
	srv := mockInstance(t)
	defer srv.Close()
	host, cookieDomain := hostPort(t, srv.URL)

	// 1. Simulate what the native window hands back: the cookie the login page
	//    set, shaped through the SAME pure funcs the window uses.
	cookies := []webauth.Cookie{{Name: "auth_ext", Value: "SESSION123", Domain: cookieDomain, Path: "/"}}
	sess := webauth.AssembleSession(cookies, host, "", "ops@example.com")
	blob, err := pkgauth.EncodeSession(sess)
	if err != nil {
		t.Fatalf("EncodeSession: %v", err)
	}

	// 2. The shared client replays the cookie; the authed call succeeds.
	client, err := buildClient(srv.URL, "default", pkgauth.SchemeSession, "", blob, cfgshared.Defaults{})
	if err != nil {
		t.Fatalf("buildClient: %v", err)
	}
	orgs, err := client.Ping(t.Context())
	if err != nil {
		t.Fatalf("Ping with replayed session failed: %v", err)
	}
	if len(orgs) != 1 {
		t.Fatalf("got %d orgs, want 1", len(orgs))
	}

	// 3. Negative: a session with the wrong cookie is rejected (401), proving the
	//    cookie is what authenticated above.
	badSess := webauth.AssembleSession(
		[]webauth.Cookie{{Name: "auth_ext", Value: "WRONG", Domain: cookieDomain, Path: "/"}}, host, "", "")
	badBlob, err := pkgauth.EncodeSession(badSess)
	if err != nil {
		t.Fatalf("EncodeSession(bad): %v", err)
	}
	badClient, err := buildClient(srv.URL, "default", pkgauth.SchemeSession, "", badBlob, cfgshared.Defaults{})
	if err != nil {
		t.Fatalf("buildClient(bad): %v", err)
	}
	if _, err := badClient.Ping(t.Context()); err == nil {
		t.Fatal("Ping with wrong cookie unexpectedly succeeded")
	}
}

// TestSessionVerifier proves the browser-sign-in success signal is a real
// authenticated request: a session whose cookie authenticates passes, while an
// unauthenticated one (the SSO / benign-cookie false-positive) and a cookieless
// one are rejected — so capture never closes on a login that has not completed.
func TestSessionVerifier(t *testing.T) {
	srv := mockInstance(t)
	defer srv.Close()
	host, cookieDomain := hostPort(t, srv.URL)

	verify := sessionVerifier(t.Context(), srv.URL, "default", cfgshared.Defaults{})

	good := webauth.AssembleSession(
		[]webauth.Cookie{{Name: "auth_ext", Value: "SESSION123", Domain: cookieDomain, Path: "/"}}, host, "", "ops@x")
	if !verify(good) {
		t.Fatal("verifier rejected a session that authenticates")
	}
	bad := webauth.AssembleSession(
		[]webauth.Cookie{{Name: "auth_ext", Value: "WRONG", Domain: cookieDomain, Path: "/"}}, host, "", "")
	if verify(bad) {
		t.Fatal("verifier accepted an unauthenticated session (SSO false-positive)")
	}
	if verify(webauth.AssembleSession(nil, host, "", "")) {
		t.Fatal("verifier accepted a session with no cookies")
	}
}

// TestSessionKeychainRoundTrip proves the blob survives the shared keychain
// under the session scheme, so the CLI (which loads any scheme's secret from the
// same store) can reuse it. Skipped where the OS keychain is unavailable (CI).
func TestSessionKeychainRoundTrip(t *testing.T) {
	srv := mockInstance(t)
	defer srv.Close()
	host, cookieDomain := hostPort(t, srv.URL)

	sess := webauth.AssembleSession(
		[]webauth.Cookie{{Name: "auth_ext", Value: "SESSION123", Domain: cookieDomain, Path: "/"}}, host, "", "ops@example.com")
	blob, err := pkgauth.EncodeSession(sess)
	if err != nil {
		t.Fatalf("EncodeSession: %v", err)
	}

	if err := config.SaveSecret(srv.URL, pkgauth.SchemeSession, blob); err != nil {
		t.Skipf("keychain unavailable, skipping round-trip: %v", err)
	}
	defer config.DeleteSecret(srv.URL, pkgauth.SchemeSession)

	got, has, err := config.LoadSecret(srv.URL, pkgauth.SchemeSession)
	if err != nil || !has {
		t.Fatalf("LoadSecret: has=%v err=%v", has, err)
	}
	if got != blob {
		t.Fatalf("round-trip mismatch:\n got %q\nwant %q", got, blob)
	}
	// The loaded blob still authenticates.
	client, err := buildClient(srv.URL, "default", pkgauth.SchemeSession, "", got, cfgshared.Defaults{})
	if err != nil {
		t.Fatalf("buildClient: %v", err)
	}
	if _, err := client.Ping(t.Context()); err != nil {
		t.Fatalf("Ping after keychain round-trip failed: %v", err)
	}
}
