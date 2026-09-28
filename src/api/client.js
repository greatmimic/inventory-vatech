const API = '';

async function request(path, options) {
  const res  = await fetch(`${API}${path}`, options);
  // Session missing or expired: back to sign-in rather than a 'Connection error' toast.
  if (res.status === 401 && path !== '/api/login') window.location.assign('/login.html');
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
  me:     () => request('/api/me'),

  items:     (q) => request(`/api/items${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(r => r.map(toInt)),
  addStock:  (code, quantity) => request(`/api/items/${code}/add`, json({ quantity })),
  deduct:    (code, quantity, source) => request(`/api/items/${code}/deduct`, json({ quantity, ...(source ? { source } : {}) })),
  newItem:   (item) => request('/api/items', json(item)),
  removeItem: (code) => request(`/api/items/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  locations: () => request('/api/locations'),
  partLocations:  (code) => request(`/api/items/${encodeURIComponent(code)}/locations`),
  addLocation:    (code, location, note) => request(`/api/items/${encodeURIComponent(code)}/locations`, json({ location, note })),
  setLocationNote: (code, location, note) => request(`/api/items/${encodeURIComponent(code)}/locations/${encodeURIComponent(location)}`,
    { ...json({ note }), method: 'PATCH' }),
  removeLocation: (code, location) => request(`/api/items/${encodeURIComponent(code)}/locations/${encodeURIComponent(location)}`, { method: 'DELETE' }),

  trends:     (fromISO, toISO) => request(`/api/trends?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`),
  trendsRaw:  (fromISO, toISO) => request(`/api/trends/raw?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`),
  deleteTrend: (code) => request(`/api/trends/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  usageEntries: (code, fromISO, toISO) =>
    request(`/api/trends/${encodeURIComponent(code)}/entries?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`),
  correctUsage: (id, quantity, used_at) => request(`/api/usage/${id}`, { ...json({ quantity, used_at }), method: 'PATCH' }),
  deleteUsage:  (id) => request(`/api/usage/${id}`, { method: 'DELETE' }),

  reorder:     () => request('/api/reorder'),
  setLevels:   (code, basement, maintain) => request(`/api/reorder/${encodeURIComponent(code)}`,
    { ...json({ basement, maintain }), method: 'PUT' }),
  markOrdered: (code, quantity) => request(`/api/reorder/${encodeURIComponent(code)}/orders`, json({ quantity })),
  markOrderedMany: (orders) => request('/api/reorder/orders', json({ orders })),
  cancelOrder: (id) => request(`/api/reorder/orders/${id}`, { method: 'DELETE' }),

  firmware:    () => request('/api/firmware'),
  addFirmware: (entry) => request('/api/firmware', json(entry))
};
