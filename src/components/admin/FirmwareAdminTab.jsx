import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';
import { componentsFor, slotLabel, sortSlots, entryDate } from '../../lib/firmware.js';

const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

export default function FirmwareAdminTab() {
  const [units, setUnits]     = useState([]);
  const [status, setStatus]   = useState('loading');
  const [unitId, setUnitId]   = useState('');
  const [slotKey, setSlotKey] = useState('main_fw:1');
  const [version, setVersion] = useState('');
  const [date, setDate]       = useState(today);
  const [busy, setBusy]       = useState(false);
  const showToast = useToast();

  async function load() {
    try {
      const data = await api.firmware();
      setUnits(data);
      setUnitId(id => id || String(data[0]?.id ?? ''));
      setStatus('ready');
    } catch (e) {
      setStatus(`Failed to load versions. ${e.message}`);
    }
  }

  useEffect(() => { load(); }, []);

  const unit = units.find(u => String(u.id) === unitId);
  // Every component of this unit's kind (hardware, software or driver) at slot 1, plus any extra revision slots it already has.
  const options = unit ? sortSlots([
    ...componentsFor(unit.category).map(c => ({ component: c.key, slot: 1 })),
    ...unit.slots.filter(s => s.slot > 1)
  ]) : [];
  const [component, slot] = slotKey.split(':');
  const history = unit?.slots.find(s => s.component === component && s.slot === Number(slot))?.history || [];

  async function submit() {
    const v = version.trim();
    if (!unit || !v || !date) { showToast('Unit, version and date required', 'error'); return; }
    if (v === history[0]?.version) { showToast(`${v} is already the current version`, 'error'); return; }
    setBusy(true);
    try {
      await api.addFirmware({ unit_id: unit.id, component, slot: Number(slot), version: v, changed_on: date });
      showToast(`✓ ${unit.name}: ${slotLabel(component, Number(slot))} → ${v}`, 'success');
      setVersion('');
      await load();
    } catch (err) {
      showToast(err.data?.error || 'Connection error', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (status !== 'ready') return <div className="stock-loading">{status === 'loading' ? 'Loading versions...' : status}</div>;

  return (
    <>
      <div className="form-group">
        <label className="form-label">Unit</label>
        <select className="form-input" value={unitId} onChange={e => {
          const u = units.find(x => String(x.id) === e.target.value);
          setUnitId(e.target.value);
          setSlotKey(u?.category === 'software' ? 'software:1' : u?.category === 'driver' ? 'driver_ver:1' : 'main_fw:1');
        }}>
          {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Component</label>
        <select className="form-input" value={slotKey} onChange={e => setSlotKey(e.target.value)}>
          {options.map(o => (
            <option key={`${o.component}:${o.slot}`} value={`${o.component}:${o.slot}`}>{slotLabel(o.component, o.slot)}</option>
          ))}
        </select>
      </div>
      <div className="fw-admin-current">
        {history.length ? (
          <>Current: <span className="fw-row-ver">{history[0].version}</span> <span className="fw-row-date">{entryDate(history, 0)}</span></>
        ) : 'No version recorded yet'}
      </div>
      <div className="form-group">
        <label className="form-label">New Version</label>
        <input className="form-input" type="text" placeholder="e.g. v1.2.1.0" value={version}
          onChange={e => setVersion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
      </div>
      <div className="form-group">
        <label className="form-label">Date Changed</label>
        <input className="form-input" type="date" required value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <button className="admin-submit" onClick={submit} disabled={busy}>{busy ? 'SAVING...' : 'SAVE VERSION'}</button>
    </>
  );
}
