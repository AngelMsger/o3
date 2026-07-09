package ecosystem

import (
	"reflect"
	"testing"
)

func TestParseCLIVersion(t *testing.T) {
	cases := map[string]string{
		"openobserve-cli v0.5.0 (commit abc1234, built 2025-06-29T15:12:00Z)": "0.5.0",
		"openobserve-cli v1.10.2\n":                                           "1.10.2",
		"garbage output":                                                      "",
		"":                                                                    "",
	}
	for in, want := range cases {
		if got := parseCLIVersion(in); got != want {
			t.Errorf("parseCLIVersion(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCompareSemver(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"0.5.0", "0.5.0", 0},
		{"0.6.0", "0.5.0", 1},
		{"0.5.0", "0.6.0", -1},
		{"1.0.0", "0.9.9", 1},
		{"0.5.10", "0.5.2", 1},
	}
	for _, c := range cases {
		if got := compareSemver(c.a, c.b); got != c.want {
			t.Errorf("compareSemver(%q,%q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestParseNpmManaged(t *testing.T) {
	managed := `{"dependencies":{"@angelmsger/openobserve-cli":{"version":"0.5.0"}}}`
	if !parseNpmManaged(managed) {
		t.Error("expected managed=true when package present in dependencies")
	}
	notManaged := `{"dependencies":{"typescript":{"version":"5.0.0"}}}`
	if parseNpmManaged(notManaged) {
		t.Error("expected managed=false when package absent")
	}
	if parseNpmManaged("not json") {
		t.Error("expected managed=false on malformed json")
	}
}

func TestParseSkillStatus(t *testing.T) {
	payload := `{"embedded_version":"0.2.0","installs":[
		{"agent":"claude-code","path":"/h/.claude/skills/openobserve","status":"installed"},
		{"agent":"codex","path":"/h/.codex/skills/openobserve","status":"not_installed"}]}`
	installed, agents, version := parseSkillStatus(payload)
	if !installed {
		t.Error("expected installed=true")
	}
	if !reflect.DeepEqual(agents, []string{"claude-code"}) {
		t.Errorf("agents = %v, want [claude-code]", agents)
	}
	if version != "0.2.0" {
		t.Errorf("version = %q, want 0.2.0", version)
	}
	// none installed
	none := `{"embedded_version":"0.2.0","installs":[{"agent":"codex","path":"/x","status":"not_installed"}]}`
	if in, ag, _ := parseSkillStatus(none); in || len(ag) != 0 {
		t.Errorf("expected not installed, got installed=%v agents=%v", in, ag)
	}
	// malformed
	if in, _, _ := parseSkillStatus("nope"); in {
		t.Error("expected installed=false on malformed json")
	}
}
