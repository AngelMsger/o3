package config

import (
	"testing"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
)

func TestSecretAccountKeyMatchesCLI(t *testing.T) {
	// secretAccount must equal the CLI's AccountKey so a credential stored by
	// either tool resolves from the other.
	want := pkgauth.AccountKey("http://localhost:5080", "basic")
	if got := secretAccount("http://localhost:5080", "basic"); got != want {
		t.Fatalf("secretAccount = %q, want %q", got, want)
	}
}

func TestSecretRoundTrip(t *testing.T) {
	const url, scheme, secret = "http://keytest.local:5080", "token", "s3cr3t"
	if err := SaveSecret(url, scheme, secret); err != nil {
		t.Skipf("keychain unavailable in this environment: %v", err)
	}
	t.Cleanup(func() { _ = DeleteSecret(url, scheme) })

	got, ok, err := LoadSecret(url, scheme)
	if err != nil {
		t.Fatalf("LoadSecret: %v", err)
	}
	if !ok || got != secret {
		t.Fatalf("LoadSecret = (%q,%v), want (%q,true)", got, ok, secret)
	}

	if err := DeleteSecret(url, scheme); err != nil {
		t.Fatalf("DeleteSecret: %v", err)
	}
	if _, ok, _ := LoadSecret(url, scheme); ok {
		t.Fatal("secret still present after delete")
	}
}

// A host with no usable keychain must still be able to store a credential.
// Previously o3 used the OS keychain and nothing else, so on such a host every
// save failed — on macOS by raising the "Keychain Not Found / Reset To Defaults"
// system dialog and returning a bare "exit status 154".
func TestSecretSurvivesWithoutAKeychain(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)        // no login keychain lives here
	t.Setenv("USERPROFILE", dir) // Windows equivalent

	const url, scheme, secret = "http://nokeychain.local:5080", "token", "fallback-secret"
	if err := SaveSecret(url, scheme, secret); err != nil {
		t.Fatalf("SaveSecret without a keychain: %v", err)
	}
	got, ok, err := LoadSecret(url, scheme)
	if err != nil {
		t.Fatalf("LoadSecret without a keychain: %v", err)
	}
	if !ok || got != secret {
		t.Fatalf("LoadSecret = (%q,%v), want (%q,true)", got, ok, secret)
	}
	if err := DeleteSecret(url, scheme); err != nil {
		t.Fatalf("DeleteSecret without a keychain: %v", err)
	}
	if _, ok, _ := LoadSecret(url, scheme); ok {
		t.Fatal("secret still present after delete")
	}
}

// A missing secret is "not stored" (ok=false, no error), never an error the UI
// would render as a failure.
func TestLoadSecretMissingIsNotAnError(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)

	got, ok, err := LoadSecret("http://absent.local:5080", "basic")
	if err != nil || ok || got != "" {
		t.Fatalf("LoadSecret = (%q,%v,%v), want (\"\",false,nil)", got, ok, err)
	}
}
