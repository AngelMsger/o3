package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	api "github.com/angelmsger/openobserve-cli/pkg/apiclient"
	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
	cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"
	shared "github.com/angelmsger/openobserve-cli/pkg/webauth"

	"github.com/angelmsger/o3/internal/apperr"
	"github.com/angelmsger/o3/internal/branding"
	"github.com/angelmsger/o3/internal/config"
	"github.com/angelmsger/o3/internal/ecosystem"
	"github.com/angelmsger/o3/internal/metrics"
	"github.com/angelmsger/o3/internal/query"
	"github.com/angelmsger/o3/internal/update"
	"github.com/angelmsger/o3/internal/webauth"
)

// App is the Wails-bound application. It owns a lazily-built client for the
// context the frontend is currently working in.
type App struct {
	ctx context.Context

	mu     sync.Mutex
	client api.Client // nil until built for the active context
	// active is the context name a.client was built for, "" before the first
	// build. o3 binds the client per query tab (see UseContext), so this — not
	// the shared config's current-context — is what the live client follows.
	active string

	// eco is built lazily through ecoService, never assigned directly: Wails can
	// dispatch bound-method calls before startup() finishes building it.
	// ecoOnce makes that construction happen exactly once, and publishes it
	// safely to the goroutines serving those calls. newEco overrides the
	// production builder in tests; nil means production.
	eco     *ecosystem.Service
	ecoOnce sync.Once
	newEco  func() *ecosystem.Service

	upd *update.Service
	// native is the OS update framework (Sparkle/WinSparkle) in release builds,
	// nil everywhere else. nil selects the custom check-only flow below.
	native nativeUpdater
	// updMu guards the pending result and every prefs read-modify-write. It is
	// deliberately NOT a.mu: that one is held across query paths, and taking it
	// around a 10-second HTTP call would stall the UI.
	updMu   sync.Mutex
	pending update.Result // the last background result; the zero value means none
	// emit overrides the Wails event emitter; nil means production. Tests only:
	// wruntime.EventsEmit rejects any context that did not come from a Wails
	// lifecycle hook. See App.emitEvent.
	emit func(ctx context.Context, name string, data ...interface{})
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{upd: update.NewProduction(version), native: newNativeUpdater()}
}

// startup records the Wails context, best-effort builds the client for the
// current context, and kicks off the background update check.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Warm the ecosystem service off the startup path. Building it resolves PATH
	// from a login shell (seconds), and Wails dispatches bound-method calls before
	// startup returns — so it must not be assigned here directly. See ecoService.
	go a.ecoService()
	if a.upd == nil { // tests construct App literals
		a.upd = update.NewProduction(version)
	}
	_ = a.rebuildClient() // best-effort; data methods re-report if it fails
	a.installUpdateMenuItem()
	if a.native != nil {
		// The OS framework schedules its own background checks; hand it the
		// persisted toggle and stay out of the way. The custom goroutine below
		// must not also run, or the user would get two update prompts.
		auto := true
		if p, err := config.LoadPrefs(); err == nil {
			auto = p.UpdateCheck != "off"
		}
		a.native.Start(a, auto)
		return
	}
	go a.backgroundUpdateCheck(ctx)
}

// shutdown releases the native updater (WinSparkle requires a Cleanup call
// before exit; Sparkle's is a no-op).
func (a *App) shutdown(context.Context) {
	if a.native != nil {
		a.native.Shutdown()
	}
}

// ConnConfig is a connection's settings exchanged with the frontend. Secret and
// OrigName are inbound only (Save/Test).
type ConnConfig struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	Org      string `json:"org"`
	Scheme   string `json:"scheme"`
	Username string `json:"username"`
	Secret   string `json:"secret"`
	OrigName string `json:"origName"` // inbound only: the name before a rename
}

// ConnInfo summarizes a verified connection.
type ConnInfo struct {
	OrgCount    int `json:"orgCount"`
	StreamCount int `json:"streamCount"`
}

// ContextInfo describes one context for the switcher/manager. Secrets are never
// included; HasSecret reports keychain presence.
type ContextInfo struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	Org       string `json:"org"`
	Scheme    string `json:"scheme"`
	Username  string `json:"username"`
	HasSecret bool   `json:"hasSecret"`
	IsCurrent bool   `json:"isCurrent"`
}

