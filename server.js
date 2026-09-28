import express from 'express';
import path from 'path';
import session from 'express-session';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = process.env.PORT || 3001;

const SUPABASE_URL    = process.env.SUPABASE_URL    || 'https://zuoqqbwzvessxepukqrb.supabase.co';
const SUPABASE_KEY    = process.env.SUPABASE_KEY    || 'sb_publishable_gsEe31Aqu23tnpO9ysCLxA_Y_tKLBWJ';
const SESSION_SECRET  = process.env.SESSION_SECRET  || 'vatech-inventory-dev-secret';

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

// PostgREST returns at most 1,000 rows per request, so read page by page until a short page.
// The endpoint must have a stable order (e.g. a unique tiebreaker) or rows can repeat or go missing.
const PAGE = 1000;
async function dbAll(endpoint) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await db('GET', `${endpoint}&limit=${PAGE}&offset=${offset}`);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

// Per-part usage totals from the usage_totals() database function, busiest first.
const usageTotals = (fromISO, toISO) => dbAll('rpc/usage_totals?order=total_used.desc,sap_code.asc' +
  (fromISO ? `&from_ts=${encodeURIComponent(fromISO)}` : '') + (toISO ? `&to_ts=${encodeURIComponent(toISO)}` : ''));

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

const OPEN_PATHS = ['/login', '/login.html', '/api/login'];
app.use((req, res, next) => {
  if (OPEN_PATHS.includes(req.path)) return next();
  if (req.session?.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect('/login.html');
});

// Admin panel actions. Roles live in the profiles table and are read at sign-in,
// so a role change takes effect at the user's next sign-in.
const requireAdmin = (req, res, next) =>
  req.session.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });

app.use(express.static(path.join(__dirname, 'dist')));

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!r.ok) return res.status(401).json({ error: 'Invalid email or password' });
    const data = await r.json();
    // First sign-in creates the profile as a regular user; admins are set in the profiles table.
    let [profile] = await db('GET', `profiles?id=eq.${data.user.id}&select=role`);
    if (!profile) [profile] = await db('POST', 'profiles', { id: data.user.id, email: data.user.email });
    req.session.user = { email: data.user.email, id: data.user.id, role: profile.role };
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Reaching this means the session gate above let the request through.
app.get('/api/me', (req, res) => res.json(req.session.user));

// ── GET all items ─────────────────────────────────────────────────────────────
// Each item carries its shelf locations (part_locations) as a plain list of codes.
const ITEM_FIELDS = 'sap_code,description,quantity,type,part_locations(location)';
const withLocations = (rows) => rows.map(({ part_locations, ...i }) => ({ ...i, locations: part_locations.map(l => l.location) }));

