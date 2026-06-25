import { useState } from 'react';
import styles from './App.module.css';
import { TitleBar } from './components/TitleBar';
import { NavRail } from './components/NavRail';

function App() {
  const [activeNav, setActiveNav] = useState<string>('Logs');
  const [, setSettingsOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        {/* TitleBar — design line 41 */}
        <TitleBar />

        {/* BODY flex row — design line 61 */}
        <div className={styles.body}>
          {/* NavRail — design line 64 */}
          <NavRail
            activeNav={activeNav}
            onPick={setActiveNav}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {/* main column placeholder — design line 75 */}
          <div className={styles.main} />
        </div>
      </div>
    </div>
  );
}

export default App;