// StreamInfo describes one stream for the picker.
type StreamInfo struct {
	Name       string `json:"name"`
	StreamType string `json:"streamType"`
	Docs       int64  `json:"docs"`
	Size       string `json:"size"`
}

// Field is one schema field.
type Field struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

func schemeOrBasic(s string) string {
	if s == "" {
		return pkgauth.SchemeBasic
	}
	return s
}

func orgOrDefault(org string) string {
	if org == "" {
		return "default"
	}
	return org
}

// configDir returns the shared config directory (~/.angelmsger/openobserve).
func configDir() (string, error) { return cfgshared.DefaultConfigDir() }

// contextInfos maps a config File to ContextInfo values; has reports whether a
// keychain secret exists for a (url, scheme). Pure, so it is unit-tested.
func contextInfos(f cfgshared.File, has func(url, scheme string) bool) []ContextInfo {
	out := make([]ContextInfo, 0, len(f.Contexts))
	for _, c := range f.Contexts {
		scheme := schemeOrBasic(c.Auth.Scheme)
		out = append(out, ContextInfo{
			Name:      c.Name,
			URL:       c.BaseURL,
			Org:       c.Org,
			Scheme:    scheme,
			Username:  c.Auth.Username,
			HasSecret: has(c.BaseURL, scheme),
			IsCurrent: c.Name == f.CurrentContext,
		})
	}
	return out
}

// sameAccount reports whether two (url, scheme) pairs resolve to the same
// keychain account. Secrets are keyed by host+scheme (see pkgauth.AccountKey),
// so differing orgs or paths on one instance share a stored secret.
func sameAccount(url1, scheme1, url2, scheme2 string) bool {
	return pkgauth.AccountKey(url1, schemeOrBasic(scheme1)) == pkgauth.AccountKey(url2, schemeOrBasic(scheme2))
}

// accountInUse reports whether any context in f (other than one named except)
// resolves to the same keychain account as (url, scheme). Because secrets are
// shared by host+scheme, a secret must survive as long as any context still
// references it — deleting it would break those siblings. Pass except="" to
// count every context.
func accountInUse(f cfgshared.File, url, scheme, except string) bool {
	target := pkgauth.AccountKey(url, schemeOrBasic(scheme))
	for _, c := range f.Contexts {
		if except != "" && strings.EqualFold(c.Name, except) {
			continue
		}
		if pkgauth.AccountKey(c.BaseURL, schemeOrBasic(c.Auth.Scheme)) == target {
			return true
		}
	}
	return false
}

// fileDefaults reads the shared config Defaults (timeout/retries), falling back
// to zero values when the config cannot be read, so live and probe clients use
// the same connection settings.
func (a *App) fileDefaults() cfgshared.Defaults {
	dir, err := configDir()
	if err != nil {
		return cfgshared.Defaults{}
	}
	f, _, err := cfgshared.ReadFile(dir)
	if err != nil {
		return cfgshared.Defaults{}
	}
	return f.Defaults
}

// buildClient assembles an authenticated client for a context with a secret.
func buildClient(url, org, scheme, username, secret string, def cfgshared.Defaults) (api.Client, error) {
	cred := pkgauth.Credential{Scheme: schemeOrBasic(scheme), Username: username, Secret: secret}
	if err := cred.Validate(); err != nil {
		return nil, err
	}
	return api.Build(api.BuildParams{
		BaseURL:       url,
		Org:           orgOrDefault(org),
		AuthDecorator: cred.Decorator(),
		Timeout:       def.Timeout,
		MaxRetries:    def.MaxRetries,
	})
}

