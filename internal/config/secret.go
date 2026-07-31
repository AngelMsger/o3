package config

import (
	"errors"
	"sync"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
	cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"
	"github.com/angelmsger/openobserve-cli/pkg/credstore"
)

// Secrets live in the shared credstore, the SAME store the CLI uses: one
// keychain service name, one fallback file, so a credential saved by either
// tool is found by the other.
//
// o3 used to call the OS keychain directly with no fallback. That failed
// outright on a host without a usable keychain — and on macOS it failed
// destructively: the keychain write raised a system dialog offering to "Reset
// To Defaults" (which resets the user's default keychain) and returned a bare
// "exit status 154". credstore probes for a usable keychain without any UI and
// falls back to a protected file, so neither can happen.

// The store is cached, but keyed by the config directory it was built for: the
// directory derives from the user's home, and a cache that ignored that would
// pin the first directory seen for the life of the process. The keychain probe
// inside a Store is per-instance, so rebuilding on a directory change also
// re-probes — which is the correct answer for a different home.
var (
	storeMu   sync.Mutex
	storeDir  string
	storeInst *credstore.Store
)

func secretStore() (*credstore.Store, error) {
	dir, err := cfgshared.DefaultConfigDir()
	if err != nil {
		return nil, err
	}
	storeMu.Lock()
	defer storeMu.Unlock()
	if storeInst == nil || storeDir != dir {
		storeInst, storeDir = credstore.NewStore(dir), dir
	}
	return storeInst, nil
}

// secretAccount derives the keychain account for a base URL and scheme,
// reusing the CLI's stable key format (host:scheme).
func secretAccount(url, scheme string) string {
	return pkgauth.AccountKey(url, scheme)
}

// SaveSecret stores the secret (password, token or session envelope) for
// url+scheme, in the OS keychain when one is available and in the protected
// fallback file otherwise.
func SaveSecret(url, scheme, secret string) error {
	s, err := secretStore()
	if err != nil {
		return err
	}
	_, err = s.Save(secretAccount(url, scheme), secret)
	return err
}

// LoadSecret retrieves the secret for url+scheme. The bool is false (with no
// error) when no secret is stored. A store that exists but cannot be read is an
// error, not a missing secret — the caller must not tell the user to reconfigure
// a credential that is merely hidden.
func LoadSecret(url, scheme string) (string, bool, error) {
	s, err := secretStore()
	if err != nil {
		return "", false, err
	}
	secret, err := s.Load(secretAccount(url, scheme))
	if err != nil {
		if errors.Is(err, credstore.ErrSecretNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return secret, true, nil
}

// DeleteSecret removes any stored secret for url+scheme from both backends. A
// missing entry is not an error.
func DeleteSecret(url, scheme string) error {
	s, err := secretStore()
	if err != nil {
		return err
	}
	err = s.Delete(secretAccount(url, scheme))
	if err != nil && errors.Is(err, credstore.ErrSecretNotFound) {
		return nil
	}
	return err
}
