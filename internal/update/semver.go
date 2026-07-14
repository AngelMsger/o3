// Package update checks GitHub Releases for a newer o3 and picks the right
// download for this platform. It never installs anything: o3's builds are
// unsigned, so a self-replacing updater would mean stripping the quarantine
// flag ourselves. The caller opens the download URL in the user's browser.
package update

import (
	"strconv"
	"strings"
)

// Version is a parsed SemVer 2.0.0 version. Build metadata is parsed and
// discarded: the spec excludes it from precedence.
type Version struct {
	Major, Minor, Patch int
	Pre                 []string // prerelease identifiers; empty for a stable release
}

// Parse accepts "1.2.3", "v1.2.3", "1.2.3-rc.1" and "1.2.3+build.5". It rejects
// leading zeros in the numeric fields, matching the SemVer grammar the release
// workflow validates tags against.
//
// internal/ecosystem has its own compareSemver, but it is numeric-x.y.z only and
// ignores prerelease suffixes — it would rank 1.0.0-rc.1 equal to 1.0.0 and tell
// an RC user to "update" to the version they are already running. Its inputs are
// npm dist-tags, which are always stable, so it stays as it is; o3's own tags can
// carry a -rc.N suffix, so they need the real thing.
func Parse(v string) (Version, bool) {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if v == "" {
		return Version{}, false
	}

	// Strip build metadata (everything from the first '+').
	if i := strings.IndexByte(v, '+'); i >= 0 {
		if i == len(v)-1 { // a trailing '+' with no identifiers is invalid
			return Version{}, false
		}
		v = v[:i]
	}

	// Split off the prerelease (everything from the first '-').
	var pre []string
	if i := strings.IndexByte(v, '-'); i >= 0 {
		rest := v[i+1:]
		v = v[:i]
		if rest == "" {
			return Version{}, false
		}
		pre = strings.Split(rest, ".")
		for _, id := range pre {
			if !validPreID(id) {
				return Version{}, false
			}
		}
	}

	core := strings.Split(v, ".")
	if len(core) != 3 {
		return Version{}, false
	}
	nums := make([]int, 3)
	for i, part := range core {
		n, ok := parseNumericID(part)
		if !ok {
			return Version{}, false
		}
		nums[i] = n
	}
	return Version{Major: nums[0], Minor: nums[1], Patch: nums[2], Pre: pre}, true
}

// parseNumericID parses a SemVer numeric identifier: digits only, and no leading
// zero unless the identifier is exactly "0".
func parseNumericID(s string) (int, bool) {
	if s == "" || !allDigits(s) {
		return 0, false
	}
	if len(s) > 1 && s[0] == '0' {
		return 0, false
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, false
	}
	return n, true
}

// validPreID reports whether s is a legal prerelease identifier: non-empty,
// alphanumerics and hyphens only, and no leading zero when purely numeric.
func validPreID(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		alnum := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '-'
		if !alnum {
			return false
		}
	}
	if allDigits(s) && len(s) > 1 && s[0] == '0' {
		return false
	}
	return true
}

func allDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return len(s) > 0
}

// Compare implements SemVer 2.0.0 §11 precedence, returning -1, 0 or 1.
//
// Unparseable input sorts BELOW any valid version (and two unparseable inputs
// compare equal), so a malformed tag on the release can never claim to be an
// update over a real installed version.
func Compare(a, b string) int {
	va, aok := Parse(a)
	vb, bok := Parse(b)
	switch {
	case !aok && !bok:
		return 0
	case !aok:
		return -1
	case !bok:
		return 1
	}

	for _, d := range [3][2]int{
		{va.Major, vb.Major},
		{va.Minor, vb.Minor},
		{va.Patch, vb.Patch},
	} {
		if d[0] != d[1] {
			return sign(d[0] - d[1])
		}
	}

	// A version WITH a prerelease has lower precedence than the same core
	// version without one: 1.0.0-rc.1 < 1.0.0.
	switch {
	case len(va.Pre) == 0 && len(vb.Pre) == 0:
		return 0
	case len(va.Pre) == 0:
		return 1
	case len(vb.Pre) == 0:
		return -1
	}
	return comparePre(va.Pre, vb.Pre)
}

// comparePre compares prerelease identifiers left to right. Numeric identifiers
// compare numerically and rank below alphanumeric ones; alphanumerics compare
// by ASCII. When all shared fields are equal, the longer list wins:
// 1.0.0-alpha < 1.0.0-alpha.1.
func comparePre(a, b []string) int {
	for i := 0; i < len(a) && i < len(b); i++ {
		x, y := a[i], b[i]
		if x == y {
			continue
		}
		nx, xnum := parseNumericID(x)
		ny, ynum := parseNumericID(y)
		switch {
		case xnum && ynum:
			return sign(nx - ny)
		case xnum: // numeric ranks below alphanumeric
			return -1
		case ynum:
			return 1
		default:
			return sign(strings.Compare(x, y))
		}
	}
	return sign(len(a) - len(b))
}

func sign(n int) int {
	switch {
	case n < 0:
		return -1
	case n > 0:
		return 1
	}
	return 0
}

// IsDev reports a non-release build: the "dev" default from main.go, an empty
// string, or anything Parse rejects. A dev build must never be told to update.
func IsDev(v string) bool {
	_, ok := Parse(v)
	return !ok
}