// clientForContext builds a client for a named context plus its keychain
// secret. An empty name selects the shared config's current-context (falling
// back to the first entry) — the cold-start case, before the frontend has told
// us which context its active tab is on. The resolved name is returned even on
// failure so callers can record what they were pointed at.
func (a *App) clientForContext(name string) (api.Client, string, error) {
	dir, err := configDir()
	if err != nil {
		return nil, "", apperr.Wrap(err)
	}
	f, ok, err := cfgshared.ReadFile(dir)
	if err != nil {
		return nil, "", apperr.Wrap(err)
	}
	if !ok || len(f.Contexts) == 0 {
		return nil, "", apperr.NotConfigured("no contexts configured")
	}
	target := name
	if target == "" {
		target = f.CurrentContext
	}
	cur, found := f.Context(target)
	if !found {
		if name != "" {
			return nil, "", apperr.Wrap(fmt.Errorf("unknown context %q", name))
		}
		cur = f.Contexts[0]
	}
	scheme := schemeOrBasic(cur.Auth.Scheme)
	secret, has, err := config.LoadSecret(cur.BaseURL, scheme)
	if err != nil {
		return nil, cur.Name, apperr.Wrap(err)
	}
	if !has {
		return nil, cur.Name, apperr.NotConfigured("no stored credential for context " + cur.Name)
	}
	client, err := buildClient(cur.BaseURL, cur.Org, scheme, cur.Auth.Username, secret, f.Defaults)
	if err != nil {
		return nil, cur.Name, apperr.Wrap(err)
	}
	return client, cur.Name, nil
}

// bindContext points the live client at a context. On failure the client is
// cleared but `active` still records the intended context, so a later retry
// cannot silently fall back to a different one and answer with its data.
func (a *App) bindContext(name string) error {
	client, resolved, err := a.clientForContext(name)
	a.mu.Lock()
	a.client = client // nil on failure
	if resolved != "" {
		a.active = resolved
	}
	a.mu.Unlock()
	return err
}

// UseContext binds the live client to a named context WITHOUT touching the
// shared config's current-context.
//
// o3 scopes a context to a query tab rather than to the whole app, so switching
// tabs re-points the client many times a session. current-context is
// openobserve-cli's active-context — a setting the user manages from the CLI —
// and rewriting it on every tab switch would hijack it. See the "New tabs open
// with" explainer in Settings.
func (a *App) UseContext(name string) error {
	if name == "" {
		return apperr.Wrap(fmt.Errorf("context name is required"))
	}
	return a.bindContext(name)
}

// rebuildClient rebuilds a.client for whichever context is currently bound,
// falling back to the config's current-context on a cold start.
func (a *App) rebuildClient() error {
	a.mu.Lock()
	name := a.active
	a.mu.Unlock()
	return a.bindContext(name)
}

// requireClient returns the built client or a not-configured error.
func (a *App) requireClient() (api.Client, error) {
	a.mu.Lock()
	client := a.client
	a.mu.Unlock()
	if client == nil {
		if err := a.rebuildClient(); err != nil {
			return nil, err
		}
		a.mu.Lock()
		client = a.client
		a.mu.Unlock()
	}
	if client == nil {
		return nil, apperr.NotConfigured("not connected")
	}
	return client, nil
}

// ListContexts returns every context in the shared config, with keychain
// presence and which is current.
func (a *App) ListContexts() ([]ContextInfo, error) {
	dir, err := configDir()
	if err != nil {
		return nil, apperr.Wrap(err)
	}
	f, ok, err := cfgshared.ReadFile(dir)
	if err != nil {
		return nil, apperr.Wrap(err)
	}
	if !ok {
		return []ContextInfo{}, nil
	}
	has := func(url, scheme string) bool {
		_, present, _ := config.LoadSecret(url, scheme)
		return present
	}
	return contextInfos(f, has), nil
}

