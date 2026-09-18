import { useState, useEffect } from 'react';
import { qtyClass, splitHighlight } from '../lib/format.js';

function Highlighted({ text, q }) {
  return splitHighlight(text, q).map((part, i) =>
    part.hit
      ? <mark key={i} style={{ background: 'rgba(0,212,255,0.2)', color: 'var(--accent)', borderRadius: '2px' }}>{part.text}</mark>
      : <span key={i}>{part.text}</span>
  );
}

export default function ItemCard({ item, query, open, onToggle, onDeduct }) {
  const [qty, setQty]   = useState(1);
  const [busy, setBusy] = useState(false);
  const qc = qtyClass(item.quantity);

  // A refreshed item can carry less stock than the pending input.
  useEffect(() => { setQty(q => Math.min(Math.max(1, q), Math.max(1, item.quantity))); }, [item.quantity]);

  function changeQty(delta, e) {
    e.stopPropagation();
    setQty(v => Math.min(item.quantity || 9999, Math.max(1, v + delta)));
  }

  async function confirm(e) {
    e.stopPropagation();
    setBusy(true);
    const ok = await onDeduct(item.sap_code, qty);
    if (!ok) setBusy(false);
  }

  return (
    <div className={`item-card${open ? ' selected' : ''}`} onClick={onToggle}>
      <div className="item-top">
        <div>
          <div className="item-sap"><Highlighted text={item.sap_code} q={query} /></div>
          <div className="item-desc"><Highlighted text={item.description} q={query} /></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={`item-qty ${qc}`}>{item.quantity}</div>
          <div className="qty-label">IN STOCK</div>
        </div>
      </div>

      <div className={`deduct-panel${open ? ' open' : ''}`}>
        <div className="deduct-row">
          <div className="qty-input-wrap">
            <button className="qty-btn" onClick={e => changeQty(-1, e)}>−</button>
            <input className="qty-number" type="number" min="1" max={item.quantity} value={qty}
              onClick={e => e.stopPropagation()}
              onChange={e => setQty(parseInt(e.target.value) || 1)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); confirm(e); }
              }} />
            <button className="qty-btn" onClick={e => changeQty(1, e)}>+</button>
          </div>
          <button className="confirm-btn" onClick={confirm} disabled={item.quantity === 0 || busy}>
            {item.quantity === 0 ? 'OUT OF STOCK' : busy ? 'PROCESSING...' : 'CONFIRM USE'}
          </button>
        </div>
        <div className="deduct-stock-row">
          <span className="deduct-stock-label">STOCK REMAINING</span>
          <span className={`deduct-stock-val ${qc}`}>{item.quantity}</span>
        </div>
      </div>
    </div>
  );
}
