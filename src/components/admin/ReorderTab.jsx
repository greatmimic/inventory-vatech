import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';
import { downloadOrderList } from '../../lib/export.js';

// Statuses in the order they're listed. "unused" parts have no levels and no use in the window.
const STATUSES = [
  { id: 'order',  label: 'Order now', tip: 'In stock + on order is at or below basement' },
  { id: 'watch',  label: 'Watch',     tip: 'In stock + on order is at or below maintain' },
  { id: 'review', label: 'Review',    tip: 'Used but has no levels, or has levels but was not used' },
  { id: 'ok',     label: 'OK',        tip: 'Above maintain' },
  { id: 'unused', label: 'Unused',    tip: 'No levels and not used' }
];
// Not statuses: each shows only its own parts, whatever their status, and turns the status chips off while on.
const MODES = [
  { id: 'onorder', label: 'On order',  tip: 'Marked as ordered and not all arrived yet', match: p => p.on_order > 0 },
  { id: 'spike',   label: 'Use spike', tip: 'Last month used more than double the usual — check whether the levels need raising', match: p => p.spike }
];
const RANK = Object.fromEntries(STATUSES.map((s, i) => [s.id, i]));
const BY_ID = Object.fromEntries(STATUSES.map(s => [s.id, s]));
// "Review" covers two cases, so a row names the one it is.
const statusOf = (p) => p.status !== 'review' ? BY_ID[p.status]
  : p.basement == null ? { label: 'No levels', tip: 'Used, but no levels are set yet' }
  : { label: 'Not used', tip: 'Has levels, but was not used in this period' };
const shortDate = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' });