// SaveContext upserts a context into the shared config (and its secret into the
// keychain when provided), then rebuilds the client if the saved context is
// current.
func (a *App) SaveContext(c ConnConfig) error {
	if c.Name == "" || c.URL == "" {
		return apperr.Wrap(fmt.Errorf("context name and URL are required"))
	}
	// I2: normalize the URL (add scheme, trim trailing slash) before it is
	// stored or used as a secret key, so config.BaseURL always builds a valid
	// client and every keychain lookup — including SessionStatus/SignOut, which
	// normalize their input — resolves to the same account.
	base, err := normalizeURL(c.URL)
	if err != nil {
		return apperr.Wrap(err)
	}
	scheme := schemeOrBasic(c.Scheme)
	dir, err := configDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	f, _, err := cfgshared.ReadFile(dir) // missing file -> empty File, ok ignored
	if err != nil {
		return apperr.Wrap(err)
	}
	// Snapshot the pre-change entry (by its old name) so a URL/scheme change can
	// clean up the now-orphaned secret below.
	oldName := c.Name
	if c.OrigName != "" {
		oldName = c.OrigName
	}
	oldCtx, hadOld := f.Context(oldName)
	// An empty secret means "keep the credential already stored for this
	// account", not "save a context that cannot authenticate". This matters when
	// editing an existing context: the UI intentionally does not read passwords
	// back out of the keychain. If the URL or scheme changed, however, there may
	// be no credential under the new account. Reject that before touching either
	// config.yaml or the old credential.
	if c.Secret == "" {
		if _, has, loadErr := config.LoadSecret(base, scheme); loadErr != nil {
			return apperr.Wrap(loadErr)
		} else if !has {
			return apperr.Wrap(fmt.Errorf("a credential is required for %s authentication at %s", scheme, base))
		}
	}
	// I1: when the context was renamed, remove the old entry before upserting
	// the new name so the shared config.yaml never accumulates duplicates.
	if c.OrigName != "" && !strings.EqualFold(c.OrigName, c.Name) {
		f.Remove(c.OrigName)
		if strings.EqualFold(f.CurrentContext, c.OrigName) {
			f.CurrentContext = c.Name // keep the current pointer following the rename
		}
	}
	f.Upsert(cfgshared.NamedContext{
		Name:    c.Name,
		BaseURL: base,
		Org:     orgOrDefault(c.Org),
		Auth:    cfgshared.AuthConfig{Scheme: scheme, Username: c.Username},
	})
	if f.CurrentContext == "" {
		f.CurrentContext = c.Name // first context becomes current
	}
	// I3 (transactional): persist the secret BEFORE config.yaml. If the keychain
	// is locked or denies access, neither is written — rather than leaving a
	// context that points at a missing credential and starts the app unusable.
	// Keep the previous value so a later config write failure can roll the
	// keychain back as well.
	var previousSecret string
	var previousSecretPresent bool
	if c.Secret != "" {
		previousSecret, previousSecretPresent, err = config.LoadSecret(base, scheme)
		if err != nil {
			return apperr.Wrap(err)
		}
		if err := config.SaveSecret(base, scheme, c.Secret); err != nil {
			return apperr.Wrap(err)
		}
	}
	if err := cfgshared.WriteFile(dir, f); err != nil {
		if c.Secret != "" {
			if previousSecretPresent {
				_ = config.SaveSecret(base, scheme, previousSecret)
			} else {
				_ = config.DeleteSecret(base, scheme)
			}
		}
		return apperr.Wrap(err)
	}
	// Clean up an orphaned secret after a URL/scheme change: delete the old
	// account only when nothing else references it (secrets are shared by
	// host+scheme).
	if hadOld {
		oldScheme := schemeOrBasic(oldCtx.Auth.Scheme)
		if !sameAccount(oldCtx.BaseURL, oldScheme, base, scheme) &&
			!accountInUse(f, oldCtx.BaseURL, oldScheme, "") {
			_ = config.DeleteSecret(oldCtx.BaseURL, oldScheme)
		}
	}
	// Rebuild when the saved context is the one the live client is bound to.
	// That is the tab's context, not the config's current-context: with contexts
	// scoped per tab, editing the context you are querying must take effect, and
	// editing a different one must not disturb the live connection.
	a.mu.Lock()
	live := a.active
	a.mu.Unlock()
	if strings.EqualFold(c.Name, live) || (live == "" && c.Name == f.CurrentContext) {
		return apperr.Wrap(a.bindContext(c.Name))
	}
	return nil
}

// RemoveContext deletes a context (and its keychain secret). It refuses to
// remove the last context.
func (a *App) RemoveContext(name string) error {
	dir, err := configDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	f, ok, err := cfgshared.ReadFile(dir)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !ok || len(f.Contexts) <= 1 {
		return apperr.Wrap(fmt.Errorf("cannot remove the last context"))
	}
	ctx, found := f.Context(name)
	if !found {
		return apperr.Wrap(fmt.Errorf("unknown context %q", name))
	}
	f.Remove(name)
	if f.CurrentContext == name && len(f.Contexts) > 0 {
		f.CurrentContext = f.Contexts[0].Name
	}
	if err := cfgshared.WriteFile(dir, f); err != nil {
		return apperr.Wrap(err)
	}
	// I4: only delete the secret when no remaining context shares its
	// host+scheme account; otherwise sibling contexts (e.g. another org on the
	// same instance) would lose their credential as a side effect of removing
	// this one.
	oldScheme := schemeOrBasic(ctx.Auth.Scheme)
	if !accountInUse(f, ctx.BaseURL, oldScheme, "") {
		_ = config.DeleteSecret(ctx.BaseURL, oldScheme)
	}
	// The removed context may be the one the live client was bound to; drop that
	// binding so the rebuild resolves a surviving context rather than a name that
	// no longer exists.
	a.mu.Lock()
	if strings.EqualFold(a.active, name) {
		a.active = ""
	}
	a.client = nil
	a.mu.Unlock()
	return apperr.Wrap(a.rebuildClient())
}

