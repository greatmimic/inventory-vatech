import { useState, useCallback, useRef, useEffect } from 'react';
import AddStockTab from './AddStockTab.jsx';
import DeductTab from './DeductTab.jsx';
import NewItemTab from './NewItemTab.jsx';
import RemoveItemTab from './RemoveItemTab.jsx';
import StockListTab from './StockListTab.jsx';
import TrendsTab from './TrendsTab.jsx';
import ReorderTab from './ReorderTab.jsx';
import FirmwareAdminTab from './FirmwareAdminTab.jsx';
import { api } from '../../api/client.js';

const TABS = [
  { id: 'add-stock',  label: 'Add Stock' },
  { id: 'deduct',     label: 'Deduct' },
  { id: 'new-item',   label: 'New Item' },
  { id: 'remove-item', label: 'Remove Item' },
  { id: 'stock-list', label: 'Stock List' },
  { id: 'trends',     label: 'Trends' },
  { id: 'reorder',    label: 'Reorder' },
  { id: 'firmware',   label: 'Versions' }
];

export default function AdminPanel({ open, onStockChanged, reorderFocus, onReorderFocused }) {
  const [active, setActive] = useState('add-stock');
  const [cache, setCache]   = useState([]);
  const loading = useRef(false);

  // The header's reorder alerts open this tab; the tab then searches for the part.
  useEffect(() => { if (reorderFocus) setActive('reorder'); }, [reorderFocus]);

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
      <div className={`tab-content${active === 'remove-item' ? ' active' : ''}`}>
        <RemoveItemTab cache={cache} ensureCache={ensureCache} onDone={invalidate} />
      </div>
      <div className={`tab-content${active === 'stock-list' ? ' active' : ''}`}>
        {active === 'stock-list' && <StockListTab />}
      </div>
      <div className={`tab-content${active === 'trends' ? ' active' : ''}`}>
        {active === 'trends' && <TrendsTab onStockChanged={invalidate} />}
      </div>
      <div className={`tab-content${active === 'reorder' ? ' active' : ''}`}>
        {active === 'reorder' && <ReorderTab focus={reorderFocus} onFocused={onReorderFocused} onChanged={onStockChanged} />}
      </div>
      <div className={`tab-content${active === 'firmware' ? ' active' : ''}`}>
        {active === 'firmware' && <FirmwareAdminTab />}
      </div>
    </div>
  );
}
