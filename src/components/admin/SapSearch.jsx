import { useState, useRef, useEffect } from 'react';
import { qtyClass, qtyStyle } from '../../lib/format.js';

export default function SapSearch({ value, onChange, onSelect, selected, cache, onNext }) {
  const [matches, setMatches]     = useState([]);
  const [highlight, setHighlight] = useState(-1);
  const [open, setOpen]           = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  function handleInput(raw) {
    onChange(raw);
    const q = raw.trim().toLowerCase();
    setHighlight(-1);
    if (!q) { setMatches([]); setOpen(false); return; }
    const found = cache.filter(i =>
      i.sap_code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    ).slice(0, 12);
    setMatches(found);
    setOpen(found.length > 0);
  }

  function choose(item) {
    onSelect(item);
    setOpen(false);
    setMatches([]);
    setTimeout(() => onNext?.(), 50);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && matches[highlight]) choose(matches[highlight]);
      else onNext?.();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <>
      <div className="sap-search-wrap" ref={wrapRef}>
        <input className="form-input" type="text" placeholder="Type full SAP code or partial"
          autoComplete="off" autoCapitalize="characters"
          value={value} onChange={e => handleInput(e.target.value)} onKeyDown={onKeyDown} />
        <div className={`sap-dropdown${open ? ' open' : ''}`}>
          {matches.map((item, idx) => (
            <div key={item.sap_code}
              className={`sap-opt${idx === highlight ? ' highlighted' : ''}`}
              onMouseDown={e => { e.preventDefault(); choose(item); }}>
              <span className={`sap-opt-qty ${qtyClass(item.quantity)}`}>{item.quantity} in stock</span>
              <div className="sap-opt-code">{item.sap_code}</div>
              <div className="sap-opt-desc">{item.description}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="sap-selected">
        {selected && (
          <>✓ {selected.sap_code} — {selected.description}&nbsp;
            <span style={qtyStyle(selected.quantity)}>({selected.quantity} in stock)</span>
          </>
        )}
      </div>
    </>
  );
}
