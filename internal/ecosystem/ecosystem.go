package ecosystem

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// EcoStatus is the full detection snapshot returned to the frontend.
type EcoStatus struct {
	NpmAvailable bool        `json:"npmAvailable"`
	CLI          CLIStatus   `json:"cli"`
	Skill        SkillStatus `json:"skill"`
}

// CLIStatus describes the openobserve-cli install.
type CLIStatus struct {
	Installed       bool   `json:"installed"`
	Version         string `json:"version"`
	Path            string `json:"path"`
	Managed         string `json:"managed"` // "npm" | "external" | ""
	LatestVersion   string `json:"latestVersion"`
	UpdateAvailable bool   `json:"updateAvailable"`
}

// SkillStatus describes the companion Skill deployment.
type SkillStatus struct {
	Installed bool     `json:"installed"`
	Version   string   `json:"version"`
	Agents    []string `json:"agents"`
}

// Service performs detection and management via an injected Runner and a latest-
// version fetcher.
type Service struct {
	run    Runner
	latest func(ctx context.Context) (string, error)
}

// New builds a Service.
func New(run Runner, latest func(ctx context.Context) (string, error)) *Service {
	return &Service{run: run, latest: latest}
}

// NewProduction builds a Service backed by the real exec Runner (PATH resolved
// from the login shell) and the npm-registry latest fetcher with a short
// timeout. It also sets the Skill handshake env so the CLI suppresses its
// stderr discovery nudge in child processes.
func NewProduction(ctx context.Context) *Service {
	os.Setenv("OPENOBSERVE_CLI_SKILL", "1")
	run := newExecRunner(ctx)
	latest := func(c context.Context) (string, error) {
		cctx, cancel := context.WithTimeout(c, 3*time.Second)
		defer cancel()
		return fetchLatest(cctx, http.DefaultClient, registryURL)
	}
	return New(run, latest)
}

// Status gathers CLI + Skill + npm state in one pass. Missing tools are normal
// states, not errors; it only returns an error for an unexpected internal fault
// (currently never).
func (s *Service) Status(ctx context.Context) (EcoStatus, error) {
	var st EcoStatus
	_, st.NpmAvailable = s.run.LookPath("npm")

	cliPath, cliOK := s.run.LookPath("openobserve-cli")
	if cliOK {
		st.CLI.Installed = true
		st.CLI.Path = cliPath
		if out, _, err := s.run.Run(ctx, "openobserve-cli", "version"); err == nil {
			st.CLI.Version = parseCLIVersion(out)
		}
		st.CLI.Managed = "external"
		if st.NpmAvailable {
			// `npm ls` exits non-zero when the package is absent but still prints
			// JSON, so parse stdout regardless of err.
			out, _, _ := s.run.Run(ctx, "npm", "ls", "-g", "--depth=0", "--json", pkgName)
			if parseNpmManaged(out) {
				st.CLI.Managed = "npm"
			}
		}
		if latest, err := s.latest(ctx); err == nil && latest != "" {
			st.CLI.LatestVersion = latest
			st.CLI.UpdateAvailable = st.CLI.Version != "" && compareSemver(latest, st.CLI.Version) > 0
		}
		// Skill status requires the CLI. Suppress the CLI's stderr discovery nudge.
		if out, _, err := s.runSkillStatus(ctx); err == nil {
			st.Skill.Installed, st.Skill.Agents, st.Skill.Version = parseSkillStatus(out)
		}
	}
	if st.Skill.Agents == nil {
		st.Skill.Agents = []string{}
	}
	return st, nil
}

// runSkillStatus runs `openobserve-cli skill status --format json` with the
// skill-loaded handshake env so the CLI does not print discovery hints.
func (s *Service) runSkillStatus(ctx context.Context) (string, string, error) {
	// The env is set on the process by execRunner via os.Environ(); we set it in
	// the current process env so children inherit it. Setting per-call keeps it
	// scoped to detection.
	return s.run.Run(ctx, "openobserve-cli", "skill", "status", "--format", "json")
}

// fail turns a command result into an error carrying the trimmed stderr (or the
// raw error when stderr is empty).
func fail(action, stderr string, err error) error {
	msg := strings.TrimSpace(stderr)
	if msg == "" {
		msg = err.Error()
	}
	return fmt.Errorf("%s failed: %s", action, msg)
}

func (s *Service) InstallCLI(ctx context.Context) error {
	_, stderr, err := s.run.Run(ctx, "npm", "install", "-g", pkgName)
	if err != nil {
		return fail("install openobserve-cli", stderr, err)
	}
	return nil
}

func (s *Service) UpgradeCLI(ctx context.Context) error {
	_, stderr, err := s.run.Run(ctx, "npm", "install", "-g", pkgName+"@latest")
	if err != nil {
		return fail("upgrade openobserve-cli", stderr, err)
	}
	return nil
}

func (s *Service) UninstallCLI(ctx context.Context) error {
	st, _ := s.Status(ctx)
	if st.CLI.Managed != "npm" {
		return fmt.Errorf("openobserve-cli is not managed by npm; uninstall it the way it was installed")
	}
	_, stderr, err := s.run.Run(ctx, "npm", "uninstall", "-g", pkgName)
	if err != nil {
		return fail("uninstall openobserve-cli", stderr, err)
	}
	return nil
}

func (s *Service) InstallSkill(ctx context.Context) error {
	_, stderr, err := s.run.Run(ctx, "openobserve-cli", "skill", "install")
	if err != nil {
		return fail("install Skill", stderr, err)
	}
	return nil
}

func (s *Service) UninstallSkill(ctx context.Context) error {
	_, stderr, err := s.run.Run(ctx, "openobserve-cli", "skill", "uninstall")
	if err != nil {
		return fail("uninstall Skill", stderr, err)
	}
	return nil
}
