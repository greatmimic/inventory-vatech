// Components in QA Dashboard column order (B–I), then the EzAlign/EzEval tools.
export const FW_COMPONENTS = [
  { key: 'install_shield', label: 'Install Shield' },
  { key: 'capture_sw',     label: 'Capture SW' },
  { key: 'main_fw',        label: 'Main FW' },
  { key: 'rotator',        label: 'Rotator' },
  { key: 'sensor',         label: 'Sensor' },
  { key: 'collimator',     label: 'Collimator' },
  { key: 'lcd',            label: 'LCD' },
  { key: 'jaw',            label: 'Jaw' },
  // Recorded per unit; also gathered into their own Driver cards.
  { key: 'ezalign',        label: 'EzAlign', driver: true },
  { key: 'ezeval',         label: 'EzEval',  driver: true },
  // Paired equipment: the PC spec (with its FOVs) and the user phantom kit.
  { key: 'pc',             label: 'PC / GPU',    pairing: true },
  { key: 'phantom',        label: 'Phantom Kit', pairing: true },
  // Software items (EzDent-i, Ez3D-i, ...) track the software and its manual versions instead.
  { key: 'software',       label: 'Software',       kind: 'software' },
  { key: 'user_manual',    label: 'User Manual',    kind: 'software' },
  { key: 'service_manual', label: 'Service Manual', kind: 'software' },
  // Standalone drivers (grabbers) track a driver and/or firmware version.
  { key: 'driver_ver',     label: 'Driver',   kind: 'driver' },
  { key: 'driver_fw',      label: 'Firmware', kind: 'driver' }
];

// Which components a unit of this category records: software and driver items have their own.
export const componentsFor = (category) => FW_COMPONENTS.filter(c =>
  (c.kind || 'hardware') === (category === 'software' || category === 'driver' ? category : 'hardware'));

// Rows a closed card shows; clicking the card shows the rest.
// Hardware units preview Install Shield and Main FW; software and driver items their first few rows.
const CARD_PREVIEW = ['install_shield', 'main_fw'];
const CARD_ROWS = 3;
export const previewRows = (unit, sorted) => componentsFor(unit.category).some(c => c.key === 'main_fw')
  ? sorted.filter(s => CARD_PREVIEW.includes(s.component))
  : sorted.slice(0, CARD_ROWS);

// Unit groups, in display order: EOX (2D, 3D), IOX (intraoral), software, then drivers.
export const CATEGORIES = [
  { key: '2d',       label: 'EOX · 2D',       short: '2D' },
  { key: '3d',       label: 'EOX · 3D',       short: '3D' },
  { key: 'portable', label: 'IOX · IntraOral', short: 'IOX' },
  { key: 'software', label: 'Software',        short: 'Software' },
  { key: 'driver',   label: 'Driver',          short: 'Driver' }
];

const LABELS =Object.fromEntries(FW_COMPONENTS.map(c => [c.key, c.label]));

// Units with two hardware revisions carry a second Main FW slot.
export const slotLabel = (component, slot) => LABELS[component] + (slot > 1 ? ` (Rev ${slot})` : '');
// A driver's rows are named by the unit they belong to.
export const slotName = (s) => s.label || slotLabel(s.component, s.slot);

export const isUnitDriver = (component) => !!FW_COMPONENTS.find(c => c.key === component)?.driver;
export const isPairing = (component) => !!FW_COMPONENTS.find(c => c.key === component)?.pairing;

// Adds one virtual Driver item each for EzAlign/EzEval, with a row per unit that uses it.
// The units keep their own EzAlign/EzEval slots; virtual items aren't counted as units.
export function withDrivers(units) {
  const drivers = FW_COMPONENTS.filter(c => c.driver).map(c => ({
    id: `driver-${c.key}`, name: c.label, category: 'driver', virtual: true,
    slots: units.flatMap(u => u.slots.filter(s => s.component === c.key)
      .map(s => ({ ...s, owner: u.id, label: u.name + (s.slot > 1 ? ` (Rev ${s.slot})` : '') })))
  }));
  return [...units, ...drivers.filter(d => d.slots.length)];
}

// Slots in dashboard column order, then by slot number.
const ORDER = Object.fromEntries(FW_COMPONENTS.map((c, i) => [c.key, i]));
export const sortSlots = (slots) => [...slots].sort((a, b) => ORDER[a.component] - ORDER[b.component] || a.slot - b.slot);

// 'YYYY-MM-DD' → 'MM/DD/YY', matching the dashboard.
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y.slice(2)}`;
}

// A backfilled version whose date is unknown is shown relative to the version that replaced it.
export function entryDate(history, i) {
  if (history[i].changed_on) return fmtDate(history[i].changed_on);
  const newer = history.slice(0, i).reverse().find(h => h.changed_on);
  return newer ? `before ${fmtDate(newer.changed_on)}` : '—';
}
