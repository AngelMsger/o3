import type { ReactElement } from 'react';
import styles from './ResultsHeader.module.css';

// Design lines 306–322

interface ResultsHeaderProps {
  shownCount: number;
  totalEvents: string;
  queryMs: number;
}

export function ResultsHeader({ shownCount, totalEvents, queryMs }: ResultsHeaderProps): ReactElement {
  return (
    <div className={styles.header}>
      {/* Showing N of total — design line 308 */}
      <span className={styles.showing}>
        Showing <b className={styles.showingNum}>1–{shownCount}</b> of{' '}
        <b className={styles.showingNum}>{totalEvents}</b> events
      </span>

      <span className={styles.sep}>·</span>

      {/* Query ms — design line 310 */}
      <span className={styles.queryMs}>{queryMs} ms</span>

      <span className={styles.sep}>·</span>

      {/* Scan size — design line 312 */}
      <span className={styles.scan}>scan 1.74 GB</span>

      {/* Spacer — design line 313 */}
      <span className={styles.spacer} />

      {/* Timezone — design line 314 */}
      <span className={styles.tz}>Asia/Shanghai</span>

      {/* Pagination — design lines 315–321 */}
      <div className={styles.pages}>
        <button className={styles.pageBtn}>‹</button>
        <span className={styles.pageActive}>1</span>
        <button className={styles.pageInactive}>2</button>
        <button className={styles.pageInactive}>3</button>
        <button className={styles.pageBtn}>›</button>
      </div>
    </div>
  );
}