export default function ReorderTab({ focus, onFocused, onChanged }) {
  const [data, setData]     = useState(null);
  const [status, setStatus] = useState('loading');
  const [text, setText]     = useState('');
  const [type, setType]     = useState('all');
  const [shown, setShown]   = useState(new Set(['order', 'watch']));
  const [mode, setMode]     = useState(null);   // replaces the status chips while on; they come back as they were
  const [picked, setPicked] = useState(new Set());   // SAP codes ticked for "Mark ordered"
  const [qtys, setQtys]     = useState({});   // Qty boxes changed by hand; dropped once that part's suggested amount changes
  const [confirmBulk, setConfirmBulk] = useState(false);
  const showToast = useToast();

  // Reloads keep the current table on screen, so saving a row doesn't flash the whole list.
  const load = useCallback(async () => {
    try {
      setData(await api.reorder());
      setStatus('ready');
    } catch (e) {
      setStatus(`Failed to load. ${e.message}`);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Opened from the header alerts: search for that part (or clear the search for the whole list).
  useEffect(() => { if (focus) { setText(focus.code); onFocused?.(); } }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const ofType = useMemo(() => (data?.parts || [])
    .filter(p => type === 'all' || (p.type || '').toUpperCase() === type), [data, type]);

  // A search looks through every status, so any part can be found to set its levels.
  const visible = useMemo(() => {
    const q = text.trim().toLowerCase();
    return ofType
      .filter(p => q ? p.sap_code.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
        : mode ? mode.match(p) : shown.has(p.status))
      .sort((a, b) => RANK[a.status] - RANK[b.status] || a.sap_code.localeCompare(b.sap_code));
  }, [ofType, text, shown, mode]);

  const counts = useMemo(() => ofType.reduce((c, p) => ({ ...c, [p.status]: (c[p.status] || 0) + 1 }),
    Object.fromEntries(MODES.map(m => [m.id, ofType.filter(m.match).length]))), [ofType]);

  function toggle(id) {
    setShown(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function run(action, done) {
    try {
      await action();
      if (done) showToast(done, 'success');
      onChanged?.();
      await load();
      return true;
    } catch (e) {
      showToast(e.message || 'Failed to save', 'error');
      return false;
    }
  }

  function exportList() {
    const list = (data?.parts || []).filter(p => p.order_qty > 0)
      .sort((a, b) => RANK[a.status] - RANK[b.status] || a.sap_code.localeCompare(b.sap_code));
    if (!list.length) { showToast('Nothing to order', 'error'); return; }
    downloadOrderList(list, showToast);
  }

  const qtyOf  = (p) => { const o = qtys[p.sap_code]; return o && o.base === p.order_qty ? o.value : (p.order_qty || ''); };
  const setQty = (p, value) => setQtys(q => ({ ...q, [p.sap_code]: { value, base: p.order_qty } }));

  // Only rows on screen with a quantity can be ticked, so nothing hidden by a filter gets marked.
  const ready     = visible.filter(p => parseInt(qtyOf(p)) > 0);
  const chosen    = ready.filter(p => picked.has(p.sap_code));
  const allPicked = ready.length > 0 && chosen.length === ready.length;

  function pick(codes, on) {
    setPicked(s => { const n = new Set(s); codes.forEach(c => on ? n.add(c) : n.delete(c)); return n; });
  }

  async function markChosen() {
    setConfirmBulk(false);
    const orders = chosen.map(p => ({ sap_code: p.sap_code, quantity: parseInt(qtyOf(p)) }));
    const n = orders.length;
    if (await run(() => api.markOrderedMany(orders), `✓ Marked ${n} part${n === 1 ? '' : 's'} as ordered`)) pick(orders.map(o => o.sap_code), false);
  }

  const searching = !!text.trim();

  return (
    <>
      <div className="stock-list-controls">
        <input className="stock-filter" type="text" placeholder="Find any part by SAP code or description..."
          value={text} onChange={e => setText(e.target.value)} />
        <select className="stock-filter-select" value={type} onChange={e => setType(e.target.value)}>
          <option value="all">All types</option>
          <option value="EOX">EOX</option>
          <option value="IOX">IOX</option>
        </select>
        <button className="download-btn" onClick={exportList} title="Parts at or below maintain, with the quantity to order">⬇ Order list</button>
      </div>

      <div className={`reorder-chips${searching ? ' searching' : ''}`}>
        {STATUSES.map(s => (
          <button key={s.id} className={`preset-btn reorder-chip ${s.id}${shown.has(s.id) && !mode ? ' active' : ''}`}
            title={s.tip} disabled={!!mode} onClick={() => toggle(s.id)}>{s.label} <span className="reorder-chip-n">{counts[s.id] || 0}</span></button>
        ))}
        {MODES.map(m => (
          <button key={m.id} className={`preset-btn reorder-chip mode ${m.id}${mode === m ? ' active' : ''}`}
            title={m.tip} onClick={() => setMode(cur => cur === m ? null : m)}>{m.label} <span className="reorder-chip-n">{counts[m.id]}</span></button>
        ))}
      </div>

      <div className="stock-summary">
        {status === 'ready' && `${visible.length} parts shown${searching ? ' · searching every status' : ''}`}
      </div>

      {status === 'ready' && (
        <div className="reorder-legend">
          <span><b>Basement</b> order when in stock + on order drops to this</span>
          <span><b>Maintain</b> start watching at this</span>
          <span><b>Suggested</b> worked out from {monthLabel(data.from)} – {monthLabel(data.to)} use, {data.lead}-month delivery</span>
        </div>
      )}

      <div className="stock-table-wrap reorder-wrap">
        {status !== 'ready' ? (
          <div className="stock-loading">{status === 'loading' ? 'Loading reorder levels...' : status}</div>
        ) : (
          <table className="stock-table reorder-table">
            <thead>
              <tr>
                <th>Part</th>
                <th style={{ textAlign: 'right' }}>In stock</th>
                <th style={{ textAlign: 'right' }} title="Average use per month over the window">Use / mo</th>
                <th>
                  <div className="reorder-levels">
                    <span title="At or below: order now">Basement</span>
                    <span title="At or below: watch">Maintain</span>
                  </div>
                </th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan="5" className="reorder-empty">{searching ? 'No parts match' : mode?.id === 'onorder' ? 'Nothing on order'
                  : mode ? 'No use spikes last month' : 'Nothing here — pick another status above'}</td></tr>
              ) : visible.map(p => <ReorderRow key={p.sap_code} part={p} run={run} lastMonth={monthLabel(data.to)}
                qty={qtyOf(p)} setQty={v => setQty(p, v)} picked={picked.has(p.sap_code)} onPick={on => pick([p.sap_code], on)} />)}
            </tbody>
          </table>
        )}
      </div>

      {status === 'ready' && ready.length > 0 && (
        <div className={`reorder-bulk${chosen.length ? ' active' : ''}`}>
          <label className="reorder-bulk-all">
            <input type="checkbox" checked={allPicked} onChange={e => pick(ready.map(p => p.sap_code), e.target.checked)}
              ref={el => { if (el) el.indeterminate = chosen.length > 0 && !allPicked; }} />
            Select all {ready.length} shown
          </label>
          {confirmBulk && chosen.length > 0 ? (
            <span className="reorder-bulk-confirm">
              Mark {chosen.length} part{chosen.length === 1 ? '' : 's'} as ordered?
              <button type="button" onClick={markChosen}>Yes</button>
              <button type="button" onClick={() => setConfirmBulk(false)}>No</button>
            </span>
          ) : (
            <button type="button" className="reorder-mark" disabled={!chosen.length} onClick={() => setConfirmBulk(true)}>
              {chosen.length ? `Mark ${chosen.length} ordered` : 'Mark ordered'}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function ReorderRow({ part: p, run, lastMonth, qty, setQty, picked, onPick }) {
  const [basement, setBasement] = useState(p.basement ?? '');
  const [maintain, setMaintain] = useState(p.maintain ?? '');
  useEffect(() => { setBasement(p.basement ?? ''); setMaintain(p.maintain ?? ''); }, [p.basement, p.maintain]);

  const type = (p.type || '').toUpperCase();
  const st = statusOf(p);
  const hasSuggestion = p.suggested_basement != null &&
    (p.suggested_basement !== p.basement || p.suggested_maintain !== p.maintain);

  async function save(b, m) {
    const blank = (v) => v === '' || v == null;
    if (blank(b) && blank(m)) { if (p.basement != null) await run(() => api.setLevels(p.sap_code, null, null), `✓ Cleared levels for ${p.sap_code}`); return; }
    if (blank(b) || blank(m)) return;   // wait until both are filled in
    const [nb, nm] = [Number(b), Number(m)];
    if (nb === p.basement && nm === p.maintain) return;
    if (!(await run(() => api.setLevels(p.sap_code, nb, nm), `✓ Saved levels for ${p.sap_code}`))) {
      setBasement(p.basement ?? ''); setMaintain(p.maintain ?? '');
    }
  }

  // Saves when focus leaves the pair (or its "use" links), so both numbers can be changed before the check that basement ≤ maintain.
  function onBlur(e) {
    if (e.relatedTarget?.dataset?.levels === p.sap_code) return;
    save(basement, maintain);
  }
  const onKey = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };

  function applySuggestion() {
    setBasement(p.suggested_basement); setMaintain(p.suggested_maintain);
    save(p.suggested_basement, p.suggested_maintain);
  }

  function mark() {
    const n = parseInt(qty);
    if (!n || n <= 0) return;
    run(() => api.markOrdered(p.sap_code, n), `✓ Marked ${n} of ${p.sap_code} as ordered`);
  }

  // The ✕ asks on the tag itself, since some browsers block confirm() pop-ups.
  const [confirming, setConfirming] = useState(null);
  function cancel(o) {
    setConfirming(null);
    run(() => api.cancelOrder(o.id), `✓ Cancelled order for ${p.sap_code}`);
  }

  // The small label only shows on phones, where the column headers are hidden.
  const levelInput = (value, set, label) => (
    <label className="reorder-field">
      <span className="reorder-field-label">{label}</span>
      <input className="form-input reorder-level" type="number" min="0" step="1" inputMode="numeric" aria-label={label}
        data-levels={p.sap_code} value={value} onChange={e => set(e.target.value)} onBlur={onBlur} onKeyDown={onKey} />
    </label>
  );

  return (
    <tr>
      <td className="reorder-part">
        <div>
          <span className="td-sap">{p.sap_code}</span>
          {type && <span className={`type-badge ${type}`}>{type}</span>}
        </div>
        <div className="reorder-desc">{p.description}</div>
      </td>
      <td className={`reorder-stock ${p.status}`} title={st.tip}>
        <div className="reorder-stock-n">{p.stock}</div>
        <div className="reorder-status">{st.label}</div>
      </td>
      <td className="reorder-avg" title={`${p.months_known} of 12 months known`}>
        {p.avg ?? '—'}
        {p.spike && (
          <div className="reorder-spike" title={`Used ${p.last_use} in ${lastMonth}, usually ${p.usual} a month`}>
            ↑ {p.last_use} in {lastMonth.split(' ')[0]}
          </div>
        )}
      </td>
      <td className="reorder-levels-cell">
        <div className="reorder-levels">
          {levelInput(basement, setBasement, 'Basement')}
          {levelInput(maintain, setMaintain, 'Maintain')}
          {/* The suggested numbers sit under the box each one fills. */}
          {hasSuggestion && (
            <button type="button" className="reorder-suggest" tabIndex={-1} data-levels={p.sap_code} onClick={applySuggestion}
              title={`Set basement to ${p.suggested_basement} and maintain to ${p.suggested_maintain}`}>
              <span>{p.suggested_basement}</span><span>{p.suggested_maintain}</span>
              <span className="reorder-suggest-label">↑ Use suggested</span>
            </button>
          )}
        </div>
      </td>
      <td className="reorder-order">
        <div className="reorder-order-row">
          <input type="checkbox" className="reorder-pick" aria-label={`Select ${p.sap_code}`} title="Select to mark ordered with others"
            checked={picked && parseInt(qty) > 0} disabled={!(parseInt(qty) > 0)} onChange={e => onPick(e.target.checked)} />
          <input className="form-input reorder-level" type="number" min="1" step="1" inputMode="numeric" aria-label="Quantity ordered"
            title={p.order_qty ? 'Filled in with the suggested amount: back up to maintain plus a month of use' : undefined}
            placeholder="Qty" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={e => e.key === 'Enter' && mark()} />
          <button type="button" className="reorder-mark" onClick={mark} disabled={!(parseInt(qty) > 0)}>Mark ordered</button>
        </div>
        {p.orders.map(o => (
          <div key={o.id} className={`reorder-onorder${confirming === o.id ? ' confirming' : ''}`} title={`Ordered by ${o.ordered_by || 'unknown'}`}>
            {confirming === o.id ? (<>
              Cancel the {o.quantity - o.received} on order?
              <span>
                <button type="button" onClick={() => cancel(o)}>Yes</button>
                <button type="button" onClick={() => setConfirming(null)}>No</button>
              </span>
            </>) : (<>
              {o.quantity - o.received} on order since {shortDate(o.ordered_at)}
              <button type="button" onClick={() => setConfirming(o.id)} aria-label="Cancel order" title="Cancel this order">✕</button>
            </>)}
          </div>
        ))}
      </td>
    </tr>
  );
}
