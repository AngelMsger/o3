/* FieldsPanel — design lines 233–289 */

import type { CSSProperties, ReactElement } from 'react';
import type { Field, StreamInfo } from '../types';
import { hexA } from '../lib/format';
import styles from './FieldsPanel.module.css';

// Field glyph/color mapping — design script lines 1140-1146
const TYPE_GLYPH: Record<string, string> = {
  datetime: '◷',
  string: 'Aa',
  int: '#',
  bool: '⊤',
};

const TYPE_COLOR: Record<string, string> = {
  datetime: '#b58bff',
  string: 'var(--sy-str)',
  int: 'var(--sy-num)',
  bool: 'var(--sy-bool)',
};

function glyphStyle(type: string): CSSProperties {
  const color = TYPE_COLOR[type] ?? '#7c8696';
  return {
    width: '18px',
    height: '16px',
    flex: 'none',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 700,
    background: hexA(color, 0.14),
    color,
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FieldsPanelProps {
  collapsed: boolean;
  stream: string;
  streamOpen: boolean;
  streams: StreamInfo[];
  fields: Field[];
  fieldFilter: string;
  onToggleCollapse: () => void;
  onToggleStream: () => void;
  onPickStream: (name: string) => void;
  onFieldFilter: (v: string) => void;
  onInsertField: (name: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldsPanel(props: FieldsPanelProps): ReactElement {
  const {
    collapsed,
    stream,
    streamOpen,
    streams,
    fields,
    fieldFilter,
    onToggleCollapse,
    onToggleStream,
    onPickStream,
    onFieldFilter,
    onInsertField,
  } = props;

  // Filter fields by fieldFilter (case-insensitive substring)
  const filtered = fieldFilter
    ? fields.filter((f) => f.name.toLowerCase().includes(fieldFilter.toLowerCase()))
    : fields;
  const fieldCount = String(filtered.length);

  // Animated collapse: the expanded panel and the collapsed strip are BOTH
  // mounted inside a width-animating shell and crossfade. (design lines 233-289)
  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : styles.shellExpanded}`}>
      <div
        className={`${styles.panelLayer} ${collapsed ? styles.layerHidden : styles.layerShown}`}
        aria-hidden={collapsed}
      >
    <div className={styles.panel}>
      {/* stream selector — design lines 234-270 */}
      <div className={styles.streamSection}>
        <div className={styles.streamHeader}>
          <div className={styles.streamLabel}>Stream</div>
          <button
            className={styles.collapseBtn}
            onClick={onToggleCollapse}
            title="Collapse Sidebar"
          >
            «
          </button>
        </div>

        <button className={styles.streamBtn} onClick={onToggleStream}>
          {/* database SVG */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent,#2dd4bf)" strokeWidth="1.9">
            <ellipse cx="12" cy="6" rx="8" ry="3" />
            <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
            <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
          </svg>
          <span className={styles.streamName}>{stream}</span>
          {/* chevron down */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--tx-09)" strokeWidth="2.4">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* stream dropdown — shown when streamOpen=true */}
        {streamOpen && (
          <div className={`oo-scroll ${styles.dropdown}`}>
            {streams.map((s) => (
              <div
                key={s.name}
                className={`${styles.dropdownItem} ${s.name === stream ? styles.dropdownItemActive : ''}`}
                onClick={() => onPickStream(s.name)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <ellipse cx="12" cy="6" rx="8" ry="3" />
                  <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
                </svg>
                <span className={styles.dropdownItemName}>{s.name}</span>
                <span style={{ flex: 1 }} />
                <span className={styles.dropdownItemSize}>{s.size}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* field search — design lines 271-278 */}
      <div className={styles.searchSection}>
        <div className={styles.searchBox}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--tx-12)" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            className={styles.searchInput}
            value={fieldFilter}
            onChange={(e) => onFieldFilter(e.target.value)}
            placeholder="Filter Fields"
          />
          <span className={styles.searchCount}>{fieldCount}</span>
        </div>
      </div>

      {/* field list — design lines 279-280 */}
      <div className={`oo-scroll ${styles.fieldList}`}>
        {filtered.map((f) => (
          <div
            key={f.name}
            className={styles.fieldRow}
            onClick={() => onInsertField(f.name)}
          >
            <span style={glyphStyle(f.type)}>
              {TYPE_GLYPH[f.type] ?? '·'}
            </span>
            <span className={styles.fieldName}>{f.name}</span>
            <span className={styles.fieldType}>{f.type}</span>
          </div>
        ))}
      </div>
    </div>
      </div>

      {/* collapsed strip layer — design lines 281-289 */}
      <div
        className={`${styles.stripLayer} ${collapsed ? styles.layerShown : styles.layerHidden}`}
        aria-hidden={!collapsed}
      >
        <div className={styles.strip}>
          <button
            className={styles.stripBtn}
            onClick={onToggleCollapse}
            title="Expand Fields"
          >
            »
          </button>
          <div className={styles.stripLabel}>Stream &amp; fields</div>
        </div>
      </div>
    </div>
  );
}
