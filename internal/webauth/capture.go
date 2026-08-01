// Package webauth is o3's browser sign-in transport layer. The decision logic
// — cookie shaping, the login-success heuristic, the injected capture script
// and the policy deciding when a captured state counts as a completed login —
// lives in openobserve-cli's pkg/webauth, shared with the CLI so the two cannot
// drift. What remains here is transport: the native WKWebView window on macOS
// (webauth_darwin.go/.m) plus the decoder for the JSON payload that window
// hands to Go. Off macOS the shared DevTools-Protocol driver takes over, so
// browser sign-in is no longer macOS-only.
package webauth

import (
	"encoding/json"
	"time"

	shared "github.com/angelmsger/openobserve-cli/pkg/webauth"
)

// nativeProbe is the JSON payload the native window hands to Go on each capture
// probe: the current WebView URL plus the cookies and any Authorization/email
// observed. Parsing it here (rather than in Objective-C) keeps the native shell
// thin and this decoding unit-testable.
type nativeProbe struct {
	URL           string         `json:"url"`
	Authorization string         `json:"authorization"`
	Email         string         `json:"email"`
	Cookies       []nativeCookie `json:"cookies"`
}

type nativeCookie struct {
	Name     string  `json:"name"`
	Value    string  `json:"value"`
	Domain   string  `json:"domain"`
	Path     string  `json:"path"`
	Expires  float64 `json:"expires"` // unix seconds; 0 for a session cookie
	Secure   bool    `json:"secure"`
	HTTPOnly bool    `json:"httpOnly"`
}

// parseProbe decodes a native probe payload into cookies plus the observed URL,
// Authorization header, and email.
func parseProbe(data []byte) (cookies []shared.Cookie, currentURL, authorization, email string, err error) {
	var p nativeProbe
	if err = json.Unmarshal(data, &p); err != nil {
		return nil, "", "", "", err
	}
	cookies = make([]shared.Cookie, 0, len(p.Cookies))
	for _, c := range p.Cookies {
		var exp time.Time
		if c.Expires > 0 {
			exp = time.Unix(int64(c.Expires), 0).UTC()
		}
		cookies = append(cookies, shared.Cookie{
			Name: c.Name, Value: c.Value, Domain: c.Domain, Path: c.Path,
			Expires: exp, Secure: c.Secure, HTTPOnly: c.HTTPOnly,
		})
	}
	return cookies, p.URL, p.Authorization, p.Email, nil
}
