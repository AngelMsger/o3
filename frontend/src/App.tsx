import { useState } from 'react';
import styles from './App.module.css';
import { TitleBar } from './components/TitleBar';
import { NavRail } from './components/NavRail';
import { QueryTabs } from './components/QueryTabs';
import { TABS } from './data/mock';

function App() {
  const [activeNav, setActiveNav] = useState<string>('Logs');
  const [, setSettingsOpen] = useState(false);
  const [tabs] = useState(TABS);
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);

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

          {/* main column — design line 75 */}
          <div className={styles.main}>
            {/* QueryTabs — design lines 77–91 */}
            <QueryTabs
              tabs={tabs}
              activeId={activeTab}
              onPick={setActiveTab}
              onNew={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
