import type { ReactElement } from 'react';
import type { Suggestion } from '../types';
import { hexA } from '../lib/format';
import styles from './Autocomplete.module.css';

export interface AutocompleteProps {
  open: boolean;
  currentWord: string;
  suggestions: Suggestion[];
  activeIndex: number;
  onSelect: (s: Suggestion) => void;
  onHover: (i: number) => void;
}

export function Autocomplete({
  open,
  currentWord,
  suggestions,
  activeIndex,
  onSelect,
  onHover,
}: AutocompleteProps): ReactElement | null {
  if (!open) return null;
  return (
    /* panel — design lines 209–227 */
    <div className={styles.panel}>
      {/* header — design lines 210–212 */}
      <div className={styles.header}>
        <span>SUGGESTIONS · &quot;{currentWord}&quot;</span>
        <span>{suggestions.length}</span>
      </div>
      {/* scrollable list — design lines 213–225 */}
      <div className={`oo-scroll ${styles.list}`}>
        {suggestions.map((s, i) => (
          <div
            key={i}
            className={`${styles.row}${i === activeIndex ? ` ${styles.rowActive}` : ''}`}
            onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
            onMouseEnter={() => onHover(i)}
          >
            {/* badge — design line 217 */}
            <span
              className={styles.badge}
              style={{ background: hexA(s.color, 0.16), color: s.color }}
            >
              {s.tag}
            </span>
            <span className={styles.label}>{s.label}</span>
            {/* flex spacer */}
            <span style={{ flex: 1 }} />
            <span className={styles.detail}>{s.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
