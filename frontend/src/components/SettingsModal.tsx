import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { SettingsTab, Density, ThemePref } from '../types';
import { hexA } from '../lib/format';
import { authTabToScheme, expiryLabel, schemeToAuthTab } from '../lib/signin';
import { connTestLabel, type ConnTest } from '../lib/connTest';
import { ctxErrors, invalidLabel, errTitle, showError, touchKey, VALIDATORS } from '../lib/ctxValidate';
import type { CtxDraft, FieldKey } from '../lib/ctxValidate';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { AIEcosystem } from './AIEcosystem';
import type { EcosystemPaneProps } from './AIEcosystem';
import { BrandMark } from './BrandMark';
import { nativeUpdates, platformLine } from '../lib/update';
import type { AppInfo, CheckState, UpdateResult } from '../lib/update';
import styles from './SettingsModal.module.css';

// Project links. REPO_URL is the GitHub repository; DOCS_URL is the GitHub
// Pages site (goes live once Pages is enabled on release). Opened in the user's
// real browser via the Wails runtime, not inside the WebView.
const REPO_URL = 'https://github.com/AngelMsger/o3';
const DOCS_URL = 'https://angelmsger.github.io/o3';

// One row of the kubectl-style contexts list.
export interface SettingsCtxRow {
  name: string;
  color: string;
  // isCurrent = the context the ACTIVE QUERY TAB uses. o3 scopes a context to a
  // tab, so this is "this tab", not an app-wide active connection.
  isCurrent: boolean;
  isEditing: boolean; // the row the form below is editing
  isDefault: boolean; // ★ — seeds brand-new tabs
  isDraft: boolean;   // not yet saved (cannot be used or starred)
  tabCount: number;   // how many query tabs are open on it
  errors: number;     // failing fields, for the ⚠ marker
  meta: string;       // "org · basic auth"
}

// How a brand-new query tab picks its context, plus the two values the
// explainer contrasts: o3's own starred default and openobserve-cli's
// active-context.
export interface NewTabContextProps {
  mode: 'last' | 'default';
  defaultName: string;
  cliActiveName: string;
  onMode: (m: 'last' | 'default') => void;
  onAdoptCli: () => void;
}

// Props for the kubectl-style contexts manager (Task 4)
interface SettingsContextsProps {
  contexts: SettingsCtxRow[];
  // The context the form edits — picked by clicking a row, independent of which
  // context the tab is querying. hasSecret tells the validator not to demand a
  // password o3 deliberately never reads back out of the keychain.
  active: {
    name: string; url: string; org: string; scheme: string;
    username: string; password: string; token: string; hasSecret: boolean;
  } | null;
  canRemove: boolean;
  newTab: NewTabContextProps;
  onAddContext: () => void;
  onSelect: (name: string) => void;    // pick a context to edit (does NOT switch)
  onUse: (name: string) => void;       // point THIS TAB at the context
  onSetDefault: (name: string) => void; // ☆ — make it seed new tabs
  onRemove: (name: string) => void;
  onField: (key: string, value: string) => void;
  onTest: () => void;
  test: ConnTest;
  onSave: () => void;
}

// The About tab's update surface. `state` is derived by lib/update's checkState,
// shared with the UpdateSheet so the two views cannot disagree.
export interface SettingsUpdatesProps {
  appInfo: AppInfo | null;
  state: CheckState;
  result: UpdateResult | null;
  error: string;
  autoCheck: boolean;
  skipVersion: string;
  onCheck: () => void;
  onToggleAutoCheck: () => void;
  onClearSkip: () => void;
}

interface SettingsModalProps extends SettingsContextsProps {
  visible: boolean;
  isDark: boolean;
  tab: SettingsTab;
  accent: string;
  density: Density;
  themePref: ThemePref;
  ecosystem: EcosystemPaneProps;
  updates: SettingsUpdatesProps;
  showHistogram: boolean;
  conn: { url: string; org: string; email?: string; password?: string; token?: string };
  onClose: () => void;
  onTab: (t: SettingsTab) => void;
  onPickAccent: (c: string) => void;
  onPickDensity: (d: Density) => void;
  onPickTheme: (t: ThemePref) => void;
  onToggleHisto: () => void;
  onConnField: (key: string, value: string) => void;
  onOpenSetup?: () => void;
  // Browser sign-in: open the capture flow for the active context, the current
  // stored session status, and a sign-out action.
  onBrowserSignIn?: () => void;
  onSignOut?: () => void;
  session?: { email: string; expiresAt: string; valid: boolean } | null;
}

