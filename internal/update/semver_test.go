package update

import "testing"

func TestParse(t *testing.T) {
	tests := []struct {
		in    string
		ok    bool
		major int
		minor int
		patch int
		pre   []string
	}{
		{in: "1.2.3", ok: true, major: 1, minor: 2, patch: 3},
		{in: "v1.2.3", ok: true, major: 1, minor: 2, patch: 3},
		{in: " v0.1.0 ", ok: true, minor: 1},
		{in: "1.2.3-rc.1", ok: true, major: 1, minor: 2, patch: 3, pre: []string{"rc", "1"}},
		{in: "1.2.3+build.5", ok: true, major: 1, minor: 2, patch: 3},
		{in: "1.2.3-rc.1+build.5", ok: true, major: 1, minor: 2, patch: 3, pre: []string{"rc", "1"}},
		{in: "10.20.30", ok: true, major: 10, minor: 20, patch: 30},
		{in: "0.0.0", ok: true},

		{in: "", ok: false},
		{in: "dev", ok: false},
		{in: "1.2", ok: false},
		{in: "1.2.3.4", ok: false},
		{in: "01.2.3", ok: false}, // leading zero in the core
		{in: "1.02.3", ok: false},
		{in: "1.2.3-", ok: false}, // empty prerelease
		{in: "1.2.3-rc..1", ok: false},
		{in: "1.2.3-01", ok: false}, // leading zero in a numeric prerelease id
		{in: "1.2.3+", ok: false},
		{in: "1.2.x", ok: false},
		{in: "not-a-version", ok: false},
	}
	for _, tt := range tests {
		got, ok := Parse(tt.in)
		if ok != tt.ok {
			t.Errorf("Parse(%q) ok = %v, want %v", tt.in, ok, tt.ok)
			continue
		}
		if !ok {
			continue
		}
		if got.Major != tt.major || got.Minor != tt.minor || got.Patch != tt.patch {
			t.Errorf("Parse(%q) core = %d.%d.%d, want %d.%d.%d",
				tt.in, got.Major, got.Minor, got.Patch, tt.major, tt.minor, tt.patch)
		}
		if len(got.Pre) != len(tt.pre) {
			t.Errorf("Parse(%q) pre = %v, want %v", tt.in, got.Pre, tt.pre)
			continue
		}
		for i := range tt.pre {
			if got.Pre[i] != tt.pre[i] {
				t.Errorf("Parse(%q) pre = %v, want %v", tt.in, got.Pre, tt.pre)
				break
			}
		}
	}
}

// TestCompareChain walks the precedence chain from the SemVer 2.0.0 spec (§11):
// each entry must be strictly less than the next.
func TestCompareChain(t *testing.T) {
	chain := []string{
		"1.0.0-alpha",
		"1.0.0-alpha.1",
		"1.0.0-alpha.beta",
		"1.0.0-beta",
		"1.0.0-beta.2",
		"1.0.0-beta.11",
		"1.0.0-rc.1",
		"1.0.0",
		"1.0.1",
		"1.1.0",
		"2.0.0",
	}
	for i := 0; i < len(chain)-1; i++ {
		lo, hi := chain[i], chain[i+1]
		if got := Compare(lo, hi); got != -1 {
			t.Errorf("Compare(%q, %q) = %d, want -1", lo, hi, got)
		}
		if got := Compare(hi, lo); got != 1 {
			t.Errorf("Compare(%q, %q) = %d, want 1", hi, lo, got)
		}
	}
}

func TestCompare(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"1.2.3", "1.2.3", 0},
		{"v1.2.3", "1.2.3", 0},                 // the "v" prefix is not significant
		{"1.0.0+build.1", "1.0.0+build.2", 0},  // build metadata is ignored
		{"1.0.0-rc.1+a", "1.0.0-rc.1+b", 0},    //
		{"1.2.3", "1.10.0", -1},                // numeric, not lexical
		{"1.2.3-rc.1", "1.2.3", -1},            // a prerelease is below its core version
		{"1.2.3", "1.2.3-rc.1", 1},             //
		{"0.1.0", "0.1.0-rc.1", 1},             //
		{"dev", "1.0.0", -1},                   // unparseable sorts below anything valid
		{"1.0.0", "dev", 1},                    //
		{"dev", "dev", 0},                      //
		{"", "garbage", 0},                     //
		{"1.0.0-0", "1.0.0-rc", -1},            // numeric ranks below alphanumeric
		{"1.0.0-rc.1", "1.0.0-rc.1.1", -1},     // a longer identifier list wins
		{"1.0.0-alpha-1", "1.0.0-alpha-2", -1}, // hyphens inside an identifier
	}
	for _, tt := range tests {
		if got := Compare(tt.a, tt.b); got != tt.want {
			t.Errorf("Compare(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestIsDev(t *testing.T) {
	for _, v := range []string{"", "dev", "unknown", "1.2", "garbage"} {
		if !IsDev(v) {
			t.Errorf("IsDev(%q) = false, want true", v)
		}
	}
	for _, v := range []string{"1.2.3", "v1.2.3", "0.0.1-rc.1"} {
		if IsDev(v) {
			t.Errorf("IsDev(%q) = true, want false", v)
		}
	}
}

func TestNumeric(t *testing.T) {
	cases := map[string]string{
		"1.2.3":           "1.2.3",
		"v1.2.3":          "1.2.3",
		"1.2.3-rc.1":      "1.2.3",
		"1.2.3+build.5":   "1.2.3",
		"1.2.3-rc.1+b.5":  "1.2.3",
		" v1.2.3-alpha.2": "1.2.3",
		"":                "",
	}
	for in, want := range cases {
		if got := Numeric(in); got != want {
			t.Errorf("Numeric(%q) = %q, want %q", in, got, want)
		}
	}
}
