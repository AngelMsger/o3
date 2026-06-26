import type { ReactElement } from 'react';
import styles from './Histogram.module.css';
import { hexA } from '../lib/format';
import type { HistoBucket } from '../types';

// formatBucketTime renders an OpenObserve histogram bucket key (an ISO-ish
// timestamp string, or epoch micros as a numeric string) as HH:mm in local
// time. Unparseable values render verbatim.
function formatBucketTime(t: string): string {
  let d = new Date(t);
  if (isNaN(d.getTime())) {
    const n = Number(t);
    if (!isNaN(n)) d = new Date(n / 1000); // micros -> ms
  }
  if (isNaN(d.getTime())) return t;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// axisLabels picks up to `count` evenly-spaced bucket times for the x-axis.
function axisLabels(bars: HistoBucket[], count = 8): string[] {
  if (bars.length === 0) return [];
  if (bars.length <= count) return bars.map((b) => formatBucketTime(b.t));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (bars.length - 1)) / (count - 1));
    out.push(formatBucketTime(bars[idx].t));
  }
  return out;
}

interface HistogramProps {
  accent: string;
  bars: HistoBucket[];
}

export function Histogram({ accent, bars }: HistogramProps): ReactElement {
  const peak = bars.reduce((m, b) => Math.max(m, b.c), 0);
  const labels = axisLabels(bars);

  return (
    <div className={styles.histogram}>
      {/* Header row — design lines 295-300 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.labelTitle}>Event volume</span>
          <span className={styles.labelBuckets}>30s buckets</span>
        </div>
        <span className={styles.labelPeak}>
          peak <b className={styles.peakNum}>{peak.toLocaleString()}</b>
        </span>
      </div>

      {/* Bar chart — design script lines 909-923 */}
      <div className={styles.bars}>
        {bars.map((bar, i) => (
          <div
            key={i}
            className={styles.bar}
            title={`${bar.c.toLocaleString()} events`}
            style={{
              height: `${bar.h * 100}%`,
              background: `linear-gradient(180deg, ${accent}, ${hexA(accent, 0.32)})`,
            }}
          />
        ))}
      </div>

      {/* X-axis labels — design script lines 921-922 */}
      <div className={styles.axis}>
        {labels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
