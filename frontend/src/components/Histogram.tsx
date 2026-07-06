import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import type { EChartsType } from 'echarts';
import styles from './Histogram.module.css';
import type { HistoBucket } from '../types';
import { hexA } from '../lib/format';
import { EChart } from './charts/EChart';
import { buildHistogramOption } from './charts/buildHistogramOption';

interface HistogramProps {
  accent: string;
  bars: HistoBucket[];
  // onBrushRange fires when the user drags a selection across bars, with the inclusive
  // bucket index range [lo, hi]. The parent maps it to a sub-window and narrows results.
  onBrushRange?: (lo: number, hi: number) => void;
  // selRange highlights the drilled-down buckets with a persistent dashed band.
  selRange?: { lo: number; hi: number };
  // selectionLabel, when set, renders the removable secondary-filter tag in the header.
  selectionLabel?: string | null;
  onClearSelection?: () => void;
}

export function Histogram({
  accent,
  bars,
  onBrushRange,
  selRange,
  selectionLabel,
  onClearSelection,
}: HistogramProps): ReactElement {
  const peak = bars.reduce((m, b) => Math.max(m, b.c), 0);
  // Recompute the option only when data or accent changes so the chart re-themes live.
  const option = useMemo(() => buildHistogramOption(bars, accent), [bars, accent]);

  const chartRef = useRef<EChartsType | null>(null);

  // Activate lineX brushing persistently (no toolbox button) so any drag over the bars
  // starts a selection. Re-applied on every option change since notMerge resets it.
  const enableBrush = useCallback(() => {
    chartRef.current?.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: { brushType: 'lineX', brushMode: 'single' },
    });
  }, []);

  const onReady = useCallback(
    (chart: EChartsType) => {
      chartRef.current = chart;
      enableBrush();
    },
    [enableBrush],
  );

  // EChart applies the new option first (child effect), then this re-arms brushing —
  // keeping drag active across data refreshes and accent changes.
  useEffect(() => {
    enableBrush();
  }, [option, enableBrush]);

  const onEvents = useMemo(
    () => ({
      brushEnd: (params: unknown) => {
        const areas = (params as { areas?: Array<{ coordRange?: number[] }> }).areas;
        const range = areas?.[0]?.coordRange;
        if (!range || range.length < 2 || !onBrushRange) return;
        let lo = Math.round(range[0]);
        let hi = Math.round(range[1]);
        if (hi < lo) [lo, hi] = [hi, lo];
        lo = Math.max(0, lo);
        hi = Math.min(bars.length - 1, hi);
        if (hi < lo) return;
        onBrushRange(lo, hi);
        // Clear the transient drag overlay; the persistent band comes from selRange.
        chartRef.current?.dispatchAction({ type: 'brush', areas: [] });
      },
    }),
    [bars.length, onBrushRange],
  );

  // Persistent selection band over the drilled buckets. Positioned by index percentage
  // to align with the full-width grid (design lines 1189/1231).
  const band =
    selRange && bars.length > 0 ? (
      <div
        className={styles.selBand}
        style={{
          left: `${(selRange.lo / bars.length) * 100}%`,
          width: `${((selRange.hi - selRange.lo + 1) / bars.length) * 100}%`,
          borderLeft: `1px dashed ${hexA(accent, 0.5)}`,
          borderRight: `1px dashed ${hexA(accent, 0.5)}`,
          background: hexA(accent, 0.06),
        }}
      />
    ) : null;

  return (
    <div className={styles.histogram}>
      {/* Header row — design lines 390-404 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.labelTitle}>Event Volume</span>
          <span className={styles.labelBuckets}>30s buckets</span>
        </div>
        <div className={styles.headerRight}>
          {/* Secondary-filter tag — design lines 396-401. Removable; accent-tinted. */}
          {selectionLabel && (
            <div
              className={styles.selTag}
              style={{ background: hexA(accent, 0.12), borderColor: hexA(accent, 0.3) }}
            >
              <span className={styles.selTagLabel} style={{ color: accent }}>
                {selectionLabel}
              </span>
              <button
                type="button"
                className={styles.selTagClear}
                style={{ color: accent }}
                title="Clear selection"
                onClick={onClearSelection}
              >
                ✕
              </button>
            </div>
          )}
          <span className={styles.labelPeak}>
            peak <b className={styles.peakNum}>{peak.toLocaleString()}</b>
          </span>
        </div>
      </div>

      {/* Bars + axis drawn by ECharts (tooltip, auto-thinned labels, lineX brush); the
          dashed band overlays the drilled selection. */}
      <div className={styles.chartWrap}>
        <EChart option={option} className={styles.chart} onEvents={onEvents} onReady={onReady} />
        {band}
      </div>

      {/* Footer hint — design line 1226. */}
      <div className={styles.hint}>↔ Drag across bars to filter the time range</div>
    </div>
  );
}
