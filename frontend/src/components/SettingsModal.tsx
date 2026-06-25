import { useState } from 'react';
import type { ReactElement } from 'react';
import type { SettingsTab, Density } from '../types';
import { hexA } from '../lib/format';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  open: boolean;
  tab: SettingsTab;
  accent: string;
  density: Density;
  mcpOn: boolean;
  showHistogram: boolean;
  conn: { url: string; org: string; email?: string; password?: string; token?: string };
  onClose: () => void;
  onTab: (t: SettingsTab) => void;
  onPickAccent: (c: string) => void;
  onPickDensity: (d: Density) => void;
  onToggleHisto: () => void;
  onToggleMcp: () => void;
  onConnField: (key: string, value: string) => void;
  onOpenSetup?: () => void;
}

// Left tab list — design line 1210
const SET_TABS: [SettingsTab, string][] = [
  ['connection', 'Connection'],
  ['appearance', 'Appearance'],
  ['agent', 'Agent · MCP'],
  ['about', 'About'],
];

// Accent swatches — design line 1221
const ACCENT_SWATCHES = ['#2dd4bf', '#7c83ff', '#f5a86a', '#5b9dff', '#f4685f'];

// Density options — design line 1226
const DENSITY_OPTS: [Density, string][] = [
  ['ultra', 'Ultra-dense'],
  ['comfortable', 'Comfortable'],
];

// Agent leash options — design line 1235
const AGENT_TABS: [string, string][] = [
  ['observe', 'Observe'],
  ['propose', 'Propose'],
  ['autorun', 'Autorun'],
];

const AGENT_DESC: Record<string, string> = {
  observe: 'Agent can read your session, schema and results — but runs nothing. Pure analysis and suggestions.',
  propose: 'Agent stages rewritten queries into the editor; you review the diff and hit Run.',
  autorun: 'Agent runs queries itself within the guardrails below. Watch the activity stream and stop anytime.',
};

