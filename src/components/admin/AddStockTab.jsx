import { useState, useRef, useEffect } from 'react';
import SapSearch from './SapSearch.jsx';
import QtyField from './QtyField.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';

export default function AddStockTab({ cache, ensureCache, onDone }) {
  const [code, setCode]         = useState('');
  const [selected, setSelected] = useState(null);
  const [qty, setQty]           = useState('');
  const [busy, setBusy]         = useState(false);
  const qtyRef    = useRef(null);
  const showToast = useToast();

  useEffect(() => { ensureCache(); }, [ensureCache]);

  async function submit() {
    const c = code.trim().toUpperCase();
    const n = parseInt(qty);
    if (!c || !n || n <= 0) { showToast('Enter SAP code and quantity', 'error'); return; }
    setBusy(true);
    try {
      const data = await api.addStock(c, n);
      showToast(`✓ Added ${n} to ${c} — now ${data.item.quantity} in stock`, 'success');
      setCode(''); setQty(''); setSelected(null);
      onDone();
    } catch (err) {
      showToast(err.data?.error || 'Connection error', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="form-group">
        <label className="form-label">SAP Code</label>
        <SapSearch cache={cache} value={code}
          onChange={v => { setCode(v); setSelected(null); }}
          selected={selected}
          onSelect={item => { setCode(item.sap_code); setSelected(item); setQty(''); }}
          onNext={() => qtyRef.current?.focus()} />
      </div>
      <QtyField ref={qtyRef} label="Quantity to Add" value={qty} onChange={setQty} onEnter={submit} />
      <button className="admin-submit" onClick={submit} disabled={busy}>
        {busy ? 'PROCESSING...' : '+ ADD TO STOCK'}
      </button>
    </>
  );
}
