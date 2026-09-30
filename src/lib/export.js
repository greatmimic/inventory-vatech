import { api } from '../api/client.js';
import { parseUsedAt } from './format.js';
import { sortSlots, slotName, componentsFor, fmtDate, CATEGORIES } from './firmware.js';

// NOTE: the stock list export still emits an HTML table labelled .xls, carried over from v1.
// Phase 4 moves it onto buildWorkbook below (already used by the Versions/Changelog and trends exports).

function triggerDownload(blob, filename, showToast) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✓ Downloaded ${filename}`, 'success');
}

const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;

const XLS_HEAD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8"></head><body>`;

export function downloadStockList(items, format, showToast) {
  if (format === 'csv') {
    const rows = [
      ['SAP Code', 'Type', 'Quantity', 'Description'],
      ...items.map(r => [r.sap_code, r.type || '', r.quantity, csvCell(r.description)])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), 'stock_list.csv', showToast);
  } else {
    const rows = items.map(r =>
      `<tr><td>${r.sap_code}</td><td>${r.type || ''}</td><td>${r.quantity}</td><td>${r.description}</td></tr>`
    ).join('');
    const html = `${XLS_HEAD}<table>
      <thead><tr><th>SAP Code</th><th>Type</th><th>Quantity</th><th>Description</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`;
    triggerDownload(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), 'stock_list.xls', showToast);
  }
}

// Real .xlsx workbooks (PLAN.md §6), with ExcelJS loaded only when an Excel download is clicked.
// Each sheet gets a bold, frozen header row with filters; cells stay text so versions keep their dots,
// except numbers (usage quantities), which stay numeric so they can be summed, and dates, which stay real dates.
const DATE_FMT = 'mm/dd/yy';
async function buildWorkbook(sheets) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  for (const { name, columns, rows } of sheets) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(columns).font = { bold: true };
    rows.forEach(r => ws.addRow(r.map(v => typeof v === 'number' || v instanceof Date ? v : String(v))));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (rows.some(r => r[i] instanceof Date)) col.numFmt = DATE_FMT;
      col.width = Math.min(60, rows.reduce((w, r) => Math.max(w, (r[i] instanceof Date ? DATE_FMT : String(r[i])).length + 2), c.length + 4));
    });
  }
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// The month-end stock report for the parts management team, laid out like their sheet:
// three blank rows, then SAP Code / Descriptions / date header, every part sorted by code,
// Calibri 11 with thin borders. Description cells have no right edge; the quantity cell supplies it.
// Rows are taller than their sheet's and text is centred and indented, so it doesn't sit on the borders;
// every other part row is shaded pale blue to keep the eye on the line.
export async function downloadMonthlyInventory(items, showToast) {
  const now   = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  try {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1', {
      properties: { defaultRowHeight: 14.45 },
      pageSetup: { margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } }
    });
    const parts = [...items]
      .map(i => ({ ...i, description: String(i.description ?? '').trim() }))
      .sort((a, b) => a.sap_code < b.sap_code ? -1 : a.sap_code > b.sap_code ? 1 : 0);
    // Capital letters run wider than the digit Excel measures widths in, so descriptions get extra room.
    ws.getColumn(1).width = 13;
    ws.getColumn(2).width = Math.max(92.85546875, ...parts.map(p => p.description.length * 1.15 + 3));
    ws.getColumn(3).width = 12;

    const font = { name: 'Calibri', size: 11, family: 2, scheme: 'minor', color: { theme: 1 } };
    const thin = { style: 'thin', color: { indexed: 64 } };
    const box  = { left: thin, right: thin, top: thin, bottom: thin };
    const desc = { left: thin, top: thin, bottom: thin };
    const text = { vertical: 'middle', horizontal: 'left', indent: 1 };
    const qty  = { vertical: 'middle', horizontal: 'center' };
    const band = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    const addRow = (values, r, shaded) => {
      const row = ws.getRow(r);
      row.values = values;
      row.height = 20;
      [[box, text], [desc, text], [box, qty]].forEach(([border, alignment], i) =>
        Object.assign(row.getCell(i + 1), { font, border, alignment }, shaded && { fill: band }));
    };

    addRow(['SAP Code', 'Descriptions', `${now.getMonth() + 1}.${now.getDate()}.${now.getFullYear()}`], 4);
    parts.forEach((item, i) => addRow([item.sap_code, item.description, Number(item.quantity)], 5 + i, i % 2 === 1));

    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    triggerDownload(blob, `${month} ${now.getFullYear()} Inventory.xlsx`, showToast);
  } catch {
    showToast('Failed to download', 'error');
  }
}

