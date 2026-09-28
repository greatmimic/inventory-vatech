import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api/client.js';
import './styles/login.css';
import logoLight from './assets/vatech-america-logo.png';
import logoDark from './assets/vatech-america-logo-dark.png';

// The saved theme is applied to <html> by an inline script in login.html before first paint.
const logo = document.documentElement.dataset.theme === 'light' ? logoLight : logoDark;

function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(email, password);
      window.location.href = '/';
    } catch (err) {
      setError(err.status ? (err.data?.error || 'Login failed') : 'Network error — please try again');
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="logo">
        <img className="logo-img" src={logo} alt="Vatech America" />
        <span>INVENTORY</span>
      </div>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required placeholder="you@vatech.com"
          value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required placeholder="••••••••"
          value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? 'SIGNING IN...' : 'SIGN IN'}</button>
        <div className="error">{error}</div>
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Login /></StrictMode>
);
