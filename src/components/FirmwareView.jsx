import { Fragment, useState, useEffect, useMemo } from 'react';
import { api } from '../api/client.js';
import { useToast } from '../hooks/useToast.jsx';
import { FW_COMPONENTS, CATEGORIES, previewRows, componentsFor, isUnitDriver, isPairing, slotName, sortSlots, fmtDate, entryDate, withDrivers } from '../lib/firmware.js';
import { downloadFirmwareLog, downloadChangeFeed } from '../lib/export.js';

const RANGES = [['30', '30D'], ['90', '90D'], ['365', '1Y'], ['all', 'ALL']];

// Every recorded version, newest (current) first.
function Changelog({ history }) {
  return (
    <ol className="fw-log">
      {history.map((h, i) => (
        <li key={h.id} className={i === 0 ? 'current' : ''}>
          <span className="fw-log-ver">{h.version}</span>
          <span className="fw-log-date">{entryDate(history, i)}</span>
        </li>
      ))}
    </ol>
  );
}

// Current version and its date, or nothing for an unused component.
const Current = ({ history }) => !history.length ? null : (
  <>
    <span className="fw-row-ver">{history[0].version}</span>
    <span className="fw-row-date">{fmtDate(history[0].changed_on)}</span>
  </>
);

// Colour-coded category badge, so a unit's kind reads at a glance anywhere it appears.
const CatTag = ({ category }) => (
  <span className="fw-cat" data-cat={category}>{CATEGORIES.find(c => c.key === category)?.short}</span>
);

// Paired equipment (PC, phantom kit) sorts last; a divider sets it apart from the unit's own versions.
const PairingsDivider = ({ rows, i }) =>
  isPairing(rows[i].component) && !(i > 0 && isPairing(rows[i - 1].component)) ? <div className="fw-row-divider">Pairings</div> : null;

