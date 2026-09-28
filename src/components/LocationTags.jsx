import { useState, useEffect, useRef } from 'react';
import FloorMap from './FloorMap.jsx';
import { onMap, describeLocation, sortLocations } from '../lib/locations.js';

const POP_W = 300;

// A part's location codes as small tags. Hovering a tag previews the mini map;
// clicking pins it open (tap on touch screens). `onOpenMap(code)` adds a link to the map page.
export default function LocationTags({ locations, onOpenMap }) {
  const [open, setOpen] = useState(null);   // { code, pinned, top, left }
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open?.pinned) return;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(null); };
    const key = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [open?.pinned]);

  // The pop-up is fixed to the viewport, so it stays clear of card and table edges; scrolling closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [!!open]);

  if (!locations?.length) return null;

  function show(code, el, pinned) {
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8));
    const below = r.bottom + 6;
    const top = below + 280 > window.innerHeight && r.top > 290 ? r.top - 6 : below;
    setOpen({ code, pinned, left, top, up: top !== below });
  }

  return (
    <span className="loc-tags" ref={wrapRef} onClick={e => e.stopPropagation()}>
      {sortLocations(locations).map(code => (
        <button key={code} type="button" className={`loc-tag${open?.code === code ? ' active' : ''}`}
          onPointerEnter={e => e.pointerType === 'mouse' && !open?.pinned && show(code, e.currentTarget, false)}
          onPointerLeave={e => e.pointerType === 'mouse' && !open?.pinned && setOpen(null)}
          onClick={e => open?.pinned && open.code === code ? setOpen(null) : show(code, e.currentTarget, true)}>
          {code}
        </button>
      ))}
      {open && (
        <div className={`loc-pop${open.up ? ' up' : ''}`} style={{ left: open.left, top: open.top, width: POP_W }}>
          <div className="loc-pop-head">
            <span className="loc-pop-code">{open.code}</span>
            <span className="loc-pop-desc">{describeLocation(open.code)}</span>
          </div>
          <FloorMap compact hits={[open.code]} offMap={onMap(open.code) ? [] : [open.code]} />
          {onOpenMap && open.pinned && (
            <button type="button" className="loc-pop-link" onClick={() => { setOpen(null); onOpenMap(open.code); }}>
              Open on map →
            </button>
          )}
        </div>
      )}
    </span>
  );
}
