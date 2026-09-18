import { api } from '../api/client.js';
import { parseUsedAt } from './format.js';

// NOTE: these still emit an HTML table labelled .xls, carried over from v1.
// Phase 4 replaces this with ExcelJS and real multi-sheet workbooks.

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
      pivotRows.forEach(r => lines.push([r.sap_code, csvCell(r.description), ...users.map(u => r.byUser[u] || 0)].join(',')));
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

    const cols = Math.max(2 + users.length, 6);
    const th = (s) => `<th style="background:#1a1f2e;color:#00d4ff;font-family:monospace;padding:6px 10px;text-align:left;white-space:nowrap">${s}</th>`;
    const td = (s, right) => `<td style="padding:5px 10px;font-family:monospace;font-size:12px;white-space:nowrap${right ? ';text-align:right' : ''}">${s}</td>`;
    const header = (title) => `<tr><td colspan="${cols}" style="background:#0f1117;color:#ff6b35;font-family:monospace;font-size:13px;font-weight:bold;padding:10px 10px 4px">${title}</td></tr>`;
    const spacer = `<tr><td colspan="${cols}" style="padding:8px"></td></tr>`;

    const html = `${XLS_HEAD}<table>
      ${header('Total Parts Used per Item Code per User')}
      <tr>${th('SAP Code')}${th('Description')}${users.map(u => th(u)).join('')}</tr>
      ${pivotRows.map(r => `<tr>${td(r.sap_code)}${td(r.description)}${users.map(u => td(r.byUser[u] || 0, true)).join('')}</tr>`).join('')}
      ${spacer}
      ${header('Total Usage &amp; Current Stock by Item Code')}
      <tr>${th('SAP Code')}${th('Description')}${th('Total Qty Used')}${th('Current Stock')}</tr>
      ${byItemRows.map(r => `<tr>${td(r.sap_code)}${td(r.description)}${td(r.total, true)}${td(stockFor(r.sap_code), true)}</tr>`).join('')}
      ${spacer}
      ${header('Transaction Log')}
      <tr>${th('SAP Code')}${th('Description')}${th('Qty Used')}${th('Used By')}${th('Date')}${th('Hour')}</tr>
      ${data.map(r => {
        const { date, hour } = parseUsedAt(r.used_at);
        return `<tr>${td(r.sap_code)}${td(r.description)}${td(r.quantity, true)}${td(r.used_by || '')}${td(date)}${td(hour)}</tr>`;
      }).join('')}
    </table></body></html>`;

    triggerDownload(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${fname}.xls`, showToast);
  } catch {
    showToast('Failed to download', 'error');
  }
}
