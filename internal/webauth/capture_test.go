package webauth

import (
	"testing"

	shared "github.com/angelmsger/openobserve-cli/pkg/webauth"
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
	sess := shared.AssembleSession(cookies, "observe.example.com", authz, email)
	if sess.Cookies != "" {
		t.Fatalf("Cookies = %q, want empty", sess.Cookies)
	}
	if !shared.Replayable(sess) {
		t.Fatal("a completed header-only login was not considered replayable, so capture never verified it")
	}
}
