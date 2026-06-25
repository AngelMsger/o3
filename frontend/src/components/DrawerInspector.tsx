import type { ReactElement } from 'react';
import type { LogRow } from '../types';
import { hexA } from '../lib/format';
import styles from './DrawerInspector.module.css';

// Level → color map — design line 750
const LEVEL_COLOR: Record<string, string> = {
  info:  '#5b9dff',
  warn:  '#f5b340',
  error: '#f4685f',
  debug: '#7c8696',
  trace: '#b58bff',
};

// kv kind → color — design line 927: { str: '#a3e08c', num: '#f6c177' }
const KIND_COLOR: Record<'str' | 'num', string> = {
  str: '#a3e08c',
  num: '#f6c177',
};

interface DrawerInspectorProps {
  row: LogRow;
  onClose: () => void;
  onKvCtx: (field: string, value: string, e: React.MouseEvent) => void;
}

export function DrawerInspector({ row, onClose, onKvCtx }: DrawerInspectorProps): ReactElement {
  // drawerLevelStyle — design line 1168
  const dc = LEVEL_COLOR[row.level] ?? '#7c8696';
  const levelStyle: React.CSSProperties = {
    display: 'inline-block',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.4px',
    padding: '2px 7px',
    borderRadius: '4px',
    background: hexA(dc, 0.15),
    color: dc,
  };

  return (
    /* drawer — design lines 351–373 */
    <div className={styles.drawer}>
      {/* header — design line 352 */}
      <div className={styles.header}>
        <span style={levelStyle}>{row.level}</span>
        <span className={styles.title}>Log record</span>
        <span className={styles.spacer} />
        <button className={styles.copyBtn}>⧉ copy</button>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* timestamp — design line 359 */}
      <div className={styles.timestamp}>{row.time} · Asia/Shanghai</div>

      {/* scrollable kv body — design line 360: oo-scroll */}
      <div className={`oo-scroll ${styles.body}`}>
        <div className={styles.json}>
          <span className={styles.brace}>{'{'}</span>
          {row.json.map((kv) => (
            <div
              key={kv.k}
              className={styles.kvRow}
              onClick={(e) => onKvCtx(kv.k, kv.v, e)}
            >
              <span className={styles.kvKey}>{kv.k}</span>
              <span className={styles.kvColon}>:</span>
              <span style={{ color: KIND_COLOR[kv.kind], minWidth: 0, wordBreak: 'break-all' }}>
                {kv.v}
              </span>
            </div>
          ))}
          <span className={styles.brace}>{'}'}</span>
        </div>
      </div>
    </div>
  );
}
