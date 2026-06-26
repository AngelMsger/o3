import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import App from './App';

window.addEventListener('contextmenu', (e) => {
  const el = e.target as HTMLElement | null;
  // allow the native menu only inside editable fields (copy/paste/select)
  if (el && el.closest('input, textarea, [contenteditable="true"]')) return;
  e.preventDefault();
});

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
