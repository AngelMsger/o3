/* ValueActionMenu — design/Observe.dc.html lines 634–651 */
import type { ReactElement } from 'react';
import styles from './ValueActionMenu.module.css';

interface ValueActionMenuProps {
  visible: boolean;
  field: string;
  value: string;
  x: number;
  y: number;
  items: { icon: string; label: string }[];
  onPick: (label: string) => void;
  onClose: () => void;
}

export function ValueActionMenu({
  visible,
  field,
  value,
  x,
  y,
  items,
  onPick,
  onClose,
}: ValueActionMenuProps): ReactElement {
  return (
    <>
      {/* Fixed full-screen backdrop — design line 636 */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Positioned menu panel — design line 637 */}
      <div
        className={`${styles.menu} ${visible ? styles.menuShown : styles.menuHidden}`}
        style={{ left: x, top: y }}
      >
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
