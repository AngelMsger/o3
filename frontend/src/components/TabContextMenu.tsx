/* TabContextMenu — right-click menu for query tabs (design Observe.dc.html tab
   context menu). Renders the pure buildTabMenu() items with separators and
   greyed-out disabled entries; a full-screen backdrop dismisses it. */
import type { ReactElement } from 'react';
import { buildTabMenu } from '../lib/tabMenu';
import type { TabMenuAction } from '../lib/tabMenu';
import styles from './TabContextMenu.module.css';

interface TabContextMenuProps {
  count: number;
  index: number;
  x: number;
  y: number;
  visible: boolean;
  onPick: (action: TabMenuAction) => void;
  onClose: () => void;
}

export function TabContextMenu({ count, index, x, y, visible, onPick, onClose }: TabContextMenuProps): ReactElement {
  const entries = buildTabMenu(count, index);
  return (
    <>
      <div className={styles.backdrop} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className={`${styles.menu} ${visible ? styles.shown : styles.hidden}`}
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {entries.map((it, i) =>
          it === 'sep' ? (
            <div key={`sep-${i}`} className={styles.sep} />
          ) : (
            <div
              key={it.action}
              className={`${styles.item} ${it.enabled ? '' : styles.disabled}`}
              onClick={() => { if (it.enabled) { onPick(it.action); onClose(); } }}
            >
              {it.label}
            </div>
          ),
        )}
      </div>
    </>
  );
}
