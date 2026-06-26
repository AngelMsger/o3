import type { ReactElement } from 'react';
import styles from './ResultsHeader.module.css';

// Design lines 306-322

interface ResultsHeaderProps {
  shownCount: number;
  totalEvents: string;
  queryMs: number;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export function ResultsHeader({ shownCount, totalEvents, queryMs, page, totalPages, onPrev, onNext }: ResultsHeaderProps): ReactElement {
  return (
    <div className={styles.header}>
      {/* Showing N of total — design line 308 */}
      <span className={styles.showing}>
        Showing <b className={styles.showingNum}>1-{shownCount}</b> of{' '}
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

      {/* Pagination — design lines 315-321; functional prev/next with page X / Y display */}
      <div className={styles.pages}>
        <button
          className={styles.pageBtn}
          onClick={onPrev}
          disabled={page <= 1}
          style={page <= 1 ? { opacity: 0.35, cursor: 'default' } : undefined}
        >
          &#8249;
        </button>
        <span className={styles.pageActive}>{page} / {totalPages}</span>
        <button
          className={styles.pageBtn}
          onClick={onNext}
          disabled={page >= totalPages}
          style={page >= totalPages ? { opacity: 0.35, cursor: 'default' } : undefined}
        >
          &#8250;
        </button>
      </div>
    </div>
  );
}
