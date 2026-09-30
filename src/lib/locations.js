// Floor plan of the QA room, taken cell for cell from the "Map" sheet of the
// QA Inventory Directory workbook: a 35-column x 41-row grid (A..AI, 1..41).
// Locations are stored as codes ("5D", "WH"); only this drawing knows where they sit.
export const GRID = { cols: 35, rows: 41 };

const LEVELS = ['A', 'B', 'C', 'D'];   // shelf levels, top to bottom

// Shelf bins: { code: [col, row, width, height] }, 1-based like the sheet.
export const BINS = {};
// Bays 1-9 run down the left wall (bay 9 at the top); levels A-D sit side by side.
for (let bay = 1; bay <= 9; bay++)
  LEVELS.forEach((l, i) => { BINS[bay + l] = [1 + i, 9 + (9 - bay) * 3, 1, 3]; });
// Bays 10-15 run along the top wall; levels A-D are stacked.
for (let bay = 10; bay <= 15; bay++)
  LEVELS.forEach((l, i) => { BINS[bay + l] = [9 + (bay - 10) * 3, 1 + i, 3, 1]; });

// Labelled areas that are not part locations.
export const ZONES = [
  ['Phantom Kits',           1,  3,  4,  3],
  ['Screws and Bolts',       1,  6,  4,  3],
  ['Supply Shelf',           6,  1,  3,  4],
  ['IOX Testing',           27,  1,  9,  8],
  ['PC Station',            27,  9,  9,  8],
  ['Desk',                  27, 17,  9, 10],
  ['Open Area',              5,  5, 22, 31],
  ['Lockers',                1, 36,  4,  3],
  ['Keyboards and Supplies', 1, 39,  4,  3],
  ['Desk',                   5, 36,  1,  6],
  ['Test Room 3',            6, 36, 10,  6],
  ['Test Room 2',           16, 36, 10,  6],
  ['Test Room 1',           26, 36, 10,  6]
];

// WH is a separate room with no shelves: drawn as one block beside the floor plan.
export const WAREHOUSE = 'WH';

export const onMap = (code) => code in BINS || code === WAREHOUSE;

// One line describing where a code is.
export function describeLocation(code) {
  if (code === WAREHOUSE) return 'Warehouse room, separate from the floor';
  const m = /^(\d+)([A-D])$/.exec(code);
  if (m && BINS[code]) return `Bay ${m[1]}, level ${m[2]} (levels A–D, top to bottom)`;
  if (m) return `Bay ${m[1]} is not on the map yet`;
  return 'Not on the map';
}

// Bays in number order, then levels; WH and anything else after.
const rank = (code) => {
  const m = /^(\d+)([A-Z])$/.exec(code);
  return m ? [0, +m[1], m[2]] : [code === WAREHOUSE ? 1 : 2, 0, code];
};
export function compareLocations(a, b) {
  const [x, y] = [rank(a), rank(b)];
  return x[0] - y[0] || x[1] - y[1] || String(x[2]).localeCompare(String(y[2]));
}
export const sortLocations = (codes) => [...codes].sort(compareLocations);
