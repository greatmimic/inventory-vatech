import { GRID, BINS, ZONES, WAREHOUSE } from '../lib/locations.js';

const place = ([col, row, w, h]) => ({ gridColumn: `${col} / span ${w}`, gridRow: `${row} / span ${h}` });

// Schematic of the QA room. `hits` are highlighted, `selected` is outlined, and bins
// missing from `stocked` (when given) are dimmed. `offMap` lists codes that exist in the
// data but have no place on the drawing (IO Bin). `compact` drops the labels for
// the pop-up mini map.
export default function FloorMap({ hits = [], selected, stocked, offMap = [], onPick, compact = false }) {
  const hit = new Set(hits);
  const cls = (code) => [
    'fm-bin',
    hit.has(code) && 'hit',
    code === selected && 'sel',
    stocked && !stocked.has(code) && 'empty'
  ].filter(Boolean).join(' ');
  const Bin = onPick ? 'button' : 'div';
  const pick = (code) => onPick && { type: 'button', onClick: () => onPick(code), title: code };

  return (
    <div className={`fm${compact ? ' compact' : ''}`}>
      <div className="fm-room" style={{ gridTemplateColumns: `repeat(${GRID.cols}, 1fr)`, gridTemplateRows: `repeat(${GRID.rows}, 1fr)` }}>
        {ZONES.map(([name, ...box], i) => (
          <div key={i} className="fm-zone" style={{ ...place(box), ...(box[2] === 1 && { writingMode: 'vertical-rl' }) }}>{!compact && name}</div>
        ))}
        {Object.entries(BINS).map(([code, box]) => (
          <Bin key={code} className={cls(code)} style={place(box)} {...pick(code)}>{!compact && code}</Bin>
        ))}
      </div>
      <div className="fm-outside">
        <Bin className={`${cls(WAREHOUSE)} fm-wh`} {...pick(WAREHOUSE)}>WH{!compact && ' · separate room'}</Bin>
        {offMap.length > 0 && (
          <div className="fm-offmap">
            <span className="fm-offmap-label">Not on the map</span>
            {offMap.map(code => <Bin key={code} className={cls(code)} {...pick(code)}>{code}</Bin>)}
          </div>
        )}
      </div>
    </div>
  );
}
