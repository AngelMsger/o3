import type { ReactElement } from 'react';
import styles from './Histogram.module.css';
import { histogramBars, hexA } from '../lib/format';

// X-axis labels — design script line 908
const AXIS_LABELS = ['13:44', '13:46', '13:48', '13:50', '13:52', '13:54', '13:56', '13:58'];

// Accent color — design line 916: var(--accent, #2dd4bf)
const ACCENT = '#2dd4bf';

interface HistogramProps {
  show: boolean;
}

export function Histogram({ show }: HistogramProps): ReactElement | null {
  if (!show) return null;

  const bars = histogramBars();

  return (
    <div className={styles.histogram}>
      {/* Header row — design lines 295-300 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.labelTitle}>Event volume</span>
          <span className={styles.labelBuckets}>30s buckets</span>
        </div>
        <span className={styles.labelPeak}>
          peak <b className={styles.peakNum}>7,323</b>
        </span>
      </div>

      {/* Bar chart — design script lines 909-923 */}
      <div className={styles.bars}>
        {bars.map((bar, i) => (
          <div
            key={i}
            className={styles.bar}
            title={`${Math.round(bar.h * 7323)} events`}
            style={{
              height: `${bar.h * 100}%`,
              background: `linear-gradient(180deg, ${ACCENT}, ${hexA(ACCENT, 0.32)})`,
            }}
          />
        ))}
      </div>

      {/* X-axis labels — design script lines 921-922 */}
      <div className={styles.axis}>
        {AXIS_LABELS.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
