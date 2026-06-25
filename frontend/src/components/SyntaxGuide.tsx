/* SyntaxGuide — design/Observe.dc.html lines 653–680 */
import type { ReactElement } from 'react';
import type { GuideSection } from '../types';
import styles from './SyntaxGuide.module.css';

interface SyntaxGuideProps {
  open: boolean;
  sections: GuideSection[];
  onClose: () => void;
  onUse: (code: string) => void;
}

export function SyntaxGuide({
  open,
  sections,
  onClose,
  onUse,
}: SyntaxGuideProps): ReactElement | null {
  if (!open) return null;

  return (
    /* Overlay backdrop — design line 655 */
    <div className={styles.overlay} onClick={onClose}>
      {/* Inner panel — design line 656, stops propagation so backdrop click doesn't close on panel */}
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Panel header — design line 657 */}
        <div className={styles.panelHeader}>
          <span className={styles.headerIcon}>?</span>
          <span className={styles.headerTitle}>SQL syntax guide</span>
          <span className={styles.headerSpacer} />
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Scrollable body — design line 663 (oo-scroll) */}
        <div className={`${styles.body} oo-scroll`}>
          {/* 2-col grid — design line 664 */}
          <div className={styles.grid}>
            {sections.map((g) => (
              <div key={g.title}>
                {/* Section title — design line 667 */}
                <div className={styles.sectionTitle}>{g.title}</div>

                {/* Snippet items — design lines 668–673 */}
                {g.items.map((it) => (
                  <div
                    key={it.code}
                    className={styles.snippetCard}
                    onClick={() => onUse(it.code)}
                  >
                    <div className={styles.snippetCode}>{it.code}</div>
                    <div className={styles.snippetNote}>{it.note}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
