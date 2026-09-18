import { useState, useRef } from 'react';
import QtyField from './QtyField.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';

export default function NewItemTab({ onDone }) {
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState('');
  const [qty, setQty]   = useState('');
  const descRef = useRef(null);
  const qtyRef  = useRef(null);
  const showToast = useToast();

  async function submit() {
    const c = code.trim().toUpperCase();
    const d = desc.trim();
    if (!c || !d) { showToast('SAP code and description required', 'error'); return; }
    try {
      await api.newItem({ sap_code: c, description: d, quantity: parseInt(qty) || 0, type: type.trim() });
      showToast(`✓ Created ${c}`, 'success');
      setCode(''); setDesc(''); setType(''); setQty('');
      onDone();
    } catch (err) {
      showToast(err.data?.error || 'Connection error', 'error');
    }
  }

  return (
    <>
      <div className="form-group">
        <label className="form-label">SAP Code</label>
        <input className="form-input" type="text" placeholder="e.g. A0099999" autoCapitalize="characters"
          value={code} onChange={e => setCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') descRef.current?.focus(); }} />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <input ref={descRef} className="form-input" type="text" placeholder="Part description"
          value={desc} onChange={e => setDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') qtyRef.current?.focus(); }} />
      </div>
      <div className="form-group">
        <label className="form-label">Type</label>
        <select className="form-input" value={type} onChange={e => setType(e.target.value)}>
          <option value="">— Select type —</option>
          <option value="IOX">IOX</option>
          <option value="EOX">EOX</option>
        </select>
      </div>
      <QtyField ref={qtyRef} label="Initial Quantity" value={qty} onChange={setQty} onEnter={submit} min={0} />
      <button className="admin-submit" onClick={submit}>CREATE ITEM</button>
    </>
  );
}
