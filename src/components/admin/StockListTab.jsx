import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';
import { qtyClass } from '../../lib/format.js';
import { downloadStockList } from '../../lib/export.js';

const COLUMNS = [
  { key: 'sap_code',    label: 'SAP Code' },
  { key: 'type',        label: 'Type' },
  { key: 'quantity',    label: 'Qty' },
  { key: 'description', label: 'Description' }
];

export default function StockListTab() {
  const [all, setAll]       = useState([]);
  const [status, setStatus] = useState('loading');
  const [text, setText]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [sortKey, setSortKey] = useState('sap_code');
  const [sortAsc, setSortAsc] = useState(true);
  const showToast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.items();
        if (!cancelled) { setAll(data); setStatus('ready'); }
      } catch (e) {
        if (!cancelled) setStatus(`Failed to load inventory. ${e.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Single source of truth for what is on screen — the table and the
  // download buttons both read this, so they can no longer drift apart.
  const visible = useMemo(() => {
    const q = text.toLowerCase();
    const filtered = all.filter(item => {
      const matchText = !q ||
        item.sap_code.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q);
      const matchStatus =
        statusFilter === 'all'   ? true :
        statusFilter === 'ok'    ? item.quantity > 3 :
        statusFilter === 'low'   ? (item.quantity > 0 && item.quantity <= 3) :
        statusFilter === 'empty' ? item.quantity === 0 : true;
      const matchType = typeFilter === 'all' || (item.type || '').toUpperCase() === typeFilter;
      return matchText && matchStatus && matchType;
    });

    return filtered.sort((a, b) => {
      let va = a[sortKey] ?? '', vb = b[sortKey] ?? '';
      if (sortKey === 'quantity') { va = Number(va); vb = Number(vb); }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [all, text, statusFilter, typeFilter, sortKey, sortAsc]);

  const emptyCount = all.filter(i => i.quantity === 0).length;
  const lowCount   = all.filter(i => i.quantity > 0 && i.quantity <= 3).length;

  function sort(key) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  function download(format) {
    if (!all.length) { showToast('Load stock list first', 'error'); return; }
    downloadStockList(visible, format, showToast);
  }

  return (
    <>
      <div className="stock-list-controls">
        <input className="stock-filter" type="text" placeholder="Filter by SAP code or description..."
          value={text} onChange={e => setText(e.target.value)} />
        <select className="stock-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All items</option>
          <option value="ok">In stock</option>
          <option value="low">Low (≤3)</option>
          <option value="empty">Out of stock</option>
        </select>
        <select className="stock-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="IOX">IOX</option>
          <option value="EOX">EOX</option>
        </select>
        <button className="download-btn" onClick={() => download('csv')} title="Download CSV">⬇ CSV</button>
        <button className="download-btn" onClick={() => download('xlsx')} title="Download Excel">⬇ Excel</button>
      </div>

      <div className="stock-summary">
        {status === 'ready' && `${visible.length} of ${all.length} items shown  ·  ${emptyCount} out of stock  ·  ${lowCount} low stock`}
      </div>

      <div className="stock-table-wrap">
        {status !== 'ready' ? (
          <div className="stock-loading">{status === 'loading' ? 'Loading inventory...' : status}</div>
        ) : (
          <table className="stock-table" id="stockTable">
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key} onClick={() => sort(col.key)} className={sortKey === col.key ? 'sorted' : ''}>
                    {col.label} <span className="sort-arrow">{sortKey === col.key ? (sortAsc ? '↑' : '↓') : '↕'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
                  No items match filter
                </td></tr>
              ) : visible.map(item => {
                const type = (item.type || '').toString().trim().toUpperCase();
                return (
                  <tr key={item.sap_code}>
                    <td className="td-sap">{item.sap_code}</td>
                    <td>{type
                      ? <span className={`type-badge ${type}`}>{type}</span>
                      : <span style={{ color: 'var(--muted)', fontSize: '11px' }}>—</span>}</td>
                    <td className={`td-qty ${qtyClass(item.quantity)}`}>{item.quantity}</td>
                    <td className="td-desc">{item.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
