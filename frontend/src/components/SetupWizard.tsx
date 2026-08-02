/* SetupWizard — design/Observe.dc.html lines 563-659 (multi-context variant).
   Left panel shows "Your contexts" list + "+ New context"; right pane edits the
   selected context (name, URL, org, auth, test, save). */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { authTabToScheme, schemeToAuthTab } from '../lib/signin';
import { connTestLabel, type ConnTest } from '../lib/connTest';
import { ctxErrors, invalidLabel, showError, touchKey, VALIDATORS } from '../lib/ctxValidate';
import type { FieldKey } from '../lib/ctxValidate';
import { usesTLS } from '../lib/tls';
import { BrandMark } from './BrandMark';
import styles from './SetupWizard.module.css';

// UICtx mirrors the interface in App.tsx (kept local to avoid a shared types file)
interface UICtx {
  name: string; url: string; org: string;
  scheme: string;
  username: string;
  hasSecret: boolean; isCurrent: boolean;
  color: string;
  password: string; token: string;
  draft: boolean;
  origName: string; // I1: persisted name at load, used to detect renames on save
}

interface SetupWizardProps {
  visible: boolean;
  isDark: boolean;
  contexts: UICtx[];
  currentName: string;
  // authTab and onAuthTab removed — Fix 3: scheme is now the source of truth
  test: ConnTest;
  error?: string | null;
  // mutate a single field on the named context
  onUpdateCtx: (name: string, key: string, value: string) => void;
  onSelectCtx: (name: string) => void;
  onTest: (ctx: UICtx) => void;
  onClose: () => void;
  onSave: (ctx: UICtx) => Promise<void>;
  onAddContext: () => void;
  onBrowserSignIn: (ctx: UICtx) => void;
}

const AUTH_TABS: Array<{ id: 'session' | 'password' | 'token' | 'sso'; label: string }> = [
  { id: 'session', label: 'Browser sign-in' },
  { id: 'password', label: 'Email & Password' },
  { id: 'token', label: 'API Token' },
  { id: 'sso', label: 'SSO' },
];

