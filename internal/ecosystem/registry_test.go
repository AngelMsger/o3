package ecosystem

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchLatest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{"dist-tags":{"latest":"0.6.1"},"name":"@angelmsger/openobserve-cli"}`))
	}))
	defer srv.Close()

	got, err := fetchLatest(context.Background(), srv.Client(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "0.6.1" {
		t.Errorf("got %q, want 0.6.1", got)
	}
}

func TestFetchLatestBadResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()
	if _, err := fetchLatest(context.Background(), srv.Client(), srv.URL); err == nil {
		t.Error("expected error on 500")
	}
}
