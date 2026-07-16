package main

import (
	"testing"

	cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"
	"github.com/zalando/go-keyring"

	"github.com/angelmsger/o3/internal/config"
)

// newTestApp isolates config (via $HOME) and the keychain (in-memory mock) so
// SaveContext/RemoveContext/SignOut can be exercised end to end without touching
// the real user config or OS keychain.
func newTestApp(t *testing.T) *App {
	t.Helper()
	keyring.MockInit()
	t.Setenv("HOME", t.TempDir())
	return &App{}
}

func readConfig(t *testing.T) cfgshared.File {
	t.Helper()
	dir, err := configDir()
	if err != nil {
		t.Fatalf("configDir: %v", err)
	}
	f, _, err := cfgshared.ReadFile(dir)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	return f
}

// TestSameAccountAndInUse covers the shared-secret bookkeeping: secrets are keyed
// by host+scheme, so a trailing slash resolves to the same account and a sibling
// context keeps that account "in use".
func TestSameAccountAndInUse(t *testing.T) {
	f := cfgshared.File{Contexts: []cfgshared.NamedContext{
		{Name: "a", BaseURL: "https://obs.example.com", Auth: cfgshared.AuthConfig{Scheme: "session"}},
		{Name: "b", BaseURL: "https://obs.example.com/", Auth: cfgshared.AuthConfig{Scheme: "session"}},
		{Name: "c", BaseURL: "https://other.example.com", Auth: cfgshared.AuthConfig{Scheme: "session"}},
	}}
	if !sameAccount("https://obs.example.com", "session", "https://obs.example.com/", "session") {
		t.Fatal("trailing slash should resolve to the same account")
	}
	if sameAccount("https://obs.example.com", "session", "https://other.example.com", "session") {
		t.Fatal("different hosts must not share an account")
	}
	if !accountInUse(f, "https://obs.example.com", "session", "a") {
		t.Fatal("b shares a's account; should read as in-use when excluding a")
	}
	if accountInUse(f, "https://other.example.com", "session", "c") {
		t.Fatal("only c uses that account; excluding c it is not in use")
	}
}

// TestSaveContextNormalizesURL proves a scheme-less, trailing-slash URL is stored
// and keyed in normalized form, so the client builds and SessionStatus/SignOut
// (which normalize their input) resolve to the same secret. (#2)
func TestSaveContextNormalizesURL(t *testing.T) {
	a := newTestApp(t)
	if err := a.SaveContext(ConnConfig{
		Name: "prod", URL: "observe.example.com/", Org: "default",
		Scheme: "basic", Username: "ops@x", Secret: "pw",
	}); err != nil {
		t.Fatalf("SaveContext: %v", err)
	}
	f := readConfig(t)
	c, ok := f.Context("prod")
	if !ok {
		t.Fatal("prod context not persisted")
	}
	if c.BaseURL != "https://observe.example.com" {
		t.Fatalf("BaseURL = %q, want normalized https://observe.example.com", c.BaseURL)
	}
	// The secret is reachable via the normalized URL (what SessionStatus/SignOut use).
	if _, has, _ := config.LoadSecret("https://observe.example.com", "basic"); !has {
		t.Fatal("secret not found under normalized URL")
	}
}

// TestSaveContextTransactional proves a keychain failure aborts before config.yaml
// is written, so the app never persists a context that points at a missing
// credential. (#8)
func TestSaveContextTransactional(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	keyring.MockInitWithError(keyring.ErrNotFound) // any Set failure
	a := &App{}
	err := a.SaveContext(ConnConfig{
		Name: "prod", URL: "https://observe.example.com", Scheme: "basic", Username: "u", Secret: "pw",
	})
	if err == nil {
		t.Fatal("expected SaveContext to fail when the keychain rejects the secret")
	}
	// config.yaml must NOT contain the half-saved context.
	if _, ok := readConfig(t).Context("prod"); ok {
		t.Fatal("context was persisted despite the secret failing to save")
	}
}