export function SetupWizard({
  visible,
  isDark,
  contexts,
  currentName,
  test,
  error,
  onUpdateCtx,
  onSelectCtx,
  onTest,
  onClose,
  onSave,
  onAddContext,
  onBrowserSignIn,
}: SetupWizardProps): ReactElement {
  const selected = contexts.find((c) => c.name === currentName) ?? contexts[0];
  // Fix 3: derive the active auth tab from the selected context's scheme so the
  // displayed tab always matches what handleSaveContext / handleTestContext will use.
  const authTab = schemeToAuthTab(selected?.scheme ?? '');
  const isSession = authTab === 'session';

  // Same per-field validation as Settings (lib/ctxValidate), so a first launch
  // gets told what is wrong here rather than at the first failed request.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saveTried, setSaveTried] = useState(false);
  const [browserNeedsUrl, setBrowserNeedsUrl] = useState(false);
  const selName = selected?.name ?? '';
  const errors = ctxErrors(selected ?? null);
  const errCount = Object.keys(errors).length;

  useEffect(() => {
    setSaveTried(false);
    setBrowserNeedsUrl(false);
  }, [selName]);

  const touch = (k: FieldKey) => setTouched((t) => ({ ...t, [touchKey(selName, k)]: true }));
  const bad = (k: FieldKey) => showError(errors, touched, selName, k, saveTried);
  const inputClass = (k: FieldKey) => `${styles.fieldInput}${bad(k) ? ` ${styles.fieldInputBad}` : ''}`;
  const fieldError = (k: FieldKey) =>
    bad(k) ? <div className={styles.fieldError}><span>⚠</span>{errors[k]}</div> : null;

  // Connect & Continue refuses to save a context that cannot connect, revealing
  // every outstanding field at once instead of failing at the server.
  const handleConnect = () => {
    if (!selected) return;
    if (errCount > 0) { setSaveTried(true); return; }
    setSaveTried(false);
    void onSave(selected);
  };

  // Browser sign-in only needs a URL to open, so it flags that one field rather
  // than the whole form — and says why, instead of leaving a disabled button.
  const handleBrowserSignIn = () => {
    if (!selected) return;
    if (VALIDATORS.url(selected.url ?? '')) {
      touch('url');
      setBrowserNeedsUrl(true);
      return;
    }
    setBrowserNeedsUrl(false);
    onBrowserSignIn(selected);
  };

  return (
    <div className={`${styles.overlay} ${visible ? styles.shown : styles.hidden}`}>
      {/* Draggable strip — the overlay covers the TitleBar's drag region, so
          this restores window dragging from the top edge (native traffic-light
          buttons float above it and stay clickable). */}
      <div className={`${styles.dragStrip} oo-drag`} />

      {/* ===== Left brand panel — design line 563 ===== */}
      <div className={styles.left}>
        {/* Logo icon — the o3 monogram, matching the Dock (design line 569) */}
        <span className={styles.logoIcon}>
          <BrandMark variant={isDark ? 'void' : 'signal'} size={40} />
        </span>

        {/* Welcome text — design lines 570-572 */}
        <div className={styles.welcomeTitle}>Welcome To o3</div>
        <div className={styles.welcomeTagline}>SELECT signal FROM noise</div>
        <div className={styles.welcomeDesc}>
          A fast, native desktop client for OpenObserve. Point it at your self-hosted instance to begin.
        </div>

        {/* Steps 1-3 — design lines 573-577 */}
        <div className={styles.stepsList}>
          <div className={styles.stepRow}>
            <span className={`${styles.stepNum} ${styles.stepNumActive}`}>1</span>
            <span className={styles.stepLabelActive}>Connect Your Instance</span>
          </div>
          <div className={styles.stepRow}>
            <span className={`${styles.stepNum} ${styles.stepNumInactive}`}>2</span>
            <span className={styles.stepLabelInactive}>Pick a stream</span>
          </div>
          <div className={styles.stepRow}>
            <span className={`${styles.stepNum} ${styles.stepNumInactive}`}>3</span>
            <span className={styles.stepLabelInactive}>Run Your First Query</span>
          </div>
        </div>

        {/* "Your contexts" list — design lines 644-656 */}
        <div className={styles.ctxSection}>
          <div className={styles.ctxSectionLabel}>Your contexts</div>
          <div className={styles.ctxSectionList}>
            {contexts.map((c) => {
              const active = c.name === currentName;
              return (
                <div
                  key={c.name}
                  className={styles.ctxItem}
                  onClick={() => onSelectCtx(c.name)}
                  style={{
                    border: `1px solid ${active ? `${c.color}80` : 'rgba(255,255,255,.07)'}`,
                    background: active ? `${c.color}1a` : 'rgba(255,255,255,.02)',
                  }}
                >
                  <span
                    className={styles.ctxItemDot}
                    style={{ background: c.color, boxShadow: `0 0 8px -1px ${c.color}` }}
                  />
                  <span className={styles.ctxItemName}>{c.name}</span>
                  {active && <span className={styles.ctxItemCheck}>✓</span>}
                </div>
              );
            })}

            {/* "+ New context" button — design line 654 */}
            <button className={styles.ctxAddBtn} onClick={onAddContext}>
              + New context
            </button>
          </div>
        </div>

        {/* Spacer — design line 657 */}
        <div className={styles.spacer} />

        {/* Footer — design line 658 */}
        <div className={styles.leftFooter}>No telemetry · everything runs locally on your machine.</div>
      </div>

      {/* ===== Right pane — design line 661 ===== */}
      <div className={`oo-scroll ${styles.right}`}>
        <div className={styles.rightInner}>
          {/* Heading — design lines 663-664 */}
          <div className={styles.rightTitle}>Connect To OpenObserve</div>
          <div className={styles.rightSub}>
            Name this context and point it at your instance. Switch between contexts any time from the title bar. Self-hosted OSS uses basic auth — no hosted OAuth.
          </div>

          {/* Every field below is bound to `selected` and guarded on it, so with
              no context the form would render but silently swallow typing. App
              seeds a draft so this cannot happen; show a way out if it ever does
              rather than a dead form. */}
          {!selected && (
            <div className={styles.browserPane}>
              <div className={styles.browserDesc}>No context to edit yet.</div>
              <button className={styles.browserBtn} onClick={onAddContext}>
                + New context
              </button>
            </div>
          )}

          {selected && (<>
          {/* Context name — design line 667 */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Context name</div>
            <input
              className={inputClass('name')}
              value={selected?.name ?? ''}
              onChange={(e) => selected && onUpdateCtx(selected.name, 'name', e.target.value)}
              onBlur={() => touch('name')}
              placeholder="prod, staging, local..."
              spellCheck={false}
            />
            {fieldError('name')}
          </div>

          {/* Server URL — design line 671 */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Server URL</div>
            <input
              className={inputClass('url')}
              value={selected?.url ?? ''}
              onChange={(e) => selected && onUpdateCtx(selected.name, 'url', e.target.value)}
              onBlur={() => touch('url')}
              placeholder="http://localhost:5080"
              spellCheck={false}
            />
            {fieldError('url')}
          </div>

          {/* Organization */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Organization</div>
            <input
              className={inputClass('org')}
              value={selected?.org ?? ''}
              onChange={(e) => selected && onUpdateCtx(selected.name, 'org', e.target.value)}
              onBlur={() => touch('org')}
              placeholder="default"
              spellCheck={false}
            />
            {fieldError('org')}
          </div>

          {/* Authentication segmented tabs */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Authentication</div>
            <div className={styles.authSeg}>
              {AUTH_TABS.map((a) => (
                <button
                  key={a.id}
                  className={`${styles.authTab}${authTab === a.id ? ` ${styles.authTabActive}` : ''}`}
                  onClick={() => {
                    if (!selected) return;
                    // Fix 3: toggling the auth tab updates the selected context's scheme
                    // so Save/Test always use the scheme the user sees.
                    onUpdateCtx(selected.name, 'scheme', authTabToScheme(a.id));
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auth pane: browser sign-in (default) */}
          {isSession && (
            <div className={styles.browserPane}>
              <div className={styles.browserDesc}>
                Log in through your instance's own web page — o3 opens a secure window, captures the session, and stores it in your OS keychain. No token to create or paste; works for everyone.
              </div>
              {/* Enabled unconditionally: a disabled button with a hint beside
                  it never says WHICH field is wrong. Clicking now flags the URL
                  and explains what it is needed for. */}
              <button className={styles.browserBtn} onClick={handleBrowserSignIn} disabled={!selected}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06181a" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                Open sign-in window
              </button>
              {browserNeedsUrl && (
                <div className={styles.fieldError}>
                  <span>⚠</span>
                  Fill in the Server URL above first — o3 needs to know which instance to open.
                </div>
              )}
            </div>
          )}

          {/* Auth pane: password */}
          {authTab === 'password' && (
            <div className={styles.row2}>
              <div>
                <div className={styles.fieldLabel}>Email</div>
                <input
                  className={inputClass('username')}
                  value={selected?.username ?? ''}
                  onChange={(e) => selected && onUpdateCtx(selected.name, 'username', e.target.value)}
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
                  value={selected?.password ?? ''}
                  onChange={(e) => selected && onUpdateCtx(selected.name, 'password', e.target.value)}
                  onBlur={() => touch('password')}
                />
                {fieldError('password')}
              </div>
            </div>
          )}

          {/* Auth pane: token */}
          {authTab === 'token' && (
            <div className={styles.fieldWrap}>
              <div className={styles.fieldLabel}>Service-account token</div>
              <input
                className={inputClass('token')}
                value={selected?.token ?? ''}
                onChange={(e) => selected && onUpdateCtx(selected.name, 'token', e.target.value)}
                onBlur={() => touch('token')}
                placeholder="oo_sa_..."
              />
              {fieldError('token')}
            </div>
          )}

          {/* Auth pane: SSO */}
          {authTab === 'sso' && (
            <div className={styles.ssoWarn}>
              <span className={styles.ssoWarnIcon}>⚠</span>
              <div className={styles.ssoWarnText}>
                OAuth / SSO needs <b style={{ color: '#f5d9a0' }}>OpenObserve Enterprise</b>. On the OSS edition, use email + password or a token.
              </div>
            </div>
          )}

          {/* Certificate note. This replaced a "Trust Self-Signed Certificate"
              toggle that was wired to nothing: it set React state no backend
              call ever read, so it promised an exception o3 has never made. The
              note is outside the !isSession gate on purpose — browser sign-in is
              if anything stricter, since WKWebView rejects an untrusted
              certificate on its own. */}
          {usesTLS(selected?.url ?? '') && (
            <div className={styles.certNote}>
              <span className={styles.certIcon}>🔒</span>
              <span>
                This server's certificate must be trusted by your system.
                Self-signed certificates are not supported — add the issuing CA to
                your system trust store, or serve a publicly trusted certificate.
              </span>
            </div>
          )}

          {/* Test (not shown for browser sign-in, which connects through the
              captured session, not typed credentials) */}
          {!isSession && (
            <>
              <div className={styles.testRow}>
                <button
                  className={styles.testBtn}
                  onClick={() => {
                    if (!selected) return;
                    if (errCount > 0) { setSaveTried(true); return; }
                    onTest(selected);
                  }}
                  disabled={!selected || test.state === 'testing'}
                >
                  {errCount > 0 && saveTried ? '⚠ Check the fields' : 'Test Connection'}
                </button>
                {test.state !== 'idle' && (
                  <span className={test.state === 'error' ? styles.testError : styles.testedLabel}>
                    {connTestLabel(test)}
                  </span>
                )}
              </div>
              {test.state === 'error' && test.hint && (
                <div className={styles.testHint}>{test.hint}</div>
              )}
              {error && <div className={styles.testError}>{error}</div>}
            </>
          )}
          </>)}

          {/* Summary banner — everything still outstanding, in one place. */}
          {saveTried && errCount > 0 && (
            <div className={styles.invalidBanner}>
              <span className={styles.invalidBannerIcon}>⚠</span>
              <span className={styles.invalidBannerText}>{invalidLabel(errCount)}</span>
            </div>
          )}

          {/* Action buttons — browser sign-in connects via the sign-in window,
              so it only offers Skip; typed methods keep Connect & Continue. */}
          <div className={styles.actions}>
            {!isSession && (
              <button
                className={styles.btnPrimary}
                onClick={handleConnect}
                disabled={!selected}
              >
                Connect &amp; Continue
              </button>
            )}
            <button className={styles.btnSkip} onClick={onClose}>
              Skip
            </button>
          </div>

          {/* Keychain note */}
          <div className={styles.keychainNote}>
            <span className={styles.keychainIcon}>🔒</span>
            Stored in your OS keychain via Wails — never in plaintext.
          </div>
        </div>
      </div>
    </div>
  );
}