// TestConnection verifies a connection without persisting it. When Secret is
// empty it falls back to the stored keychain secret, so Test works on an
// existing context the user did not re-type. It uses the file Defaults so the
// timeout and retry settings match the live client (I2).
func (a *App) TestConnection(c ConnConfig) (ConnInfo, error) {
	base, err := normalizeURL(c.URL)
	if err != nil {
		return ConnInfo{}, apperr.Wrap(err)
	}
	scheme := schemeOrBasic(c.Scheme)
	secret := c.Secret
	if secret == "" {
		if stored, has, loadErr := config.LoadSecret(base, scheme); loadErr != nil {
			return ConnInfo{}, apperr.Wrap(loadErr)
		} else if has {
			secret = stored
		}
	}
	// I2: read Defaults from the shared config so Test matches the live client.
	var fileDef cfgshared.Defaults
	if dir, dirErr := configDir(); dirErr == nil {
		if f, _, readErr := cfgshared.ReadFile(dir); readErr == nil {
			fileDef = f.Defaults
		}
	}
	client, err := buildClient(base, c.Org, scheme, c.Username, secret, fileDef)
	if err != nil {
		return ConnInfo{}, apperr.Wrap(err)
	}
	orgs, err := client.Ping(a.ctx)
	if err != nil {
		return ConnInfo{}, apperr.Wrap(err)
	}
	info := ConnInfo{OrgCount: len(orgs)}
	if streams, err := client.ListStreams(a.ctx, orgOrDefault(c.Org), "logs", false); err == nil {
		info.StreamCount = len(streams)
	}
	return info, nil
}

// --- Browser sign-in (captured session) ---

// SessionResult is returned to the frontend after a browser capture, before the
// user authorizes persistence. Secret is the encoded session blob handed back
// to SaveContext once the user authorizes.
type SessionResult struct {
	Email     string `json:"email"`
	Org       string `json:"org"`
	Secret    string `json:"secret"`
	Host      string `json:"host"`
	ExpiresAt string `json:"expiresAt"` // RFC3339, empty when unknown
}

// SessionInfo describes a stored browser session for the connection UI.
type SessionInfo struct {
	Email     string `json:"email"`
	ExpiresAt string `json:"expiresAt"` // RFC3339, empty when unknown
	Valid     bool   `json:"valid"`
}

// normalizeURL ensures the instance URL has a scheme and no trailing slash.
func normalizeURL(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("instance URL is required")
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" {
		return "", fmt.Errorf("invalid instance URL %q", raw)
	}
	u.Path = strings.TrimRight(u.Path, "/")
	return u.String(), nil
}

// hostOf returns the host (with any port) of a URL, for cookie scoping.
func hostOf(rawURL string) string {
	if u, err := url.Parse(rawURL); err == nil && u.Host != "" {
		return u.Host
	}
	return rawURL
}

func rfc3339OrEmpty(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

// browserProfileDir is o3's own persistent browser sign-in profile, used by the
// DevTools-Protocol driver off macOS. It must NOT be the CLI's: two browser
// processes pointed at one --user-data-dir refuse to start, so sharing it would
// make a CLI login and an o3 login collide. Ignored on darwin, where the native
// WebView keeps its own (deliberately non-persistent) data store.
func browserProfileDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".angelmsger", "o3", "browser-profile")
}

