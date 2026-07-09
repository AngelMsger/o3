// Package ecosystem detects and manages the sibling openobserve-cli and its
// companion Skill on behalf of the o3 GUI. All parsing is pure and unit-tested;
// side-effecting command execution goes through the Runner interface.
package ecosystem

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

// pkgName is the npm package that ships the CLI.
const pkgName = "@angelmsger/openobserve-cli"

var versionRE = regexp.MustCompile(`v(\d+\.\d+\.\d+)`)

// parseCLIVersion extracts the semver from `openobserve-cli version` output
// (e.g. "openobserve-cli v0.5.0 (commit ...)"). Returns "" when absent.
func parseCLIVersion(out string) string {
	m := versionRE.FindStringSubmatch(out)
	if m == nil {
		return ""
	}
	return m[1]
}

// compareSemver returns -1, 0, or 1 comparing two "x.y.z" strings numerically.
// Non-numeric or missing parts compare as 0.
func compareSemver(a, b string) int {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	return 0
}

// parseNpmManaged reports whether `npm ls -g --json <pkg>` output shows the
// package installed (present under "dependencies"). npm exits non-zero when the
// package is absent but still prints JSON, so callers must ignore the exit code.
func parseNpmManaged(jsonOut string) bool {
	var v struct {
		Dependencies map[string]json.RawMessage `json:"dependencies"`
	}
	if err := json.Unmarshal([]byte(jsonOut), &v); err != nil {
		return false
	}
	_, ok := v.Dependencies[pkgName]
	return ok
}

// parseSkillStatus reads `openobserve-cli skill status --format json` output and
// returns whether the Skill is installed for any agent, the list of agent ids it
// is installed for, and the CLI's embedded Skill version.
func parseSkillStatus(jsonOut string) (installed bool, agents []string, version string) {
	var v struct {
		EmbeddedVersion string `json:"embedded_version"`
		Installs        []struct {
			Agent  string `json:"agent"`
			Status string `json:"status"`
		} `json:"installs"`
	}
	if err := json.Unmarshal([]byte(jsonOut), &v); err != nil {
		return false, nil, ""
	}
	agents = []string{}
	for _, in := range v.Installs {
		if in.Status == "installed" {
			agents = append(agents, in.Agent)
		}
	}
	return len(agents) > 0, agents, v.EmbeddedVersion
}
