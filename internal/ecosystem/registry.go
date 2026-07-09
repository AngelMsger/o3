package ecosystem

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// registryURL is the npm registry metadata endpoint for the CLI package.
const registryURL = "https://registry.npmjs.org/@angelmsger/openobserve-cli"

// fetchLatest returns the dist-tags.latest version from the npm registry
// metadata at url. Errors (network, non-200, malformed) are returned so the
// caller can degrade to "no update known".
func fetchLatest(ctx context.Context, client *http.Client, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("registry status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var v struct {
		DistTags struct {
			Latest string `json:"latest"`
		} `json:"dist-tags"`
	}
	if err := json.Unmarshal(body, &v); err != nil {
		return "", err
	}
	if v.DistTags.Latest == "" {
		return "", fmt.Errorf("no latest dist-tag")
	}
	return v.DistTags.Latest, nil
}
