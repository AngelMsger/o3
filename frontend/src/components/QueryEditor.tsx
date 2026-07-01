/* QueryEditor — design/Observe.dc.html lines 93–207 */
import type { ReactElement, ReactNode, RefObject } from 'react';
import styles from './QueryEditor.module.css';
import { SqlEditor } from './SqlEditor';
import type { SqlEditorHandle } from './SqlEditor';
import type { Field, QueryMode } from '../types';

export interface QueryEditorProps {
  query: string;
  queryMode: QueryMode;
  fields: Field[];
  accent: string;
  showHistogram: boolean;
  running: boolean;
  timeRange: string;
  onModeChange: (m: QueryMode) => void;
  onToggleHisto: () => void;
  onToggleTime: () => void;
  onRun: () => void;
  onToggleHistory: () => void;
  onToggleGuide: () => void;
  onQueryChange: (s: string) => void;
  editorRef?: RefObject<SqlEditorHandle>;
  timePicker?: ReactNode;
  historyPanel?: ReactNode;
}

export function QueryEditor(props: QueryEditorProps): ReactElement {
  const {
    query,
    queryMode,
    fields,
    accent,
    showHistogram,
    running,
    timeRange,
    onModeChange,
    onToggleHisto,
    onToggleTime,
    onRun,
    onToggleHistory,
    onToggleGuide,
    onQueryChange,
    editorRef,
    timePicker,
    historyPanel,
  } = props;

  return (
    /* design line 94 — query editor row outer wrapper */
    <div className={styles.editorRow}>

      {/* design line 96 — control row */}
      <div className={styles.controlRow}>

        {/* design lines 97–100 — SQL/search segmented toggle */}
        <div className={styles.modeToggle}>
          <span
            className={`${styles.modePill} ${queryMode === 'sql' ? styles.modeActive : ''}`}
            onClick={() => onModeChange('sql')}
          >
            SQL
          </span>
          <span
            className={`${styles.modePill} ${queryMode === 'search' ? styles.modeActive : ''}`}
            onClick={() => onModeChange('search')}
          >
            Search
          </span>
        </div>

        {/* design line 101 — flex spacer */}
        <span style={{ flex: 1 }} />

        {/* design lines 102–105 — histogram toggle */}
        <div className={styles.histoGroup}>
          <span>histogram</span>
          <button
            className={`${styles.toggle} ${showHistogram ? styles.toggleOn : ''}`}
            onClick={onToggleHisto}
          >
            <span className={`${styles.knob} ${showHistogram ? styles.knobOn : ''}`} />
          </button>
        </div>

        {/* design line 106 — divider */}
        <div className={styles.divider} />

        {/* design lines 107–151 — time range button + picker slot */}
        <div className={styles.timeWrap}>
          <button className={styles.timeBtn} onClick={onToggleTime}>
            {/* clock SVG — design line 109 */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent,#2dd4bf)" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            {timeRange}
            {/* chevron SVG — design line 111 */}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--tx-09)" strokeWidth="2.4">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {/* Task 6 slot */}
          {timePicker}
        </div>

        {/* design lines 152–156 — run button */}
        <button className={styles.runBtn} onClick={onRun}>
          {running ? (
            /* spinner — design line 153 */
            <span className={styles.spinner} />
          ) : (
            /* play SVG — design line 154 */
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#06181a">
              <path d="M6 4l14 8-14 8z" />
            </svg>
          )}
          {running ? 'Running' : 'Run'}
        </button>
      </div>

      {/* design line 160 — editor row */}
      <div className={styles.editorWrap}>
        {/* CodeMirror 6 editor — gutter, highlighting, and native autocomplete
            are owned by the library; the .editorInner keeps the bordered frame. */}
        <div className={styles.editorInner}>
          <SqlEditor
            ref={editorRef}
            value={query}
            mode={queryMode}
            fields={fields}
            accent={accent}
            onChange={onQueryChange}
            onRun={onRun}
          />
        </div>

        {/* design lines 168–206 — hint line */}
        <div className={styles.hintLine}>
          <span><b className={styles.hintKey}>⌘↵</b> run</span>
          <span><b className={styles.hintKey}>Tab</b> accept</span>
          <span><b className={styles.hintKey}>↑↓</b> navigate</span>
          {/* flex spacer */}
          <span style={{ flex: 1 }} />

          {/* design lines 175–204 — history button + panel slot */}
          <div className={styles.historyWrap}>
            <button
              className={styles.hintBtn}
              onClick={onToggleHistory}
              title="Query history"
            >
              {/* history SVG — design line 177 */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v5h5" />
                <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                <path d="M12 7v5l3 2" />
              </svg>
              history
            </button>
            {/* Task 7 slot */}
            {historyPanel}
          </div>

          {/* design line 205 — syntax guide button */}
          <button
            className={styles.hintBtn}
            onClick={onToggleGuide}
          >
            <span className={styles.guideQ}>?</span> syntax guide
          </button>
        </div>
      </div>
    </div>
  );
}
