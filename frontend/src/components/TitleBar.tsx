/* TitleBar — design/Observe.dc.html lines 41-92.
   Native macOS traffic lights are provided by the OS (mac.TitleBarHiddenInset);
   the bar is left-padded to clear them, and the bar is the window drag region.
   Context switcher button + dropdown added in task 3 (design lines 57-89). */
import styles from './TitleBar.module.css';

interface TitleBarCtxItem {
  name: string;
  url: string;   // Fix 6: sub-label shown under the name (design line 77)
  color: string;
  isCurrent: boolean;
}

interface TitleBarProps {
  contexts: TitleBarCtxItem[];
  currentName: string;
  switchOpen: boolean;
  onToggleSwitch: () => void;
  onSwitch: (name: string) => void;
  onAddContext: () => void;
  onManage: () => void;
}

export function TitleBar({
  contexts,
  currentName,
  switchOpen,
  onToggleSwitch,
  onSwitch,
  onAddContext,
  onManage,
}: TitleBarProps) {
  const current = contexts.find((c) => c.name === currentName) ?? contexts[0];

  return (
    <div className={`${styles.bar} oo-drag`}>
      <div className={styles.brand}>
        <span className={`${styles.logo} oo-no-drag`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06181a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h4l3 8 4-16 3 8h6" />
          </svg>
        </span>
        <span className={styles.name}>o3</span>
        <span className={styles.crumb}>/ Logs</span>
      </div>
      <div style={{ flex: 1 }} />

      {/* Context switcher — design lines 57-89 */}
      <div className={`${styles.ctxWrap} oo-no-drag`}>
        {/* Switcher button */}
        <button
          className={styles.ctxBtn}
          onClick={onToggleSwitch}
          title="Active context — click to switch"
        >
          <span className={styles.ctxLabel}>ctx</span>
          {current && (
            <span
              className={styles.ctxDot}
              style={{ background: current.color, boxShadow: `0 0 7px -1px ${current.color}` }}
            />
          )}
          <span className={styles.ctxName}>{current?.name ?? '—'}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--tx-09)" strokeWidth="2.4">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* Backdrop + dropdown */}
        {switchOpen && (
          <>
            {/* Click-away backdrop */}
            <div className={styles.ctxBackdrop} onClick={() => onToggleSwitch()} />

            {/* Dropdown panel — design lines 66-88 */}
            <div className={styles.ctxDropdown}>
              {/* Header */}
              <div className={styles.ctxDropHeader}>
                <span className={styles.ctxDropTitle}>Switch context</span>
                <span className={styles.ctxDropCount}>{contexts.length} configured</span>
              </div>

              {/* Context list */}
              <div className={styles.ctxList}>
                {contexts.map((c) => (
                  <div
                    key={c.name}
                    className={`${styles.ctxRow} ${c.isCurrent ? styles.ctxRowActive : ''}`}
                    onClick={() => onSwitch(c.name)}
                    style={c.isCurrent ? { background: `rgba(255,255,255,0.04)` } : undefined}
                  >
                    <span
                      className={styles.ctxRowDot}
                      style={{ background: c.color, boxShadow: `0 0 6px -1px ${c.color}` }}
                    />
                    <div className={styles.ctxRowBody}>
                      <div className={styles.ctxRowName}>{c.name}</div>
                      {c.url && (
                        <div className={styles.ctxRowSub}>{c.url}</div>
                      )}
                    </div>
                    {c.isCurrent && <span className={styles.ctxCheckmark}>✓</span>}
                  </div>
                ))}
              </div>

              {/* Footer actions */}
              <div className={styles.ctxFooter}>
                <button className={styles.ctxAddBtn} onClick={onAddContext}>
                  + Add context
                </button>
                <button className={styles.ctxManageBtn} onClick={onManage}>
                  Manage&hellip;
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={`${styles.avatar} oo-no-drag`}>JD</div>
    </div>
  );
}
