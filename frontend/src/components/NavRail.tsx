/* NavRail — design/Observe.dc.html lines 63–72 */
import styles from './NavRail.module.css';
import { NAV } from '../data/mock';
import type { NavItem } from '../types';
import type { ReactElement } from 'react';

/* SVG paths from design lines 711–716, rendered with common wrapper attrs */
const ICONS: Record<NavItem['icon'], ReactElement> = {
  logs: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  ),
  metrics: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V9M9 19V5M14 19v-8M19 19v-5" />
    </svg>
  ),
  traces: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v12a4 4 0 0 0 4 4h4M6 9h12" />
    </svg>
  ),
  dash: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v7h-7zM3 14h7v7H3z" />
    </svg>
  ),
  streams: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4" />
    </svg>
  ),
  alerts: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  ),
};

export function NavRail({ activeNav, onPick, onOpenSettings }: {
  activeNav: string;
  onPick: (name: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className={styles.rail}>
      {NAV.map((n) => (
        <button
          key={n.name}
          title={n.soon ? `${n.name} · coming soon` : n.name}
          className={`${styles.btn} ${activeNav === n.name ? styles.active : ''} ${n.soon ? styles.soon : ''}`}
          onClick={() => !n.soon && onPick(n.name)}
        >
          {ICONS[n.icon]}
          {n.soon && <span className={styles.dot} />}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      {/* settings gear — design line 69–71 */}
      <button className={styles.gear} title="Settings" onClick={onOpenSettings}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
