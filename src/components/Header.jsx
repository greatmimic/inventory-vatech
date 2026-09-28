import { useState } from 'react';
import { api } from '../api/client.js';
import ReorderAlerts from './ReorderAlerts.jsx';
import logoLight from '../assets/vatech-america-logo.png';
import logoDark from '../assets/vatech-america-logo-dark.png';

export default function Header({ isAdmin, adminOpen, onToggleAdmin, alerts, onRefreshAlerts, onPickAlert, onOpenReorder }) {
  // The saved theme is applied to <html> by an inline script in index.html before first paint.
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
    setTheme(next);
  }

  async function handleLogout() {
    try { await api.logout(); } catch {}
    window.location.href = '/login.html';
  }

  return (
    <header>
      <div className="logo">
        <img className="logo-img" src={theme === 'dark' ? logoDark : logoLight} alt="Vatech America" />
        <span>/ INVENTORY</span>
      </div>
      <div className="header-right">
        {isAdmin && <ReorderAlerts alerts={alerts} onRefresh={onRefreshAlerts} onPick={onPickAlert} onOpenReorder={onOpenReorder} />}
        <button className="admin-btn" onClick={toggleTheme}>{theme === 'dark' ? 'LIGHT' : 'DARK'}</button>
        {isAdmin && <button className={`admin-btn${adminOpen ? ' active' : ''}`} onClick={onToggleAdmin}>ADMIN</button>}
        <button className="admin-btn" style={{ color: 'var(--muted)' }} onClick={handleLogout}>LOGOUT</button>
      </div>
    </header>
  );
}
