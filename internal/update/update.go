package update

import (
	"context"
	"errors"
	"net/http"
	"runtime"
	"strings"
	"time"
)

// httpTimeout bounds the whole check. It runs in a background goroutine at
// startup, so it can afford to be patient — but not indefinitely.
const httpTimeout = 10 * time.Second

// Result is what crosses the Wails boundary. The zero value means "nothing to
// report", which is what a dev build and a repo with no published release both
// produce.
type Result struct {
	// Checked is false when no check was performed (a dev build).
	Checked         bool   `json:"checked"`
	CurrentVersion  string `json:"currentVersion"`  // "dev" for local builds
	LatestVersion   string `json:"latestVersion"`   // the tag with "v" stripped
	UpdateAvailable bool   `json:"updateAvailable"` //
	ReleaseName     string `json:"releaseName"`     //
	Notes           string `json:"notes"`           // raw markdown; the frontend renders it
	PublishedAt     string `json:"publishedAt"`     // RFC3339
	ReleaseURL      string `json:"releaseURL"`      // the release page
	DownloadURL     string `json:"downloadURL"`     // the platform asset, or the release page
	AssetName       string `json:"assetName"`       // "" when falling back to the release page
	OS              string `json:"os"`              //
	Arch            string `json:"arch"`            //
}

// Service checks for a newer release. The fetch is injected so the whole flow is
// testable without touching the network, mirroring ecosystem.Service.
type Service struct {
	current      string // the running version — main.version
	fetch        func(ctx context.Context) (Release, error)
	goos, goarch string
}

// New builds a Service with an injected fetcher, for tests.
func New(current string, fetch func(context.Context) (Release, error), goos, goarch string) *Service {
	return &Service{current: current, fetch: fetch, goos: goos, goarch: goarch}
}

// NewProduction builds a Service that talks to the real GitHub API for the
// platform o3 was compiled for.
func NewProduction(current string) *Service {
	client := &http.Client{Timeout: httpTimeout}
	url, ua := latestURL(), userAgent(current)
	fetch := func(ctx context.Context) (Release, error) {
		cctx, cancel := context.WithTimeout(ctx, httpTimeout)
		defer cancel()
		return fetchRelease(cctx, client, url, ua)
	}
	return New(current, fetch, runtime.GOOS, runtime.GOARCH)
}

// Current returns the running version.
func (s *Service) Current() string { return s.current }

// Check asks GitHub for the newest published stable release and reports whether
// it is newer than the running build.
//
// A dev build short-circuits before any HTTP call: `wails dev` must never nag,
// and must never spend the unauthenticated rate limit. A repo with no published
// release (ErrNoRelease) is a normal "up to date", not an error. Everything else
// — offline, rate-limited, GitHub down — is returned so the caller can decide:
// the explicit check surfaces it, the background check swallows it.
func (s *Service) Check(ctx context.Context) (Result, error) {
	res := Result{
		CurrentVersion: s.current,
		OS:             s.goos,
		Arch:           s.goarch,
	}
	if IsDev(s.current) {
		return res, nil
	}

	rel, err := s.fetch(ctx)
	if errors.Is(err, ErrNoRelease) {
		res.Checked = true
		return res, nil
	}
	if err != nil {
		return res, err
	}

	res.Checked = true
	res.LatestVersion = strings.TrimPrefix(rel.TagName, "v")
	res.ReleaseName = rel.Name
	res.Notes = truncate(rel.Body, maxNotes)
	res.PublishedAt = rel.PublishedAt
	res.ReleaseURL = rel.HTMLURL
	res.DownloadURL, res.AssetName = PickAsset(rel.Assets, s.goos, s.goarch, rel.HTMLURL)
	// Strictly greater, so a local build ahead of the published release — or one
	// carrying a malformed tag, which Compare sorts below everything — stays quiet.
	res.UpdateAvailable = Compare(res.LatestVersion, s.current) > 0
	return res, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "\n\n…"
}
