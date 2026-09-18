export function qtyClass(qty) {
  return qty === 0 ? 'empty' : qty <= 3 ? 'low' : 'ok';
}

// React style object, not a CSS string.
export function qtyStyle(qty) {
  if (qty === null || qty === undefined) return {};
  return { color: qty === 0 ? 'var(--danger)' : qty <= 3 ? 'var(--warn)' : 'var(--success)' };
}

const RE_SPECIAL = /[.*+?^${}()|[\]\\]/g;

export function splitHighlight(text, q) {
  if (!q) return [{ text, hit: false }];
  const escaped = q.replace(RE_SPECIAL, '\\$&');
  const parts   = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return parts.filter(Boolean).map(part => ({ text: part, hit: part.toLowerCase() === q.toLowerCase() }));
}

export function isoDate(d) {
  return d.toISOString().split('T')[0];
}

export function parseUsedAt(used_at) {
  const d = new Date(used_at);
  return {
    date: d.toLocaleDateString('en-CA'),
    hour: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  };
}
