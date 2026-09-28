import { useState, useEffect, useMemo } from 'react';
import FloorMap from './FloorMap.jsx';
import LocationTags from './LocationTags.jsx';
import { api } from '../api/client.js';
import { qtyClass } from '../lib/format.js';
import { onMap, describeLocation, sortLocations } from '../lib/locations.js';

// Floor map of the QA room: search lights up the shelves holding matching parts;
// clicking a shelf lists what is stored there.
export default function MapView({ initialBin }) {
  const [rows, setRows]     = useState(null);   // one row per part per location
  const [error, setError]   = useState('');
  const [query, setQuery]   = useState('');
  const [bin, setBin]       = useState(initialBin || null);

  useEffect(() => {
    api.locations().then(setRows).catch(e => setError(e.message || 'Failed to load locations'));
  }, []);

  // Parts keyed by SAP code, each with all of its locations.
  const parts = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) {
      const p = m.get(r.sap_code) || { sap_code: r.sap_code, description: r.description, quantity: r.quantity, locations: [], notes: {} };
      p.locations.push(r.location);
      if (r.note) p.notes[r.location] = r.note;
      m.set(r.sap_code, p);
    }
    return m;
  }, [rows]);
  const stocked = useMemo(() => new Set((rows || []).map(r => r.location)), [rows]);
  const offMap  = useMemo(() => sortLocations([...stocked].filter(c => !onMap(c))), [stocked]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => !q ? [] : [...parts.values()].filter(p =>
    p.sap_code.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)), [parts, q]);
  // A query that is exactly a location code picks that shelf.
  const queryBin = [...stocked].find(c => c.toLowerCase() === q) || (onMap(q.toUpperCase()) ? q.toUpperCase() : null);
  const activeBin = queryBin || (!q ? bin : null);

  const hits = activeBin ? [activeBin] : [...new Set(matches.flatMap(p => p.locations))];
  const list = activeBin ? [...parts.values()].filter(p => p.locations.includes(activeBin)) : matches;

  function pick(code) { setBin(code); setQuery(''); }
  // On the map itself, clicking the selected shelf again clears it.
  const toggle = (code) => code === activeBin ? (setBin(null), setQuery('')) : pick(code);

  if (error) return <div className="stock-loading">{error}</div>;
  if (!rows)  return <div className="stock-loading">Loading locations...</div>;

  return (
    <div className="map-view">
      <div className="search-wrap map-search">
        <input id="searchInput" type="text" placeholder="SAP code, part name or shelf (e.g. 5D, WH)"
          autoComplete="off" spellCheck="false" value={query} onChange={e => setQuery(e.target.value)} />
        <button className={`clear-btn${query ? ' visible' : ''}`} onClick={() => setQuery('')}>×</button>
      </div>

      <div className="map-scroll">
        <FloorMap hits={hits} selected={activeBin} stocked={stocked} offMap={offMap} onPick={toggle} />
      </div>

      <div className="results-header map-results-header">
        <span className="results-count">
          {activeBin ? <><b className="map-bin-code">{activeBin}</b> {describeLocation(activeBin)} · {list.length} part{list.length !== 1 ? 's' : ''}</>
            : q ? `${list.length} part${list.length !== 1 ? 's' : ''} found on ${hits.length} shel${hits.length !== 1 ? 'ves' : 'f'}`
            : `${parts.size} parts on ${stocked.size} locations · click a shelf to see what is on it`}
        </span>
        {activeBin && !queryBin && <button className="preset-btn" onClick={() => setBin(null)}>Clear</button>}
      </div>

      {(activeBin || q) && (
        <ul className="map-list">
          {list.length === 0 && <li className="map-none">{activeBin ? 'No parts recorded here.' : 'No parts match.'}</li>}
          {list.map(p => (
            <li key={p.sap_code} className="map-part">
              <div className="map-part-main">
                <span className="item-sap">{p.sap_code}</span>
                <span className="map-part-desc">{p.description}</span>
                {activeBin && p.notes[activeBin] && <span className="map-part-note">{p.notes[activeBin]}</span>}
              </div>
              <LocationTags locations={p.locations} onOpenMap={pick} />
              <span className={`map-part-qty ${qtyClass(p.quantity)}`}>{p.quantity}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
