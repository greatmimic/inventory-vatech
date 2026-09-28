import { useState, useEffect, useRef } from 'react';

// Header bell for admins: the parts the Reorder tab lists as "Order now" — at or below basement,
// counting what's already on order. Opening it re-checks, so the list is current when looked at.
export default function ReorderAlerts({ alerts, onRefresh, onPick, onOpenReorder }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const parts = alerts?.parts;

  useEffect(() => {
    if (!open) return;
    const outside = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const escape  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  function toggle() {
    if (!open) onRefresh();
    setOpen(o => !o);
  }

  function go(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="alerts-wrap" ref={wrap}>
      <button className={`admin-btn alerts-btn${open ? ' active' : ''}`} onClick={toggle}
        aria-label={parts ? `${parts.length} part${parts.length === 1 ? '' : 's'} need ordering` : 'Reorder alerts'}
        aria-expanded={open}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {parts?.length > 0 && <span className="alerts-badge">{parts.length > 99 ? '99+' : parts.length}</span>}
      </button>

      {open && (
        <div className="alerts-panel" role="dialog" aria-label="Parts that need ordering">
          <div className="alerts-head">
            Needs ordering{parts ? ` · ${parts.length}` : ''}
          </div>
          <div className="alerts-list">
            {alerts?.failed ? <div className="alerts-note bad">Couldn't check reorder levels</div>
              : !parts ? <div className="alerts-note">Checking…</div>
              : parts.length === 0 ? <div className="alerts-note">Nothing needs ordering</div>
              : parts.map(p => (
                <button key={p.sap_code} className="alerts-item" onClick={() => go(() => onPick(p.sap_code))}>
                  <span className="alerts-code">{p.sap_code}</span>
                  <span className="alerts-desc">{p.description}</span>
                  <span className="alerts-nums">
                    <span className={p.stock === 0 ? 'bad' : ''}>In stock {p.stock}</span>
                    {p.on_order > 0 && <> · on order {p.on_order}</>}
                    {' · '}basement {p.basement} · order {p.order_qty}
                  </span>
                </button>
              ))}
          </div>
          <button className="alerts-foot" onClick={() => go(onOpenReorder)}>Open Reorder →</button>
        </div>
      )}
    </div>
  );
}
