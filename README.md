# o3 — OpenObserve Desktop

A fast, native desktop client for [OpenObserve](https://openobserve.ai) built with [Wails](https://wails.io) (Go + React/TypeScript).

## Prerequisites

- Go 1.24+
- Node 20+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation): `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

## Development

    wails dev

## Build

    wails build

## Status

**M1 — static UI.** All 14 UI components are complete and pixel-faithful to the design. No real API calls are made; all data is mock. M2 will wire the shared Go client `github.com/angelmsger/openobserve-cli/pkg/apiclient` via `go.work` to a live OpenObserve instance.

### M2 open item

There is no public `pkg/auth` package yet. M2 will need either a small auth helper or a header-injecting `http.RoundTripper` decorator that attaches credentials before delegating to `apiclient`.
