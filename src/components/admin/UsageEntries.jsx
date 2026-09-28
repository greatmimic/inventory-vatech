import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';
import { parseUsedAt } from '../../lib/format.js';

const day = (iso) => parseUsedAt(iso).date;

// A corrected date keeps the entry's time of day, and is never later than now.
function onDay(usedAt, date) {
  const d = new Date(usedAt);
  const [y, m, dd] = date.split('-').map(Number);
  d.setFullYear(y, m - 1, dd);
  return (d > new Date() ? new Date() : d).toISOString();
}

function history(c) {
  const by = `${c.corrected_by || 'unknown'} on ${day(c.corrected_at)}`;
  return c.action === 'delete'
    ? `${c.old_quantity} on ${day(c.old_used_at)} deleted by ${by}`
    : `${c.old_quantity} on ${day(c.old_used_at)} → ${c.new_quantity} on ${day(c.new_used_at)}, by ${by}`;
}

function StockChange({ stock, change }) {
  if (stock == null) return <span className="usage-stock">Part was removed from inventory — no stock to change</span>;
  const after = stock + change;
  return <span className={`usage-stock${after < 0 ? ' bad' : ''}`}>Stock {stock} → {after}{after < 0 ? ' — not enough stock' : ''}</span>;
}

// One part's usage entries in the Trends range, each correctable. Buttons ask inline, since some browsers block confirm().
export default function UsageEntries({ code, fromISO, toISO, stock, onChanged }) {
  const [data, setData]         = useState(null);   // { entries, deleted }
  const [failed, setFailed]     = useState(false);
  const [editing, setEditing]   = useState(null);   // { id, qty, date }
  const [deleting, setDeleting] = useState(null);   // entry id
  const [busy, setBusy]         = useState(false);
  const showToast = useToast();

  const load = useCallback(async () => {
    try { setData(await api.usageEntries(code, fromISO, toISO)); setFailed(false); }
    catch { setFailed(true); }
  }, [code, fromISO, toISO]);
  useEffect(() => { load(); }, [load]);

  async function run(action, message) {
    setBusy(true);
    try {
      await action();
      showToast(message, 'success');
      setEditing(null);
      setDeleting(null);
      await load();
      onChanged();
    } catch (e) {
      showToast(e.data?.error || 'Connection error', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (failed) return <div className="usage-entries usage-note bad">Failed to load entries</div>;
  if (!data)  return <div className="usage-entries usage-note">Loading entries…</div>;

  const today = parseUsedAt(new Date()).date;

  return (
    <div className="usage-entries">
      {data.entries.length === 0 && <div className="usage-note">No entries in this period</div>}
      {data.entries.map(e => {
        const { date, hour } = parseUsedAt(e.used_at);
        const first = e.corrections[0];
        const edit  = editing?.id === e.id ? editing : null;
        const qty   = edit ? parseInt(edit.qty) : e.quantity;
        const valid = edit && qty > 0 && String(qty) === String(edit.qty).trim() && edit.date && edit.date <= today;
        const changed = edit && valid && (qty !== e.quantity || edit.date !== date);
        return (
          <div key={e.id} className={`usage-entry${edit || deleting === e.id ? ' active' : ''}`}>
            {edit ? (
              <>
                <input type="date" className="date-input usage-date" value={edit.date} max={today}
                  onChange={ev => setEditing({ ...edit, date: ev.target.value })} />
                <span className="usage-time">{hour}</span>
                <input type="number" className="usage-qty-input" min="1" value={edit.qty}
                  onChange={ev => setEditing({ ...edit, qty: ev.target.value })} />
                {valid && <StockChange stock={stock} change={e.quantity - qty} />}
                <span className="usage-actions">
                  <button disabled={busy || !changed || (stock != null && stock + e.quantity - qty < 0)}
                    onClick={() => run(() => api.correctUsage(e.id, qty, onDay(e.used_at, edit.date)), `✓ Corrected entry for ${code}`)}>Save</button>
                  <button disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                </span>
              </>
            ) : (
              <>
                <span className="usage-date">{date}</span>
                <span className="usage-time">{hour}</span>
                <span className="usage-qty">{e.quantity}</span>
                <span className="usage-by">{e.used_by || '—'}</span>
                {first && (
                  <span className="usage-corrected" title={e.corrections.map(history).join('\n')}>
                    corrected · was {first.old_quantity}{day(first.old_used_at) !== date ? ` on ${day(first.old_used_at)}` : ''}
                  </span>
                )}
                {deleting === e.id ? (
                  <span className="usage-actions confirming">
                    Delete this entry? <StockChange stock={stock} change={e.quantity} />
                    <button disabled={busy} onClick={() => run(() => api.deleteUsage(e.id), `✓ Deleted entry for ${code}`)}>Yes</button>
                    <button disabled={busy} onClick={() => setDeleting(null)}>No</button>
                  </span>
                ) : (
                  <span className="usage-actions">
                    <button disabled={busy} onClick={() => { setDeleting(null); setEditing({ id: e.id, qty: String(e.quantity), date }); }}>Edit</button>
                    <button disabled={busy} onClick={() => { setEditing(null); setDeleting(e.id); }}>Delete</button>
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
      {data.deleted.map(c => (
        <div key={`d${c.usage_id}`} className="usage-entry deleted" title={history(c)}>
          <span className="usage-date">{day(c.old_used_at)}</span>
          <span className="usage-time">{parseUsedAt(c.old_used_at).hour}</span>
          <span className="usage-qty">{c.old_quantity}</span>
          <span className="usage-by">deleted by {c.corrected_by || 'unknown'} on {day(c.corrected_at)}</span>
        </div>
      ))}
    </div>
  );
}
