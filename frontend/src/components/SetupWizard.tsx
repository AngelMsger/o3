/* SetupWizard — design/Observe.dc.html lines 563-659 (multi-context variant).
   Left panel shows "Your contexts" list + "+ New context"; right pane edits the
   selected context (name, URL, org, auth, test, save). */
import type { ReactElement } from 'react';
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
}

interface SetupWizardProps {
  visible: boolean;
  contexts: UICtx[];
  currentName: string;
  // authTab and onAuthTab removed — Fix 3: scheme is now the source of truth
  tested: boolean;
  selfSigned: boolean;
  error?: string | null;
  // mutate a single field on the named context
  onUpdateCtx: (name: string, key: string, value: string) => void;
  onSelectCtx: (name: string) => void;
  onToggleSelfSigned: () => void;
  onTest: (ctx: UICtx) => void;
  onClose: () => void;
  onSave: (ctx: UICtx) => Promise<void>;
  onAddContext: () => void;
}

const AUTH_TABS: Array<{ id: 'password' | 'token' | 'sso'; label: string }> = [
  { id: 'password', label: 'Email & Password' },
  { id: 'token', label: 'API Token' },
  { id: 'sso', label: 'SSO' },
];

export function SetupWizard({
  visible,
  contexts,
  currentName,
  tested,
  selfSigned,
  error,
  onUpdateCtx,
  onSelectCtx,
  onToggleSelfSigned,
  onTest,
  onClose,
  onSave,
  onAddContext,
}: SetupWizardProps): ReactElement {
  const selected = contexts.find((c) => c.name === currentName) ?? contexts[0];
  // Fix 3: derive the active auth tab from the selected context's scheme so the
  // displayed tab always matches what handleSaveContext / handleTestContext will use.
  const authTab: 'password' | 'token' | 'sso' =
    selected?.scheme === 'token' ? 'token' : selected?.scheme === 'sso' ? 'sso' : 'password';

  return (
    <div className={`${styles.overlay} ${visible ? styles.shown : styles.hidden}`}>
      {/* ===== Left brand panel — design line 563 ===== */}
      <div className={styles.left}>
        {/* Traffic lights — design line 564 */}
        <div className={styles.trafficLights}>
          <span className={`${styles.dot} ${styles.dotRed}`} />
          <span className={`${styles.dot} ${styles.dotYellow}`} />
          <span className={`${styles.dot} ${styles.dotGreen}`} />
        </div>

        {/* Logo icon — design line 569 */}
        <span className={styles.logoIcon}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06181a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h4l3 8 4-16 3 8h6" />
          </svg>
        </span>

        {/* Welcome text — design lines 570-572 */}
        <div className={styles.welcomeTitle}>Welcome to o3</div>
        <div className={styles.welcomeTagline}>SELECT signal FROM noise</div>
        <div className={styles.welcomeDesc}>
          A fast, native desktop client for OpenObserve. Point it at your self-hosted instance to begin.
        </div>

        {/* Steps 1-3 — design lines 573-577 */}
        <div className={styles.stepsList}>
          <div className={styles.stepRow}>
            <span className={`${styles.stepNum} ${styles.stepNumActive}`}>1</span>
            <span className={styles.stepLabelActive}>Connect your instance</span>
          </div>
          <div className={styles.stepRow}>
            <span className={`${styles.stepNum} ${styles.stepNumInactive}`}>2</span>
            <span className={styles.stepLabelInactive}>Pick a stream</span>
          </div>
          <div className={styles.stepRow}>
            <span className={`${styles.stepNum} ${styles.stepNumInactive}`}>3</span>
            <span className={styles.stepLabelInactive}>Run your first query</span>
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
          <div className={styles.rightTitle}>Connect to OpenObserve</div>
          <div className={styles.rightSub}>
            Name this context and point it at your instance. Switch between contexts any time from the title bar. Self-hosted OSS uses basic auth — no hosted OAuth.
          </div>

          {/* Context name — design line 667 */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Context name</div>
            <input
              className={styles.fieldInput}
              value={selected?.name ?? ''}
              onChange={(e) => selected && onUpdateCtx(selected.name, 'name', e.target.value)}
              placeholder="prod, staging, local..."
              spellCheck={false}
            />
          </div>

          {/* Server URL — design line 671 */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Server URL</div>
            <input
              className={styles.fieldInput}
              value={selected?.url ?? ''}
              onChange={(e) => selected && onUpdateCtx(selected.name, 'url', e.target.value)}
              placeholder="http://localhost:5080"
              spellCheck={false}
            />
          </div>

          {/* Organization */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Organization</div>
            <input
              className={styles.fieldInput}
              value={selected?.org ?? ''}
              onChange={(e) => selected && onUpdateCtx(selected.name, 'org', e.target.value)}
              placeholder="default"
              spellCheck={false}
            />
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
                    const scheme = a.id === 'token' ? 'token' : a.id === 'sso' ? 'sso' : 'basic';
                    onUpdateCtx(selected.name, 'scheme', scheme);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auth pane: password */}
          {authTab === 'password' && (
            <div className={styles.row2}>
              <div>
                <div className={styles.fieldLabel}>Email</div>
                <input
                  className={styles.fieldInput}
                  value={selected?.username ?? ''}
                  onChange={(e) => selected && onUpdateCtx(selected.name, 'username', e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div>
                <div className={styles.fieldLabel}>Password</div>
                <input
                  type="password"
                  className={styles.fieldInput}
                  value={selected?.password ?? ''}
                  onChange={(e) => selected && onUpdateCtx(selected.name, 'password', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Auth pane: token */}
          {authTab === 'token' && (
            <div className={styles.fieldWrap}>
              <div className={styles.fieldLabel}>Service-account token</div>
              <input
                className={styles.fieldInput}
                value={selected?.token ?? ''}
                onChange={(e) => selected && onUpdateCtx(selected.name, 'token', e.target.value)}
                placeholder="oo_sa_..."
              />
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

          {/* Self-signed toggle */}
          <div className={styles.toggleRow}>
            <button
              className={`${styles.toggle}${selfSigned ? ` ${styles.toggleOn}` : ''}`}
              onClick={onToggleSelfSigned}
            >
              <span
                className={styles.knob}
                style={selfSigned ? { transform: 'translateX(16px)' } : undefined}
              />
            </button>
            <span className={styles.toggleLabel}>Trust self-signed certificate</span>
          </div>

          {/* Test connection row */}
          <div className={styles.testRow}>
            <button
              className={styles.testBtn}
              onClick={() => selected && onTest(selected)}
              disabled={!selected}
            >
              Test connection
            </button>
            {tested && (
              <span className={styles.testedLabel}>✓ reachable</span>
            )}
          </div>
          {error && <div className={styles.testError}>{error}</div>}

          {/* Action buttons */}
          <div className={styles.actions}>
            <button
              className={styles.btnPrimary}
              onClick={() => selected && onSave(selected)}
              disabled={!selected}
            >
              Connect &amp; continue
            </button>
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
