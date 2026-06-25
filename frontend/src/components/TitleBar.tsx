/* TitleBar — design/Observe.dc.html lines 41–58.
   Native macOS traffic lights are provided by the OS (mac.TitleBarHiddenInset);
   the bar is left-padded to clear them, and the bar is the window drag region. */
import styles from './TitleBar.module.css';

export function TitleBar() {
  return (
    <div className={`${styles.bar} oo-drag`}>
      <div className={styles.brand}>
        <span className={`${styles.logo} oo-no-drag`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06181a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h4l3 8 4-16 3 8h6" />
          </svg>
        </span>
        <span className={styles.name}>o3</span>
        <span className={styles.crumb}>/ Logs</span>
      </div>
      <div style={{ flex: 1 }} />
      <div className={`${styles.avatar} oo-no-drag`}>JD</div>
    </div>
  );
}
