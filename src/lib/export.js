import { api } from '../api/client.js';
import { parseUsedAt } from './format.js';
import { sortSlots, slotName, entryDate, CATEGORIES } from './firmware.js';

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
// except numbers (usage quantities), which stay numeric so they can be summed.
async function buildWorkbook(sheets) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  for (const { name, columns, rows } of sheets) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(columns).font = { bold: true };
    rows.forEach(r => ws.addRow(r.map(v => typeof v === 'number' ? v : String(v))));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = Math.min(60, rows.reduce((w, r) => Math.max(w, String(r[i]).length + 2), c.length + 4));
    });
  }
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// The month-end stock report for the parts management team, laid out like their sheet:
// three blank rows, then SAP Code / Descriptions / date header, every part sorted by code,
// Calibri 11 with thin borders. Description cells have no right edge; the quantity cell supplies it.
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
    ws.getColumn(1).width = 10.140625;
    ws.getColumn(2).width = 92.85546875;

    const font = { name: 'Calibri', size: 11, family: 2, scheme: 'minor', color: { theme: 1 } };
    const thin = { style: 'thin', color: { indexed: 64 } };
    const box  = { left: thin, right: thin, top: thin, bottom: thin };
    const desc = { left: thin, top: thin, bottom: thin };
    const addRow = (values, r) => {
      const row = ws.getRow(r);
      row.values = values;
      [box, desc, box].forEach((border, i) => Object.assign(row.getCell(i + 1), { font, border }));
    };

    addRow(['SAP Code', 'Descriptions', `${now.getMonth() + 1}.${now.getDate()}.${now.getFullYear()}`], 4);
    [...items]
      .sort((a, b) => a.sap_code < b.sap_code ? -1 : a.sap_code > b.sap_code ? 1 : 0)
      .forEach((item, i) => addRow([item.sap_code, item.description, Number(item.quantity)], 5 + i));

    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    triggerDownload(blob, `${month} ${now.getFullYear()} Inventory.xlsx`, showToast);
  } catch {
    showToast('Failed to download', 'error');
  }
}

// One table as CSV or as a single-sheet workbook.
async function downloadTable({ file, sheet, columns, rows }, format, showToast) {
  if (format === 'csv') {
    const csv = [columns, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
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

// Every version of the listed units: the current one, then earlier ones.
export function downloadFirmwareLog(units, format, showToast) {
  const rows = units.flatMap(u => sortSlots(u.slots).flatMap(s => s.history.map((h, i) => [
    u.name, categoryLabel(u.category), slotName(s), h.version, entryDate(s.history, i), i === 0 ? 'Current' : 'Previous', h.changed_by || ''
  ])));
  downloadTable({
    file: 'versions_history', sheet: 'Versions', rows,
    columns: ['Unit', 'Category', 'Component', 'Version', 'Date', 'Status', 'Changed By']
  }, format, showToast);
}

// The changelog feed exactly as filtered on screen, one row per change.
export function downloadChangeFeed(changes, format, showToast) {
  const rows = changes.map(c => [
    c.when, c.unit.name, categoryLabel(c.unit.category), slotName(c), c.from || '', c.version, c.changed_by || ''
  ]);
  downloadTable({
    file: 'versions_changelog', sheet: 'Changelog', rows,
    columns: ['Date', 'Unit', 'Category', 'Component', 'From', 'To', 'Changed By']
  }, format, showToast);
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
