package ecosystem

import (
	"strings"
	"testing"
)

func TestMergePATH(t *testing.T) {
	// shell PATH wins order; extras appended; duplicates and empties dropped.
	got := mergePATH("/usr/bin:/bin", []string{"/opt/homebrew/bin", "/bin", "", "/usr/local/bin"})
	parts := strings.Split(got, ":")
	want := []string{"/usr/bin", "/bin", "/opt/homebrew/bin", "/usr/local/bin"}
	if len(parts) != len(want) {
		t.Fatalf("got %v, want %v", parts, want)
	}
	for i := range want {
		if parts[i] != want[i] {
			t.Fatalf("got %v, want %v", parts, want)
		}
	}
}

func TestMergePATHEmptyShell(t *testing.T) {
	got := mergePATH("", []string{"/opt/homebrew/bin", "/usr/local/bin"})
	if got != "/opt/homebrew/bin:/usr/local/bin" {
		t.Fatalf("got %q", got)
	}
}
