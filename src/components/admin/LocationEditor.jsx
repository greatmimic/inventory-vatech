import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';
import { compareLocations } from '../../lib/locations.js';

const byLocation = (rows) => [...rows].sort((a, b) => compareLocations(a.location, b.location));

// Add, remove and annotate one part's shelf locations. The server checks the code
// and logs every change; `onChange(codes)` keeps the stock list's tags in step.
export default function LocationEditor({ sapCode, onChange }) {
  const [rows, setRows]   = useState(null);   // [{ location, note }]
  const [drafts, setDrafts] = useState({});   // location -> note being typed
  const [code, setCode]   = useState('');
  const [note, setNote]   = useState('');
  const [busy, setBusy]   = useState(false);
  const showToast = useToast();

  useEffect(() => {
    api.partLocations(sapCode).then(r => setRows(byLocation(r)))
      .catch(e => showToast(e.data?.error || 'Connection error', 'error'));
  }, [sapCode]);

  function update(next) {
    setRows(byLocation(next));
    onChange(next.map(r => r.location));
  }

  async function run(fn) {
    setBusy(true);
    try { await fn(); } catch (e) { showToast(e.data?.error || 'Connection error', 'error'); }
    finally { setBusy(false); }
  }

  const add = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    run(async () => {
      const row = await api.addLocation(sapCode, code, note);
      update([...rows, row]);
      setCode(''); setNote('');
      showToast(`✓ ${sapCode} added to ${row.location}`, 'success');
    });
  };

  const remove = (location) => run(async () => {
    await api.removeLocation(sapCode, location);
    update(rows.filter(r => r.location !== location));
    showToast(`✓ ${sapCode} removed from ${location}`, 'success');
  });

  function saveNote(location) {
    const draft = drafts[location];
    const row = rows.find(r => r.location === location);
    if (draft === undefined || draft.trim() === (row.note || '')) return;
    run(async () => {
      const saved = await api.setLocationNote(sapCode, location, draft);
      setRows(rs => rs.map(r => r.location === location ? saved : r));
      setDrafts(({ [location]: _, ...rest }) => rest);
      showToast(`✓ Note saved for ${location}`, 'success');
    });
  }

  if (!rows) return <div className="loc-edit-empty">Loading locations...</div>;

  return (
    <div className="loc-edit">
      {rows.length === 0 && <div className="loc-edit-empty">No locations recorded for {sapCode}.</div>}
      {rows.map(r => (
        <div key={r.location} className="loc-edit-row">
          <span className="loc-tag">{r.location}</span>
          <input className="form-input loc-edit-note" placeholder="Note (optional)" disabled={busy}
            value={drafts[r.location] ?? r.note ?? ''}
            onChange={e => setDrafts(d => ({ ...d, [r.location]: e.target.value }))}
            onBlur={() => saveNote(r.location)}
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
          <button type="button" className="preset-btn" disabled={busy} onClick={() => remove(r.location)}
            title={`Remove ${r.location}`}>Remove</button>
        </div>
      ))}
      <form className="loc-edit-row loc-edit-add" onSubmit={add}>
        <input className="form-input loc-edit-code" placeholder="e.g. 5D, WH" value={code} disabled={busy}
          onChange={e => setCode(e.target.value)} spellCheck="false" autoComplete="off" />
        <input className="form-input loc-edit-note" placeholder="Note (optional)" value={note} disabled={busy}
          onChange={e => setNote(e.target.value)} />
        <button type="submit" className="preset-btn active" disabled={busy || !code.trim()}>Add</button>
      </form>
    </div>
  );
}