// BrowserSignIn opens the platform's sign-in browser for the instance URL — the
// native window on macOS, a Chromium-family browser elsewhere — captures the
// authenticated session, and returns it for the frontend consent step. It does
// NOT persist anything; the frontend calls SaveContext once the user authorizes.
//
// The verifier is the shared one: a capture counts as a completed login only
// once a real authenticated request (Ping) succeeds with it, so an in-progress
// SSO redirect or a benign login-page cookie can never be mistaken for success.
func (a *App) BrowserSignIn(rawURL, org string) (SessionResult, error) {
	base, err := normalizeURL(rawURL)
	if err != nil {
		return SessionResult{}, apperr.Wrap(err)
	}
	host := hostOf(base)
	d := a.fileDefaults()
	verify := shared.PingVerifier(base, orgOrDefault(org), d.Timeout, d.MaxRetries)
	sess, err := webauth.Driver(browserProfileDir()).Capture(base+"/web/login", host, verify)
	if err != nil {
		return SessionResult{}, apperr.Wrap(err)
	}
	blob, err := pkgauth.EncodeSession(sess)
	if err != nil {
		return SessionResult{}, apperr.Wrap(err)
	}
	return SessionResult{
		Email:     sess.Email,
		Org:       orgOrDefault(org),
		Secret:    blob,
		Host:      host,
		ExpiresAt: rfc3339OrEmpty(sess.ExpiresAt),
	}, nil
}

// SessionStatus reports the stored browser session for a context URL (email,
// expiry) for the Settings "Connected" card. Valid is false when none is stored.
func (a *App) SessionStatus(rawURL string) (SessionInfo, error) {
	base, err := normalizeURL(rawURL)
	if err != nil {
		return SessionInfo{}, apperr.Wrap(err)
	}
	secret, has, err := config.LoadSecret(base, pkgauth.SchemeSession)
	if err != nil {
		return SessionInfo{}, apperr.Wrap(err)
	}
	if !has {
		return SessionInfo{Valid: false}, nil
	}
	s := pkgauth.DecodeSession(secret)
	return SessionInfo{
		Email:     s.Email,
		ExpiresAt: rfc3339OrEmpty(s.ExpiresAt),
		Valid:     true,
	}, nil
}

// SignOut removes the stored browser session for a context URL and drops the
// live client so the app returns to a signed-out state. Session credentials are
// keyed by host+scheme, so every context for the same host signs out together;
// retaining the shared key would let rebuildClient immediately sign the current
// context back in.
func (a *App) SignOut(rawURL string) error {
	base, err := normalizeURL(rawURL)
	if err != nil {
		return apperr.Wrap(err)
	}
	if err := config.DeleteSecret(base, pkgauth.SchemeSession); err != nil {
		return apperr.Wrap(err)
	}
	a.mu.Lock()
	a.client = nil
	a.mu.Unlock()
	_ = a.rebuildClient() // best-effort; likely not-configured after sign-out
	return nil
}

// ListStreams returns the logs streams in the configured org.
func (a *App) ListStreams() ([]StreamInfo, error) {
	client, err := a.requireClient()
	if err != nil {
		return nil, err
	}
	streams, err := client.ListStreams(a.ctx, client.DefaultOrg(), "logs", true)
	if err != nil {
		return nil, apperr.Wrap(err)
	}
	out := make([]StreamInfo, 0, len(streams))
	for _, s := range streams {
		si := StreamInfo{Name: s.Name, StreamType: s.StreamType}
		if s.Stats != nil {
			si.Docs = s.Stats.DocNum
			si.Size = humanBytes(s.Stats.StorageSize)
		}
		out = append(out, si)
	}
	return out, nil
}

// GetFields returns the schema fields for one stream.
func (a *App) GetFields(stream string) ([]Field, error) {
	client, err := a.requireClient()
	if err != nil {
		return nil, err
	}
	s, err := client.GetStream(a.ctx, client.DefaultOrg(), stream, "logs")
	if err != nil {
		return nil, apperr.Wrap(err)
	}
	out := make([]Field, 0, len(s.Schema))
	for _, f := range s.Schema {
		out = append(out, Field{Name: f.Name, Type: f.Type})
	}
	return out, nil
}

