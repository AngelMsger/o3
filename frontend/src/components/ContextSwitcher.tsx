/* ContextSwitcher — design/Observe.dc.html lines 168-208.
   The active-context selector, relocated from the title bar into the query
   toolbar (control row) per the design refresh. o3 keeps a single global
   active context (shared with the CLI config), so the "this query" framing is
   presentational; switching still changes the app-wide context. */
import styles from './ContextSwitcher.module.css';
import type { ReactElement } from 'react';

export interface ContextSwitcherItem {
  name: string;
  url: string;
  color: string;
  isCurrent: boolean;
}

interface ContextSwitcherProps {
  contexts: ContextSwitcherItem[];
  currentName: string;
  open: boolean;
  onToggle: () => void;
  onSwitch: (name: string) => void;
  onAddContext: () => void;
  onManage: () => void;
}

export function ContextSwitcher({
  contexts,
  currentName,
  open,
  onToggle,
  onSwitch,
  onAddContext,
  onManage,
}: ContextSwitcherProps): ReactElement {
  const current = contexts.find((c) => c.name === currentName) ?? contexts[0];

  return (
    <div className={styles.wrap}>
      {/* Pill button — design lines 170-175 */}
      <button className={styles.btn} onClick={onToggle} title="Context for this query — click to switch">
        <span className={styles.label}>ctx</span>
        {current && (
          <span
            className={styles.dot}
            style={{ background: current.color, boxShadow: `0 0 7px -1px ${current.color}` }}
          />
        )}
        <span className={styles.name}>{current?.name ?? '—'}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--tx-09)" strokeWidth="2.4">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          {/* Click-away backdrop — design line 177 */}
          <div className={styles.backdrop} onClick={onToggle} />

          {/* Dropdown — design lines 178-208 */}
          <div className={styles.dropdown}>
            <div className={styles.header}>
              <span className={styles.headerTitle}>Context · This Tab</span>
              <span className={styles.headerCount}>{contexts.length} configured</span>
            </div>

            <div className={styles.list}>
              {contexts.map((c) => (
                <div
                  key={c.name}
                  className={`${styles.row} ${c.isCurrent ? styles.rowActive : ''}`}
                  onClick={() => onSwitch(c.name)}
                >
                  <span
                    className={styles.rowDot}
                    style={{ background: c.color, boxShadow: `0 0 6px -1px ${c.color}` }}
                  />
                  <div className={styles.rowBody}>
                    <div className={styles.rowName}>{c.name}</div>
                    {c.url && <div className={styles.rowSub}>{c.url}</div>}
                  </div>
                  {c.isCurrent && <span className={styles.checkmark}>✓</span>}
                </div>
              ))}
            </div>

            <div className={styles.footer}>
              <button className={styles.addBtn} onClick={onAddContext}>+ Add context</button>
              <button className={styles.manageBtn} onClick={onManage}>Manage&hellip;</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
