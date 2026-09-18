import { useState, useCallback, useRef } from 'react';
import AddStockTab from './AddStockTab.jsx';
import DeductTab from './DeductTab.jsx';
import NewItemTab from './NewItemTab.jsx';
import StockListTab from './StockListTab.jsx';
import TrendsTab from './TrendsTab.jsx';
import { api } from '../../api/client.js';

const TABS = [
  { id: 'add-stock',  label: 'Add Stock' },
  { id: 'deduct',     label: 'Deduct' },
  { id: 'new-item',   label: 'New Item' },
  { id: 'stock-list', label: 'Stock List' },
  { id: 'trends',     label: 'Trends' }
];

export default function AdminPanel({ open, onStockChanged }) {
  const [active, setActive] = useState('add-stock');
  const [cache, setCache]   = useState([]);
  const loading = useRef(false);

  // Full inventory, fetched once and shared by both SAP autocompletes.
  const ensureCache = useCallback(async () => {
    if (cache.length || loading.current) return;
    loading.current = true;
    try { setCache(await api.items()); } catch {} finally { loading.current = false; }
  }, [cache.length]);

  const invalidate = useCallback(() => {
    setCache([]);
    onStockChanged?.();
  }, [onStockChanged]);

  return (
    <div id="adminPanel" className={open ? 'open' : ''}>
      <div className="admin-title">⬡ Admin Panel</div>
      <div className="admin-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn${active === t.id ? ' active' : ''}`}
            onClick={() => setActive(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className={`tab-content${active === 'add-stock' ? ' active' : ''}`}>
        <AddStockTab cache={cache} ensureCache={ensureCache} onDone={invalidate} />
      </div>
      <div className={`tab-content${active === 'deduct' ? ' active' : ''}`}>
        <DeductTab cache={cache} ensureCache={ensureCache} onDone={invalidate} />
      </div>
      <div className={`tab-content${active === 'new-item' ? ' active' : ''}`}>
        <NewItemTab onDone={invalidate} />
      </div>
      <div className={`tab-content${active === 'stock-list' ? ' active' : ''}`}>
        {active === 'stock-list' && <StockListTab />}
      </div>
      <div className={`tab-content${active === 'trends' ? ' active' : ''}`}>
        {active === 'trends' && <TrendsTab />}
      </div>
    </div>
  );
}
