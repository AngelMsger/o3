package ecosystem

import (
	"context"
	"testing"
)

func TestNewProductionBuilds(t *testing.T) {
	s := NewProduction(context.Background())
	if s == nil || s.run == nil || s.latest == nil {
		t.Fatal("NewProduction returned an incomplete Service")
	}
}
