/* TimeRangePicker — design/Observe.dc.html lines 114–150 */
import type { ReactElement } from 'react';
import styles from './TimeRangePicker.module.css';
import type { TimeTab } from '../types';

/* Relative-unit buttons — design line 1125: s→sec, m→min, h→hr, d→day, w→wk */
const REL_UNITS: { label: string; value: string }[] = [
  { label: 'sec', value: 's' },
  { label: 'min', value: 'm' },
  { label: 'hr',  value: 'h' },
  { label: 'day', value: 'd' },
  { label: 'wk',  value: 'w' },
];

export interface TimeRangePickerProps {
  open: boolean;
  tab: TimeTab;
  quickRanges: { label: string }[];
  relAmount: string;
  relUnit: string;
  absFrom: string;
  absTo: string;
  onPickQuick: (label: string) => void;
  onSetTab: (t: TimeTab) => void;
  onRelAmount: (v: string) => void;
  onRelUnit: (u: string) => void;
  onApplyRelative: () => void;
  onAbsFrom: (v: string) => void;
  onAbsTo: (v: string) => void;
  onApplyAbsolute: () => void;
}

export function TimeRangePicker(props: TimeRangePickerProps): ReactElement | null {
  const {
    open,
    tab,
    quickRanges,
    relAmount,
    relUnit,
    absFrom,
    absTo,
    onPickQuick,
    onSetTab,
    onRelAmount,
    onRelUnit,
    onApplyRelative,
    onAbsFrom,
    onAbsTo,
    onApplyAbsolute,
  } = props;

  if (!open) return null;

  return (
    /* design line 114 — popover container */
    <div className={styles.popover}>

      {/* design line 115 — quick-ranges left column */}
      <div className={`oo-scroll ${styles.quickCol}`}>
        {/* design line 116 — section label */}
        <div className={styles.quickLabel}>Quick ranges</div>

        {/* design lines 117–119 — quick range items */}
        {quickRanges.map((q) => (
          <div
            key={q.label}
            className={styles.quickItem}
            onClick={() => onPickQuick(q.label)}
          >
            {q.label}
          </div>
        ))}
      </div>

      {/* design line 121 — right pane */}
      <div className={styles.rightPane}>

        {/* design lines 122–125 — Relative/Absolute segmented tabs */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${tab === 'relative' ? styles.tabActive : ''}`}
            onClick={() => onSetTab('relative')}
          >
            Relative
          </button>
          <button
            className={`${styles.tabBtn} ${tab === 'absolute' ? styles.tabActive : ''}`}
            onClick={() => onSetTab('absolute')}
          >
            Absolute
          </button>
        </div>

        {/* design lines 126–137 — relative pane */}
        {tab === 'relative' && (
          <div>
            {/* design line 128 — "Last…" label */}
            <div className={styles.paneLabel}>Last&hellip;</div>

            {/* design lines 129–133 — amount input + unit buttons row */}
            <div className={styles.relRow}>
              <input
                className={styles.amountInput}
                value={relAmount}
                onChange={(e) => onRelAmount(e.target.value)}
                inputMode="numeric"
              />
              <div className={styles.unitBar}>
                {REL_UNITS.map((u) => (
                  <button
                    key={u.value}
                    className={`${styles.unitBtn} ${relUnit === u.value ? styles.unitActive : ''}`}
                    onClick={() => onRelUnit(u.value)}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </div>

            {/* design line 135 — Apply button */}
            <button className={styles.applyBtn} onClick={onApplyRelative}>
              Apply
            </button>
          </div>
        )}

        {/* design lines 138–147 — absolute pane */}
        {tab === 'absolute' && (
          <div>
            {/* design line 140 — From label */}
            <div className={`${styles.paneLabel} ${styles.paneLabelAbs}`}>From</div>

            {/* design line 141 — From input */}
            <input
              className={styles.absInput}
              value={absFrom}
              onChange={(e) => onAbsFrom(e.target.value)}
              spellCheck={false}
            />

            {/* design line 142 — To label */}
            <div className={`${styles.paneLabel} ${styles.paneLabelAbs}`}>To</div>

            {/* design line 143 — To input */}
            <input
              className={`${styles.absInput} ${styles.absInputTo}`}
              value={absTo}
              onChange={(e) => onAbsTo(e.target.value)}
              spellCheck={false}
            />

            {/* design line 144 — format hint */}
            <div className={styles.absHint}>
              YYYY-MM-DD HH:mm:ss &middot; Asia/Shanghai
            </div>

            {/* design line 145 — Apply button */}
            <button className={styles.applyBtn} onClick={onApplyAbsolute}>
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
