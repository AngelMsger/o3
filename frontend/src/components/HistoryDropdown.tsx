import type { ReactElement } from 'react';
import type { HistoryItem } from '../types';
import styles from './HistoryDropdown.module.css';

export interface HistoryDropdownProps {
  open: boolean;
  items: HistoryItem[];
  onPick: (item: HistoryItem) => void;
  onClose: () => void;
}

export function HistoryDropdown({ open, items, onPick, onClose }: HistoryDropdownProps): ReactElement | null {
  if (!open) return null;
  return (
    <>
      {/* click-away backdrop — design line 181 */}
      <div className={styles.backdrop} onClick={onClose} />
      {/* panel — design lines 182–203 */}
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Recent queries</span>
          <span className={styles.count}>{items.length} saved</span>
        </div>
        <div className={`oo-scroll ${styles.list}`}>
          {items.map((h, i) => (
            <div
              key={i}
              className={styles.row}
              onClick={() => onPick(h)}
            >
              <div className={styles.rowTop}>
                <span className={styles.preview}>{h.preview}</span>
                <span className={styles.ago}>{h.ago}</span>
              </div>
              <div className={styles.rowMeta}>
                <span className={styles.stream}>{h.stream}</span>
                <span className={styles.dot}>·</span>
                <span>{h.meta}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
