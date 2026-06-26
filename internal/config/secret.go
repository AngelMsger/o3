package config

import (
	"errors"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
	"github.com/zalando/go-keyring"
)

// keychainService is the OS keychain service name. It matches the CLI's
// constants.KeychainService so a credential saved by either tool is found by
// the other.
//
// Note: o3 uses the OS keychain only (no file fallback). The CLI additionally
// supports a credentials file fallback for headless or locked-keychain hosts.
// On such hosts the two tools' secret stores can diverge.
const keychainService = "openobserve-cli"

// secretAccount derives the keychain account for a base URL and scheme,
// reusing the CLI's stable key format (host:scheme).
func secretAccount(url, scheme string) string {
	return pkgauth.AccountKey(url, scheme)
}

// SaveSecret stores the secret (password or token) for url+scheme in the OS
// keychain.
func SaveSecret(url, scheme, secret string) error {
	return keyring.Set(keychainService, secretAccount(url, scheme), secret)
}

// LoadSecret retrieves the secret for url+scheme. The bool is false (with no
// error) when no secret is stored.
func LoadSecret(url, scheme string) (string, bool, error) {
	secret, err := keyring.Get(keychainService, secretAccount(url, scheme))
	if err != nil {
		if errors.Is(err, keyring.ErrNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return secret, true, nil
}

// DeleteSecret removes any stored secret for url+scheme. A missing entry is not
// an error.
func DeleteSecret(url, scheme string) error {
	err := keyring.Delete(keychainService, secretAccount(url, scheme))
	if err != nil && errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return err
}
