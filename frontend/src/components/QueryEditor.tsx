/* QueryEditor — design/Observe.dc.html lines 93–207 */
import type { ReactElement, ReactNode, RefObject } from 'react';
import styles from './QueryEditor.module.css';
import { highlight } from '../lib/format';
import type { QueryMode } from '../types';

export interface QueryEditorProps {
  query: string;
  queryMode: QueryMode;
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
  onEditorFocus?: () => void;
  onEditorBlur?: () => void;
  timePicker?: ReactNode;
  historyPanel?: ReactNode;
  autocomplete?: ReactNode;
  caretHint?: string;
  textareaRef?: RefObject<HTMLTextAreaElement>;
  onCaretChange?: (pos: number) => void;
}

export function QueryEditor(props: QueryEditorProps): ReactElement {
  const {
    query,
    queryMode,
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
    onEditorFocus,
    onEditorBlur,
    timePicker,
    historyPanel,
    autocomplete,
    caretHint,
    textareaRef,
    onCaretChange,
  } = props;

  /* line-number gutter — design line 163 */
  const lineNos = query.split('\n').map((_, i) => i + 1);

  /* syntax-highlighted spans — design line 165 */
  const highlighted = highlight(query);

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
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7282" strokeWidth="2.4">
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
        <div className={styles.editorInner}>

          {/* design lines 162–164 — line-number gutter */}
          <div className={styles.gutter}>
            {lineNos.map((ln) => (
              <span key={ln} className={styles.lineNo}>{ln}</span>
            ))}
          </div>

          {/* design line 165 — syntax-highlighted pre */}
          <pre className={styles.pre}>
            {highlighted.map((part, i) => (
              <span key={i} style={{ color: part.color }}>{part.txt}</span>
            ))}
          </pre>

          {/* design line 166 — transparent overlaid textarea */}
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={query}
            onChange={(e) => { onQueryChange(e.target.value); onCaretChange?.(e.target.selectionStart); }}
            onFocus={onEditorFocus}
            onBlur={onEditorBlur}
            onSelect={(e) => onCaretChange?.((e.target as HTMLTextAreaElement).selectionStart)}
            onKeyUp={(e) => onCaretChange?.((e.target as HTMLTextAreaElement).selectionStart)}
            onClick={(e) => onCaretChange?.((e.target as HTMLTextAreaElement).selectionStart)}
            spellCheck={false}
            wrap="soft"
          />
        </div>

        {/* autocomplete anchor — design lines 208–214 (Task 7 slot) */}
        {autocomplete}

        {/* design lines 168–206 — hint line */}
        <div className={styles.hintLine}>
          <span><b className={styles.hintKey}>⌘↵</b> run</span>
          <span><b className={styles.hintKey}>Tab</b> accept</span>
          <span><b className={styles.hintKey}>↑↓</b> navigate</span>
          <span style={{ color: 'var(--accent,#2dd4bf)' }}>{caretHint ?? ''}</span>
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