// One table as CSV or as a single-sheet workbook.
async function downloadTable({ file, sheet, columns, rows }, format, showToast) {
  if (format === 'csv') {
    const csv = [columns, ...rows].map(r => r.map(v => csvCell(v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(',')).join('\n');
    triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `${file}.csv`, showToast);
    return;
  }
  try {
    triggerDownload(await buildWorkbook([{ name: sheet, columns, rows }]), `${file}.xlsx`, showToast);
  } catch {
    showToast('Failed to download', 'error');
  }
}

const categoryLabel = (key) => CATEGORIES.find(k => k.key === key)?.label || '';

// Version exports leave out manuals, and the changelog also PCs. Dates are real dates; one with no recorded date gets an empty cell.
const MANUALS  = ['user_manual', 'service_manual'];
const LOG_SKIP = ['pc', ...MANUALS];
const dateCell = (iso) => iso ? new Date(iso + 'T00:00:00Z') : '';

// The Excel versions of the two version exports are laid out like the QA Dashboard sheet:
// Calibri 11, thin borders on every cell, a big merged title and its blue/red header fills.
const DASH_FONT = { name: 'Calibri', size: 11, family: 2, scheme: 'minor', color: { theme: 1 } };
const THIN = { style: 'thin' };
const DASH_BOX = { left: THIN, right: THIN, top: THIN, bottom: THIN };
const BLUE = 'FF00B0F0';
const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// Writes the first `cols` cells of row r; `merges` lists [fromCol, toCol] spans.
function dashRow(ws, r, values, { cols = values.length, fill, font, align, merges = [] } = {}) {
  for (let c = 1; c <= cols; c++) {
    Object.assign(ws.getCell(r, c), { value: values[c - 1] || null, font: { ...DASH_FONT, ...font }, border: DASH_BOX });
    if (fill)  ws.getCell(r, c).fill = solid(fill);
    if (align) ws.getCell(r, c).alignment = align;
  }
  merges.forEach(([a, b]) => ws.mergeCells(r, a, r, b));
}

// The title spans rows 1–2 across the sheet's columns.
function dashTitle(ws, text, cols, fill) {
  const style = { cols, fill, font: { size: 20 }, align: { horizontal: 'center', vertical: 'middle', wrapText: true } };
  dashRow(ws, 1, [text], style);
  dashRow(ws, 2, [], style);
  ws.mergeCells(1, 1, 2, cols);
}

async function downloadDashboard(file, sheet, fill, showToast) {
  try {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    fill(wb.addWorksheet(sheet, { views: [{ zoomScale: 80 }] }));
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    triggerDownload(blob, file, showToast);
  } catch {
    showToast('Failed to download', 'error');
  }
}

const HW_COLUMNS = ['install_shield', 'capture_sw', 'main_fw', 'rotator', 'sensor', 'collimator', 'lcd', 'jaw'];
const latest = (u, component, slot = 1) => u.slots.find(s => s.component === component && s.slot === slot)?.history[0]?.version || '';

// The current version of each component of the listed units (the EzAlign/EzEval Utility items included).
// Excel: the QA Dashboard's A–I block. A unit with a second hardware revision gets a "(Rev 2)" row.
export function downloadCurrentVersions(units, format, showToast) {
  const real = units.filter(u => !u.virtual);
  if (format === 'csv') {
    const rows = real.flatMap(u => sortSlots(u.slots).filter(s => !MANUALS.includes(s.component) && s.history.length).map(s => [
      u.name, categoryLabel(u.category), slotName(s), s.history[0].version, dateCell(s.history[0].changed_on)
    ]));
    downloadTable({ file: 'current_versions', rows, columns: ['Unit', 'Category', 'Component', 'Version', 'Date'] }, format, showToast);
    return;
  }
  downloadDashboard('current_versions.xlsx', 'Current Versions', (ws) => {
    [50, 42.71, 43.14, 27.29, 20.14, 16.29, 28.29, 19.71, 13.43].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    dashTitle(ws, `QA Dashboard(updated: ${fmtDate(new Date().toLocaleDateString('en-CA'))})`, 9, 'FFFFC000');
    dashRow(ws, 3, ['Unit', 'Latest Install Shield', 'Latest CaptureSW', 'Latest Firmware(Main)', 'Rotator', 'Sensor', 'Collimator', 'LCD', 'Jaw'],
      { fill: BLUE, font: { bold: true } });
    for (let c = 4; c <= 9; c++) Object.assign(ws.getCell(3, c), { fill: solid('FFFF0000'), font: { ...DASH_FONT, bold: c === 4, color: { argb: 'FF000000' } } });
    let r = 3;
    // Every other section is its own small table after a blank row: a large bold title, then bold column headers.
    const section = (title, cols) => {
      r += 2;
      dashRow(ws, r, [title], { cols, fill: BLUE, font: { bold: true, size: 14 }, align: { vertical: 'middle' }, merges: cols > 1 ? [[1, cols]] : [] });
      ws.getRow(r).height = 22;
    };
    const header = (values) => dashRow(ws, ++r, values, { fill: 'FFDDEBF7', font: { bold: true } });

    for (const u of real.filter(u => componentsFor(u.category).some(c => c.key === 'main_fw'))) {
      const revs = Math.max(1, ...u.slots.filter(s => HW_COLUMNS.includes(s.component)).map(s => s.slot));
      for (let slot = 1; slot <= revs; slot++)
        dashRow(ws, ++r, [slot > 1 ? `${u.name} (Rev ${slot})` : u.name, ...HW_COLUMNS.map(k => latest(u, k, slot))], { cols: 9 });
    }

    const software = real.filter(u => u.category === 'software');
    if (software.length) {
      section('Software', 2);
      header(['Software', 'Latest Software']);
      software.forEach(u => dashRow(ws, ++r, [u.name, latest(u, 'software')], { cols: 2 }));
    }

    const utilities = units.filter(u => u.virtual && u.slots.some(s => s.history.length));
    if (utilities.length) {
      section('Utility', 2);
      for (const u of utilities) {
        header([u.name, 'Version']);
        u.slots.filter(s => s.history.length).forEach(s => dashRow(ws, ++r, [s.label, s.history[0].version], { cols: 2 }));
      }
    }

    const drivers = real.filter(u => u.category === 'driver');
    if (drivers.length) {
      section('Others', 3);
      header(['Grabber', 'Driver', 'Firmware']);
      drivers.forEach(u => dashRow(ws, ++r, [u.name, latest(u, 'driver_ver'), latest(u, 'driver_fw')], { cols: 3 }));
    }

    // PCs are recorded as "<PC/RAM/GPU model> · <memory> GPU · FOV <sizes>".
    const pcs = real.filter(u => latest(u, 'pc'));
    if (pcs.length) {
      section('PC/GPU Pairing', 4);
      header(['3D Model', 'FOV', 'PC/RAM/GPU Model', 'GPU Memory']);
      pcs.forEach(u => {
        const [model, ...rest] = latest(u, 'pc').split(' · ');
        const fov = rest.find(p => p.startsWith('FOV '))?.slice(4);
        const gpu = rest.find(p => p.endsWith(' GPU'))?.slice(0, -4);
        dashRow(ws, ++r, [u.name, fov, model, gpu], { cols: 4 });
      });
    }

    // Phantom kits are recorded as "<type> · SAP <code>".
    const kits = real.filter(u => latest(u, 'phantom'));
    if (kits.length) {
      section('User Phantom Kit Pairing', 3);
      header(['3D Model', 'Type', 'SAP']);
      kits.forEach(u => dashRow(ws, ++r, [u.name, ...latest(u, 'phantom').split(' · SAP ')], { cols: 3 }));
    }
  }, showToast);
}

// The changelog feed as filtered on screen, one row per change.
// Excel: the QA Dashboard's change log block (Date | Subject | Detail), oldest first like the dashboard.
export function downloadChangeFeed(changes, format, showToast) {
  const kept = changes.filter(c => !LOG_SKIP.includes(c.component));
  if (format === 'csv') {
    const rows = kept.map(c => [
      dateCell(c.changed_on), c.unit.name, categoryLabel(c.unit.category), slotName(c), c.from || '', c.version, c.changed_by || ''
    ]);
    downloadTable({ file: 'versions_changelog', rows, columns: ['Date', 'Unit', 'Category', 'Component', 'From', 'To', 'Changed By'] }, format, showToast);
    return;
  }
  downloadDashboard('versions_changelog.xlsx', 'Change log', (ws) => {
    [11.43, 14, 14, 12, 12, 12, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    dashTitle(ws, 'Change log', 7, 'FFFFFF00');
    const center = { horizontal: 'center' };
    dashRow(ws, 3, ['Date', 'Subject', '', 'Detail'], { cols: 7, fill: BLUE, align: center, merges: [[2, 3], [4, 7]] });
    ws.getCell(3, 1).alignment = {};
    // A Utility item's change is about the unit it lists: "Pax-i · EzAlign 1.1.0.4 to 1.1.0.5".
    [...kept].reverse().forEach((c, i) => {
      const r = 4 + i;
      const subject = c.unit.virtual ? c.label : c.unit.name;
      const what    = c.unit.virtual ? c.unit.name : slotName(c);
      dashRow(ws, r, [dateCell(c.changed_on), subject, '', `${what} ${c.from} to ${c.version}`], { cols: 7, align: center, merges: [[2, 3], [4, 7]] });
      Object.assign(ws.getCell(r, 1), { numFmt: 'mm-dd-yy', alignment: {} });
    });
  }, showToast);
}

const STATUS_LABEL = { order: 'Order now', watch: 'Watch' };

// Parts at or below maintain, with how many to order to get back above it for another month.
export function downloadOrderList(parts, showToast) {
  const date = new Date().toISOString().slice(0, 10);
  const rows = parts.map(p => [
    p.sap_code, p.description, p.type || '', STATUS_LABEL[p.status] || p.status, p.stock, p.on_order, p.avg ?? '', p.basement, p.maintain, p.order_qty
  ]);
  downloadTable({
    file: `order_list_${date}`, sheet: 'Order List', rows,
    columns: ['SAP Code', 'Description', 'Type', 'Status', 'In Stock', 'On Order', 'Use / Month', 'Basement', 'Maintain', 'Order Qty']
  }, 'xlsx', showToast);
}

// Shown in the Usage by User grid where a user took none of a part, so it can't be mistaken for a logged 0.
const NOT_TAKEN = 'Not Taken';

export async function downloadTrends({ from, to, stockRows, format, showToast }) {
  const fname = `usage_${from}_to_${to}`;
  try {
    const fromISO = new Date(from).toISOString();
    const toISO   = new Date(to + 'T23:59:59').toISOString();
    const data    = await api.trendsRaw(fromISO, toISO);
    if (!data.length) { showToast('No data in this range', 'error'); return; }

    // Users become columns; each row is one item code.
    const users = [...new Set(data.map(r => r.used_by || ''))].sort();
    const pivot = new Map();
    data.forEach(r => {
      if (!pivot.has(r.sap_code)) pivot.set(r.sap_code, { sap_code: r.sap_code, description: r.description, byUser: {} });
      const entry = pivot.get(r.sap_code);
      const user  = r.used_by || '';
      entry.byUser[user] = (entry.byUser[user] || 0) + r.quantity;
    });
    const pivotRows = [...pivot.values()].sort((a, b) => a.sap_code.localeCompare(b.sap_code));

    const stockMap  = new Map((stockRows || []).map(r => [r.sap_code, r.current_stock]));
    const stockFor  = (code) => stockMap.has(code) ? (stockMap.get(code) ?? '—') : '—';
    const byItemRows = pivotRows
      .map(r => ({ ...r, total: Object.values(r.byUser).reduce((s, v) => s + v, 0) }))
      .sort((a, b) => b.total - a.total);

    if (format === 'csv') {
      const lines = [];
      lines.push('TOTAL PARTS USED PER ITEM CODE PER USER');
      lines.push(['SAP Code', 'Description', ...users].join(','));
      pivotRows.forEach(r => lines.push([r.sap_code, csvCell(r.description), ...users.map(u => r.byUser[u] || NOT_TAKEN)].join(',')));
      lines.push('');
      lines.push('TOTAL USAGE & CURRENT STOCK BY ITEM CODE');
      lines.push(['SAP Code', 'Description', 'Total Qty Used', 'Current Stock'].join(','));
      byItemRows.forEach(r => lines.push([r.sap_code, csvCell(r.description), r.total, stockFor(r.sap_code)].join(',')));
      lines.push('');
      lines.push('TRANSACTION LOG');
      lines.push(['SAP Code', 'Description', 'Qty Used', 'Used By', 'Date', 'Hour'].join(','));
      data.forEach(r => {
        const { date, hour } = parseUsedAt(r.used_at);
        lines.push([r.sap_code, csvCell(r.description), r.quantity, r.used_by || '', date, hour].join(','));
      });
      triggerDownload(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${fname}.csv`, showToast);
      return;
    }

    // One sheet per table, named for what it answers.
    const blob = await buildWorkbook([
      {
        name: 'Usage by User',
        columns: ['SAP Code', 'Description', ...users],
        rows: pivotRows.map(r => [r.sap_code, r.description, ...users.map(u => r.byUser[u] || NOT_TAKEN)])
      },
      {
        name: 'Usage & Stock',
        columns: ['SAP Code', 'Description', 'Total Qty Used', 'Current Stock'],
        rows: byItemRows.map(r => [r.sap_code, r.description, r.total, stockFor(r.sap_code)])
      },
      {
        name: 'Transaction Log',
        columns: ['SAP Code', 'Description', 'Qty Used', 'Used By', 'Date', 'Hour'],
        rows: data.map(r => {
          const { date, hour } = parseUsedAt(r.used_at);
          return [r.sap_code, r.description, r.quantity, r.used_by || '', date, hour];
        })
      }
    ]);
    triggerDownload(blob, `${fname}.xlsx`, showToast);
  } catch {
    showToast('Failed to download', 'error');
  }
}
