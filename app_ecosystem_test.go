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
