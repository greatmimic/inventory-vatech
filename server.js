const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Supabase client ───────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zuoqqbwzvessxepukqrb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_gsEe31Aqu23tnpO9ysCLxA_Y_tKLBWJ';

async function db(method, endpoint, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw { status: res.status, error: data };
  return data;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GET all items (optionally filter by ?q=searchterm) ────────────────────────
app.get('/api/items', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let endpoint = 'inventory?select=sap_code,description,quantity&order=sap_code.asc';
    if (q) {
      endpoint = `inventory?select=sap_code,description,quantity&or=(sap_code.ilike.*${encodeURIComponent(q)}*,description.ilike.*${encodeURIComponent(q)}*)&order=sap_code.asc`;
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
    const data = await db('GET', `inventory?sap_code=eq.${encodeURIComponent(req.params.code)}&select=sap_code,description,quantity`);
    if (!data || data.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(data[0]);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST deduct ───────────────────────────────────────────────────────────────
app.post('/api/items/:code/deduct', async (req, res) => {
  const qty = parseInt(req.body.quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
  try {
    const rows = await db('GET', `inventory?sap_code=eq.${encodeURIComponent(req.params.code)}&select=sap_code,description,quantity`);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const item = rows[0];
    if (item.quantity < qty) return res.status(400).json({ error: 'Insufficient stock', current: item.quantity });
    const updated = await db('PATCH', `inventory?sap_code=eq.${encodeURIComponent(req.params.code)}`, { quantity: item.quantity - qty });
    res.json({ success: true, item: updated[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST add stock ────────────────────────────────────────────────────────────
app.post('/api/items/:code/add', async (req, res) => {
  const qty = parseInt(req.body.quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
  try {
    const rows = await db('GET', `inventory?sap_code=eq.${encodeURIComponent(req.params.code)}&select=sap_code,description,quantity`);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const item = rows[0];
    const updated = await db('PATCH', `inventory?sap_code=eq.${encodeURIComponent(req.params.code)}`, { quantity: item.quantity + qty });
    res.json({ success: true, item: updated[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST new item ─────────────────────────────────────────────────────────────
app.post('/api/items', async (req, res) => {
  const { sap_code, description, quantity } = req.body;
  if (!sap_code || !description) return res.status(400).json({ error: 'sap_code and description required' });
  try {
    const created = await db('POST', 'inventory', {
      sap_code:    sap_code.trim().toUpperCase(),
      description: description.trim(),
      quantity:    parseInt(quantity) || 0
    });
    res.json({ success: true, item: created[0] });
  } catch (e) {
    if (e?.error?.code === '23505') return res.status(400).json({ error: 'SAP code already exists' });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Inventory server running on http://localhost:${PORT}`);
  console.log(`🗄️  Connected to Supabase: ${SUPABASE_URL}`);
});
