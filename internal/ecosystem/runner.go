package ecosystem

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Runner runs fixed commands with a resolved PATH. It is injected so tests never
// shell out.
type Runner interface {
	// Run executes name+args and returns stdout, stderr, and any error. A
	// non-zero exit is returned as err with stderr populated; callers that need
	// the stdout of a non-zero exit (e.g. `npm ls` when a package is missing)
	// read stdout regardless of err.
	Run(ctx context.Context, name string, args ...string) (stdout, stderr string, err error)
	// LookPath reports the resolved absolute path of name and whether it was
	// found on the resolved PATH.
	LookPath(name string) (string, bool)
}

// mergePATH builds a PATH string from the login shell's PATH followed by extra
// fallback dirs, preserving order and dropping empties and duplicates.
func mergePATH(shellPATH string, extra []string) string {
	seen := map[string]bool{}
	out := make([]string, 0, 16)
	add := func(dirs []string) {
		for _, d := range dirs {
			if d == "" || seen[d] {
				continue
			}
			seen[d] = true
			out = append(out, d)
		}
	}
	add(strings.Split(shellPATH, ":"))
	add(extra)
	return strings.Join(out, ":")
}

// commonDirs are appended to the resolved PATH so tools installed in standard
// locations are found even when the login shell PATH is minimal.
func commonDirs() []string {
	home, _ := os.UserHomeDir()
	dirs := []string{"/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"}
	if home != "" {
		dirs = append(dirs, filepath.Join(home, ".local", "bin"), filepath.Join(home, "go", "bin"))
	}
	if gobin := os.Getenv("GOBIN"); gobin != "" {
		dirs = append(dirs, gobin)
	}
	return dirs
}

// resolveShellPATH asks the user's login+interactive shell for its PATH. A
// Finder-launched app inherits a minimal PATH, so this recovers the real one.
// Returns "" on any failure (the caller still has commonDirs()).
func resolveShellPATH(ctx context.Context) string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}
	cmd := exec.CommandContext(ctx, shell, "-lic", "echo $PATH")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return ""
	}
	return strings.TrimSpace(out.String())
}

// execRunner is the real Runner. It resolves PATH once at construction and uses
// it for every child process and lookup.
type execRunner struct {
	pathEnv string
}

func newExecRunner(ctx context.Context) *execRunner {
	return &execRunner{pathEnv: mergePATH(resolveShellPATH(ctx), commonDirs())}
}

func (r *execRunner) env() []string {
	env := os.Environ()
	out := make([]string, 0, len(env)+1)
	for _, e := range env {
		if strings.HasPrefix(e, "PATH=") {
			continue
		}
		out = append(out, e)
	}
	return append(out, "PATH="+r.pathEnv)
}

func (r *execRunner) Run(ctx context.Context, name string, args ...string) (string, string, error) {
	path, ok := r.LookPath(name)
	if !ok {
		path = name // let exec produce a not-found error
	}
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = r.env()
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

func (r *execRunner) LookPath(name string) (string, bool) {
	for _, dir := range strings.Split(r.pathEnv, ":") {
		if dir == "" {
			continue
		}
		p := filepath.Join(dir, name)
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() && fi.Mode()&0o111 != 0 {
			return p, true
		}
	}
	return "", false
}
