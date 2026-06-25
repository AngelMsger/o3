import styles from './App.module.css';

function App() {
  return (
    <div className={`${styles.shell} oo-drag`}>
      <div className={`${styles.card} oo-no-drag`}>
        {/* content added by later tasks */}
      </div>
    </div>
  );
}

export default App;
