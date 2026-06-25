/* ValueActionMenu — design/Observe.dc.html lines 634–651 */
import type { ReactElement } from 'react';
import styles from './ValueActionMenu.module.css';

interface ValueActionMenuProps {
  open: boolean;
  field: string;
  value: string;
  x: number;
  y: number;
  items: { icon: string; label: string }[];
  onPick: (label: string) => void;
  onClose: () => void;
}

export function ValueActionMenu({
  open,
  field,
  value,
  x,
  y,
  items,
  onPick,
  onClose,
}: ValueActionMenuProps): ReactElement | null {
  if (!open) return null;

  return (
    <>
      {/* Fixed full-screen backdrop — design line 636 */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Positioned menu panel — design line 637 */}
      <div className={styles.menu} style={{ left: x, top: y }}>
        {/* Header — design line 638 */}
        <div className={styles.header}>
          <div className={styles.field}>{field}</div>
          <div className={styles.value}>{value}</div>
        </div>

        {/* Action items — design lines 642–648 */}
        <div className={styles.items}>
          {items.map((m) => (
            <div
              key={m.label}
              className={styles.item}
              onClick={() => onPick(m.label)}
            >
              <span className={styles.icon}>{m.icon}</span>
              <span className={styles.label}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