// RunQuery executes the search and (optionally) the histogram, mapping both to
// the frontend's shapes.
func (a *App) RunQuery(p query.SearchParams) (query.SearchResult, error) {
	client, err := a.requireClient()
	if err != nil {
		return query.SearchResult{}, err
	}
	size := p.Size
	if size <= 0 {
		size = 100
	}
	resp, err := client.Search(a.ctx, client.DefaultOrg(), api.SearchRequest{
		Query: api.SearchQuery{
			SQL:       p.SQL,
			StartTime: p.StartMicros,
			EndTime:   p.EndMicros,
			From:      p.From,
			Size:      size,
		},
	})
	if err != nil {
		return query.SearchResult{}, apperr.Wrap(err)
	}
	result := query.SearchResult{
		Meta: query.QueryMeta{Total: resp.Total, TookMs: resp.Took, ScanBytes: resp.ScanSize},
		Rows: query.MapHits(resp.Hits),
	}
	if p.Histogram {
		interval := query.Interval(p.StartMicros, p.EndMicros)
		where := query.ExtractWhere(p.SQL)
		hResp, herr := client.Search(a.ctx, client.DefaultOrg(), api.SearchRequest{
			Query: api.SearchQuery{
				SQL:       query.HistogramSQL(p.Stream, where, interval),
				StartTime: p.StartMicros,
				EndTime:   p.EndMicros,
				Size:      0,
			},
		})
		if herr == nil {
			result.Histogram = query.MapHistogram(hResp.Hits)
		}
	}
	return result, nil
}

// RunMetricsQuery runs a PromQL range query (the Metrics explorer) and maps the
// Prometheus matrix result into chart-ready series. The step is derived from the
// window. PromQL works in seconds; the _search API uses microseconds, so we
// convert here.
func (a *App) RunMetricsQuery(p metrics.Params) (metrics.Result, error) {
	client, err := a.requireClient()
	if err != nil {
		return metrics.Result{}, err
	}
	step := metrics.PromStep(p.StartMicros, p.EndMicros)
	resp, err := client.QueryMetricsRange(
		a.ctx, client.DefaultOrg(), p.PromQL,
		float64(p.StartMicros)/1e6, float64(p.EndMicros)/1e6, step,
	)
	if err != nil {
		return metrics.Result{}, apperr.Wrap(err)
	}
	if resp.Status != "success" {
		msg := resp.Error
		if msg == "" {
			msg = "metrics query failed"
		}
		return metrics.Result{}, apperr.Wrap(fmt.Errorf("%s", msg))
	}
	series, err := metrics.MapMatrix(resp.Data)
	if err != nil {
		return metrics.Result{}, apperr.Wrap(err)
	}
	return metrics.Result{Series: series, Step: step}, nil
}

// GetPrefs returns the persisted UI preferences (theme/accent/density),
// falling back to defaults when no prefs file exists yet.
func (a *App) GetPrefs() (config.Prefs, error) { return config.LoadPrefs() }

// SavePrefs persists the UI-owned preferences.
//
// It merges rather than overwrites: the frontend sends only theme/accent/density,
// so writing p wholesale would reset the update-owned fields (updateCheck,
// skipVersion, lastUpdateCheck) to their defaults on every theme change — wiping
// a skipped version and the check throttle. Keeping the merge here means it holds
// for any caller, not just the one frontend that happens to send a full object.
func (a *App) SavePrefs(p config.Prefs) error {
	a.updMu.Lock()
	defer a.updMu.Unlock()
	return apperr.Wrap(config.MutatePrefs(func(cur *config.Prefs) {
		cur.Theme, cur.Accent, cur.Density = p.Theme, p.Accent, p.Density
	}))
}

// SetLastStream remembers the stream the user selected in a context, so the
// next launch reopens it instead of falling back to whichever stream the server
// happens to list first.
//
// A dedicated single-field mutator rather than a field on the SavePrefs payload:
// the frontend writes this on every pick, and routing it through the whole-struct
// save would make each pick a chance to clobber the fields it does not own.
// Empty arguments are dropped — there is no key to write under without a context
// name, and an empty stream is the unseeded state, not a selection.
func (a *App) SetLastStream(ctxName, stream string) error {
	if ctxName == "" || stream == "" {
		return nil
	}
	a.updMu.Lock()
	defer a.updMu.Unlock()
	return apperr.Wrap(config.MutatePrefs(func(p *config.Prefs) {
		if p.LastStreams == nil {
			p.LastStreams = map[string]string{}
		}
		p.LastStreams[ctxName] = stream
	}))
}

