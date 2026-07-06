/* BrowserSignIn — the branded, OAuth-style overlay for browser sign-in
   (design Browser Sign-in.dc.html, steps B2-B4). A step ribbon walks the user
   through Log in -> Authorize -> Done: the native login window opens (Log in),
   an explicit consent panel names the session capture + CLI sharing (Authorize),
   and a trust panel confirms the connection (Done).

   The overlay is driven by callback props so its flow can be reasoned about (and
   unit-tested via lib/signin) without owning the Wails glue. */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { hexA } from '../lib/format';
import { expiryLabel } from '../lib/signin';
import type { CapturedSession, SignInStep } from '../lib/signin';
import styles from './BrowserSignIn.module.css';

interface BrowserSignInProps {
  open: boolean;
  accent: string;
  url: string;
  org: string;
  onCapture: (url: string, org: string) => Promise<CapturedSession>;
  onAuthorize: (session: CapturedSession) => Promise<void>;
  onCancel: () => void;
  onDone: () => void;
}

const STEPS: { id: SignInStep; label: string; n: number }[] = [
  { id: 'login', label: 'Log in', n: 1 },
  { id: 'consent', label: 'Authorize', n: 2 },
  { id: 'done', label: 'Done', n: 3 },
];

// stepIndex maps a flow state to its ribbon position (error stays on step 1).
function stepIndex(step: SignInStep): number {
  if (step === 'consent') return 1;
  if (step === 'done') return 2;
  return 0;
}

export function BrowserSignIn({
  open, accent, url, org, onCapture, onAuthorize, onCancel, onDone,
}: BrowserSignInProps): ReactElement | null {
  const [step, setStep] = useState<SignInStep>('login');
  const [session, setSession] = useState<CapturedSession | null>(null);
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);

  // Start (or restart) the native capture whenever the overlay opens.
  const startCapture = () => {
    const id = ++runId.current;
    setStep('login');
    setError('');
    setSession(null);
    onCapture(url, org)
      .then((s) => {
        if (id !== runId.current) return; // superseded by a newer run / close
        setSession(s);
        setStep('consent');
      })
      .catch((e) => {
        if (id !== runId.current) return;
        setError(e?.message ?? String(e));
        setStep('error');
      });
  };

  useEffect(() => {
    if (open) startCapture();
    else runId.current++; // invalidate any in-flight capture on close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const active = stepIndex(step);

  const authorize = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await onAuthorize(session);
      setStep('done');
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStep('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay}>
      {/* Keep the frameless window draggable while this overlay covers the TitleBar. */}
      <div className={`${styles.dragStrip} oo-drag`} />
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        {/* Titlebar */}
        <div className={styles.titlebar}>
          <span className={styles.lock} style={{ color: accent }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <span className={styles.titleText}>Secure sign-in · <span className="mono">{url}</span></span>
        </div>

        {/* Step ribbon */}
        <div className={styles.ribbon}>
          {STEPS.map((s, i) => (
            <div key={s.id} className={styles.ribbonGroup}>
              <span
                className={styles.ribbonNum}
                style={i <= active
                  ? { background: accent, color: '#06181a' }
                  : { background: 'var(--sf-07)', color: 'var(--tx-09)', border: '1px solid rgba(255,255,255,.12)' }}
              >
                {i < active ? '✓' : s.n}
              </span>
              <span className={styles.ribbonLabel} style={i <= active ? { color: 'var(--tx-hi)' } : undefined}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className={styles.ribbonBar} />}
            </div>
          ))}
        </div>

        {/* Body per step */}
        <div className={styles.body}>
          {step === 'login' && (
            <div className={styles.center}>
              <span className={styles.spinner} style={{ borderTopColor: accent }} />
              <div className={styles.bigText}>Waiting for sign-in…</div>
              <div className={styles.subText}>
                Finish logging in through the window o3 opened on <span className="mono">{url}</span>.
                o3 captures the session the moment login succeeds — it never sees your password.
              </div>
              <button className={styles.linkBtn} onClick={onCancel}>Cancel</button>
            </div>
          )}

          {step === 'consent' && session && (
            <div className={styles.consent}>
              <div className={styles.bigText}>Authorize o3</div>
              <div className={styles.subText}>
                o3 wants to use your OpenObserve session
                {session.email ? <> as <span className="mono">{session.email}</span></> : null} on{' '}
                <span className="mono">{session.org || org}</span>.
              </div>
              <div className={styles.scopeCard} style={{ borderColor: hexA(accent, 0.25) }}>
                <div className={styles.scopeHead}>This will let o3</div>
                {['Run queries and read streams & schema',
                  'Read field stats and dashboards',
                  'Store the session in your OS keychain, shared with openobserve-cli'].map((t) => (
                  <div key={t} className={styles.scopeRow}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.btnPrimary}
                  style={{ background: accent }}
                  onClick={authorize}
                  disabled={busy}
                >
                  {busy ? 'Authorizing…' : 'Authorize'}
                </button>
                <button className={styles.btnSecondary} onClick={onCancel} disabled={busy}>Cancel</button>
              </div>
              <div className={styles.finePrint}>You can revoke this any time from Settings → Connection.</div>
            </div>
          )}

          {step === 'done' && (
            <div className={styles.center}>
              <span className={styles.checkCircle} style={{ borderColor: hexA(accent, 0.4), color: accent }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <div className={styles.bigText}>You're connected</div>
              {session && (
                <div className={styles.subText}>
                  {session.email ? <>Signed in as <span className="mono">{session.email}</span> · </> : null}
                  session stored in your OS keychain · expires {expiryLabel(session.expiresAt)}.
                </div>
              )}
              <div className={styles.cliCallout} style={{ borderColor: hexA(accent, 0.2), background: hexA(accent, 0.05) }}>
                Works from the terminal too — <span className="mono" style={{ color: accent }}>openobserve-cli</span> reuses this same session. Nothing else to set up.
              </div>
              <button className={styles.btnPrimary} style={{ background: accent }} onClick={onDone}>Start querying</button>
            </div>
          )}

          {step === 'error' && (
            <div className={styles.center}>
              <div className={styles.bigText}>Sign-in didn't complete</div>
              <div className={styles.errText}>{error}</div>
              <div className={styles.actions}>
                <button className={styles.btnPrimary} style={{ background: accent }} onClick={startCapture}>Try again</button>
                <button className={styles.btnSecondary} onClick={onCancel}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
