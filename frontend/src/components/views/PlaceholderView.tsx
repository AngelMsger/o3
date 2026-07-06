import type { ReactElement } from 'react';
import styles from './PlaceholderView.module.css';

export interface PlaceholderViewProps {
  title: string;
  subtitle?: string;
}

// PlaceholderView is the titled empty state shown for nav sections that are
// scaffolded but not yet built (Metrics, Traces, Dashboards, Streams, Alerts).
// The Metrics view replaces its placeholder in Phase 5.
export function PlaceholderView({ title, subtitle }: PlaceholderViewProps): ReactElement {
  return (
    <div className={styles.view}>
      <div className={styles.inner}>
        <div className={styles.badge}>Coming Soon</div>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.subtitle}>{subtitle ?? `The ${title} view is on the way.`}</p>
      </div>
    </div>
  );
}