// SetTabContextPolicy persists which context a brand-new query tab opens on:
// defaultContext is the starred context, mode is "last" or "default".
//
// A dedicated mutator for the same reason as SetLastStream: it is written from
// two small controls (the ☆ button and the "New tabs open with" segment) and
// must not be able to clobber the prefs it does not own. An unrecognised mode
// is ignored rather than written, so a stale frontend cannot poison the file —
// LoadPrefs would silently rewrite it to "last" on the next read anyway.
func (a *App) SetTabContextPolicy(defaultContext, mode string) error {
	if mode != "" && mode != "last" && mode != "default" {
		return apperr.Wrap(fmt.Errorf("unknown new-tab context mode %q", mode))
	}
	a.updMu.Lock()
	defer a.updMu.Unlock()
	return apperr.Wrap(config.MutatePrefs(func(p *config.Prefs) {
		p.DefaultContext = defaultContext
		if mode != "" {
			p.NewTabContext = mode
		}
	}))
}

// SetDockTheme swaps the macOS Dock icon to match the active theme: the Void
// (dark) variant when dark is true, the Signal (light) variant otherwise.
// No-op on non-darwin platforms.
func (a *App) SetDockTheme(dark bool) { branding.SetDock(dark) }

// SetAppearance drives the native macOS app appearance from the theme
// preference ("dark" | "light" | "system"). "system" clears the pinned
// appearance so the WebView's prefers-color-scheme tracks the OS and the
// "System" theme can resolve to light. No-op on non-darwin platforms.
func (a *App) SetAppearance(pref string) { branding.SetAppearance(pref) }

// ecoService returns the ecosystem service, building it on first use.
//
// Every eco-backed bound method must go through here. Wails serves frontend
// calls before startup() returns, and building the service resolves PATH from a
// login shell ("$SHELL -lic 'echo $PATH'") — seconds. Assigning a.eco at the end
// of startup therefore left a window where the frontend's on-mount
// EcosystemStatus call dereferenced a nil *Service and panicked.
//
// Callers racing the warm-up block on the Once rather than seeing nil, and a
// pre-set a.eco (tests) is left alone.
func (a *App) ecoService() *ecosystem.Service {
	a.ecoOnce.Do(func() {
		if a.eco != nil {
			return
		}
		build := a.newEco
		if build == nil {
			// context.Background, not a.ctx: the ctx is only used for the one-time
			// PATH probe at construction, and a.ctx may not be set yet. Per-call
			// contexts are passed to the methods below.
			build = func() *ecosystem.Service { return ecosystem.NewProduction(context.Background()) }
		}
		a.eco = build()
	})
	return a.eco
}

// ecoCtx is the context for eco calls, falling back to Background when a bound
// method beats startup() to setting a.ctx.
func (a *App) ecoCtx() context.Context {
	if a.ctx != nil {
		return a.ctx
	}
	return context.Background()
}

// EcosystemStatus reports the openobserve-cli + companion Skill install state.
func (a *App) EcosystemStatus() (ecosystem.EcoStatus, error) {
	return a.ecoService().Status(a.ecoCtx())
}

// InstallCLI installs openobserve-cli via npm.
func (a *App) InstallCLI() error { return apperr.Wrap(a.ecoService().InstallCLI(a.ecoCtx())) }

// UpgradeCLI upgrades openobserve-cli to the latest npm release.
func (a *App) UpgradeCLI() error { return apperr.Wrap(a.ecoService().UpgradeCLI(a.ecoCtx())) }

// UninstallCLI removes openobserve-cli (npm-managed installs only).
func (a *App) UninstallCLI() error { return apperr.Wrap(a.ecoService().UninstallCLI(a.ecoCtx())) }

// InstallSkill deploys the companion Skill into every detected agent.
func (a *App) InstallSkill() error { return apperr.Wrap(a.ecoService().InstallSkill(a.ecoCtx())) }

// UninstallSkill removes the companion Skill from all agents.
func (a *App) UninstallSkill() error { return apperr.Wrap(a.ecoService().UninstallSkill(a.ecoCtx())) }

// humanBytes formats a byte count as a short human string (e.g. "1.2 MB").
func humanBytes(b float64) string {
	const unit = 1024.0
	if b < unit {
		return fmt.Sprintf("%.0f B", b)
	}
	div, exp := unit, 0
	for n := b / unit; n >= unit && exp < 4; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", b/div, "KMGT"[exp])
}
