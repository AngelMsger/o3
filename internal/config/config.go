package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// configFileName is the JSON file holding non-secret connection settings.
const configFileName = "config.json"

// Config holds the non-secret connection settings. The secret (password or
// token) is stored separately in the OS keychain.
type Config struct {
	URL      string `json:"url"`
	Org      string `json:"org"`
	Scheme   string `json:"scheme"`
	Username string `json:"username"`
}

// Load reads the config from dir. A missing file yields a zero Config and no
// error (the app is simply unconfigured).
func Load(dir string) (Config, error) {
	raw, err := os.ReadFile(filepath.Join(dir, configFileName))
	if err != nil {
		if os.IsNotExist(err) {
			return Config{}, nil
		}
		return Config{}, err
	}
	var c Config
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &c); err != nil {
			return Config{}, err
		}
	}
	return c, nil
}

// Save writes c as JSON to dir/config.json, creating dir (0700) and the file
// (0600).
func Save(dir string, c Config) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	out, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, configFileName), out, 0o600)
}
