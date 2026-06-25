/* QueryTabs — design/Observe.dc.html lines 77–91 */
import styles from './QueryTabs.module.css';
import { STREAMS } from '../data/mock';
import type { QueryTab } from '../types';
import type { ReactElement } from 'react';

// Build stream-name → color lookup from STREAMS array
const STREAM_COLORS: Record<string, string> = Object.fromEntries(
  STREAMS.map(s => [s.name, s.color])
);

export function QueryTabs({ tabs, activeId, onPick, onNew, onClose }: {
  tabs: QueryTab[];
  activeId: string;
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
}): ReactElement {
  const closable = tabs.length > 1;
  return (
    /* design line 78 — saved-query tabs container */
    <div className={`${styles.strip} oo-scroll`}>
      {tabs.map((t): ReactElement => {
        const color = STREAM_COLORS[t.stream] ?? '#5b6371';
        const active = activeId === t.id;
        return (
          /* design line 80 — individual tab */
          <div
            key={t.id}
            className={`${styles.tab} ${active ? styles.active : ''}`}
            onClick={() => onPick(t.id)}
            onDoubleClick={() => {/* rename deferred in M1 */}}
            title={`stream: ${t.stream} — double-click to rename`}
          >
            {/* design line 81 — stream color dot */}
            <span
              className={styles.dot}
              style={{ background: color, boxShadow: `0 0 6px -1px ${color}` }}
            />
            {/* design lines 85-87 — tab name (static, editing deferred) */}
            <span className={styles.name}>{t.name}</span>
            {/* close affordance (added beyond the static design); hidden when only one tab */}
            {closable && (
              <button
                className={styles.close}
                title="Close query"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {/* design line 90 — new tab button */}
      <button
        className={styles.newBtn}
        onClick={onNew}
        title="New query"
      >+</button>
    </div>
  );
}
