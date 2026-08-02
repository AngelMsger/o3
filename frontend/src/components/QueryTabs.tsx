/* QueryTabs — design/Observe.dc.html lines 77–91 */
import { useState, useRef, useEffect } from 'react';
import styles from './QueryTabs.module.css';
import { STREAMS } from '../data/mock';
import type { QueryTab } from '../types';
import type { ReactElement, MouseEvent } from 'react';

// Build stream-name -> color lookup from STREAMS array
const STREAM_COLORS: Record<string, string> = Object.fromEntries(
  STREAMS.map(s => [s.name, s.color])
);

export function QueryTabs({ tabs, activeId, editingId, onEditing, onPick, onNew, onClose, onRename, onContextMenu }: {
  tabs: QueryTab[];
  activeId: string;
  // Which tab is being renamed inline. Lifted out of this component because the
  // right-click menu's "Rename Tab" has to start the same edit from outside it.
  editingId: string | null;
  onEditing: (id: string | null) => void;
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu?: (id: string, e: MouseEvent) => void;
}): ReactElement {
  const closable = tabs.length > 1;
  const [draft, setDraft] = useState<string>('');
  // committingRef prevents the double-commit that occurs when Enter clears
  // editingId (unmounting the input) and the resulting blur fires commit again.
  const committingRef = useRef(false);

  // Seed the draft whenever an edit starts, wherever it started from — a
  // double-click on the tab or "Rename Tab" in the right-click menu.
  useEffect(() => {
    if (editingId) setDraft(tabs.find((t) => t.id === editingId)?.name ?? '');
    // Only on the identity of the tab being renamed: re-seeding on every `tabs`
    // change would overwrite what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const commit = (id: string, fallback: string) => {
    const name = draft.trim() || fallback;
    onRename(id, name);
    onEditing(null);
  };

  return (
    /* design line 78 — saved-query tabs container */
    <div className={`${styles.strip} oo-scroll`}>
      {tabs.map((t): ReactElement => {
        const color = STREAM_COLORS[t.stream] ?? 'var(--tx-10)';
        const active = activeId === t.id;
        return (
          /* design line 80 — individual tab */
          <div
            key={t.id}
            className={`${styles.tab} ${active ? styles.active : ''}`}
            onClick={() => onPick(t.id)}
            onDoubleClick={() => onEditing(t.id)}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(t.id, e); }}
            title={`stream: ${t.stream} — double-click or right-click to rename`}
          >
            {/* design line 81 — stream color dot */}
            <span
              className={styles.dot}
              style={{ background: color, boxShadow: `0 0 6px -1px ${color}` }}
            />
            {/* design lines 85-87 — tab name (inline rename on double-click) */}
            {editingId === t.id ? (
              <input
                className={styles.nameEdit}
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); committingRef.current = true; commit(t.id, t.name); }
                  else if (e.key === 'Escape') { e.preventDefault(); committingRef.current = true; onEditing(null); }
                }}
                onBlur={() => {
                  if (committingRef.current) { committingRef.current = false; return; }
                  commit(t.id, t.name);
                }}
              />
            ) : (
              <span className={styles.name}>{t.name}</span>
            )}
            {/* close affordance (added beyond the static design); hidden when only one tab */}
            {closable && (
              <button
                className={styles.close}
                title="Close Query"
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
        title="New Query"
      >+</button>
    </div>
  );
}
