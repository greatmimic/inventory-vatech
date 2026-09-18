import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';
import { isoDate } from '../../lib/format.js';
import { downloadTrends } from '../../lib/export.js';

const PRESETS = [
  { label: '7D',  days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y',  days: 365 },
  { label: 'ALL', days: 'all' }
];

function rangeFor(days) {
  const today = new Date();
  const from  = new Date(today);
  if (days === 'all') from.setFullYear(from.getFullYear() - 20);
  else from.setDate(from.getDate() - days);
  return { from: isoDate(from), to: isoDate(today) };
}

export default function TrendsTab() {
  const initial = rangeFor(7);
  const [from, setFrom]       = useState(initial.from);
  const [to, setTo]           = useState(initial.to);
  const [preset, setPreset]   = useState(7);
  const [data, setData]       = useState([]);
  const [status, setStatus]   = useState('idle');
  const showToast = useToast();

  const load = useCallback(async (f, t) => {
    if (!f || !t) return;
    setStatus('loading');
    try {
      const fromISO = new Date(f).toISOString();
      const toISO   = new Date(t + 'T23:59:59').toISOString();
      setData(await api.trends(fromISO, toISO));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(initial.from, initial.to); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(p) {
    const r = rangeFor(p.days);
    setPreset(p.days);
    setFrom(r.from);
    setTo(r.to);
    load(r.from, r.to);
  }

  async function remove(code) {
    if (!confirm(`Remove all usage log entries for ${code}? This cannot be undone.`)) return;
    try {
      await api.deleteTrend(code);
      showToast(`✓ Removed log entries for ${code}`, 'success');
      load(from, to);
    } catch {
      showToast('Failed to delete', 'error');
    }
  }

  function download(format) {
    if (!from || !to) { showToast('Select a date range first', 'error'); return; }
    downloadTrends({ from, to, stockRows: data, format, showToast });
  }

  const totalUnits = data.reduce((s, r) => s + r.total_used, 0);
  const totalTxns  = data.reduce((s, r) => s + r.times_used, 0);
  const maxQty     = data.length ? data[0].total_used : 0;

  return (
    <>
      <div className="trends-range-wrap">
        <div className="trends-presets">
          {PRESETS.map(p => (
            <button key={p.label} className={`preset-btn${preset === p.days ? ' active' : ''}`}
              onClick={() => applyPreset(p)}>{p.label}</button>
          ))}
        </div>
        <div className="trends-date-range">
          <div className="date-field-wrap">
            <label className="form-label" style={{ marginBottom: '4px' }}>From</label>
            <input type="date" className="date-input" value={from}
              onChange={e => { setFrom(e.target.value); setPreset(null); }} />
          </div>
          <div className="date-sep">→</div>
          <div className="date-field-wrap">
            <label className="form-label" style={{ marginBottom: '4px' }}>To</label>
            <input type="date" className="date-input" value={to}
              onChange={e => { setTo(e.target.value); setPreset(null); }} />
          </div>
          <button className="admin-submit" style={{ marginTop: '18px', height: '40px', padding: '0 16px', width: 'auto' }}
            onClick={() => load(from, to)}>Apply</button>
          <button className="download-btn" style={{ marginTop: '18px' }} onClick={() => download('csv')} title="Download CSV">⬇ CSV</button>
          <button className="download-btn" style={{ marginTop: '18px' }} onClick={() => download('xlsx')} title="Download Excel">⬇ Excel</button>
        </div>
      </div>

      <div className="stock-summary">
        {status === 'ready' && data.length > 0 &&
          `${data.length} parts used · ${totalUnits} total units · ${totalTxns} transactions · ${from} → ${to}`}
      </div>

      <div className="stock-table-wrap">
        {status === 'loading' && <div className="stock-loading">Loading trends...</div>}
        <table className="stock-table" id="trendsTable">
          <thead>
            <tr>
              <th>SAP Code</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Units Used</th>
              <th style={{ textAlign: 'right' }}>Times</th>
              <th style={{ textAlign: 'right' }}>Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {status === 'error' ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
                Failed to load trends
              </td></tr>
            ) : status === 'ready' && data.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
                No usage recorded in this period
              </td></tr>
            ) : data.map((row, i) => {
              const pct = maxQty ? Math.round((row.total_used / maxQty) * 100) : 0;
              const stockStyle =
                row.current_stock === null ? {} :
                row.current_stock === 0 ? { color: 'var(--danger)' } :
                row.current_stock <= 3 ? { color: 'var(--warn)' } : { color: 'var(--success)' };
              return (
                <tr key={row.sap_code}>
                  <td className="td-sap">{row.sap_code}</td>
                  <td className="td-desc">
                    {row.description}
                    <div className="trend-bar-wrap">
                      <div className="trend-bar-bg"><div className="trend-bar-fill" style={{ width: `${pct}%` }} /></div>
                      <span className="trend-rank">#{i + 1}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, color: 'var(--accent2)', whiteSpace: 'nowrap' }}>{row.total_used}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{row.times_used}×</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', ...stockStyle }}>
                    {row.current_stock ?? '—'}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => remove(row.sap_code)} title="Remove all log entries for this item"
                      style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontFamily: 'var(--mono)' }}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
