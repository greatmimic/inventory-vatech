import { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header.jsx';
import SearchSection from './components/SearchSection.jsx';
import ItemCard from './components/ItemCard.jsx';
import AdminPanel from './components/admin/AdminPanel.jsx';
import FirmwareView from './components/FirmwareView.jsx';
import MapView from './components/MapView.jsx';
import { api } from './api/client.js';
import { useToast } from './hooks/useToast.jsx';
import { useNoWheel } from './hooks/useNoWheel.js';

export default function App() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [view, setView]           = useState('inventory');
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState(null);
  const [selected, setSelected]   = useState(null);
  const [mapBin, setMapBin]       = useState(null);
  const [alerts, setAlerts]       = useState(null);   // { parts } needing an order, or { failed }
  const [reorderFocus, setReorderFocus] = useState(null);   // { code } to search for in the Reorder tab
  const searchRef = useRef(null);
  const showToast = useToast();

  useNoWheel();

  // Vite's dev server serves this page without Express's login gate, so check
  // the session up front; a 401 redirects to /login.html inside request().
  useEffect(() => { api.me().then(u => setIsAdmin(u?.role === 'admin')).catch(() => {}); }, []);

  // Parts the Reorder tab lists as "Order now", emptiest first. Rechecked after this admin's own
  // changes and when the page comes back into view, since others deduct from other devices.
  const loadAlerts = useCallback(() => api.reorder()
    .then(d => setAlerts({ parts: d.parts.filter(p => p.status === 'order')
      .sort((a, b) => a.stock - b.stock || a.sap_code.localeCompare(b.sap_code)) }))
    .catch(() => setAlerts({ failed: true })), []);

  useEffect(() => {
    if (!isAdmin) return;
    loadAlerts();
    const onShow = () => { if (document.visibilityState === 'visible') loadAlerts(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [isAdmin, loadAlerts]);

  function openReorder(code) {
    setAdminOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setReorderFocus({ code: code || '' });
  }

  const fetchItems = useCallback(async (q) => {
    try {
      setResults(await api.items(q));
    } catch {
      showToast('Connection error', 'error');
    }
  }, [showToast]);

  // Debounced search — 180ms, matching the original.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); setSelected(null); return; }
    const t = setTimeout(() => fetchItems(q), 180);
    return () => clearTimeout(t);
  }, [query, fetchItems]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') setQuery('');
      // Only while the search box is on screen; otherwise 'f' must type normally.
      if ((e.key === 'f' || e.key === '/') && searchRef.current && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function toggleAdmin() {
    setAdminOpen(open => {
      if (!open) window.scrollTo({ top: 0, behavior: 'smooth' });
      return !open;
    });
  }

  async function handleDeduct(code, qty) {
    try {
      const data = await api.deduct(code, qty);
      showToast(`✓ Deducted ${qty}× ${code}`, 'success');
      if (isAdmin) loadAlerts();
      await fetchItems(query.trim());
      return true;
    } catch (err) {
      showToast(err.data?.error || err.message || 'Error', 'error');
      return false;
    }
  }

  // Admin panel takes over the view entirely, as it did before.
  const inventory   = !adminOpen && view === 'inventory';
  const showSearch  = inventory;
  const showResults = inventory && results !== null;
  const showEmpty   = inventory && results === null;

  return (
    <>
      <Header isAdmin={isAdmin} adminOpen={adminOpen} onToggleAdmin={toggleAdmin}
        alerts={alerts} onRefreshAlerts={loadAlerts} onPickAlert={openReorder} onOpenReorder={() => openReorder()} />
      <main>
        <AdminPanel open={adminOpen} reorderFocus={reorderFocus} onReorderFocused={() => setReorderFocus(null)}
          onStockChanged={() => { if (query.trim()) fetchItems(query.trim()); loadAlerts(); }} />

        {!adminOpen && (
          <div className="view-tabs" role="tablist">
            {[['inventory', 'INVENTORY'], ['map', 'MAP'], ['firmware', 'VERSIONS'], ['changelog', 'CHANGELOG']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={view === id}
                className={`tab-btn${view === id ? ' active' : ''}`} onClick={() => { setView(id); setMapBin(null); }}>{label}</button>
            ))}
          </div>
        )}

        {/* One instance for both tabs, so the loaded data and filters carry over. */}
        {!adminOpen && (view === 'firmware' || view === 'changelog') && <FirmwareView changelog={view === 'changelog'} />}

        {!adminOpen && view === 'map' && <MapView initialBin={mapBin} />}

        {showSearch && (
          <SearchSection ref={searchRef} value={query} onChange={setQuery} onClear={() => { setQuery(''); searchRef.current?.focus(); }} />
        )}

        {showResults && (
          <div>
            <div className="results-header">
              <span className="results-count">{results.length} result{results.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="results-list">
              {results.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px 20px' }}>
                  <div className="icon">✕</div>
                  <p>No items found for "{query.trim()}"</p>
                </div>
              ) : results.map(item => (
                <ItemCard key={item.sap_code} item={item} query={query.trim()}
                  open={selected === item.sap_code}
                  onToggle={() => setSelected(s => s === item.sap_code ? null : item.sap_code)}
                  onDeduct={handleDeduct}
                  onOpenMap={code => { setMapBin(code); setView('map'); window.scrollTo({ top: 0 }); }} />
              ))}
            </div>
          </div>
        )}

        {showEmpty && (
          <div className="empty-state">
            <div className="icon">⌕</div>
            <p>Enter a SAP code or part name to search inventory</p>
          </div>
        )}
      </main>
    </>
  );
}
