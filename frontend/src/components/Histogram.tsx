import { useMemo } from 'react';
import type { ReactElement } from 'react';
import styles from './Histogram.module.css';
import type { HistoBucket } from '../types';
import { EChart } from './charts/EChart';
import { buildHistogramOption } from './charts/buildHistogramOption';

interface HistogramProps {
  accent: string;
  bars: HistoBucket[];
}

export function Histogram({ accent, bars }: HistogramProps): ReactElement {
  const peak = bars.reduce((m, b) => Math.max(m, b.c), 0);
  // Recompute the option only when data or accent changes so the chart re-themes live.
  const option = useMemo(() => buildHistogramOption(bars, accent), [bars, accent]);

  return (
    <div className={styles.histogram}>
      {/* Header row — design lines 295-300 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.labelTitle}>Event Volume</span>
          <span className={styles.labelBuckets}>30s buckets</span>
        </div>
        <span className={styles.labelPeak}>
          peak <b className={styles.peakNum}>{peak.toLocaleString()}</b>
        </span>
      </div>

      {/* Bars + axis are now drawn by ECharts (tooltip, auto-thinned labels). */}
      <EChart option={option} className={styles.chart} />
    </div>
  );
}