// TestRemoveContextKeepsSharedSecret proves removing one context does not delete a
// secret a sibling still needs, but does delete a secret nothing else uses. (#5)
func TestRemoveContextKeepsSharedSecret(t *testing.T) {
	a := newTestApp(t)
	// Two contexts on the SAME instance (different org) share one session secret,
	// plus a third on a different instance with its own secret.
	mustSave(t, a, ConnConfig{Name: "team-a", URL: "https://obs.example.com", Org: "a", Scheme: "session", Secret: `{"cookies":"auth_ext=x"}`})
	mustSave(t, a, ConnConfig{Name: "team-b", URL: "https://obs.example.com", Org: "b", Scheme: "session", Secret: `{"cookies":"auth_ext=x"}`})
	mustSave(t, a, ConnConfig{Name: "solo", URL: "https://solo.example.com", Org: "default", Scheme: "session", Secret: `{"cookies":"auth_ext=y"}`})

	if err := a.RemoveContext("team-a"); err != nil {
		t.Fatalf("RemoveContext(team-a): %v", err)
	}
	if _, has, _ := config.LoadSecret("https://obs.example.com", "session"); !has {
		t.Fatal("shared secret was deleted; team-b would lose its credential")
	}

	if err := a.RemoveContext("solo"); err != nil {
		t.Fatalf("RemoveContext(solo): %v", err)
	}
	if _, has, _ := config.LoadSecret("https://solo.example.com", "session"); has {
		t.Fatal("unshared secret should have been deleted with its only context")
	}
}

// TestSignOutRemovesSharedSession proves explicit sign-out actually signs the
// account out. Session credentials are keyed by host+scheme, so sibling contexts
// on the same host necessarily lose that shared session too; keeping it would let
// rebuildClient immediately sign the current context back in.
func TestSignOutRemovesSharedSession(t *testing.T) {
	a := newTestApp(t)
	mustSave(t, a, ConnConfig{Name: "team-a", URL: "https://obs.example.com", Org: "a", Scheme: "session", Secret: `{"cookies":"auth_ext=x"}`})
	mustSave(t, a, ConnConfig{Name: "team-b", URL: "https://obs.example.com", Org: "b", Scheme: "session", Secret: `{"cookies":"auth_ext=x"}`})
	if err := a.SignOut("https://obs.example.com"); err != nil {
		t.Fatalf("SignOut: %v", err)
	}
	if _, has, _ := config.LoadSecret("https://obs.example.com", "session"); has {
		t.Fatal("shared session survived sign-out; the current context would be signed straight back in")
	}
	contexts, err := a.ListContexts()
	if err != nil {
		t.Fatalf("ListContexts: %v", err)
	}
	for _, c := range contexts {
		if c.HasSecret {
			t.Fatalf("context %q still reports the shared session after sign-out", c.Name)
		}
	}

	// A lone session context: sign-out fully removes it.
	b := newTestApp(t)
	mustSave(t, b, ConnConfig{Name: "only", URL: "https://lone.example.com", Org: "default", Scheme: "session", Secret: `{"cookies":"auth_ext=z"}`})
	if err := b.SignOut("https://lone.example.com"); err != nil {
		t.Fatalf("SignOut(lone): %v", err)
	}
	if _, has, _ := config.LoadSecret("https://lone.example.com", "session"); has {
		t.Fatal("unshared session should be removed on sign-out")
	}
}

// Changing the URL or auth scheme without supplying a replacement credential
// must fail before config.yaml or the old keychain entry is touched. The UI does
// not read existing credentials back, so an empty secret is valid only while the
// keychain account stays the same.
func TestSaveContextRejectsCredentiallessAccountChange(t *testing.T) {
	a := newTestApp(t)
	mustSave(t, a, ConnConfig{
		Name: "prod", URL: "https://old.example.com", Org: "default",
		Scheme: "basic", Username: "ops", Secret: "pw",
	})

	err := a.SaveContext(ConnConfig{
		Name: "prod", OrigName: "prod", URL: "https://new.example.com", Org: "default",
		Scheme: "basic", Username: "ops",
	})
	if err == nil {
		t.Fatal("SaveContext accepted an account change with no replacement credential")
	}
	f := readConfig(t)
	c, ok := f.Context("prod")
	if !ok || c.BaseURL != "https://old.example.com" {
		t.Fatalf("context changed despite rejected save: %+v", c)
	}
	if _, has, _ := config.LoadSecret("https://old.example.com", "basic"); !has {
		t.Fatal("old credential was deleted despite rejected save")
	}
}

func mustSave(t *testing.T, a *App, c ConnConfig) {
	t.Helper()
	if err := a.SaveContext(c); err != nil {
		t.Fatalf("SaveContext(%s): %v", c.Name, err)
	}
}
