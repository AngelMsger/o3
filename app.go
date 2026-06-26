package main

import (
	"context"
	"fmt"
	"sync"

	api "github.com/angelmsger/openobserve-cli/pkg/apiclient"
	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"

	"github.com/angelmsger/openobserve-desktop/internal/apperr"
	"github.com/angelmsger/openobserve-desktop/internal/config"
	"github.com/angelmsger/openobserve-desktop/internal/query"
)

// App is the Wails-bound application. It owns the loaded connection config and
// a lazily-built, shared API client.
type App struct {
	ctx context.Context

	mu     sync.Mutex
	cfg    config.Config
	client api.Client // nil until a credential is configured
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// startup loads any saved connection and builds the client if a secret exists.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	dir, err := config.DataDir()
	if err != nil {
		return
	}
	cfg, err := config.Load(dir)
	if err != nil || cfg.URL == "" {
		return
	}
	a.mu.Lock()
	a.cfg = cfg
	a.mu.Unlock()
	_ = a.rebuildClient() // best-effort; data methods re-report if it fails
}

// ConnConfig is the connection settings exchanged with the frontend. Secret is
// inbound only (Save/Test); it is never returned by LoadConnection.
type ConnConfig struct {
	URL       string `json:"url"`
	Org       string `json:"org"`
	Scheme    string `json:"scheme"`
	Username  string `json:"username"`
	Secret    string `json:"secret"`
	HasSecret bool   `json:"hasSecret"` // outbound only: whether a secret exists in the keychain
}

// ConnInfo summarizes a verified connection.
type ConnInfo struct {
	OrgCount    int `json:"orgCount"`
	StreamCount int `json:"streamCount"`
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

// credentialOf builds a pkgauth.Credential from a ConnConfig, defaulting the
// scheme to basic.
func credentialOf(c ConnConfig) pkgauth.Credential {
	scheme := c.Scheme
	if scheme == "" {
		scheme = pkgauth.SchemeBasic
	}
	return pkgauth.Credential{Scheme: scheme, Username: c.Username, Secret: c.Secret}
}

// buildClient assembles an authenticated client for c (with secret present).
func buildClient(c ConnConfig) (api.Client, error) {
	cred := credentialOf(c)
	if err := cred.Validate(); err != nil {
		return nil, err
	}
	return api.Build(api.BuildParams{
		BaseURL:       c.URL,
		Org:           orgOrDefault(c.Org),
		AuthDecorator: cred.Decorator(),
	})
}

func orgOrDefault(org string) string {
	if org == "" {
		return "default"
	}
	return org
}

// rebuildClient rebuilds a.client from a.cfg plus the stored secret. It returns
// a not-configured error when no secret is available.
func (a *App) rebuildClient() error {
	a.mu.Lock()
	cfg := a.cfg
	a.mu.Unlock()

	scheme := cfg.Scheme
	if scheme == "" {
		scheme = pkgauth.SchemeBasic
	}
	secret, ok, err := config.LoadSecret(cfg.URL, scheme)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !ok {
		return apperr.NotConfigured("no stored credential")
	}
	client, err := buildClient(ConnConfig{
		URL: cfg.URL, Org: cfg.Org, Scheme: scheme, Username: cfg.Username, Secret: secret,
	})
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

// TestConnection verifies credentials against the server without persisting
// them. It pings (lists orgs) and counts streams in the target org.
func (a *App) TestConnection(c ConnConfig) (ConnInfo, error) {
	client, err := buildClient(c)
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

// SaveConnection persists the config (JSON) and secret (keychain), then
// rebuilds the client.
func (a *App) SaveConnection(c ConnConfig) error {
	cred := credentialOf(c)
	if err := cred.Validate(); err != nil {
		return apperr.Wrap(err)
	}
	dir, err := config.DataDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	cfg := config.Config{URL: c.URL, Org: orgOrDefault(c.Org), Scheme: cred.Scheme, Username: c.Username}
	if err := config.Save(dir, cfg); err != nil {
		return apperr.Wrap(err)
	}
	if err := config.SaveSecret(c.URL, cred.Scheme, c.Secret); err != nil {
		return apperr.Wrap(err)
	}
	a.mu.Lock()
	a.cfg = cfg
	a.client = nil
	a.mu.Unlock()
	return apperr.Wrap(a.rebuildClient())
}

// LoadConnection returns the saved config without the secret. A zero URL means
// the app is unconfigured (the UI opens the setup wizard). HasSecret is set so
// the UI can detect a saved-config-but-missing-secret state and open the wizard.
func (a *App) LoadConnection() (ConnConfig, error) {
	dir, err := config.DataDir()
	if err != nil {
		return ConnConfig{}, apperr.Wrap(err)
	}
	cfg, err := config.Load(dir)
	if err != nil {
		return ConnConfig{}, apperr.Wrap(err)
	}
	scheme := cfg.Scheme
	if scheme == "" {
		scheme = pkgauth.SchemeBasic
	}
	_, hasSecret, _ := config.LoadSecret(cfg.URL, scheme)
	return ConnConfig{URL: cfg.URL, Org: cfg.Org, Scheme: cfg.Scheme, Username: cfg.Username, HasSecret: hasSecret}, nil
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
