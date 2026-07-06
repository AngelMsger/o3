import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

// EChart is the reusable Apache ECharts (https://echarts.apache.org/) wrapper that
// every visualization in o3 builds on. It owns init / resize / dispose so callers
// only supply a declarative `option`. Future viz (Metrics, Dashboards) reuse it.
//
// Note: we import the full `echarts` bundle for simplicity. If bundle size becomes a
// concern, switch to `echarts/core` + explicit chart/component registration.
export interface EChartProps {
  option: EChartsOption;
  className?: string;
  style?: CSSProperties;
  // onEvents maps ECharts event names (e.g. 'click', 'datazoom') to handlers.
  // Memoize the object on the caller side; it is rebound whenever its identity changes.
  onEvents?: Record<string, (params: unknown) => void>;
  // onReady is called once with the chart instance right after init, for callers that
  // need imperative actions (e.g. dispatchAction for brushing). Keep it stable.
  onReady?: (chart: ReturnType<typeof echarts.init>) => void;
}

export function EChart({ option, className, style, onEvents, onReady }: EChartProps): ReactElement {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  // Init once; keep the instance sized to its container; dispose on unmount.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    onReady?.(chart);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Apply the option whenever it changes. notMerge clears removed series/axes so a
  // shape change (e.g. fewer series) doesn't leave stale geometry behind.
  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  // (Re)bind event handlers when the handler map identity changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return;
    const entries = Object.entries(onEvents);
    entries.forEach(([evt, handler]) => chart.on(evt, handler));
    return () => entries.forEach(([evt, handler]) => chart.off(evt, handler));
  }, [onEvents]);

  return <div ref={elRef} className={className} style={style} />;
}
