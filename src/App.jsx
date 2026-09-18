import { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header.jsx';
import SearchSection from './components/SearchSection.jsx';
import ItemCard from './components/ItemCard.jsx';
import AdminPanel from './components/admin/AdminPanel.jsx';
import { api } from './api/client.js';
import { useToast } from './hooks/useToast.jsx';
import { useNoWheel } from './hooks/useNoWheel.js';

export default function App() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState(null);
  const [selected, setSelected]   = useState(null);
  const searchRef = useRef(null);
  const showToast = useToast();

  useNoWheel();

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
      if ((e.key === 'f' || e.key === '/') && document.activeElement !== searchRef.current) {
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
      await fetchItems(query.trim());
      return true;
    } catch (err) {
      showToast(err.data?.error || err.message || 'Error', 'error');
      return false;
    }
  }

  // Admin panel takes over the view entirely, as it did before.
  const showSearch  = !adminOpen;
  const showResults = !adminOpen && results !== null;
  const showEmpty   = !adminOpen && results === null;

  return (
    <>
      <Header adminOpen={adminOpen} onToggleAdmin={toggleAdmin} />
      <main>
        <AdminPanel open={adminOpen} onStockChanged={() => query.trim() && fetchItems(query.trim())} />

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
                  onDeduct={handleDeduct} />
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
