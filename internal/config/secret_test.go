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