function UnitCard({ unit, open, onToggle }) {
  // Closed: a preview (Install Shield and Main FW for hardware). Open: every component. Dates live on the changelog.
  const all = sortSlots(unit.slots);
  const preview = previewRows(unit, all);
  const more = all.length > preview.length;
  const rows = open ? all : preview;
  return (
    <div className={`fw-card${open ? ' selected' : ''}`}>
      <button className="fw-card-head" onClick={onToggle} aria-expanded={open} disabled={!more && !open}>
        <span className="fw-card-title"><span className="fw-card-name">{unit.name}</span><CatTag category={unit.category} /></span>
        {(open || more) && <span className="fw-card-hint">{open ? 'HIDE ▴' : `+${all.length - preview.length} MORE ▾`}</span>}
      </button>
      <div className="fw-card-body">
        {!rows.length && <div className="fw-row fw-none">No versions recorded yet</div>}
        {rows.map((s, i) => (
          <Fragment key={slotName(s)}>
            <PairingsDivider rows={rows} i={i} />
            <div className="fw-row">
              <span className="fw-row-label">{slotName(s)}</span>
              <span className="fw-row-ver">{s.history[0]?.version}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// A unit's newest entry across its components: latest date first, then latest entered for same-day changes.
function lastChange(unit) {
  let best = null;
  for (const s of unit.slots) {
    const h = s.history[0];
    if (h && (!best || (h.changed_on || '') > (best.changed_on || '') ||
        ((h.changed_on || '') === (best.changed_on || '') && h.id > best.id)))
      best = { ...h, component: s.component, slot: s.slot, label: s.label };
  }
  return best;
}

function UnitChangelog({ unit, last }) {
  return (
    <div className="fw-card static">
      <div className="fw-card-head">
        <span className="fw-card-title"><span className="fw-card-name">{unit.name}</span><CatTag category={unit.category} /></span>
        {last && <span className="fw-card-hint">LAST: {slotName(last)} · {fmtDate(last.changed_on) || '—'}</span>}
      </div>
      <div className="fw-card-body">
        {sortSlots(unit.slots).map((s, i, rows) => (
          <Fragment key={slotName(s)}>
            <PairingsDivider rows={rows} i={i} />
            <div className="fw-row">
              <span className="fw-row-label">{slotName(s)}</span>
              <Changelog history={s.history} />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function UnitTable({ groups, columns }) {
  return (
    <div className="fw-table-wrap">
      <table className="fw-table">
        <thead>
          <tr>
            <th>Unit</th>
            {columns.map(c => <th key={c.key}>{c.label}</th>)}
          </tr>
        </thead>
        {groups.map(g => (
        <tbody key={g.key}>
          <tr className="fw-group-row" data-cat={g.key}>
            <td className="fw-td-unit" colSpan={columns.length + 1}>{g.label} <span className="fw-group-count">{g.units.length}</span></td>
          </tr>
          {g.units.map(u => (
            <tr key={u.id}>
              <td className="fw-td-unit">{u.name}</td>
              {columns.map(c => {
                const slots = sortSlots(u.slots.filter(s => s.component === c.key));
                return (
                  <td key={c.key} className={c.pairing ? 'fw-td-pairing' : undefined}>
                    {slots.length === 0 ? <span className="fw-none">—</span> : slots.map(s => (
                      <div className="fw-cell" key={s.slot}><Current history={s.history} /></div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        ))}
      </table>
    </div>
  );
}

// Every recorded version that replaced an earlier one (first recorded versions show only in a unit's history).
// Newest first; undated entries go last. EzAlign/EzEval changes are listed once, under their Driver item.
function changesOf(units) {
  const out = [];
  for (const u of units) for (const s of u.slots) if (u.virtual || !isUnitDriver(s.component)) s.history.slice(0, -1).forEach((h, i) => out.push({
    ...h, unit: u, owner: s.owner ?? u.id, component: s.component, slot: s.slot, label: s.label,
    from: s.history[i + 1].version, when: entryDate(s.history, i)
  }));
  return out.sort((a, b) => (b.changed_on || '').localeCompare(a.changed_on || '') || b.id - a.id);
}

const monthOf = (iso) => iso
  ? new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
  : 'Date unknown';

// Changes split into month sections, keeping the newest-first order.
function ChangeFeed({ changes, onUnit }) {
  const months = [];
  for (const c of changes) {
    const m = monthOf(c.changed_on);
    if (months.at(-1)?.label !== m) months.push({ label: m, items: [] });
    months.at(-1).items.push(c);
  }
  return months.map(m => (
    <section key={m.label} className="fw-month">
      <h3 className="fw-month-title">{m.label} <span className="fw-group-count">{m.items.length}</span></h3>
      <ol className="fw-feed">
        {m.items.map(c => (
          // The whole row opens the unit's history; the button keeps it reachable by keyboard.
          <li key={c.id} className="fw-change" onClick={() => onUnit(c.unit.id)} title="Show this unit's full history">
            <span className="fw-change-date">{c.when}</span>
            <span className="fw-change-who">
              <button className="fw-change-unit">{c.unit.name}</button>
              <CatTag category={c.unit.category} />
            </span>
            <span className="fw-change-comp">{slotName(c)}</span>
            <span className="fw-change-ver"><span className="fw-change-from">{c.from}</span> → {c.version}</span>
          </li>
        ))}
      </ol>
    </section>
  ));
}

export default function FirmwareView({ changelog }) {
  const [units, setUnits]   = useState([]);
  const [status, setStatus] = useState('loading');
  const [text, setText]     = useState('');
  const [category, setCategory] = useState('all');
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem('fwLayout') || 'cards'; } catch { return 'cards'; } });
  const [openId, setOpenId] = useState(null);
  // Changelog tab only.
  const [component, setComponent] = useState('all');
  const [range, setRange]         = useState('all');
  const [drillId, setDrillId]     = useState(null);
  const showToast = useToast();

  useEffect(() => {
    let cancelled = false;
    api.firmware()
      .then(data => { if (!cancelled) { setUnits(withDrivers(data)); setStatus('ready'); } })
      .catch(e => { if (!cancelled) setStatus(`Failed to load firmware. ${e.message}`); });
    return () => { cancelled = true; };
  }, []);

  // The on-screen units and the download both read this.
  const visible = useMemo(() => {
    const q = text.trim().toLowerCase();
    const hit = (name) => name.toLowerCase().includes(q);
    return units.filter(u => category === 'all' || u.category === category).flatMap(u => {
      if (hit(u.name)) return [u];
      // A driver also matches on the units it lists, keeping only those rows.
      const slots = u.category === 'driver' ? u.slots.filter(s => hit(s.label)) : [];
      return slots.length ? [{ ...u, slots }] : [];
    });
  }, [units, text, category]);

  // Visible units split into categories; empty categories are dropped.
  const groups = CATEGORIES.map(c => ({ ...c, units: visible.filter(u => u.category === c.key) }))
    .filter(g => g.units.length);

  // Changes of the visible units in the chosen time range, before the component filter
  // (the component chips count from these).
  const ranged = useMemo(() => {
    if (!changelog) return [];
    const cutoff = range === 'all' ? '' : new Date(Date.now() - range * 864e5).toLocaleDateString('en-CA');
    return changesOf(visible).filter(c => !cutoff || (c.changed_on && c.changed_on >= cutoff));
  }, [visible, changelog, range]);
  const feed = component === 'all' ? ranged : ranged.filter(c => c.component === component);
  const feedComponents = FW_COMPONENTS.filter(k => ranged.some(c => c.component === k.key));
  const drillUnit = changelog && units.find(u => u.id === drillId);
  // The EzAlign/EzEval Driver items only regroup unit data, so they aren't counted or listed as units.
  const real = units.filter(u => !u.virtual);

  function chooseLayout(l) {
    setLayout(l);
    try { localStorage.setItem('fwLayout', l); } catch {}
  }

  const toggle = (id) => setOpenId(o => o === id ? null : id);

  const download = (format) => changelog
    ? downloadChangeFeed(feed, format, showToast)
    : downloadFirmwareLog(visible.filter(u => !u.virtual), format, showToast);
  const canDownload = changelog ? feed.length > 0 : visible.length > 0;

  const summary = changelog
    ? `${feed.length} change${feed.length !== 1 ? 's' : ''} across ${new Set(feed.map(c => c.owner)).size} of ${real.length} units  ·  click a change for the unit's full history`
    : `${visible.filter(u => !u.virtual).length} of ${real.length} units${layout === 'cards' ? '  ·  click a card for all components' : ''}`;

  if (drillUnit) return (
    <>
      <div className="stock-list-controls">
        <button className="preset-btn fw-back" onClick={() => setDrillId(null)}>← ALL CHANGES</button>
      </div>
      <div className="stock-summary">full version history per component, newest first</div>
      <div className="fw-cards"><UnitChangelog unit={drillUnit} last={lastChange(drillUnit)} /></div>
    </>
  );

  return (
    <>
      <div className="stock-list-controls">
        <input className="stock-filter" type="text" placeholder="Filter by unit..."
          value={text} onChange={e => setText(e.target.value)} />
        {changelog ? (
          <div className="fw-layout-toggle" role="group" aria-label="Time range">
            {RANGES.map(([k, label]) => (
              <button key={k} className={`preset-btn${range === k ? ' active' : ''}`} aria-pressed={range === k} onClick={() => setRange(k)}>{label}</button>
            ))}
          </div>
        ) : (
          <div className="fw-layout-toggle" role="group" aria-label="Layout">
            <button className={`preset-btn${layout === 'cards' ? ' active' : ''}`} onClick={() => chooseLayout('cards')}>CARDS</button>
            <button className={`preset-btn${layout === 'list' ? ' active' : ''}`} onClick={() => chooseLayout('list')}>LIST</button>
          </div>
        )}
        <button className="download-btn" onClick={() => download('csv')}
          disabled={!canDownload} title={changelog ? 'Download these changes as CSV' : 'Download version history as CSV'}>⬇ CSV</button>
        <button className="download-btn" onClick={() => download('xlsx')}
          disabled={!canDownload} title={changelog ? 'Download these changes as Excel' : 'Download version history as Excel'}>⬇ Excel</button>
      </div>

      <div className="fw-category-filter" role="group" aria-label="Unit category">
        {[{ key: 'all', short: 'All' }, ...CATEGORIES].map(c => (
          <button key={c.key} className={`preset-btn${category === c.key ? ' active' : ''}`} aria-pressed={category === c.key}
            data-cat={c.key} onClick={() => setCategory(c.key)}>
            {c.short.toUpperCase()} <span className="fw-group-count">{c.key === 'all' ? real.length : real.filter(u => u.category === c.key).length}</span>
          </button>
        ))}
      </div>

      {changelog && status === 'ready' && (
        <div className="fw-category-filter" role="group" aria-label="Component">
          {[{ key: 'all', label: 'All components' }, ...feedComponents].map(c => (
            <button key={c.key} className={`preset-btn${component === c.key ? ' active' : ''}`} aria-pressed={component === c.key}
              onClick={() => setComponent(c.key)}>
              {c.label} <span className="fw-group-count">{c.key === 'all' ? ranged.length : ranged.filter(x => x.component === c.key).length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="stock-summary">{status === 'ready' && summary}</div>

      {status !== 'ready' ? (
        <div className="stock-loading">{status === 'loading' ? 'Loading versions...' : status}</div>
      ) : visible.length === 0 ? (
        <div className="stock-loading">No units match filter</div>
      ) : changelog ? (
        feed.length ? <ChangeFeed changes={feed} onUnit={id => { setDrillId(id); window.scrollTo({ top: 0 }); }} />
          : <div className="stock-loading">No changes match filter</div>
      ) : layout === 'list' ? (
        <>
          {['hardware', 'software', 'driver'].map(kind => {
            const tableGroups = groups.map(g => ({ ...g, units: g.units.filter(u => !u.virtual) }))
              .filter(g => g.units.length && (g.key === kind || (kind === 'hardware' && g.key !== 'software' && g.key !== 'driver')));
            return tableGroups.length > 0 && <UnitTable key={kind} groups={tableGroups} columns={componentsFor(kind)} />;
          })}
        </>
      ) : groups.map(g => (
        <section key={g.key} className="fw-group">
          <h3 className="fw-group-title" data-cat={g.key}>{g.label} <span className="fw-group-count">{g.units.filter(u => !u.virtual).length}</span></h3>
          <div className="fw-cards">
            {g.units.map(u => <UnitCard key={u.id} unit={u} open={openId === u.id} onToggle={() => toggle(u.id)} />)}
          </div>
        </section>
      ))}
    </>
  );
}
