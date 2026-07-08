# o3 — AI Ecosystem integration (openobserve-cli + Skill management)

**Status:** Design approved, pending spec review
**Date:** 2026-07-08
**Design source of truth:** [Observe.dc.html](https://claude.ai/design/p/8adced37-4c53-470e-ba07-a14910bc3c68?file=Observe.dc.html) (AI Ecosystem tab + nav-rail shortcut)

## Goal

Replace o3's non-functional MCP placeholder with a real **AI Ecosystem** integration: a Settings tab (plus a nav-rail shortcut) that detects, installs, upgrades, and uninstalls the sibling [openobserve-cli](https://github.com/AngelMsger/openobserve-cli) and its companion Skill, so coding agents (Claude Code, Codex) can query this OpenObserve instance directly.

## Context

o3 is a [Wails v2](https://wails.io/) (Go 1.24 + React 18 / TS / Vite) macOS desktop GUI for [OpenObserve](https://openobserve.ai/). Today Settings has an "Agent · MCP" tab that is **pure UI scaffolding** — `SettingsModal.tsx:522-605` renders a mock MCP server panel (hardcoded endpoint `http://127.0.0.1:7878/sse`, fake token, tool list, guardrail cards) driven by a client-only `mcpOn` boolean (`App.tsx:97`). No Go backend exists for it.

The decision: MCP is unnecessary because o3 already pairs with `openobserve-cli`, an agent-native tool that covers the agent scenarios end-to-end. o3 focuses on the GUI and *guides users to install and manage the CLI + Skill* rather than running its own MCP server.

### Ground truth about openobserve-cli (module `github.com/angelmsger/openobserve-cli`)

- **Binary name:** `openobserve-cli`.
- **Recommended install:** `npm install -g @angelmsger/openobserve-cli` (npm package `@angelmsger/openobserve-cli`; postinstall downloads the platform binary from GitHub Releases). Alternatives: `go install github.com/angelmsger/openobserve-cli/cmd/openobserve-cli@latest`, prebuilt binaries, from source.
- **Version:** `openobserve-cli version` prints `openobserve-cli vX.Y.Z (commit <hash>, built <iso8601>)`; `--version` also works.
- **Skill:** ships *embedded in the binary* (`//go:embed all:skills/openobserve`), so it is always version-matched to the CLI. It is managed by the CLI itself:
  - `openobserve-cli skill install` — auto-detects installed agents and deploys to each.
  - `openobserve-cli skill install --agent claude-code|codex` — target one agent.
  - `openobserve-cli skill uninstall` — remove it.
  - `openobserve-cli skill path` — show install location(s) and status.
  - Global install dirs: `~/.claude/skills/openobserve/` (Claude Code), `~/.codex/skills/openobserve/` (Codex). Each dir contains `SKILL.md` with `version:` frontmatter.
- **Shared keychain:** o3 and the CLI already share the OS keychain (service `openobserve-cli`) from the Browser Sign-in work, so an installed CLI reuses o3's captured session for auth. (Configuring the CLI's *context* to point at the host is a separate concern — see Deferred.)

## Locked decisions

1. **CLI management = shell out to npm.** Install = `npm install -g @angelmsger/openobserve-cli`; Upgrade = `npm install -g @angelmsger/openobserve-cli@latest`; Uninstall = `npm uninstall -g @angelmsger/openobserve-cli`. If `npm` is absent, install/upgrade buttons fall back to showing the copy command + docs link instead of running.
2. **Provenance-aware.** o3 checks whether the on-PATH binary is npm-managed (`npm ls -g`). npm-managed -> full Install/Upgrade/Uninstall. Present but external (go/brew/manual) -> show "Installed - managed outside o3", keep version + Skill controls, but Upgrade/Uninstall defer to docs (never run npm on a binary o3 did not install).
3. **Skill management = shell out to the CLI.** o3 runs `openobserve-cli skill install` / `skill uninstall` for actions and `openobserve-cli skill status --format json` for detection; it never touches skill files directly. The CLI owns agent detection, deployment, and the authoritative status payload.
4. **Update detection via npm registry.** The "update available" state queries `https://registry.npmjs.org/@angelmsger/openobserve-cli` for `dist-tags.latest` and semver-compares to the installed version. Any network failure degrades silently to "Installed" (no update prompt).
5. **No oa-cli changes.** This feature consumes the CLI's existing surface only. The sibling repo stays clean (unlike the Browser Sign-in feature).

## Global constraints

- **Platform:** macOS only (consistent with the app). Backend uses no cgo here — it is plain `os/exec`, so no `_darwin`/`_other` split is needed, but the feature is only exercised on macOS.
- **PATH resolution (critical):** a Wails app launched from Finder inherits a minimal PATH, not the user's shell PATH, so `npm` and `openobserve-cli` are invisible without help. All lookups and child processes must use a resolved PATH (see Architecture -> PATH resolution).
- **No `sudo`.** Permission failures (e.g. npm EACCES) surface as errors + the manual command; o3 never escalates privileges.
- **Fixed commands only.** No user-supplied arguments are ever interpolated into a shell command; all exec calls use fixed arg vectors (no `sh -c` with interpolation).
- After any `wails build` / `wails generate` / `go build`, keep intended binding diffs but restore mode-bit churn: `git checkout -- frontend/wailsjs/runtime/ go.mod go.sum`. Never run `go work sync`.
- ASCII half-width punctuation in Chinese content/comments/commits; PascalCase brand/tech terms in prose (Skill, Agent, CLI); open-source mentions hyperlinked. Accent is the CSS var `--accent` (default `#2dd4bf`); new UI reacts to it.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do not push without the user asking.

## Architecture

### Backend — new package `internal/ecosystem` (o3)

All exec calls go through an injected runner interface so unit tests never shell out:

```go
// Runner runs a fixed command with the resolved environment/PATH.
type Runner interface {
    Run(ctx context.Context, name string, args ...string) (stdout, stderr string, err error)
    LookPath(name string) (string, bool)
}
```

The real implementation resolves PATH once (see below) and injects it into each `exec.Cmd`. Tests supply a fake Runner returning canned output.

#### PATH resolution

On first use, resolve the login-shell PATH: run the user's shell as a login+interactive shell to capture their real PATH, e.g. `exec.Command(shell, "-lic", "echo $PATH")` where `shell = $SHELL || /bin/zsh`. Fold in common dirs as a fallback union: `/opt/homebrew/bin`, `/usr/local/bin`, the npm global bin (`npm prefix -g`/bin), `$GOBIN` or `$GOPATH/bin` or `~/go/bin`, `~/.local/bin`. Cache the result for the process lifetime. This resolved PATH is used for `LookPath` and set on every child process's `Env`.

#### Detection — one method, one round trip

`EcosystemStatus() (EcoStatus, error)` gathers everything the panel needs:

```go
type EcoStatus struct {
    NpmAvailable bool      `json:"npmAvailable"` // `npm` found on resolved PATH
    CLI          CLIStatus `json:"cli"`
    Skill        SkillStatus `json:"skill"`
}
type CLIStatus struct {
    Installed       bool   `json:"installed"`
    Version         string `json:"version"`         // "0.5.0" ("" if not installed)
    Path            string `json:"path"`            // resolved binary path
    Managed         string `json:"managed"`         // "npm" | "external" | ""
    LatestVersion   string `json:"latestVersion"`   // npm dist-tags.latest ("" if unknown/offline)
    UpdateAvailable bool   `json:"updateAvailable"` // installed && latest > version
}
type SkillStatus struct {
    Installed bool     `json:"installed"` // any known agent dir has SKILL.md
    Version   string   `json:"version"`   // from an installed SKILL.md frontmatter
    Agents    []string `json:"agents"`    // deployed agent ids: "claude-code","codex"
}
```

Detection steps:
- **CLI presence/version:** `LookPath("openobserve-cli")`; if found, run `openobserve-cli version` and parse `v(\d+\.\d+\.\d+)` from the first line.
- **Provenance:** run `npm ls -g --depth=0 --json @angelmsger/openobserve-cli`; if the package appears in `dependencies`, `Managed = "npm"`, else `"external"`. If the CLI is not installed, `Managed = ""`.
- **Latest version:** HTTP GET the npm registry metadata, read `dist-tags.latest`. On error/timeout/offline, leave `LatestVersion = ""` and `UpdateAvailable = false`. Short timeout (~3s) so detection never hangs the panel.
- **Skill (CLI-authoritative):** run `openobserve-cli skill status --format json` and parse its payload — `{loaded, embedded_version, installs:[{agent,path,status}], next}`. Map: `SkillStatus.Agents` = every `install.agent` whose `status == "installed"`; `SkillStatus.Installed = len(Agents) > 0`; `SkillStatus.Version = embedded_version` (the Skill version this CLI would deploy, always matched to the CLI binary). o3 ignores `loaded` (that is the agent-in-context handshake, irrelevant to a GUI). The child process sets `OPENOBSERVE_CLI_SKILL=1` so the CLI suppresses its stderr discovery nudge. Requires the CLI installed; if absent, `SkillStatus` is empty and the Skill card shows "Install openobserve-cli first". Using the CLI's own `skill status` (rather than reading agent dirs directly) makes the agent list authoritative — o3 never hardcodes it, so new agents the CLI adds appear automatically.

#### Actions — bound methods

Each returns `error` (with trimmed stderr as the message on failure). They run on Wails' bound-method goroutine, so long-running npm work does not freeze the UI. The frontend shows a per-button busy state and re-calls `EcosystemStatus()` on completion.

- `InstallCLI() error` -> `npm install -g @angelmsger/openobserve-cli`
- `UpgradeCLI() error` -> `npm install -g @angelmsger/openobserve-cli@latest`
- `UninstallCLI() error` -> guard: only if `Managed == "npm"`; run `npm uninstall -g @angelmsger/openobserve-cli`
- `InstallSkill() error` -> `openobserve-cli skill install`
- `UninstallSkill() error` -> `openobserve-cli skill uninstall`

Guards: `InstallSkill`/`UninstallSkill` require the CLI installed (else return a typed error the UI already anticipates by disabling the button). `InstallCLI`/`UpgradeCLI` require `NpmAvailable` (else the UI shows the copy-command fallback and never calls them).

### Frontend

- **New `components/AIEcosystem.tsx` (+ `.module.css`)** — the two cards from the design (openobserve-cli + companion Skill), driven entirely by `EcosystemStatus`. Slots into `SettingsModal` where the MCP panel was (`SettingsModal.tsx:522-605` removed).
- **`components/SettingsModal.tsx`** — rename tab `['agent', 'Agent · MCP']` -> `['agent', 'AI Ecosystem']` (`SettingsModal.tsx:57`); replace the MCP panel body with `<AIEcosystem>`; drop `mcpOn`/`onToggleMcp` props.
- **`components/NavRail.tsx`** — add the `>_` terminal shortcut at the bottom of the rail (after the existing `flex:1` spacer, above the Settings gear). New props: `eco: { state: 'ok'|'update'|'off', title: string }` and `onOpenEcosystem: () => void`. Icon paths from the design: `M4 5l6 5-6 5` + `M12 19h8`. A status dot (`<span>`) colored by state; the `title` attribute is the tooltip.
- **`components/AIEcosystem` pure logic -> `lib/ecosystem.ts`** (vitest, no jsdom, matching `lib/signin.ts`/`format.ts` pattern):
  - `compareSemver(a, b): number`
  - `cliPill(status): { label, tone }` (Installed / Not installed / Update available / Installed - external)
  - `dotState(status): 'ok'|'update'|'off'` and `ecoTooltip(status): string`
  - `agentLabel(id): string` (`claude-code` -> "Claude Code", `codex` -> "Codex")
- **`App.tsx`** — remove `mcpOn` (`:97`) and `onToggleMcp` (`:824`). Add `ecoStatus` state fetched via `EcosystemStatus()` (on mount, on settings-open, and after any action). Add handlers wrapping the five action methods (set busy, call, refetch, surface error). Wire `NavRail` `onOpenEcosystem={() => { setSettingsOpen(true); setSettingsTab('agent'); }}` and pass `eco={{ state: dotState(ecoStatus.cli), title: ecoTooltip(ecoStatus.cli) }}`.
- **Wails bindings** regenerated for the six new methods (`EcosystemStatus`, `InstallCLI`, `UpgradeCLI`, `UninstallCLI`, `InstallSkill`, `UninstallSkill`) + the `EcoStatus`/`CLIStatus`/`SkillStatus` models.

### Status model (dot + pills + tooltip)

Nav-rail dot and its tooltip (derived from `CLIStatus`):

| State | Dot color | Condition | Tooltip |
|-------|-----------|-----------|---------|
| `ok` | fixed green (`#34e0a1`, the token already used for "reachable") | installed && !updateAvailable | `openobserve-cli vX.Y.Z - up to date` |
| `update` | amber | installed && updateAvailable | `Update available: vX.Y.Z -> vA.B.C` |
| `off` | muted grey | !installed | `openobserve-cli not installed` |

CLI card pill: `Installed` (green) / `Update available` (amber) / `Installed - external` (neutral, when `managed=external`) / `Not installed` (grey). Skill card pill: `Deployed` (green, with "Deployed to" chips) / `Not installed` (grey) / disabled with "Install openobserve-cli first" when the CLI is missing.

### Error handling

- Any action failure -> the card shows the trimmed stderr and the copy-paste command as manual fallback; status is refetched so the UI reflects reality regardless.
- `npm` missing -> Install/Upgrade render as copy-command + "Open install docs" (never call the backend).
- External binary -> Upgrade/Uninstall are replaced by an "Open docs" affordance; o3 never runs npm against it.
- Registry unreachable -> no update prompt; everything else works offline.
- Detection failures are non-fatal: a missing CLI is a normal state, not an error toast.

### Testing

- **Go unit (injected fake Runner):** version parse (valid/garbage/empty), `compareSemver`, provenance parse from `npm ls --json` (present/absent/malformed), skill-status parse from `skill status --format json` (both agents installed / one / none / malformed), PATH-resolution union, action command construction (correct arg vectors, incl. `--format json` and the `OPENOBSERVE_CLI_SKILL=1` env for skill status), Uninstall guard rejects `external`.
- **Go integration:** stub `npm` and `openobserve-cli` executables on a temp PATH; assert `EcosystemStatus` classifies installed/updatable/external correctly and that action methods invoke the stubs with the expected args.
- **Frontend vitest:** `lib/ecosystem.ts` (semver, pill/dot/tooltip derivation, agent labels).

## Deferred (flagged, not dropped)

- **CLI context configuration.** After install, the agent's CLI still needs a context pointing at this instance (the shared keychain carries the secret, but not the host/org selection). A follow-up could add a "Configure openobserve-cli for this context" action that writes the CLI's config. Out of v1 scope; the design does not show it.
- **Streaming install progress.** v1 shows a busy spinner and the final result; live npm output streaming is a later nicety.

## End-to-end verification

1. `go test ./internal/ecosystem/...` and `go test ./...` green; `cd frontend && npx vitest run` green.
2. `wails dev` on macOS: with the CLI absent, the AI Ecosystem tab shows "Not installed", nav-rail dot grey; Install runs npm, tab flips to Installed, dot green. With an older CLI present, dot goes amber and Upgrade works. Uninstall (npm-managed) removes it. The Skill card deploys via `skill install`, shows the deployed-agent chips, and uninstalls.
3. Provenance: a `go install`-ed CLI shows "Installed - external" with Upgrade/Uninstall deferring to docs; o3 never shells npm against it.
4. PATH: launched from Finder (not a terminal), detection still finds npm + the CLI.
5. `git status` shows only intended files; mode-bit churn restored; `go work sync` never run; oa-cli untouched.