// Left tab list — design line 1210
const SET_TABS: [SettingsTab, string][] = [
  ['connection', 'Connection'],
  ['appearance', 'Appearance'],
  ['agent', 'AI Ecosystem'],
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

export function SettingsModal({
  visible,
  isDark,
  tab,
  accent,
  density,
  themePref,
  ecosystem,
  updates,
  showHistogram,
  conn,
  onClose,
  onTab,
  onPickAccent,
  onPickDensity,
  onPickTheme,
  onToggleHisto,
  onConnField,
  onOpenSetup,
  contexts,
  active,
  canRemove,
  newTab,
  onAddContext,
  onSelect,
  onUse,
  onSetDefault,
  onRemove,
  onField,
  onTest,
  test,
  onSave,
  onBrowserSignIn,
  onSignOut,
  session,
}: SettingsModalProps): ReactElement {
  // Auth mode for the edit-active-context form — derived from the active context
  // scheme. 'session' shows the browser-session card; 'basic' maps to 'password'.
  const authMode = schemeToAuthTab(active?.scheme ?? 'basic');
  const isSession = authMode === 'session';

  // Validation state lives here rather than in App: it is presentation (when to
  // paint a field red), not something the rest of the app has any use for.
  // `touched` is keyed by context so picking another row starts clean.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saveTried, setSaveTried] = useState(false);
  // browserNeedsUrl backs the design's "Fill in the Server URL above first"
  // hint: browser sign-in used to fail silently when the URL was blank.
  const [browserNeedsUrl, setBrowserNeedsUrl] = useState(false);

  const editName = active?.name ?? '';
  const errors = ctxErrors(active as CtxDraft | null);
  const errCount = Object.keys(errors).length;

  // Clear the per-field state whenever the form moves to another context, so a
  // half-filled row does not leave red borders on the next one.
  useEffect(() => {
    setSaveTried(false);
    setBrowserNeedsUrl(false);
  }, [editName]);

  const touch = (k: FieldKey) => setTouched((t) => ({ ...t, [touchKey(editName, k)]: true }));
  const bad = (k: FieldKey) => showError(errors, touched, editName, k, saveTried);
  const inputClass = (k: FieldKey) => `${styles.fieldInput}${bad(k) ? ` ${styles.fieldInputBad}` : ''}`;
  const fieldError = (k: FieldKey) =>
    bad(k) ? <div className={styles.fieldError}><span>⚠</span>{errors[k]}</div> : null;

  // Test and Save both refuse to run against a context that cannot connect, and
  // reveal every outstanding problem at once instead of failing at the server.
  const guard = (run: () => void) => () => {
    if (errCount > 0) { setSaveTried(true); return; }
    setSaveTried(false);
    run();
  };
  // Browser sign-in only needs somewhere to open: flag the URL specifically
  // rather than the whole form.
  const handleBrowserSignIn = () => {
    if (VALIDATORS.url(active?.url ?? '')) {
      touch('url');
      setSaveTried(true);
      setBrowserNeedsUrl(true);
      return;
    }
    setBrowserNeedsUrl(false);
    onBrowserSignIn?.();
  };

  const testLabel = errCount > 0 && saveTried ? '⚠ Check the fields' : 'Test Connection';

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
                      <span className={styles.ctxHeaderSub}>click a row to edit it — editing never switches your tab</span>
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
                          // The EDITING row is outlined in the accent (its form is
                          // below); the row this tab uses is tinted in its own
                          // colour. They are independent — that is the point of
                          // click-to-edit.
                          border: `1px solid ${c.isEditing ? hexA(accent, 0.55) : c.isCurrent ? hexA(c.color, 0.4) : 'rgba(var(--ink),.07)'}`,
                          background: c.isEditing ? hexA(accent, 0.07) : c.isCurrent ? hexA(c.color, 0.06) : 'var(--sf-05)',
                        }}
                        onClick={() => onSelect(c.name)}
                      >
                        {/* color dot — design line 1360 */}
                        <span
                          style={{
                            width: 9, height: 9, borderRadius: '50%', flex: 'none',
                            background: c.color, boxShadow: `0 0 8px -1px ${c.color}`,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span className={styles.ctxRowName}>{c.name}</span>
                            {c.isDefault && (
                              <span className={styles.ctxActiveBadge} title="Seeds every new tab" style={{ color: '#f5b340', background: 'rgba(245,179,64,.13)' }}>★ default</span>
                            )}
                            {c.isCurrent && (
                              <span className={styles.ctxActiveBadge} style={{ color: accent, background: hexA(accent, 0.12) }}>this tab</span>
                            )}
                            {c.isEditing && (
                              <span className={styles.ctxActiveBadge} style={{ color: 'var(--tx-06)', background: 'rgba(var(--ink),.09)' }}>editing</span>
                            )}
                            {/* Draft badge so an unsaved context reads clearly. */}
                            {c.isDraft && (
                              <span className={styles.ctxActiveBadge} style={{ color: 'var(--tx-09)', background: 'rgba(var(--ink),.06)' }}>draft</span>
                            )}
                            {c.errors > 0 && (
                              <span className={styles.ctxWarn} title={errTitle(c.errors)}>⚠</span>
                            )}
                          </div>
                        </div>
                        {/* How this context is configured, and how much of the
                            workspace is on it — the answer to "is it safe to
                            change this?" before you edit or delete it. */}
                        <div className={styles.ctxRowMeta}>
                          <div className={styles.ctxRowMetaTop}>{c.meta}</div>
                          <div className={styles.ctxRowMetaSub}>
                            {c.tabCount === 0 ? 'not open in any tab' : `open in ${c.tabCount} ${c.tabCount === 1 ? 'tab' : 'tabs'}`}
                          </div>
                        </div>
                        {/* ☆ makes this the context brand-new tabs start on. A
                            draft has no persisted name to point at yet. */}
                        {!c.isDefault && !c.isDraft && (
                          <button
                            className={styles.ctxStarBtn}
                            title="Make default for new tabs"
                            onClick={(e) => { e.stopPropagation(); onSetDefault(c.name); }}
                          >
                            ☆
                          </button>
                        )}
                        {/* Points THIS TAB at the context — the explicit gesture
                            that clicking a row deliberately no longer performs. */}
                        {!c.isCurrent && !c.isDraft && (
                          <button
                            className={styles.ctxUseBtn}
                            onClick={(e) => { e.stopPropagation(); onUse(c.name); }}
                          >
                            Use in this tab
                          </button>
                        )}
                        {/* Delete "X" — only when canRemove — design line 458-460 */}
                        {canRemove && (
                          <button
                            className={styles.ctxRemoveBtn}
                            title="Delete Context"
                            onClick={(e) => { e.stopPropagation(); onRemove(c.name); }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* New-tab context policy. o3 has no app-wide active context,
                      which is a real difference from the CLI — so the card says
                      so rather than leaving `active-context` to leak in
                      unexplained. */}
                  <div className={styles.newTabCard}>
                    <div className={styles.newTabTitle}>New tabs open with</div>
                    <div className={styles.newTabDesc}>
                      A context belongs to a query tab, not to the whole app — switching one tab never touches the others.{' '}
                      <b style={{ color: 'var(--tx-06)' }}>Active context</b> is an openobserve-cli concept; in o3 it maps to the{' '}
                      <b style={{ color: 'var(--tx-06)' }}>default</b> below, which only seeds brand-new tabs.
                    </div>
                    <div className={styles.newTabSeg}>
                      {([['last', 'Last used'], ['default', 'Default context']] as const).map(([k, label]) => (
                        <button
                          key={k}
                          className={styles.newTabSegTab}
                          style={newTab.mode === k ? { background: hexA(accent, 0.16), color: accent } : undefined}
                          onClick={() => newTab.onMode(k)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className={styles.newTabFacts}>
                      <span>default → <b className={styles.newTabFactValue}>{newTab.defaultName || '—'}</b></span>
                      <span style={{ color: 'var(--tx-13)' }}>·</span>
                      <span>cli active-context → <b className={styles.newTabFactValue}>{newTab.cliActiveName || '—'}</b></span>
                      <span style={{ flex: 1 }} />
                      <button
                        className={styles.followCliBtn}
                        title="Adopt openobserve-cli's active-context as the default for new tabs"
                        onClick={newTab.onAdoptCli}
                        disabled={!newTab.cliActiveName}
                      >
                        Follow the CLI
                      </button>
                    </div>
                  </div>

                  {/* Which context the form below edits, and whether this tab is
                      on it. Editing a context you are not querying is normal now,
                      so the header says which one and offers the switch. */}
                  {active && (
                    <div className={styles.editCtxHead}>
                      <div className={styles.editCtxLabel} style={{ marginBottom: 0 }}>
                        Editing <span className={styles.editCtxName}>{active.name}</span>
                      </div>
                      {contexts.some((c) => c.isEditing && c.isCurrent) ? (
                        <div className={styles.editCtxNote}>this tab is using it</div>
                      ) : (
                        <div className={styles.editCtxNote}>
                          not the context this tab uses — edits save without switching
                          <button className={styles.useHereBtn} onClick={() => onUse(active.name)}>Use in this tab</button>
                        </div>
                      )}
                    </div>
                  )}

                  {active && (
                    <>
                      {/* Status card for active context — design lines 466-473 */}
                      <div className={styles.statusCard}>
                        <span
                          className={styles.statusDot}
                          style={errCount > 0 ? { background: '#f5b340', boxShadow: '0 0 10px #f5b340' } : undefined}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className={styles.statusUrl}>{active.url || 'no endpoint set'}</div>
                          <div className={styles.statusMeta}>
                            org <b style={{ color: 'var(--tx-06)' }}>{active.org}</b>
                          </div>
                          {/* Test outcome. Without this the button called the
                              backend and displayed nothing, so it read as dead. */}
                          {test.state !== 'idle' && (
                            <div
                              className={styles.statusMeta}
                              style={{ marginTop: 4, color: test.state === 'error' ? '#f4685f' : accent }}
                            >
                              {connTestLabel(test)}
                            </div>
                          )}
                          {/* Same hint the wizard shows — a rejected certificate
                              must not read as an unexplained network failure on
                              one surface and an explained one on the other. */}
                          {test.state === 'error' && test.hint && (
                            <div className={styles.statusMeta} style={{ marginTop: 4 }}>
                              {test.hint}
                            </div>
                          )}
                        </div>
                        <button
                          className={styles.testBtn}
                          onClick={guard(onTest)}
                          disabled={test.state === 'testing'}
                        >
                          {testLabel}
                        </button>
                      </div>

                      {/* Edit form card — design lines 475-513 */}
                      <div className={styles.formCard}>
                        {/* Context name — design line 477-479 */}
                        <div className={styles.fieldWrap}>
                          <div className={styles.fieldLabel}>Context name</div>
                          <input
                            className={inputClass('name')}
                            value={active.name}
                            onChange={(e) => onField('name', e.target.value)}
                            onBlur={() => touch('name')}
                            spellCheck={false}
                          />
                          {fieldError('name')}
                        </div>
                        {/* Server URL — design line 481-483 */}
                        <div className={styles.fieldWrap}>
                          <div className={styles.fieldLabel}>Server URL</div>
                          <input
                            className={inputClass('url')}
                            value={active.url}
                            onChange={(e) => onField('url', e.target.value)}
                            onBlur={() => touch('url')}
                            placeholder="http://localhost:5080"
                            spellCheck={false}
                          />
                          {fieldError('url')}
                        </div>
                        {/* Organization — design line 485-487 */}
                        <div className={styles.fieldWrap}>
                          <div className={styles.fieldLabel}>Organization</div>
                          <input
                            className={inputClass('org')}
                            value={active.org}
                            onChange={(e) => onField('org', e.target.value)}
                            onBlur={() => touch('org')}
                            spellCheck={false}
                          />
                          {fieldError('org')}
                        </div>
                        {/* Authentication segmented — design lines 488-492 */}
                        <div style={{ marginBottom: 14 }}>
                          <div className={styles.fieldLabel}>Authentication</div>
                          <div className={styles.authSeg}>
                            {(['session', 'password', 'token', 'sso'] as const).map((id, i) => {
                              const labels = ['Browser sign-in', 'Email & Password', 'API Token', 'SSO'];
                              return (
                                <button
                                  key={id}
                                  className={`${styles.authTab}${authMode === id ? ` ${styles.authTabActive}` : ''}`}
                                  style={authMode === id ? { background: hexA(accent, 0.18), color: accent } : undefined}
                                  onClick={() => onField('scheme', authTabToScheme(id))}
                                >
                                  {labels[i]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Browser session card — design Browser Sign-in 1a (A4) */}
                        {isSession && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                background: 'var(--sf-05)', borderRadius: 11, padding: '13px 15px',
                                border: `1px solid ${hexA(accent, 0.2)}`,
                              }}
                            >
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" style={{ flex: 'none' }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, color: 'var(--tx-01)' }}>
                                  Browser session{session?.email ? <> · signed in as <span className="mono" style={{ color: 'var(--tx-05)' }}>{session.email}</span></> : null}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--tx-09)', marginTop: 2 }}>
                                  Stored in your OS keychain · expires {expiryLabel(session?.expiresAt ?? '')}. o3 never stores your password.
                                </div>
                              </div>
                              {session?.valid && (
                                <button
                                  className={styles.ctxUseBtn}
                                  onClick={onSignOut}
                                  title="Remove the stored session"
                                >
                                  Sign out
                                </button>
                              )}
                            </div>
                            <button
                              className={styles.testBtn}
                              style={{ alignSelf: 'flex-start' }}
                              onClick={handleBrowserSignIn}
                            >
                              {session?.valid ? 'Sign in again' : 'Open sign-in window'}
                            </button>
                            {/* Clicking with no usable URL used to do nothing at
                                all; say which field is missing and why. */}
                            {browserNeedsUrl && (
                              <div className={styles.fieldError} style={{ marginTop: 0, alignItems: 'flex-start', lineHeight: 1.5 }}>
                                <span>⚠</span>
                                Fill in the Server URL above first — o3 needs to know which instance to open.
                              </div>
                            )}
                            <div
                              style={{
                                fontSize: 12, color: 'var(--tx-07)', lineHeight: 1.5,
                                background: hexA(accent, 0.05), border: `1px solid ${hexA(accent, 0.16)}`,
                                borderRadius: 11, padding: '11px 14px',
                              }}
                            >
                              The same session works from the terminal — <span className="mono" style={{ color: accent }}>openobserve-cli</span> reuses this exact keychain session, no separate setup.
                            </div>
                          </div>
                        )}

                        {/* Email + password fields — design lines 494-498 */}
                        {authMode === 'password' && (
                          <div className={styles.row2}>
                            <div>
                              <div className={styles.fieldLabel}>Email</div>
                              <input
                                className={inputClass('username')}
                                value={active.username}
                                onChange={(e) => onField('username', e.target.value)}
                                onBlur={() => touch('username')}
                                spellCheck={false}
                              />
                              {fieldError('username')}
                            </div>
                            <div>
                              <div className={styles.fieldLabel}>Password</div>
                              <input
                                type="password"
                                className={inputClass('password')}
                                value={active.password}
                                onChange={(e) => onField('password', e.target.value)}
                                onBlur={() => touch('password')}
                                placeholder={active.hasSecret ? 'Stored in your keychain' : ''}
                              />
                              {fieldError('password')}
                            </div>
                          </div>
                        )}

                        {/* Token field — design lines 500-502 */}
                        {authMode === 'token' && (
                          <div>
                            <div className={styles.fieldLabel}>Service-account token</div>
                            <input
                              className={inputClass('token')}
                              value={active.token}
                              onChange={(e) => onField('token', e.target.value)}
                              onBlur={() => touch('token')}
                              placeholder={active.hasSecret ? 'Stored in your keychain' : 'Paste a token from OpenObserve -> IAM -> Service Accounts'}
                            />
                            {fieldError('token')}
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

                      {/* Summary banner — one place to see everything still
                          outstanding, rather than hunting the form for red. */}
                      {saveTried && errCount > 0 && (
                        <div className={styles.invalidBanner}>
                          <span className={styles.invalidBannerIcon}>⚠</span>
                          <span className={styles.invalidBannerText}>{invalidLabel(errCount)}</span>
                        </div>
                      )}

                      {/* Action buttons — design lines 520-523 */}
                      <div className={styles.actions}>
                        <button className={styles.btnPrimary} onClick={guard(onSave)}>Save</button>
                        <button className={styles.btnSecondary} onClick={onOpenSetup}>Re-run Setup Wizard…</button>
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
                  <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-bd)', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: 'var(--card-sh)' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--tx-01)', fontWeight: 600, marginBottom: 4 }}>Theme</div>
                    <div style={{ fontSize: 11.5, color: 'var(--tx-09)', marginBottom: 14 }}>Choose a look, or let it follow your macOS appearance automatically.</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {(['light', 'dark', 'system'] as ThemePref[]).map((k) => {
                        const active = themePref === k;
                        const label = k === 'system' ? 'System' : k[0].toUpperCase() + k.slice(1);
                        const title = k === 'system' ? 'Sync With System' : label + ' Theme';
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
                    <div style={{ fontSize: 12.5, color: 'var(--tx-01)', fontWeight: 600, marginBottom: 4 }}>Row Density</div>
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
                      <div className={styles.histoCardLabel}>Show Histogram By Default</div>
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

              {/* ===== AI ECOSYSTEM ===== */}
              {tab === 'agent' && (
                <AIEcosystem accent={accent} {...ecosystem} />
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
                    <span className={styles.brandIcon}>
                      <BrandMark variant={isDark ? 'void' : 'signal'} size={44} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className={styles.brandName}>
                        o3 <span style={{ fontSize: 11, color: 'var(--tx-09)', fontWeight: 400 }}>· OpenObserve desktop client</span>
                      </div>
                      <div className={styles.brandTagline} style={{ color: accent }}>SELECT signal FROM noise</div>
                      <div className={styles.brandVersion}>{platformLine(updates.appInfo)}</div>
                    </div>
                    {/* In native mode the click opens Sparkle/WinSparkle's own
                        dialog, which carries the checking/available states —
                        the label never changes here. */}
                    <button
                      className={`${styles.updateBtn}${!nativeUpdates(updates.appInfo) && updates.state === 'available' ? ` ${styles.updateBtnHot}` : ''}`}
                      disabled={!nativeUpdates(updates.appInfo) && updates.state === 'checking'}
                      onClick={updates.onCheck}
                    >
                      {nativeUpdates(updates.appInfo)
                        ? 'Check For Updates'
                        : updates.state === 'checking'
                          ? 'Checking…'
                          : updates.state === 'available' && updates.result
                            ? `Update To ${updates.result.latestVersion}`
                            : 'Check For Updates'}
                    </button>
                  </div>

                  {updates.error && (
                    <div className={styles.updateError}>{updates.error}</div>
                  )}

                  {/* Auto-check toggle — same card idiom as "Show Histogram". */}
                  <div className={styles.histoCard}>
                    <div style={{ flex: 1 }}>
                      <div className={styles.histoCardLabel}>Check For Updates Automatically</div>
                      <div className={styles.histoCardSub}>
                        {nativeUpdates(updates.appInfo)
                          ? 'Checks in the background and offers to install through the system update dialog. Updates are signature-verified before they run.'
                          : 'Asks GitHub for a new release at most once a day. o3 never installs anything on its own.'}
                      </div>
                    </div>
                    <button
                      className={`${styles.toggle}${updates.autoCheck ? ` ${styles.toggleOn}` : ''}`}
                      style={updates.autoCheck ? { background: accent } : undefined}
                      onClick={updates.onToggleAutoCheck}
                    >
                      <span className={`${styles.knob}${updates.autoCheck ? ` ${styles.knobOn}` : ''}`} />
                    </button>
                  </div>

                  {/* Without this, skipping a version is a one-way door. Native
                      mode never writes this pref — the framework tracks skipped
                      versions itself — so the row stays hidden there. */}
                  {!nativeUpdates(updates.appInfo) && updates.skipVersion && (
                    <div className={styles.skipRow}>
                      Skipping v{updates.skipVersion}.{' '}
                      <button
                        className={styles.skipClear}
                        style={{ color: accent }}
                        onClick={updates.onClearSkip}
                      >
                        Stop skipping
                      </button>
                    </div>
                  )}

                  {/* Doc links — design line 545 */}
                  <div className={styles.aboutLinks}>
                    <button className={styles.aboutLink} style={{ color: accent }} onClick={() => BrowserOpenURL(DOCS_URL)}>Documentation</button>
                    <button className={styles.aboutLink} style={{ color: accent }} onClick={() => BrowserOpenURL(`${REPO_URL}/releases`)}>Release Notes</button>
                    <button className={styles.aboutLink} style={{ color: accent }} onClick={() => BrowserOpenURL(`${REPO_URL}/issues/new`)}>Report An Issue</button>
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
