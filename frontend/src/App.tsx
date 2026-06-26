import { useEffect, useRef, useState } from 'react';
import { useDelayedUnmount } from './lib/useDelayedUnmount';
import styles from './App.module.css';
import { TitleBar } from './components/TitleBar';
import { NavRail } from './components/NavRail';
import { QueryTabs } from './components/QueryTabs';
import { QueryEditor } from './components/QueryEditor';
import { TimeRangePicker } from './components/TimeRangePicker';
import { HistoryDropdown } from './components/HistoryDropdown';
import { Autocomplete } from './components/Autocomplete';
import { FieldsPanel } from './components/FieldsPanel';
import { Histogram } from './components/Histogram';
import { ResultsHeader } from './components/ResultsHeader';
import { ResultsTable } from './components/ResultsTable';
import { DrawerInspector } from './components/DrawerInspector';
import { SettingsModal } from './components/SettingsModal';
import { SetupWizard } from './components/SetupWizard';
import { ValueActionMenu } from './components/ValueActionMenu';
import { SyntaxGuide } from './components/SyntaxGuide';
import { TABS, QUICK_RANGES, HISTORY, FIELDS, STREAMS, LOGS, GUIDE } from './data/mock';
import { computeSuggestions } from './lib/format';
import type { QueryMode, TimeTab, Density, SettingsTab } from './types';
import type { LogRow as TLogRow, Field as TField, HistoBucket } from './types';
import {
  LoadConnection, SaveConnection, TestConnection,
  ListStreams, GetFields, RunQuery,
} from '../wailsjs/go/main/App';

// parseAppError unpacks the structured error string Wails delivers (apperr emits
// JSON), falling back to a plain message for non-structured rejections.
function parseAppError(e: unknown): { category: string; message: string; hint: string } {
  const raw = typeof e === 'string' ? e : ((e as any)?.message ?? String(e));
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && 'message' in o) {
      return { category: o.category ?? 'internal', message: o.message ?? raw, hint: o.hint ?? '' };
    }
  } catch {
    /* not JSON - fall through */
  }
  return { category: 'internal', message: raw, hint: '' };
}

// Stream color palette — assigned round-robin since the API does not return colors
const STREAM_PALETTE = ['#2dd4bf', '#60a5fa', '#f59e0b', '#a78bfa', '#f4685f', '#34d399'];
const withColors = (streams: { name: string; size: string }[]) =>
  streams.map((s, i) => ({ ...s, color: STREAM_PALETTE[i % STREAM_PALETTE.length] }));

