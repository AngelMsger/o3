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
import { QUICK_RANGES, HISTORY, FIELDS, STREAMS, LOGS, GUIDE } from './data/mock';
import { computeSuggestions } from './lib/format';
import type { QueryMode, TimeTab, Density, SettingsTab } from './types';
import type { LogRow as TLogRow, Field as TField, HistoBucket } from './types';
import {
  ListContexts, SwitchContext, SaveContext, TestConnection, RemoveContext,
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

// UICtx — one context as the frontend holds it (color + draft secret fields are UI-only)
interface UICtx {
  name: string; url: string; org: string;
  scheme: string;       // 'basic' | 'token'
  username: string;     // email
  hasSecret: boolean; isCurrent: boolean;
  color: string;
  password: string; token: string; // draft-only, never read back from backend
  draft: boolean;       // true until first successful SaveContext
  origName: string;     // I1: the persisted name at load; sent to backend on save for rename tracking
}

// Context color palette — distinct from stream palette
const CTX_PALETTE = ['#34e0a1', '#f5b340', '#7c83ff', '#2dd4bf', '#60a5fa', '#f4685f'];

// toUICtx maps ContextInfo[] from the backend to the UI representation.
const toUICtx = (infos: { name: string; url: string; org: string; scheme: string; username: string; hasSecret: boolean; isCurrent: boolean }[]): UICtx[] =>
  infos.map((c, i) => ({
    name: c.name, url: c.url, org: c.org, scheme: c.scheme, username: c.username,
    hasSecret: c.hasSecret, isCurrent: c.isCurrent,
    color: CTX_PALETTE[i % CTX_PALETTE.length],
    password: '', token: '', draft: false,
    origName: c.name, // I1: track the persisted name so backend can detect renames
  }));

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
  const [tabs, setTabs] = useState([{ id: 't1', name: 'untitled', q: '', stream: '' }]);
  const [activeTab, setActiveTab] = useState<string>('t1');
  const tabSeq = useRef(0);

  // Contexts state — kubectl-style named contexts loaded from shared config
  const [contexts, setContexts] = useState<UICtx[]>([]);
  const [currentName, setCurrentName] = useState<string>('');
  const [ctxSwitchOpen, setCtxSwitchOpen] = useState(false);

  /* QueryEditor state — task 5 */
  const activeTabData = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const [query, setQuery] = useState<string>(activeTabData.q);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
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

  // refreshContexts loads contexts from the backend and syncs state.
  const refreshContexts = async (): Promise<UICtx[]> => {
    const infos = await ListContexts();
    const ui = toUICtx(infos as any);
    setContexts(ui);
    const cur = ui.find((c) => c.isCurrent) ?? ui[0];
    setCurrentName(cur?.name ?? '');
    return ui;
  };

  // seedSql builds the default SELECT for a stream when no query has been typed yet.
  const seedSql = (s: string) => `SELECT *\nFROM "${s}"\nORDER BY _timestamp DESC\nLIMIT 100`;

  /* Startup: load contexts; open wizard only when none usable (no current with secret) */
  useEffect(() => {
    refreshContexts()
      .then((ui) => {
        const cur = ui.find((c) => c.isCurrent) ?? ui[0];
        if (!cur || !cur.hasSecret) {
          setConfigured(false);
          setSetupOpen(true);
          return;
        }
        setConfigured(true);
        return ListStreams()
          .then((s) => {
            const mapped = withColors(s.map((x) => ({ name: x.name, size: x.size })));
            setLiveStreams(mapped);
            if (mapped.length > 0) {
              const first = mapped[0].name;
              setStream(first);
              // Seed the first tab's query when no query has been typed yet.
              setQuery((prev) => {
                if (prev.trim()) return prev;
                const seeded = seedSql(first);
                setTabs((ts) => ts.map((t) => (t.id === 't1' ? { ...t, q: seeded, stream: first } : t)));
                return seeded;
              });
            }
          })
          .catch((e) => {
            if (parseAppError(e).category === 'not_configured') { setConfigured(false); setSetupOpen(true); }
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

  // fromStream extracts the stream name from a SQL FROM clause.
  const fromStream = (sql: string): string => {
    const m = sql.match(/\bfrom\s+"?([a-zA-Z_][\w.-]*)"?/i);
    return m ? m[1] : '';
  };

  // buildRequest returns the effective SQL and stream for the current query mode.
  const buildRequest = (): { sql: string; effStream: string } => {
    if (queryMode === 'search') {
      const eff = stream; // dropdown stream is the FROM in search mode
      const terms = query.trim();
      const where = terms ? ` WHERE match_all('${terms.replace(/'/g, "''")}')` : '';
      return { sql: `SELECT * FROM "${eff}"${where} ORDER BY _timestamp DESC`, effStream: eff };
    }
    const eff = fromStream(query) || stream;
    return { sql: query, effStream: eff };
  };

  const runQueryAt = async (pageNum: number) => {
    setRunning(true); setLoading(true); setQueryError(null);
    const { startMicros, endMicros } = computeRange();
    const { sql, effStream } = buildRequest();
    try {
      const res = await RunQuery({
        stream: effStream,            // histogram + results target the SAME stream
        sql,
        startMicros, endMicros,
        from: (pageNum - 1) * PAGE_SIZE,
        size: PAGE_SIZE,
        histogram: showHistogram,
      } as any);
      setLiveRows((res.rows ?? []) as unknown as TLogRow[]);
      setLiveBars((res.histogram ?? []) as unknown as HistoBucket[]);
      setLiveMeta({ total: Number(res.meta?.total ?? 0), tookMs: res.meta?.tookMs ?? 0, shown: (res.rows ?? []).length });
      setPage(pageNum);
      if (effStream && effStream !== stream) setStream(effStream); // sync dropdown to the queried FROM
    } catch (e: any) {
      const ae = parseAppError(e);
      setQueryError({ message: ae.message, hint: ae.hint });
      setLiveRows([]); setLiveBars([]);
    } finally {
      setRunning(false); setLoading(false);
    }
  };
  const runQuery = () => runQueryAt(1); // a fresh Run resets to page 1

  // handleSwitchContext switches the active context and reloads streams.
  const handleSwitchContext = async (name: string) => {
    try {
      await SwitchContext(name);
      setCurrentName(name);
      await refreshContexts();
      setConfigured(true);
      setQueryError(null);
      setLiveRows([]); setLiveBars([]);
      const s = await ListStreams().catch((e) => {
        if (parseAppError(e).category === 'not_configured') { setConfigured(false); setSetupOpen(true); }
        return [];
      });
      const mapped = withColors(s.map((x) => ({ name: x.name, size: x.size })));
      setLiveStreams(mapped);
      if (mapped.length > 0) {
        const first = mapped[0].name;
        setStream(first);
        // After a context switch, seed the active tab's query if it is blank.
        setQuery((prev) => {
          if (prev.trim()) return prev;
          const seeded = seedSql(first);
          setTabs((ts) => ts.map((t) => (t.id === activeTab ? { ...t, q: seeded, stream: first } : t)));
          return seeded;
        });
      }
    } catch (e: any) {
      const ae = parseAppError(e);
      if (ae.category === 'not_configured') {
        // C1: the switch persisted on disk but the context has no keychain secret.
        // Update the title bar to the new context and open the wizard so the user
        // can supply credentials — do NOT leave the UI showing the old context.
        setCurrentName(name);
        await refreshContexts();
        setConfigured(false);
        setSetupOpen(true);
      } else {
        setWizardError(ae.message);
      }
    }
  };

  // handleAddContext appends a draft context held in state until SaveContext persists it.
  // Fix 5: dedupe the draft name so two "+ Add" clicks never produce the same key.
  const handleAddContext = () => {
    const color = CTX_PALETTE[contexts.length % CTX_PALETTE.length];
    let draftName = 'new-context';
    let seq = 2;
    while (contexts.some((c) => c.name === draftName)) {
      draftName = `new-context-${seq}`;
      seq += 1;
    }
    const draft: UICtx = {
      name: draftName, url: '', org: 'default', scheme: 'basic', username: '',
      hasSecret: false, isCurrent: false, color, password: '', token: '', draft: true,
      origName: '', // I1: never persisted yet, so no old entry to remove
    };
    setContexts((cs) => [...cs, draft]);
    setCurrentName(draftName);
  };

  // handleSaveContext persists the named context (upsert + secret) then refreshes.
  const handleSaveContext = async (ctx: UICtx): Promise<void> => {
    const secret = ctx.scheme === 'token' ? ctx.token : ctx.password;
    // I1: pass origName so the backend can remove the old entry when the context was renamed.
    await SaveContext({ name: ctx.name, url: ctx.url, org: ctx.org, scheme: ctx.scheme, username: ctx.username, secret, origName: ctx.origName } as any);
    setConfigured(true);
    await refreshContexts(); // reloads from disk; toUICtx re-sets origName to the new persisted name
  };

  // handleTestContext tests the connection for the given context draft.
  const handleTestContext = async (ctx: UICtx): Promise<void> => {
    setWizardError(null);
    try {
      const secret = ctx.scheme === 'token' ? ctx.token : ctx.password;
      await TestConnection({ name: ctx.name, url: ctx.url, org: ctx.org, scheme: ctx.scheme, username: ctx.username, secret } as any);
      setTested(true);
    } catch (e: any) {
      setTested(false);
      setWizardError(parseAppError(e).message);
    }
  };

  // handleRemoveContext deletes the named context from the shared config and
  // switches to whichever context the backend promotes as current.
  const handleRemoveContext = async (name: string) => {
    try {
      await RemoveContext(name);
      const ui = await refreshContexts();
      const cur = ui.find((c) => c.isCurrent) ?? ui[0];
      if (cur) await handleSwitchContext(cur.name);
    } catch (e: any) {
      setWizardError(parseAppError(e).message);
    }
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
        {/* TitleBar — design line 41; context switcher added in task 3 */}
        <TitleBar
          contexts={contexts.map((c) => ({ name: c.name, url: c.url, color: c.color, isCurrent: c.name === currentName }))}
          currentName={currentName}
          switchOpen={ctxSwitchOpen}
          onToggleSwitch={() => setCtxSwitchOpen((v) => !v)}
          onSwitch={(name) => { setCtxSwitchOpen(false); handleSwitchContext(name); }}
          onAddContext={() => { setCtxSwitchOpen(false); handleAddContext(); setSettingsOpen(true); setSettingsTab('connection'); }}
          onManage={() => { setCtxSwitchOpen(false); setSettingsOpen(true); setSettingsTab('connection'); }}
        />

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
                  page={page}
                  totalPages={Math.max(1, Math.ceil(liveMeta.total / PAGE_SIZE))}
                  onPrev={() => { if (page > 1) runQueryAt(page - 1); }}
                  onNext={() => { const tp = Math.max(1, Math.ceil(liveMeta.total / PAGE_SIZE)); if (page < tp) runQueryAt(page + 1); }}
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
            contexts={contexts.map((c) => ({ name: c.name, color: c.color, isCurrent: c.name === currentName }))}
            active={(() => { const a = contexts.find((c) => c.name === currentName); return a ? { name: a.name, url: a.url, org: a.org, scheme: a.scheme, username: a.username, password: a.password, token: a.token } : null; })()}
            canRemove={contexts.length > 1}
            onAddContext={handleAddContext}
            onUse={(name) => handleSwitchContext(name)}
            onRemove={(name) => handleRemoveContext(name)}
            onField={(key, value) => setContexts((cs) => cs.map((c) => (c.name === currentName ? { ...c, [key]: value } : c)))}
            onTest={() => { const a = contexts.find((c) => c.name === currentName); if (a) handleTestContext(a); }}
            onSave={() => { const a = contexts.find((c) => c.name === currentName); if (a) handleSaveContext(a); }}
          />
        )}

        {/* SetupWizard — task 3: multi-context first-launch + add overlay */}
        {setupT.mounted && (
          <SetupWizard
            visible={setupT.visible}
            contexts={contexts}
            currentName={currentName}
            tested={tested}
            selfSigned={selfSigned}
            error={wizardError}
            onUpdateCtx={(name, key, value) => {
              setContexts((cs) =>
                cs.map((c) => (c.name === name ? { ...c, [key]: value } : c))
              );
              // Fix 2: when renaming the currently-selected context, keep
              // currentName in sync so `selected` keeps tracking the right entry.
              if (key === 'name' && name === currentName) {
                setCurrentName(value);
              }
            }}
            onSelectCtx={(name) => { setCurrentName(name); setWizardError(null); }}
            onToggleSelfSigned={() => setSelfSigned((v) => !v)}
            onTest={(ctx) => handleTestContext(ctx)}
            onClose={() => { setSetupOpen(false); setWizardError(null); }}
            onSave={async (ctx) => {
              // Fix 1: close unconditionally after a successful SaveContext —
              // never gate the close on stream count or stale `configured`.
              await handleSaveContext(ctx);
              setSetupOpen(false);
              setConfigured(true);
              setWizardError(null);
              // Best-effort stream load; failure only reopens the wizard on
              // not_configured — it does NOT prevent the wizard from closing.
              ListStreams()
                .then((s) => {
                  const mapped = withColors(s.map((x) => ({ name: x.name, size: x.size })));
                  setLiveStreams(mapped);
                  if (mapped.length > 0) setStream(mapped[0].name);
                })
                .catch((e) => {
                  if (parseAppError(e).category === 'not_configured') {
                    setConfigured(false);
                    setSetupOpen(true);
                  }
                  // other errors (e.g. zero streams) are silently ignored
                });
            }}
            onAddContext={() => { handleAddContext(); }}
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
