package webauth

import (
	"testing"
)

func TestParseProbe(t *testing.T) {
	data := []byte(`{
		"url":"https://observe.example.com/web/logs",
		"authorization":"Bearer tok",
		"email":"ops@example.com",
		"cookies":[
			{"name":"auth_ext","value":"abc","domain":"observe.example.com","path":"/","expires":1785000000,"secure":true,"httpOnly":true},
			{"name":"sid","value":"x","domain":"observe.example.com","path":"/","expires":0}
		]
	}`)
	cookies, url, authz, email, err := parseProbe(data)
	if err != nil {
		t.Fatalf("parseProbe: %v", err)
	}
	if url != "https://observe.example.com/web/logs" || authz != "Bearer tok" || email != "ops@example.com" {
		t.Fatalf("scalar fields wrong: url=%q authz=%q email=%q", url, authz, email)
	}
	if len(cookies) != 2 {
		t.Fatalf("got %d cookies, want 2", len(cookies))
	}
	if cookies[0].Name != "auth_ext" || cookies[0].Expires.IsZero() {
		t.Fatalf("first cookie parsed wrong: %+v", cookies[0])
	}
	if !cookies[1].Expires.IsZero() {
		t.Fatalf("session cookie should have zero expiry: %+v", cookies[1])
	}
}

func TestAssembleSession(t *testing.T) {
	cookies := []Cookie{
		{Name: "b", Value: "2", Domain: "observe.example.com"},
		{Name: "a", Value: "1", Domain: "observe.example.com"},
		{Name: "drop", Value: "z", Domain: "evil.com"},
	}
	sess := AssembleSession(cookies, "observe.example.com", "Bearer tok", "ops@example.com")
	if sess.Cookies != "a=1; b=2" {
		t.Fatalf("Cookies = %q, want %q (host-scoped, stable order)", sess.Cookies, "a=1; b=2")
	}
	if sess.Authorization != "Bearer tok" || sess.Email != "ops@example.com" {
		t.Fatalf("metadata wrong: %+v", sess)
	}
}

// TestProbeFromNativeLoginInstance walks the exact payload the native window
// hands over after a successful login on an instance that authenticates its own
// SPA with an Authorization header and sets no cookies — the shape that used to
// leave the sign-in window sitting on the instance's home page forever.
func TestProbeFromNativeLoginInstance(t *testing.T) {
	data := []byte(`{
		"url":"https://observe.example.com/web/logs",
		"authorization":"Basic b3BzQGV4YW1wbGUuY29tOnB3",
		"email":"ops@example.com",
		"cookies":[]
	}`)
	cookies, _, authz, email, err := parseProbe(data)
	if err != nil {
		t.Fatalf("parseProbe: %v", err)
	}
	sess := AssembleSession(cookies, "observe.example.com", authz, email)
	if sess.Cookies != "" {
		t.Fatalf("Cookies = %q, want empty", sess.Cookies)
	}
	if !Replayable(sess) {
		t.Fatal("a completed header-only login was not considered replayable, so capture never verified it")
	}
}

// TestReplayable pins the gate that decides when a probed state is worth
// verifying. The header-only case is the one that matters: an OpenObserve
// instance using native (email + password) login authenticates its own SPA with
// an Authorization header and sets NO cookies at all, so gating on cookies alone
// meant capture never verified — the login window sat on the web UI forever.
func TestReplayable(t *testing.T) {
	cases := []struct {
		name    string
		cookies []Cookie
		authz   string
		want    bool
	}{
		{"nothing captured yet", nil, "", false},
		{"cookies only (SSO / Dex instances)", []Cookie{{Name: "auth_ext", Value: "abc"}}, "", true},
		{"authorization only (native-login instances)", nil, "Basic dXNlcjpwYXNz", true},
		{"both", []Cookie{{Name: "auth_ext", Value: "abc"}}, "Basic dXNlcjpwYXNz", true},
		{"blank authorization is not a capture", nil, "   ", false},
	}
	for _, c := range cases {
		sess := AssembleSession(c.cookies, "observe.example.com", c.authz, "")
		if got := Replayable(sess); got != c.want {
			t.Errorf("%s: Replayable = %v, want %v", c.name, got, c.want)
		}
	}
}
