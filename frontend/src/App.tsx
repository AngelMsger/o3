import { useEffect, useRef, useState } from 'react';
import { useDelayedUnmount } from './lib/useDelayedUnmount';
import styles from './App.module.css';
import { TitleBar } from './components/TitleBar';
import { ContextSwitcher } from './components/ContextSwitcher';
import { NavRail } from './components/NavRail';
import { QueryTabs } from './components/QueryTabs';
import { QueryEditor } from './components/QueryEditor';
import type { SqlEditorHandle } from './components/SqlEditor';
import { TimeRangePicker } from './components/TimeRangePicker';
import { HistoryDropdown } from './components/HistoryDropdown';
import { FieldsPanel } from './components/FieldsPanel';
import { PlaceholderView } from './components/views/PlaceholderView';
import { MetricsView } from './components/views/MetricsView';
import { Histogram } from './components/Histogram';
import { bucketRangeMicros, formatBucketTime } from './components/charts/buildHistogramOption';
import { ResultsHeader } from './components/ResultsHeader';
import { ResultsTable } from './components/ResultsTable';
import { DrawerInspector } from './components/DrawerInspector';
import { SettingsModal } from './components/SettingsModal';
import { SetupWizard } from './components/SetupWizard';
import { ValueActionMenu } from './components/ValueActionMenu';
import { SyntaxGuide } from './components/SyntaxGuide';
import { QUICK_RANGES, HISTORY, FIELDS, STREAMS, LOGS, GUIDE } from './data/mock';
import { fromStream, setFromStream, addCondition, aggregateBy } from './lib/format';
import { copyText } from './lib/clipboard';
import { dotState, ecoTooltip } from './lib/ecosystem';
import type { EcoStatus } from './lib/ecosystem';
import { BrowserOpenURL } from '../wailsjs/runtime/runtime';
import type { QueryMode, QueryTab, TimeTab, Density, SettingsTab, ThemePref } from './types';
import type { LogRow as TLogRow, Field as TField, HistoBucket } from './types';
import { effectiveTheme, applyThemeAttr } from './lib/theme';
import {
  ListContexts, SwitchContext, SaveContext, TestConnection, RemoveContext,
  ListStreams, GetFields, RunQuery, GetPrefs, SavePrefs, SetDockTheme, SetAppearance,
  EcosystemStatus, InstallCLI, UpgradeCLI, UninstallCLI, InstallSkill, UninstallSkill,
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
  const editorRef = useRef<SqlEditorHandle>(null);
  const [activeNav, setActiveNav] = useState<string>('Logs');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('connection');
  const [setupOpen, setSetupOpen] = useState(false);
  const [tested, setTested] = useState(false);
  const [selfSigned, setSelfSigned] = useState(false);
  const [accent, setAccent] = useState<string>('#2dd4bf');
  const [themePref, setThemePref] = useState<ThemePref>('dark');
  const [systemDark, setSystemDark] = useState<boolean>(
    typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)').matches : true
  );
  const prefsLoaded = useRef(false);
  const [ecoStatus, setEcoStatus] = useState<EcoStatus | null>(null);
  const [ecoBusy, setEcoBusy] = useState<string | null>(null);
  const [ecoError, setEcoError] = useState<string>('');
  const [conn, setConn] = useState<{ url: string; org: string; email?: string; password?: string; token?: string }>({
    url: 'https://observe.example.internal',
    org: 'default',
    email: 'ops@example.com',
  });
  const [tabs, setTabs] = useState<QueryTab[]>([
    { id: 't1', name: 'untitled', mode: 'sql', sql: '', search: '', stream: '' },
  ]);
  const [activeTab, setActiveTab] = useState<string>('t1');
  const tabSeq = useRef(0);

  // Contexts state — kubectl-style named contexts loaded from shared config
  const [contexts, setContexts] = useState<UICtx[]>([]);
  const [currentName, setCurrentName] = useState<string>('');
  const [ctxSwitchOpen, setCtxSwitchOpen] = useState(false);

  /* Active-tab derivation — tab is the single source of truth for editor state */
  const activeTabData = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const mode = activeTabData.mode;
  const stream = activeTabData.stream;
  const editorText = mode === 'sql' ? activeTabData.sql : activeTabData.search;

  const patchActive = (patch: Partial<QueryTab>) =>
    setTabs((ts) => ts.map((t) => (t.id === activeTab ? { ...t, ...patch } : t)));
  const setEditorText = (text: string) => patchActive(mode === 'sql' ? { sql: text } : { search: text });
  const setMode = (m: QueryMode) => patchActive({ mode: m });
  const setActiveStream = (s: string) => patchActive({ stream: s });

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  const [showHistogram, setShowHistogram] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [timeRange, setTimeRange] = useState<string>('Past 15 Minutes');
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
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

  /* ctxItems — design lines 1173-1179, verbatim icons + labels, each with an action id */
  const ctxItems = [
    { icon: '=',    label: 'Filter For Value', action: 'filter' },
    { icon: '≠', label: 'Exclude Value', action: 'exclude' },
    { icon: '⊞', label: `Group By ${ctxMenu?.field ?? 'field'}`, action: 'groupby' },
    { icon: '▦', label: 'Top 10 Values', action: 'top10' },
    { icon: '⧉', label: 'Copy Value', action: 'copy' },
  ];

  // handleValueAction runs a value-action-menu item against the row's field/value:
  // copy to clipboard, or rewrite the SQL buffer (filter/exclude/group/top-N) and
  // switch to SQL mode so the change is visible in the editor.
  const handleValueAction = (action: string) => {
    const cm = ctxMenu;
    if (cm) {
      const { field, value } = cm;
      if (action === 'copy') {
        copyText(value);
      } else if (action === 'filter' || action === 'exclude') {
        const base = activeTabData.sql.trim() ? activeTabData.sql : setFromStream('', stream);
        patchActive({ sql: addCondition(base, field, value, action === 'filter' ? '=' : '!='), mode: 'sql' });
      } else if (action === 'groupby' || action === 'top10') {
        patchActive({ sql: aggregateBy(stream, field, action === 'top10' ? 10 : 100), mode: 'sql' });
      }
    }
    setCtxMenu((m) => (m ? { ...m, open: false } : m));
  };

  /* openCtx — clamp to viewport like design lines 948-950 */
  const openCtx = (field: string, value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 252));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 236));
    setCtxMenu({ open: true, field, value, x, y });
  };

  const [timeOpen, setTimeOpen] = useState<boolean>(false);

  /* ResultsTable state — task 10 */
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>('ultra');

  /* Theme prefs — Phase 4: load once, persist on change, follow OS appearance. */
  useEffect(() => {
    GetPrefs().then((p) => {
      if (p.theme) setThemePref(p.theme as ThemePref);
      if (p.accent) setAccent(p.accent);
      if (p.density) setDensity(p.density as Density);
      prefsLoaded.current = true;
    }).catch(() => { prefsLoaded.current = true; });
  }, []);

  useEffect(() => {
    if (!prefsLoaded.current) return;
    SavePrefs({ theme: themePref, accent, density }).catch(() => {});
  }, [themePref, accent, density]);

  // AI Ecosystem: detect CLI + Skill state. Refresh on mount and whenever the
  // settings modal opens (so it reflects installs done in another terminal).
  const refreshEco = () => {
    EcosystemStatus().then(setEcoStatus).catch(() => setEcoStatus(null));
  };
  useEffect(() => { refreshEco(); }, []);
  useEffect(() => { if (settingsOpen) refreshEco(); }, [settingsOpen]);

  // runEco wraps an action method: set busy, run, surface errors, refresh state.
  const runEco = (key: string, fn: () => Promise<void>) => {
    setEcoBusy(key);
    setEcoError('');
    fn()
      .then(() => { refreshEco(); })
      .catch((e) => { setEcoError(parseAppError(e).message); })
      .finally(() => setEcoBusy(null));
  };

  const CLI_DOCS_URL = 'https://github.com/AngelMsger/openobserve-cli#installation';

  // Drive the native macOS appearance from the preference. 'system' clears the
  // pinned appearance so the WebView's prefers-color-scheme (below) tracks the
  // OS; 'dark'/'light' pin it so native chrome matches. Unpinning may change the
  // effective appearance, which fires the matchMedia 'change' handler and
  // refreshes systemDark.
  useEffect(() => {
    SetAppearance(themePref).catch(() => {});
  }, [themePref]);

  useEffect(() => {
    const dark = effectiveTheme(themePref, systemDark) === 'dark';
    applyThemeAttr(dark ? 'dark' : 'light');
    // Swap the native Dock icon to the matching variant (Void/Signal).
    SetDockTheme(dark).catch(() => {});
  }, [themePref, systemDark]);

  // Sync the runtime accent CSS var on any accent change, including the value
  // loaded from prefs on startup (not just manual picks in Settings).
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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

  /* Startup: load contexts; open wizard only when none usable (no current with secret) */
  useEffect(() => {
    const seedTabId = activeTab; // capture the tab active when the load begins (always 't1' here)
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
              // Seed the tab that was active when the load began (not the current activeTab).
              setTabs((ts) => ts.map((t) => {
                if (t.id !== seedTabId) return t;
                return t.sql.trim()
                  ? { ...t, stream: first }
                  : { ...t, stream: first, sql: setFromStream('', first) };
              }));
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

  /* Histogram drag-to-select: a SECONDARY time filter layered on the primary (picker)
     range. It narrows the RESULTS only; the histogram keeps showing the primary range
     with the drilled buckets highlighted, so the user can pop back to the broader view.
     lo/hi index into the current bars; start/endMicros are the sub-window; label is the
     tag text. Null when there is no drill-down. */
  const [histoSel, setHistoSel] = useState<
    { lo: number; hi: number; startMicros: number; endMicros: number; label: string } | null
  >(null);

  /* Step 5: Compute the PRIMARY time window from the relative picker state. */
  const computeRange = (): { startMicros: number; endMicros: number } => {
    const now = Date.now() * 1000; // micros
    const amount = parseInt(relAmount, 10) || 15;
    const unitMicros: Record<string, number> = {
      s: 1e6, m: 60e6, h: 3600e6, d: 86400e6, w: 604800e6,
    };
    const span = amount * (unitMicros[relUnit] ?? 60e6);
    return { startMicros: Math.round(now - span), endMicros: Math.round(now) };
  };

  // buildRequest returns the effective SQL and stream for the current query mode.
  const buildRequest = (): { sql: string; effStream: string } => {
    if (mode === 'search') {
      const eff = stream; // dropdown stream is the FROM in search mode
      const terms = activeTabData.search.trim();
      const where = terms ? ` WHERE match_all('${terms.replace(/'/g, "''")}')` : '';
      return { sql: `SELECT * FROM "${eff}"${where} ORDER BY _timestamp DESC`, effStream: eff };
    }
    const sql = activeTabData.sql;
    return { sql, effStream: fromStream(sql) || stream };
  };

  const runQueryAt = async (
    pageNum: number,
    opts?: { resultsRange?: { startMicros: number; endMicros: number }; withHistogram?: boolean },
  ) => {
    setRunning(true); setLoading(true); setQueryError(null);
    // Results honor the secondary drill-down window when one is active; an explicit
    // resultsRange (from a brush apply/clear) is used verbatim to avoid racing state.
    // The histogram is only (re)fetched on a full run so it keeps showing the broad
    // primary range while a drill-down narrows just the results.
    const range = opts?.resultsRange
      ?? (histoSel ? { startMicros: histoSel.startMicros, endMicros: histoSel.endMicros } : computeRange());
    const withHistogram = (opts?.withHistogram ?? true) && showHistogram;
    const { sql, effStream } = buildRequest();
    try {
      const res = await RunQuery({
        stream: effStream,            // histogram + results target the SAME stream
        sql,
        startMicros: range.startMicros, endMicros: range.endMicros,
        from: (pageNum - 1) * PAGE_SIZE,
        size: PAGE_SIZE,
        histogram: withHistogram,
      } as any);
      setLiveRows((res.rows ?? []) as unknown as TLogRow[]);
      if (withHistogram) setLiveBars((res.histogram ?? []) as unknown as HistoBucket[]);
      setLiveMeta({ total: Number(res.meta?.total ?? 0), tookMs: res.meta?.tookMs ?? 0, shown: (res.rows ?? []).length });
      setPage(pageNum);
      if (effStream && effStream !== stream) setActiveStream(effStream); // sync tab to the queried FROM
    } catch (e: any) {
      const ae = parseAppError(e);
      setQueryError({ message: ae.message, hint: ae.hint });
      setLiveRows([]);
      if (withHistogram) setLiveBars([]);
    } finally {
      setRunning(false); setLoading(false);
    }
  };
  // A fresh Run (or Cmd+Enter) resets to page 1 and drops any drill-down so the primary
  // range drives both histogram and results again.
  const runQuery = () => {
    setHistoSel(null);
    runQueryAt(1, { resultsRange: computeRange(), withHistogram: true });
  };

  /* Histogram drag-to-select: layer a secondary time filter on the current query. Map the
     brushed bucket range to a sub-window, show the removable tag, and refresh RESULTS only
     — the histogram stays broad so the selection band keeps its context. */
  const handleHistoBrush = (lo: number, hi: number) => {
    const range = bucketRangeMicros(liveBars, lo, hi);
    if (!range) return;
    const from = formatBucketTime(liveBars[Math.min(lo, hi)].t, true);
    const to = formatBucketTime(String(range.endMicros), true);
    setHistoSel({ lo: Math.min(lo, hi), hi: Math.max(lo, hi), ...range, label: `${from} → ${to}` });
    runQueryAt(1, { resultsRange: range, withHistogram: false });
  };

  /* Remove the tag: drop the secondary filter and return to the original broader results.
     The histogram is untouched, so this is an instant results-only refresh. */
  const clearHistoSel = () => {
    setHistoSel(null);
    runQueryAt(1, { resultsRange: computeRange(), withHistogram: false });
  };

  // handleSwitchContext switches the active context and reloads streams.
  const handleSwitchContext = async (name: string) => {
    const seedTabId = activeTab; // capture before any awaits
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
        // Seed the tab that was active when the switch began (not the current activeTab).
        setTabs((ts) => ts.map((t) => {
          if (t.id !== seedTabId) return t;
          return t.sql.trim()
            ? { ...t, stream: first }
            : { ...t, stream: first, sql: setFromStream('', first) };
        }));
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

  // The [accent] effect above syncs the --accent CSS var; just update state.
  const handlePickAccent = (c: string) => setAccent(c);

  const selectTab = (id: string) => {
    setActiveTab(id);
    setPage(1);
    setHistoSel(null);
    setLiveRows([]);
    setLiveBars([]);
    setLiveMeta({ total: 0, tookMs: 0, shown: 0 });
    setQueryError(null);
  };

  const handleNewTab = () => {
    tabSeq.current += 1;
    const id = `t-new-${tabSeq.current}`;
    const s = activeTabData.stream;
    setTabs((prev) => [...prev, { id, name: 'untitled', mode: 'sql', sql: s ? setFromStream('', s) : '', search: '', stream: s }]);
    selectTab(id);
  };

  const handleRenameTab = (id: string, name: string) =>
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, name } : t)));

  const handleCloseTab = (id: string) => {
    if (tabs.length <= 1) return; // keep at least one tab open
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (id === activeTab) {
      const neighbor = next[Math.min(idx, next.length - 1)];
      selectTab(neighbor.id);
    }
  };

  // Field-click insertion now goes through the editor's imperative handle, which
  // inserts at the live caret and refocuses — CodeMirror owns the doc + cursor.
  const handleInsertField = (name: string) => {
    editorRef.current?.insertAtCursor(name);
  };

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        {/* TitleBar — design line 41; context switcher added in task 3 */}
        <TitleBar isDark={effectiveTheme(themePref, systemDark) === 'dark'} />

        {/* BODY flex row — design line 61 */}
        <div className={styles.body}>
          {/* NavRail — design line 64 */}
          <NavRail
            activeNav={activeNav}
            onPick={setActiveNav}
            onOpenSettings={() => setSettingsOpen(true)}
            eco={{
              state: ecoStatus ? dotState(ecoStatus.cli) : 'off',
              title: ecoStatus ? ecoTooltip(ecoStatus.cli) : 'openobserve-cli not installed',
            }}
            onOpenEcosystem={() => { setSettingsOpen(true); setSettingsTab('agent'); }}
          />

          {/* main column — design line 75. Nav routing: Logs renders the query
              workspace; other sections render their scaffold placeholder. */}
          <div className={styles.main}>
            {activeNav === 'Metrics' ? (
              <MetricsView accent={accent} isDark={effectiveTheme(themePref, systemDark) === 'dark'} />
            ) : activeNav !== 'Logs' ? (
              <PlaceholderView title={activeNav} />
            ) : (
              <>
            {/* QueryTabs — design lines 77-91 */}
            <QueryTabs
              tabs={tabs}
              activeId={activeTab}
              onPick={selectTab}
              onNew={handleNewTab}
              onClose={handleCloseTab}
              onRename={handleRenameTab}
            />

            {/* QueryEditor — design lines 93-207 */}
            <QueryEditor
              query={editorText}
              queryMode={mode}
              fields={configured ? liveFields : FIELDS}
              accent={accent}
              isDark={effectiveTheme(themePref, systemDark) === 'dark'}
              showHistogram={showHistogram}
              running={running}
              timeRange={timeRange}
              onModeChange={setMode}
              onToggleHisto={() => setShowHistogram((v) => !v)}
              onQueryChange={(t) => setEditorText(t)}
              onRun={runQuery}
              onToggleTime={() => setTimeOpen((v) => !v)}
              onToggleHistory={() => setHistoryOpen((v) => !v)}
              onToggleGuide={() => setGuideOpen((v) => !v)}
              editorRef={editorRef}
              contextSwitcher={
                <ContextSwitcher
                  contexts={contexts.map((c) => ({ name: c.name, url: c.url, color: c.color, isCurrent: c.name === currentName }))}
                  currentName={currentName}
                  open={ctxSwitchOpen}
                  onToggle={() => setCtxSwitchOpen((v) => !v)}
                  onSwitch={(name) => { setCtxSwitchOpen(false); handleSwitchContext(name); }}
                  onAddContext={() => { setCtxSwitchOpen(false); handleAddContext(); setSettingsOpen(true); setSettingsTab('connection'); }}
                  onManage={() => { setCtxSwitchOpen(false); setSettingsOpen(true); setSettingsTab('connection'); }}
                />
              }
              timePicker={
                <TimeRangePicker
                  open={timeOpen}
                  tab={timeTab}
                  quickRanges={QUICK_RANGES.map((r) => ({ label: r[0] }))}
                  relAmount={relAmount}
                  relUnit={relUnit}
                  absFrom={absFrom}
                  absTo={absTo}
                  onPickQuick={(label) => { setHistoSel(null); setTimeRange(label); setTimeOpen(false); }}
                  onSetTab={setTimeTab}
                  onRelAmount={setRelAmount}
                  onRelUnit={setRelUnit}
                  onApplyRelative={() => {
                    setHistoSel(null);
                    setTimeRange(`Last ${relAmount}${relUnit}`);
                    setTimeOpen(false);
                  }}
                  onAbsFrom={setAbsFrom}
                  onAbsTo={setAbsTo}
                  onApplyAbsolute={() => {
                    setHistoSel(null);
                    setTimeRange(`${absFrom} — ${absTo}`);
                    setTimeOpen(false);
                  }}
                />
              }
              historyPanel={
                <HistoryDropdown
                  open={historyOpen}
                  items={HISTORY}
                  onPick={(item) => { setEditorText(item.q); setHistoryOpen(false); }}
                  onClose={() => setHistoryOpen(false)}
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
                onPickStream={(name) => {
                  patchActive(mode === 'sql'
                    ? { stream: name, sql: setFromStream(activeTabData.sql, name) }
                    : { stream: name });
                  setStreamOpen(false);
                  requestAnimationFrame(() => editorRef.current?.focus());
                }}
                onFieldFilter={setFieldFilter}
                onInsertField={handleInsertField}
              />

              {/* center column — design line 290 */}
              <div className={styles.centerCol}>
                {histoT.mounted && (
                  <div className={`${styles.histoWrap} ${histoT.visible ? styles.histoWrapShown : styles.histoWrapHidden}`}>
                    <Histogram
                      accent={accent}
                      bars={liveBars}
                      onBrushRange={handleHistoBrush}
                      selRange={histoSel ? { lo: histoSel.lo, hi: histoSel.hi } : undefined}
                      selectionLabel={histoSel?.label ?? null}
                      onClearSelection={clearHistoSel}
                    />
                  </div>
                )}
                {/* Results header */}
                <ResultsHeader
                  shownCount={liveMeta.shown}
                  totalEvents={liveMeta.total.toLocaleString()}
                  queryMs={liveMeta.tookMs}
                  page={page}
                  pageSize={PAGE_SIZE}
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
              </>
            )}
          </div>
        </div>

        {/* SettingsModal — task 12: absolute overlay inside .card (position:relative) */}
        {settingsT.mounted && (
          <SettingsModal
            visible={settingsT.visible}
            tab={settingsTab}
            accent={accent}
            density={density}
            themePref={themePref}
            ecosystem={{
              status: ecoStatus,
              busy: ecoBusy,
              error: ecoError,
              onInstallCli: () => runEco('cli-install', InstallCLI),
              onUpgradeCli: () => runEco('cli-upgrade', UpgradeCLI),
              onUninstallCli: () => runEco('cli-uninstall', UninstallCLI),
              onInstallSkill: () => runEco('skill-install', InstallSkill),
              onUninstallSkill: () => runEco('skill-uninstall', UninstallSkill),
              onOpenDocs: () => BrowserOpenURL(CLI_DOCS_URL),
              onCopy: (cmd: string) => { copyText(cmd); },
            }}
            showHistogram={showHistogram}
            conn={conn}
            onClose={() => setSettingsOpen(false)}
            onTab={setSettingsTab}
            onPickAccent={handlePickAccent}
            onPickDensity={setDensity}
            onPickTheme={setThemePref}
            onToggleHisto={() => setShowHistogram((v) => !v)}
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
              const seedTabId = activeTab; // capture before any awaits
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
                  if (mapped.length > 0) {
                    const s = mapped[0].name;
                    // Seed the tab that was active when the save began (not the current activeTab).
                    setTabs((ts) => ts.map((t) =>
                      t.id === seedTabId
                        ? (t.sql.trim() ? { ...t, stream: s } : { ...t, stream: s, sql: setFromStream('', s) })
                        : t,
                    ));
                  }
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
            onPick={handleValueAction}
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
