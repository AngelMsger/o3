package main

import (
	"context"
	"testing"

	"github.com/angelmsger/o3/internal/ecosystem"
)

// stubRunner reports nothing installed.
type stubRunner struct{}

func (stubRunner) LookPath(string) (string, bool) { return "", false }
func (stubRunner) Run(context.Context, string, ...string) (string, string, error) {
	return "", "", nil
}

// Wails dispatches bound-method calls before startup() returns — building the
// ecosystem service resolves PATH from a login shell, which takes seconds — so
// every eco-backed method can be invoked while a.eco is still nil (and, at the
// very edge, before a.ctx is set). They must build the service on demand rather
// than dereference nil. Regression test for the EcosystemStatus startup panic.
func TestEcosystemMethodsBeforeStartup(t *testing.T) {
	stub := func() *ecosystem.Service {
		return ecosystem.New(stubRunner{}, func(context.Context) (string, error) { return "", nil })
	}

	// Zero App: startup() has not run, so eco and ctx are both nil.
	t.Run("status", func(t *testing.T) {
		a := &App{newEco: stub}
		st, err := a.EcosystemStatus()
		if err != nil {
			t.Fatal(err)
		}
		if st.CLI.Installed {
			t.Error("expected CLI not installed with stub runner")
		}
	})

	// The other bound eco methods share the same nil receiver.
	t.Run("mutators", func(t *testing.T) {
		for name, call := range map[string]func(*App) error{
			"InstallCLI":     (*App).InstallCLI,
			"UpgradeCLI":     (*App).UpgradeCLI,
			"UninstallCLI":   (*App).UninstallCLI,
			"InstallSkill":   (*App).InstallSkill,
			"UninstallSkill": (*App).UninstallSkill,
		} {
			// Each gets a fresh App: startup() has not run.
			a := &App{newEco: stub}
			if err := call(a); err != nil {
				t.Logf("%s returned err=%v (fine — must simply not panic)", name, err)
			}
		}
	})
}

func TestEcosystemStatusMethod(t *testing.T) {
	a := &App{ctx: context.Background()}
	a.eco = ecosystem.New(stubRunner{}, func(context.Context) (string, error) { return "", nil })
	st, err := a.EcosystemStatus()
	if err != nil {
		t.Fatal(err)
	}
	if st.CLI.Installed {
		t.Error("expected CLI not installed with stub runner")
	}
}
