package main

import (
	"testing"

	cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"
)

func TestContextInfos(t *testing.T) {
	f := cfgshared.File{
		CurrentContext: "prod",
		Contexts: []cfgshared.NamedContext{
			{Name: "prod", BaseURL: "https://p", Org: "default", Auth: cfgshared.AuthConfig{Scheme: "basic", Username: "u@x"}},
			{Name: "stg", BaseURL: "https://s", Org: "dev", Auth: cfgshared.AuthConfig{}}, // empty scheme -> basic
		},
	}
	// hasSecret fake: only prod has a secret.
	has := func(url, scheme string) bool { return url == "https://p" && scheme == "basic" }

	got := contextInfos(f, has)
	if len(got) != 2 {
		t.Fatalf("want 2, got %d", len(got))
	}
	if got[0].Name != "prod" || !got[0].IsCurrent || !got[0].HasSecret || got[0].Scheme != "basic" {
		t.Fatalf("prod mapping wrong: %+v", got[0])
	}
	if got[0].URL != "https://p" || got[0].Org != "default" || got[0].Username != "u@x" {
		t.Fatalf("prod fields wrong: %+v", got[0])
	}
	if got[1].Name != "stg" || got[1].IsCurrent || got[1].HasSecret {
		t.Fatalf("stg mapping wrong: %+v", got[1])
	}
	if got[1].Scheme != "basic" { // empty scheme defaults to basic
		t.Fatalf("stg scheme should default to basic, got %q", got[1].Scheme)
	}
}
