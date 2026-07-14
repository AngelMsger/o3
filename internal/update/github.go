package update

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
)

const (
	// defaultRepo is the GitHub repo o3 releases from.
	defaultRepo = "AngelMsger/o3"
	// apiVersion pins the GitHub REST API version so a future breaking change
	// cannot silently alter the payload we parse.
	apiVersion = "2022-11-28"
	// maxBody caps the response read. A release payload with a dozen assets and
	// generated notes is a few KB; 1 MiB is generous headroom.
	maxBody = 1 << 20
	// maxNotes caps the markdown we hand to the frontend renderer.
	maxNotes = 64 << 10
)

// ErrNoRelease means the repo has no published stable release. This is a normal
// state, not a failure: o3's release workflow creates a DRAFT release, and
// /releases/latest excludes drafts and prereleases by definition, so the repo
// legitimately 404s until a maintainer clicks Publish. Callers must treat it as
// "you are up to date" and stay silent.
var ErrNoRelease = errors.New("no published release")

// Release is the subset of the GitHub release payload o3 consumes.
type Release struct {
	TagName     string  `json:"tag_name"`     // "v1.2.3"
	Name        string  `json:"name"`         // "o3 v1.2.3"
	Body        string  `json:"body"`         // the --generate-notes markdown
	HTMLURL     string  `json:"html_url"`     // the release page
	Draft       bool    `json:"draft"`        //
	Prerelease  bool    `json:"prerelease"`   //
	PublishedAt string  `json:"published_at"` // RFC3339
	Assets      []Asset `json:"assets"`       //
}

// repoSlugRE constrains the O3_UPDATE_REPO override to an owner/repo slug. The
// URL is built around it rather than taken from the environment wholesale, so
// the override can only ever address a different repo on api.github.com — never
// an arbitrary host.
var repoSlugRE = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

// repoSlug returns the owner/repo to query. O3_UPDATE_REPO overrides it so the
// check can be exercised locally against a repo that actually has releases (see
// the package tests and the README); anything malformed falls back to o3.
func repoSlug() string {
	if s := os.Getenv("O3_UPDATE_REPO"); repoSlugRE.MatchString(s) {
		return s
	}
	return defaultRepo
}

// latestURL is the endpoint for the newest published, non-prerelease release.
func latestURL() string {
	return "https://api.github.com/repos/" + repoSlug() + "/releases/latest"
}

// userAgent identifies o3 to GitHub, which rejects requests that send none.
func userAgent(version string) string {
	return "o3/" + version + " (+https://github.com/" + defaultRepo + ")"
}

// fetchRelease GETs the latest release from url. Every failure is returned so the
// caller can degrade to "no update known" rather than guess.
func fetchRelease(ctx context.Context, client *http.Client, url, ua string) (Release, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Release{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", apiVersion)
	req.Header.Set("User-Agent", ua)

	resp, err := client.Do(req)
	if err != nil {
		return Release{}, err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return Release{}, ErrNoRelease
	case http.StatusForbidden, http.StatusTooManyRequests:
		// Unauthenticated requests get 60/hour per IP. The 24h throttle keeps us
		// far under that, but surface it rather than retry-looping.
		if resp.Header.Get("X-RateLimit-Remaining") == "0" {
			return Release{}, fmt.Errorf("GitHub rate limit reached — try again later")
		}
		return Release{}, fmt.Errorf("GitHub refused the request (status %d)", resp.StatusCode)
	default:
		return Release{}, fmt.Errorf("GitHub returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	if err != nil {
		return Release{}, err
	}
	var rel Release
	if err := json.Unmarshal(body, &rel); err != nil {
		return Release{}, fmt.Errorf("malformed release payload: %w", err)
	}
	if rel.TagName == "" {
		return Release{}, ErrNoRelease
	}
	// /releases/latest already excludes both, but asserting it here keeps the
	// stable-only invariant local to this package and testable.
	if rel.Draft || rel.Prerelease {
		return Release{}, ErrNoRelease
	}
	return rel, nil
}