function App() {
  const [activeNav, setActiveNav] = useState<string>('Logs');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('connection');
  const [setupOpen, setSetupOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'password' | 'token' | 'sso'>('password');
  const [tested, setTested] = useState(false);
  const [selfSigned, setSelfSigned] = useState(false);
  const [accent, setAccent] = useState<string>('#2dd4bf');
  const [mcpOn, setMcpOn] = useState<boolean>(false);
  const [conn, setConn] = useState<{ url: string; org: string; email?: string; password?: string; token?: string }>({
    url: 'https://observe.example.internal',
    org: 'default',
    email: 'ops@example.com',
  });
  const [tabs, setTabs] = useState(TABS);
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const tabSeq = useRef(0);

  /* QueryEditor state — task 5 */
  const activeTabData = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const [query, setQuery] = useState<string>(activeTabData.q);
  const [queryMode, setQueryMode] = useState<QueryMode>('sql');
  const [showHistogram, setShowHistogram] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [timeRange, setTimeRange] = useState<string>('Past 15 Minutes');
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [suggestOpen, setSuggestOpen] = useState<boolean>(false);
  const [suggestIndex] = useState<number>(0);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);

  /* Delayed-unmount hooks for animated overlays */
  const settingsT = useDelayedUnmount(settingsOpen);
  const setupT = useDelayedUnmount(setupOpen, 260);
  const guideT = useDelayedUnmount(guideOpen);

  /* Value-action context menu state — task 14 */
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; field: string; value: string; x: number; y: number } | null>(null);
  const ctxT = useDelayedUnmount(!!ctxMenu?.open, 160);

  /* Histogram delayed-unmount */
  const histoT = useDelayedUnmount(showHistogram);

  /* ctxItems — design lines 1173-1179, verbatim icons + labels */
  const ctxItems = [
    { icon: '=',    label: 'Filter for value' },
    { icon: '≠', label: 'Exclude value' },
    { icon: '⊞', label: `Group by ${ctxMenu?.field ?? 'field'}` },
    { icon: '▦', label: 'Top 10 values' },
    { icon: '⧉', label: 'Copy value' },
  ];

  /* openCtx — clamp to viewport like design lines 948-950 */
  const openCtx = (field: string, value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 252));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 236));
    setCtxMenu({ open: true, field, value, x, y });
  };

  /* static autocomplete — derive currentWord from seeded query first line */
  const currentWord = 'co';
  const suggestions = computeSuggestions(currentWord);
  const [timeOpen, setTimeOpen] = useState<boolean>(false);

  /* ResultsTable state — task 10 */
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>('ultra');

  /* DrawerInspector open/close animation: keep the drawer mounted through the
     close transition (delayed unmount), and flip `drawerVisible` on the next
     frame so the open transition runs from the closed state. */
  const [drawerRowId, setDrawerRowId] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);
  useEffect(() => {
    if (selectedRow) {
      setDrawerRowId(selectedRow);
      const raf = requestAnimationFrame(() => setDrawerVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setDrawerVisible(false);
    const t = setTimeout(() => setDrawerRowId(null), 200);
    return () => clearTimeout(t);
  }, [selectedRow]);

  /* FieldsPanel state — task 8 */
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [stream, setStream] = useState<string>('demo_logs');
  const [streamOpen, setStreamOpen] = useState<boolean>(false);
  const [fieldFilter, setFieldFilter] = useState<string>('');

  /* TimeRangePicker state — task 6 */
  const [timeTab, setTimeTab] = useState<TimeTab>('relative');
  const [relAmount, setRelAmount] = useState<string>('15');
  const [relUnit, setRelUnit] = useState<string>('m');
  const [absFrom, setAbsFrom] = useState<string>('');
  const [absTo, setAbsTo] = useState<string>('');

  /* Live-data state — M2 */
  const [liveRows, setLiveRows] = useState<TLogRow[]>([]);
  const [liveFields, setLiveFields] = useState<TField[]>([]);
  const [liveStreams, setLiveStreams] = useState<{ name: string; size: string; color: string }[]>([]);
  const [liveBars, setLiveBars] = useState<HistoBucket[]>([]);
  const [liveMeta, setLiveMeta] = useState<{ total: number; tookMs: number; shown: number }>({ total: 0, tookMs: 0, shown: 0 });
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<{ message: string; hint: string } | null>(null);
  const [configured, setConfigured] = useState<boolean>(true);
  const [wizardError, setWizardError] = useState<string | null>(null);

  /* Step 3: Load connection on startup; auto-open wizard when unconfigured */
  useEffect(() => {
    LoadConnection()
      .then((c) => {
        if (!c.url || !c.hasSecret) {
          setConfigured(false);
          setSetupOpen(true);
          return;
        }
        setConn((prev) => ({ ...prev, url: c.url, org: c.org, email: c.username }));
        setConfigured(true);
        return ListStreams().then((s) => {
          const mapped = withColors(s.map((x) => ({ name: x.name, size: x.size })));
          setLiveStreams(mapped);
          if (mapped.length > 0) setStream(mapped[0].name);
        }).catch((e) => {
          if (parseAppError(e).category === 'not_configured') {
            setConfigured(false);
            setSetupOpen(true);
          }
        });
      })
      .catch(() => { setConfigured(false); setSetupOpen(true); });
  }, []);

  /* Step 4: Wire stream selector to load fields */
  useEffect(() => {
    if (!configured || !stream) return;
    GetFields(stream)
      .then((f) => setLiveFields(f as unknown as TField[]))
      .catch((e) => {
        setLiveFields([]);
        if (parseAppError(e).category === 'not_configured') {
          setConfigured(false);
          setSetupOpen(true);
        }
      });
  }, [stream, configured]);

  /* Step 5: Compute time window from relative picker state */
  const computeRange = (): { startMicros: number; endMicros: number } => {
    const now = Date.now() * 1000; // micros
    const amount = parseInt(relAmount, 10) || 15;
    const unitMicros: Record<string, number> = {
      s: 1e6, m: 60e6, h: 3600e6, d: 86400e6, w: 604800e6,
    };
    const span = amount * (unitMicros[relUnit] ?? 60e6);
    return { startMicros: Math.round(now - span), endMicros: Math.round(now) };
  };

  const runQuery = async () => {
    setRunning(true);
    setLoading(true);
    setQueryError(null);
    const { startMicros, endMicros } = computeRange();
    try {
      const res = await RunQuery({
        stream,
        sql: query,
        startMicros,
        endMicros,
        from: 0,
        size: 100,
        histogram: showHistogram,
      } as any);
      setLiveRows((res.rows ?? []) as unknown as TLogRow[]);
      setLiveBars((res.histogram ?? []) as unknown as HistoBucket[]);
      setLiveMeta({ total: Number(res.meta?.total ?? 0), tookMs: res.meta?.tookMs ?? 0, shown: (res.rows ?? []).length });
    } catch (e: any) {
      const ae = parseAppError(e);
      setQueryError({ message: ae.message, hint: ae.hint });
      setLiveRows([]);
      setLiveBars([]);
    } finally {
      setRunning(false);
      setLoading(false);
    }
  };

  /* Step 8: Test and Save connection handlers */
  const handleTest = async () => {
    setWizardError(null);
    try {
      const scheme = authTab === 'token' ? 'token' : 'basic';
      await TestConnection({
        url: conn.url, org: conn.org, scheme,
        username: conn.email ?? '',
        secret: (scheme === 'token' ? conn.token : conn.password) ?? '',
      } as any);
      setTested(true);
    } catch (e: any) {
      setTested(false);
      const ae = parseAppError(e);
      setWizardError(ae.message);
    }
  };

  const handleSaveConnection = async () => {
    const scheme = authTab === 'token' ? 'token' : 'basic';
    await SaveConnection({
      url: conn.url, org: conn.org, scheme,
      username: conn.email ?? '',
      secret: (scheme === 'token' ? conn.token : conn.password) ?? '',
    } as any);
    setConfigured(true);
    setSetupOpen(false);
    const s = await ListStreams().catch((e) => {
      if (parseAppError(e).category === 'not_configured') {
        setConfigured(false);
        setSetupOpen(true);
      }
      return [];
    });
    const mapped = withColors(s.map((x) => ({ name: x.name, size: x.size })));
    setLiveStreams(mapped);
    if (mapped.length > 0) setStream(mapped[0].name);
  };

  const handlePickAccent = (c: string) => {
    setAccent(c);
    document.documentElement.style.setProperty('--accent', c);
  };

  const handleNewTab = () => {
    tabSeq.current += 1;
    const id = `t-new-${tabSeq.current}`;
    setTabs((prev) => [...prev, { id, name: 'untitled', q: `SELECT *\nFROM ${stream}\n`, stream }]);
    setActiveTab(id);
  };

  const handleCloseTab = (id: string) => {
    if (tabs.length <= 1) return; // keep at least one tab open
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (id === activeTab) {
      const neighbor = next[Math.min(idx, next.length - 1)];
      setActiveTab(neighbor.id);
    }
  };

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        {/* TitleBar — design line 41 */}
        <TitleBar />

        {/* BODY flex row — design line 61 */}
        <div className={styles.body}>
          {/* NavRail — design line 64 */}
          <NavRail
            activeNav={activeNav}
            onPick={setActiveNav}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {/* main column — design line 75 */}
          <div className={styles.main}>
            {/* QueryTabs — design lines 77-91 */}
            <QueryTabs
              tabs={tabs}
              activeId={activeTab}
              onPick={setActiveTab}
              onNew={handleNewTab}
              onClose={handleCloseTab}
            />

            {/* QueryEditor — design lines 93-207 */}
            <QueryEditor
              query={query}
              queryMode={queryMode}
              showHistogram={showHistogram}
              running={running}
              timeRange={timeRange}
              onModeChange={setQueryMode}
              onToggleHisto={() => setShowHistogram((v) => !v)}
              onQueryChange={setQuery}
              onRun={runQuery}
              onToggleTime={() => setTimeOpen((v) => !v)}
              onToggleHistory={() => setHistoryOpen((v) => !v)}
              onToggleGuide={() => setGuideOpen((v) => !v)}
              onEditorFocus={() => setSuggestOpen(true)}
              onEditorBlur={() => setSuggestOpen(false)}
              timePicker={
                <TimeRangePicker
                  open={timeOpen}
                  tab={timeTab}
                  quickRanges={QUICK_RANGES.map((r) => ({ label: r[0] }))}
                  relAmount={relAmount}
                  relUnit={relUnit}
                  absFrom={absFrom}
                  absTo={absTo}
                  onPickQuick={(label) => { setTimeRange(label); setTimeOpen(false); }}
                  onSetTab={setTimeTab}
                  onRelAmount={setRelAmount}
                  onRelUnit={setRelUnit}
                  onApplyRelative={() => {
                    setTimeRange(`Last ${relAmount}${relUnit}`);
                    setTimeOpen(false);
                  }}
                  onAbsFrom={setAbsFrom}
                  onAbsTo={setAbsTo}
                  onApplyAbsolute={() => {
                    setTimeRange(`${absFrom} — ${absTo}`);
                    setTimeOpen(false);
                  }}
                />
              }
              historyPanel={
                <HistoryDropdown
                  open={historyOpen}
                  items={HISTORY}
                  onPick={(item) => { setQuery(item.q); setHistoryOpen(false); }}
                  onClose={() => setHistoryOpen(false)}
                />
              }
              autocomplete={
                <Autocomplete
                  open={suggestOpen}
                  currentWord={currentWord}
                  suggestions={suggestions}
                  activeIndex={suggestIndex}
                  onSelect={() => setSuggestOpen(false)}
                  onHover={() => {}}
                />
              }
            />

            {/* workspace — design line ~230 */}
            <div className={styles.workspace}>
              <FieldsPanel
                collapsed={sidebarCollapsed}
                stream={stream}
                streamOpen={streamOpen}
                streams={configured ? liveStreams : STREAMS}
                fields={configured ? liveFields : FIELDS}
                fieldFilter={fieldFilter}
                onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
                onToggleStream={() => setStreamOpen((v) => !v)}
                onPickStream={(name) => { setStream(name); setStreamOpen(false); }}
                onFieldFilter={setFieldFilter}
                onInsertField={() => {}}
              />

              {/* center column — design line 290 */}
              <div className={styles.centerCol}>
                {histoT.mounted && (
                  <div className={`${styles.histoWrap} ${histoT.visible ? styles.histoWrapShown : styles.histoWrapHidden}`}>
                    <Histogram accent={accent} bars={liveBars} />
                  </div>
                )}
                {/* Results header */}
                <ResultsHeader
                  shownCount={liveMeta.shown}
                  totalEvents={liveMeta.total.toLocaleString()}
                  queryMs={liveMeta.tookMs}
                />
                {/* Results area — loading / error / empty / data */}
                {loading ? (
                  <div className={styles.stateCenter}>
                    <div className={styles.spinner} />
                    <span>Running query...</span>
                  </div>
                ) : queryError ? (
                  <div className={styles.errorBanner}>
                    <strong>{queryError.message}</strong>
                    {queryError.hint && <span>{queryError.hint}</span>}
                  </div>
                ) : liveRows.length === 0 ? (
                  <div className={styles.stateCenter}>No results for this query and time range.</div>
                ) : (
                  <ResultsTable
                    rows={liveRows}
                    selectedId={selectedRow}
                    density={density}
                    accent={accent}
                    onSelectRow={(id) => setSelectedRow((prev) => (prev === id ? null : id))}
                    onLevelCtx={openCtx}
                    onServiceCtx={openCtx}
                  />
                )}
              </div>

              {/* DrawerInspector — task 11: right column; stays mounted through the
                  close transition via drawerRowId (see delayed-unmount effect). */}
              {drawerRowId && liveRows.find((r) => r.id === drawerRowId) && (
                <DrawerInspector
                  row={liveRows.find((r) => r.id === drawerRowId)!}
                  visible={drawerVisible}
                  onClose={() => setSelectedRow(null)}
                  onKvCtx={openCtx}
                />
              )}
            </div>
          </div>
        </div>

        {/* SettingsModal — task 12: absolute overlay inside .card (position:relative) */}
        {settingsT.mounted && (
          <SettingsModal
            visible={settingsT.visible}
            tab={settingsTab}
            accent={accent}
            density={density}
            mcpOn={mcpOn}
            showHistogram={showHistogram}
            conn={conn}
            onClose={() => setSettingsOpen(false)}
            onTab={setSettingsTab}
            onPickAccent={handlePickAccent}
            onPickDensity={setDensity}
            onToggleHisto={() => setShowHistogram((v) => !v)}
            onToggleMcp={() => setMcpOn((v) => !v)}
            onConnField={(key, value) => setConn((prev) => ({ ...prev, [key]: value }))}
            onOpenSetup={() => { setSetupOpen(true); setSettingsOpen(false); }}
          />
        )}

        {/* SetupWizard — task 13: full-screen first-launch overlay */}
        {setupT.mounted && (
          <SetupWizard
            visible={setupT.visible}
            conn={conn}
            authTab={authTab}
            tested={tested}
            selfSigned={selfSigned}
            error={wizardError}
            onAuthTab={setAuthTab}
            onField={(key, value) => setConn((prev) => ({ ...prev, [key]: value }))}
            onToggleSelfSigned={() => setSelfSigned((v) => !v)}
            onTest={handleTest}
            onClose={() => { setSetupOpen(false); setWizardError(null); }}
            onSave={handleSaveConnection}
          />
        )}

        {/* ValueActionMenu — task 14: Graylog-style value action menu */}
        {ctxT.mounted && ctxMenu && (
          <ValueActionMenu
            visible={ctxT.visible}
            field={ctxMenu.field}
            value={ctxMenu.value}
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={ctxItems}
            onPick={() => setCtxMenu((m) => (m ? { ...m, open: false } : m))}
            onClose={() => setCtxMenu((m) => (m ? { ...m, open: false } : m))}
          />
        )}

        {/* SyntaxGuide — task 14: SQL syntax guide overlay */}
        {guideT.mounted && (
          <SyntaxGuide
            visible={guideT.visible}
            sections={GUIDE}
            onClose={() => setGuideOpen(false)}
            onUse={() => setGuideOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
