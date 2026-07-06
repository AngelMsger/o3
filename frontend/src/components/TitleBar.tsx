/* TitleBar — design/Observe.dc.html lines 98-133.
   Native macOS traffic lights are provided by the OS (mac.TitleBarHiddenInset);
   the bar is left-padded to clear them, and the bar is the window drag region.
   The context switcher moved into the query toolbar (see ContextSwitcher) in the
   design refresh, so the title bar now carries just the brand and avatar. The
   brand mark is the log-lines app icon (see BrandMark), theme-aware to match. */
import styles from './TitleBar.module.css';
import { BrandMark } from './BrandMark';

export function TitleBar({ isDark }: { isDark: boolean }) {
  return (
    <div className={`${styles.bar} oo-drag`}>
      <div className={styles.brand}>
        <span className="oo-no-drag" style={{ display: 'flex' }}>
          <BrandMark variant={isDark ? 'void' : 'signal'} />
        </span>
        <span className={styles.name}>o3</span>
        <span className={styles.crumb}>/ Logs</span>
      </div>
      <div style={{ flex: 1 }} />

      <div className={`${styles.avatar} oo-no-drag`}>JD</div>
    </div>
  );
}
