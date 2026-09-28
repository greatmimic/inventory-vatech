import { useState, useEffect } from 'react';
import SapSearch from './SapSearch.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';

// For deprecated SAP codes: removes the part from stock, search, the map and the monthly report.
// Past usage stays in Trends under the old code.
export default function RemoveItemTab({ cache, ensureCache, onDone }) {
  const [code, setCode]         = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy]         = useState(false);
  const showToast = useToast();

  useEffect(() => { ensureCache(); }, [ensureCache]);

  async function submit() {
    if (!selected) { showToast('Pick the item from the list', 'error'); return; }
    const { sap_code, quantity } = selected;
    const stockNote = quantity > 0 ? `\n\n${quantity} still in stock will be dropped from the count.` : '';
    if (!confirm(`Remove ${sap_code} from inventory? This cannot be undone.${stockNote}`)) return;
    setBusy(true);
    try {
      await api.removeItem(sap_code);
      showToast(`✓ Removed ${sap_code}`, 'success');
      setCode(''); setSelected(null);
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
          onSelect={item => { setCode(item.sap_code); setSelected(item); }} />
      </div>
      <p className="remove-note">
        Removes the part from stock, search, the map and the monthly report. Its past usage stays in Trends.
      </p>
      {selected?.quantity > 0 && (
        <p className="remove-note warn">⚠ {selected.quantity} still in stock will be dropped from the count.</p>
      )}
      <button className="admin-submit" style={{ background: 'var(--danger)' }} onClick={submit} disabled={busy}>
        {busy ? 'PROCESSING...' : '✕ REMOVE ITEM'}
      </button>
    </>
  );
}
