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
