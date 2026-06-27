import { useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import styles from './MetricsView.module.css';
import { SqlEditor } from '../SqlEditor';
import type { SqlEditorHandle } from '../SqlEditor';
import { EChart } from '../charts/EChart';
import { buildMetricsOption } from '../charts/buildMetricsOption';
import type { MetricSeries } from '../charts/buildMetricsOption';
import { RunMetricsQuery } from '../../../wailsjs/go/main/App';

// Quick relative ranges for the metrics window (self-contained; the Logs time
// picker is SQL-specific). ms = window length back from now.
const RANGES: { label: string; ms: number }[] = [
  { label: '5m', ms: 5 * 60_000 },
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '6h', ms: 6 * 60 * 60_000 },
  { label: '24h', ms: 24 * 60 * 60_000 },
];

// parseAppError mirrors App.tsx: unpack the structured apperr JSON, else show the
// raw message.
function parseAppError(e: unknown): string {
  const raw = typeof e === 'string' ? e : ((e as any)?.message ?? String(e));
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && 'message' in o) return o.message ?? raw;
  } catch {
    /* not JSON */
  }
  return raw;
}

export function MetricsView({ accent }: { accent: string }): ReactElement {
  const editorRef = useRef<SqlEditorHandle>(null);
  const [promql, setPromql] = useState('');
  const [rangeMs, setRangeMs] = useState(RANGES[2].ms);
  const [series, setSeries] = useState<MetricSeries[]>([]);
  const [step, setStep] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  const run = async () => {
    if (!promql.trim()) return;
    setLoading(true);
    setError(null);
    const now = Date.now() * 1000; // micros
    const start = Math.round(now - rangeMs * 1000);
    try {
      const res = await RunMetricsQuery({ promql, startMicros: start, endMicros: Math.round(now) } as any);
      setSeries((res.series ?? []) as unknown as MetricSeries[]);
      setStep(res.step ?? '');
      setRan(true);
    } catch (e) {
      setError(parseAppError(e));
      setSeries([]);
      setRan(true);
    } finally {
      setLoading(false);
    }
  };

  const option = useMemo(() => buildMetricsOption(series, accent), [series, accent]);

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>Metrics</h2>
          <span className={styles.sub}>PromQL range query</span>
          <span style={{ flex: 1 }} />
          <div className={styles.rangeSeg}>
            {RANGES.map((r) => (
              <button
                key={r.label}
                className={styles.rangePill}
                style={rangeMs === r.ms ? { background: accent, color: '#06181a', fontWeight: 700 } : undefined}
                onClick={() => setRangeMs(r.ms)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className={styles.runBtn} style={{ background: accent }} onClick={run}>
            {loading ? 'Running' : 'Run'}
          </button>
        </div>

        <div className={styles.editorWrap}>
          <SqlEditor ref={editorRef} value={promql} mode="search" fields={[]} accent={accent} onChange={setPromql} onRun={run} />
        </div>

        <div className={styles.hintRow}>
          <span><b className={styles.hintKey}>⌘↵</b> run</span>
          <span className={styles.example}>
            e.g. <code>sum by (service)(rate(http_requests_total[5m]))</code>
          </span>
          <span style={{ flex: 1 }} />
          {step && <span className={styles.stepNote}>step {step}</span>}
        </div>
      </div>

      <div className={styles.chartArea}>
        {loading ? (
          <div className={styles.state}>
            <div className={styles.spinner} />
            <span>Running query...</span>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <strong>{error}</strong>
          </div>
        ) : !ran ? (
          <div className={styles.state}>Enter a PromQL query and Run.</div>
        ) : series.length === 0 ? (
          <div className={styles.state}>No series for this query and range.</div>
        ) : (
          <EChart option={option} className={styles.chart} />
        )}
      </div>
    </div>
  );
}
