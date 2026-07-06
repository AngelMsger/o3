package main

import (
	"context"
	"fmt"
	"strings"
	"sync"

	api "github.com/angelmsger/openobserve-cli/pkg/apiclient"
	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
	cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"

	"github.com/angelmsger/o3/internal/apperr"
	"github.com/angelmsger/o3/internal/branding"
	"github.com/angelmsger/o3/internal/config"
	"github.com/angelmsger/o3/internal/metrics"
	"github.com/angelmsger/o3/internal/query"
)

// App is the Wails-bound application. It owns a lazily-built client for the
// current context in the shared config.
type App struct {
	ctx context.Context

	mu     sync.Mutex
	client api.Client // nil until built for the current context
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// startup records the Wails context and best-effort builds the client for the
// current context.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	_ = a.rebuildClient() // best-effort; data methods re-report if it fails
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

// rebuildClient rebuilds a.client from the current context plus its keychain
// secret. Returns a not-configured error when there is no current context or
// no stored secret.
func (a *App) rebuildClient() error {
	dir, err := configDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	f, ok, err := cfgshared.ReadFile(dir)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !ok || len(f.Contexts) == 0 {
		return apperr.NotConfigured("no contexts configured")
	}
	cur, ok := f.Context(f.CurrentContext)
	if !ok {
		cur = f.Contexts[0]
	}
	scheme := schemeOrBasic(cur.Auth.Scheme)
	secret, has, err := config.LoadSecret(cur.BaseURL, scheme)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !has {
		return apperr.NotConfigured("no stored credential for the current context")
	}
	client, err := buildClient(cur.BaseURL, cur.Org, scheme, cur.Auth.Username, secret, f.Defaults)
	if err != nil {
		return apperr.Wrap(err)
	}
	a.mu.Lock()
	a.client = client
	a.mu.Unlock()
	return nil
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

// SwitchContext sets the current context and rebuilds the client.
func (a *App) SwitchContext(name string) error {
	dir, err := configDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	f, ok, err := cfgshared.ReadFile(dir)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !ok {
		return apperr.NotConfigured("no contexts configured")
	}
	if _, found := f.Context(name); !found {
		return apperr.Wrap(fmt.Errorf("unknown context %q", name))
	}
	f.CurrentContext = name
	if err := cfgshared.WriteFile(dir, f); err != nil {
		return apperr.Wrap(err)
	}
	a.mu.Lock()
	a.client = nil
	a.mu.Unlock()
	return apperr.Wrap(a.rebuildClient())
}

// SaveContext upserts a context into the shared config (and its secret into the
// keychain when provided), then rebuilds the client if the saved context is
// current.
func (a *App) SaveContext(c ConnConfig) error {
	if c.Name == "" || c.URL == "" {
		return apperr.Wrap(fmt.Errorf("context name and URL are required"))
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
		BaseURL: c.URL,
		Org:     orgOrDefault(c.Org),
		Auth:    cfgshared.AuthConfig{Scheme: scheme, Username: c.Username},
	})
	if f.CurrentContext == "" {
		f.CurrentContext = c.Name // first context becomes current
	}
	if err := cfgshared.WriteFile(dir, f); err != nil {
		return apperr.Wrap(err)
	}
	if c.Secret != "" {
		if err := config.SaveSecret(c.URL, scheme, c.Secret); err != nil {
			return apperr.Wrap(err)
		}
	}
	if c.Name == f.CurrentContext {
		a.mu.Lock()
		a.client = nil
		a.mu.Unlock()
		return apperr.Wrap(a.rebuildClient())
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
	_ = config.DeleteSecret(ctx.BaseURL, schemeOrBasic(ctx.Auth.Scheme))
	a.mu.Lock()
	a.client = nil
	a.mu.Unlock()
	return apperr.Wrap(a.rebuildClient())
}

// TestConnection verifies a connection without persisting it. When Secret is
// empty it falls back to the stored keychain secret, so Test works on an
// existing context the user did not re-type. It uses the file Defaults so the
// timeout and retry settings match the live client (I2).
func (a *App) TestConnection(c ConnConfig) (ConnInfo, error) {
	scheme := schemeOrBasic(c.Scheme)
	secret := c.Secret
	if secret == "" {
		if stored, has, _ := config.LoadSecret(c.URL, scheme); has {
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
	client, err := buildClient(c.URL, c.Org, scheme, c.Username, secret, fileDef)
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

// SavePrefs persists the UI preferences.
func (a *App) SavePrefs(p config.Prefs) error { return config.SavePrefs(p) }

// SetDockTheme swaps the macOS Dock icon to match the active theme: the Void
// (dark) variant when dark is true, the Signal (light) variant otherwise.
// No-op on non-darwin platforms.
func (a *App) SetDockTheme(dark bool) { branding.SetDock(dark) }

// SetAppearance drives the native macOS app appearance from the theme
// preference ("dark" | "light" | "system"). "system" clears the pinned
// appearance so the WebView's prefers-color-scheme tracks the OS and the
// "System" theme can resolve to light. No-op on non-darwin platforms.
func (a *App) SetAppearance(pref string) { branding.SetAppearance(pref) }

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
