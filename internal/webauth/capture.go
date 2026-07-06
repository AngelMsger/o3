package webauth

import (
	"encoding/json"
	"time"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
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
func parseProbe(data []byte) (cookies []Cookie, currentURL, authorization, email string, err error) {
	var p nativeProbe
	if err = json.Unmarshal(data, &p); err != nil {
		return nil, "", "", "", err
	}
	cookies = make([]Cookie, 0, len(p.Cookies))
	for _, c := range p.Cookies {
		var exp time.Time
		if c.Expires > 0 {
			exp = time.Unix(int64(c.Expires), 0).UTC()
		}
		cookies = append(cookies, Cookie{
			Name: c.Name, Value: c.Value, Domain: c.Domain, Path: c.Path,
			Expires: exp, Secure: c.Secure, HTTPOnly: c.HTTPOnly,
		})
	}
	return cookies, p.URL, p.Authorization, p.Email, nil
}

// AssembleSession builds the storable/replayable session from captured cookies.
// Only cookies scoped to host are kept; the Cookie header is serialized stably,
// and the soonest cookie expiry (if any) drives the connection UI. Authorization
// and email ride along as the header fallback and display metadata.
func AssembleSession(cookies []Cookie, host, authorization, email string) pkgauth.Session {
	scoped := FilterForHost(cookies, host)
	return pkgauth.Session{
		Cookies:       SerializeCookies(scoped),
		Authorization: authorization,
		Email:         email,
		ExpiresAt:     EarliestExpiry(scoped),
	}
}