app.get('/api/items', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let endpoint;
    if (!q) {
      endpoint = `inventory?select=${ITEM_FIELDS}&order=sap_code.asc`;
    } else if (/\d/.test(q)) {
      // Contains digit → SAP code search only
      endpoint = `inventory?select=${ITEM_FIELDS}&sap_code=ilike.*${encodeURIComponent(q)}*&order=sap_code.asc`;
    } else {
      // Pure letters → description search only
      endpoint = `inventory?select=${ITEM_FIELDS}&description=ilike.*${encodeURIComponent(q)}*&order=sap_code.asc`;
    }
    const data = await db('GET', endpoint);
    // A query that is exactly a location code ("2B", "WH") also lists everything stored there, first.
    let atLoc = [];
    if (/^[\w ]{1,10}$/.test(q)) {
      const locRows = await db('GET', `part_locations?select=sap_code&location=ilike.${encodeURIComponent(q)}`);
      if (locRows.length) atLoc = await db('GET',
        `inventory?select=${ITEM_FIELDS}&sap_code=in.(${locRows.map(r => `"${r.sap_code}"`).join(',')})&order=sap_code.asc`);
    }
    const seen = new Set(atLoc.map(i => i.sap_code));
    res.json(withLocations([...atLoc, ...data.filter(i => !seen.has(i.sap_code))]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET part locations (map page): one row per part per location ─────────────
app.get('/api/locations', async (req, res) => {
  try {
    const rows = await db('GET', 'part_locations?select=location,sap_code,note,inventory(description,quantity)&order=sap_code.asc');
    res.json(rows.map(({ inventory, ...r }) => ({ ...r, description: inventory.description, quantity: parseInt(inventory.quantity) || 0 })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Part location editing (admin) — every change goes to part_location_log ───
// Accepted codes: bay 1-16 + level A-D ("5D"), "WH", "IO Bin". Returns the canonical spelling or null.
function normalizeLocation(input) {
  const s = String(input || '').trim().replace(/\s+/g, ' ');
  const m = /^(\d{1,2}) ?([a-d])$/i.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 16) return `${+m[1]}${m[2].toUpperCase()}`;
  if (/^wh$/i.test(s)) return 'WH';
  if (/^io ?bin$/i.test(s)) return 'IO Bin';
  return null;
}
const BAD_LOCATION = 'Location must be a bay and level (1A to 16D), WH or IO Bin';
const cleanNote = (note) => String(note || '').trim() || null;
const logLocation = (req, sap_code, location, action, note) => db('POST', 'part_location_log',
  { sap_code, location, action, note, changed_by: req.session.user?.email || null });
const locPath = (code, loc) => `part_locations?sap_code=eq.${encodeURIComponent(code)}&location=eq.${encodeURIComponent(loc)}`;

app.get('/api/items/:code/locations', requireAdmin, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    res.json(await db('GET', `part_locations?select=location,note&sap_code=eq.${encodeURIComponent(code)}`));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/items/:code/locations', requireAdmin, async (req, res) => {
  const code = req.params.code.toUpperCase();
  const location = normalizeLocation(req.body.location);
  if (!location) return res.status(400).json({ error: BAD_LOCATION });
  const note = cleanNote(req.body.note);
  try {
    const created = await db('POST', 'part_locations', { sap_code: code, location, note });
    await logLocation(req, code, location, 'add', note);
    res.json({ location: created[0].location, note: created[0].note });
  } catch (e) {
    if (e.status === 409) return res.status(409).json({ error: e.error?.code === '23503' ? 'Item not found' : `${code} is already at ${location}` });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/items/:code/locations/:location', requireAdmin, async (req, res) => {
  const code = req.params.code.toUpperCase();
  const note = cleanNote(req.body.note);
  try {
    const updated = await db('PATCH', locPath(code, req.params.location), { note });
    if (!updated.length) return res.status(404).json({ error: 'Location not found' });
    await logLocation(req, code, updated[0].location, 'note', note);
    res.json({ location: updated[0].location, note: updated[0].note });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/items/:code/locations/:location', requireAdmin, async (req, res) => {
  const code = req.params.code.toUpperCase();
  try {
    const [row] = await db('GET', `${locPath(code, req.params.location)}&select=location,note`);
    if (!row) return res.status(404).json({ error: 'Location not found' });
    await db('DELETE', locPath(code, row.location));
    await logLocation(req, code, row.location, 'remove', row.note);
    res.json({ success: true });
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
  const source = req.session.user.role === 'admin' && req.body.source === 'admin' ? 'admin' : 'user';
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
      await db('POST', 'usage_log', { sap_code: item.sap_code, description: item.description, quantity: qty, used_by: req.session.user?.email || null });
    }
    res.json({ success: true, item: updated[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST add stock ────────────────────────────────────────────────────────────
app.post('/api/items/:code/add', requireAdmin, async (req, res) => {
  const qty  = parseInt(req.body.quantity);
  const code = req.params.code.toUpperCase();
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
  try {
    const rows = await db('GET', `inventory?sap_code=eq.${encodeURIComponent(code)}&select=sap_code,description,quantity`);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const item   = rows[0];
    const newQty = parseInt(item.quantity) + qty;
    const updated = await db('PATCH', `inventory?sap_code=eq.${encodeURIComponent(code)}`, { quantity: newQty });
    await receiveOrders(code, qty);
    res.json({ success: true, item: updated[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST new item ─────────────────────────────────────────────────────────────
app.post('/api/items', requireAdmin, async (req, res) => {
  const { sap_code, description, quantity, type } = req.body;
  if (!sap_code || !description) return res.status(400).json({ error: 'sap_code and description required' });
  const locations = [...new Set((req.body.locations || []).map(normalizeLocation))];
  if (locations.includes(null)) return res.status(400).json({ error: BAD_LOCATION });
  try {
    const created = await db('POST', 'inventory', {
      sap_code:    sap_code.trim().toUpperCase(),
      description: description.trim(),
      quantity:    parseInt(quantity) || 0,
      ...(type ? { type: type.trim().toUpperCase() } : {})
    });
    const code = created[0].sap_code;
    if (locations.length) {
      await db('POST', 'part_locations', locations.map(location => ({ sap_code: code, location })));
      for (const location of locations) await logLocation(req, code, location, 'add', null);
    }
    res.json({ success: true, item: created[0], locations });
  } catch (e) {
    if (e?.error?.code === '23505') return res.status(400).json({ error: 'SAP code already exists' });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── DELETE item (deprecated SAP code) ─────────────────────────────────────────
// Its shelf locations go with it (FK cascade) and are logged as removed; usage_log keeps its history.
app.delete('/api/items/:code', requireAdmin, async (req, res) => {
  const code = req.params.code.toUpperCase();
  const item = `inventory?sap_code=eq.${encodeURIComponent(code)}`;
  try {
    const [row] = await db('GET', `${item}&select=sap_code,part_locations(location,note)`);
    if (!row) return res.status(404).json({ error: 'Item not found' });
    await db('DELETE', item);
    // db() doesn't report DELETE failures, so confirm the row is really gone before logging.
    if ((await db('GET', `${item}&select=sap_code`)).length) throw new Error(`${code} was not deleted`);
    for (const l of row.part_locations) await logLocation(req, code, l.location, 'remove', l.note);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET usage trends ──────────────────────────────────────────────────────────
app.get('/api/trends', requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    res.json(await usageTotals(from, to));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET raw usage log rows (for trends Excel download) ───────────────────────
app.get('/api/trends/raw', requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    let endpoint = 'usage_log?select=sap_code,description,quantity,used_at,used_by&order=used_at.desc,id.desc';
    if (from) endpoint += `&used_at=gte.${encodeURIComponent(from)}`;
    if (to)   endpoint += `&used_at=lte.${encodeURIComponent(to)}`;
    res.json(await dbAll(endpoint));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET usage log (for Excel Power Query) ────────────────────────────────────
// Returns aggregated usage: one row per SAP code, with total used and current stock
// Optional filters: ?from=2026-01-01&to=2026-04-22
app.get('/api/usage', async (req, res) => {
  try {
    const { from, to } = req.query;
    res.json(await usageTotals(from && new Date(from).toISOString(), to && new Date(to + 'T23:59:59').toISOString()));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── DELETE usage log entries for a SAP code ───────────────────────────────────
app.delete('/api/trends/:code', requireAdmin, async (req, res) => {
  const code = req.params.code.toUpperCase();
  try {
    await db('DELETE', `usage_log?sap_code=eq.${encodeURIComponent(code)}`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Single usage entries: list, correct, delete ──────────────────────────────
// A correction changes stock by the difference and keeps what the entry was in usage_corrections.
const CORRECTION_COLS = 'usage_id,action,old_quantity,old_used_at,new_quantity,new_used_at,stock_change,corrected_by,corrected_at';

app.get('/api/trends/:code/entries', requireAdmin, async (req, res) => {
  const code = encodeURIComponent(req.params.code.toUpperCase());
  const { from, to } = req.query;
  const range = (col) => (from ? `&${col}=gte.${encodeURIComponent(from)}` : '') + (to ? `&${col}=lte.${encodeURIComponent(to)}` : '');
  try {
    const [entries, corrections] = await Promise.all([
      dbAll(`usage_log?sap_code=eq.${code}&select=id,quantity,used_at,used_by${range('used_at')}&order=used_at.desc,id.desc`),
      dbAll(`usage_corrections?sap_code=eq.${code}&select=${CORRECTION_COLS}&order=corrected_at.asc,id.asc`)
    ]);
    res.json({
      entries: entries.map(e => ({ ...e, corrections: corrections.filter(c => c.usage_id === e.id) })),
      // Deleted entries that were dated in the range, newest first.
      deleted: corrections.filter(c => c.action === 'delete' &&
        (!from || c.old_used_at >= new Date(from).toISOString()) && (!to || c.old_used_at <= new Date(to).toISOString())).reverse()
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Reads the entry and the part's stock. Stock is null when the part no longer exists.
async function usageEntry(id) {
  const [entry] = await db('GET', `usage_log?id=eq.${id}&select=id,sap_code,quantity,used_at`);
  if (!entry) return {};
  const [item] = await db('GET', `inventory?sap_code=eq.${encodeURIComponent(entry.sap_code)}&select=quantity`);
  return { entry, stock: item ? parseInt(item.quantity) : null };
}

async function applyCorrection(req, entry, stock, change, fields) {
  if (stock != null && change) {
    await db('PATCH', `inventory?sap_code=eq.${encodeURIComponent(entry.sap_code)}`, { quantity: stock + change });
  }
  await db('POST', 'usage_corrections', {
    usage_id: entry.id, sap_code: entry.sap_code,
    old_quantity: entry.quantity, old_used_at: entry.used_at,
    stock_change: stock != null ? change : 0,
    corrected_by: req.session.user?.email || null,
    ...fields
  });
}

app.patch('/api/usage/:id', requireAdmin, async (req, res) => {
  const id  = parseInt(req.params.id);
  const qty = parseInt(req.body.quantity);
  const at  = new Date(req.body.used_at);
  if (!id) return res.status(400).json({ error: 'Invalid entry' });
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
  if (isNaN(at) || at > new Date()) return res.status(400).json({ error: 'Invalid date' });
  try {
    const { entry, stock } = await usageEntry(id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    const used_at = at.toISOString();
    const change  = entry.quantity - qty;   // using less puts stock back
    if (qty === entry.quantity && used_at === new Date(entry.used_at).toISOString()) return res.status(400).json({ error: 'Nothing changed' });
    if (stock != null && stock + change < 0) return res.status(400).json({ error: 'Insufficient stock', current: stock });
    await db('PATCH', `usage_log?id=eq.${id}`, { quantity: qty, used_at });
    await applyCorrection(req, entry, stock, change, { action: 'edit', new_quantity: qty, new_used_at: used_at });
    res.json({ success: true, stock: stock != null ? stock + change : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/usage/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid entry' });
  try {
    const { entry, stock } = await usageEntry(id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    await db('DELETE', `usage_log?id=eq.${id}`);
    // db() doesn't report DELETE failures, so confirm the row is really gone before changing stock.
    if ((await db('GET', `usage_log?id=eq.${id}&select=id`)).length) throw new Error(`usage entry ${id} was not deleted`);
    await applyCorrection(req, entry, stock, entry.quantity, { action: 'delete' });
    res.json({ success: true, stock: stock != null ? stock + entry.quantity : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Reorder levels and orders (admin) ────────────────────────────────────────
// Suggested levels come from the last 12 complete months of use. Usage is logged from LOG_START on;
// earlier months come from the master sheet's month-end counts (stock_counts), where a month whose
// count went up had a delivery, so its use is unknown. A part gets suggestions once MIN_MONTHS are known.
const LOG_START  = '2026-06';
const WINDOW     = 12;
const LEAD       = 2;      // months from ordering to the parts arriving
const Z          = 1.65;   // safety factor: covers about 95% of months
const MIN_MONTHS = 6;
const SPIKE      = 2;      // last month's use above this many times the usual is flagged for a person to check
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthsBack = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return monthKey(d); };
const openOrders = (code) => `part_orders?select=id,sap_code,quantity,received,ordered_at,ordered_by&received_at=is.null` +
  (code ? `&sap_code=eq.${encodeURIComponent(code)}` : '') + '&order=ordered_at.asc,id.asc';

function reorderRow(item, levels, counts, logged, orders, months) {
  const stock = parseInt(item.quantity) || 0;
  const byMonth = months.map((m, i) => {
    if (m >= LOG_START) return logged.get(m) || 0;
    const before = counts.get(i ? months[i - 1] : monthsBack(WINDOW + 1)), after = counts.get(m);
    return before == null || after == null || after > before ? null : before - after;
  });
  const mean = (xs) => xs.length ? xs.reduce((s, u) => s + u, 0) / xs.length : null;
  const use = byMonth.filter(u => u != null);
  const avg = mean(use);
  // Spike: last month against the months before it. The formula can't tell a one-off from a real rise, so a person decides.
  const last_use = byMonth[byMonth.length - 1];
  const earlier = byMonth.slice(0, -1).filter(u => u != null);
  const usual = mean(earlier);
  const spike = last_use != null && earlier.length >= MIN_MONTHS - 1 && last_use > SPIKE * usual;
  const used = use.some(u => u > 0);
  let suggested_basement = null, suggested_maintain = null;
  if (use.length >= MIN_MONTHS && avg > 0) {
    const sd = Math.sqrt(use.reduce((s, u) => s + (u - avg) ** 2, 0) / (use.length - 1));
    suggested_basement = Math.ceil(avg * LEAD + Z * sd * Math.sqrt(LEAD));
    suggested_maintain = Math.ceil(suggested_basement + avg);
  }
  const on_order = orders.reduce((s, o) => s + o.quantity - o.received, 0);
  const position = stock + on_order;
  // Review: used with no levels set, or levels kept for a part nobody used.
  const status = !levels ? (used ? 'review' : 'unused') : !used ? (levels.maintain > 0 ? 'review' : 'unused')
    : position <= levels.basement ? 'order' : position <= levels.maintain ? 'watch' : 'ok';
  return {
    sap_code: item.sap_code, description: item.description, type: item.type, stock,
    avg: avg == null ? null : Math.round(avg * 10) / 10, months_known: use.length,
    spike, last_use, usual: usual == null ? null : Math.round(usual * 10) / 10,
    basement: levels?.basement ?? null, maintain: levels?.maintain ?? null, suggested_basement, suggested_maintain,
    on_order, orders, status,
    order_qty: status === 'order' || status === 'watch' ? Math.max(0, Math.ceil(levels.maintain + avg - position)) : 0
  };
}

app.get('/api/reorder', requireAdmin, async (req, res) => {
  try {
    const months = Array.from({ length: WINDOW }, (_, i) => monthsBack(WINDOW - i));   // oldest first
    const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0); from.setMonth(from.getMonth() - WINDOW);
    const [items, levels, counts, logged, orders] = await Promise.all([
      dbAll('inventory?select=sap_code,description,quantity,type&order=sap_code.asc'),
      dbAll('reorder_levels?select=sap_code,basement,maintain&order=sap_code.asc'),
      dbAll(`stock_counts?select=sap_code,month,quantity&month=gte.${monthsBack(WINDOW + 1)}-01&order=sap_code.asc,month.asc`),
      dbAll(`rpc/usage_by_month?from_ts=${encodeURIComponent(from.toISOString())}&tz=${encodeURIComponent(TZ)}&order=sap_code.asc,month.asc`),
      dbAll(openOrders())
    ]);
    const byPart = (rows, key, value) => {
      const map = new Map();
      for (const r of rows) {
        if (!map.has(r.sap_code)) map.set(r.sap_code, new Map());
        map.get(r.sap_code).set(key(r), value(r));
      }
      return map;
    };
    const levelMap = new Map(levels.map(l => [l.sap_code, l]));
    const countMap = byPart(counts, r => r.month.slice(0, 7), r => r.quantity);
    const logMap   = byPart(logged, r => r.month.slice(0, 7), r => r.used);
    const orderMap = new Map();
    for (const o of orders) {
      if (!orderMap.has(o.sap_code)) orderMap.set(o.sap_code, []);
      orderMap.get(o.sap_code).push(o);
    }
    res.json({
      from: months[0], to: months[WINDOW - 1], lead: LEAD,
      parts: items.map(i => reorderRow(i, levelMap.get(i.sap_code), countMap.get(i.sap_code) || new Map(),
        logMap.get(i.sap_code) || new Map(), orderMap.get(i.sap_code) || [], months))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Set a part's levels; both blank clears them.
app.put('/api/reorder/:code', requireAdmin, async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { basement, maintain } = req.body;
  const path = `reorder_levels?sap_code=eq.${encodeURIComponent(code)}`;
  try {
    if (basement == null && maintain == null) {
      await db('DELETE', path);
      return res.json({ basement: null, maintain: null });
    }
    if (![basement, maintain].every(n => Number.isInteger(n) && n >= 0)) return res.status(400).json({ error: 'Levels must be whole numbers, 0 or more' });
    if (basement > maintain) return res.status(400).json({ error: 'Basement can’t be above maintain' });
    const row = { basement, maintain, updated_at: new Date().toISOString(), updated_by: req.session.user?.email || null };
    let [saved] = await db('PATCH', path, row);
    if (!saved) [saved] = await db('POST', 'reorder_levels', { sap_code: code, ...row });
    res.json({ basement: saved.basement, maintain: saved.maintain });
  } catch (e) {
    if (e.error?.code === '23503') return res.status(404).json({ error: 'Item not found' });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Mark a quantity as ordered from the supplier. Add Stock fills it when the parts arrive.
app.post('/api/reorder/:code/orders', requireAdmin, async (req, res) => {
  const code = req.params.code.toUpperCase();
  const quantity = parseInt(req.body.quantity);
  if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Invalid quantity' });
  try {
    await db('POST', 'part_orders', { sap_code: code, quantity, ordered_by: req.session.user?.email || null });
    res.json(await db('GET', openOrders(code)));
  } catch (e) {
    if (e.error?.code === '23503') return res.status(404).json({ error: 'Item not found' });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Mark several parts as ordered at once. One insert, so either every part is marked or none is.
app.post('/api/reorder/orders', requireAdmin, async (req, res) => {
  const list = Array.isArray(req.body.orders) ? req.body.orders : [];
  const rows = list.map(o => ({
    sap_code: String(o?.sap_code || '').toUpperCase(),
    quantity: parseInt(o?.quantity),
    ordered_by: req.session.user?.email || null
  }));
  if (!rows.length || rows.some(r => !r.sap_code || !(r.quantity > 0))) return res.status(400).json({ error: 'Invalid orders' });
  if (new Set(rows.map(r => r.sap_code)).size !== rows.length) return res.status(400).json({ error: 'A part is listed twice' });
  try {
    await db('POST', 'part_orders', rows);
    res.json({ success: true, count: rows.length });
  } catch (e) {
    if (e.error?.code === '23503') return res.status(404).json({ error: 'A part was not found — nothing was marked' });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Cancel an order marked by mistake.
app.delete('/api/reorder/orders/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid order' });
  try {
    await db('DELETE', `part_orders?id=eq.${id}`);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Stock added for a part fills its open orders, oldest first.
async function receiveOrders(code, qty) {
  for (const o of await db('GET', openOrders(code))) {
    if (qty <= 0) break;
    const received = Math.min(o.quantity, o.received + qty);
    qty -= received - o.received;
    await db('PATCH', `part_orders?id=eq.${o.id}`,
      { received, ...(received === o.quantity ? { received_at: new Date().toISOString() } : {}) });
  }
}

// ── GET firmware: units with each component's full version history ───────────
// History is newest first by insertion order, so the first entry is the current version.
const FW_COMPONENTS = ['install_shield', 'capture_sw', 'main_fw', 'rotator', 'sensor', 'collimator', 'lcd', 'jaw', 'ezalign', 'ezeval', 'software', 'user_manual', 'service_manual', 'driver_ver', 'driver_fw', 'pc', 'phantom'];
app.get('/api/firmware', async (req, res) => {
  try {
    const [units, versions] = await Promise.all([
      db('GET', 'fw_units?select=id,name,category&order=sort.asc'),
      db('GET', 'fw_versions?select=id,unit_id,component,slot,version,changed_on,changed_by&order=id.desc')
    ]);
    const byUnit = Object.fromEntries(units.map(u => [u.id, { ...u, slots: {} }]));
    for (const v of versions) {
      const slots = byUnit[v.unit_id]?.slots;
      if (!slots) continue;
      const key = `${v.component}:${v.slot}`;
      (slots[key] ??= { component: v.component, slot: v.slot, history: [] }).history.push(
        { id: v.id, version: v.version, changed_on: v.changed_on, changed_by: v.changed_by });
    }
    res.json(units.map(u => ({ ...byUnit[u.id], slots: Object.values(byUnit[u.id].slots) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST new firmware version (admin) ─────────────────────────────────────────
app.post('/api/firmware', requireAdmin, async (req, res) => {
  const { unit_id, component, version, changed_on } = req.body;
  const slot = parseInt(req.body.slot) || 1;
  if (!parseInt(unit_id) || !FW_COMPONENTS.includes(component) || !version?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(changed_on || ''))
    return res.status(400).json({ error: 'unit, component, version and date required' });
  try {
    const created = await db('POST', 'fw_versions', {
      unit_id: parseInt(unit_id), component, slot, version: version.trim(), changed_on,
      changed_by: req.session.user?.email || null
    });
    res.json({ success: true, version: created[0] });
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
