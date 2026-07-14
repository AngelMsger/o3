package update

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func stub(rel Release, err error) func(context.Context) (Release, error) {
	return func(context.Context) (Release, error) { return rel, err }
}

func newRelease(tag string) Release {
	return Release{
		TagName:     tag,
		Name:        "o3 " + tag,
		Body:        "## What's Changed\n* feat: thing",
		HTMLURL:     "https://github.com/AngelMsger/o3/releases/tag/" + tag,
		PublishedAt: "2026-07-14T10:00:00Z",
		Assets: []Asset{
			{Name: "o3-" + strings.TrimPrefix(tag, "v") + "-universal.dmg", BrowserDownloadURL: "https://dl/dmg"},
		},
	}
}

// A dev build must not nag — and must not even spend a request against the
// unauthenticated rate limit, so the fetcher must never be called.
func TestCheckDevBuildNeverFetches(t *testing.T) {
	for _, current := range []string{"dev", "", "garbage"} {
		called := false
		s := New(current, func(context.Context) (Release, error) {
			called = true
			return newRelease("v9.9.9"), nil
		}, "darwin", "arm64")

		res, err := s.Check(context.Background())
		if err != nil {
			t.Fatalf("current %q: Check() error = %v", current, err)
		}
		if called {
			t.Errorf("current %q: Check() hit the network on a dev build", current)
		}
		if res.Checked || res.UpdateAvailable {
			t.Errorf("current %q: got %+v, want Checked=false UpdateAvailable=false", current, res)
		}
		if res.CurrentVersion != current {
			t.Errorf("current %q: CurrentVersion = %q", current, res.CurrentVersion)
		}
	}
}

func TestCheckUpdateAvailable(t *testing.T) {
	s := New("1.2.0", stub(newRelease("v1.3.0"), nil), "darwin", "arm64")

	res, err := s.Check(context.Background())
	if err != nil {
		t.Fatalf("Check() error = %v", err)
	}
	if !res.Checked || !res.UpdateAvailable {
		t.Fatalf("got %+v, want Checked=true UpdateAvailable=true", res)
	}
	if res.LatestVersion != "1.3.0" {
		t.Errorf("LatestVersion = %q, want 1.3.0 (the v prefix must be stripped)", res.LatestVersion)
	}
	if res.DownloadURL != "https://dl/dmg" || res.AssetName != "o3-1.3.0-universal.dmg" {
		t.Errorf("download = (%q, %q), want the universal dmg", res.DownloadURL, res.AssetName)
	}
	if res.ReleaseURL == "" || res.Notes == "" || res.PublishedAt == "" {
		t.Errorf("got %+v, want the release page, notes and date populated", res)
	}
	if res.OS != "darwin" || res.Arch != "arm64" {
		t.Errorf("platform = %s/%s", res.OS, res.Arch)
	}
}

func TestCheckNoUpdate(t *testing.T) {
	tests := []struct {
		name    string
		current string
		latest  string
	}{
		{"same version", "1.2.0", "v1.2.0"},
		{"local build is ahead of the release", "1.3.0", "v1.2.0"},
		{"an rc of the running version is not an update", "1.2.0", "v1.2.0-rc.1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := New(tt.current, stub(newRelease(tt.latest), nil), "darwin", "arm64")
			res, err := s.Check(context.Background())
			if err != nil {
				t.Fatalf("Check() error = %v", err)
			}
			if !res.Checked {
				t.Error("Checked = false, want true")
			}
			if res.UpdateAvailable {
				t.Errorf("UpdateAvailable = true for current %s vs latest %s", tt.current, tt.latest)
			}
		})
	}
}

// A repo with no published release is "up to date", not a failure.
func TestCheckNoReleaseIsNotAnError(t *testing.T) {
	s := New("1.2.0", stub(Release{}, ErrNoRelease), "darwin", "arm64")

	res, err := s.Check(context.Background())
	if err != nil {
		t.Fatalf("Check() error = %v, want nil for ErrNoRelease", err)
	}
	if !res.Checked || res.UpdateAvailable || res.LatestVersion != "" {
		t.Errorf("got %+v, want a checked, empty result", res)
	}
}

func TestCheckPropagatesFetchErrors(t *testing.T) {
	boom := errors.New("network is down")
	s := New("1.2.0", stub(Release{}, boom), "darwin", "arm64")

	res, err := s.Check(context.Background())
	if !errors.Is(err, boom) {
		t.Fatalf("Check() error = %v, want the fetch error", err)
	}
	if res.UpdateAvailable {
		t.Error("UpdateAvailable = true on a failed check")
	}
}

// An unsupported platform still reports the update, but hands back the release
// page instead of a download.
func TestCheckFallsBackToTheReleasePage(t *testing.T) {
	s := New("1.2.0", stub(newRelease("v1.3.0"), nil), "linux", "arm64")

	res, err := s.Check(context.Background())
	if err != nil {
		t.Fatalf("Check() error = %v", err)
	}
	if !res.UpdateAvailable {
		t.Fatal("UpdateAvailable = false")
	}
	if res.AssetName != "" || res.DownloadURL != res.ReleaseURL {
		t.Errorf("got (%q, %q), want the release page and no asset", res.DownloadURL, res.AssetName)
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate("short", 10); got != "short" {
		t.Errorf("truncate() = %q", got)
	}
	got := truncate(strings.Repeat("x", 100), 10)
	if !strings.HasPrefix(got, strings.Repeat("x", 10)) || !strings.HasSuffix(got, "…") {
		t.Errorf("truncate() = %q, want 10 x's and an ellipsis", got)
	}
}
