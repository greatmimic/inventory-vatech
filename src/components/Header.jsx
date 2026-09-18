import { api } from '../api/client.js';

export default function Header({ adminOpen, onToggleAdmin }) {
  async function handleLogout() {
    try { await api.logout(); } catch {}
    window.location.href = '/login.html';
  }

  return (
    <header>
      <div className="logo">VATECH <span>/ INVENTORY</span></div>
      <div className="header-right">
        <div className="live-dot" />
        <span className="live-label">LIVE</span>
        <button className={`admin-btn${adminOpen ? ' active' : ''}`} onClick={onToggleAdmin}>ADMIN</button>
        <button className="admin-btn" style={{ color: 'var(--muted)' }} onClick={handleLogout}>LOGOUT</button>
      </div>
    </header>
  );
}
