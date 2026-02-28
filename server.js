const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { stringify } = require('csv-stringify/sync');

const app = express();
const PORT = process.env.PORT || 3001;
const CSV_PATH = path.join(__dirname, 'data', 'inventory.csv');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory store ──────────────────────────────────────────────────────────
let inventory = [];   // [{ sap_code, description, quantity }]
let writeLock = false;

function loadCSV() {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', row => rows.push({
        sap_code:    row.sap_code.trim(),
        description: row.description.trim(),
        quantity:    parseInt(row.quantity) || 0
      }))
      .on('end', () => { inventory = rows; resolve(); })
      .on('error', reject);
  });
}

async function saveCSV() {
  while (writeLock) await new Promise(r => setTimeout(r, 20));
  writeLock = true;
  try {
    const header = [['sap_code', 'description', 'quantity']];
    const rows   = inventory.map(i => [i.sap_code, i.description, i.quantity]);
    const output = stringify([...header, ...rows]);
    fs.writeFileSync(CSV_PATH, output, 'utf8');
  } finally {
    writeLock = false;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET all items (optionally filter by ?q=searchterm)
app.get('/api/items', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json(inventory);
  const results = inventory.filter(i =>
    i.sap_code.toLowerCase().includes(q) ||
    i.description.toLowerCase().includes(q)
  );
  res.json(results);
});

// GET single item by SAP code
app.get('/api/items/:code', (req, res) => {
  const item = inventory.find(i =>
    i.sap_code.toLowerCase() === req.params.code.toLowerCase()
  );
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

// POST deduct quantity
app.post('/api/items/:code/deduct', async (req, res) => {
  const { quantity } = req.body;
  const qty = parseInt(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });

  const item = inventory.find(i =>
    i.sap_code.toLowerCase() === req.params.code.toLowerCase()
  );
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.quantity < qty) return res.status(400).json({ error: 'Insufficient stock', current: item.quantity });

  item.quantity -= qty;
  await saveCSV();
  res.json({ success: true, item });
});

// POST add quantity (admin)
app.post('/api/items/:code/add', async (req, res) => {
  const { quantity } = req.body;
  const qty = parseInt(quantity);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });

  const item = inventory.find(i =>
    i.sap_code.toLowerCase() === req.params.code.toLowerCase()
  );
  if (!item) return res.status(404).json({ error: 'Item not found' });

  item.quantity += qty;
  await saveCSV();
  res.json({ success: true, item });
});

// POST add brand new item (admin)
app.post('/api/items', async (req, res) => {
  const { sap_code, description, quantity } = req.body;
  if (!sap_code || !description) return res.status(400).json({ error: 'sap_code and description required' });
  const exists = inventory.find(i => i.sap_code.toLowerCase() === sap_code.toLowerCase());
  if (exists) return res.status(400).json({ error: 'SAP code already exists' });

  const newItem = { sap_code: sap_code.trim(), description: description.trim(), quantity: parseInt(quantity) || 0 };
  inventory.push(newItem);
  await saveCSV();
  res.json({ success: true, item: newItem });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
loadCSV().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Inventory server running on http://localhost:${PORT}`);
    console.log(`📦 Loaded ${inventory.length} items from CSV`);
  });
}).catch(err => {
  console.error('Failed to load CSV:', err);
  process.exit(1);
});
