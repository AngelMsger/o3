import { useState } from 'react';
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
import { TABS, QUICK_RANGES, HISTORY, FIELDS, STREAMS, LOGS } from './data/mock';
import { computeSuggestions } from './lib/format';
import type { QueryMode, TimeTab, Density } from './types';

function App() {
  const [activeNav, setActiveNav] = useState<string>('Logs');
  const [, setSettingsOpen] = useState(false);
  const [tabs] = useState(TABS);
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);

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

  /* static autocomplete — derive currentWord from seeded query first line */
  const currentWord = 'co';
  const suggestions = computeSuggestions(currentWord);
  const [timeOpen, setTimeOpen] = useState<boolean>(false);

  /* ResultsTable state — task 10 */
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [density] = useState<Density>('ultra');

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

  void guideOpen;

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
              onNew={() => {}}
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
                <Histogram show={showHistogram} />
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
                  onSelectRow={(id) => setSelectedRow((prev) => (prev === id ? null : id))}
                  onLevelCtx={() => {}}
                  onServiceCtx={() => {}}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
