package update

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const samplePayload = `{
  "tag_name": "v1.3.0",
  "name": "o3 v1.3.0",
  "body": "## What's Changed\n* feat: thing by @angelmsger in https://github.com/AngelMsger/o3/pull/12",
  "html_url": "https://github.com/AngelMsger/o3/releases/tag/v1.3.0",
  "draft": false,
  "prerelease": false,
  "published_at": "2026-07-14T10:00:00Z",
  "assets": [
    {"name": "o3-1.3.0-universal.dmg", "browser_download_url": "https://dl/dmg", "size": 1234}
  ]
}`

func TestFetchReleaseOK(t *testing.T) {
	var gotUA, gotAccept, gotAPIVersion string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUA = r.Header.Get("User-Agent")
		gotAccept = r.Header.Get("Accept")
		gotAPIVersion = r.Header.Get("X-GitHub-Api-Version")
		w.Write([]byte(samplePayload))
	}))
	defer srv.Close()

	rel, err := fetchRelease(context.Background(), srv.Client(), srv.URL, userAgent("1.2.0"))
	if err != nil {
		t.Fatalf("fetchRelease() error = %v", err)
	}
	// GitHub rejects requests that send no User-Agent, so this is load-bearing.
	if !strings.HasPrefix(gotUA, "o3/1.2.0") {
		t.Errorf("User-Agent = %q, want it to start with o3/1.2.0", gotUA)
	}
	if gotAccept != "application/vnd.github+json" {
		t.Errorf("Accept = %q", gotAccept)
	}
	if gotAPIVersion != apiVersion {
		t.Errorf("X-GitHub-Api-Version = %q, want %q", gotAPIVersion, apiVersion)
	}
	if rel.TagName != "v1.3.0" {
		t.Errorf("TagName = %q, want v1.3.0", rel.TagName)
	}
	if len(rel.Assets) != 1 || rel.Assets[0].BrowserDownloadURL != "https://dl/dmg" {
		t.Errorf("Assets = %+v", rel.Assets)
	}
	if !strings.Contains(rel.Body, "What's Changed") {
		t.Errorf("Body = %q", rel.Body)
	}
}

// A repo with no published release 404s. That is o3's state until a maintainer
// publishes the draft the workflow creates, so it must be a sentinel the caller
// can treat as "up to date" — never an error shown on every launch.
func TestFetchReleaseNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"message":"Not Found"}`, http.StatusNotFound)
	}))
	defer srv.Close()

	if _, err := fetchRelease(context.Background(), srv.Client(), srv.URL, "o3/test"); !errors.Is(err, ErrNoRelease) {
		t.Errorf("err = %v, want ErrNoRelease", err)
	}
}

func TestFetchReleaseRateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Remaining", "0")
		http.Error(w, `{"message":"API rate limit exceeded"}`, http.StatusForbidden)
	}))
	defer srv.Close()

	_, err := fetchRelease(context.Background(), srv.Client(), srv.URL, "o3/test")
	if err == nil || !strings.Contains(err.Error(), "rate limit") {
		t.Errorf("err = %v, want a rate-limit error", err)
	}
}

func TestFetchReleaseErrors(t *testing.T) {
	tests := []struct {
		name    string
		status  int
		body    string
		wantErr string
	}{
		{"server error", http.StatusInternalServerError, "boom", "status 500"},
		{"malformed json", http.StatusOK, "{not json", "malformed release payload"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.status)
				w.Write([]byte(tt.body))
			}))
			defer srv.Close()

			_, err := fetchRelease(context.Background(), srv.Client(), srv.URL, "o3/test")
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("err = %v, want it to contain %q", err, tt.wantErr)
			}
		})
	}
}

// /releases/latest already excludes drafts and prereleases; assert the invariant
// locally so the stable-only guarantee does not depend on the endpoint alone.
func TestFetchReleaseRejectsDraftAndPrerelease(t *testing.T) {
	for _, body := range []string{
		`{"tag_name":"v1.3.0","draft":true}`,
		`{"tag_name":"v1.3.0-rc.1","prerelease":true}`,
		`{}`, // no tag at all
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(body))
		}))
		_, err := fetchRelease(context.Background(), srv.Client(), srv.URL, "o3/test")
		srv.Close()
		if !errors.Is(err, ErrNoRelease) {
			t.Errorf("body %s: err = %v, want ErrNoRelease", body, err)
		}
	}
}

func TestRepoSlugOverride(t *testing.T) {
	tests := []struct {
		env  string
		want string
	}{
		{"", defaultRepo},
		{"AngelMsger/openobserve-cli", "AngelMsger/openobserve-cli"},
		// Anything that is not a bare owner/repo slug is ignored, so the override
		// can never redirect the check away from api.github.com.
		{"https://evil.example.com/x", defaultRepo},
		{"owner/repo/extra", defaultRepo},
		{"no-slash", defaultRepo},
		{"owner/repo?x=1", defaultRepo},
	}
	for _, tt := range tests {
		t.Setenv("O3_UPDATE_REPO", tt.env)
		if got := repoSlug(); got != tt.want {
			t.Errorf("O3_UPDATE_REPO=%q: repoSlug() = %q, want %q", tt.env, got, tt.want)
		}
	}

	t.Setenv("O3_UPDATE_REPO", "AngelMsger/openobserve-cli")
	if got := latestURL(); got != "https://api.github.com/repos/AngelMsger/openobserve-cli/releases/latest" {
		t.Errorf("latestURL() = %q", got)
	}
}
