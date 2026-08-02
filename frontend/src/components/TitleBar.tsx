/* TitleBar — design/Observe.dc.html lines 98-133.
   Native macOS traffic lights are provided by the OS (mac.TitleBarHiddenInset);
   the bar is left-padded to clear them, and the bar is the window drag region.
   The context switcher moved into the query toolbar (see ContextSwitcher) in the
   design refresh, so the title bar carries the brand, the slogan and the avatar.
   The brand mark is the o3 monogram (see BrandMark), theme-aware to match the
   Dock icon.
   The avatar shows the OS account's initials (design: `osUser`), replacing the
   mock's hardcoded "JD". o3 has no product-level sign-in, so this identifies the
   machine account — the hover title spells that out. */
import styles from './TitleBar.module.css';
import { BrandMark } from './BrandMark';
import { userInitials, userTitle } from '../lib/osUser';

export function TitleBar({ isDark, user }: { isDark: boolean; user: string }) {
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

      {/* Slogan — design/Observe.dc.html; SQL-styled, animates on hover. */}
      <span className={`${styles.slogan} oo-no-drag`} title="SELECT signal FROM noise">
        <span className={styles.kw}>SELECT</span> <span className={styles.sig}>signal</span>{' '}
        <span className={styles.kw}>FROM</span> <span className={styles.noise}>noise</span>
      </span>

      <div className={`${styles.avatar} oo-no-drag`} title={userTitle(user)}>{userInitials(user)}</div>
    </div>
  );
}
