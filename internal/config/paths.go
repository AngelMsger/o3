// Package config persists the desktop app's connection settings (non-secret)
// as JSON in the user's app data directory. Secrets live in the keychain
// (see secret.go).
package config

import (
	"os"
	"path/filepath"
)

// DataDir returns the per-user app data directory for the desktop app,
// ~/.angelmsger/openobserve-desktop, sharing the ~/.angelmsger parent the CLI
// family uses.
func DataDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".angelmsger", "openobserve-desktop"), nil
}
