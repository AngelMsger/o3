import type { ReactElement } from 'react';
import styles from './SetupWizard.module.css';

interface SetupWizardProps {
  open: boolean;
  conn: { url: string; org: string; email?: string; password?: string; token?: string };
  authTab: 'password' | 'token' | 'sso';
  tested: boolean;
  selfSigned: boolean;
  onAuthTab: (t: 'password' | 'token' | 'sso') => void;
  onField: (key: string, value: string) => void;
  onToggleSelfSigned: () => void;
  onTest: () => void;
  onClose: () => void;
}

const AUTH_TABS: Array<{ id: 'password' | 'token' | 'sso'; label: string }> = [
  { id: 'password', label: 'Email & Password' },
  { id: 'token', label: 'API Token' },
  { id: 'sso', label: 'SSO' },
];

export function SetupWizard({
  open,
  conn,
  authTab,
  tested,
  selfSigned,
  onAuthTab,
  onField,
  onToggleSelfSigned,
  onTest,
  onClose,
}: SetupWizardProps): ReactElement | null {
  if (!open) return null;

  return (
    <div className={styles.overlay}>
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

        {/* Welcome text — design lines 570–572 */}
        <div className={styles.welcomeTitle}>Welcome to o3</div>
        <div className={styles.welcomeTagline}>SELECT signal FROM noise</div>
        <div className={styles.welcomeDesc}>
          A fast, native desktop client for OpenObserve. Point it at your self-hosted instance to begin.
        </div>

        {/* Steps 1-3 — design lines 573–577 */}
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

        {/* Spacer — design line 578 */}
        <div className={styles.spacer} />

        {/* Footer — design line 579 */}
        <div className={styles.leftFooter}>No telemetry · everything runs locally on your machine.</div>
      </div>

      {/* ===== Right pane — design line 582 ===== */}
      <div className={`oo-scroll ${styles.right}`}>
        <div className={styles.rightInner}>
          {/* Heading — design lines 584–585 */}
          <div className={styles.rightTitle}>Connect to OpenObserve</div>
          <div className={styles.rightSub}>
            Enter the endpoint and a service account. Self-hosted OSS uses basic auth — no hosted OAuth.
          </div>

          {/* Server URL — design lines 587–590 */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Server URL</div>
            <input
              className={styles.fieldInput}
              value={conn.url}
              onChange={(e) => onField('url', e.target.value)}
              placeholder="http://localhost:5080"
              spellCheck={false}
            />
          </div>

          {/* Organization — design lines 591–594 */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Organization</div>
            <input
              className={styles.fieldInput}
              value={conn.org}
              onChange={(e) => onField('org', e.target.value)}
              placeholder="default"
              spellCheck={false}
            />
          </div>

          {/* Authentication segmented tabs — design lines 595–600 */}
          <div className={styles.fieldWrap}>
            <div className={styles.fieldLabel}>Authentication</div>
            <div className={styles.authSeg}>
              {AUTH_TABS.map((a) => (
                <button
                  key={a.id}
                  className={`${styles.authTab}${authTab === a.id ? ` ${styles.authTabActive}` : ''}`}
                  onClick={() => onAuthTab(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auth pane: password — design lines 601–606 */}
          {authTab === 'password' && (
            <div className={styles.row2}>
              <div>
                <div className={styles.fieldLabel}>Email</div>
                <input
                  className={styles.fieldInput}
                  value={conn.email ?? ''}
                  onChange={(e) => onField('email', e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div>
                <div className={styles.fieldLabel}>Password</div>
                <input
                  type="password"
                  className={styles.fieldInput}
                  value={conn.password ?? ''}
                  onChange={(e) => onField('password', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Auth pane: token — design lines 607–609 */}
          {authTab === 'token' && (
            <div className={styles.fieldWrap}>
              <div className={styles.fieldLabel}>Service-account token</div>
              <input
                className={styles.fieldInput}
                value={conn.token ?? ''}
                onChange={(e) => onField('token', e.target.value)}
                placeholder="oo_sa_…"
              />
            </div>
          )}

          {/* Auth pane: SSO — design lines 610–612 */}
          {authTab === 'sso' && (
            <div className={styles.ssoWarn}>
              <span className={styles.ssoWarnIcon}>⚠</span>
              <div className={styles.ssoWarnText}>
                OAuth / SSO needs <b style={{ color: '#f5d9a0' }}>OpenObserve Enterprise</b>. On the OSS edition, use email + password or a token.
              </div>
            </div>
          )}

          {/* Self-signed toggle — design lines 614–617 */}
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

          {/* Test connection row — design lines 619–622 */}
          <div className={styles.testRow}>
            <button className={styles.testBtn} onClick={onTest}>
              Test connection
            </button>
            {tested && (
              <span className={styles.testedLabel}>✓ reachable · 6 streams · v0.14.1</span>
            )}
          </div>

          {/* Action buttons — design lines 624–627 */}
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={onClose}>
              Connect &amp; continue
            </button>
            <button className={styles.btnSkip} onClick={onClose}>
              Skip
            </button>
          </div>

          {/* Keychain note — design line 628 (Tauri → Wails, intentional deviation) */}
          <div className={styles.keychainNote}>
            <span className={styles.keychainIcon}>🔒</span>
            Stored in your OS keychain via Wails — never in plaintext.
          </div>
        </div>
      </div>
    </div>
  );
}