export function SettingsModal({
  open,
  tab,
  accent,
  density,
  mcpOn,
  showHistogram,
  conn,
  onClose,
  onTab,
  onPickAccent,
  onPickDensity,
  onToggleHisto,
  onToggleMcp,
  onConnField,
  onOpenSetup,
}: SettingsModalProps): ReactElement | null {
  // Agent leash mode local state — design line 1235
  const [agentMode, setAgentMode] = useState<string>('observe');

  // Auth tab: M1-static — mode is fixed at 'password' and not user-switchable in this milestone.
  // The tabs render as visual affordances only (no onClick handler). authMode will be lifted to
  // App.tsx state in a future milestone when the Settings connection tab becomes fully interactive.
  // Declared as useState so TypeScript does not narrow away the token/sso branches.
  const [authMode] = useState<'password' | 'token' | 'sso'>('password');

  if (!open) return null;

  return (
    /* Overlay backdrop — design line 381 */
    <div className={styles.overlay} onClick={onClose}>
      {/* Inner panel — design line 382 */}
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>

        {/* Header — design line 383 */}
        <div className={styles.header}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent,#2dd4bf)" strokeWidth="1.7">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span className={styles.headerTitle}>Settings</span>
          <span className={styles.headerSpacer} />
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body flex row — design line 389 */}
        <div className={styles.body}>

          {/* Left tab list — design lines 390–393 */}
          <div className={styles.tabList}>
            {SET_TABS.map(([id, label]) => (
              <button
                key={id}
                className={`${styles.tab}${tab === id ? ` ${styles.tabActive}` : ''}`}
                style={tab === id ? { background: hexA(accent, 0.14), color: accent } : undefined}
                onClick={() => onTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Scrollable right content — design line 395 */}
          <div className={`oo-scroll ${styles.scrollBody}`}>
            <div className={styles.content}>

              {/* ===== CONNECTION ===== design lines 399–459 */}
              {tab === 'connection' && (
                <div>
                  <div className={styles.panelTitle}>Connection</div>
                  <div className={styles.panelSub}>
                    Where this desktop client sends its queries. Self-hosted OpenObserve authenticates with an endpoint + service account — there is no hosted OAuth in the OSS edition.
                  </div>

                  {/* Status card — design line 404 */}
                  <div className={styles.statusCard}>
                    <span className={styles.statusDot} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.statusUrl}>{conn.url}</div>
                      <div className={styles.statusMeta}>
                        org <b style={{ color: '#99a2b2' }}>{conn.org}</b> · OpenObserve v0.14.1 · 6 streams
                      </div>
                    </div>
                    <button className={styles.testBtn}>Test connection</button>
                  </div>

                  {/* Form card — design line 413 */}
                  <div className={styles.formCard}>
                    <div className={styles.fieldWrap}>
                      <div className={styles.fieldLabel}>Server URL</div>
                      <input
                        className={styles.fieldInput}
                        value={conn.url}
                        onChange={(e) => onConnField('url', e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                    <div className={styles.fieldWrap}>
                      <div className={styles.fieldLabel}>Organization</div>
                      <input
                        className={styles.fieldInput}
                        value={conn.org}
                        onChange={(e) => onConnField('org', e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div className={styles.fieldLabel}>Authentication</div>
                      <div className={styles.authSeg}>
                        {(['password', 'token', 'sso'] as const).map((id, i) => {
                          const labels = ['Email & Password', 'API Token', 'SSO'];
                          return (
                            <button
                              key={id}
                              className={`${styles.authTab}${authMode === id ? ` ${styles.authTabActive}` : ''}`}
                              style={authMode === id ? { background: hexA(accent, 0.18), color: accent } : undefined}
                            >
                              {labels[i]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {authMode === 'password' && (
                      <div className={styles.row2}>
                        <div>
                          <div className={styles.fieldLabel}>Email</div>
                          <input
                            className={styles.fieldInput}
                            value={conn.email ?? ''}
                            onChange={(e) => onConnField('email', e.target.value)}
                            spellCheck={false}
                          />
                        </div>
                        <div>
                          <div className={styles.fieldLabel}>Password</div>
                          <input
                            type="password"
                            className={styles.fieldInput}
                            value=""
                            onChange={() => {}}
                          />
                        </div>
                      </div>
                    )}

                    {authMode === 'token' && (
                      <div>
                        <div className={styles.fieldLabel}>Service-account token</div>
                        <input
                          className={styles.fieldInput}
                          value=""
                          onChange={() => {}}
                          placeholder="Paste a token from OpenObserve → IAM → Service Accounts"
                        />
                      </div>
                    )}

                    {authMode === 'sso' && (
                      <div className={styles.ssoWarn}>
                        <span className={styles.ssoWarnIcon}>⚠</span>
                        <div className={styles.ssoWarnText}>
                          OAuth / SSO requires <b style={{ color: '#f5d9a0' }}>OpenObserve Enterprise</b>. The self-hosted OSS edition uses email + password or a service-account token — pick one of those above. SSO can be added later behind a capability flag.
                        </div>
                      </div>
                    )}

                    {/* Self-signed toggle — design line 443 */}
                    <div className={styles.toggleRow}>
                      <button className={styles.toggle}>
                        <span className={styles.knob} />
                      </button>
                      <div>
                        <div className={styles.toggleLabel}>Trust self-signed certificate</div>
                        <div className={styles.toggleSub}>Common for internal HTTPS endpoints behind a private CA.</div>
                      </div>
                    </div>
                  </div>

                  {/* Credentials note — design line 449 */}
                  <div className={styles.credNote}>
                    <span className={styles.credNoteIcon}>🔒</span>
                    <span>Credentials are stored in your OS keychain through Wails — never written to disk in plaintext.</span>
                  </div>

                  {/* Action buttons — design line 454 */}
                  <div className={styles.actions}>
                    <button className={styles.btnPrimary}>Test &amp; save</button>
                    <button className={styles.btnSecondary} onClick={onOpenSetup}>Re-run setup wizard…</button>
                  </div>
                </div>
              )}

              {/* ===== APPEARANCE ===== design lines 463–488 */}
              {tab === 'appearance' && (
                <div>
                  <div className={styles.panelTitle}>Appearance</div>
                  <div className={styles.panelSub} style={{ lineHeight: undefined }}>
                    Tune the look and density of the workspace.
                  </div>

                  {/* Accent swatches — design line 467 */}
                  <div className={styles.formCard}>
                    <div style={{ fontSize: 12.5, color: '#dde3ee', fontWeight: 600, marginBottom: 12 }}>Accent</div>
                    <div className={styles.swatchGrid}>
                      {ACCENT_SWATCHES.map((c) => (
                        <button
                          key={c}
                          className={`${styles.swatch}${accent === c ? ` ${styles.swatchActive}` : ''}`}
                          style={{
                            background: c,
                            // inline so the swatch color is data-driven
                            ...(accent === c ? { boxShadow: `0 0 0 2px #0a0c11, 0 0 0 4px ${c}` } : {}),
                          }}
                          onClick={() => onPickAccent(c)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Row density — design line 474 */}
                  <div className={styles.formCard}>
                    <div style={{ fontSize: 12.5, color: '#dde3ee', fontWeight: 600, marginBottom: 4 }}>Row density</div>
                    <div style={{ fontSize: 11.5, color: '#6b7282', marginBottom: 12 }}>Ultra-dense fits the most rows on screen for power users.</div>
                    <div className={styles.densitySeg}>
                      {DENSITY_OPTS.map(([id, label]) => (
                        <button
                          key={id}
                          className={`${styles.densityTab}${density === id ? ` ${styles.densityTabActive}` : ''}`}
                          style={density === id ? { background: hexA(accent, 0.16), color: accent } : undefined}
                          onClick={() => onPickDensity(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Show histogram — design line 482 */}
                  <div className={styles.histoCard}>
                    <div style={{ flex: 1 }}>
                      <div className={styles.histoCardLabel}>Show histogram by default</div>
                      <div className={styles.histoCardSub}>The event-volume chart above the results.</div>
                    </div>
                    <button
                      className={`${styles.toggle}${showHistogram ? ` ${styles.toggleOn}` : ''}`}
                      style={showHistogram ? { background: accent } : undefined}
                      onClick={onToggleHisto}
                    >
                      <span className={`${styles.knob}${showHistogram ? ` ${styles.knobOn}` : ''}`} />
                    </button>
                  </div>

                  <div className={styles.themeNote}>Theme · <b style={{ color: '#99a2b2' }}>Dark</b> — a light theme is on the roadmap.</div>
                </div>
              )}

              {/* ===== AGENT · MCP ===== design lines 492–533 */}
              {tab === 'agent' && (
                <div>
                  <div className={styles.panelTitle}>Agent · MCP</div>
                  <div className={styles.panelSub}>
                    Let a local coding agent (Claude Code, Codex…) drive this same session through a Model Context Protocol server. The app stays the tool — your agent brings the reasoning.
                  </div>

                  {/* Expose server toggle — design line 496 */}
                  <div className={styles.mcpCard}>
                    <div style={{ flex: 1 }}>
                      <div className={styles.mcpCardTitle}>Expose local MCP server</div>
                      <div className={styles.mcpCardSub}>Loopback only · token-protected · shares your live query session.</div>
                    </div>
                    <button
                      className={`${styles.toggle}${mcpOn ? ` ${styles.toggleOn}` : ''}`}
                      style={mcpOn ? { background: accent } : undefined}
                      onClick={onToggleMcp}
                    >
                      <span className={`${styles.knob}${mcpOn ? ` ${styles.knobOn}` : ''}`} />
                    </button>
                  </div>

                  {/* Body gated on mcpOn — design line 501 */}
                  {mcpOn && (
                    <div>
                      {/* Endpoint + token card — design line 503 */}
                      <div className={styles.formCard}>
                        <div className={styles.endpointLabel}>Endpoint</div>
                        <div className={styles.endpointRow}>
                          <code className={`${styles.codeChip} ${styles.endpointUrl}`}>http://127.0.0.1:7878/sse</code>
                          <button className={styles.iconBtn}>⧉ copy</button>
                        </div>
                        <div className={styles.endpointLabel}>Access token</div>
                        <div className={styles.endpointRow} style={{ marginBottom: 0 }}>
                          <code className={`${styles.codeChip} ${styles.tokenMask}`}>oo_mcp_••••••••••••••3f9d</code>
                          <button className={styles.iconBtn}>↻ rotate</button>
                        </div>
                      </div>

                      {/* Claude mcp add snippet — design line 510 */}
                      <div className={styles.snippetCard}>
                        <div className={styles.snippetTitle}>Connect your agent</div>
                        <pre className={styles.snippetPre}>
                          <span style={{ color: '#7dd3fc' }}>claude</span>{' mcp add openobserve \\\n  --transport sse http://127.0.0.1:7878/sse \\\n  --header '}
                          <span style={{ color: '#a3e08c' }}>"Authorization: Bearer $OO_MCP_TOKEN"</span>
                        </pre>
                        <div className={styles.snippetNote}>
                          Exposes tools: <b style={{ color: '#99a2b2' }}>run_sql · get_schema · get_field_stats · summarize_results</b> + the live session as a resource.
                        </div>
                      </div>

                      {/* Default leash — design line 518 */}
                      <div className={styles.leashCard}>
                        <div className={styles.leashTitle}>Default leash</div>
                        <div className={styles.leashDesc}>{AGENT_DESC[agentMode]}</div>
                        <div className={styles.agentSeg}>
                          {AGENT_TABS.map(([id, label]) => (
                            <button
                              key={id}
                              className={`${styles.agentTab}${agentMode === id ? ` ${styles.agentTabActive}` : ''}`}
                              style={agentMode === id ? { background: hexA(accent, 0.16), color: accent } : undefined}
                              onClick={() => setAgentMode(id)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Max scan / rows cards — design line 526 */}
                      <div className={styles.statsRow}>
                        <div className={styles.statCard}>
                          <div className={styles.statLabel}>Max scan / query</div>
                          <div className={styles.statValue}>5.0 GB</div>
                        </div>
                        <div className={styles.statCard}>
                          <div className={styles.statLabel}>Max rows returned</div>
                          <div className={styles.statValue}>10,000</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===== ABOUT ===== design lines 537–551 */}
              {tab === 'about' && (
                <div>
                  <div className={styles.panelTitle}>About</div>
                  <div className={styles.panelSub} style={{ lineHeight: undefined }}>
                    o3 — a native desktop client for OpenObserve.
                  </div>

                  {/* Brand card — design line 540 */}
                  <div className={styles.brandCard}>
                    <span
                      className={styles.brandIcon}
                      style={{ background: accent, boxShadow: `0 0 22px -4px ${accent}` }}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#06181a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12h4l3 8 4-16 3 8h6"/>
                      </svg>
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className={styles.brandName}>
                        o3 <span style={{ fontSize: 11, color: '#6b7282', fontWeight: 400 }}>· OpenObserve desktop client</span>
                      </div>
                      <div className={styles.brandTagline} style={{ color: accent }}>SELECT signal FROM noise</div>
                      <div className={styles.brandVersion}>v0.1.0 · Wails v2 · macOS arm64</div>
                    </div>
                    <button className={styles.updateBtn}>Check for updates</button>
                  </div>

                  {/* Doc links — design line 545 */}
                  <div className={styles.aboutLinks}>
                    <button className={styles.aboutLink} style={{ color: accent }}>Documentation</button>
                    <button className={styles.aboutLink} style={{ color: accent }}>Release notes</button>
                    <button className={styles.aboutLink} style={{ color: accent }}>Report an issue</button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
