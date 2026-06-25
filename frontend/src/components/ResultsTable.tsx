import type { ReactElement } from 'react';
import type { LogRow, Density } from '../types';
import { hexA } from '../lib/format';
import styles from './ResultsTable.module.css';

// Level → color map — design line 750
// this.LEVELC = { info:'#5b9dff', warn:'#f5b340', error:'#f4685f', debug:'#7c8696', trace:'#b58bff' }
const LEVEL_COLOR: Record<string, string> = {
  info:  '#5b9dff',
  warn:  '#f5b340',
  error: '#f4685f',
  debug: '#7c8696',
  trace: '#b58bff',
};

const ACCENT = '#2dd4bf';

interface ResultsTableProps {
  rows: LogRow[];
  selectedId: string | null;
  density: Density;
  onSelectRow: (id: string) => void;
  onLevelCtx: (field: string, value: string, e: React.MouseEvent) => void;
  onServiceCtx: (field: string, value: string, e: React.MouseEvent) => void;
}

export function ResultsTable({
  rows,
  selectedId,
  density,
  onSelectRow,
  onLevelCtx,
  onServiceCtx,
}: ResultsTableProps): ReactElement {
  // Row padding — design lines 1052–1053:
  // const dense = (st.density || 'ultra') === 'ultra';
  // const rowPad = dense ? '4px 16px' : '7px 16px';
  const dense = density === 'ultra';
  const rowPadding = dense ? '4px 16px' : '7px 16px';

  return (
    <>
      {/* Column header — design lines 324–331 */}
      <div className={styles.colHeader}>
        <span className={styles.colChevron} />
        <span className={styles.colTime}>timestamp</span>
        <span className={styles.colLevel}>level</span>
        <span className={styles.colService}>service</span>
        <span className={styles.colMessage}>message</span>
      </div>

      {/* Rows — design lines 333–346; oo-scroll wrapper design line 334 */}
      <div className={`oo-scroll ${styles.rows}`}>
        {rows.map((row) => {
          const isSel = selectedId === row.id;
          const c = LEVEL_COLOR[row.level] ?? '#7c8696';
          // rowStyle — design line 1157
          const rowBg = isSel ? hexA(ACCENT, 0.07) : 'transparent';
          // levelStyle — design line 1158
          const levelStyle: React.CSSProperties = {
            display: 'inline-block',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.4px',
            padding: '1px 6px',
            borderRadius: '4px',
            cursor: 'pointer',
            background: hexA(c, 0.15),
            color: c,
          };

          return (
            <div key={row.id} className={styles.rowWrapper}>
              <div
                className={styles.row}
                style={{ padding: rowPadding, background: rowBg }}
                onClick={() => onSelectRow(row.id)}
              >
                {/* Chevron — design line 338: ▾ when selected, ▸ otherwise */}
                <span className={styles.chevron}>
                  {isSel ? '▾' : '▸'}
                </span>

                {/* Timestamp — design line 339 */}
                <span className={styles.time}>{row.time}</span>

                {/* Level badge — design line 340 */}
                <span className={styles.levelCell}>
                  <span
                    style={levelStyle}
                    className={styles.levelBadge}
                    onClick={(e) => {
                      e.stopPropagation();
                      onLevelCtx('severity', row.level, e);
                    }}
                  >
                    {row.level}
                  </span>
                </span>

                {/* Service — design line 341 */}
                <span className={styles.serviceCell}>
                  <span
                    className={styles.service}
                    onClick={(e) => {
                      e.stopPropagation();
                      onServiceCtx('service_name', row.service, e);
                    }}
                  >
                    {row.service}
                  </span>
                </span>

                {/* Message — design line 342 */}
                <span className={styles.message}>{row.body}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
