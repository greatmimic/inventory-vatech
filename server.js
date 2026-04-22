const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zuoqqbwzvessxepukqrb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_gsEe31Aqu23tnpO9ysCLxA_Y_tKLBWJ';

async function db(method, endpoint, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      ...(method !== 'DELETE' ? { 'Prefer': 'return=representation' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (method === 'DELETE') return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw { status: res.status, error: data };
  return data;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GET all items ─────────────────────────────────────────────────────────────
app.get('/api/items', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let endpoint;
    if (!q) {
      endpoint = 'inventory?select=sap_code,description,quantity,type&order=sap_code.asc';
    } else if (/\d/.test(q)) {
      // Contains digit → SAP code search only
      endpoint = `inventory?select=sap_code,description,quantity,type&sap_code=ilike.*${encodeURIComponent(q)}*&order=sap_code.asc`;
    } else {
      // Pure letters → description search only
      endpoint = `inventory?select=sap_code,description,quantity,type&description=ilike.*${encodeURIComponent(q)}*&order=sap_code.asc`;
    }
    const data = await db('GET', endpoint);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET single item ───────────────────────────────────────────────────────────
app.get('/api/items/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const data = await db('GET', `inventory?sap_code=eq.${encodeURIComponent(code)}&select=sap_code,description,quantity`);
    if (!data || data.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(data[0]);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST deduct (user) — logs to usage_log ────────────────────────────────────
app.post('/api/items/:code/deduct', async (req, res) => {
  const qty    = parseInt(req.body.quantity);
  const code   = req.params.code.toUpperCase();
  const source = req.body.source || 'user'; // 'user' | 'admin'
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
  try {
    const rows = await db('GET', `inventory?sap_code=eq.${encodeURIComponent(code)}&select=sap_code,description,quantity`);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const item       = rows[0];
    const currentQty = parseInt(item.quantity);
    if (currentQty < qty) return res.status(400).json({ error: 'Insufficient stock', current: currentQty });
    const updated = await db('PATCH', `inventory?sap_code=eq.${encodeURIComponent(code)}`, { quantity: currentQty - qty });
    // Only log if deduction came from a regular user, not admin
    if (source === 'user') {
      await db('POST', 'usage_log', { sap_code: item.sap_code, description: item.description, quantity: qty });
    }
    res.json({ success: true, item: updated[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST add stock ────────────────────────────────────────────────────────────
app.post('/api/items/:code/add', async (req, res) => {
  const qty  = parseInt(req.body.quantity);
  const code = req.params.code.toUpperCase();
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
  try {
    const rows = await db('GET', `inventory?sap_code=eq.${encodeURIComponent(code)}&select=sap_code,description,quantity`);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const item   = rows[0];
    const newQty = parseInt(item.quantity) + qty;
    const updated = await db('PATCH', `inventory?sap_code=eq.${encodeURIComponent(code)}`, { quantity: newQty });
    res.json({ success: true, item: updated[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST new item ─────────────────────────────────────────────────────────────
app.post('/api/items', async (req, res) => {
  const { sap_code, description, quantity, type } = req.body;
  if (!sap_code || !description) return res.status(400).json({ error: 'sap_code and description required' });
  try {
    const created = await db('POST', 'inventory', {
      sap_code:    sap_code.trim().toUpperCase(),
      description: description.trim(),
      quantity:    parseInt(quantity) || 0,
      ...(type ? { type: type.trim().toUpperCase() } : {})
    });
    res.json({ success: true, item: created[0] });
  } catch (e) {
    if (e?.error?.code === '23505') return res.status(400).json({ error: 'SAP code already exists' });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET usage trends ──────────────────────────────────────────────────────────
app.get('/api/trends', async (req, res) => {
  try {
    const { from, to } = req.query;
    let endpoint = 'usage_log?select=sap_code,description,quantity,used_at&order=used_at.desc';
    if (from) endpoint += `&used_at=gte.${encodeURIComponent(from)}`;
    if (to)   endpoint += `&used_at=lte.${encodeURIComponent(to)}`;
    const logs = await db('GET', endpoint);
    const map  = {};
    for (const row of logs) {
      if (!map[row.sap_code]) map[row.sap_code] = { sap_code: row.sap_code, description: row.description, total_used: 0, times_used: 0, current_stock: null };
      map[row.sap_code].total_used += parseInt(row.quantity);
      map[row.sap_code].times_used += 1;
    }
    // Fetch current stock for all sap codes in results
    const codes = Object.keys(map);
    if (codes.length > 0) {
      const stockData = await db('GET', `inventory?select=sap_code,quantity&sap_code=in.(${codes.map(c => `"${c}"`).join(',')})`);
      for (const s of stockData) {
        if (map[s.sap_code]) map[s.sap_code].current_stock = parseInt(s.quantity);
      }
    }
    res.json(Object.values(map).sort((a, b) => b.total_used - a.total_used));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── DELETE usage log entries for a SAP code ───────────────────────────────────
app.delete('/api/trends/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  try {
    await db('DELETE', `usage_log?sap_code=eq.${encodeURIComponent(code)}`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Inventory server running on http://localhost:${PORT}`);
  console.log(`🗄️  Connected to Supabase: ${SUPABASE_URL}`);
});
