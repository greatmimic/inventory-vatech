const API = '';

async function request(path, options) {
  const res  = await fetch(`${API}${path}`, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Request failed'), { status: res.status, data });
  return data;
}

const json = (body) => ({
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify(body)
});

const toInt = (i) => ({ ...i, quantity: parseInt(i.quantity) || 0 });

export const api = {
  login:  (email, password) => request('/api/login', json({ email, password })),
  logout: () => request('/api/logout', { method: 'POST' }),

  items:     (q) => request(`/api/items${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(r => r.map(toInt)),
  addStock:  (code, quantity) => request(`/api/items/${code}/add`, json({ quantity })),
  deduct:    (code, quantity, source) => request(`/api/items/${code}/deduct`, json({ quantity, ...(source ? { source } : {}) })),
  newItem:   (item) => request('/api/items', json(item)),

  trends:     (fromISO, toISO) => request(`/api/trends?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`),
  trendsRaw:  (fromISO, toISO) => request(`/api/trends/raw?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`),
  deleteTrend: (code) => request(`/api/trends/${encodeURIComponent(code)}`, { method: 'DELETE' })
};
