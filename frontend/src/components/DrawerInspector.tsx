import type { ReactElement } from 'react';
import type { LogRow } from '../types';
import { hexA } from '../lib/format';
import { copyText } from '../lib/clipboard';
import styles from './DrawerInspector.module.css';

// Level → color map — design line 750
const LEVEL_COLOR: Record<string, string> = {
  info:  '#5b9dff',
  warn:  '#f5b340',
  error: '#f4685f',
  debug: '#7c8696',
  trace: '#b58bff',
};

// kv kind → color — design line 927: { str: '#a3e08c', num: '#f6c177' } via --sy-* tokens
// 'lvl' uses the row-level color (resolved at render time via LEVEL_COLOR)
const KIND_COLOR: Record<'str' | 'num', string> = {
  str: 'var(--sy-str)',
  num: 'var(--sy-num)',
};

interface DrawerInspectorProps {
  row: LogRow;
  /** drives the open/close transition (width + slide + fade) */
  visible: boolean;
  onClose: () => void;
  onKvCtx: (field: string, value: string, e: React.MouseEvent) => void;
}

export function DrawerInspector({ row, visible, onClose, onKvCtx }: DrawerInspectorProps): ReactElement {
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
    /* drawer — design lines 351–373.
       Outer wrapper animates width (eases the workspace reflow); inner holds the
       fixed-width content and slides/fades. Driven by `visible`. */
    <div className={`${styles.drawer} ${visible ? styles.open : styles.closed}`}>
      <div className={styles.inner}>
        {/* header — design line 352 */}
        <div className={styles.header}>
          <span style={levelStyle}>{row.level}</span>
          <span className={styles.title}>Log record</span>
          <span className={styles.spacer} />
          <button
            className={styles.copyBtn}
            title="Copy this record as JSON"
            onClick={() => copyText(JSON.stringify(Object.fromEntries(row.json.map((kv) => [kv.k, kv.v])), null, 2))}
          >
            ⧉ copy
          </button>
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
                <span style={{ color: kv.kind === 'lvl' ? (LEVEL_COLOR[row.level] ?? '#7c8696') : KIND_COLOR[kv.kind], minWidth: 0, wordBreak: 'break-all' }}>
                  {kv.v}
                </span>
              </div>
            ))}
            <span className={styles.brace}>{'}'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
