import { useState } from 'react';
import type { ReactElement } from 'react';
import type { SettingsTab, Density, ThemePref } from '../types';
import { hexA } from '../lib/format';
import styles from './SettingsModal.module.css';

// Props for the kubectl-style contexts manager (Task 4)
interface SettingsContextsProps {
  contexts: { name: string; color: string; isCurrent: boolean }[];
  active: { name: string; url: string; org: string; scheme: string; username: string; password: string; token: string } | null;
  canRemove: boolean;
  onAddContext: () => void;
  onUse: (name: string) => void;
  onRemove: (name: string) => void;
  onField: (key: string, value: string) => void;
  onTest: () => void;
  onSave: () => void;
}

interface SettingsModalProps extends SettingsContextsProps {
  visible: boolean;
  tab: SettingsTab;
  accent: string;
  density: Density;
  themePref: ThemePref;
  mcpOn: boolean;
  showHistogram: boolean;
  conn: { url: string; org: string; email?: string; password?: string; token?: string };
  onClose: () => void;
  onTab: (t: SettingsTab) => void;
  onPickAccent: (c: string) => void;
  onPickDensity: (d: Density) => void;
  onPickTheme: (t: ThemePref) => void;
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

// Theme segment icons — design lines 1665-1669
const THEME_ICONS: Record<ThemePref, string> = {
  light: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  dark: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  system: 'M3 5h18v10H3zM8 19h8M12 15v4',
};

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
  visible,
  tab,
  accent,
  density,
  themePref,
  mcpOn,
  showHistogram,
  conn,
  onClose,
  onTab,
  onPickAccent,
  onPickDensity,
  onPickTheme,
  onToggleHisto,
  onToggleMcp,
  onConnField,
  onOpenSetup,
  contexts,
  active,
  canRemove,
  onAddContext,
  onUse,
  onRemove,
  onField,
  onTest,
  onSave,
}: SettingsModalProps): ReactElement {
  // Agent leash mode local state — design line 1235
  const [agentMode, setAgentMode] = useState<string>('observe');

  // Auth mode for the edit-active-context form — derived from the active context scheme.
  // 'basic' (backend) maps to 'password' (UI tab); 'token' maps to 'token'; else password.
  const _scheme = active?.scheme ?? 'basic';
  const authMode: 'password' | 'token' | 'sso' =
    _scheme === 'token' ? 'token' : _scheme === 'sso' ? 'sso' : 'password';

  return (
    /* Overlay backdrop — design line 381 */
    <div className={`${styles.overlay} ${visible ? styles.shown : styles.hidden}`} onClick={onClose}>
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

              {/* ===== CONNECTION ===== design lines 438-523 */}
              {tab === 'connection' && (
                <div>
                  <div className={styles.panelTitle}>Connection</div>
                  <div className={styles.panelSub}>
                    Where this desktop client sends its queries. Self-hosted OpenObserve authenticates with an endpoint + service account — there is no hosted OAuth in the OSS edition.
                  </div>

                  {/* Contexts manager header — design line 439 */}
                  <div className={styles.ctxHeader}>
                    <div className={styles.ctxHeaderLeft}>
                      <span className={styles.ctxHeaderTitle}>Contexts</span>
                      <span className={styles.ctxHeaderSub}>switch the active instance any time</span>
                    </div>
                    <button className={styles.ctxAddBtn} onClick={onAddContext}>+ Add context</button>
                  </div>

                  {/* Context rows — design lines 443-463 */}
                  <div className={styles.ctxList}>
                    {contexts.map((c) => (
                      <div
                        key={c.name}
                        className={styles.ctxRow}
                        style={{
                          border: `1px solid ${c.isCurrent ? hexA(c.color, 0.45) : 'rgba(255,255,255,.07)'}`,
                          background: c.isCurrent ? hexA(c.color, 0.08) : 'var(--sf-05)',
                        }}
                        onClick={() => !c.isCurrent && onUse(c.name)}
                      >
                        {/* color dot — design line 1360 */}
                        <span
                          style={{
                            width: 9, height: 9, borderRadius: '50%', flex: 'none',
                            background: c.color, boxShadow: `0 0 8px -1px ${c.color}`,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={styles.ctxRowName}>{c.name}</span>
                            {c.isCurrent && (
                              <span className={styles.ctxActiveBadge} style={{ color: accent, background: hexA(accent, 0.12) }}>active</span>
                            )}
                          </div>
                        </div>
                        {/* "Use" button — only on non-active rows — design line 455-457 */}
                        {!c.isCurrent && (
                          <button
                            className={styles.ctxUseBtn}
                            onClick={(e) => { e.stopPropagation(); onUse(c.name); }}
                          >
                            Use
                          </button>
                        )}
                        {/* Delete "X" — only when canRemove — design line 458-460 */}
                        {canRemove && (
                          <button
                            className={styles.ctxRemoveBtn}
                            title="Delete context"
                            onClick={(e) => { e.stopPropagation(); onRemove(c.name); }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Edit active context label — design line 464 */}
                  <div className={styles.editCtxLabel}>Edit active context</div>

                  {active && (
                    <>
                      {/* Status card for active context — design lines 466-473 */}
                      <div className={styles.statusCard}>
                        <span className={styles.statusDot} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className={styles.statusUrl}>{active.url || 'no endpoint set'}</div>
                          <div className={styles.statusMeta}>
                            org <b style={{ color: 'var(--tx-06)' }}>{active.org}</b>
                          </div>
                        </div>
                        <button className={styles.testBtn} onClick={onTest}>Test connection</button>
                      </div>

                      {/* Edit form card — design lines 475-513 */}
                      <div className={styles.formCard}>
                        {/* Context name — design line 477-479 */}
                        <div className={styles.fieldWrap}>
                          <div className={styles.fieldLabel}>Context name</div>
                          <input
                            className={styles.fieldInput}
                            value={active.name}
                            onChange={(e) => onField('name', e.target.value)}
                            spellCheck={false}
                          />
                        </div>
                        {/* Server URL — design line 481-483 */}
                        <div className={styles.fieldWrap}>
                          <div className={styles.fieldLabel}>Server URL</div>
                          <input
                            className={styles.fieldInput}
                            value={active.url}
                            onChange={(e) => onField('url', e.target.value)}
                            spellCheck={false}
                          />
                        </div>
                        {/* Organization — design line 485-487 */}
                        <div className={styles.fieldWrap}>
                          <div className={styles.fieldLabel}>Organization</div>
                          <input
                            className={styles.fieldInput}
                            value={active.org}
                            onChange={(e) => onField('org', e.target.value)}
                            spellCheck={false}
                          />
                        </div>
                        {/* Authentication segmented — design lines 488-492 */}
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
                                  onClick={() => onField('scheme', id === 'password' ? 'basic' : id)}
                                >
                                  {labels[i]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Email + password fields — design lines 494-498 */}
                        {authMode === 'password' && (
                          <div className={styles.row2}>
                            <div>
                              <div className={styles.fieldLabel}>Email</div>
                              <input
                                className={styles.fieldInput}
                                value={active.username}
                                onChange={(e) => onField('username', e.target.value)}
                                spellCheck={false}
                              />
                            </div>
                            <div>
                              <div className={styles.fieldLabel}>Password</div>
                              <input
                                type="password"
                                className={styles.fieldInput}
                                value={active.password}
                                onChange={(e) => onField('password', e.target.value)}
                              />
                            </div>
                          </div>
                        )}

                        {/* Token field — design lines 500-502 */}
                        {authMode === 'token' && (
                          <div>
                            <div className={styles.fieldLabel}>Service-account token</div>
                            <input
                              className={styles.fieldInput}
                              value={active.token}
                              onChange={(e) => onField('token', e.target.value)}
                              placeholder="Paste a token from OpenObserve -> IAM -> Service Accounts"
                            />
                          </div>
                        )}

                        {/* SSO warning — design lines 503-508 */}
                        {authMode === 'sso' && (
                          <div className={styles.ssoWarn}>
                            <span className={styles.ssoWarnIcon}>⚠</span>
                            <div className={styles.ssoWarnText}>
                              OAuth / SSO requires <b style={{ color: '#f5d9a0' }}>OpenObserve Enterprise</b>. The self-hosted OSS edition uses email + password or a service-account token — pick one of those above. SSO can be added later behind a capability flag.
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Credentials note — design line 515-518 */}
                      <div className={styles.credNote}>
                        <span className={styles.credNoteIcon}>🔒</span>
                        <span>Credentials are stored in your OS keychain through Wails — never written to disk in plaintext.</span>
                      </div>

                      {/* Action buttons — design lines 520-523 */}
                      <div className={styles.actions}>
                        <button className={styles.btnPrimary} onClick={onSave}>Save</button>
                        <button className={styles.btnSecondary} onClick={onOpenSetup}>Re-run setup wizard…</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ===== APPEARANCE ===== design lines 463–488 */}
              {tab === 'appearance' && (
                <div>
                  <div className={styles.panelTitle}>Appearance</div>
                  <div className={styles.panelSub} style={{ lineHeight: undefined }}>
                    Tune the look and density of the workspace.
                  </div>

                  {/* Theme card — design lines 621-635 */}
                  <div style={{ background: 'var(--sf-05)', border: '1px solid rgba(var(--ink),.06)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--tx-01)', fontWeight: 600, marginBottom: 4 }}>Theme</div>
                    <div style={{ fontSize: 11.5, color: 'var(--tx-09)', marginBottom: 14 }}>Choose a look, or let it follow your macOS appearance automatically.</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {(['light', 'dark', 'system'] as ThemePref[]).map((k) => {
                        const active = themePref === k;
                        const label = k === 'system' ? 'System' : k[0].toUpperCase() + k.slice(1);
                        const title = k === 'system' ? 'Sync with system' : label + ' theme';
                        return (
                          <button
                            key={k}
                            type="button"
                            title={title}
                            onClick={() => onPickTheme(k)}
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              padding: '14px 6px',
                              border: active ? `1px solid ${hexA(accent, 0.5)}` : '1px solid rgba(var(--ink),.08)',
                              borderRadius: 10,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              fontSize: 12,
                              fontWeight: 600,
                              background: active ? hexA(accent, 0.1) : 'var(--sf-02)',
                              color: active ? accent : 'var(--tx-06)',
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                              {k === 'light' && <circle cx="12" cy="12" r="4" />}
                              <path d={THEME_ICONS[k]} />
                            </svg>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Accent swatches — design line 467 */}
                  <div className={styles.formCard}>
                    <div style={{ fontSize: 12.5, color: 'var(--tx-01)', fontWeight: 600, marginBottom: 12 }}>Accent</div>
                    <div className={styles.swatchGrid}>
                      {ACCENT_SWATCHES.map((c) => (
                        <button
                          key={c}
                          className={`${styles.swatch}${accent === c ? ` ${styles.swatchActive}` : ''}`}
                          style={{
                            background: c,
                            // inline so the swatch color is data-driven
                            ...(accent === c ? { boxShadow: `0 0 0 2px var(--sf-main), 0 0 0 4px ${c}` } : {}),
                          }}
                          onClick={() => onPickAccent(c)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Row density — design line 474 */}
                  <div className={styles.formCard}>
                    <div style={{ fontSize: 12.5, color: 'var(--tx-01)', fontWeight: 600, marginBottom: 4 }}>Row density</div>
                    <div style={{ fontSize: 11.5, color: 'var(--tx-09)', marginBottom: 12 }}>Ultra-dense fits the most rows on screen for power users.</div>
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
                          <span style={{ color: 'var(--sy-fn)' }}>claude</span>{' mcp add openobserve \\\n  --transport sse http://127.0.0.1:7878/sse \\\n  --header '}
                          <span style={{ color: 'var(--sy-str)' }}>"Authorization: Bearer $OO_MCP_TOKEN"</span>
                        </pre>
                        <div className={styles.snippetNote}>
                          Exposes tools: <b style={{ color: 'var(--tx-06)' }}>run_sql · get_schema · get_field_stats · summarize_results</b> + the live session as a resource.
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
                        o3 <span style={{ fontSize: 11, color: 'var(--tx-09)', fontWeight: 400 }}>· OpenObserve desktop client</span>
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
