import { useEffect, useRef, useState } from 'react';
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

  /* Value-action context menu state — task 14 */
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; field: string; value: string; x: number; y: number } | null>(null);

  /* ctxItems — design lines 1173–1179, verbatim icons + labels */
  const ctxItems = [
    { icon: '=',    label: 'Filter for value' },
    { icon: '≠', label: 'Exclude value' },
    { icon: '⊞', label: `Group by ${ctxMenu?.field ?? 'field'}` },
    { icon: '▦', label: 'Top 10 values' },
    { icon: '⧉', label: 'Copy value' },
  ];

  /* openCtx — clamp to viewport like design lines 948–950 */
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
            {/* QueryTabs — design lines 77–91 */}
            <QueryTabs
              tabs={tabs}
              activeId={activeTab}
              onPick={setActiveTab}
              onNew={handleNewTab}
              onClose={handleCloseTab}
            />

            {/* QueryEditor — design lines 93–207 */}
            <QueryEditor
              query={query}
              queryMode={queryMode}
              showHistogram={showHistogram}
              running={running}
              timeRange={timeRange}
              onModeChange={setQueryMode}
              onToggleHisto={() => setShowHistogram((v) => !v)}
              onQueryChange={setQuery}
              onRun={() => setRunning((v) => !v)}
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
                streams={STREAMS}
                fields={FIELDS}
                fieldFilter={fieldFilter}
                onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
                onToggleStream={() => setStreamOpen((v) => !v)}
                onPickStream={(name) => { setStream(name); setStreamOpen(false); }}
                onFieldFilter={setFieldFilter}
                onInsertField={() => {}}
              />

              {/* center column — design line 290 */}
              <div className={styles.centerCol}>
                <Histogram show={showHistogram} accent={accent} />
                {/* Results header + table — task 10 */}
                <ResultsHeader
                  shownCount={50}
                  totalEvents="402,170"
                  queryMs={247}
                />
                <ResultsTable
                  rows={LOGS}
                  selectedId={selectedRow}
                  density={density}
                  accent={accent}
                  onSelectRow={(id) => setSelectedRow((prev) => (prev === id ? null : id))}
                  onLevelCtx={openCtx}
                  onServiceCtx={openCtx}
                />
              </div>

              {/* DrawerInspector — task 11: right column; stays mounted through the
                  close transition via drawerRowId (see delayed-unmount effect). */}
              {drawerRowId && (
                <DrawerInspector
                  row={LOGS.find((r) => r.id === drawerRowId)!}
                  visible={drawerVisible}
                  onClose={() => setSelectedRow(null)}
                  onKvCtx={openCtx}
                />
              )}
            </div>
          </div>
        </div>

        {/* SettingsModal — task 12: absolute overlay inside .card (position:relative) */}
        <SettingsModal
          open={settingsOpen}
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

        {/* SetupWizard — task 13: full-screen first-launch overlay */}
        <SetupWizard
          open={setupOpen}
          conn={conn}
          authTab={authTab}
          tested={tested}
          selfSigned={selfSigned}
          onAuthTab={setAuthTab}
          onField={(key, value) => setConn((prev) => ({ ...prev, [key]: value }))}
          onToggleSelfSigned={() => setSelfSigned((v) => !v)}
          onTest={() => setTested(true)}
          onClose={() => setSetupOpen(false)}
        />

        {/* ValueActionMenu — task 14: Graylog-style value action menu */}
        <ValueActionMenu
          open={!!ctxMenu?.open}
          field={ctxMenu?.field ?? ''}
          value={ctxMenu?.value ?? ''}
          x={ctxMenu?.x ?? 0}
          y={ctxMenu?.y ?? 0}
          items={ctxItems}
          onPick={() => setCtxMenu(null)}
          onClose={() => setCtxMenu(null)}
        />

        {/* SyntaxGuide — task 14: SQL syntax guide overlay */}
        <SyntaxGuide
          open={guideOpen}
          sections={GUIDE}
          onClose={() => setGuideOpen(false)}
          onUse={() => setGuideOpen(false)}
        />
      </div>
    </div>
  );
}

export default App;
